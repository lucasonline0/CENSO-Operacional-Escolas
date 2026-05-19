"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Building2, CheckCircle2, FileText, RefreshCw, LogOut, Search,
  Eye, X, LayoutDashboard, Database, MapPinned, Lock, User as UserIcon,
  AlertCircle, Loader2, Copy, Download, Filter, CloudUpload, Clock,
  TrendingUp, Users, GraduationCap, BarChart2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DreDbStats { dre: string; total: number; completed: number; draft: number; }
interface CensusRow {
  census_id: number; school_id: number; nome_escola: string; codigo_inep: string;
  municipio: string; dre: string; year: number; status: string;
  updated_at: string; synced: boolean;
}
interface DashboardData {
  total_schools: number; completed_censuses: number; draft_censuses: number;
  pending_sync: number; by_dre: DreDbStats[]; recent: CensusRow[];
}
interface ZonaStat  { zona: string;  count: number; }
interface PorteStat { porte: string; count: number; alunos: number; }
interface DreSheetsStats { dre: string; escolas: number; alunos: number; salas: number; }
interface SheetMetrics {
  total_escolas: number; total_alunos: number; total_alunos_pcd: number;
  media_alunos_por_escola: number;
  por_zona: ZonaStat[]; por_porte: PorteStat[]; por_dre: DreSheetsStats[];
}
interface CensusFull extends CensusRow { data: unknown; created_at: string; }

// ─── Config ───────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "censo_admin_token";
const ZONA_COLORS: Record<string, string> = {
  "Urbana": "#1E5B8A", "Rural": "#F59E0B", "Ribeirinha": "#8B5CF6", "Não informado": "#94A3B8",
};
const PORTE_COLORS = ["#93C5FD","#60A5FA","#3B82F6","#2563EB","#1D4ED8","#1E40AF"];

// ─── Storage ──────────────────────────────────────────────────────────────────

const saveToken  = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch {} };
const loadToken  = (): string | null => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} };
const sanitize   = (s: string) => s.replace(/[\x00-\x1F\x7F]/g, "");

async function apiFetch<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
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

// ─── Brand ────────────────────────────────────────────────────────────────────

const C = {
  primary:      "#1E5B8A",
  primaryLight: "#CFE7F5",
  pageBg:       "#F0F6FB",
  success:      "#10B981",
  warning:      "#F59E0B",
  danger:       "#EF4444",
};

// ─── Donut SVG ────────────────────────────────────────────────────────────────

