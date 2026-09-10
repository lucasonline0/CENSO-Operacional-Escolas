// E2E de cobertura do Perfil DRE — abas, isolamento, divergência legado e
// revogação remota contra a stack REAL (PostgreSQL 16 + API Go + Next.js).
//
// Issue #246 — PEDRO-08:
//   1. Navegação por todas as 11 abas obrigatórias (DRE A)
//   2. "Gestão de DREs e Acessos" inacessível ao perfil DRE
//   3. Isolamento: dados de DRE_B não aparecem para DRE_A
//   4. Forgery: query params de outra DRE são ignorados pelo backend
//   5. Divergência: schools.dre legado != dre_id canônico → autoriza por ID
//   6. Revogação remota: UI abandona sessão sem F5 após reset/desativação
//   7. Troca de conta DRE_A → DRE_B sem vazamento de cache/estado
//
// Execução serial (workers=1, retries=0): login tem rate limit por IP
// (5 tentativas / 15 min). Este spec usa IPs TEST-NET (RFC 5737) para
// isolar seus logins do bucket principal do spec #245.
import { test, expect } from "@playwright/test";
import {
  loginViaUI, pageWithToken,
  apiGet, apiRaw, apiRawPost,
  adminCredentials, dreA, dreB, randomPassword, apiURL, webURL,
} from "./helpers";

test.describe.configure({ mode: "serial" });

// ── Tokens compartilhados entre cenários ─────────────────────────────────
let adminToken: string | null = null;
let dreAToken: string | null = null;
let dreBToken: string | null = null;
let dreAUserId: number | null = null;
let dreACredentials: { username: string; password: string } | null = null;

// IPs TEST-NET-3 (RFC 5737) para isolar logins deste spec do bucket de #245.
const TEST_NET_IPS = ["203.0.113.20", "203.0.113.21", "203.0.113.22", "203.0.113.23"];

// ── Interfaces ────────────────────────────────────────────────────────────

interface MeResponse {
  role: string;
  username: string;
  dre: string | null;
  dre_id: number | null;
}

interface FiltrosOpcoes {
  anos: number[];
  dres: string[];
  municipios: string[];
  zonas: string[];
  regioes_integracao: string[];
  escolas: Array<{ school_id: number; nome_escola: string; codigo_inep: string; dre: string }>;
}

// ── Helper: loginViaAPI com IP TEST-NET ───────────────────────────────────

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

// ── Teste 1: autenticação e setup ────────────────────────────────────────

test("1 — autenticação: admin + DRE_A + DRE_B com IPs isolados", async ({ request }) => {
  const cred = adminCredentials();
  adminToken = await loginViaAPIWithIP(request, cred.username, cred.password, TEST_NET_IPS[0]);
  expect(adminToken).toBeTruthy();

  const dreACred = dreA();
  dreACredentials = { username: dreACred.username, password: dreACred.password };
  dreAToken = await loginViaAPIWithIP(request, dreACred.username, dreACred.password, TEST_NET_IPS[1]);
  expect(dreAToken).toBeTruthy();

  const dreBCred = dreB();
  dreBToken = await loginViaAPIWithIP(request, dreBCred.username, dreBCred.password, TEST_NET_IPS[2]);
  expect(dreBToken).toBeTruthy();

  const meA = await apiGet<MeResponse>(request, dreAToken, "/v1/admin/me");
  expect(meA.role).toBe("dre");
  expect(meA.dre_id).toBeGreaterThan(0);
  dreAUserId = meA.dre_id;

  const meB = await apiGet<MeResponse>(request, dreBToken, "/v1/admin/me");
  expect(meB.role).toBe("dre");
  expect(meB.dre_id).toBeGreaterThan(0);
  expect(meB.dre_id).not.toBe(meA.dre_id);
});

// ── Teste 2: navegação por todas as 11 abas obrigatórias ─────────────────

test("2 — DRE A navega por todas as 11 abas obrigatórias", async ({ browser }) => {
  expect(dreAToken).toBeTruthy();

  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");

  // Sidebar: badge de restrição visível, seletor DRE disabled
  await expect(page.locator(".ca-sidebar")).toBeVisible();
  await expect(page.getByText(/Acesso restrito à DRE:/)).toBeVisible();
  const dreFilter = page.getByLabel("DRE");
  await expect(dreFilter).toBeDisabled();

  // Cada aba obrigatória: clicar na sidebar → validar heading h2
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
    // getByText with exact:false handles all cases:
    // - static headings ("Dimensão e Perfil da Rede")
    // - dynamic headings ("Resumo IDEB 2023" — includes year)
    // - non-heading elements ("Escolas Cadastradas" — StatCard label)
    // .first() disambiguates "Governança Institucional" from
    // "Classificação de Governança Institucional" on the same page.
    await expect(page.getByText(t.heading, { exact: false }).first())
      .toBeVisible({ timeout: 20_000 });
  }

  await page.close();
});

// ── Teste 3: "Gestão de DREs/Acessos" NÃO acessível ao DRE ─────────────

