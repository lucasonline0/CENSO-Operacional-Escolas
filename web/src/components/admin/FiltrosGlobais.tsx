"use client";

import React, { useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import { C } from "./shared/constants";
import type { DashboardFilters, FiltrosOpcoes, FiltrosEscolaItem } from "./shared/types";

const EMPTY: DashboardFilters = {};

function SearchSelect<T>({
  label,
  value,
  options = [],
  onChange,
  placeholder = "Todas",
  getOptionLabel,
  getOptionValue,
  getOptionSubtext,
}: {
  label: string;
  value: string | number | undefined;
  options: T[];
  onChange: (v: string) => void;
  placeholder?: string;
  getOptionLabel: (option: T) => string;
  getOptionValue: (option: T) => string | number;
  getOptionSubtext?: (option: T) => string | undefined;
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  const selected = options.find((opt) => String(getOptionValue(opt)) === String(value));
  
  const [query, setQuery] = useState(selected ? getOptionLabel(selected) : "");
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (value === undefined || value === null || value === "") {
      setQuery("");
    } else if (selected) {
      setQuery(getOptionLabel(selected));
    }
  }, [value, selected, getOptionLabel]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((opt) => {
    const labelText = getOptionLabel(opt).toLowerCase();
    const subText = getOptionSubtext ? (getOptionSubtext(opt) || "").toLowerCase() : "";
    const term = query.toLowerCase();

    return labelText.includes(term) || subText.includes(term);
  });

  return (
    <div ref={containerRef} className="relative flex flex-col gap-0.5" style={{ minWidth: 240 }}>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>

      <div className="relative flex items-center">
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);

            if (!e.target.value.trim()) {
              onChange("");
            }
          }}
          className={`w-full rounded-lg border py-1.5 pl-2.5 pr-7 text-xs outline-none focus:ring-2 focus:ring-blue-400 ${
            value
              ? "border-blue-300 bg-blue-50 font-semibold text-blue-800"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onChange("");
              setIsOpen(false);
            }}
            className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 w-80 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg flex flex-col gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); 
              onChange("");
              setQuery("");
              setIsOpen(false);
            }}
            className="w-full rounded px-2.5 py-1.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Todas
          </button>

          {filtered.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-slate-400 text-center">
              Nenhuma opção encontrada
            </div>
          ) : (
            filtered.map((opt, index) => {
              const optValue = getOptionValue(opt);
              const optLabel = getOptionLabel(opt);
              const optSubtext = getOptionSubtext?.(opt);
              const isSelected = String(optValue) === String(value);

              return (
                <button
                  key={`${optValue}-${index}`}
                  type="button"
                  onMouseDown={(eEvent) => {
                    eEvent.preventDefault();
                    onChange(String(optValue));
                    setQuery(optLabel);
                    setIsOpen(false);
                  }}
                  className={`w-full rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-blue-50 font-bold text-blue-700"
                      : "text-slate-800 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <div className="truncate font-medium">{optLabel}</div>
                  {optSubtext && (
                    <div className="text-[10px] text-slate-400 truncate">
                      {optSubtext}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number | undefined;
  options: (string | number | { label: string; value: string | number })[];
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
        {options.map((opt, index) => {
          const optValue = typeof opt === "object" ? opt.value : opt;
          const optLabel = typeof opt === "object" ? opt.label : opt;
          return (
            <option key={index} value={optValue}>
              {optLabel}
            </option> 
          );  
        })}
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

  // Lista de codigos INEP (sem nulos ou código dupos)

  const inepOptions = useMemo(() => {

  if (!opcoes?.escolas) return [];

  const list = opcoes.escolas

  .map((e) => e.codigo_inep)

  .filter((inep): inep is string => Boolean(inep));

  return Array.from(new Set(list));

  }, [opcoes]);

  function set(key: keyof DashboardFilters, raw: string) {
    const next = { ...filters };
    if (raw === "") {
      delete next[key];
    } else if (key === "ano" || key === "school_id") {
      next[key] = Number(raw);
    } else {
      (next as Record<string, string>)[key] = raw;
    }

    if (key === "school_id" && raw !== "") {
      delete next.codigo_inep;
    }

    if (key === "codigo_inep" && raw !== "") {
      delete next.school_id;
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
        <SearchSelect
          label="Nome da escola ou INEP"
          value={filters.school_id}
          options={opcoes?.escolas ?? []}
          getOptionLabel={(e) => e.nome_escola}
          getOptionValue={(e) => e.school_id}
          getOptionSubtext={(e) => e.codigo_inep ? `INEP: ${e.codigo_inep}` : undefined}
          onChange={(v) => set("school_id", v)}
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
          {filters.school_id && (
            <ActiveTag
              label={`Escola: ${
                opcoes?.escolas.find((e) => e.school_id === filters.school_id)?.nome_escola ?? filters.school_id
              }`}
              onRemove={() => set("school_id", "")}
            />
          )}
          {filters.codigo_inep && (
            <ActiveTag
              label={`INEP: ${filters.codigo_inep}`}
              onRemove={() => set("codigo_inep", "")}
            />
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
