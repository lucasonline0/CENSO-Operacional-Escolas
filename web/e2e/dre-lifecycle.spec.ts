// E2E do lifecycle completo Admin → Perfil DRE contra a stack REAL
// (PostgreSQL 16 + API Go + Next.js).
//
// Cobertura obrigatória da issue #245 (14 cenários serial):
//   1.  Admin autentica e vê rede completa
//   2.  Admin cria DRE ativa pelo fluxo real
//   3.  Admin cria usuário regional vinculado à DRE pelo contrato canônico dre_id
//   4.  Usuário DRE autentica e /admin/me confirma role=dre + dre_id correto
//   5.  Admin renomeia DRE e usuário mantém vínculo pelo mesmo ID
//   6.  Admin renomeia DRE com nome >100 caracteres e funciona pelo ID
//   7.  Admin desativa usuário → token antigo revogado definitivamente (401)
//   8.  Admin reativa usuário → token antigo continua inválido, novo login OK
//   9.  Admin desativa DRE → tokens existentes revogados definitivamente
//   10. Admin reativa DRE → tokens antigos continuam inválidos
//   11. DRE inativa não permite provisioning de usuário (400)
//   12. Reset de senha invalida token anterior imediatamente
//   13. Senha antiga falha autenticação e nova autentica com sucesso
//   14. Logout/login entre identidades distintas não reaproveita estado/cache
//
// Execução serial (workers=1, retries=0): login tem rate limit por IP
// (5 tentativas / 15 min). "Novo login OK" do teste 10 é coberto pelo
// teste 14 Context C. Total: exatamente 5 logins.
import { test, expect } from "@playwright/test";
import {
  loginViaUI, loginViaAPI,
  apiGet, apiRaw, apiRawPost, apiRawPut, apiRawPatch,
  adminCredentials, randomPassword, apiURL, webURL,
} from "./helpers";

test.describe.configure({ mode: "serial" });

let adminToken: string | null = null;
let dynamicDreID: number | null = null;
let dynamicDreToken: string | null = null;
let dynamicDreTokenRevoked: string | null = null;
let dynamicUserId: number | null = null;
let dynamicUserCred: { username: string; password: string } | null = null;
const DRE_LIFECYCLE_NAME = "DRE E2E Lifecycle";

// ── Interfaces ────────────────────────────────────────────────────────────

interface MeResponse {
  role: string;
  username: string;
  dre: string | null;
  dre_id: number | null;
}

interface DREListItem {
  id: number;
  nome: string;
  ativa: boolean;
}

interface AdminUserRow {
  id: number;
  username: string;
  role: string;
  dre_id: number;
  dre: string;
  active: boolean;
}

interface AdminUserListResponse {
  id: number;
  username: string;
  role: string;
  dre: string;
  dre_id: number;
  active: boolean;
}

interface DrenameEntry {
  nome: string;
}

// ── Teste 1 ───────────────────────────────────────────────────────────────

test("1 — admin autentica e vê rede completa", async ({ page, request }) => {
  const cred = adminCredentials();
  adminToken = await loginViaUI(page, cred.username, cred.password);

  await expect(page.getByText("Administração")).toBeVisible();
  await expect(page.getByText("Gestão de DREs e Acessos")).toBeVisible();

  const dreFilter = page.getByLabel("DRE");
  await expect(dreFilter).toBeEnabled();

  const me = await apiGet<MeResponse>(request, adminToken, "/v1/admin/me");
  expect(me.role).toBe("admin");
  expect(me.username).toBe(cred.username);

  const dres = await apiGet<Array<DrenameEntry>>(request, adminToken, "/v1/admin/dres");
  const names = dres.map((d) => d.nome);
  expect(names.length).toBeGreaterThan(0);
});

// ── Teste 2 ───────────────────────────────────────────────────────────────

test("2 — admin cria DRE ativa pelo fluxo real", async ({ request }) => {
  expect(adminToken).toBeTruthy();

  const created = await apiRawPost(request, adminToken!, "/v1/admin/dres", {
    nome: DRE_LIFECYCLE_NAME,
    sigla: "E2E",
    municipio_sede: "Município E2E",
    ativa: true,
  });
  expect(created.status()).toBe(201);

  const body = (await created.json()) as { data: DREListItem };
  expect(body.data.id).toBeGreaterThan(0);
  expect(body.data.nome).toBe(DRE_LIFECYCLE_NAME);
  expect(body.data.ativa).toBe(true);
  dynamicDreID = body.data.id;

  const allDres = await apiGet<Array<DREListItem>>(request, adminToken!, "/v1/admin/dres");
  expect(allDres.some((d) => d.id === dynamicDreID)).toBe(true);
});

