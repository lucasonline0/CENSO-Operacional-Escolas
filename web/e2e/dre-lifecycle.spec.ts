// E2E do Perfil DRE contra a stack REAL (PostgreSQL 16 + API Go + Next.js).
//
// Cobre o lifecycle de perfil DRE sem mocks:
//   - login admin real com escopo amplo;
//   - login DRE real com DRE fixa/escopada (UI + /admin/me);
//   - isolamento de analytics (opcoes, forçar ?dre=, BOLA por census id);
//   - revogação de sessão por auth_version após reset de senha (0024);
//   - perfil DRE_B não vaza dados de DRE_A.
//
// A execução é serial (workers=1) porque o login tem rate limit por IP
// (5 tentativas/15min). Tokens legítimos são compartilhados entre testes
// via variáveis de módulo para não estourar a janela.
import { test, expect } from "@playwright/test";
import {
  loginViaUI, pageWithToken, apiGet, apiRaw, apiRawPost,
  adminCredentials, dreA, dreB, randomPassword, apiURL,
} from "./helpers";

test.describe.configure({ mode: "serial" });

let adminToken: string | null = null;
let dreAToken: string | null = null;

interface MeResponse {
  role: string;
  username: string;
  dre: string;
}

interface DrenameEntry {
  nome: string;
}

interface ScopedFilterOptions {
  dres: string[];
  escolas: Array<{ dre: string }>;
}

interface CensusListPage {
  rows: Array<{ census_id: number }>;
}

interface AdminUserRow {
  id: number;
  username: string;
  role: string;
}

async function openDashboard(browser: import("@playwright/test").Browser, token: string) {
  const page = await pageWithToken(browser, token);
  await page.goto("/admin/");
  await expect(page.locator(".ca-sidebar")).toBeVisible();
  return page;
}

test("admin (env) enxerga a rede completa e ações globais", async ({ page, request }) => {
  const cred = adminCredentials();
  adminToken = await loginViaUI(page, cred.username, cred.password);

  // Grupo de administração global visível apenas para admin.
  await expect(page.getByText("Administração")).toBeVisible();
  await expect(page.getByText("Gestão de DREs e Acessos")).toBeVisible();

  // Seletor de DRE editável para admin.
  const dreFilter = page.getByLabel("DRE");
  await expect(dreFilter).toBeEnabled();

  // /admin/me reflete role admin (identidade real no backend).
  const me = await apiGet<MeResponse>(request, adminToken, "/v1/admin/me");
  expect(me.role).toBe("admin");
  expect(me.username).toBe(cred.username);

  // Acesso amplo: lista de DREs existe.
  const dres = await apiGet<Array<DrenameEntry>>(request, adminToken, "/v1/admin/dres");
  const names = dres.map((d) => d.nome);
  expect(names).toContain(dreA().name);
  expect(names).toContain(dreB().name);
});

test("usuário DRE_A vê DRE fixa e escondidas ações globais", async ({ page, request }) => {
  const acc = dreA();
  dreAToken = await loginViaUI(page, acc.username, acc.password);

  // Indicador visual de escopo restrito.
  await expect(page.getByText(/Acesso restrito à DRE:/)).toBeVisible();

  // Grupo de administração global NÃO existe para DRE.
  await expect(page.getByText("Gestão de DREs e Acessos")).toHaveCount(0);

  // DRE fixa: select desabilitado com o valor da conta.
  const dreFilter = page.getByLabel("DRE");
  await expect(dreFilter).toBeDisabled();
  expect(await dreFilter.inputValue()).toBe(acc.name);

  // /admin/me reflete role=dre com a DRE autorizada.
  const me = await apiGet<MeResponse>(request, dreAToken, "/v1/admin/me");
  expect(me.role).toBe("dre");
  expect(me.dre).toBe(acc.name);
});

test("DRE_A nunca recebe opções nem dados de DRE_B (including ?dre=DRE B forçado)", async ({ request }) => {
  expect(dreAToken).toBeTruthy();

  // Opções dos filtros escopadas: só DRE_A.
  const opts = await apiGet<ScopedFilterOptions>(request, dreAToken!, "/v1/admin/analytics/filtros/opcoes");
  expect(opts.dres).toEqual([dreA().name]);
  expect(opts.escolas.length).toBeGreaterThan(0);
  for (const escola of opts.escolas) {
    expect(escola.dre).toBe(dreA().name);
  }
  expect(JSON.stringify(opts)).not.toContain(dreB().name);

  // Forçar ?dre=DRE B na requisição NÃO amplia o escopo.
  const forced = await apiGet<ScopedFilterOptions>(
    request, dreAToken!, `/v1/admin/analytics/filtros/opcoes?dre=${encodeURIComponent(dreB().name)}`
  );
  expect(forced.dres).toEqual([dreA().name]);
  expect(JSON.stringify(forced)).not.toContain(dreB().name);

  // Dashboard com ?dre=DRE B continua escopado para DRE_A.
  const dash = await apiGet<unknown>(
    request, dreAToken!, `/v1/admin/dashboard?dre=${encodeURIComponent(dreB().name)}`
  );
  expect(JSON.stringify(dash)).not.toContain(dreB().name);
});

