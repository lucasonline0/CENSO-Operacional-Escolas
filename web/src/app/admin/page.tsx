"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Building2, LogOut,
  LayoutDashboard, Database, MapPinned, Lock, User as UserIcon,
  AlertCircle, Loader2, CloudUpload,
  TrendingUp, Users, GraduationCap, BarChart2, Activity, AlertTriangle,
} from "lucide-react";

import {
  API, C, ZONA_COLORS, PORTE_COLORS,
} from "@/components/admin/shared/constants";
import {
  apiFetch, saveToken, loadToken, clearToken, sanitize,
} from "@/components/admin/shared/api";
import { StatCard } from "@/components/admin/shared/StatCard";
import { JsonModal } from "@/components/admin/shared/JsonModal";
import { Donut } from "@/components/admin/shared/Donut";
import { HBarChart, VBarChart } from "@/components/admin/shared/BarChart";
import { AbaOperacional } from "@/components/admin/AbaOperacional";
import { AbaTodosCensos } from "@/components/admin/AbaTodosCensos";
import { AbaPorDre } from "@/components/admin/AbaPorDre";
import type {
  CensusRow, DashboardData, SheetMetrics, IndicadoresMetrics,
  CaracterizacaoPerfilPg, CaracterizacaoDREPg,
} from "@/components/admin/shared/types";

// ─── Perfil da Rede tab ───────────────────────────────────────────────────────

