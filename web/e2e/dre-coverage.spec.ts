// E2E de cobertura final do Perfil DRE contra a stack real.
// Issue #246 — abas, isolamento, divergência legado, revogação e cache.
import { test, expect } from "@playwright/test";
import {
  loginViaUI, pageWithToken,
  apiGet, apiRaw, apiRawPost, apiRawPatch,
  adminCredentials, dreA, dreB, randomPassword, apiURL, webURL,
} from "./helpers";

test.describe.configure({ mode: "serial" });

let adminToken: string | null = null;
let dreAToken: string | null = null;
let dreBToken: string | null = null;
let dreAUserId: number | null = null;
let dreACredentials: { username: string; password: string } | null = null;

const TEST_NET_IPS = [
  "203.0.113.20",
  "203.0.113.21",
  "203.0.113.22",
  "203.0.113.23",
  "203.0.113.24",
];

interface MeResponse {
  role: string;
  username: string;
  dre: string | null;
  dre_id: number | null;
}

interface AdminUserResponse {
  id: number;
  username: string;
  role: string;
  dre: string;
  dre_id: number | null;
  active: boolean;
}

interface FiltrosOpcoes {
  anos: number[];
  dres: string[];
  municipios: string[];
  zonas: string[];
  regioes_integracao: string[];
  escolas: Array<{ school_id: number; nome_escola: string; codigo_inep: string; dre: string }>;
}

interface PreenchimentoPayload {
  ano_referencia: number;
  total_escolas: number;
  total_completed: number;
  total_draft: number;
  total_pending: number;
  dres: Array<{ dre: string; total: number; completed: number; draft: number; pending: number }>;
}

async function loginViaAPIWithIP(
  request: import("@playwright/test").APIRequestContext,
  username: string,
  password: string,
  ip: string,
): Promise<string> {
  const res = await request.post(`${apiURL}/v1/admin/login`, {
    data: JSON.stringify({ username, password }),
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
  });
  if (!res.ok()) {
    throw new Error(`E2E: login via API falhou (HTTP ${res.status()}) para IP ${ip}`);
  }
  const body = (await res.json()) as { data: { token: string } };
  return body.data.token;
}

test("1 — autenticação resolve usuário e DRE por identidades distintas", async ({ request }) => {
  const admin = adminCredentials();
  adminToken = await loginViaAPIWithIP(request, admin.username, admin.password, TEST_NET_IPS[0]);

  const dreACred = dreA();
  dreACredentials = { username: dreACred.username, password: dreACred.password };
  dreAToken = await loginViaAPIWithIP(request, dreACred.username, dreACred.password, TEST_NET_IPS[1]);

  const dreBCred = dreB();
  dreBToken = await loginViaAPIWithIP(request, dreBCred.username, dreBCred.password, TEST_NET_IPS[2]);

  const meA = await apiGet<MeResponse>(request, dreAToken, "/v1/admin/me");
  const meB = await apiGet<MeResponse>(request, dreBToken, "/v1/admin/me");
  expect(meA.role).toBe("dre");
  expect(meB.role).toBe("dre");
  expect(meA.dre_id).toBeGreaterThan(0);
  expect(meB.dre_id).toBeGreaterThan(0);
  expect(meA.dre_id).not.toBe(meB.dre_id);

  // admin_users.id e dres.id são identidades diferentes. Resolve o usuário
  // pelo username e só depois usa seu ID nas mutações de lifecycle.
  const users = await apiGet<AdminUserResponse[]>(request, adminToken, "/v1/admin/users");
  const dreAUser = users.find((user) => user.username === dreACred.username);
  expect(dreAUser).toBeTruthy();
  expect(dreAUser!.dre_id).toBe(meA.dre_id);
  dreAUserId = dreAUser!.id;
  expect(dreAUserId).toBeGreaterThan(0);
});

test("2 — DRE A navega por todas as 11 abas obrigatórias", async ({ browser }) => {
  expect(dreAToken).toBeTruthy();
  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");

  await expect(page.locator(".ca-sidebar")).toBeVisible();
  await expect(page.getByText(/Acesso restrito à DRE:/)).toBeVisible();
  await expect(page.getByLabel("DRE")).toBeDisabled();

  const tabs: Array<{ nav: string; heading: string }> = [
    { nav: "Caracterização da Rede", heading: "Dimensão e Perfil da Rede" },
    { nav: "Pessoal e Gestão Escolar", heading: "Estrutura de Gestão Escolar" },
    { nav: "Tecnologia e Equipamentos", heading: "Infraestrutura Digital" },
    { nav: "Infraestrutura e Segurança", heading: "Condições Estruturais e Ambientes" },
    { nav: "Merenda Escolar", heading: "Oferta e Adequação da Merenda" },
    { nav: "Serviços Terceirizados", heading: "Visão Geral" },
    { nav: "Perfil dos Alunos e Resultados", heading: "Resumo IDEB" },
    { nav: "Gestão Financeira e Governança", heading: "Governança Institucional" },
    { nav: "Saúde Operacional", heading: "Índice de Saúde Operacional por escola" },
    { nav: "Registros do Censo", heading: "Exibindo" },
    { nav: "Preenchimento por DRE", heading: "Andamento do Preenchimento por Diretoria Regional de Ensino" },
  ];

  for (const t of tabs) {
    await page.getByText(t.nav, { exact: false }).first().click();
    await expect(page.getByText(t.heading, { exact: false }).first())
      .toBeVisible({ timeout: 20_000 });
  }

  await page.close();
});

