// E2E de cobertura final do Perfil DRE contra a stack real.
// Issue #246 — abas, isolamento, divergência legado, revogação e cache.
import { test, expect } from "@playwright/test";
import {
  pageWithToken,
  apiGet, apiRaw, apiRawPost, apiRawPatch,
  adminCredentials, dreA, dreB, randomPassword, apiURL,
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
  codigos_inep: string[];
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

  await page.context().close();
});

test("3 — DRE A não acessa Gestão de DREs/Acessos (sidebar + API)", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();

  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");
  await expect(page.locator(".ca-sidebar")).toBeVisible();
  await expect(page.getByText("Gestão de DREs e Acessos")).toHaveCount(0);
  await expect(page.getByText("Administração")).toHaveCount(0);
  await page.context().close();

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

test("6 — matriz de filtros e cascata permanecem dentro da DRE autenticada", async ({ request }) => {
  expect(dreAToken).toBeTruthy();

  const base = await apiGet<FiltrosOpcoes>(request, dreAToken!, "/v1/admin/analytics/filtros/opcoes");
  const schoolA2 = base.escolas.find((school) => school.nome_escola === "Escola A2");
  expect(schoolA2).toBeTruthy();
  expect(base.anos).toEqual(expect.arrayContaining([2026, 2023]));
  expect(base.municipios).toEqual(expect.arrayContaining(["Municipio A1", "Municipio A2"]));
  expect(base.zonas).toEqual(expect.arrayContaining(["Urbana", "Rural"]));
  expect(base.codigos_inep).toContain("260002E1");

  const cases: Array<{ query: string; total: number }> = [
    { query: "year=2026", total: 4 },
    { query: "municipio=Municipio%20A1", total: 3 },
    { query: "regiao_integracao=REGIAO%20E2E%20A", total: 4 },
    { query: "zona=Rural", total: 1 },
    { query: `school_id=${schoolA2!.school_id}`, total: 1 },
    { query: "codigo_inep=260002E1", total: 1 },
    { query: "year=2026&municipio=Municipio%20A1&zona=Rural", total: 1 },
    { query: "regiao_integracao=REGIAO%20E2E%20A&municipio=Municipio%20A1", total: 3 },
    { query: `year=2026&regiao_integracao=REGIAO%20E2E%20A&dre=${encodeURIComponent(dreB().name)}`, total: 4 },
    { query: `year=2026&school_id=${schoolA2!.school_id}`, total: 1 },
    { query: "year=2026&municipio=Municipio%20Inexistente", total: 0 },
  ];
  for (const item of cases) {
    const response = await apiRaw(request, dreAToken!, `/v1/admin/census?${item.query}`);
    expect(response.ok(), item.query).toBeTruthy();
    const body = (await response.json()) as { data: { total: number; rows: Array<{ dre: string }> } };
    expect(body.data.total, item.query).toBe(item.total);
    expect(body.data.rows.every((row) => row.dre === dreA().name), item.query).toBe(true);
  }

  const municipalityCascade = await apiGet<FiltrosOpcoes>(
    request, dreAToken!, "/v1/admin/analytics/filtros/opcoes?municipio=Municipio%20A1",
  );
  expect(municipalityCascade.escolas.map((school) => school.nome_escola).sort())
    .toEqual(["Escola A1", "Escola A2", "Escola Divergente"].sort());

  const zoneCascade = await apiGet<FiltrosOpcoes>(
    request, dreAToken!, "/v1/admin/analytics/filtros/opcoes?municipio=Municipio%20A1&zona=Rural",
  );
  expect(zoneCascade.escolas.map((school) => school.nome_escola)).toEqual(["Escola A2"]);
  expect(zoneCascade.codigos_inep).toEqual(["260002E1"]);
});

test("7 — UI limpa dependências inválidas, preserva escopo DRE e mantém filtros entre abas", async ({ browser }) => {
  expect(dreAToken).toBeTruthy();
  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");
  await expect(page.locator(".ca-sidebar")).toBeVisible();

  const dreSelect = page.getByLabel("DRE", { exact: true });
  const yearSelect = page.getByLabel("Ano de referência", { exact: true });
  const municipalitySelect = page.getByLabel("Município", { exact: true });
  const zoneSelect = page.getByLabel("Zona", { exact: true });
  const inepSelect = page.getByLabel("Código INEP", { exact: true });

  await expect(dreSelect).toBeDisabled();
  await expect(dreSelect).toHaveValue(dreA().name);
  await yearSelect.selectOption("2026");
  await municipalitySelect.selectOption("Municipio A1");
  await expect(zoneSelect).toContainText("Rural");
  await zoneSelect.selectOption("Rural");
  await expect(inepSelect).toContainText("260002E1");
  await inepSelect.selectOption("260002E1");

  // Município é pai de zona/escola/INEP: a troca elimina filhos do recorte antigo.
  await municipalitySelect.selectOption("Municipio A2");
  await expect(zoneSelect).toHaveValue("");
  await expect(inepSelect).toHaveValue("");

  // Trocas rápidas não podem restaurar seleção filha obsoleta.
  await municipalitySelect.selectOption("Municipio A1");
  await municipalitySelect.selectOption("Municipio A2");
  await expect(zoneSelect).toHaveValue("");

  await page.getByText("Pessoal e Gestão Escolar", { exact: false }).first().click();
  await expect(yearSelect).toHaveValue("2026");
  await expect(municipalitySelect).toHaveValue("Municipio A2");

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(yearSelect).toHaveValue("");
  await expect(municipalitySelect).toHaveValue("");
  await expect(dreSelect).toHaveValue(dreA().name);
  await expect(dreSelect).toBeDisabled();
  await page.context().close();
});

test("8 — divergência legado: schools.dre != dre_id → autoriza por ID", async ({ browser, request }) => {
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
  await page.context().close();
});

test("9 — reset remoto encerra a sessão visualmente sem F5 e exige setup", async ({ browser, request }) => {
  expect(adminToken).toBeTruthy();
  expect(dreAUserId).toBeTruthy();
  expect(dreAToken).toBeTruthy();
  expect(dreACredentials).toBeTruthy();

  // Reutiliza o token real já autenticado em TEST-NET. Fazer novo login via UI
  // aqui concorria com o bucket normal consumido pelo spec #245 e tornava a
  // suíte dependente da ordem dos arquivos.
  const freshToken = dreAToken!;
  const page = await pageWithToken(browser, freshToken);
  await page.goto("/admin/");
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

  const setupLogin = await request.post(`${apiURL}/v1/admin/login`, {
    data: JSON.stringify({ username: dreACredentials!.username, password: newPassword }),
    headers: { "Content-Type": "application/json", "X-Forwarded-For": TEST_NET_IPS[3] },
  });
  expect(setupLogin.status()).toBe(403);
  const setupBody = (await setupLogin.json()) as { code: string; data: { challenge_token: string } };
  expect(setupBody.code).toBe("PASSWORD_SETUP_REQUIRED");

  const definitivePassword = await randomPassword();
  const completed = await request.post(`${apiURL}/v1/admin/first-access/password`, {
    data: JSON.stringify({ new_password: definitivePassword, confirm_password: definitivePassword }),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${setupBody.data.challenge_token}` },
  });
  expect(completed.ok()).toBeTruthy();
  const completedBody = (await completed.json()) as { data: { token: string } };
  const newToken = completedBody.data.token;
  const me = await apiGet<MeResponse>(request, newToken, "/v1/admin/me");
  expect(me.role).toBe("dre");
  dreAToken = newToken;
  dreACredentials = { username: dreACredentials!.username, password: definitivePassword };
  await page.context().close();
});

test("10 — desativação remota encerra UI e token antigo não ressuscita", async ({ browser, request }) => {
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
  await page.context().close();
});

test("11 — troca DRE_A → DRE_B não reaproveita cache/estado", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();

  const ctxA = await browser.newContext({ baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000" });
  await ctxA.addInitScript(
    ([key, tk]) => sessionStorage.setItem(key, tk),
    ["censo_admin_token", dreAToken!],
  );
  const pageA = await ctxA.newPage();
  await pageA.goto("/admin/");
  const badgeA = await pageA.getByText(/Acesso restrito à DRE:/).textContent();
  expect(badgeA).toContain(dreA().name);
  await ctxA.close();

  const ctxB = await browser.newContext({ baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000" });
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