function PerfilDaRede({ token, onUnauth }: { token: string; onUnauth: () => void }) {
  // Fase 2B.1: a aba "Caracterização da Rede" passa a consumir PostgreSQL via
  // /v1/admin/analytics/caracterizacao/perfil e /caracterizacao/dre. Os dados
  // legados de /v1/admin/sheet-metrics continuam carregados em paralelo como
  // fallback para qualquer parte cujo endpoint analítico falhe.
  const [perfilPg, setPerfilPg] = useState<CaracterizacaoPerfilPg | null>(null);
  const [drePg,    setDrePg]    = useState<CaracterizacaoDREPg | null>(null);
  const [metrics,  setMetrics]  = useState<SheetMetrics | null>(null);
  const [perfilErr, setPerfilErr] = useState("");
  const [dreErr,    setDreErr]    = useState("");
  const [sheetErr,  setSheetErr]  = useState("");
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pPerfil = apiFetch<CaracterizacaoPerfilPg>("/v1/admin/analytics/caracterizacao/perfil", token)
      .then((d) => { if (!cancelled) setPerfilPg(d); })
      .catch(handleErr(setPerfilErr));

    const pDre = apiFetch<CaracterizacaoDREPg>("/v1/admin/analytics/caracterizacao/dre", token)
      .then((d) => { if (!cancelled) setDrePg(d); })
      .catch(handleErr(setDreErr));

    const pSheet = apiFetch<SheetMetrics>("/v1/admin/sheet-metrics", token)
      .then((m) => { if (!cancelled) setMetrics(m); })
      .catch(handleErr(setSheetErr));

    Promise.all([pPerfil, pDre, pSheet]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, onUnauth]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} /> Carregando indicadores…
    </div>
  );

  // Cenário catastrófico: PG falhou nas duas pontas e a planilha também.
  // Sem dados nenhuma fonte → erro fatal.
  if (!perfilPg && !drePg && !metrics) {
    const msg = sheetErr || perfilErr || dreErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} /> {msg}
      </div>
    );
  }

  // ── Resolução KPI/donuts/matrículas: prefere PG; fallback p/ sheet-metrics.
  const usePerfilPg = perfilPg !== null;

  const safePorPorteSheet = metrics?.por_porte ?? [];
  const safePorZonaSheet  = metrics?.por_zona  ?? [];

  // Total de escolas exibido nos cards e no centro dos donuts.
  const totalEscolas = usePerfilPg
    ? perfilPg!.kpis.total_escolas
    : (metrics?.total_escolas ?? 0);

  // total_alunos pode vir fracionário do PG (cf. validacao-fase-2.md, "Observações").
  // Arredondamos só para apresentação; o dado bruto não é corrigido aqui.
  const totalAlunos = usePerfilPg
    ? Math.round(perfilPg!.kpis.total_alunos)
    : (metrics?.total_alunos ?? 0);

  const mediaAlunos = usePerfilPg
    ? Number(perfilPg!.kpis.media_alunos_por_escola.toFixed(1)).toLocaleString("pt-BR")
    : (metrics?.media_alunos_por_escola.toLocaleString("pt-BR") ?? "0");

  const totalAlunosPcd = usePerfilPg
    ? Math.round(perfilPg!.kpis.alunos_pcd)
    : (metrics?.total_alunos_pcd ?? 0);

  const porteDonut = usePerfilPg
    ? perfilPg!.por_porte.map((p, i) => ({
        label: p.porte, value: p.escolas, color: PORTE_COLORS[i] ?? "#94A3B8",
      }))
    : safePorPorteSheet.map((p, i) => ({
        label: p.porte, value: p.count, color: PORTE_COLORS[i] ?? "#94A3B8",
      }));

  const zonaDonut = usePerfilPg
    ? perfilPg!.por_zona.map((z) => ({
        label: z.zona, value: z.escolas, color: ZONA_COLORS[z.zona] ?? "#94A3B8",
      }))
    : safePorZonaSheet.map((z) => ({
        label: z.zona, value: z.count, color: ZONA_COLORS[z.zona] ?? "#94A3B8",
      }));

  const matriculasBar = usePerfilPg
    ? perfilPg!.matriculas_por_porte.map((m) => ({
        label: m.porte, value: Math.round(m.total_alunos),
      }))
    : safePorPorteSheet.map((p) => ({ label: p.porte, value: p.alunos }));

  // ── Resolução DRE (bar + tabela): prefere PG; fallback p/ sheet-metrics.
  const useDrePg = drePg !== null;
  const safePorDreSheet = metrics?.por_dre ?? [];

  const dreBar = useDrePg
    ? drePg!.top_dres.slice(0, 15).map((d) => ({ label: d.dre, value: d.escolas }))
    : safePorDreSheet.slice(0, 15).map((d) => ({ label: d.dre, value: d.escolas }));

  type DreRow = { dre: string; escolas: number; alunos: number; salas: number; media: number };
  const dreTable: DreRow[] = useDrePg
    ? drePg!.detalhamento.map((d) => ({
        dre:     d.dre,
        escolas: d.escolas,
        alunos:  Math.round(d.total_alunos),
        salas:   Math.round(d.salas_aula),
        media:   Math.round(d.media_alunos_por_escola),
      }))
    : safePorDreSheet.map((d) => ({
        dre:     d.dre,
        escolas: d.escolas,
        alunos:  d.alunos,
        salas:   d.salas,
        media:   d.escolas > 0 ? Math.round(d.alunos / d.escolas) : 0,
      }));

  // Fonte global da aba (informativa). PG total = perfil + dre; qualquer
  // falha vira "Sheets fallback (parcial)" para deixar claro ao operador
  // que parte da aba está lendo do legado.
  const sourceLabel =
    usePerfilPg && useDrePg ? "PostgreSQL · ano corrente · censos concluídos"
    : !usePerfilPg && !useDrePg ? "Google Sheets · fallback"
    : "Google Sheets · fallback (parcial)";
  const sourceTone = usePerfilPg && useDrePg ? "emerald" : "amber";

  return (
    <div className="space-y-6">
      {/* Indicação discreta da fonte de dados da aba. */}
      <div className={`flex items-center gap-2 text-xs ${
        sourceTone === "emerald" ? "text-emerald-700" : "text-amber-700"
      }`}>
        <span className={`inline-block w-2 h-2 rounded-full ${
          sourceTone === "emerald" ? "bg-emerald-500" : "bg-amber-500"
        }`} />
        <span>Fonte: {sourceLabel}</span>
      </div>

      {/* Avisos detalhados de falha — só aparecem se houve fallback. */}
      {(perfilErr || dreErr) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>
            Indicadores via PostgreSQL parcialmente indisponíveis
            {perfilErr && <> (perfil: {perfilErr})</>}
            {dreErr    && <> (DRE: {dreErr})</>}
            . Exibindo valores da planilha como fallback.
          </span>
        </div>
      )}
      {/* Se até a planilha falhou mas o PG funcionou, deixamos só um aviso suave. */}
      {sheetErr && !perfilErr && !dreErr && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl px-4 py-3 text-xs">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>Planilha (fallback) indisponível ({sheetErr}). Operando 100% via PostgreSQL.</span>
        </div>
      )}

      {/* Stat cards — Fase 2B.1: lêem caracterizacao/perfil com fallback p/ sheet-metrics. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total de Escolas" value={totalEscolas} Icon={Building2} tone="blue" sub="Censos concluídos" />
        <StatCard label="Total de Alunos" value={totalAlunos} Icon={Users} tone="green" />
        <StatCard label="Média por Escola" value={mediaAlunos} Icon={TrendingUp} tone="amber" sub="alunos/escola" />
        <StatCard label="Alunos PcD" value={totalAlunosPcd} Icon={GraduationCap} tone="purple" />
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
            label={totalEscolas.toLocaleString("pt-BR")}
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
            label={totalEscolas.toLocaleString("pt-BR")}
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
              {dreTable.map((d, i) => (
                <tr key={d.dre} className={i%2===0?"bg-white":"bg-slate-50/50"}>
                  <td className="px-5 py-3 font-medium text-slate-800">{d.dre}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700 font-semibold">{d.escolas.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{d.alunos.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{d.media.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{d.salas.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Perfil dos Alunos e Resultados ──────────────────────────────────────────

function PerfilAlunos({ token, onUnauth }: { token: string; onUnauth: () => void }) {
  const [metrics, setMetrics] = useState<IndicadoresMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  useEffect(() => {
    apiFetch<IndicadoresMetrics>("/v1/admin/indicadores-metrics", token)
      .then(setMetrics)
      .catch((e) => {
        if ((e as Error).message === "UNAUTHORIZED") { onUnauth(); return; }
        setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [token, onUnauth]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} /> Lendo Indicadores_Flags…
    </div>
  );
  if (err) return (
    <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
      <AlertCircle size={16} /> {err}
    </div>
  );
  if (!metrics) return null;

  const safeBenef    = metrics.por_faixa_benef    ?? [];
  const safeAbandono = metrics.por_faixa_abandono ?? [];
  const safeDreAban  = metrics.top_dre_abandono   ?? [];

  const totalBenef    = safeBenef.reduce((s, r) => s + r.count, 0);
  const totalAbandono = safeAbandono.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-5">
      {/* Label do subtab — igual Looker Studio */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3">
        <p className="text-sm text-orange-800 italic font-medium">
          Qual é o perfil socioeconômico dos estudantes e como está a permanência e o fluxo escolar na rede?
        </p>
      </div>

      {/* Stat card de risco — big number */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Escolas com Risco de Fluxo"
          value={metrics.escolas_risco_fluxo}
          Icon={AlertTriangle}
          tone="orange"
          sub="flag ativa de risco"
        />
        <StatCard
          label="Escolas Analisadas (Beneficiários)"
          value={totalBenef}
          Icon={Users}
          tone="blue"
        />
        <StatCard
          label="Escolas Analisadas (Abandono)"
          value={totalAbandono}
          Icon={Activity}
          tone="amber"
        />
      </div>

      {/* Linha 1: dois gráficos de barra vertical */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1">
            Distribuição por Faixa de Beneficiários
          </h3>
          <p className="text-xs text-slate-400 mb-4">% escolas por faixa de beneficiários sociais</p>
          {safeBenef.some((r) => r.count > 0) ? (
            <VBarChart
              rows={safeBenef.filter((r) => r.count > 0).map((r) => ({
                label: r.faixa,
                value: r.count,
              }))}
              color={C.primary}
              showPct={true}
            />
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">Dados não encontrados na planilha.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1">
            Distribuição da Taxa de Abandono
          </h3>
          <p className="text-xs text-slate-400 mb-4">% escolas por faixa de taxa de abandono</p>
          {safeAbandono.some((r) => r.count > 0) ? (
            <VBarChart
              rows={safeAbandono.filter((r) => r.count > 0).map((r) => ({
                label: r.faixa,
                value: r.count,
              }))}
              color={C.primary}
              showPct={true}
            />
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">Dados não encontrados na planilha.</p>
          )}
        </div>
      </div>

      {/* Linha 2: Top 10 DREs + card risco */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1">
            Top 10 DREs com maior taxa média de abandono
          </h3>
          <p className="text-xs text-slate-400 mb-4">taxa média de abandono (%)</p>
          {safeDreAban.length > 0 ? (
            <VBarChart
              rows={safeDreAban.map((d) => ({
                label: d.dre,
                value: d.media,
              }))}
              color={C.primary}
              showPct={false}
            />
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">Dados não encontrados.</p>
          )}
        </div>

        {/* Escolas com Risco de Fluxo — big number estilo Looker */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center justify-center text-center">
          <h3 className="font-semibold text-slate-700 text-sm mb-2">Escolas com Risco de Fluxo</h3>
          <p className="text-7xl font-bold text-slate-900 tabular-nums my-4">
            {metrics.escolas_risco_fluxo}
          </p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <AlertTriangle size={12} /> flag ativa
          </span>
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

type Tab = "perfil" | "alunos" | "operacional" | "census" | "dre";

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
    { id: "perfil",      label: "Caracterização da Rede",         Icon: BarChart2      },
    { id: "alunos",      label: "Perfil dos Alunos e Resultados", Icon: Activity       },
    { id: "operacional", label: "Operacional",                    Icon: LayoutDashboard },
    { id: "census",      label: "Todos os Censos",                Icon: Database       },
    { id: "dre",         label: "Por DRE",                        Icon: MapPinned      },
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

        {/* ── Caracterização da Rede ────────────────────────────── */}
        {tab === "perfil" && (
          <PerfilDaRede token={token} onUnauth={logout} />
        )}

        {/* ── Perfil dos Alunos e Resultados ───────────────────── */}
        {tab === "alunos" && (
          <PerfilAlunos token={token} onUnauth={logout} />
        )}

        {/* ── Operacional (DB stats + envios recentes) ───────────── */}
        {tab === "operacional" && dbData && (
          <AbaOperacional
            dbData={dbData}
            search={search}
            setSearch={setSearch}
            filteredRecent={filteredRecent}
            onView={setViewId}
            formatDate={fmtDate}
          />
        )}

        {/* ── Todos os Censos ────────────────────────────────────── */}
        {tab === "census" && (
          <AbaTodosCensos
            dbData={dbData}
            allCensus={allCensus}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            filterDre={filterDre}
            setFilterDre={setFilterDre}
            search={search}
            setSearch={setSearch}
            filteredCensus={filteredCensus}
            onView={setViewId}
            formatDate={fmtDate}
          />
        )}

        {/* ── Por DRE (DB) ───────────────────────────────────────── */}
        {tab === "dre" && dbData && (
          <AbaPorDre dbData={dbData} />
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
  // Estado conjunto evita dois setState's no mesmo efeito e mantém o
  // padrão de "client-only restore" (renderiza null em SSR e no primeiro
  // paint do cliente para não dar mismatch de hidratação; só depois lê
  // o sessionStorage). useSyncExternalStore não cabe aqui porque o
  // evento "storage" não dispara para escritas same-window, então a
  // restauração inicial precisa rodar dentro de useEffect.
  const [auth, setAuth] = useState<{ token: string | null; ready: boolean }>({ token: null, ready: false });
  useEffect(() => {
    // Restauração client-only do token em sessionStorage (ver comentário acima).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuth({ token: loadToken(), ready: true });
  }, []);
  if (!auth.ready) return null;
  if (!auth.token) return <LoginForm onLogin={(t) => setAuth({ token: t, ready: true })} />;
  return <Dashboard token={auth.token} onLogout={() => setAuth({ token: null, ready: true })} />;
}
