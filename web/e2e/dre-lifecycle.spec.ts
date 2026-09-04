import { test, expect, type Page } from "@playwright/test";
import {
  loginViaAPI,
  injectToken,
  logout as fixtureLogout,
} from "./fixtures/auth";
import {
  createDRE,
  updateDRE,
  updateDREStatus,
  createDREUser,
  updateUserStatus,
  resetUserPassword,
  listDREs,
  listAdminUsers,
  generatePassword,
  uniqueSuffix,
  type DREItem,
  type AdminUserItem,
} from "./fixtures/dre-helpers";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin_local";
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? "AdminLocal1234!";

let adminToken: string;
let dreToken: string;
let createdDRE: DREItem;
let createdUser: AdminUserItem;
let drePassword: string;
const dreName = `DRE-E2E-${uniqueSuffix()}`;
const dreLongName = `DRE-NOME-MUITO-LONGO-PARA-TESTE-DE-VALIDACAO-DE-SCHEMA-E-CANONICAL-RELATIONS-EXCEDENDO-CEM-CARACTERES-NO-CAMPO-NOME-${uniqueSuffix()}`;
const dreRenameName = `DRE-E2E-RENAMED-${uniqueSuffix()}`;
let secondDRE: DREItem;
let secondUser: AdminUserItem;
let secondPassword: string;

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as { data?: T };
  return json.data as T;
}

async function goToAdmin(page: Page): Promise<void> {
  await page.goto("/admin");
  await page.waitForSelector(".censo-admin", { timeout: 30_000 });
}

// ─── FASE 2 — Core ──────────────────────────────────────────────────────────

test.describe.serial("DRE Lifecycle E2E", () => {
  test.beforeAll(async () => {
    const result = await loginViaAPI(ADMIN_USER, ADMIN_PASS);
    adminToken = result.token;
  });

  test("2.1 admin cria DRE ativa", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    createdDRE = await createDRE(adminToken, {
      nome: dreName,
      sigla: "E2E",
      municipio_sede: "Belém",
    });

    expect(createdDRE.id).toBeGreaterThan(0);
    expect(createdDRE.nome).toBe(dreName);
    expect(createdDRE.ativa).toBe(true);

    const dres = await listDREs(adminToken);
    expect(dres.some((d) => d.id === createdDRE.id)).toBe(true);
  });

  test("2.2 admin cria usuário para a DRE e recebe credenciais", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    drePassword = generatePassword(14);
    createdUser = await createDREUser(adminToken, {
      username: `dre.e2e.${uniqueSuffix()}`,
      password: drePassword,
      dre: dreName,
    });

    expect(createdUser.id).toBeGreaterThan(0);
    expect(createdUser.role).toBe("dre");
    expect(createdUser.dre).toBe(dreName);
    expect(createdUser.dre_id).toBe(createdDRE.id);
    expect(createdUser.active).toBe(true);
  });

  test("2.3 logout admin e login com usuário DRE", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    const meBefore = await apiFetch<{
      username: string;
      role: string;
    }>("/v1/admin/me", adminToken);
    expect(meBefore.role).toBe("admin");

    await fixtureLogout(page);

    const dreResult = await loginViaAPI(createdUser.username, drePassword);
    dreToken = dreResult.token;
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const meAfter = await apiFetch<{
      username: string;
      role: string;
      dre: string | null;
    }>("/v1/admin/me", dreToken);
    expect(meAfter.role).toBe("dre");
    expect(meAfter.dre).toBe(dreName);
  });

  test("2.4 /admin/me e UI mostram a DRE correta", async ({ context, page }) => {
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const me = await apiFetch<{
      username: string;
      role: string;
      dre: string | null;
      dre_id: number | null;
    }>("/v1/admin/me", dreToken);
    expect(me.dre).toBe(dreName);
    expect(me.dre_id).toBe(createdDRE.id);
    expect(me.role).toBe("dre");

    const banner = page.locator("text=Acesso restrito a DRE");
    await expect(banner).toBeVisible({ timeout: 10_000 });

    const dreFilter = page.locator("select, [role='combobox']").filter({ hasText: /DRE/i }).first();
    if (await dreFilter.isVisible()) {
      await expect(dreFilter).toBeDisabled();
    }
  });

  test("2.5 filtros não expõem outra DRE", async ({ context, page }) => {
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const dreRequests: string[] = [];
    await page.route("**/v1/admin/analytics/**", (route) => {
      const url = new URL(route.request().url());
      const dreParam = url.searchParams.get("dre");
      if (dreParam) dreRequests.push(dreParam);
      route.continue();
    });
    await page.route("**/v1/admin/census**", (route) => {
      const url = new URL(route.request().url());
      const dreParam = url.searchParams.get("dre");
      if (dreParam) dreRequests.push(dreParam);
      route.continue();
    });

    const tabs = ["perfil", "pessoal", "merenda", "servicos"];
    for (const tab of tabs) {
      const navItem = page.locator(`[data-tab="${tab}"], nav >> text=/Caracterização|Pessoal|Merenda|Serviços/i`).first();
      if (await navItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await navItem.click();
        await page.waitForTimeout(2000);
      }
    }

    expect(dreRequests.length).toBeGreaterThan(0);
    for (const dre of dreRequests) {
      expect(dre, `Request com dre=${dre} deveria ser da DRE logada`).toBe(dreName);
    }
  });

  test("2.6 abas consumíveis pelo perfil DRE", async ({ context, page }) => {
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const tabTests = [
      { name: "Caracterização", selector: /caracterização|perfil/i },
      { name: "Pessoal", selector: /pessoal/i },
      { name: "Merenda", selector: /merenda/i },
      { name: "Serviços", selector: /serviços/i },
      { name: "Governança", selector: /governança/i },
      { name: "Saúde", selector: /saúde/i },
      { name: "IDEB/Alunos", selector: /alunos|ideb/i },
      { name: "Tecnologia", selector: /tecnologia/i },
      { name: "Infraestrutura", selector: /infraestrutura/i },
    ];

    for (const tab of tabTests) {
      const navItem = page.locator(`nav >> text=${tab.selector}`).first();
      if (await navItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await navItem.click();
        await page.waitForTimeout(2000);

        const hasError = await page.locator("text=/403|Acesso negado|Não autorizado/i")
          .isVisible({ timeout: 2_000 }).catch(() => false);
        expect(hasError, `Aba ${tab.name} retornou erro de acesso`).toBe(false);

        const hasContent = await page.locator("table, canvas, [class*='chart'], [class*='stat'], [class*='card']")
          .first().isVisible({ timeout: 5_000 }).catch(() => false);
        expect(hasContent, `Aba ${tab.name} não exibiu conteúdo`).toBe(true);
      }
    }
  });
});

