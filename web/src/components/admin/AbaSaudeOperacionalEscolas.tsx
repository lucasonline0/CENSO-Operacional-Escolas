"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  HeartPulse,
  Loader2,
  Search,
} from "lucide-react";
import { apiFetch, allCached, getCached, sanitize } from "./shared/api";
import { C } from "./shared/constants";
import type {
  SaudeOperacionalEscola,
  SaudeOperacionalPayload,
  SaudeOperacionalStatus,
} from "./shared/types";

const ENDPOINT = "/v1/admin/analytics/escolas/saude-operacional";

type SortDirection = "asc" | "desc";
type SortKey =
  | "escola"
  | "municipio"
  | "dre"
  | "zona"
  | "total_alunos"
  | "alunos_por_sala"
  | "saude"
  | "criticidade"
  | "infraestrutura"
  | "energia"
  | "merenda"
  | "seguranca"
  | "pessoal"
  | "tecnologia"
  | "pedagogico"
  | "governanca";

type SummaryTone = "blue" | "green" | "amber" | "rose" | "slate" | "purple";

const SUMMARY_TONES: Record<SummaryTone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-100",
};

const STATUS_STYLES: Record<SaudeOperacionalStatus, {
  badge: string;
  dot: string;
  bar: string;
}> = {
  saudavel: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  atencao: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  critica: {
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
  },
  sem_dados: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    bar: "bg-slate-400",
  },
};

