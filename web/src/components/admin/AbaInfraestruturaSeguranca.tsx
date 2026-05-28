"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldCheck, Building2, Construction, AlertCircle, Loader2,
  Camera, DoorClosed, Lightbulb, Siren, MapPinned, Layers, Home,
  Sparkles, BellRing, Zap,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  InfraCondicoes, InfraSeguranca,
} from "./shared/types";

type AbaInfraestruturaSegurancaProps = {
  token: string;
  onUnauth: () => void;
};

// Formata percentual vindo do backend (float entre 0 e 100) como "xx,x%".
function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}

// Pequeno empty inline para gráficos sem dados.
function NoData({ msg = "Sem dados disponíveis para este indicador." }: { msg?: string }) {
  return (
    <div className="text-xs text-slate-400 italic py-6 text-center">{msg}</div>
  );
}

export function AbaInfraestruturaSeguranca({
  token, onUnauth,
}: AbaInfraestruturaSegurancaProps) {
  const [condicoes, setCondicoes] = useState<InfraCondicoes | null>(null);
  const [seguranca, setSeguranca] = useState<InfraSeguranca | null>(null);
  const [condErr,   setCondErr]   = useState("");
  const [segErr,    setSegErr]    = useState("");
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pCond = apiFetch<InfraCondicoes>("/v1/admin/analytics/infraestrutura/condicoes", token)
      .then((d) => { if (!cancelled) setCondicoes(d); })
      .catch(handleErr(setCondErr));

    const pSeg = apiFetch<InfraSeguranca>("/v1/admin/analytics/infraestrutura/seguranca", token)
      .then((d) => { if (!cancelled) setSeguranca(d); })
      .catch(handleErr(setSegErr));

    Promise.all([pCond, pSeg]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, onUnauth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} /> Carregando indicadores…
      </div>
    );
  }

  // Erro total — ambos falharam e nenhum payload disponível.
  if (!condicoes && !seguranca) {
    const msg = condErr || segErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

  // Donuts: tipos de prédio e situação da estrutura.
  const tipoPredioSegments = (condicoes?.por_tipo_predio ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const situacaoSegments = (condicoes?.por_situacao_estrutura ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const ambientesRows = (condicoes?.top_ambientes ?? []).map((a) => ({
    label: a.ambiente,
    value: a.escolas,
  }));
  const camerasSegments = (seguranca?.dist_cameras ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      <div className="flex items-center gap-2 text-xs text-emerald-700">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span>Fonte: PostgreSQL · ano corrente · censos concluídos</span>
      </div>

      {/* Banners de erro parcial */}
      {condErr && seguranca && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Condições estruturais indisponíveis ({condErr}). Exibindo apenas os indicadores de segurança.</span>
        </div>
      )}
      {segErr && condicoes && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Segurança física indisponível ({segErr}). Exibindo apenas as condições estruturais.</span>
        </div>
      )}

      {/* ── Resumo Executivo ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Muro ou Cerca"
          value={fmtPct(condicoes?.pct_com_muro_ou_cerca)}
          Icon={Home}
          tone="blue"
          sub="das escolas"
        />
        <StatCard
          label="Perímetro Fechado"
          value={fmtPct(condicoes?.pct_perimetro_fechado)}
          Icon={ShieldCheck}
          tone="green"
          sub="das escolas"
        />
        <StatCard
          label="Controle de Portão"
          value={fmtPct(seguranca?.pct_controle_portao)}
          Icon={DoorClosed}
          tone="amber"
          sub="das escolas"
        />
        <StatCard
          label="Câmeras Funcionais"
          value={fmtPct(seguranca?.pct_cameras_funcionais)}
          Icon={Camera}
          tone="purple"
          sub="das escolas"
        />
      </div>

      {/* ── Condições Estruturais e Ambientes ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Building2 size={16} style={{ color: C.primary }} />
            Distribuição por Tipo de Prédio
          </h3>
          {tipoPredioSegments.length > 0 ? (
            <Donut segments={tipoPredioSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Layers size={16} style={{ color: C.primary }} />
            Situação da Estrutura
          </h3>
          {situacaoSegments.length > 0 ? (
            <Donut segments={situacaoSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
          <MapPinned size={16} style={{ color: C.primary }} />
          Ambientes mais presentes (Top 10)
        </h3>
        {ambientesRows.length > 0 ? (
          <HBarChart rows={ambientesRows} color={C.primary} />
        ) : (
          <NoData />
        )}
      </div>

      {/* ── Energia, Climatização e Capacidade Elétrica (empty interno) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <Zap size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Energia, Climatização e Capacidade Elétrica</h2>
        </div>
        <div className="px-6 py-8 flex flex-col items-center text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm mb-3"
            style={{ background: C.primary }}
          >
            <Construction size={22} strokeWidth={1.75} />
          </div>
          <p className="text-sm text-slate-600 max-w-2xl">
            Dados de energia, climatização e capacidade elétrica ainda não estão disponíveis nos endpoints
            analíticos desta aba. Este bloco será integrado em etapa posterior.
          </p>
        </div>
      </div>

      {/* ── Segurança Física e Patrimonial ───────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Guarita"
          value={fmtPct(seguranca?.pct_possui_guarita)}
          Icon={ShieldCheck}
          tone="blue"
          sub="das escolas"
        />
        <StatCard
          label="Iluminação Externa"
          value={fmtPct(seguranca?.pct_iluminacao_externa)}
          Icon={Lightbulb}
          tone="amber"
          sub="das escolas"
        />
        <StatCard
          label="Botão de Pânico"
          value={fmtPct(seguranca?.pct_possui_botao_panico)}
          Icon={Siren}
          tone="orange"
          sub="das escolas"
        />
        <StatCard
          label="Plano de Evacuação"
          value={fmtPct(seguranca?.pct_plano_evacuacao)}
          Icon={BellRing}
          tone="green"
          sub="das escolas"
        />
        <StatCard
          label="Política contra Bullying"
          value={fmtPct(seguranca?.pct_politica_bullying)}
          Icon={Sparkles}
          tone="purple"
          sub="das escolas"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
          <Camera size={16} style={{ color: C.primary }} />
          Distribuição do status das câmeras
        </h3>
        {camerasSegments.length > 0 ? (
          <Donut segments={camerasSegments} />
        ) : (
          <NoData />
        )}
      </div>
    </div>
  );
}
