// Helpers HTTP + storage do token admin.
// Extraídos de web/src/app/admin/page.tsx no PR de refactor estrutural —
// nenhum comportamento alterado.

import { API, TOKEN_KEY } from "./constants";
import { sanitizeLegacyDrePayload } from "./legacyDreFilter";

export const saveToken  = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch {} };
export const loadToken  = (): string | null => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} };
export const sanitize   = (s: string) => s.replace(/[\x00-\x1F\x7F]/g, "");

// Cache em memória para requisições GET — evita re-fetch ao trocar de aba.
// O cache é NAMESPACED pelo token: dados de uma sessão/conta nunca são
// reutilizados por outra identidade. Troca de token => namespace novo.
interface CacheEntry { data: unknown; expiresAt: number }
const apiCache = new Map<string, Map<string, CacheEntry>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function namespaceFor(token: string): Map<string, CacheEntry> {
  let ns = apiCache.get(token);
  if (!ns) {
    ns = new Map();
    apiCache.set(token, ns);
  }
  return ns;
}

export function clearApiCache() { apiCache.clear(); }

export function getCached<T>(path: string, token: string): T | null {
  const ns = apiCache.get(token);
  if (!ns) return null;
  const entry = ns.get(path);
  if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  return null;
}

export function allCached(paths: string[], token: string): boolean {
  const now = Date.now();
  const ns = apiCache.get(token);
  return paths.every((p) => {
    const e = ns?.get(p);
    return e !== undefined && e.expiresAt > now;
  });
}

export interface ApiFetchOptions extends RequestInit {
  // Quando true, ignora o cache em memória e força uma requisição à rede.
  // Usado para revalidação de sessão (/admin/me) e leituras que precisam do
  // estado mais recente do backend.
  bypassCache?: boolean;
}

// Handler global de 401: permite ao dashboard limpar token, cache e estado
// sensível SEM depender de window.location.reload(). Qualquer chamada 401
// dispara o logout imediato a partir de qualquer componente.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(h: (() => void) | null) { unauthorizedHandler = h; }

export async function apiFetch<T>(path: string, token: string, opts?: ApiFetchOptions): Promise<T> {
  const isGet = !opts?.method || opts.method.toUpperCase() === "GET";
  const useCache = isGet && !opts?.bypassCache;

  if (useCache) {
    const ns = apiCache.get(token);
    const cached = ns?.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;
  }

  const fetchOpts = { ...(opts ?? {}) } as ApiFetchOptions;
  delete fetchOpts.bypassCache;

  const res = await fetch(`${API}${path}`, {
    ...fetchOpts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(fetchOpts.headers ?? {}) },
  });
  if (res.status === 401) {
    clearApiCache();
    clearToken();
    unauthorizedHandler?.();
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  const rawData = (await res.json()).data as T;
  const data = sanitizeLegacyDrePayload(path, rawData);
  if (useCache) namespaceFor(token).set(path, { data, expiresAt: Date.now() + CACHE_TTL });
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

// Heartbeat de sessão: consulta /admin/me FORA do cache, na rede, para que
// revogação remota (reset de senha, usuário inativo, DRE inativa) resulte em
// 401 imediato — nunca dados cacheados apresentados como sessão válida.
export async function fetchAdminMeFresh(token: string): Promise<AdminProfile> {
  return apiFetch<AdminProfile>("/v1/admin/me", token, { bypassCache: true });
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

export type AdminUserCreatePayload =
  | { username: string; email: string; password: string; role: "dre"; dre_id: number }
  | {
      username: string;
      email: string;
      password: string;
      role: "custom";
      permissions: AdminPermission[];
      data_scope: "all" | "selected";
      dre_ids: number[];
    };

export async function createAdminUser(
  token: string,
  payload: AdminUserCreatePayload
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
  return apiMutation<{ message?: string }>(`/v1/admin/users/${id}/reset-password`, token, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function deleteAdminUser(token: string, id: number): Promise<void> {
  await apiMutation(`/v1/admin/users/${id}`, token, { method: "DELETE" });
}

export async function deleteDRE(token: string, id: number): Promise<void> {
  await apiMutation(`/v1/admin/dres/${id}`, token, { method: "DELETE" });
}

export async function changeOwnPassword(
  token: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ token: string; expires_in: number }> {
  return apiMutation<{ token: string; expires_in: number }>("/v1/admin/me/change-password", token, {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
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

const ADMIN_ONLY_PREFETCH_ENDPOINTS = new Set([
  "/v1/admin/sheet-metrics",
  "/v1/admin/indicadores-metrics",
]);

export function dashboardEndpointsForRole(role?: string): string[] {
  if (role === "admin") return [...DASHBOARD_ENDPOINTS];
  return DASHBOARD_ENDPOINTS.filter((ep) => !ADMIN_ONLY_PREFETCH_ENDPOINTS.has(ep));
}

function profileHasPermission(profile: AdminProfile, permission: AdminPermission): boolean {
  return profile.role === "admin" || profile.permissions.includes(permission);
}

export function dashboardEndpointsForProfile(profile?: AdminProfile): string[] {
  if (!profile) return [];
  return DASHBOARD_ENDPOINTS.filter((ep) => {
    if (ep.startsWith("/v1/admin/census")) return profileHasPermission(profile, "census.read");
    if (
      ep.startsWith("/v1/admin/analytics/") ||
      ep === "/v1/admin/dashboard" ||
      ep === "/v1/admin/sheet-metrics" ||
      ep === "/v1/admin/indicadores-metrics"
    ) return profileHasPermission(profile, "analytics.read");
    return false;
  });
}

export async function prefetchDashboard(token: string, profile?: AdminProfile | string): Promise<void> {
  const endpoints = typeof profile === "string"
    ? dashboardEndpointsForRole(profile)
    : dashboardEndpointsForProfile(profile);

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

import type { DashboardFilters, AdminProfile, AdminPermission, DreCreatePayload, DreRecord, DREItem, AdminUserItem } from "./types";

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

export interface DREBootstrapPreview {
  active: number; provisioned: number; pending: number; ignored_e2e: number; errors: number;
  items: Array<{ dre_id: number; dre: string; email: string; username: string; status: string; message?: string }>;
}
export interface DREBootstrapResult { preview: DREBootstrapPreview; credentials: Array<{ dre: string; email: string; username: string; temporary_password: string }> }
export async function previewDREBootstrap(token: string): Promise<DREBootstrapPreview> { return apiFetch("/v1/admin/users/bulk-dre-bootstrap/preview", token, { bypassCache: true }); }
export async function executeDREBootstrap(token: string): Promise<DREBootstrapResult> { return apiMutation("/v1/admin/users/bulk-dre-bootstrap", token, { method: "POST" }); }