function statusLabel(status: SaudeOperacionalStatus): string {
  const labels: Record<SaudeOperacionalStatus, string> = {
    saudavel: "Saudável",
    atencao: "Atenção",
    critica: "Crítica",
    sem_dados: "Sem dados",
  };
  return labels[status];
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtInt(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtDecimal(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function sortValue(
  escola: SaudeOperacionalEscola,
  key: SortKey,
): string | number | null {
  if (key in escola.dimensoes) {
    return escola.dimensoes[key as keyof SaudeOperacionalEscola["dimensoes"]];
  }
  return escola[key as keyof Pick<
    SaudeOperacionalEscola,
    "escola" | "municipio" | "dre" | "zona" | "total_alunos"
      | "alunos_por_sala" | "saude" | "criticidade"
  >];
}

function compareSchools(
  a: SaudeOperacionalEscola,
  b: SaudeOperacionalEscola,
  key: SortKey,
  direction: SortDirection,
): number {
  const aSemDados = a.status === "sem_dados";
  const bSemDados = b.status === "sem_dados";
  if (aSemDados !== bSemDados) return aSemDados ? 1 : -1;

  const aValue = sortValue(a, key);
  const bValue = sortValue(b, key);
  const aNull = aValue === null || (typeof aValue === "number" && Number.isNaN(aValue));
  const bNull = bValue === null || (typeof bValue === "number" && Number.isNaN(bValue));

  if (aNull !== bNull) return aNull ? 1 : -1;

  let comparison = 0;
  if (typeof aValue === "string" && typeof bValue === "string") {
    comparison = aValue.localeCompare(bValue, "pt-BR", {
      sensitivity: "base",
      numeric: true,
    });
  } else if (typeof aValue === "number" && typeof bValue === "number") {
    comparison = aValue - bValue;
  }

  if (comparison !== 0) return direction === "asc" ? comparison : -comparison;
  return a.escola.localeCompare(b.escola, "pt-BR", { sensitivity: "base" });
}

function SummaryCard({
  label,
  value,
  Icon,
  tone,
  sub,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  tone: SummaryTone;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
          {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex shrink-0 items-center justify-center ring-1 ${SUMMARY_TONES[tone]}`}>
          <Icon size={19} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SaudeOperacionalStatus }) {
  const styles = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center justify-center"
      title={statusLabel(status)}
      aria-label={statusLabel(status)}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} aria-hidden="true" />
    </span>
  );
}

function HealthCell({
  value,
  status,
}: {
  value: number | null;
  status: SaudeOperacionalStatus;
}) {
  if (value === null || Number.isNaN(value)) return <span className="text-slate-400">—</span>;

  const width = Math.min(100, Math.max(0, value));
  return (
    <div className="min-w-24">
      <div className="mb-1 text-right text-xs font-semibold tabular-nums text-slate-700">
        {fmtDecimal(value)}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${STATUS_STYLES[status].bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function DimensionBadge({ value }: { value: number | null }) {
  if (value === null || Number.isNaN(value)) {
    return <span className="inline-flex min-w-11 justify-center text-slate-400">—</span>;
  }

  const color = value >= 70
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : value >= 50
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <span className={`inline-flex min-w-11 justify-center rounded-md border px-1.5 py-1 text-[11px] font-semibold tabular-nums ${color}`}>
      {fmtDecimal(value)}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-white/80"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

export function AbaSaudeOperacionalEscolas({
  token,
  onUnauth,
}: {
  token: string;
  onUnauth: () => void;
}) {
  const [payload, setPayload] = useState<SaudeOperacionalPayload | null>(
    () => getCached<SaudeOperacionalPayload>(ENDPOINT),
  );
  const [loading, setLoading] = useState(() => !allCached([ENDPOINT]));
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("criticidade");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    let cancelled = false;

    apiFetch<SaudeOperacionalPayload>(ENDPOINT, token)
      .then((data) => {
        if (!cancelled) setPayload(data);
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
  }, [token, onUnauth]);

  const summary = useMemo(() => {
    const escolas = payload?.escolas ?? [];
    const notas = escolas
      .map((escola) => escola.saude)
      .filter((nota): nota is number => nota !== null && !Number.isNaN(nota));

    return {
      saudaveis: escolas.filter((escola) => escola.status === "saudavel").length,
      atencao: escolas.filter((escola) => escola.status === "atencao").length,
      criticas: escolas.filter((escola) => escola.status === "critica").length,
      semDados: escolas.filter((escola) => escola.status === "sem_dados").length,
      media: notas.length > 0
        ? notas.reduce((total, nota) => total + nota, 0) / notas.length
        : null,
    };
  }, [payload]);

  const visibleSchools = useMemo(() => {
    const query = normalizeSearch(search);
    const escolas = (payload?.escolas ?? []).filter((escola) => {
      if (!query) return true;
      return [
        escola.escola,
        escola.municipio,
        escola.dre,
        escola.codigo_inep ?? "",
      ].some((value) => normalizeSearch(value).includes(query));
    });

    return [...escolas].sort((a, b) => compareSchools(
      a,
      b,
      sortKey,
      sortDirection,
    ));
  }, [payload, search, sortDirection, sortKey]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  if (loading && payload === null) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="mr-2 animate-spin" size={22} style={{ color: C.primary }} />
        Carregando saúde operacional das escolas…
      </div>
    );
  }

  if (payload === null) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        {error || "Não foi possível carregar a saúde operacional das escolas."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: C.primary }}>
            <HeartPulse size={18} />
            Indicador operacional
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Índice de Saúde Operacional por escola
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Visão escola a escola da saúde operacional, criticidade e dimensões avaliadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Fonte: PostgreSQL · ano de referência {payload.ano_referencia} · censos concluídos
          </span>
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            Metodologia v{payload.metodologia.versao}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Total de escolas"
          value={payload.total_escolas}
          Icon={Building2}
          tone="blue"
          sub={`Ano ${payload.ano_referencia}`}
        />
        <SummaryCard
          label="Saudáveis"
          value={summary.saudaveis}
          Icon={CircleCheck}
          tone="green"
        />
        <SummaryCard
          label="Em atenção"
          value={summary.atencao}
          Icon={CircleAlert}
          tone="amber"
        />
        <SummaryCard
          label="Críticas"
          value={summary.criticas}
          Icon={AlertCircle}
          tone="rose"
        />
        <SummaryCard
          label="Sem dados"
          value={summary.semDados}
          Icon={CircleHelp}
          tone="slate"
        />
        <SummaryCard
          label="Média de saúde"
          value={fmtDecimal(summary.media)}
          Icon={Activity}
          tone="purple"
          sub="Escolas com nota"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(sanitize(event.target.value).slice(0, 150))}
            placeholder="Buscar por escola, município, DRE ou INEP…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <p className="whitespace-nowrap text-xs text-slate-500">
          Exibindo <strong className="text-slate-700">{visibleSchools.length.toLocaleString("pt-BR")}</strong>
          {" "}de <strong className="text-slate-700">{payload.escolas.length.toLocaleString("pt-BR")}</strong> escolas
        </p>
      </div>

      {payload.escolas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <CircleHelp size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Nenhuma escola disponível.</p>
          <p className="mt-1 text-xs text-slate-400">
            O endpoint não retornou registros para o ano de referência.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1900px] w-full text-sm">
              <thead style={{ background: C.primary }} className="text-white">
                <tr>
                  <th scope="col" className="w-16 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide">
                    Farol
                  </th>
                  <SortHeader label="Escola" sortKey="escola" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="min-w-64" />
                  <SortHeader label="Município" sortKey="municipio" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="DRE" sortKey="dre" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Zona" sortKey="zona" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Alunos" sortKey="total_alunos" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Aln/sala" sortKey="alunos_por_sala" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Saúde" sortKey="saude" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Criticidade" sortKey="criticidade" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Infra" sortKey="infraestrutura" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Energia" sortKey="energia" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Merenda" sortKey="merenda" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Segur." sortKey="seguranca" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Pessoal" sortKey="pessoal" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Tec." sortKey="tecnologia" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Pedag." sortKey="pedagogico" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Gov." sortKey="governanca" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleSchools.map((escola) => (
                  <tr key={escola.school_id} className="hover:bg-slate-50/80">
                    <td className="w-16 px-3 py-3 text-center">
                      <StatusBadge status={escola.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-80 font-medium text-slate-800">{escola.escola}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        INEP: {escola.codigo_inep ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{escola.municipio}</td>
                    <td className="px-3 py-3 text-slate-600">{escola.dre}</td>
                    <td className="px-3 py-3 text-slate-600">{escola.zona ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{fmtInt(escola.total_alunos)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{fmtDecimal(escola.alunos_por_sala)}</td>
                    <td className="px-3 py-3"><HealthCell value={escola.saude} status={escola.status} /></td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-700">{fmtDecimal(escola.criticidade)}</td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.infraestrutura} /></td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.energia} /></td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.merenda} /></td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.seguranca} /></td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.pessoal} /></td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.tecnologia} /></td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={null} /></td>
                    <td className="px-3 py-3 text-center"><DimensionBadge value={null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleSchools.length === 0 && (
            <div className="border-t border-slate-100 px-6 py-12 text-center">
              <Search size={24} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Nenhuma escola encontrada.</p>
              <p className="mt-1 text-xs text-slate-400">Tente outro termo de busca.</p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <CircleHelp size={15} className="mt-0.5 shrink-0" />
        <span>
          Saúde, criticidade, status e notas dimensionais são exibidos conforme retornados pelo backend.
          Pedagógico e Governança permanecem sem nota nesta versão.
        </span>
      </div>
    </div>
  );
}
