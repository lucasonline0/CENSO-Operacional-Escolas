"use client";

import React, { useState, useEffect } from "react";
import {
  AlertCircle, Loader2, Users, Activity, AlertTriangle,
} from "lucide-react";
import { apiFetch, getCached } from "./shared/api";
import { C } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { VBarChart } from "./shared/BarChart";
import type { IndicadoresMetrics } from "./shared/types";

export function AbaPerfilAlunos({ token, onUnauth }: { token: string; onUnauth: () => void }) {
  const [metrics, setMetrics] = useState<IndicadoresMetrics | null>(
    () => getCached("/v1/admin/indicadores-metrics"),
  );
  const [loading, setLoading] = useState<boolean>(
    () => getCached("/v1/admin/indicadores-metrics") === null,
  );
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
