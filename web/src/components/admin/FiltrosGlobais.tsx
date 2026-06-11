"use client";

import React, { useMemo } from "react";
import { Filter, X } from "lucide-react";
import { C } from "./shared/constants";
import type { DashboardFilters, FiltrosOpcoes } from "./shared/types";

const EMPTY: DashboardFilters = {};

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

export function FiltrosGlobais({
  opcoes,
  filters,
  onFiltersChange,
}: {
  opcoes: FiltrosOpcoes | null;
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
}) {
  const activeCount = useMemo(
    () => Object.values(filters).filter((v) => v !== undefined && v !== "").length,
    [filters],
  );

  function set(key: keyof DashboardFilters, raw: string) {
    const next = { ...filters };
    if (raw === "") {
      delete next[key];
    } else if (key === "ano") {
      next.ano = Number(raw);
    } else {
      (next as Record<string, string>)[key] = raw;
    }
    onFiltersChange(next);
  }

  function clear() {
    onFiltersChange(EMPTY);
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">

      {/* Linha superior: label + badge + botão limpar */}
      <div className="flex items-center gap-2 mb-2.5">
        <Filter size={14} style={{ color: C.primary }} />
        <span className="text-xs font-semibold text-slate-600">Filtros</span>
        {activeCount > 0 && (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: C.primary }}
          >
            {activeCount}
          </span>
        )}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={12} />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Linha inferior: selects */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Ano de referência"
          value={filters.ano}
          options={opcoes?.anos ?? []}
          onChange={(v) => set("ano", v)}
        />
        <FilterSelect
          label="Região de Integração"
          value={filters.regiao_integracao}
          options={opcoes?.regioes_integracao ?? []}
          onChange={(v) => set("regiao_integracao", v)}
        />
        <FilterSelect
          label="DRE"
          value={filters.dre}
          options={opcoes?.dres ?? []}
          onChange={(v) => set("dre", v)}
        />
        <FilterSelect
          label="Município"
          value={filters.municipio}
          options={opcoes?.municipios ?? []}
          onChange={(v) => set("municipio", v)}
        />
        <FilterSelect
          label="Zona"
          value={filters.zona}
          options={opcoes?.zonas ?? []}
          onChange={(v) => set("zona", v)}
        />
      </div>

      {/* Tags dos filtros ativos */}
      {activeCount > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {filters.ano && (
            <ActiveTag label={`Ano: ${filters.ano}`} onRemove={() => set("ano", "")} />
          )}
          {filters.regiao_integracao && (
            <ActiveTag label={`Região: ${filters.regiao_integracao}`} onRemove={() => set("regiao_integracao", "")} />
          )}
          {filters.dre && (
            <ActiveTag label={`DRE: ${filters.dre}`} onRemove={() => set("dre", "")} />
          )}
          {filters.municipio && (
            <ActiveTag label={`Município: ${filters.municipio}`} onRemove={() => set("municipio", "")} />
          )}
          {filters.zona && (
            <ActiveTag label={`Zona: ${filters.zona}`} onRemove={() => set("zona", "")} />
          )}
        </div>
      )}
    </div>
  );
}

function ActiveTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100"
        aria-label={`Remover filtro ${label}`}
      >
        <X size={10} />
      </button>
    </span>
  );
}
