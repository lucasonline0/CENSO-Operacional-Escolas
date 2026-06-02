"use client";

import React, { useState, useEffect } from "react";
import {
  Building2, MapPinned, AlertCircle, Loader2,
  TrendingUp, Users, GraduationCap, BarChart2, Clock, BookOpen,
  LayoutGrid, ShieldCheck, Info, X,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS, ZONA_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut, PieChart } from "./shared/Donut";
import { HBarChart, VBarChart } from "./shared/BarChart";
import type {
  CaracterizacaoPerfilPg, CaracterizacaoDREPg, SheetMetrics,
  CaracterizacaoOfertaFuncionamento, CaracterizacaoInfraEducacionalPg,
} from "./shared/types";

const TURNO_COLORS: Record<string, string> = {
  "Manhã":    "#F59E0B",
  "Tarde":    "#3B82F6",
  "Noite":    "#6366F1",
  "Integral": "#10B981",
};

// Cores das faixas de cobertura essencial (donut). Da maior cobertura
// (verde) à menor (vermelho), com cinza para "sem essenciais informados".
const FAIXA_COBERTURA_COLORS: Record<string, string> = {
  "Cobertura plena":           "#10B981",
  "Alta cobertura":            "#3B82F6",
  "Cobertura intermediária":   "#F59E0B",
  "Baixa cobertura":           "#EF4444",
  "Sem essenciais informados": "#94A3B8",
};

