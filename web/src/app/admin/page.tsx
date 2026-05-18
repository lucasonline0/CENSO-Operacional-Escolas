"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Building2,
  CheckCircle2,
  FileText,
  RefreshCw,
  LogOut,
  Search,
  Eye,
  X,
  LayoutDashboard,
  Database,
  MapPinned,
  Lock,
  User as UserIcon,
  AlertCircle,
  Loader2,
  Copy,
  Download,
  Filter,
  CloudUpload,
  Clock,
  TrendingUp,
} from "lucide-react";

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
interface CensusFull extends CensusRow {
  data: unknown;
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "censo_admin_token";

// ─── Storage helpers ──────────────────────────────────────────────────────────

const saveToken = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch {} };
const loadToken = (): string | null => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} };

function sanitizeInput(s: string): string {
  return s.replace(/[\x00-\x1F\x7F]/g, "");
}

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return (await res.json()).data as T;
}

// ─── Brand color tokens ───────────────────────────────────────────────────────

const C = {
  primary: "#1E5B8A",        // dark blue (banner/buttons)
  primaryHover: "#174A75",
  primaryLight: "#CFE7F5",   // light blue banner background
  accent: "#3B82F6",         // chart blue
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  pageBg: "#F5F8FB",
};

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({
  segments,
  size = 160,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 40;
  const cx = 50, cy = 50;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = total === 0 ? 0 : seg.value / total;
    const len = frac * circumference;
    const arc = (
      <circle
        key={seg.label}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={seg.color}
        strokeWidth="14"
        strokeDasharray={`${len} ${circumference - len}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += len;
    return arc;
  });

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEF2F6" strokeWidth="14" />
        {arcs}
        <text x="50" y="48" textAnchor="middle" className="fill-slate-800" fontSize="14" fontWeight="700">{total}</text>
        <text x="50" y="60" textAnchor="middle" className="fill-slate-400" fontSize="6">total</text>
      </svg>
      <ul className="space-y-2 text-sm">
        {segments.map((s) => {
          const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
          return (
            <li key={s.label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-slate-600">{s.label}</span>
              <span className="font-semibold text-slate-800">{s.value}</span>
              <span className="text-slate-400 text-xs">({pct}%)</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Horizontal bar chart ─────────────────────────────────────────────────────

function HBar({ rows }: { rows: { label: string; value: number; total: number }[] }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const completedPct = r.total === 0 ? 0 : (r.value / r.total) * 100;
        const totalPct = (r.total / max) * 100;
        return (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span className="w-32 truncate text-slate-700" title={r.label}>{r.label}</span>
            <div className="flex-1 h-6 bg-slate-100 rounded-md relative overflow-hidden">
              <div
                className="h-full absolute left-0 top-0 rounded-md"
                style={{ width: `${totalPct}%`, background: C.primaryLight }}
              />
              <div
                className="h-full absolute left-0 top-0 rounded-md transition-all"
                style={{ width: `${(r.value / max) * 100}%`, background: C.primary }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-slate-700">
                {r.value} / {r.total}
              </span>
            </div>
            <span className="w-12 text-right text-xs font-semibold text-slate-600">
              {Math.round(completedPct)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  Icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  tone: "primary" | "success" | "warning" | "danger";
  hint?: string;
}) {
  const tones: Record<string, { bg: string; text: string; ring: string }> = {
    primary: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-100" },
    success: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100" },
    warning: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-100" },
    danger:  { bg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-100" },
  };
  const t = tones[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">{value.toLocaleString("pt-BR")}</p>
          {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${t.bg} ${t.text} ring-1 ${t.ring}`}>
          <Icon size={22} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={12} strokeWidth={2.5} /> Concluído
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <FileText size={12} strokeWidth={2.5} /> Rascunho
    </span>
  );
}

// ─── JSON syntax highlighter ──────────────────────────────────────────────────

function highlightJson(json: string): React.ReactNode[] {
  const tokens = json.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g);
  return tokens.map((tok, i) => {
    if (!tok) return null;
    if (/^"/.test(tok)) {
      if (tok.endsWith(":")) {
        return <span key={i} className="text-blue-700 font-medium">{tok}</span>;
      }
      return <span key={i} className="text-emerald-700">{tok}</span>;
    }
    if (/^(true|false)$/.test(tok)) return <span key={i} className="text-purple-700 font-medium">{tok}</span>;
    if (/^null$/.test(tok)) return <span key={i} className="text-slate-400 font-medium">{tok}</span>;
    if (/^-?\d/.test(tok)) return <span key={i} className="text-orange-600">{tok}</span>;
    return <span key={i} className="text-slate-600">{tok}</span>;
  });
}

