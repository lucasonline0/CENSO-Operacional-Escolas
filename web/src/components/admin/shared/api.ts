// Helpers HTTP + storage do token admin.
// Extraídos de web/src/app/admin/page.tsx no PR de refactor estrutural —
// nenhum comportamento alterado.

import { API, TOKEN_KEY } from "./constants";

export const saveToken  = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch {} };
export const loadToken  = (): string | null => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} };
export const sanitize   = (s: string) => s.replace(/[\x00-\x1F\x7F]/g, "");

export async function apiFetch<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return (await res.json()).data as T;
}
