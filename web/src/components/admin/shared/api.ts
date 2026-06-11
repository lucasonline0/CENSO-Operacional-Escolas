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

export function getCached<T>(path: string): T | null {
  const entry = apiCache.get(path);
  if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  return null;
}

export function allCached(paths: string[]): boolean {
  const now = Date.now();
  return paths.every((p) => {
    const e = apiCache.get(p);
    return e !== undefined && e.expiresAt > now;
  });
}

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
  "/v1/admin/analytics/caracterizacao/infraestrutura-educacional",
  "/v1/admin/sheet-metrics",
  "/v1/admin/analytics/pessoal-gestao/estrutura",
  "/v1/admin/analytics/pessoal-gestao/coordenacao",
  "/v1/admin/analytics/pessoal-gestao/quadro-pessoal",
  "/v1/admin/analytics/tecnologia/infraestrutura",
  "/v1/admin/analytics/tecnologia/uso-pedagogico",
  "/v1/admin/analytics/infraestrutura/condicoes",
  "/v1/admin/analytics/infraestrutura/seguranca",
  "/v1/admin/analytics/infraestrutura/energia",
  "/v1/admin/analytics/merenda/oferta",
  "/v1/admin/analytics/merenda/equipamentos",
  "/v1/admin/analytics/merenda/recursos-humanos",
  "/v1/admin/analytics/merenda/condicoes-sanitarias",
  "/v1/admin/analytics/servicos-terceirizados/visao-geral",
  "/v1/admin/analytics/servicos-terceirizados/servicos-gerais",
  "/v1/admin/analytics/servicos-terceirizados/portaria",
  "/v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos",
  "/v1/admin/indicadores-metrics",
  "/v1/admin/analytics/filtros/opcoes",
];

export async function prefetchDashboard(token: string): Promise<void> {
  const fetches = Promise.allSettled(DASHBOARD_ENDPOINTS.map((ep) => apiFetch(ep, token)));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
  await Promise.race([fetches, timeout]);
}

// ── Filtros e Labels ────────────────────────────────────────────────────────

import type { DashboardFilters } from "./types";

export function buildFilterParams(filters?: DashboardFilters): string {
  if (!filters) return "";
  const p = new URLSearchParams();
  if (filters.ano) p.set("year", String(filters.ano));
  if (filters.regiao_integracao) p.set("regiao_integracao", filters.regiao_integracao);
  if (filters.dre) p.set("dre", filters.dre);
  if (filters.municipio) p.set("municipio", filters.municipio);
  if (filters.zona) p.set("zona", filters.zona);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function buildPostgresSourceLabel(filters?: DashboardFilters): string {
  const base = "PostgreSQL · ano corrente · censos concluídos";
  if (!filters) return base;

  const parts: string[] = [];
  if (filters.regiao_integracao) parts.push(filters.regiao_integracao);
  if (filters.dre) parts.push(filters.dre);
  if (filters.municipio) parts.push(filters.municipio);
  if (filters.zona) parts.push(filters.zona);

  if (parts.length === 0) return base;
  return `${base} (${parts.join(" · ")})`;
}