test("3 — DRE A não acessa Gestão de DREs/Acessos (sidebar + API)", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();

  // UI: sidebar não contém "Administração" nem "Gestão de DREs"
  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");
  await expect(page.locator(".ca-sidebar")).toBeVisible();
  await expect(page.getByText("Gestão de DREs e Acessos")).toHaveCount(0);
  await expect(page.getByText("Administração")).toHaveCount(0);
  await page.close();

  // API: admin-only endpoints retornam 403 para DRE
  const dres403 = await apiRaw(request, dreAToken!, "/v1/admin/dres");
  expect(dres403.status()).toBe(403);

  const users403 = await apiRaw(request, dreAToken!, "/v1/admin/users");
  expect(users403.status()).toBe(403);
});

// ── Teste 4: isolamento DRE_A vs DRE_B ───────────────────────────────────

test("4 — isolamento: DRE_B não aparece nos dados/filtros da DRE_A", async ({ request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();

  // DRE_A: filtros/opcoes contém apenas escolas da DRE A
  const optsA = await apiGet<FiltrosOpcoes>(request, dreAToken!, "/v1/admin/analytics/filtros/opcoes");
  expect(optsA.dres.length).toBe(1);
  expect(optsA.dres[0]).not.toBe(dreB().name);

  const escolasA = optsA.escolas.map((e) => e.nome_escola);
  expect(escolasA.some((n) => n.startsWith("Escola B"))).toBe(false);
  expect(escolasA.some((n) => n === "Escola A1" || n === "Escola A2" || n === "Escola A3" || n === "Escola Divergente")).toBe(true);

  // DRE_B: mesma validação invertida
  const optsB = await apiGet<FiltrosOpcoes>(request, dreBToken!, "/v1/admin/analytics/filtros/opcoes");
  expect(optsB.dres.length).toBe(1);
  expect(optsB.dres[0]).not.toBe(dreA().name);

  const escolasB = optsB.escolas.map((e) => e.nome_escola);
  expect(escolasB.some((n) => n.startsWith("Escola A") || n === "Escola Divergente")).toBe(false);
  expect(escolasB.some((n) => n === "Escola B1" || n === "Escola B2" || n === "Escola B3")).toBe(true);
});

// ── Teste 5: forging de query params ──────────────────────────────────────

test("5 — forging: query param ?dre=<DRE_B> é ignorado para DRE_A", async ({ request }) => {
  expect(dreAToken).toBeTruthy();

  // Filtros/opcoes com ?dre=DRE_B forjado — backend ignora e retorna dados da DRE_A
  const optsForged = await apiGet<FiltrosOpcoes>(
    request, dreAToken!,
    `/v1/admin/analytics/filtros/opcoes?dre=${encodeURIComponent(dreB().name)}`,
  );
  const escolasForged = optsForged.escolas.map((e) => e.nome_escola);
  expect(escolasForged.some((n) => n.startsWith("Escola B"))).toBe(false);

  // Census com ?dre=DRE_B forjado — backend retorna dados da DRE_A
  const censusForged = await apiRaw(
    request, dreAToken!,
    `/v1/admin/census?dre=${encodeURIComponent(dreB().name)}`,
  );
  expect(censusForged.ok()).toBeTruthy();
  const censusBody = (await censusForged.json()) as { data: { rows: Array<{ dre: string }> } };
  if (censusBody.data?.rows?.length) {
    const dreNames = censusBody.data.rows.map((r) => r.dre);
    expect(dreNames.some((n) => n === dreB().name)).toBe(false);
  }

  // Preenchimento por DRE com ?dre=DRE_B — backend retorna apenas a DRE_A
  const preenchForged = await apiRaw(
    request, dreAToken!,
    `/v1/admin/analytics/preenchimento/dre?dre=${encodeURIComponent(dreB().name)}`,
  );
  expect(preenchForged.ok()).toBeTruthy();
  const preenchBody = (await preenchForged.json()) as { data: Array<{ dre: string }> };
  if (Array.isArray(preenchBody.data) && preenchBody.data.length) {
    const dreNames = preenchBody.data.map((r) => r.dre);
    expect(dreNames.some((n) => n === dreB().name)).toBe(false);
  }
});

// ── Teste 6: divergência schools.dre vs dre_id canônico ──────────────────

test("6 — divergência legado: schools.dre != dre_id → autoriza por ID", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();
  expect(adminToken).toBeTruthy();

  // API: escola divergente (dre text = "DRE B", dre_id = DRE A) aparece para DRE_A.
  // The census API resolves dre from dres.nome via dre_id (canonical), so the
  // divergent school shows as "DRE A" in the response. We find it by school name.
  const censusA = await apiRaw(request, dreAToken!, "/v1/admin/census");
  expect(censusA.ok()).toBeTruthy();
  const bodyA = (await censusA.json()) as { data: { rows: Array<{ school_id: number; nome_escola: string }> } };
  const divergentRowA = bodyA.data?.rows?.find((r) => r.nome_escola === "Escola Divergente");
  expect(divergentRowA).toBeTruthy();

  // DRE_B não acessa a mesma escola (BOLA: 403)
  if (divergentRowA) {
    const bolaB = await apiRaw(request, dreBToken!, `/v1/admin/census/${divergentRowA.school_id}`);
    expect(bolaB.status()).toBe(403);
  }

  // UI: DRE_A vê a escola divergente nos registros do censo
  const page = await pageWithToken(browser, dreAToken!);
  await page.goto("/admin/");
  await page.getByText("Registros do Censo", { exact: false }).first().click();
  await expect(page.getByText("Exibindo", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("cell", { name: "Escola Divergente" })).toBeVisible({ timeout: 10_000 });
  await page.close();
});

// ── Teste 7: revogação remota (heartbeat sem F5) ─────────────────────────

test("7 — revogação remota: reset de senha → UI desloga sem F5", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreAUserId).toBeTruthy();
  expect(adminToken).toBeTruthy();

  // Login DRE_A via UI para ter sessão ativa com cache
  const dreACred = dreACredentials!;
  const page = await browser.newPage({ baseURL: webURL });
  const freshToken = await loginViaUI(page, dreACred.username, dreACred.password);
  expect(freshToken).toBeTruthy();
  await expect(page.locator(".ca-sidebar")).toBeVisible();

  // Admin reseta a senha do DRE_A via API
  const newPassword = await randomPassword();
  const resetRes = await apiRawPost(
    request, adminToken!, `/v1/admin/users/${dreAUserId}/reset-password`,
    { password: newPassword },
  );
  expect(resetRes.ok()).toBeTruthy();

  // Forçar revalidação de sessão via visibilitychange (simula retorno à aba)
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // UI deve deslogar: tela de login aparece, sidebar some
  await expect(page.locator("input[autocomplete='username']")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".ca-sidebar")).toHaveCount(0);

  // Token antigo é inválido
  const oldTokenCheck = await apiRaw(request, freshToken, "/v1/admin/me");
  expect(oldTokenCheck.status()).toBe(401);

  // Login com nova senha funciona
  const newToken = await loginViaAPIWithIP(request, dreACred.username, newPassword, TEST_NET_IPS[3]);
  expect(newToken).toBeTruthy();
  const meCheck = await apiGet<MeResponse>(request, newToken, "/v1/admin/me");
  expect(meCheck.role).toBe("dre");

  // Atualizar credenciais para os próximos testes
  dreAToken = newToken;
  dreACredentials = { username: dreACred.username, password: newPassword };

  await page.close();
});

