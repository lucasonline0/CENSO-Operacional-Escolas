"use client";

import React, { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DreStats {
  dre: string;
  total: number;
  completed: number;
  draft: number;
}

interface CensusRow {
  census_id: number;
  school_id: number;
  nome_escola: string;
  codigo_inep: string;
  municipio: string;
  dre: string;
  year: number;
  status: string;
  updated_at: string;
  synced: boolean;
}

interface DashboardData {
  total_schools: number;
  completed_censuses: number;
  draft_censuses: number;
  pending_sync: number;
  by_dre: DreStats[];
  recent: CensusRow[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "censo_admin_token";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function saveToken(t: string) {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
}
function loadToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

function sanitizeInput(s: string): string {
  // Remove control characters before sending
  return s.replace(/[\x00-\x1F\x7F]/g, "");
}

async function apiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      // Custom header helps detect pre-flight on CORS-restricted APIs
      "X-Requested-With": "XMLHttpRequest",
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "completed"
      ? "bg-green-100 text-green-800 border border-green-300"
      : "bg-yellow-100 text-yellow-800 border border-yellow-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
      {status === "completed" ? "Concluído" : "Rascunho"}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  return (
    <div className={`rounded-xl border p-5 flex items-center gap-4 ${color}`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value.toLocaleString("pt-BR")}</p>
      </div>
    </div>
  );
}

// ─── Login form ───────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const blocked = attempts >= 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;

    setError("");
    setLoading(true);

    const u = sanitizeInput(username).slice(0, 64);
    const p = sanitizeInput(password).slice(0, 128);

    if (!u || !p) {
      setError("Preencha usuário e senha.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/v1/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ username: u, password: p }),
      });

      const json = await res.json();

      if (!res.ok) {
        setAttempts((a) => a + 1);
        setError(json.message ?? "Credenciais inválidas.");
        return;
      }

      const token: string = (json.data as { token: string }).token;
      saveToken(token);
      onLogin(token);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-blue-900 px-8 py-6 text-center">
          <div className="text-4xl mb-2">🏫</div>
          <h1 className="text-white font-bold text-xl">CENSO Operacional</h1>
          <p className="text-blue-200 text-sm mt-1">Painel Administrativo — SEDUC-PA</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5" noValidate>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="admin-user">
              Usuário
            </label>
            <input
              id="admin-user"
              type="text"
              autoComplete="username"
              maxLength={64}
              disabled={loading || blocked}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="Digite o usuário"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="admin-pw">
              Senha
            </label>
            <input
              id="admin-pw"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              disabled={loading || blocked}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="Digite a senha"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {blocked && (
            <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-4 py-3 text-sm">
              Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.
            </div>
          )}

          <button
            type="submit"
            disabled={loading || blocked}
            className="w-full bg-blue-800 hover:bg-blue-700 active:bg-blue-900 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Autenticando…" : "Entrar"}
          </button>

          <p className="text-center text-xs text-gray-400 mt-2">
            Acesso restrito. Sessão expira em 2 horas.
          </p>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [allCensus, setAllCensus] = useState<CensusRow[] | null>(null);
  const [tab, setTab] = useState<"overview" | "census" | "dre">("overview");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDre, setFilterDre] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const logout = useCallback(() => {
    clearToken();
    onLogout();
  }, [onLogout]);

  const loadDashboard = useCallback(async () => {
    try {
      const d = await apiFetch<DashboardData>("/v1/admin/dashboard", token);
      setData(d);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") { logout(); return; }
      setError("Erro ao carregar dados do painel.");
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  const loadCensus = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterDre) params.set("dre", filterDre);
    try {
      const rows = await apiFetch<CensusRow[]>(`/v1/admin/census?${params}`, token);
      setAllCensus(rows);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") { logout(); return; }
      setError("Erro ao carregar lista de censos.");
    }
  }, [token, filterStatus, filterDre, logout]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    if (tab === "census") loadCensus();
  }, [tab, filterStatus, filterDre, loadCensus]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/v1/admin/sync-sheets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await res.json();
      alert(json.message ?? "Sync concluído.");
      loadDashboard();
    } catch {
      alert("Erro ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const filteredRecent = (data?.recent ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.nome_escola.toLowerCase().includes(q) ||
      r.codigo_inep.includes(q) ||
      r.municipio.toLowerCase().includes(q) ||
      r.dre.toLowerCase().includes(q)
    );
  });

  const filteredCensus = (allCensus ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.nome_escola.toLowerCase().includes(q) ||
      r.codigo_inep.includes(q) ||
      r.municipio.toLowerCase().includes(q) ||
      r.dre.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Carregando painel…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏫</span>
          <div>
            <p className="font-bold text-lg leading-none">CENSO Operacional</p>
            <p className="text-blue-300 text-xs">Painel Administrativo — SEDUC-PA</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {syncing ? "Sincronizando…" : "🔄 Sync Planilha"}
          </button>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
            {error}
          </div>
        )}

        {/* Stat cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total de Escolas" value={data.total_schools} color="bg-white border-gray-200" icon="🏫" />
            <StatCard label="Censos Concluídos" value={data.completed_censuses} color="bg-green-50 border-green-200" icon="✅" />
            <StatCard label="Rascunhos" value={data.draft_censuses} color="bg-yellow-50 border-yellow-200" icon="📝" />
            <StatCard label="Pendente na Planilha" value={data.pending_sync} color="bg-orange-50 border-orange-200" icon="🔄" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-200 p-1 rounded-xl w-fit">
          {(["overview", "census", "dre"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(""); }}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-blue-900 shadow" : "text-gray-600 hover:text-gray-800"
              }`}
            >
              {t === "overview" ? "Visão Geral" : t === "census" ? "Todos os Censos" : "Por DRE"}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-lg">Envios Recentes</h2>
              <input
                type="search"
                placeholder="Buscar escola, INEP, município…"
                value={search}
                onChange={(e) => setSearch(sanitizeInput(e.target.value).slice(0, 100))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-64"
              />
            </div>
            <CensusTable rows={filteredRecent} formatDate={formatDate} />
          </section>
        )}

        {/* All census tab */}
        {tab === "census" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-gray-800 text-lg flex-1">Todos os Censos</h2>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Todos os status</option>
                <option value="completed">Concluído</option>
                <option value="draft">Rascunho</option>
              </select>
              <select
                value={filterDre}
                onChange={(e) => setFilterDre(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
              >
                <option value="">Todas as DREs</option>
                {(data?.by_dre ?? []).map((d) => (
                  <option key={d.dre} value={d.dre}>{d.dre}</option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Buscar…"
                value={search}
                onChange={(e) => setSearch(sanitizeInput(e.target.value).slice(0, 100))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
              />
            </div>
            {allCensus === null ? (
              <div className="text-center py-10 text-gray-400 text-sm">Carregando…</div>
            ) : (
              <CensusTable rows={filteredCensus} formatDate={formatDate} />
            )}
          </section>
        )}

        {/* DRE tab */}
        {tab === "dre" && data && (
          <section className="space-y-4">
            <h2 className="font-semibold text-gray-800 text-lg">Resumo por DRE</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-blue-900 text-white">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">DRE</th>
                    <th className="text-center px-4 py-3 font-semibold">Total</th>
                    <th className="text-center px-4 py-3 font-semibold">Concluídos</th>
                    <th className="text-center px-4 py-3 font-semibold">Rascunhos</th>
                    <th className="text-center px-4 py-3 font-semibold">% Conclusão</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_dre.map((d, i) => {
                    const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
                    return (
                      <tr key={d.dre} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-5 py-3 font-medium text-gray-800">{d.dre}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{d.total}</td>
                        <td className="px-4 py-3 text-center text-green-700 font-semibold">{d.completed}</td>
                        <td className="px-4 py-3 text-center text-yellow-600">{d.draft}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="flex-1 max-w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-gray-600 w-8">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.by_dre.length === 0 && (
                <p className="text-center py-8 text-gray-400 text-sm">Nenhum dado disponível.</p>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-400 mt-8 border-t border-gray-200">
        CENSO Operacional — SEDUC-PA · Painel restrito a administradores autorizados
      </footer>
    </div>
  );
}

// ─── Census Table (reused) ────────────────────────────────────────────────────

function CensusTable({
  rows,
  formatDate,
}: {
  rows: CensusRow[];
  formatDate: (s: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm shadow-sm">
        Nenhum registro encontrado.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
      <table className="w-full text-sm min-w-[780px]">
        <thead className="bg-blue-900 text-white">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Escola</th>
            <th className="text-left px-4 py-3 font-semibold">INEP</th>
            <th className="text-left px-4 py-3 font-semibold">Município</th>
            <th className="text-left px-4 py-3 font-semibold">DRE</th>
            <th className="text-center px-4 py-3 font-semibold">Ano</th>
            <th className="text-center px-4 py-3 font-semibold">Status</th>
            <th className="text-center px-4 py-3 font-semibold">Planilha</th>
            <th className="text-left px-4 py-3 font-semibold">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.census_id}
              className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 transition-colors`}
            >
              <td className="px-4 py-3 font-medium text-gray-800 max-w-[200px] truncate" title={r.nome_escola}>
                {r.nome_escola}
              </td>
              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.codigo_inep}</td>
              <td className="px-4 py-3 text-gray-600">{r.municipio}</td>
              <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate" title={r.dre}>{r.dre}</td>
              <td className="px-4 py-3 text-center text-gray-600">{r.year}</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
              <td className="px-4 py-3 text-center text-lg">
                {r.synced ? "✅" : r.status === "completed" ? "⏳" : "—"}
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(r.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 text-right px-4 py-2">{rows.length} registro(s)</p>
    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydrate from sessionStorage only on client
    const stored = loadToken();
    setToken(stored);
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!token) {
    return <LoginForm onLogin={(t) => setToken(t)} />;
  }

  return <Dashboard token={token} onLogout={() => setToken(null)} />;
}
