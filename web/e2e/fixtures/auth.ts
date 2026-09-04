import { type Page, type BrowserContext } from "@playwright/test";

const API_BASE = process.env.API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "censo_admin_token";

export interface LoginResult {
  token: string;
  profile: { username: string; role: string; dre: string | null; dre_id: number | null };
}

export async function loginViaAPI(
  username: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json() as { data?: { token: string }; message?: string };
  if (!res.ok || !json.data?.token) {
    throw new Error(`Login failed: ${json.message ?? res.status}`);
  }
  const token = json.data.token;

  const meRes = await fetch(`${API_BASE}/v1/admin/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meJson = await meRes.json() as { data: LoginResult["profile"] };
  if (!meRes.ok || !meJson.data) {
    throw new Error(`Fetch /me failed: ${meRes.status}`);
  }

  return { token, profile: meJson.data };
}

export async function injectToken(context: BrowserContext, token: string): Promise<void> {
  await context.addInitScript((t) => {
    sessionStorage.setItem("censo_admin_token", t);
  }, token);
}

export async function loginAsAdmin(context: BrowserContext, page: Page): Promise<LoginResult> {
  const username = process.env.ADMIN_USERNAME ?? "admin_local";
  const password = process.env.ADMIN_PASSWORD ?? "AdminLocal1234!";
  const result = await loginViaAPI(username, password);
  await injectToken(context, result.token);
  await page.goto("/admin");
  await page.waitForSelector(".censo-admin", { timeout: 30_000 });
  return result;
}

export async function loginAsDRE(
  context: BrowserContext,
  page: Page,
  username: string,
  password: string,
): Promise<LoginResult> {
  const result = await loginViaAPI(username, password);
  await injectToken(context, result.token);
  await page.goto("/admin");
  await page.waitForSelector(".censo-admin", { timeout: 30_000 });
  return result;
}

export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
      sessionStorage.removeItem("censo_admin_token");
    localStorage.clear();
  });
}

export async function getStoredToken(page: Page): Promise<string | null> {
  return page.evaluate(() => sessionStorage.getItem(TOKEN_KEY));
}