// ── Teste 8: troca de conta DRE_A → DRE_B sem vazamento ──────────────────

test("8 — troca de conta: DRE_A → DRE_B sem vazamento de cache/estado", async ({ browser, request }) => {
  expect(dreAToken).toBeTruthy();
  expect(dreBToken).toBeTruthy();

  // Contexto A: DRE_A via token injetado
  const ctxA = await browser.newContext({ baseURL: webURL });
  await ctxA.addInitScript(
    ([key, tk]) => sessionStorage.setItem(key, tk),
    ["censo_admin_token", dreAToken!],
  );
  const pageA = await ctxA.newPage();
  await pageA.goto("/admin/");
  await expect(pageA.locator(".ca-sidebar")).toBeVisible();
  await expect(pageA.getByText(/Acesso restrito à DRE:/)).toBeVisible();
  const badgeA = await pageA.getByText(/Acesso restrito à DRE:/).textContent();
  expect(badgeA).toContain(dreA().name);
  await pageA.close();
  await ctxA.close();

  // Contexto B: DRE_B via token injetado
  const ctxB = await browser.newContext({ baseURL: webURL });
  await ctxB.addInitScript(
    ([key, tk]) => sessionStorage.setItem(key, tk),
    ["censo_admin_token", dreBToken!],
  );
  const pageB = await ctxB.newPage();
  await pageB.goto("/admin/");
  await expect(pageB.locator(".ca-sidebar")).toBeVisible();
  await expect(pageB.getByText(/Acesso restrito à DRE:/)).toBeVisible();
  const badgeB = await pageB.getByText(/Acesso restrito à DRE:/).textContent();
  expect(badgeB).toContain(dreB().name);
  expect(badgeB).not.toContain(dreA().name);

  // API: dados da DRE_B não contêm escolas da DRE_A
  const optsB = await apiGet<FiltrosOpcoes>(request, dreBToken!, "/v1/admin/analytics/filtros/opcoes");
  const escolasB = optsB.escolas.map((e) => e.nome_escola);
  expect(escolasB.some((n) => n.startsWith("Escola A") || n === "Escola Divergente")).toBe(false);

  await pageB.close();
  await ctxB.close();
});

// ── Cleanup ───────────────────────────────────────────────────────────────

test.afterAll(async () => {
  // Não há dados dinâmicos criados neste spec para limpar (DRE_A/B vêm do seed).
});