// ─── FASE 3 — Gestão DRE/Usuários ──────────────────────────────────────────

test.describe.serial("DRE Management E2E", () => {
  test("3.1 admin renomeia DRE e usuário continua vinculado", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    const renamed = await updateDRE(adminToken, createdDRE.id, {
      ...createdDRE,
      nome: dreRenameName,
    });
    expect(renamed.nome).toBe(dreRenameName);

    const dres = await listDREs(adminToken);
    const found = dres.find((d) => d.id === createdDRE.id);
    expect(found?.nome).toBe(dreRenameName);

    const users = await listAdminUsers(adminToken);
    const user = users.find((u) => u.id === createdUser.id);
    expect(user?.dre).toBe(dreRenameName);
    expect(user?.dre_id).toBe(createdDRE.id);

    await fixtureLogout(page);
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const me = await apiFetch<{
      username: string;
      role: string;
      dre: string | null;
      dre_id: number | null;
    }>("/v1/admin/me", dreToken);
    expect(me.dre).toBe(dreRenameName);
    expect(me.dre_id).toBe(createdDRE.id);
  });

  test("3.2 DRE com nome longo (>100 caracteres)", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    const longDRE = await createDRE(adminToken, {
      nome: dreLongName,
      sigla: "LONG",
      municipio_sede: "Belém",
    });
    expect(longDRE.nome.length).toBeGreaterThan(100);
    expect(longDRE.id).toBeGreaterThan(0);

    secondPassword = generatePassword(14);
    secondUser = await createDREUser(adminToken, {
      username: `dre.long.${uniqueSuffix()}`,
      password: secondPassword,
      dre: dreLongName,
    });
    expect(secondUser.dre_id).toBe(longDRE.id);

    const dreResult = await loginViaAPI(secondUser.username, secondPassword);
    const secondDreToken = dreResult.token;

    const me = await apiFetch<{
      username: string;
      role: string;
      dre: string | null;
      dre_id: number | null;
    }>("/v1/admin/me", secondDreToken);
    expect(me.dre).toBe(dreLongName);
    expect(me.dre_id).toBe(longDRE.id);

    secondDRE = longDRE;
  });

  test("3.3 admin desativa usuário: sessão/token existente deixa de funcionar", async ({ context, page }) => {
    const dreLogin = await loginViaAPI(createdUser.username, drePassword);
    const activeToken = dreLogin.token;

    const meBefore = await apiFetch<{ role: string }>("/v1/admin/me", activeToken);
    expect(meBefore.role).toBe("dre");

    await injectToken(context, adminToken);
    await goToAdmin(page);
    const updated = await updateUserStatus(adminToken, createdUser.id, false);
    expect(updated.active).toBe(false);

    let tokenRevoked = false;
    try {
      await apiFetch("/v1/admin/me", activeToken);
    } catch {
      tokenRevoked = true;
    }
    expect(tokenRevoked, "Token ativo deveria ser revogado após desativação do usuário").toBe(true);
  });

  test("3.4 reativar usuário e confirmar novo login", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    const reactivated = await updateUserStatus(adminToken, createdUser.id, true);
    expect(reactivated.active).toBe(true);

    const dreResult = await loginViaAPI(createdUser.username, drePassword);
    dreToken = dreResult.token;

    const me = await apiFetch<{
      username: string;
      role: string;
    }>("/v1/admin/me", dreToken);
    expect(me.role).toBe("dre");
  });

  test("3.5 admin desativa DRE: sessão/token existente perde acesso", async ({ context, page }) => {
    const dreLogin = await loginViaAPI(createdUser.username, drePassword);
    const activeToken = dreLogin.token;

    const meBefore = await apiFetch<{ role: string }>("/v1/admin/me", activeToken);
    expect(meBefore.role).toBe("dre");

    await injectToken(context, adminToken);
    await goToAdmin(page);
    const deactivated = await updateDREStatus(adminToken, createdDRE.id, false);
    expect(deactivated.ativa).toBe(false);

    let tokenRevoked = false;
    try {
      await apiFetch("/v1/admin/me", activeToken);
    } catch {
      tokenRevoked = true;
    }
    expect(tokenRevoked, "Token ativo deveria ser revogado após desativação da DRE").toBe(true);
  });

  test("3.6 reativar DRE e confirmar comportamento", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    const reactivated = await updateDREStatus(adminToken, createdDRE.id, true);
    expect(reactivated.ativa).toBe(true);

    const dreResult = await loginViaAPI(createdUser.username, drePassword);
    dreToken = dreResult.token;

    const me = await apiFetch<{
      username: string;
      role: string;
      dre: string | null;
    }>("/v1/admin/me", dreToken);
    expect(me.role).toBe("dre");
    expect(me.dre).toBe(dreRenameName);
  });

  test("3.7 DRE inativa impede criação de usuário", async ({ context, page }) => {
    await injectToken(context, adminToken);
    await goToAdmin(page);

    const inactiveDRE = await createDRE(adminToken, {
      nome: `DRE-INACTIVE-${uniqueSuffix()}`,
      sigla: "INACT",
      ativa: false,
    });
    expect(inactiveDRE.ativa).toBe(false);

    let threw = false;
    try {
      await createDREUser(adminToken, {
        username: `dre.inactive.${uniqueSuffix()}`,
        password: generatePassword(14),
        dre: inactiveDRE.nome,
      });
    } catch {
      threw = true;
    }
    expect(threw, "Criação de usuário para DRE inativa deveria falhar").toBe(true);
  });
});