export function AbaCaracterizacao({ token, onUnauth }: { token: string; onUnauth: () => void }) {
  // Fase 2B.1: a aba "Caracterização da Rede" passa a consumir PostgreSQL via
  // /v1/admin/analytics/caracterizacao/perfil e /caracterizacao/dre. Os dados
  // legados de /v1/admin/sheet-metrics continuam carregados em paralelo como
  // fallback para qualquer parte cujo endpoint analítico falhe.
  const [perfilPg, setPerfilPg] = useState<CaracterizacaoPerfilPg | null>(null);
  const [drePg,    setDrePg]    = useState<CaracterizacaoDREPg | null>(null);
  const [ofertaPg, setOfertaPg] = useState<CaracterizacaoOfertaFuncionamento | null>(null);
  const [infraPg,  setInfraPg]  = useState<CaracterizacaoInfraEducacionalPg | null>(null);
  const [metrics,  setMetrics]  = useState<SheetMetrics | null>(null);
  const [perfilErr, setPerfilErr] = useState("");
  const [dreErr,    setDreErr]    = useState("");
  const [ofertaErr, setOfertaErr] = useState("");
  const [infraErr,  setInfraErr]  = useState("");
  const [sheetErr,  setSheetErr]  = useState("");
  const [loading,   setLoading]   = useState(true);
  // Janela informativa explicando quais ambientes são essenciais.
  const [infoOpen, setInfoOpen] = useState(false);

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

    const pOferta = apiFetch<CaracterizacaoOfertaFuncionamento>("/v1/admin/analytics/caracterizacao/oferta-funcionamento", token)
      .then((d) => { if (!cancelled) setOfertaPg(d); })
      .catch(handleErr(setOfertaErr));

    const pInfra = apiFetch<CaracterizacaoInfraEducacionalPg>("/v1/admin/analytics/caracterizacao/infraestrutura-educacional", token)
      .then((d) => { if (!cancelled) setInfraPg(d); })
      .catch(handleErr(setInfraErr));

    const pSheet = apiFetch<SheetMetrics>("/v1/admin/sheet-metrics", token)
      .then((m) => { if (!cancelled) setMetrics(m); })
      .catch(handleErr(setSheetErr));

    Promise.all([pPerfil, pDre, pOferta, pInfra, pSheet]).finally(() => {
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

      {/* ── Dimensão e Perfil da Rede ─────────────────────────── */}
      <div id="sec-perfil-dimensao" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          <PieChart segments={porteDonut} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <MapPinned size={16} style={{ color: C.primary }} />
            Distribuição de Escolas por Zona
          </h3>
          <PieChart segments={zonaDonut} />
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

      {/* ── Organização da Oferta e Funcionamento ─────────────── */}
      <div id="sec-perfil-oferta" className="space-y-5">
        <h2 className="text-base font-semibold text-slate-700 border-b border-slate-200 pb-2">
          Organização da Oferta e Funcionamento
        </h2>

        {ofertaErr && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle size={14} /> Oferta e funcionamento indisponível: {ofertaErr}
          </div>
        )}

        {ofertaPg && (
          <>
            {/* Etapas + Modalidades */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                  <GraduationCap size={16} style={{ color: C.primary }} />
                  Escolas por Etapa Ofertada
                </h3>
                <Donut
                  segments={ofertaPg.etapas_ofertadas.map((e, i) => ({
                    label: e.label,
                    value: e.escolas,
                    color: PORTE_COLORS[i] ?? "#94A3B8",
                    pct: e.percentual,
                  }))}
                  label={ofertaPg.etapas_ofertadas.reduce((s, e) => s + e.escolas, 0).toLocaleString("pt-BR")}
                  sub="registros"
                />
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                  <BookOpen size={16} style={{ color: C.primary }} />
                  Escolas por Modalidade Ofertada
                </h3>
                <HBarChart
                  rows={ofertaPg.modalidades_ofertadas.map((m) => ({ label: m.label, value: m.escolas, pct: m.percentual }))}
                  color="#2563EB"
                />
              </div>
            </div>

            {/* Turnos + Média por porte */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                  <Clock size={16} style={{ color: C.primary }} />
                  Distribuição de Escolas por Turno
                </h3>
                <Donut
                  segments={ofertaPg.turnos.map((t, i) => ({
                    label: t.label,
                    value: t.escolas,
                    color: TURNO_COLORS[t.label] ?? PORTE_COLORS[i] ?? "#94A3B8",
                  }))}
                  label={totalEscolas.toLocaleString("pt-BR")}
                  sub="escolas"
                />
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                  <BarChart2 size={16} style={{ color: C.primary }} />
                  Média de Turnos por Porte
                </h3>
                <HBarChart
                  rows={ofertaPg.media_turnos_por_porte.map((p) => ({
                    label: p.porte,
                    value: Math.round(p.media_turnos * 10) / 10,
                  }))}
                  color="#8B5CF6"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Infraestrutura Educacional ────────────────────────── */}
      <div id="sec-perfil-infra" className="space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <LayoutGrid size={18} style={{ color: C.primary }} />
            Infraestrutura Educacional
          </h2>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="Sobre os ambientes essenciais"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Info size={16} />
          </button>
        </div>

        {infraErr && !infraPg && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>Infraestrutura Educacional indisponível ({infraErr}).</span>
          </div>
        )}

        {infraPg && (
          <>
            {/* KPIs de cobertura essencial. "Total de Escolas" não é
                repetido aqui — já consta no bloco Dimensão e Perfil da Rede. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                label="Média de Ambientes Essenciais"
                value={infraPg.cobertura_essenciais.media_ambientes_essenciais.toLocaleString("pt-BR")}
                Icon={LayoutGrid}
                tone="blue"
                sub={`de ${infraPg.cobertura_essenciais.total_essenciais} por escola`}
              />
              <StatCard
                label="Cobertura Plena"
                value={`${infraPg.cobertura_essenciais.pct_cobertura_plena.toLocaleString("pt-BR")}%`}
                Icon={ShieldCheck}
                tone="green"
                sub={`possuem os ${infraPg.cobertura_essenciais.total_essenciais} essenciais`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Ranking de ambientes mais presentes */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                  <BarChart2 size={16} style={{ color: C.primary }} />
                  Ambientes mais Presentes
                </h3>
                {infraPg.ambientes.length > 0 ? (
                  <HBarChart
                    rows={infraPg.ambientes.map((a) => ({
                      label: a.label,
                      value: a.escolas,
                      trailing: `${a.percentual.toLocaleString("pt-BR")}%`,
                    }))}
                    color={C.primary}
                  />
                ) : (
                  <p className="text-sm text-slate-400">Nenhum ambiente declarado.</p>
                )}
              </div>

              {/* Distribuição por faixa de cobertura essencial */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                  <ShieldCheck size={16} style={{ color: C.primary }} />
                  Cobertura de Ambientes Essenciais
                </h3>
                <Donut
                  segments={infraPg.cobertura_essenciais.por_faixa.map((f) => ({
                    label: f.label,
                    value: f.escolas,
                    color: FAIXA_COBERTURA_COLORS[f.label] ?? "#94A3B8",
                  }))}
                  label={totalEscolas.toLocaleString("pt-BR")}
                  sub="escolas"
                />
              </div>
            </div>

            {/* Média de essenciais por porte */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <TrendingUp size={16} style={{ color: C.primary }} />
                Média de Essenciais por Porte
              </h3>
              {infraPg.media_essenciais_por_porte.length > 0 ? (
                <VBarChart
                  rows={infraPg.media_essenciais_por_porte.map((m) => ({ label: m.porte, value: m.media }))}
                  color="#2563EB"
                  showPct={false}
                  barMaxWidth={120}
                  gapClass="gap-1"
                  valueInside
                />
              ) : (
                <p className="text-sm text-slate-400">Sem dados de porte.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Janela informativa — ambientes essenciais */}
      {infoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <Info size={16} style={{ color: C.primary }} />
                Ambientes considerados essenciais
              </h3>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                aria-label="Fechar"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <ul className="text-sm text-slate-600 space-y-1 mb-4">
              {(infraPg?.ambientes_essenciais ?? [
                "Biblioteca", "Laboratório de Ciências", "Laboratório de Informática",
                "Quadra Esportiva", "Refeitório", "Cozinha", "Sala dos Professores", "SAEE",
              ]).map((nome) => (
                <li key={nome} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  {nome}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 leading-relaxed">
              Esses ambientes foram definidos como essenciais por representarem espaços
              básicos de apoio pedagógico, alimentação, atendimento especializado e
              funcionamento escolar. A cobertura indica quantos desses ambientes foram
              declarados pela escola no Censo Operacional.
            </p>
          </div>
        </div>
      )}

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
