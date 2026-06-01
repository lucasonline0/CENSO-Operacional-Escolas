"use client";

import React, { useState, useEffect } from "react";
import {
  Building2, MapPinned, AlertCircle, Loader2,
  TrendingUp, Users, GraduationCap, BarChart2,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS, ZONA_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  CaracterizacaoPerfilPg, CaracterizacaoDREPg, SheetMetrics,
} from "./shared/types";

export function AbaCaracterizacao({ token, onUnauth }: { token: string; onUnauth: () => void }) {
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

      {/* ── Organização da Oferta e Funcionamento ─────────────── */}
      <div id="sec-perfil-oferta" />

      {/* ── Infraestrutura Educacional ────────────────────────── */}
      <div id="sec-perfil-infra" />

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
