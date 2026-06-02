// Helpers HTTP + storage do token admin.
// Extraídos de web/src/app/admin/page.tsx no PR de refactor estrutural —
// nenhum comportamento alterado.

import { API, TOKEN_KEY } from "./constants";

export const saveToken  = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch {} };
export const loadToken  = (): string | null => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} };
export const sanitize   = (s: string) => s.replace(/[\x00-\x1F\x7F]/g, "");

// Cache em memória para requisições GET — evita re-fetch ao trocar de aba.
interface CacheEntry { data: unknown; expiresAt: number }
const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function clearApiCache() { apiCache.clear(); }

export async function apiFetch<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const isGet = !opts?.method || opts.method.toUpperCase() === "GET";

  if (isGet) {
    const cached = apiCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;
  }

  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()).data as T;
  if (isGet) apiCache.set(path, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

// Dispara todos os endpoints do dashboard em paralelo e armazena no cache.
// Chamado durante o login para que as abas abram instantaneamente.
const DASHBOARD_ENDPOINTS = [
  "/v1/admin/dashboard",
  "/v1/admin/census?limit=10&page=1",
  "/v1/admin/analytics/caracterizacao/perfil",
  "/v1/admin/analytics/caracterizacao/dre",
  "/v1/admin/analytics/caracterizacao/oferta-funcionamento",
  "/v1/admin/sheet-metrics",
  "/v1/admin/analytics/pessoal-gestao/estrutura",
  "/v1/admin/analytics/pessoal-gestao/coordenacao",
  "/v1/admin/analytics/pessoal-gestao/quadro-pessoal",
  "/v1/admin/analytics/tecnologia/infraestrutura",
  "/v1/admin/analytics/tecnologia/uso-pedagogico",
  "/v1/admin/analytics/infraestrutura/condicoes",
  "/v1/admin/analytics/infraestrutura/seguranca",
  "/v1/admin/analytics/merenda/oferta",
  "/v1/admin/analytics/merenda/equipamentos",
  "/v1/admin/analytics/merenda/recursos-humanos",
  "/v1/admin/analytics/servicos-terceirizados/visao-geral",
  "/v1/admin/analytics/servicos-terceirizados/servicos-gerais",
  "/v1/admin/analytics/servicos-terceirizados/portaria",
  "/v1/admin/indicadores-metrics",
];

export async function prefetchDashboard(token: string): Promise<void> {
  const fetches = Promise.allSettled(DASHBOARD_ENDPOINTS.map((ep) => apiFetch(ep, token)));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
  await Promise.race([fetches, timeout]);
}
