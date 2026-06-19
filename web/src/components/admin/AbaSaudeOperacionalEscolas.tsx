"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Building2,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Filter,
  HeartPulse,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { apiFetch, sanitize } from "./shared/api";
import { C } from "./shared/constants";
import { ReportButton } from "./shared/ReportButton";
import SaudeOperacionalMetodologiaInfo from "./SaudeOperacionalMetodologiaInfo";
import type {
  SaudeOperacionalEscola,
  SaudeOperacionalPayload,
  SaudeOperacionalStatus,
  DashboardFilters,
  FiltrosOpcoes,
} from "./shared/types";

const ENDPOINT_BASE = "/v1/admin/analytics/escolas/saude-operacional";
// Temporário: o dashboard atual está fixado no ciclo do Censo Escolar 2026.
const DASHBOARD_REFERENCE_YEAR = 2026;

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

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

// Filtros locais da aba: NÃO interferem nos filtros globais nem nos cards de
// resumo. "todos"/"todas" desligam o filtro correspondente e não são enviados
// ao backend.
type LocalStatusFilter = "todos" | SaudeOperacionalStatus;
type LocalCriticidadeFilter = "todas" | "alta" | "media" | "baixa" | "sem_dados";

const LOCAL_STATUS_OPTIONS: { value: LocalStatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "saudavel", label: "Saudável" },
  { value: "atencao", label: "Atenção" },
  { value: "critica", label: "Crítica" },
  { value: "sem_dados", label: "Sem dados" },
];

const LOCAL_CRITICIDADE_OPTIONS: { value: LocalCriticidadeFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "alta", label: "Alta criticidade" },
  { value: "media", label: "Média criticidade" },
  { value: "baixa", label: "Baixa criticidade" },
  { value: "sem_dados", label: "Sem dados" },
];

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