test("DRE_A: BOLA por ID de censo de DRE_B é bloqueada e rotas admin são negadas", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dreAToken).toBeTruthy();

  // Localiza um censo da DRE_B como admin.
  const censusB = await apiGet<CensusListPage>(
    request, adminToken!, `/v1/admin/census?dre=${encodeURIComponent(dreB().name)}&limit=1`
  );
  expect(censusB.rows.length).toBeGreaterThan(0);
  const foreignCensusId = censusB.rows[0].census_id;

  // DRE_A tentando ler censo de DRE_B por ID => 403 (BOLA fechado).
  const blocked = await apiRaw(request, dreAToken!, `/v1/admin/census/${foreignCensusId}`);
  expect(blocked.status()).toBe(403);

  // Listagem de DRE_A, mesmo forçando ?dre=, não contém DRE_B.
  const list = await apiRaw(request, dreAToken!, `/v1/admin/census?dre=${encodeURIComponent(dreB().name)}&limit=50`);
  expect(list.ok()).toBeTruthy();
  expect(await list.text()).not.toContain(dreB().name);

  // Rotas globais de administração são negadas para DRE.
  const users = await apiRaw(request, dreAToken!, "/v1/admin/users");
  expect([401, 403]).toContain(users.status());
  const dres = await apiRaw(request, dreAToken!, "/v1/admin/dres");
  expect([401, 403]).toContain(dres.status());
  const sync = await apiRawPost(request, dreAToken!, "/v1/admin/sync-sheets");
  expect([401, 403]).toContain(sync.status());
});

test("admin redefine senha de DRE_A: sessão antiga é revogada (auth_version) e nova credencial funciona", async ({ request }) => {
  expect(adminToken).toBeTruthy();
  expect(dreAToken).toBeTruthy();
  const acc = dreA();

  const users = await apiGet<Array<AdminUserRow>>(request, adminToken!, "/v1/admin/users");
  const target = users.find((u) => u.username === acc.username);
  expect(target).toBeTruthy();
  const newPassword = await randomPassword();

  const reset = await apiRawPost(request, adminToken!, `/v1/admin/users/${target!.id}/reset-password`, { password: newPassword });
  expect(reset.ok()).toBeTruthy();

  // Token ANTIGO de DRE_A passa a falhar em /admin/me (auth_version incrementado).
  const revoked = await apiRaw(request, dreAToken!, "/v1/admin/me");
  expect([401, 403]).toContain(revoked.status());

  // A nova senha volta a autenticar (relogin real pela API).
  const relogin = await request.post(`${apiURL}/v1/admin/login`, {
    data: { username: acc.username, password: newPassword },
  });
  expect(relogin.ok()).toBeTruthy();
  const body = (await relogin.json()) as { data: { token: string } };
  dreAToken = body.data.token;
  const me = await apiGet<MeResponse>(request, body.data.token, "/v1/admin/me");
  expect(me.role).toBe("dre");
  expect(me.dre).toBe(acc.name);
});

test("usuário DRE_B tem escopo próprio e não herda dados de DRE_A", async ({ page, request }) => {
  const acc = dreB();
  const tokenB = await loginViaUI(page, acc.username, acc.password);

  await expect(page.getByText(/Acesso restrito à DRE:/)).toBeVisible();
  const dreFilter = page.getByLabel("DRE");
  await expect(dreFilter).toBeDisabled();
  expect(await dreFilter.inputValue()).toBe(acc.name);

  const opts = await apiGet<ScopedFilterOptions>(request, tokenB, "/v1/admin/analytics/filtros/opcoes");
  expect(opts.dres).toEqual([acc.name]);
  expect(JSON.stringify(opts)).not.toContain(dreA().name);

  const me = await apiGet<MeResponse>(request, tokenB, "/v1/admin/me");
  expect(me.role).toBe("dre");
  expect(me.dre).toBe(acc.name);
});

test("sessão restaurada via token real (sessionStorage) abandona cache e escopa analytics", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();
  const page = await openDashboard(browser, dreAToken!);
  await expect(page.getByText(/Acesso restrito à DRE:/)).toBeVisible();

  // Mesmo token, contexto novo: opções permanecem escopadas (sem cache vazado).
  const opts = await apiGet<ScopedFilterOptions>(request, dreAToken!, "/v1/admin/analytics/filtros/opcoes");
  expect(opts.dres).toEqual([dreA().name]);
  await page.close();
});