// ─── JSON Modal ───────────────────────────────────────────────────────────────

function JsonModal({
  censusId,
  token,
  onClose,
}: {
  censusId: number;
  token: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CensusFull | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<CensusFull>(`/v1/admin/census/${censusId}`, token)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [censusId, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const formatted = useMemo(() => (data ? JSON.stringify(data.data ?? {}, null, 2) : ""), [data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `censo_${data.codigo_inep}_${data.year}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: C.primaryLight }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: C.primary }}>
              <Database size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base">Resposta do Censo (JSON)</h2>
              {data && (
                <p className="text-xs text-slate-600">
                  {data.nome_escola} · INEP {data.codigo_inep} · {data.year}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-white/40 flex items-center justify-center text-slate-700 transition-colors"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-slate-900">
          {!data && !error && (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin" size={24} />
              <span className="ml-3 text-sm">Carregando…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-20 text-rose-400">
              <AlertCircle size={20} className="mr-2" /> {error}
            </div>
          )}
          {data && (
            <pre className="text-xs font-mono leading-relaxed p-5 text-slate-100 whitespace-pre-wrap break-words">
              {highlightJson(formatted)}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <p className="text-xs text-slate-500">
            {data ? `${formatted.length.toLocaleString("pt-BR")} caracteres` : ""}
          </p>
          <div className="flex gap-2">
            <button
              onClick={copy}
              disabled={!data}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 text-slate-700 transition-colors"
            >
              <Copy size={14} /> {copied ? "Copiado!" : "Copiar"}
            </button>
            <button
              onClick={download}
              disabled={!data}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ background: C.primary }}
            >
              <Download size={14} /> Baixar JSON
            </button>
          </div>
        </div>
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
    if (!u || !p) { setError("Preencha usuário e senha."); setLoading(false); return; }

    try {
      const res = await fetch(`${API}/v1/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAttempts((a) => a + 1);
        setError(json.message ?? "Credenciais inválidas.");
        return;
      }
      saveToken((json.data as { token: string }).token);
      onLogin((json.data as { token: string }).token);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #0F3A5C 100%)` }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-8 py-7 text-center" style={{ background: C.primaryLight }}>
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 text-white shadow-lg" style={{ background: C.primary }}>
            <Building2 size={32} strokeWidth={1.75} />
          </div>
          <h1 className="font-bold text-xl text-slate-800">CENSO Operacional</h1>
          <p className="text-slate-600 text-sm mt-1">Painel Administrativo — SEDUC-PA</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="admin-user">Usuário</label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="admin-user"
                type="text"
                autoComplete="username"
                maxLength={64}
                disabled={loading || blocked}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 transition-all"
                placeholder="Digite o usuário"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="admin-pw">Senha</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="admin-pw"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                disabled={loading || blocked}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 transition-all"
                placeholder="Digite a senha"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {blocked && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>Muitas tentativas. Aguarde alguns minutos.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || blocked}
            className="w-full text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
            style={{ background: loading || blocked ? "#94A3B8" : C.primary }}
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Autenticando…</> : "Entrar"}
          </button>

          <p className="text-center text-xs text-slate-400 pt-2">Acesso restrito. Sessão expira em 2 horas.</p>
        </form>
      </div>
    </div>
  );
}

// ─── Census table row ─────────────────────────────────────────────────────────

function CensusTable({
  rows,
  onView,
  formatDate,
}: {
  rows: CensusRow[];
  onView: (id: number) => void;
  formatDate: (s: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 text-sm shadow-sm">
        <Database size={32} className="mx-auto mb-2 opacity-40" />
        Nenhum registro encontrado.
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
      <table className="w-full text-sm min-w-[860px]">
        <thead style={{ background: C.primary }} className="text-white">
          <tr>
            <th className="text-left px-5 py-3 font-semibold">Escola</th>
            <th className="text-left px-4 py-3 font-semibold">INEP</th>
            <th className="text-left px-4 py-3 font-semibold">Município</th>
            <th className="text-left px-4 py-3 font-semibold">DRE</th>
            <th className="text-center px-4 py-3 font-semibold">Ano</th>
            <th className="text-center px-4 py-3 font-semibold">Status</th>
            <th className="text-center px-4 py-3 font-semibold">Planilha</th>
            <th className="text-left px-4 py-3 font-semibold">Atualizado</th>
            <th className="text-center px-4 py-3 font-semibold">JSON</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.census_id}
              className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/60 transition-colors`}
            >
              <td className="px-5 py-3 font-medium text-slate-800 max-w-[220px] truncate" title={r.nome_escola}>{r.nome_escola}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.codigo_inep}</td>
              <td className="px-4 py-3 text-slate-600">{r.municipio}</td>
              <td className="px-4 py-3 text-slate-600 max-w-[140px] truncate" title={r.dre}>{r.dre}</td>
              <td className="px-4 py-3 text-center text-slate-600">{r.year}</td>
              <td className="px-4 py-3 text-center"><StatusPill status={r.status} /></td>
              <td className="px-4 py-3 text-center">
                {r.synced ? (
                  <span className="inline-flex w-7 h-7 rounded-full bg-emerald-50 items-center justify-center text-emerald-600" title="Sincronizada">
                    <CheckCircle2 size={16} />
                  </span>
                ) : r.status === "completed" ? (
                  <span className="inline-flex w-7 h-7 rounded-full bg-amber-50 items-center justify-center text-amber-600" title="Pendente">
                    <Clock size={16} />
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(r.updated_at)}</td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => onView(r.census_id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                  title="Ver resposta em JSON"
                >
                  <Eye size={13} /> Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 text-right px-4 py-2 border-t border-slate-100">
        {rows.length} registro(s)
      </p>
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
  const [viewingId, setViewingId] = useState<number | null>(null);

  const logout = useCallback(() => { clearToken(); onLogout(); }, [onLogout]);

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
      setAllCensus(await apiFetch<CensusRow[]>(`/v1/admin/census?${params}`, token));
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") { logout(); return; }
      setError("Erro ao carregar lista de censos.");
    }
  }, [token, filterStatus, filterDre, logout]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === "census") loadCensus(); }, [tab, filterStatus, filterDre, loadCensus]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/v1/admin/sync-sheets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const matchSearch = (r: CensusRow, q: string) => {
    const l = q.toLowerCase();
    return r.nome_escola.toLowerCase().includes(l) ||
           r.codigo_inep.includes(l) ||
           r.municipio.toLowerCase().includes(l) ||
           r.dre.toLowerCase().includes(l);
  };

  const filteredRecent = (data?.recent ?? []).filter((r) => !search || matchSearch(r, search));
  const filteredCensus = (allCensus ?? []).filter((r) => !search || matchSearch(r, search));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.pageBg }}>
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-3" size={32} style={{ color: C.primary }} />
          <p className="text-slate-500 text-sm">Carregando painel…</p>
        </div>
      </div>
    );
  }

  const dreBars = (data?.by_dre ?? [])
    .slice()
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10)
    .map((d) => ({ label: d.dre, value: d.completed, total: d.total }));

  return (
    <div className="min-h-screen" style={{ background: C.pageBg }}>
      {/* ─── Top banner (SEDUC-style) ──────────────────────────────────────── */}
      <header className="shadow-sm" style={{ background: C.primaryLight }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md" style={{ background: C.primary }}>
              <Building2 size={26} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight text-slate-800">CENSO Operacional das Escolas</h1>
              <p className="text-xs text-slate-600">Painel Administrativo — SEDUC-PA · FADEP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
              style={{ background: C.primary }}
            >
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
              {syncing ? "Sincronizando…" : "Sync Planilha"}
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm hover:shadow-md"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Stats row */}
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total de Escolas" value={data.total_schools} Icon={Building2} tone="primary" />
            <StatCard label="Censos Concluídos" value={data.completed_censuses} Icon={CheckCircle2} tone="success" />
            <StatCard label="Rascunhos" value={data.draft_censuses} Icon={FileText} tone="warning" />
            <StatCard label="Pendente na Planilha" value={data.pending_sync} Icon={CloudUpload} tone="danger" />
          </div>
        )}

        {/* Tab nav */}
        <div className="bg-white rounded-2xl border border-slate-200 p-1.5 inline-flex shadow-sm gap-1">
          {[
            { id: "overview", label: "Visão Geral", Icon: LayoutDashboard },
            { id: "census",   label: "Todos os Censos", Icon: Database },
            { id: "dre",      label: "Por DRE", Icon: MapPinned },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id as typeof tab); setSearch(""); }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  active ? "text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                }`}
                style={active ? { background: C.primary } : undefined}
              >
                <t.Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Overview */}
        {tab === "overview" && data && (
          <div className="space-y-5">
            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={18} style={{ color: C.primary }} />
                  <h3 className="font-semibold text-slate-800">Distribuição de Censos por Status</h3>
                </div>
                <DonutChart
                  segments={[
                    { label: "Concluídos", value: data.completed_censuses, color: C.success },
                    { label: "Rascunhos", value: data.draft_censuses, color: C.warning },
                  ]}
                />
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <MapPinned size={18} style={{ color: C.primary }} />
                  <h3 className="font-semibold text-slate-800">Top 10 DREs — Conclusões</h3>
                </div>
                {dreBars.length > 0 ? (
                  <HBar rows={dreBars} />
                ) : (
                  <p className="text-sm text-slate-400 py-8 text-center">Sem dados disponíveis.</p>
                )}
              </div>
            </div>

            {/* Recent table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-800 text-lg">Envios Recentes</h2>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Buscar escola, INEP, município…"
                    value={search}
                    onChange={(e) => setSearch(sanitizeInput(e.target.value).slice(0, 100))}
                    className="bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-72"
                  />
                </div>
              </div>
              <CensusTable rows={filteredRecent} onView={setViewingId} formatDate={formatDate} />
            </div>
          </div>
        )}

        {/* All Census */}
        {tab === "census" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
              <Filter size={16} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Filtros:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Todos os status</option>
                <option value="completed">Concluído</option>
                <option value="draft">Rascunho</option>
              </select>
              <select
                value={filterDre}
                onChange={(e) => setFilterDre(e.target.value)}
                className="border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
              >
                <option value="">Todas as DREs</option>
                {(data?.by_dre ?? []).map((d) => (
                  <option key={d.dre} value={d.dre}>{d.dre}</option>
                ))}
              </select>
              <div className="relative ml-auto">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Buscar…"
                  value={search}
                  onChange={(e) => setSearch(sanitizeInput(e.target.value).slice(0, 100))}
                  className="bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
                />
              </div>
            </div>
            {allCensus === null ? (
              <div className="bg-white rounded-2xl py-16 text-center text-slate-400 text-sm border border-slate-200">
                <Loader2 className="animate-spin mx-auto mb-2" size={20} /> Carregando…
              </div>
            ) : (
              <CensusTable rows={filteredCensus} onView={setViewingId} formatDate={formatDate} />
            )}
          </div>
        )}

        {/* DRE */}
        {tab === "dre" && data && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2" style={{ background: C.primaryLight }}>
              <MapPinned size={18} style={{ color: C.primary }} />
              <h2 className="font-semibold text-slate-800">Resumo por Diretoria Regional de Ensino</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">DRE</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Total</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Concluídos</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Rascunhos</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide w-72">% Conclusão</th>
                </tr>
              </thead>
              <tbody>
                {data.by_dre.map((d, i) => {
                  const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
                  return (
                    <tr key={d.dre} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-6 py-3 font-medium text-slate-800">{d.dre}</td>
                      <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{d.total}</td>
                      <td className="px-4 py-3 text-center text-emerald-700 font-semibold tabular-nums">{d.completed}</td>
                      <td className="px-4 py-3 text-center text-amber-600 tabular-nums">{d.draft}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: C.primary }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700 w-10 text-right tabular-nums">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.by_dre.length === 0 && (
              <p className="text-center py-12 text-slate-400 text-sm">Nenhum dado disponível.</p>
            )}
          </div>
        )}
      </main>

      <footer className="text-center py-5 text-xs text-slate-400 mt-4">
        CENSO Operacional — SEDUC-PA · Painel restrito a administradores autorizados
      </footer>

      {viewingId !== null && (
        <JsonModal censusId={viewingId} token={token} onClose={() => setViewingId(null)} />
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(loadToken());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!token) return <LoginForm onLogin={(t) => setToken(t)} />;
  return <Dashboard token={token} onLogout={() => setToken(null)} />;
}
