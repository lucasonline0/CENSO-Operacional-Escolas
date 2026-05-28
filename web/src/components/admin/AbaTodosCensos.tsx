import React from "react";
import { Filter, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { CensusTable } from "./shared/CensusTable";
import { sanitize } from "./shared/api";
import type { CensusRow, CensusPage, DashboardData } from "./shared/types";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000];

export function AbaTodosCensos({
  dbData,
  censusPage,
  filterStatus,
  setFilterStatus,
  filterDre,
  setFilterDre,
  search,
  setSearch,
  filteredCensus,
  censusLimit,
  setCensusLimit,
  censusPageNum,
  setCensusPageNum,
  onView,
  formatDate,
}: {
  dbData: DashboardData | null;
  censusPage: CensusPage | null;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  filterDre: string;
  setFilterDre: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  filteredCensus: CensusRow[];
  censusLimit: number;
  setCensusLimit: (l: number) => void;
  censusPageNum: number;
  setCensusPageNum: (p: number) => void;
  onView: (id: number) => void;
  formatDate: (s: string) => string;
}) {
  const total      = censusPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / censusLimit));
  const firstRow   = total === 0 ? 0 : (censusPageNum - 1) * censusLimit + 1;
  const lastRow    = Math.min(censusPageNum * censusLimit, total);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
        <Filter size={15} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-700">Filtros:</span>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Todos os status</option>
          <option value="completed">Concluído</option>
          <option value="draft">Rascunho</option>
        </select>

        <select value={filterDre} onChange={(e) => setFilterDre(e.target.value)}
          className="border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs">
          <option value="">Todas as DREs</option>
          {(dbData?.by_dre ?? []).map((d) => <option key={d.dre} value={d.dre}>{d.dre}</option>)}
        </select>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Exibir</span>
          <select
            value={censusLimit}
            onChange={(e) => setCensusLimit(Number(e.target.value))}
            className="border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>por página</span>
        </div>

        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" placeholder="Buscar…" value={search}
            onChange={(e) => setSearch(sanitize(e.target.value).slice(0, 100))}
            className="bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52" />
        </div>
      </div>

      {/* Tabela */}
      {censusPage === null
        ? <div className="bg-white rounded-2xl py-14 text-center text-slate-400 text-sm border border-slate-200">
            <Loader2 className="animate-spin mx-auto mb-2" size={18} />Carregando…
          </div>
        : <CensusTable rows={filteredCensus} onView={onView} formatDate={formatDate} />}

      {/* Rodapé de paginação */}
      {censusPage !== null && (
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            {total === 0
              ? "Nenhum registro encontrado"
              : `Exibindo ${firstRow}–${lastRow} de ${total} registros`}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCensusPageNum(1)}
              disabled={censusPageNum === 1}
              className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-xs"
            >«</button>
            <button
              onClick={() => setCensusPageNum(censusPageNum - 1)}
              disabled={censusPageNum === 1}
              className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            ><ChevronLeft size={14} /></button>

            <span className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-medium text-xs">
              Página {censusPageNum} de {totalPages}
            </span>

            <button
              onClick={() => setCensusPageNum(censusPageNum + 1)}
              disabled={censusPageNum >= totalPages}
              className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            ><ChevronRight size={14} /></button>
            <button
              onClick={() => setCensusPageNum(totalPages)}
              disabled={censusPageNum >= totalPages}
              className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-xs"
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}
