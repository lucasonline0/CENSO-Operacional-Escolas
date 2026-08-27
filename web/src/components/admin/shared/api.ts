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

// Mutations invalidam o cache somente após sucesso. Assim, uma escrita que falha
// não descarta dados válidos nem força refetch desnecessário no dashboard.
async function apiMutation<T>(path: string, token: string, opts: RequestInit): Promise<T> {
  const data = await apiFetch<T>(path, token, opts);
  clearApiCache();
  return data;
}

export async function fetchAdminMe(token: string): Promise<AdminProfile> {
  return apiFetch<AdminProfile>("/v1/admin/me", token);
}

export async function fetchDREs(token: string): Promise<DREItem[]> {
  return apiFetch<DREItem[]>("/v1/admin/dres", token);
}

export async function createDRE(token: string, payload: Partial<DREItem>): Promise<DREItem> {
  return apiMutation<DREItem>("/v1/admin/dres", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDRE(token: string, id: number, payload: Partial<DREItem>): Promise<DREItem> {
  return apiMutation<DREItem>(`/v1/admin/dres/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminUsers(token: string): Promise<AdminUserItem[]> {
  return apiFetch<AdminUserItem[]>("/v1/admin/users", token);
}

export async function createAdminUser(
  token: string,
  payload: { username: string; password: string; role?: string; dre: string }
): Promise<AdminUserItem> {
  return apiMutation<AdminUserItem>("/v1/admin/users", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUserStatus(
  token: string,
  id: number,
  active: boolean
): Promise<AdminUserItem> {
  return apiMutation<AdminUserItem>(`/v1/admin/users/${id}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function resetAdminUserPassword(
  token: string,
  id: number,
  password: string
): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>(`/v1/admin/users/${id}/reset-password`, token, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
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
  "/v1/admin/analytics/perfil-alunos-resultados/ideb",
  "/v1/admin/analytics/filtros/opcoes",
];

export async function prefetchDashboard(token: string, role?: string): Promise<void> {
  const endpoints = role === "dre"
    ? DASHBOARD_ENDPOINTS.filter((ep) => !ep.includes("sheet-metrics"))
    : DASHBOARD_ENDPOINTS;

  const fetches = Promise.allSettled(endpoints.map((ep) => apiFetch(ep, token)));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
  await Promise.race([fetches, timeout]);
}

// ── Escrita: Gestão de DREs ─────────────────────────────────────────────────

// Compatibilidade com o payload legado do modal: mapeia os nomes amigáveis e
// reutiliza o caminho canônico de criação para manter uma única regra de cache.
export async function createDre(token: string, payload: DreCreatePayload): Promise<DreRecord> {
  return createDRE(token, {
    nome: payload.nome,
    sigla: payload.sigla,
    municipio_sede: payload.municipio_sede,
    polo: payload.polo,
    gestor_nome: payload.responsavel_nome,
    email: payload.responsavel_email,
    telefone: payload.responsavel_telefone,
  });
}

// ── Filtros e Labels ────────────────────────────────────────────────────────

import type { DashboardFilters, AdminProfile, DreCreatePayload, DreRecord, DREItem, AdminUserItem } from "./types";

export function buildFilterParams(filters?: DashboardFilters): string {
  if (!filters) return "";
  const p = new URLSearchParams();
  if (filters.ano) p.set("year", String(filters.ano));
  if (filters.regiao_integracao) p.set("regiao_integracao", filters.regiao_integracao);
  if (filters.dre) p.set("dre", filters.dre);
  if (filters.municipio) p.set("municipio", filters.municipio);
  if (filters.zona) p.set("zona", filters.zona);
  if (filters.school_id) p.set("school_id", String(filters.school_id));
  if (filters.codigo_inep) p.set("codigo_inep", filters.codigo_inep);
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