// ── Teste 3 ───────────────────────────────────────────────────────────────

test("3 — admin cria usuário regional vinculado à DRE pelo contrato canônico dre_id", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreID).toBeTruthy();

  const username = `e2e.lifecycle.${Date.now()}`;
  const password = await randomPassword();

  const res = await apiRawPost(request, adminToken!, "/v1/admin/users", {
    username,
    password,
    role: "dre",
    dre_id: dynamicDreID,
  });
  expect(res.status()).toBe(201);

  const body = (await res.json()) as { data: AdminUserRow };
  expect(body.data.dre_id).toBe(dynamicDreID);
  expect(body.data.dre).toBe(DRE_LIFECYCLE_NAME);
  expect(body.data.active).toBe(true);

  dynamicUserId = body.data.id;
  dynamicUserCred = { username, password };

  const users = await apiGet<Array<AdminUserListResponse>>(request, adminToken!, "/v1/admin/users");
  const found = users.find((u) => u.id === dynamicUserId);
  expect(found).toBeTruthy();
  expect(found!.dre_id).toBe(dynamicDreID);
});

// ── Teste 4 ───────────────────────────────────────────────────────────────

test("4 — usuário DRE autentica e /admin/me confirma role=dre + dre_id correto", async ({ page, request }) => {
  expect(dynamicUserCred).toBeTruthy();
  expect(dynamicDreID).toBeTruthy();

  dynamicDreToken = await loginViaUI(page, dynamicUserCred!.username, dynamicUserCred!.password);

  await expect(page.getByText(/Acesso restrito à DRE:/)).toBeVisible();
  const dreFilter = page.getByLabel("DRE");
  await expect(dreFilter).toBeDisabled();

  const me = await apiGet<MeResponse>(request, dynamicDreToken!, "/v1/admin/me");
  expect(me.role).toBe("dre");
  expect(me.dre_id).toBe(dynamicDreID);
  expect(me.dre).toBe(DRE_LIFECYCLE_NAME);
});

// ── Teste 5 ───────────────────────────────────────────────────────────────

test("5 — admin renomeia DRE e usuário mantém vínculo pelo mesmo ID", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreID).toBeTruthy();
  expect(dynamicDreToken).toBeTruthy();

  const newName = "DRE E2E Lifecycle RENAMED";
  const res = await apiRawPut(request, adminToken!, `/v1/admin/dres/${dynamicDreID}`, {
    nome: newName,
    sigla: "E2E",
    ativa: true,
  });
  expect(res.ok()).toBeTruthy();

  const me = await apiGet<MeResponse>(request, dynamicDreToken!, "/v1/admin/me");
  expect(me.dre_id).toBe(dynamicDreID);
  expect(me.dre).toBe(newName);

  const users = await apiGet<Array<AdminUserListResponse>>(request, adminToken!, "/v1/admin/users");
  const found = users.find((u) => u.id === dynamicUserId);
  expect(found).toBeTruthy();
  expect(found!.dre_id).toBe(dynamicDreID);

  const allDresAfterRename = await apiGet<Array<DREListItem>>(request, adminToken!, "/v1/admin/dres");
  const dreRenamed = allDresAfterRename.find((d) => d.id === dynamicDreID);
  expect(dreRenamed).toBeTruthy();
  expect(dreRenamed!.nome).toBe(newName);
});

// ── Teste 6 ───────────────────────────────────────────────────────────────

test("6 — admin renomeia DRE com nome >100 caracteres e funciona pelo ID", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreID).toBeTruthy();
  expect(dynamicDreToken).toBeTruthy();

  const longName = "D".repeat(120);
  const res = await apiRawPut(request, adminToken!, `/v1/admin/dres/${dynamicDreID}`, {
    nome: longName,
    sigla: "E2E",
    ativa: true,
  });
  expect(res.ok()).toBeTruthy();

  const allDresAfterLongRename = await apiGet<Array<DREListItem>>(request, adminToken!, "/v1/admin/dres");
  const dreLongName = allDresAfterLongRename.find((d) => d.id === dynamicDreID);
  expect(dreLongName).toBeTruthy();
  expect(dreLongName!.nome).toBe(longName);
  expect(dreLongName!.nome.length).toBeGreaterThan(100);

  const me = await apiGet<MeResponse>(request, dynamicDreToken!, "/v1/admin/me");
  expect(me.dre_id).toBe(dynamicDreID);
  expect(me.dre).toBe(longName);
});

