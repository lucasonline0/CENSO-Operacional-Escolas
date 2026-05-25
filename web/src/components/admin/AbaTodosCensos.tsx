import React from "react";
import { Filter, Search, Loader2 } from "lucide-react";
import { CensusTable } from "./shared/CensusTable";
import { sanitize } from "./shared/api";
import type { CensusRow, DashboardData } from "./shared/types";

export function AbaTodosCensos({
  dbData,
  allCensus,
  filterStatus,
  setFilterStatus,
  filterDre,
  setFilterDre,
  search,
  setSearch,
  filteredCensus,
  onView,
  formatDate,
}: {
  dbData: DashboardData | null;
  allCensus: CensusRow[] | null;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  filterDre: string;
  setFilterDre: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  filteredCensus: CensusRow[];
  onView: (id: number) => void;
  formatDate: (s: string) => string;
}) {
  return (
    <div className="space-y-4">
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
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" placeholder="Buscar…" value={search}
            onChange={(e) => setSearch(sanitize(e.target.value).slice(0,100))}
            className="bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52" />
        </div>
      </div>
      {allCensus === null
        ? <div className="bg-white rounded-2xl py-14 text-center text-slate-400 text-sm border border-slate-200"><Loader2 className="animate-spin mx-auto mb-2" size={18} />Carregando…</div>
        : <CensusTable rows={filteredCensus} onView={onView} formatDate={formatDate} />}
    </div>
  );
}