test("3 — DRE A não acessa Gestão de DREs/Acessos (sidebar + API)", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();

  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");
  await expect(page.locator(".ca-sidebar")).toBeVisible();
  await expect(page.getByText("Gestão de DREs e Acessos")).toHaveCount(0);
  await expect(page.getByText("Administração")).toHaveCount(0);
  await page.close();

  expect((await apiRaw(request, dreAToken!, "/v1/admin/dres")).status()).toBe(403);
  expect((await apiRaw(request, dreAToken!, "/v1/admin/users")).status()).toBe(403);
});

test("4 — isolamento: DRE_B não aparece nos dados/filtros da DRE_A", async ({ request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();

  const optsA = await apiGet<FiltrosOpcoes>(request, dreAToken!, "/v1/admin/analytics/filtros/opcoes");
  const optsB = await apiGet<FiltrosOpcoes>(request, dreBToken!, "/v1/admin/analytics/filtros/opcoes");

  expect(optsA.dres).toHaveLength(1);
  expect(optsB.dres).toHaveLength(1);
  expect(optsA.dres[0]).not.toBe(dreB().name);
  expect(optsB.dres[0]).not.toBe(dreA().name);

  const escolasA = optsA.escolas.map((e) => e.nome_escola);
  const escolasB = optsB.escolas.map((e) => e.nome_escola);
  expect(escolasA.some((n) => n.startsWith("Escola B"))).toBe(false);
  expect(escolasB.some((n) => n.startsWith("Escola A") || n === "Escola Divergente")).toBe(false);
  expect(escolasA.some((n) => n === "Escola Divergente")).toBe(true);
});

test("5 — forging de DRE, school_id e INEP não amplia o escopo", async ({ request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();

  const optsB = await apiGet<FiltrosOpcoes>(request, dreBToken!, "/v1/admin/analytics/filtros/opcoes");
  const foreignSchool = optsB.escolas[0];
  expect(foreignSchool).toBeTruthy();

  const optsForged = await apiGet<FiltrosOpcoes>(
    request,
    dreAToken!,
    `/v1/admin/analytics/filtros/opcoes?dre=${encodeURIComponent(dreB().name)}`,
  );
  expect(optsForged.escolas.some((e) => e.nome_escola.startsWith("Escola B"))).toBe(false);

  const censusDre = await apiRaw(
    request,
    dreAToken!,
    `/v1/admin/census?dre=${encodeURIComponent(dreB().name)}`,
  );
  expect(censusDre.ok()).toBeTruthy();
  const censusDreBody = (await censusDre.json()) as { data: { rows: Array<{ nome_escola: string }> } };
  expect(censusDreBody.data.rows.some((r) => r.nome_escola.startsWith("Escola B"))).toBe(false);

  const bySchool = await apiRaw(
    request,
    dreAToken!,
    `/v1/admin/census?school_id=${foreignSchool.school_id}`,
  );
  expect(bySchool.ok()).toBeTruthy();
  const bySchoolBody = (await bySchool.json()) as { data: { rows: unknown[]; total: number } };
  expect(bySchoolBody.data.rows).toHaveLength(0);
  expect(bySchoolBody.data.total).toBe(0);

  const byInep = await apiRaw(
    request,
    dreAToken!,
    `/v1/admin/census?codigo_inep=${encodeURIComponent(foreignSchool.codigo_inep)}`,
  );
  expect(byInep.ok()).toBeTruthy();
  const byInepBody = (await byInep.json()) as { data: { rows: unknown[]; total: number } };
  expect(byInepBody.data.rows).toHaveLength(0);
  expect(byInepBody.data.total).toBe(0);

  const preenchForged = await apiRaw(
    request,
    dreAToken!,
    `/v1/admin/analytics/preenchimento/dre?dre=${encodeURIComponent(dreB().name)}`,
  );
  expect(preenchForged.ok()).toBeTruthy();
  const preenchBody = (await preenchForged.json()) as { data: PreenchimentoPayload };
  expect(preenchBody.data.dres).toHaveLength(1);
  expect(preenchBody.data.dres[0].dre).toBe(dreA().name);
  expect(preenchBody.data.dres.some((r) => r.dre === dreB().name)).toBe(false);
});

test("6 — divergência legado: schools.dre != dre_id → autoriza por ID", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();

  const censusA = await apiRaw(request, dreAToken!, "/v1/admin/census");
  expect(censusA.ok()).toBeTruthy();
  const bodyA = (await censusA.json()) as { data: { rows: Array<{ school_id: number; nome_escola: string }> } };
  const divergent = bodyA.data.rows.find((r) => r.nome_escola === "Escola Divergente");
  expect(divergent).toBeTruthy();

  const bolaB = await apiRaw(request, dreBToken!, `/v1/admin/census/${divergent!.school_id}`);
  expect(bolaB.status()).toBe(403);

  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");
  await page.getByText("Registros do Censo", { exact: false }).first().click();
  await expect(page.getByRole("cell", { name: "Escola Divergente" }))
    .toBeVisible({ timeout: 20_000 });
  await page.close();
});

test("7 — reset remoto encerra a sessão visualmente sem F5", async ({ browser, request }) => {
  expect(adminToken).toBeTruthy();
  expect(dreAUserId).toBeTruthy();
  expect(dreACredentials).toBeTruthy();

  const page = await browser.newPage({ baseURL: webURL });
  const freshToken = await loginViaUI(page, dreACredentials!.username, dreACredentials!.password);
  await expect(page.locator(".ca-sidebar")).toBeVisible();

  const newPassword = await randomPassword();
  const reset = await apiRawPost(
    request,
    adminToken!,
    `/v1/admin/users/${dreAUserId}/reset-password`,
    { password: newPassword },
  );
  expect(reset.ok()).toBeTruthy();

  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("input[autocomplete='username']")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".ca-sidebar")).toHaveCount(0);
  expect((await apiRaw(request, freshToken, "/v1/admin/me")).status()).toBe(401);

  const newToken = await loginViaAPIWithIP(
    request,
    dreACredentials!.username,
    newPassword,
    TEST_NET_IPS[3],
  );
  const me = await apiGet<MeResponse>(request, newToken, "/v1/admin/me");
  expect(me.role).toBe("dre");
  dreAToken = newToken;
  dreACredentials = { username: dreACredentials!.username, password: newPassword };
  await page.close();
});