function Donut({
  segments,
  label,
  sub,
  size = 170,
}: {
  segments: { label: string; value: number; color: string }[];
  label?: string;
  sub?: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 38, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const len = total === 0 ? 0 : (seg.value / total) * circ;
    const arc = (
      <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none"
        stroke={seg.color} strokeWidth="15"
        strokeDasharray={`${len} ${circ - len}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`} />
    );
    offset += len;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EFF2F6" strokeWidth="15" />
        {arcs}
        {label !== undefined && (
          <>
            <text x="50" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1E293B">{label}</text>
            {sub && <text x="50" y="58" textAnchor="middle" fontSize="6.5" fill="#64748B">{sub}</text>}
          </>
        )}
      </svg>
      <ul className="w-full space-y-1.5">
        {segments.map((s) => {
          const pct = total === 0 ? 0 : ((s.value / total) * 100).toFixed(1);
          return (
            <li key={s.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {s.value.toLocaleString("pt-BR")}
                <span className="text-slate-400 font-normal ml-1 text-xs">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Horizontal bar ───────────────────────────────────────────────────────────

function HBarChart({
  rows,
  unit = "",
  color = C.primary,
}: {
  rows: { label: string; value: number }[];
  unit?: string;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2 w-full">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        return (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0 text-right text-slate-500 text-xs">{r.label}</span>
            <div className="flex-1 h-6 bg-slate-100 rounded relative overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-white mix-blend-luminosity">
                {r.value.toLocaleString("pt-BR")}{unit}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, Icon, tone, sub,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  tone: "blue" | "green" | "amber" | "orange" | "purple";
  sub?: string;
}) {
  const tones = {
    blue:   { bg: "bg-blue-50",   icon: "text-blue-700",   ring: "ring-blue-100" },
    green:  { bg: "bg-emerald-50",icon: "text-emerald-700",ring: "ring-emerald-100" },
    amber:  { bg: "bg-amber-50",  icon: "text-amber-700",  ring: "ring-amber-100" },
    orange: { bg: "bg-orange-50", icon: "text-orange-700", ring: "ring-orange-100" },
    purple: { bg: "bg-purple-50", icon: "text-purple-700", ring: "ring-purple-100" },
  };
  const t = tones[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${t.bg} ${t.icon} ring-1 ${t.ring}`}>
          <Icon size={21} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  return status === "completed" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 size={11} strokeWidth={2.5} /> Concluído
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <FileText size={11} strokeWidth={2.5} /> Rascunho
    </span>
  );
}

// ─── JSON modal ───────────────────────────────────────────────────────────────

function highlight(json: string): React.ReactNode[] {
  return json.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g).map((tok, i) => {
    if (!tok) return null;
    if (/^"/.test(tok)) return <span key={i} className={tok.endsWith(":") ? "text-sky-400 font-medium" : "text-emerald-400"}>{tok}</span>;
    if (/^(true|false)$/.test(tok)) return <span key={i} className="text-purple-400 font-medium">{tok}</span>;
    if (/^null$/.test(tok))          return <span key={i} className="text-slate-500">{tok}</span>;
    if (/^-?\d/.test(tok))           return <span key={i} className="text-orange-400">{tok}</span>;
    return <span key={i} className="text-slate-400">{tok}</span>;
  });
}

function JsonModal({ censusId, token, onClose }: { censusId: number; token: string; onClose: () => void }) {
  const [data, setData]     = useState<CensusFull | null>(null);
  const [err, setErr]       = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<CensusFull>(`/v1/admin/census/${censusId}`, token).then(setData).catch((e) => setErr((e as Error).message));
  }, [censusId, token]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const fmt = useMemo(() => (data ? JSON.stringify(data.data ?? {}, null, 2) : ""), [data]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(fmt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  const dl = () => {
    if (!data) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `censo_${data.codigo_inep}_${data.year}.json`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: C.primaryLight }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: C.primary }}>
              <Database size={19} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Resposta do Censo — JSON</h2>
              {data && <p className="text-xs text-slate-600">{data.nome_escola} · INEP {data.codigo_inep} · {data.year}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-black/10 flex items-center justify-center text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-900">
          {!data && !err && <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin mr-2" size={22} /> Carregando…</div>}
          {err   && <div className="flex items-center justify-center py-20 text-rose-400"><AlertCircle size={18} className="mr-2" />{err}</div>}
          {data  && <pre className="text-xs font-mono leading-relaxed p-5 whitespace-pre-wrap break-words">{highlight(fmt)}</pre>}
        </div>
        <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">{data ? `${fmt.length.toLocaleString("pt-BR")} chars` : ""}</span>
          <div className="flex gap-2">
            <button onClick={copy} disabled={!data} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 text-slate-700">
              <Copy size={13} /> {copied ? "Copiado!" : "Copiar"}
            </button>
            <button onClick={dl} disabled={!data} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: C.primary }}>
              <Download size={13} /> Baixar JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Census table ─────────────────────────────────────────────────────────────

function CensusTable({ rows, onView, formatDate }: { rows: CensusRow[]; onView: (id: number) => void; formatDate: (s: string) => string }) {
  if (!rows.length) return (
    <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center text-slate-400 text-sm shadow-sm">
      <Database size={28} className="mx-auto mb-2 opacity-40" /> Nenhum registro encontrado.
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
      <table className="w-full text-sm min-w-[880px]">
        <thead style={{ background: C.primary }} className="text-white">
          <tr>
            {["Escola","INEP","Município","DRE","Ano","Status","Planilha","Atualizado",""].map((h, i) => (
              <th key={i} className={`px-4 py-3 font-semibold ${i >= 4 ? "text-center" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.census_id} className={`border-t border-slate-100 ${i%2===0?"bg-white":"bg-slate-50/40"} hover:bg-blue-50/50 transition-colors`}>
              <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate" title={r.nome_escola}>{r.nome_escola}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.codigo_inep}</td>
              <td className="px-4 py-3 text-slate-600">{r.municipio}</td>
              <td className="px-4 py-3 text-slate-600 max-w-[130px] truncate" title={r.dre}>{r.dre}</td>
              <td className="px-4 py-3 text-center text-slate-600">{r.year}</td>
              <td className="px-4 py-3 text-center"><StatusPill status={r.status} /></td>
              <td className="px-4 py-3 text-center text-lg">
                {r.synced
                  ? <span className="inline-flex w-7 h-7 rounded-full bg-emerald-50 items-center justify-center text-emerald-600"><CheckCircle2 size={15}/></span>
                  : r.status === "completed"
                  ? <span className="inline-flex w-7 h-7 rounded-full bg-amber-50 items-center justify-center text-amber-500"><Clock size={15}/></span>
                  : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(r.updated_at)}</td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => onView(r.census_id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors">
                  <Eye size={12}/> Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 text-right px-4 py-2 border-t border-slate-100">{rows.length} registro(s)</p>
    </div>
  );
}

// ─── Perfil da Rede tab ───────────────────────────────────────────────────────

function PerfilDaRede({ token, onUnauth }: { token: string; onUnauth: () => void }) {
  const [metrics, setMetrics] = useState<SheetMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  useEffect(() => {
    apiFetch<SheetMetrics>("/v1/admin/sheet-metrics", token)
      .then(setMetrics)
      .catch((e) => {
        if ((e as Error).message === "UNAUTHORIZED") { onUnauth(); return; }
        setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [token, onUnauth]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} /> Lendo planilha…
    </div>
  );
  if (err) return (
    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
      <AlertCircle size={16} /> {err}
    </div>
  );
  if (!metrics) return null;

  const porteDonut = metrics.por_porte.map((p, i) => ({
    label: p.porte, value: p.count, color: PORTE_COLORS[i] ?? "#94A3B8",
  }));
  const zonaDonut = metrics.por_zona.map((z) => ({
    label: z.zona, value: z.count, color: ZONA_COLORS[z.zona] ?? "#94A3B8",
  }));
  const matriculasBar = metrics.por_porte.map((p) => ({ label: p.porte, value: p.alunos }));
  const dreBar = metrics.por_dre.slice(0, 15).map((d) => ({ label: d.dre, value: d.escolas }));

  return (
    <div className="space-y-6">
      {/* Stat cards — igual Looker Studio */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total de Escolas" value={metrics.total_escolas} Icon={Building2} tone="blue" sub="Censos concluídos" />
        <StatCard label="Total de Alunos" value={metrics.total_alunos} Icon={Users} tone="green" />
        <StatCard label="Média por Escola" value={metrics.media_alunos_por_escola.toLocaleString("pt-BR")} Icon={TrendingUp} tone="amber" sub="alunos/escola" />
        <StatCard label="Alunos PcD" value={metrics.total_alunos_pcd} Icon={GraduationCap} tone="purple" />
      </div>

      {/* Linha de donuts — Distribuição por Porte e por Zona */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <BarChart2 size={16} style={{ color: C.primary }} />
            Distribuição de Escolas por Porte
          </h3>
          <Donut
            segments={porteDonut}
            label={metrics.total_escolas.toLocaleString("pt-BR")}
            sub="escolas"
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <MapPinned size={16} style={{ color: C.primary }} />
            Distribuição de Escolas por Zona
          </h3>
          <Donut
            segments={zonaDonut}
            label={metrics.total_escolas.toLocaleString("pt-BR")}
            sub="escolas"
          />
        </div>
      </div>

      {/* Distribuição de Matrículas por Porte — bar chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
          <Users size={16} style={{ color: C.primary }} />
          Distribuição de Matrículas por Porte
        </h3>
        <HBarChart rows={matriculasBar} color={C.primary} />
      </div>

      {/* DRE bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
          <MapPinned size={16} style={{ color: C.primary }} />
          Escolas Concluídas por DRE (Top 15)
        </h3>
        <HBarChart rows={dreBar} color="#2563EB" />
      </div>

      {/* Tabela DRE detalhada */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2" style={{ background: C.primaryLight }}>
          <MapPinned size={16} style={{ color: C.primary }} />
          <h3 className="font-semibold text-slate-800 text-sm">Detalhamento por DRE</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["DRE","Escolas","Total de Alunos","Média Alunos/Escola","Salas de Aula"].map((h,i) => (
                  <th key={i} className={`px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide ${i===0?"text-left":"text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.por_dre.map((d, i) => {
                const media = d.escolas > 0 ? Math.round(d.alunos / d.escolas) : 0;
                return (
                  <tr key={d.dre} className={i%2===0?"bg-white":"bg-slate-50/50"}>
                    <td className="px-5 py-3 font-medium text-slate-800">{d.dre}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700 font-semibold">{d.escolas.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{d.alunos.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{media.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{d.salas.toLocaleString("pt-BR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (t: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [attempts, setAttempts] = useState(0);
  const blocked = attempts >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    setError(""); setLoading(true);
    const u = sanitize(username).slice(0, 64);
    const p = sanitize(password).slice(0, 128);
    if (!u || !p) { setError("Preencha usuário e senha."); setLoading(false); return; }
    try {
      const res  = await fetch(`${API}/v1/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
      const json = await res.json();
      if (!res.ok) { setAttempts((a) => a + 1); setError(json.message ?? "Credenciais inválidas."); return; }
      const token = (json.data as { token: string }).token;
      saveToken(token); onLogin(token);
    } catch { setError("Não foi possível conectar ao servidor."); }
    finally   { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #0F3A5C 100%)` }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-8 py-7 text-center" style={{ background: C.primaryLight }}>
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 text-white shadow-lg" style={{ background: C.primary }}>
            <Building2 size={30} strokeWidth={1.75} />
          </div>
          <h1 className="font-bold text-xl text-slate-800">CENSO Operacional das Escolas</h1>
          <p className="text-slate-600 text-sm mt-1">Painel Administrativo — SEDUC-PA · FADEP</p>
        </div>
        <form onSubmit={submit} className="px-8 py-7 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="u">Usuário</label>
            <div className="relative">
              <UserIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="u" type="text" autoComplete="username" maxLength={64} disabled={loading||blocked} value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" placeholder="Usuário" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="pw">Senha</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="pw" type="password" autoComplete="current-password" maxLength={128} disabled={loading||blocked} value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" placeholder="Senha" required />
            </div>
          </div>
          {error   && <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm"><AlertCircle size={15} className="shrink-0 mt-0.5" />{error}</div>}
          {blocked && <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm"><AlertCircle size={15} className="shrink-0 mt-0.5" />Muitas tentativas. Aguarde alguns minutos.</div>}
          <button type="submit" disabled={loading||blocked}
            className="w-full text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:opacity-90 transition-opacity"
            style={{ background: C.primary }}>
            {loading ? <><Loader2 size={15} className="animate-spin" />Autenticando…</> : "Entrar"}
          </button>
          <p className="text-center text-xs text-slate-400">Acesso restrito. Sessão expira em 2 horas.</p>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type Tab = "perfil" | "operacional" | "census" | "dre";

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [dbData,       setDbData]       = useState<DashboardData | null>(null);
  const [allCensus,    setAllCensus]    = useState<CensusRow[] | null>(null);
  const [tab,          setTab]          = useState<Tab>("perfil");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDre,    setFilterDre]    = useState("");
  const [search,       setSearch]       = useState("");
  const [err,          setErr]          = useState("");
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [viewId,       setViewId]       = useState<number | null>(null);

  const logout = useCallback(() => { clearToken(); onLogout(); }, [onLogout]);

  const loadDb = useCallback(async () => {
    try {
      setDbData(await apiFetch<DashboardData>("/v1/admin/dashboard", token));
    } catch (e) {
      if ((e as Error).message === "UNAUTHORIZED") { logout(); return; }
      setErr("Erro ao carregar painel operacional.");
    } finally { setLoading(false); }
  }, [token, logout]);

  const loadCensus = useCallback(async () => {
    const p = new URLSearchParams();
    if (filterStatus) p.set("status", filterStatus);
    if (filterDre)    p.set("dre", filterDre);
    try { setAllCensus(await apiFetch<CensusRow[]>(`/v1/admin/census?${p}`, token)); }
    catch (e) { if ((e as Error).message === "UNAUTHORIZED") logout(); }
  }, [token, filterStatus, filterDre, logout]);

  useEffect(() => { loadDb(); }, [loadDb]);
  useEffect(() => { if (tab === "census") loadCensus(); }, [tab, filterStatus, filterDre, loadCensus]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res  = await fetch(`${API}/v1/admin/sync-sheets`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      alert(json.message ?? "Sync concluído.");
      loadDb();
    } catch { alert("Erro ao sincronizar."); }
    finally { setSyncing(false); }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit" });

  const match = (r: CensusRow, q: string) => {
    const l = q.toLowerCase();
    return r.nome_escola.toLowerCase().includes(l) || r.codigo_inep.includes(l) ||
           r.municipio.toLowerCase().includes(l)   || r.dre.toLowerCase().includes(l);
  };

  const filteredRecent  = (dbData?.recent  ?? []).filter((r) => !search || match(r, search));
  const filteredCensus  = (allCensus       ?? []).filter((r) => !search || match(r, search));

  const tabs: { id: Tab; label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { id: "perfil",      label: "Dimensão e Perfil da Rede", Icon: BarChart2      },
    { id: "operacional", label: "Operacional",               Icon: LayoutDashboard },
    { id: "census",      label: "Todos os Censos",           Icon: Database       },
    { id: "dre",         label: "Por DRE",                   Icon: MapPinned      },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: C.pageBg }}>
      <Loader2 className="animate-spin" size={32} style={{ color: C.primary }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: C.pageBg }}>
      {/* Banner SEDUC */}
      <header className="shadow-sm sticky top-0 z-30" style={{ background: C.primaryLight }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: C.primary }}>
              <Building2 size={25} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-800 leading-tight">CENSO Operacional das Escolas</h1>
              <p className="text-xs text-slate-600">Painel Administrativo — SEDUC-PA · FADEP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSync} disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 shadow-sm hover:opacity-90 transition-opacity"
              style={{ background: C.primary }}>
              {syncing ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              {syncing ? "Sincronizando…" : "Sync Planilha"}
            </button>
            <button onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-colors">
              <LogOut size={15} /> Sair
            </button>
          </div>
        </div>
        {/* Tab nav — estilo Looker Studio */}
        <div className="max-w-7xl mx-auto px-6 pb-0 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setSearch(""); }}
                className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? "border-blue-800 text-blue-900 bg-white/40"
                    : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-white/20"
                }`}>
                <t.Icon size={15} strokeWidth={2} /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-7 space-y-6">
        {err && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {err}
          </div>
        )}

        {/* ── Perfil da Rede (Looker-style) ─────────────────────── */}
        {tab === "perfil" && (
          <PerfilDaRede token={token} onUnauth={logout} />
        )}

        {/* ── Operacional (DB stats + envios recentes) ───────────── */}
        {tab === "operacional" && dbData && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Escolas Cadastradas" value={dbData.total_schools}       Icon={Building2}    tone="blue"   />
              <StatCard label="Censos Concluídos"   value={dbData.completed_censuses}  Icon={CheckCircle2} tone="green"  />
              <StatCard label="Rascunhos"            value={dbData.draft_censuses}      Icon={FileText}     tone="amber"  />
              <StatCard label="Pendente na Planilha" value={dbData.pending_sync}        Icon={CloudUpload}  tone="orange" />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Envios Recentes</h2>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="search" placeholder="Buscar escola, INEP…" value={search}
                  onChange={(e) => setSearch(sanitize(e.target.value).slice(0,100))}
                  className="bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-64" />
              </div>
            </div>
            <CensusTable rows={filteredRecent} onView={setViewId} formatDate={fmtDate} />
          </div>
        )}

        {/* ── Todos os Censos ────────────────────────────────────── */}
        {tab === "census" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
              <Filter size={15} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Filtros:</span>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">Todos os status</option>
                <option value="completed">Concluído</option>
                <option value="draft">Rascunho</option>
              </select>
              <select value={filterDre} onChange={(e) => setFilterDre(e.target.value)}
                className="border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs">
                <option value="">Todas as DREs</option>
                {(dbData?.by_dre ?? []).map((d) => <option key={d.dre} value={d.dre}>{d.dre}</option>)}
              </select>
              <div className="relative ml-auto">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="search" placeholder="Buscar…" value={search}
                  onChange={(e) => setSearch(sanitize(e.target.value).slice(0,100))}
                  className="bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52" />
              </div>
            </div>
            {allCensus === null
              ? <div className="bg-white rounded-2xl py-14 text-center text-slate-400 text-sm border border-slate-200"><Loader2 className="animate-spin mx-auto mb-2" size={18} />Carregando…</div>
              : <CensusTable rows={filteredCensus} onView={setViewId} formatDate={fmtDate} />}
          </div>
        )}

        {/* ── Por DRE (DB) ───────────────────────────────────────── */}
        {tab === "dre" && dbData && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b flex items-center gap-2" style={{ background: C.primaryLight }}>
              <MapPinned size={16} style={{ color: C.primary }} />
              <h2 className="font-semibold text-slate-800 text-sm">Andamento por Diretoria Regional de Ensino</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["DRE","Total","Concluídos","Rascunhos","% Conclusão"].map((h, i) => (
                    <th key={i} className={`px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide ${i===0?"text-left":"text-center"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbData.by_dre.map((d, i) => {
                  const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
                  return (
                    <tr key={d.dre} className={i%2===0?"bg-white":"bg-slate-50/50"}>
                      <td className="px-5 py-3 font-medium text-slate-800">{d.dre}</td>
                      <td className="px-5 py-3 text-center text-slate-600 tabular-nums">{d.total}</td>
                      <td className="px-5 py-3 text-center text-emerald-700 font-semibold tabular-nums">{d.completed}</td>
                      <td className="px-5 py-3 text-center text-amber-600 tabular-nums">{d.draft}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.primary }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700 w-10 text-right tabular-nums">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="text-center py-5 text-xs text-slate-400 border-t border-slate-200 mt-6">
        CENSO Operacional — SEDUC-PA · Painel restrito a administradores autorizados
      </footer>

      {viewId !== null && <JsonModal censusId={viewId} token={token} onClose={() => setViewId(null)} />}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setToken(loadToken()); setReady(true); }, []);
  if (!ready) return null;
  if (!token) return <LoginForm onLogin={(t) => setToken(t)} />;
  return <Dashboard token={token} onLogout={() => setToken(null)} />;
}