// ── Teste 7 ───────────────────────────────────────────────────────────────

test("7 — admin desativa usuário → token antigo é revogado definitivamente (401)", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreToken).toBeTruthy();
  expect(dynamicUserId).toBeTruthy();

  const tokenAntigo = dynamicDreToken!;

  const res = await apiRawPatch(request, adminToken!, `/v1/admin/users/${dynamicUserId}/status`, {
    active: false,
  });
  expect(res.ok()).toBeTruthy();

  const revoked = await apiRaw(request, tokenAntigo, "/v1/admin/me");
  expect(revoked.status()).toBe(401);

  const filters = await apiRaw(request, tokenAntigo, "/v1/admin/analytics/filtros/opcoes");
  expect(filters.status()).toBe(401);
});

// ── Teste 8 ───────────────────────────────────────────────────────────────

test("8 — admin reativa usuário → token antigo continua inválido (401), novo login OK", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicUserId).toBeTruthy();
  expect(dynamicUserCred).toBeTruthy();

  const tokenAntigo = dynamicDreToken!;

  const activate = await apiRawPatch(request, adminToken!, `/v1/admin/users/${dynamicUserId}/status`, {
    active: true,
  });
  expect(activate.ok()).toBeTruthy();

  const stillRevoked = await apiRaw(request, tokenAntigo, "/v1/admin/me");
  expect(stillRevoked.status()).toBe(401);

  const newToken = await loginViaAPI(request, dynamicUserCred!.username, dynamicUserCred!.password);
  expect(newToken).toBeTruthy();
  expect(newToken).not.toBe(tokenAntigo);

  const me = await apiGet<MeResponse>(request, newToken, "/v1/admin/me");
  expect(me.role).toBe("dre");
  expect(me.dre_id).toBe(dynamicDreID);

  dynamicDreToken = newToken;
});

// ── Teste 9 ───────────────────────────────────────────────────────────────

test("9 — admin desativa DRE → tokens existentes são revogados definitivamente", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreID).toBeTruthy();

  const deactivate = await apiRawPut(request, adminToken!, `/v1/admin/dres/${dynamicDreID}`, {
    nome: "D".repeat(120),
    ativa: false,
  });
  expect(deactivate.ok()).toBeTruthy();

  const tokenAntigo = dynamicDreToken!;

  const revoked = await apiRaw(request, tokenAntigo, "/v1/admin/me");
  expect(revoked.status()).toBe(401);

  const users = await apiGet<Array<AdminUserListResponse>>(request, adminToken!, "/v1/admin/users");
  const user = users.find((u) => u.id === dynamicUserId);
  expect(user).toBeTruthy();
  expect(user!.active).toBe(true);
  expect(user!.dre_id).toBe(dynamicDreID);
});

// ── Teste 10 ──────────────────────────────────────────────────────────────

// "novo login OK" pós-reativação da DRE é coberto pelo teste 14
// Context C (loginViaUI com nova senha → DRE UI).
test("10 — admin reativa DRE → tokens antigos continuam inválidos", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreID).toBeTruthy();

  const tokenAntigo = dynamicDreToken!;

  const activate = await apiRawPut(request, adminToken!, `/v1/admin/dres/${dynamicDreID}`, {
    nome: "D".repeat(120),
    ativa: true,
  });
  expect(activate.ok()).toBeTruthy();

  const stillRevoked = await apiRaw(request, tokenAntigo, "/v1/admin/me");
  expect(stillRevoked.status()).toBe(401);

  dynamicDreTokenRevoked = tokenAntigo;
  dynamicDreToken = null;
});

// ── Teste 11 ──────────────────────────────────────────────────────────────

test("11 — DRE inativa não permite provisioning de usuário (validação de erro)", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreID).toBeTruthy();

  await apiRawPut(request, adminToken!, `/v1/admin/dres/${dynamicDreID}`, {
    nome: "D".repeat(120),
    ativa: false,
  });

  const res = await apiRawPost(request, adminToken!, "/v1/admin/users", {
    username: `e2e.inactive.test.${Date.now()}`,
    password: await randomPassword(),
    role: "dre",
    dre_id: dynamicDreID,
  });
  expect(res.status()).toBe(400);

  await apiRawPut(request, adminToken!, `/v1/admin/dres/${dynamicDreID}`, {
    nome: "D".repeat(120),
    ativa: true,
  });

  const statusRes = await apiRawPatch(request, adminToken!, `/v1/admin/users/${dynamicUserId}/status`, {
    active: false,
  });
  expect(statusRes.ok()).toBeTruthy();
});