test("8 — desativação remota encerra UI e token antigo não ressuscita", async ({ browser, request }) => {
  expect(adminToken).toBeTruthy();
  expect(dreAUserId).toBeTruthy();
  expect(dreAToken).toBeTruthy();
  expect(dreACredentials).toBeTruthy();

  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");
  await expect(page.locator(".ca-sidebar")).toBeVisible();
  const tokenBeforeDeactivate = dreAToken!;

  const deactivate = await apiRawPatch(
    request,
    adminToken!,
    `/v1/admin/users/${dreAUserId}/status`,
    { active: false },
  );
  expect(deactivate.ok()).toBeTruthy();

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("input[autocomplete='username']")).toBeVisible({ timeout: 15_000 });
  expect((await apiRaw(request, tokenBeforeDeactivate, "/v1/admin/me")).status()).toBe(401);

  const reactivate = await apiRawPatch(
    request,
    adminToken!,
    `/v1/admin/users/${dreAUserId}/status`,
    { active: true },
  );
  expect(reactivate.ok()).toBeTruthy();
  expect((await apiRaw(request, tokenBeforeDeactivate, "/v1/admin/me")).status()).toBe(401);

  const freshToken = await loginViaAPIWithIP(
    request,
    dreACredentials!.username,
    dreACredentials!.password,
    TEST_NET_IPS[4],
  );
  expect((await apiGet<MeResponse>(request, freshToken, "/v1/admin/me")).role).toBe("dre");
  dreAToken = freshToken;
  await page.close();
});

test("9 — troca DRE_A → DRE_B não reaproveita cache/estado", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();

  const ctxA = await browser.newContext({ baseURL: webURL });
  await ctxA.addInitScript(
    ([key, tk]) => sessionStorage.setItem(key, tk),
    ["censo_admin_token", dreAToken!],
  );
  const pageA = await ctxA.newPage();
  await pageA.goto("/admin/");
  const badgeA = await pageA.getByText(/Acesso restrito à DRE:/).textContent();
  expect(badgeA).toContain(dreA().name);
  await ctxA.close();

  const ctxB = await browser.newContext({ baseURL: webURL });
  await ctxB.addInitScript(
    ([key, tk]) => sessionStorage.setItem(key, tk),
    ["censo_admin_token", dreBToken!],
  );
  const pageB = await ctxB.newPage();
  await pageB.goto("/admin/");
  const badgeB = await pageB.getByText(/Acesso restrito à DRE:/).textContent();
  expect(badgeB).toContain(dreB().name);
  expect(badgeB).not.toContain(dreA().name);

  const optsB = await apiGet<FiltrosOpcoes>(request, dreBToken!, "/v1/admin/analytics/filtros/opcoes");
  expect(optsB.escolas.some((e) => e.nome_escola.startsWith("Escola A") || e.nome_escola === "Escola Divergente")).toBe(false);
  await ctxB.close();
});
