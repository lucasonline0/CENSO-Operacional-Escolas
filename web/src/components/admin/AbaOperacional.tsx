import React from "react";
import { Building2, CheckCircle2, FileText, CloudUpload, Search } from "lucide-react";
import { StatCard } from "./shared/StatCard";
import { CensusTable } from "./shared/CensusTable";
import { sanitize } from "./shared/api";
import type { CensusRow, DashboardData } from "./shared/types";

export function AbaOperacional({
  dbData,
  search,
  setSearch,
  filteredRecent,
  onView,
  formatDate,
}: {
  dbData: DashboardData;
  search: string;
  setSearch: (s: string) => void;
  filteredRecent: CensusRow[];
  onView: (id: number) => void;
  formatDate: (s: string) => string;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Escolas Cadastradas" value={dbData.total_schools}       Icon={Building2}    tone="blue"   />
        <StatCard label="Censos Concluídos"   value={dbData.completed_censuses}  Icon={CheckCircle2} tone="green"  />
        <StatCard label="Rascunhos"            value={dbData.draft_censuses}      Icon={FileText}     tone="amber"  />
        <StatCard label="Pendente na Planilha" value={dbData.pending_sync}        Icon={CloudUpload}  tone="orange" />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Envios Recentes</h2>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" placeholder="Buscar escola, INEP…" value={search}
            onChange={(e) => setSearch(sanitize(e.target.value).slice(0,100))}
            className="bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-64" />
        </div>
      </div>
      <CensusTable rows={filteredRecent} onView={onView} formatDate={formatDate} />
    </div>
  );
}