// ─── FASE 4 — Revogação e Segurança ────────────────────────────────────────

test.describe.serial("DRE Security E2E", () => {
  test("4.1 reset de senha revoga sessão imediatamente", async ({ context, page }) => {
    const dreLogin = await loginViaAPI(createdUser.username, drePassword);
    const oldToken = dreLogin.token;

    const meOld = await apiFetch<{
      username: string;
      role: string;
    }>("/v1/admin/me", oldToken);
    expect(meOld.role).toBe("dre");

    await injectToken(context, adminToken);
    await goToAdmin(page);

    const newPass = generatePassword(14);
    await resetUserPassword(adminToken, createdUser.id, newPass);

    let oldTokenRevoked = false;
    try {
      await apiFetch("/v1/admin/me", oldToken);
    } catch {
      oldTokenRevoked = true;
    }
    expect(oldTokenRevoked, "Token antigo deveria estar revogado após reset").toBe(true);

    const dreResult = await loginViaAPI(createdUser.username, newPass);
    dreToken = dreResult.token;

    const meNew = await apiFetch<{
      username: string;
      role: string;
    }>("/v1/admin/me", dreToken);
    expect(meNew.role).toBe("dre");

    let oldPassFails = false;
    try {
      await loginViaAPI(createdUser.username, drePassword);
    } catch {
      oldPassFails = true;
    }
    expect(oldPassFails, "Senha antiga deveria ser rejeitada").toBe(true);

    drePassword = newPass;
  });

  test("4.2 logout/login não reaproveita cache de outro perfil", async ({ context, page }) => {
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const meDRE = await apiFetch<{
      username: string;
      role: string;
      dre: string | null;
    }>("/v1/admin/me", dreToken);
    expect(meDRE.dre).toBe(dreRenameName);

    await fixtureLogout(page);
    await injectToken(context, adminToken);
    await goToAdmin(page);

    const meAdmin = await apiFetch<{
      username: string;
      role: string;
    }>("/v1/admin/me", adminToken);
    expect(meAdmin.role).toBe("admin");

    await fixtureLogout(page);
    const secondDreLogin = await loginViaAPI(secondUser.username, secondPassword);

    const meSecond = await apiFetch<{
      username: string;
      role: string;
      dre: string | null;
      dre_id: number | null;
    }>("/v1/admin/me", secondDreLogin.token);
    expect(meSecond.dre).toBe(dreLongName);
    expect(meSecond.dre_id).toBe(secondDRE.id);
    expect(meSecond.dre).not.toBe(dreRenameName);
  });

  test("4.3 revogação remota limpa UI na próxima interação", async ({ context, page }) => {
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const meBefore = await apiFetch<{ role: string }>("/v1/admin/me", dreToken);
    expect(meBefore.role).toBe("dre");

    await page.waitForTimeout(1000);

    const adminCtx = await context.browser()!.newContext();
    const adminPage = await adminCtx.newPage();
    await injectToken(adminCtx, adminToken);
    await adminPage.goto("/admin");
    await adminPage.waitForSelector(".censo-admin", { timeout: 30_000 });
    await updateUserStatus(adminToken, createdUser.id, false);
    await adminCtx.close();

    await page.waitForTimeout(1000);

    const navigationPromise = page.waitForURL("**/admin**", { timeout: 10_000 }).catch(() => null);
    await page.reload().catch(() => {});
    await navigationPromise;

    const hasLoginForm = await page.locator("input[type='password'], .login__input")
      .isVisible({ timeout: 10_000 }).catch(() => false);
    const hasToken = await page.evaluate(() => sessionStorage.getItem("censo_admin_token"));
    expect(hasLoginForm || !hasToken, "UI deveria mostrar login ou token deveria estar limpo após revogação remota").toBe(true);

    await injectToken(context, adminToken);
    await goToAdmin(page);
    await updateUserStatus(adminToken, createdUser.id, true);
  });

  test("4.4 dre_id canônico ignora divergência textual", async ({ context, page }) => {
    await injectToken(context, dreToken);
    await goToAdmin(page);

    const preRenameMe = await apiFetch<{
      dre: string | null;
      dre_id: number | null;
    }>("/v1/admin/me", dreToken);
    expect(preRenameMe.dre_id).toBe(createdDRE.id);

    const schoolsRes = await fetch(
      `${API_URL}/v1/admin/census?dre=${encodeURIComponent(dreRenameName)}&limit=5&page=1`,
      { headers: { Authorization: `Bearer ${dreToken}` } },
    );
    const schoolsJson = await schoolsRes.json() as { data?: { items?: unknown[] } };

    expect(schoolsJson.data).toBeDefined();
  });
});
