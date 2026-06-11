import React from "react";
import {
  Filter, Search, Loader2, ChevronLeft, ChevronRight,
  Building2, CheckCircle2, FileText, CloudUpload,
} from "lucide-react";
import { CensusTable } from "./shared/CensusTable";
import { StatCard } from "./shared/StatCard";
import { sanitize } from "./shared/api";
import type { CensusPage } from "./shared/types";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000];

export function AbaTodosCensos({
  censusPage,
  filterStatus,
  setFilterStatus,
  search,
  setSearch,
  censusLimit,
  setCensusLimit,
  censusPageNum,
  setCensusPageNum,
  onView,
  formatDate,
}: {
  censusPage: CensusPage | null;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
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
  const summary    = censusPage?.summary;

  return (
    <div className="space-y-4">
      {/* Cards de resumo — refletem o recorte dos filtros globais (summary),
          sem serem afetados por status, busca ou paginação da listagem. */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
          <StatCard label="Escolas Cadastradas" value={summary.total_schools}      Icon={Building2}    tone="blue"   />
          <StatCard label="Censos Concluídos"   value={summary.completed_censuses} Icon={CheckCircle2} tone="green"  />
          <StatCard label="Rascunhos"            value={summary.draft_censuses}     Icon={FileText}     tone="amber"  />
          <StatCard label="Pendente na Planilha" value={summary.pending_sync}       Icon={CloudUpload}  tone="orange" />
        </div>
      )}

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
        : <CensusTable rows={censusPage.rows} onView={onView} formatDate={formatDate} />}

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