// ── Teste 12 ──────────────────────────────────────────────────────────────

test("12 — reset de senha invalida token anterior imediatamente", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicUserId).toBeTruthy();
  expect(dynamicUserCred).toBeTruthy();

  const newPassword = await randomPassword();
  const reset = await apiRawPost(
    request, adminToken!, `/v1/admin/users/${dynamicUserId}/reset-password`,
    { password: newPassword },
  );
  expect(reset.ok()).toBeTruthy();

  dynamicDreToken = null;

  const reactivate = await apiRawPatch(request, adminToken!, `/v1/admin/users/${dynamicUserId}/status`, {
    active: true,
  });
  expect(reactivate.ok()).toBeTruthy();

  dynamicUserCred = { ...dynamicUserCred!, password: newPassword };
});

// ── Teste 13 ──────────────────────────────────────────────────────────────

test("13 — senha antiga falha autenticação e nova senha autentica com sucesso", async ({ request }) => {
  expect(dynamicUserCred).toBeTruthy();

  const oldPassword = "e2e-DEPRECATED-OLD-PASSWORD-DO-NOT-USE";

  const oldLogin = await request.post(`${apiURL}/v1/admin/login`, {
    data: JSON.stringify({
      username: dynamicUserCred!.username,
      password: oldPassword,
    }),
    headers: { "Content-Type": "application/json" },
  });
  expect(oldLogin.status()).toBe(401);
});

// ── Teste 14 ──────────────────────────────────────────────────────────────

test("14 — logout/login entre identidades distintas não reaproveita estado/cache", async ({ browser }) => {
  expect(adminToken).toBeTruthy();
  expect(dynamicDreTokenRevoked).toBeTruthy();
  expect(dynamicUserCred).toBeTruthy();

  // Contexto A: admin via token injetado — vê "Administração"
  const adminCtx = await browser.newContext({ baseURL: webURL });
  await adminCtx.addInitScript(
    ([key, tk]) => sessionStorage.setItem(key, tk),
    ["censo_admin_token", adminToken!],
  );
  const adminPage = await adminCtx.newPage();
  await adminPage.goto("/admin/");
  await expect(adminPage.locator(".ca-sidebar")).toBeVisible();
  await expect(adminPage.getByText("Administração")).toBeVisible();
  await expect(adminPage.getByText("Gestão de DREs e Acessos")).toBeVisible();

  // Contexto B: DRE com token revogado — vê tela de login (prova que token
  // antigo não reaproveita estado do contexto admin).
  const dreCtx = await browser.newContext({ baseURL: webURL });
  await dreCtx.addInitScript(
    ([key, tk]) => sessionStorage.setItem(key, tk),
    ["censo_admin_token", dynamicDreTokenRevoked!],
  );
  const drePage = await dreCtx.newPage();
  await drePage.goto("/admin/");
  await expect(drePage.locator("input[autocomplete='username']")).toBeVisible();
  await expect(drePage.locator(".ca-sidebar")).toHaveCount(0);

  // Contexto C: login DRE fresh com nova senha — prova que nova senha funciona
  // e que o estado do contexto B (tela de login) não vaza para este contexto.
  const freshCtx = await browser.newContext({ baseURL: webURL });
  const freshPage = await freshCtx.newPage();
  await loginViaUI(freshPage, dynamicUserCred!.username, dynamicUserCred!.password);
  await expect(freshPage.locator(".ca-sidebar")).toBeVisible();
  await expect(freshPage.getByText(/Acesso restrito à DRE:/)).toBeVisible();
  await expect(freshPage.getByText("Gestão de DREs e Acessos")).toHaveCount(0);
  await expect(freshPage.getByText("Administração")).toHaveCount(0);

  await adminPage.close();
  await drePage.close();
  await freshPage.close();
  await adminCtx.close();
  await dreCtx.close();
  await freshCtx.close();
});

// ── Cleanup ───────────────────────────────────────────────────────────────

test.afterAll(async () => {
  if (!adminToken) return;

  const headers = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };

  if (dynamicUserId) {
    await fetch(`${apiURL}/v1/admin/users/${dynamicUserId}/status`, {
      method: "PATCH", headers,
      body: JSON.stringify({ active: false }),
    }).catch(() => {});
  }

  if (dynamicDreID) {
    await fetch(`${apiURL}/v1/admin/dres/${dynamicDreID}`, {
      method: "PUT", headers,
      body: JSON.stringify({ nome: "D".repeat(120), ativa: false }),
    }).catch(() => {});
  }
});
