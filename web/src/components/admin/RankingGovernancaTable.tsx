import React, { useEffect, useState, useMemo } from "react";
import { Loader2, AlertCircle, CheckCircle2, XCircle, ArrowUp, ArrowDown, ArrowUpDown, Building2 } from "lucide-react";
import { apiFetch } from "./shared/api";
import { C } from "./shared/constants";
import type { DashboardFilters } from "./shared/types";

type IndiceGovernancaEscola = {
  school_id: number;
  codigo_inep: string | null;
  escola: string;
  dre: string;
  municipio: string;
  has_censo: boolean;
  conselho_escolar: boolean;
  conselho_ativo: boolean;
  regularizada_cee: boolean;
  gremio_estudantil: boolean;
  prestacao_contas_ok: boolean;
  score: number;
  status: string;
};

type IndiceGovernancaPayload = {
  total_escolas: number;
  resumo: {
    excelentes: number;
    regulares: number;
    criticas: number;
    sem_dados: number;
  };
  escolas: IndiceGovernancaEscola[];
};

type RankingGovernancaTableProps = {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
};

function buildParams(filters?: DashboardFilters): string {
  const p = new URLSearchParams();
  if (filters?.dre) p.set("dre", filters.dre);
  if (filters?.municipio) p.set("municipio", filters.municipio);
  if (filters?.zona) p.set("zona", filters.zona);
  if (filters?.school_id)         p.set("school_id",         String(filters.school_id));
  if (filters?.codigo_inep)       p.set("codigo_inep",       filters.codigo_inep);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Excelente") {
    return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">{status}</span>;
  }
  if (status === "Regular") {
    return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">{status}</span>;
  }
  if (status === "Crítico") {
    return <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">{status}</span>;
  }
  return <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">Sem dados</span>;
}

function ItemCheck({ ok, noData }: { ok: boolean; noData?: boolean }) {
  if (noData) return <span className="text-slate-300 text-xs">—</span>;
  return ok ? (
    <CheckCircle2 size={16} className="text-emerald-500" />
  ) : (
    <XCircle size={16} className="text-rose-400" />
  );
}

export function RankingGovernancaTable({ token, onUnauth, filters }: RankingGovernancaTableProps) {
  const [data, setData] = useState<IndiceGovernancaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sortKey, setSortKey] = useState<keyof IndiceGovernancaEscola | null>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError("");

    const qs = buildParams(filters);
    apiFetch<IndiceGovernancaPayload>(`/v1/admin/analytics/financeiro-governanca/indice-escolas${qs}`, token)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
        }
      })
      .catch((e: unknown) => {
        const msg = (e as Error).message;
        if (msg === "UNAUTHORIZED") {
          if (!cancelled) onUnauth();
          return;
        }
        if (!cancelled) setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, onUnauth, filters]);

  const sortedEscolas = useMemo(() => {
    if (!data) return [];
    const arr = [...data.escolas];
    if (!sortKey) return arr;

    arr.sort((a, b) => {
      const aVal = a[sortKey] ?? "";
      const bVal = b[sortKey] ?? "";

      // "Sem dados" always goes to the bottom if sorting by score/status
      if (sortKey === "score" || sortKey === "status") {
        if (a.status === "Sem dados" && b.status !== "Sem dados") return 1;
        if (a.status !== "Sem dados" && b.status === "Sem dados") return -1;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      
      // Tie breaker
      return a.escola.localeCompare(b.escola);
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const handleSort = (key: keyof IndiceGovernancaEscola) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc"); // Default to desc for new sorts (like score)
    }
  };

  const renderSortIcon = (key: keyof IndiceGovernancaEscola) => {
    if (sortKey !== key) return <ArrowUpDown size={14} className="inline ml-1 text-slate-300" />;
    return sortDir === "asc" ? <ArrowUp size={14} className="inline ml-1 text-slate-600" /> : <ArrowDown size={14} className="inline ml-1 text-slate-600" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={20} style={{ color: C.primary }} />
        Carregando ranking de governança…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        Não foi possível carregar a classificação: {error}
      </div>
    );
  }

  if (!data || data.escolas.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic py-6 text-center">
        Sem dados disponíveis para este recorte.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Excelentes: <strong className="font-semibold">{data.resumo.excelentes}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Regulares: <strong className="font-semibold">{data.resumo.regulares}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Críticas: <strong className="font-semibold">{data.resumo.criticas}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
          <span>Sem censo: <strong className="font-semibold">{data.resumo.sem_dados}</strong></span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="py-3 px-4 font-semibold cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleSort("escola")}>
                  Escola {renderSortIcon("escola")}
                </th>
                <th className="py-3 px-3 font-semibold cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleSort("municipio")}>
                  Município {renderSortIcon("municipio")}
                </th>
                <th className="py-3 px-3 font-semibold text-center" title="Conselho Escolar Instituído">
                  Conselho
                </th>
                <th className="py-3 px-3 font-semibold text-center" title="Conselho Escolar Ativo">
                  Ativo
                </th>
                <th className="py-3 px-3 font-semibold text-center" title="Escola Regularizada no CEE">
                  CEE
                </th>
                <th className="py-3 px-3 font-semibold text-center" title="Grêmio Estudantil Ativo">
                  Grêmio
                </th>
                <th className="py-3 px-3 font-semibold text-center" title="Prestação de Contas PRODEP">
                  PRODEP
                </th>
                <th className="py-3 px-3 font-semibold text-center cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleSort("score")}>
                  Nota {renderSortIcon("score")}
                </th>
                <th className="py-3 px-4 font-semibold cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleSort("status")}>
                  Classificação {renderSortIcon("status")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedEscolas.map((r) => (
                <tr key={r.school_id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-4 align-middle">
                    <div className="font-medium text-slate-800 flex items-center gap-2">
                      <Building2 size={14} className="text-slate-400" />
                      {r.escola || "—"}
                    </div>
                    <div className="text-xs text-slate-400 ml-5">
                      INEP {r.codigo_inep || "Sem INEP"} • {r.dre}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 align-middle text-slate-600">
                    {r.municipio}
                  </td>
                  <td className="py-2.5 px-3 align-middle text-center">
                    <div className="flex justify-center"><ItemCheck ok={r.conselho_escolar} noData={!r.has_censo} /></div>
                  </td>
                  <td className="py-2.5 px-3 align-middle text-center">
                    <div className="flex justify-center"><ItemCheck ok={r.conselho_ativo} noData={!r.has_censo} /></div>
                  </td>
                  <td className="py-2.5 px-3 align-middle text-center">
                    <div className="flex justify-center"><ItemCheck ok={r.regularizada_cee} noData={!r.has_censo} /></div>
                  </td>
                  <td className="py-2.5 px-3 align-middle text-center">
                    <div className="flex justify-center"><ItemCheck ok={r.gremio_estudantil} noData={!r.has_censo} /></div>
                  </td>
                  <td className="py-2.5 px-3 align-middle text-center">
                    <div className="flex justify-center"><ItemCheck ok={r.prestacao_contas_ok} noData={!r.has_censo} /></div>
                  </td>
                  <td className="py-2.5 px-3 align-middle text-center font-semibold text-slate-700">
                    {r.has_censo ? r.score : "—"}
                  </td>
                  <td className="py-2.5 px-4 align-middle">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