function buildEndpoint(
  sortKey: SortKey,
  sortDir: SortDirection,
  page: number,
  pageSize: PageSizeOption,
  search: string,
  localStatus: LocalStatusFilter,
  localCriticidade: LocalCriticidadeFilter,
  filters?: DashboardFilters,
): string {
  const params = new URLSearchParams({
    year: String(filters?.ano ?? DASHBOARD_REFERENCE_YEAR),
    sort: sortKey,
    direction: sortDir,
    page: String(page),
    page_size: String(pageSize),
  });
  if (search.trim()) params.set("search", search.trim());
  if (filters?.dre)               params.set("dre", filters.dre);
  if (filters?.municipio)         params.set("municipio", filters.municipio);
  if (filters?.zona)              params.set("zona", filters.zona);
  if (filters?.regiao_integracao) params.set("regiao_integracao", filters.regiao_integracao);
  if (localStatus !== "todos")      params.set("status", localStatus);
  if (localCriticidade !== "todas") params.set("criticidade_faixa", localCriticidade);
  return `${ENDPOINT_BASE}?${params.toString()}`;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number | undefined;
  options: (string | number)[];
  onChange: (v: string) => void;
}) {
  const hasValue = value !== undefined && value !== "";
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border py-1.5 pl-2.5 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
          hasValue
            ? "border-blue-300 bg-blue-50 font-semibold text-blue-800"
            : "border-slate-200 bg-white text-slate-700"
        }`}
        style={{ minWidth: 140 }}
      >
        <option value="">Todos</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
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
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-slate-300 transition-all duration-300 group cursor-default animate-fade-in-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide group-hover:text-slate-700 transition-colors">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums group-hover:scale-105 origin-left transition-transform">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
          {sub && <p className="text-[11px] text-slate-400 mt-1 group-hover:text-slate-500 transition-colors">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex shrink-0 items-center justify-center ring-1 group-hover:scale-110 group-hover:rotate-3 transition-transform ${SUMMARY_TONES[tone]}`}>
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
  filters,
  opcoes,
  onFiltersChange,
}: {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
  opcoes?: FiltrosOpcoes | null;
  onFiltersChange?: (f: DashboardFilters) => void;
}) {
  const [payload, setPayload] = useState<SaudeOperacionalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("criticidade");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [searchInput, setSearchInput] = useState("");
  const [serverSearch, setServerSearch] = useState("");
  const [localStatus, setLocalStatus] = useState<LocalStatusFilter>("todos");
  const [localCriticidade, setLocalCriticidade] = useState<LocalCriticidadeFilter>("todas");
  const hasLocalFilters = useMemo(
    () => localStatus !== "todos" || localCriticidade !== "todas",
    [localStatus, localCriticidade],
  );

  // Debounce: aguarda 400ms após o usuário parar de digitar antes de buscar.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (page !== 1 || value !== serverSearch) setLoading(true);
      setPage(1);
      setServerSearch(value);
    }, 400);
  }, [page, serverSearch]);

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  // Quando os filtros globais mudam, volta para a primeira página
  useEffect(() => {
    setPage(1);
  }, [filters]);

  function handleSort(key: SortKey) {
    setLoading(true);
    if (sortKey === key) {
      setSortDir((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handlePageSizeChange(size: PageSizeOption) {
    if (size === pageSize && page === 1) return;
    setLoading(true);
    setPageSize(size);
    setPage(1);
  }

  function handlePageChange(nextPage: number) {
    if (nextPage === page) return;
    setLoading(true);
    setPage(nextPage);
  }

  function handleLocalStatusChange(value: LocalStatusFilter) {
    if (value === localStatus) return;
    setLoading(true);
    setLocalStatus(value);
    setPage(1);
  }

  function handleLocalCriticidadeChange(value: LocalCriticidadeFilter) {
    if (value === localCriticidade) return;
    setLoading(true);
    setLocalCriticidade(value);
    setPage(1);
  }

  function setGlobalFilter(key: keyof DashboardFilters, raw: string) {
    if (!onFiltersChange) return;
    const next: DashboardFilters = { ...(filters ?? {}) };
    if (raw === "") {
      delete next[key];
    } else if (key === "ano") {
      next.ano = Number(raw);
    } else {
      (next as Record<string, string>)[key] = raw;
    }
    onFiltersChange(next);
  }

  const activeGlobalCount = useMemo(
    () => (filters ? Object.values(filters).filter((v) => v !== undefined && v !== "").length : 0),
    [filters],
  );
  const activeLocalCount =
    (localStatus !== "todos" ? 1 : 0) + (localCriticidade !== "todas" ? 1 : 0);
  const totalActiveCount = activeGlobalCount + activeLocalCount;

  function clearAllFilters() {
    if (totalActiveCount === 0) return;
    setLoading(true);
    if (onFiltersChange && activeGlobalCount > 0) onFiltersChange({});
    if (activeLocalCount > 0) {
      setLocalStatus("todos");
      setLocalCriticidade("todas");
    }
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;

    const url = buildEndpoint(
      sortKey,
      sortDir,
      page,
      pageSize,
      serverSearch,
      localStatus,
      localCriticidade,
      filters,
    );

    apiFetch<SaudeOperacionalPayload>(url, token)
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
  }, [token, onUnauth, sortKey, sortDir, page, pageSize, serverSearch, localStatus, localCriticidade, filters]);

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

  const { resumo } = payload;
  const escolasAvaliadas = resumo.saudaveis + resumo.atencao + resumo.criticas;
  const totalPages = payload.total_pages;

  const pageStart = payload.escolas.length > 0
    ? (payload.page - 1) * payload.page_size + 1
    : 0;
  const pageEnd = pageStart > 0 ? pageStart + payload.escolas.length - 1 : 0;

  return (
    <div className="space-y-6">
      <header data-pres-hide="true" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
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
        <div className="lg:max-w-xl">
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Base: censos concluídos de {payload.ano_referencia} · cobertura:{" "}
              {escolasAvaliadas.toLocaleString("pt-BR")} de{" "}
              {payload.total_escolas.toLocaleString("pt-BR")} escolas cadastradas
            </span>
            <SaudeOperacionalMetodologiaInfo />
          </div>
          <div className="mt-3 flex lg:justify-end">
            <ReportButton
              reportId="saude-operacional-escolas"
              token={token}
              filters={filters}
              onUnauth={onUnauth}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 lg:text-right">
            Escolas sem censo concluído no ano aparecem como pendentes de censo.
          </p>
        </div>
      </header>

      <div
        data-pres-hide="true"
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      >
        <div className="mb-2.5 flex items-center gap-2">
          <Filter size={14} style={{ color: C.primary }} />
          <span className="text-xs font-semibold text-slate-600">Filtros</span>
          {totalActiveCount > 0 && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: C.primary }}
            >
              {totalActiveCount}
            </span>
          )}
          {totalActiveCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={12} />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Ano de referência"
            value={filters?.ano}
            options={opcoes?.anos ?? []}
            onChange={(v) => setGlobalFilter("ano", v)}
          />
          <FilterSelect
            label="Região de Integração"
            value={filters?.regiao_integracao}
            options={opcoes?.regioes_integracao ?? []}
            onChange={(v) => setGlobalFilter("regiao_integracao", v)}
          />
          <FilterSelect
            label="DRE"
            value={filters?.dre}
            options={opcoes?.dres ?? []}
            onChange={(v) => setGlobalFilter("dre", v)}
          />
          <FilterSelect
            label="Município"
            value={filters?.municipio}
            options={opcoes?.municipios ?? []}
            onChange={(v) => setGlobalFilter("municipio", v)}
          />
          <FilterSelect
            label="Zona"
            value={filters?.zona}
            options={opcoes?.zonas ?? []}
            onChange={(v) => setGlobalFilter("zona", v)}
          />
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Status
            </label>
            <select
              value={localStatus}
              onChange={(event) => handleLocalStatusChange(event.target.value as LocalStatusFilter)}
              className={`rounded-lg border py-1.5 pl-2.5 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                localStatus !== "todos"
                  ? "border-blue-300 bg-blue-50 font-semibold text-blue-800"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              style={{ minWidth: 140 }}
            >
              {LOCAL_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Criticidade
            </label>
            <select
              value={localCriticidade}
              onChange={(event) => handleLocalCriticidadeChange(event.target.value as LocalCriticidadeFilter)}
              className={`rounded-lg border py-1.5 pl-2.5 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                localCriticidade !== "todas"
                  ? "border-blue-300 bg-blue-50 font-semibold text-blue-800"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              style={{ minWidth: 160 }}
            >
              {LOCAL_CRITICIDADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div data-pres-slide="saude-resumo-indicadores" className="space-y-6">
      <div id="sec-saude-resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Escolas avaliadas"
          value={escolasAvaliadas}
          Icon={Building2}
          tone="blue"
          sub={`${escolasAvaliadas.toLocaleString("pt-BR")} de ${payload.total_escolas.toLocaleString("pt-BR")} cadastradas`}
        />
        <SummaryCard
          label="Saudáveis"
          value={resumo.saudaveis}
          Icon={CircleCheck}
          tone="green"
        />
        <SummaryCard
          label="Em atenção"
          value={resumo.atencao}
          Icon={CircleAlert}
          tone="amber"
        />
        <SummaryCard
          label="Críticas"
          value={resumo.criticas}
          Icon={AlertCircle}
          tone="rose"
        />
        <SummaryCard
          label="Pendentes de censo"
          value={resumo.sem_dados}
          Icon={CircleHelp}
          tone="slate"
        />
        <SummaryCard
          label="Média de saúde"
          value={fmtDecimal(resumo.saude_media)}
          Icon={Activity}
          tone="purple"
          sub="Escolas com nota"
        />
      </div>
      </div>

      <div data-pres-hide="true" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => handleSearchChange(sanitize(event.target.value).slice(0, 150))}
            placeholder="Buscar por escola, município, DRE ou INEP…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <p className="whitespace-nowrap text-xs text-slate-500">
          {serverSearch
            ? (
              <>
                <strong className="text-slate-700">{payload.total_filtrado.toLocaleString("pt-BR")}</strong>
                {" "}encontradas de{" "}
                <strong className="text-slate-700">{payload.total_escolas.toLocaleString("pt-BR")}</strong> escolas
              </>
            )
            : (
              <>
                <strong className="text-slate-700">{payload.total_escolas.toLocaleString("pt-BR")}</strong> escolas no total
              </>
            )}
        </p>
      </div>

      {loading && (
        <div data-pres-hide="true" className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="animate-spin" size={14} style={{ color: C.primary }} />
          Atualizando…
        </div>
      )}

      <div data-pres-slide="saude-escolas-tabela">
        {payload.total_escolas === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <CircleHelp size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Nenhuma escola disponível.</p>
            <p className="mt-1 text-xs text-slate-400">
              O endpoint não retornou registros para o ano de referência.
            </p>
          </div>
        ) : (
          <div id="sec-saude-escolas" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div data-pres-table-scroll="true" className="overflow-x-auto">
              <table className="min-w-[1900px] w-full text-sm">
                <thead style={{ background: C.primary }} className="text-white">
                  <tr>
                    <th scope="col" className="w-16 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide">
                      Farol
                    </th>
                    <SortHeader label="Escola" sortKey="escola" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="min-w-64" />
                    <SortHeader label="Município" sortKey="municipio" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="DRE" sortKey="dre" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Zona" sortKey="zona" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Alunos" sortKey="total_alunos" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Aln/sala" sortKey="alunos_por_sala" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Saúde" sortKey="saude" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Criticidade" sortKey="criticidade" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Infra" sortKey="infraestrutura" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Energia" sortKey="energia" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Merenda" sortKey="merenda" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Segur." sortKey="seguranca" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Pessoal" sortKey="pessoal" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Tec." sortKey="tecnologia" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Pedag." sortKey="pedagogico" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                    <SortHeader label="Gov." sortKey="governanca" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payload.escolas.map((escola: SaudeOperacionalEscola) => (
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
                      <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.pedagogico} /></td>
                      <td className="px-3 py-3 text-center"><DimensionBadge value={escola.dimensoes.governanca} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {payload.escolas.length === 0 && (
              <div className="border-t border-slate-100 px-6 py-12 text-center">
                <Search size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  Nenhuma escola encontrada para o recorte atual.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {hasLocalFilters
                    ? "Ajuste os filtros da aba ou limpe-os para ampliar o resultado."
                    : "Tente outro termo de busca."}
                </p>
              </div>
            )}

            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Linhas por página:</span>
                <div className="flex gap-1">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handlePageSizeChange(size)}
                      className={`rounded px-2 py-1 font-medium transition-colors ${
                        pageSize === size
                          ? "text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                      style={pageSize === size ? { background: C.primary } : undefined}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs text-slate-500">
                {pageStart > 0 && (
                  <span className="mr-2">
                    {pageStart.toLocaleString("pt-BR")}–{pageEnd.toLocaleString("pt-BR")} de{" "}
                    <strong className="text-slate-700">{payload.total_filtrado.toLocaleString("pt-BR")}</strong>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handlePageChange(Math.max(1, payload.page - 1))}
                  disabled={payload.page <= 1 || totalPages === 0}
                  className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft size={13} />
                  Anterior
                </button>
                <span className="px-2 font-medium text-slate-700">
                  {totalPages === 0 ? "0 de 0" : `${payload.page} / ${totalPages}`}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(Math.min(totalPages, payload.page + 1))}
                  disabled={totalPages === 0 || payload.page >= totalPages}
                  className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próxima
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div data-pres-hide="true" className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <CircleHelp size={15} className="mt-0.5 shrink-0" />
        <span>
          Saúde, criticidade, status e notas dimensionais são exibidos conforme retornados pelo backend.
          As dimensões Pedagógico e Governança já estão habilitadas. Pedagógico utiliza o IDEB oficial
          mais recente disponível na base.
        </span>
      </div>
    </div>
  );
}
