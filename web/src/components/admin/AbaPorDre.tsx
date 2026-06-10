"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Loader2, MapPinned } from "lucide-react";
import { apiFetch } from "./shared/api";
import { C } from "./shared/constants";
import type { DashboardFilters, PreenchimentoDrePayload } from "./shared/types";

const ENDPOINT_BASE = "/v1/admin/analytics/preenchimento/dre";
// Temporário: o dashboard atual está fixado no ciclo do Censo Escolar 2026.
const DASHBOARD_REFERENCE_YEAR = 2026;

function buildEndpoint(filters?: DashboardFilters): string {
  const params = new URLSearchParams({
    year: String(filters?.ano ?? DASHBOARD_REFERENCE_YEAR),
  });
  if (filters?.dre)               params.set("dre", filters.dre);
  if (filters?.municipio)         params.set("municipio", filters.municipio);
  if (filters?.zona)              params.set("zona", filters.zona);
  if (filters?.regiao_integracao) params.set("regiao_integracao", filters.regiao_integracao);
  return `${ENDPOINT_BASE}?${params.toString()}`;
}

export function AbaPorDre({
  token,
  onUnauth,
  filters,
}: {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
}) {
  const [payload, setPayload] = useState<PreenchimentoDrePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiFetch<PreenchimentoDrePayload>(buildEndpoint(filters), token)
      .then((data) => {
        if (!cancelled) {
          setPayload(data);
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        const message = (requestError as Error).message;
        if (message === "UNAUTHORIZED") {
          if (!cancelled) onUnauth();
          return;
        }
        if (!cancelled) setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, onUnauth, filters]);

  if (loading && payload === null) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="mr-2 animate-spin" size={22} style={{ color: C.primary }} />
        Carregando andamento por DRE…
      </div>
    );
  }

  if (payload === null) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        {error || "Não foi possível carregar o andamento do preenchimento por DRE."}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-fade-in-up">
      <div className="px-6 py-4 border-b flex items-start gap-2" style={{ background: C.primaryLight }}>
        <MapPinned size={16} style={{ color: C.primary }} className="mt-0.5 shrink-0" />
        <div>
          <h2 className="font-semibold text-slate-800 text-sm">Andamento do Preenchimento por Diretoria Regional de Ensino</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Percentual de escolas com censo concluído no ano {payload.ano_referencia}, agrupado por DRE e respeitando os filtros globais.
          </p>
        </div>
      </div>

      {payload.dres.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <MapPinned size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Nenhuma escola no recorte atual.</p>
          <p className="mt-1 text-xs text-slate-400">
            Ajuste os filtros globais para visualizar o andamento por DRE.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {["DRE", "Total", "Concluídos", "Rascunhos", "Pendentes", "% Conclusão"].map((h, i) => (
                <th key={i} className={`px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide ${i === 0 ? "text-left" : "text-center"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.dres.map((d, i) => {
              const pct = d.completion_percentage;
              return (
                <tr key={d.dre} className={`transition-colors hover:bg-blue-50/40 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <td className="px-5 py-3 font-medium text-slate-800">{d.dre}</td>
                  <td className="px-5 py-3 text-center text-slate-600 tabular-nums">{d.total}</td>
                  <td className="px-5 py-3 text-center text-emerald-700 font-semibold tabular-nums">{d.completed}</td>
                  <td className="px-5 py-3 text-center text-amber-600 tabular-nums">{d.draft}</td>
                  <td className="px-5 py-3 text-center text-slate-500 tabular-nums">{d.pending}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: C.primary }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-10 text-right tabular-nums">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
