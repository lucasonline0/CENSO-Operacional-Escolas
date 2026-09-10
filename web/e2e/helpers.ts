import { Page, APIRequestContext, expect } from "@playwright/test";

// Helpers da suíte E2E de Perfil DRE (stack real). Nenhum mock é usado:
// tokens legítimos vêm do login real e as requisições batem na API Go real.

// Mesma chave usada pelo frontend (web/src/components/admin/shared/constants.ts).
const TOKEN_KEY = "censo_admin_token";

export const webURL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
export const apiURL = process.env.E2E_API_URL ?? "http://localhost:8000";

export const adminCredentials = () => ({
  username: reqEnv("E2E_ADMIN_USERNAME"),
  password: reqEnv("E2E_ADMIN_PASSWORD"),
});

export const dreA = () => ({
  name: reqEnv("E2E_DRE_A_NAME"),
  username: reqEnv("E2E_DRE_A_USERNAME"),
  password: reqEnv("E2E_DRE_A_PASSWORD"),
});

export const dreB = () => ({
  name: reqEnv("E2E_DRE_B_NAME"),
  username: reqEnv("E2E_DRE_B_USERNAME"),
  password: reqEnv("E2E_DRE_B_PASSWORD"),
});

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`E2E: variável de ambiente ${name} é obrigatória`);
  return v;
}

// Login real pela UI (formulário /admin). Retorna o token gravado na sessão.
export async function loginViaUI(page: Page, username: string, password: string): Promise<string> {
  await page.goto("/admin/");
  await expect(page.locator("input[autocomplete='username']")).toBeVisible();
  await page.locator("input[autocomplete='username']").fill(username);
  await page.locator("input[autocomplete='current-password']").fill(password);
  await page.locator("button.login__button[type='submit']").click();

  // O shell do painel (.ca-sidebar) aparece após o login real autenticar
  // e o dashboard montar.
  await expect(page.locator(".ca-sidebar")).toBeVisible();

  const token = await page.evaluate((key) => sessionStorage.getItem(key), TOKEN_KEY);
  if (!token) throw new Error("E2E: sessão do frontend não contém token após login real");
  return token;
}

// Cria um context do navegador com o token real já presente no sessionStorage,
// como se o usuário tivesse logado — sem refazer login (economiza rate limit).
export async function pageWithToken(browser: import("@playwright/test").Browser, token: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: webURL });
  await context.addInitScript(([key, tk]) => sessionStorage.setItem(key, tk), [TOKEN_KEY, token]);
  return context.newPage();
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// GET na API real desembrulhando o envelope { data } — mesmo contrato do frontend.
export async function apiGet<T = unknown>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const res = await request.get(`${apiURL}${path}`, { headers: bearer(token) });
  if (!res.ok()) {
    throw new Error(`E2E: GET ${path} falhou (HTTP ${res.status()})`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

// Resposta crua — usada para validar códigos de erro/negação.
export function apiRaw(request: APIRequestContext, token: string, path: string) {
  return request.get(`${apiURL}${path}`, { headers: bearer(token) });
}

export function apiRawPost(request: APIRequestContext, token: string, path: string, data?: unknown) {
  return request.post(`${apiURL}${path}`, {
    headers: bearer(token),
    data: data === undefined ? undefined : JSON.stringify(data),
  });
}

export function apiRawPut(request: APIRequestContext, token: string, path: string, data?: unknown) {
  return request.put(`${apiURL}${path}`, {
    headers: bearer(token),
    data: data === undefined ? undefined : JSON.stringify(data),
  });
}

export function apiRawPatch(request: APIRequestContext, token: string, path: string, data?: unknown) {
  return request.patch(`${apiURL}${path}`, {
    headers: bearer(token),
    data: data === undefined ? undefined : JSON.stringify(data),
  });
}

// Login direto via API (POST /v1/admin/login) — não renderiza UI, economiza
// tempo e é ideal para reautenticação controlada dentro dos testes.
export async function loginViaAPI(
  request: APIRequestContext, username: string, password: string,
): Promise<string> {
  const res = await request.post(`${apiURL}/v1/admin/login`, {
    data: JSON.stringify({ username, password }),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(`E2E: login via API falhou (HTTP ${res.status()})`);
  }
  const body = (await res.json()) as { data: { token: string } };
  return body.data.token;
}

export async function randomPassword(): Promise<string> {
  const { webcrypto } = await import("node:crypto");
  const bytes = webcrypto.getRandomValues(new Uint8Array(18));
  return `e2e-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}