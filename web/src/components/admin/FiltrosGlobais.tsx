"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { Filter, X, ChevronDown, Search } from "lucide-react";
import { C } from "./shared/constants";
import type { DashboardFilters, FiltrosOpcoes, AdminProfile, FiltrosEscolaItem } from "./shared/types";

const EMPTY: DashboardFilters = {};

function SearchSelectEscola({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number | undefined;
  options: FiltrosEscolaItem[]; // Substitua 'any' pelo tipo correto da Escola, ex: { school_id: number, nome: string, inep: string, ... }
  onChange: (school_id: number | undefined) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fechar o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasValue = value !== undefined;
  const selectedOption = options.find((opt) => opt.school_id === value);

  // Filtra as opções pelo termo de busca (nome ou INEP)
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const lowerSearch = searchTerm.toLowerCase();
    return options.filter(
      (opt) =>
        opt.nome_escola?.toLowerCase().includes(lowerSearch) ||
        opt.codigo_inep?.toLowerCase().includes(lowerSearch)
    );
  }, [searchTerm, options]);

  return (
    <div className="relative flex flex-col gap-0.5" ref={wrapperRef}>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      
      {/* Botão que abre o Select / Input de busca */}
      <div 
        className={`relative flex items-center rounded-lg border focus-within:ring-2 focus-within:ring-blue-400 ${
          disabled
            ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
            : hasValue && !isOpen
            ? "border-blue-300 bg-blue-50 text-blue-800"
            : "border-slate-200 bg-white text-slate-700"
        }`}
        style={{ minWidth: 220 }}
      >
        {isOpen ? (
          <div className="flex w-full items-center pl-2.5">
            <Search size={14} className="text-slate-400 mr-1" />
            <input
              autoFocus
              type="text"
              className="w-full py-1.5 pr-7 text-xs bg-transparent outline-none"
              placeholder="Buscar por nome ou INEP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(true)}
            className="w-full text-left py-1.5 pl-2.5 pr-7 text-xs font-semibold truncate"
          >
            {hasValue && selectedOption ? (
              <span className="truncate">{selectedOption.nome_escola}</span>
            ) : (
              <span className="font-normal text-slate-600">Todas as escolas</span>
            )}
          </button>
        )}
        
        {/* Ícone ou botão de limpar */}
        <div className="absolute right-2 flex items-center">
          {hasValue && !isOpen && !disabled ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
                setSearchTerm("");
              }}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200/50"
            >
              <X size={12} />
            </button>
          ) : (
            <ChevronDown size={14} className="text-slate-400 pointer-events-none" />
          )}
        </div>
      </div>

      {/* Dropdown de Opções */}
      {isOpen && (
        <div className="absolute top-[100%] left-0 z-10 mt-1 max-h-96 w-[450] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">Nenhuma escola encontrada.</div>
          ) : (
            filteredOptions.map((opt) => (
              <button
                key={opt.school_id}
                type="button"
                onClick={() => {
                  onChange(opt.school_id);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
                className={`w-full text-left px-3 py-2 hover:bg-slate-100 flex flex-col ${
                  value === opt.school_id ? "bg-blue-50" : ""
                }`}
              >
                <span className="text-[13px] font-medium text-slate-700 leading-tight">
                  {opt.nome_escola}
                </span>
          
                  <span className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {opt.municipio && <span className="font-semibold">{opt.municipio}</span>}
                    {opt.municipio && opt.dre && " • "}
                    {opt.dre && <span>{opt.dre}</span>}
                    {(opt.municipio || opt.dre) && opt.codigo_inep && " • "}
                    {opt.codigo_inep ? `INEP: ${opt.codigo_inep}` : "Sem INEP"}
                  </span>
              </button>
            ))
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
  disabled = false,
}: {
  label: string;
  value: string | number | undefined;
  options: (string | number)[];
  onChange: (v: string) => void;
  disabled?: boolean;
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
        disabled={disabled}
        className={`rounded-lg border py-1.5 pl-2.5 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
          disabled
            ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
            : hasValue
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
  profile,
}: {
  opcoes: FiltrosOpcoes | null;
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
  profile?: AdminProfile | null;    
}) {
  const isDreUser = profile?.role === "dre";

  const activeCount = useMemo(
    () => Object.values(filters).filter((v) => v !== undefined && v !== "").length,
    [filters],
  );

  function set(key: keyof DashboardFilters, raw: string | number | undefined) {
    const next = { ...filters };
    if (raw === "" || raw === undefined) {
      delete next[key];
    } else if (key === "ano" || key === "school_id") {
      next[key] = Number(raw);
    } else {
      (next as Record<string, string>)[key] = String(raw);
    }

    if (key === "school_id" && raw !== undefined) {
      delete next.codigo_inep;
    }

    onFiltersChange(next);
  }

  function clear() {
    if (isDreUser && profile?.dre) {
      onFiltersChange({ dre: profile.dre });
    } else {
      onFiltersChange(EMPTY);
    }
  }
  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">

      {/* Linha superior: label + badge + indicação DRE + botão limpar */}
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

        {isDreUser && profile?.dre && (
          <span className="ml-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
            Acesso restrito à DRE: <strong>{profile.dre}</strong>
          </span>
        )}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
          disabled={isDreUser}
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
        <SearchSelectEscola
          label="Nome da Escola ou Código INEP"
          value={filters.school_id}
          options={opcoes?.escolas ?? []}
          onChange={(v) => set("school_id", v)}
          disabled={!opcoes?.escolas?.length}
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
            <ActiveTag label={`DRE: ${filters.dre}`} onRemove={isDreUser ? undefined : () => set("dre", "")} />
          )}
          {filters.municipio && (
            <ActiveTag label={`Município: ${filters.municipio}`} onRemove={() => set("municipio", "")} />
          )}
          {filters.zona && (
            <ActiveTag label={`Zona: ${filters.zona}`} onRemove={() => set("zona", "")} />
          )}
          {filters.school_id && (
            <ActiveTag label={`Escola: ${opcoes?.escolas?.find(e => e.school_id === filters.school_id)?.nome_escola || filters.school_id}`} 
              onRemove={() => set("school_id", undefined)} 
            />
          )}
        </div>
      )}
    </div>
  );
}

function ActiveTag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
      {label}
      {onRemove && (
        <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100"
        aria-label={`Remover filtro ${label}`}
      >
        <X size={10} />
      </button>
    )}
    </span>
  );
}
