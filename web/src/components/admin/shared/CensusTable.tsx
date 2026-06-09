import React from "react";
import { Database, CheckCircle2, Clock, Eye } from "lucide-react";
import { C } from "./constants";
import { StatusPill } from "./StatusPill";
import type { CensusRow } from "./types";

export function CensusTable({
  rows,
  onView,
  formatDate,
}: {
  rows: CensusRow[] | null;
  onView: (id: number) => void;
  formatDate: (s: string) => string;
}) {
  const safeRows = rows ?? [];
  if (!safeRows.length) return (
    <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center text-slate-400 text-sm shadow-sm">
      <Database size={28} className="mx-auto mb-2 opacity-40" /> Nenhum registro encontrado.
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[880px]">
          <thead>
            <tr>
              {["Escola","INEP","Município","DRE","Ano","Status","Planilha","Atualizado",""].map((h, i) => (
                <th key={i} className={i >= 4 ? "text-center" : "text-left"}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeRows.map((r) => (
              <tr key={r.census_id}>
                <td className="font-medium max-w-[200px] truncate" title={r.nome_escola}>{r.nome_escola}</td>
                <td className="font-mono text-xs opacity-70">{r.codigo_inep}</td>
                <td>{r.municipio}</td>
                <td className="max-w-[130px] truncate" title={r.dre}>{r.dre}</td>
                <td className="text-center">{r.year}</td>
                <td className="text-center"><StatusPill status={r.status} /></td>
                <td className="text-center">
                  {r.synced
                    ? <span className="inline-flex w-7 h-7 rounded-full bg-emerald-500/10 items-center justify-center text-emerald-500"><CheckCircle2 size={15}/></span>
                    : r.status === "completed"
                    ? <span className="inline-flex w-7 h-7 rounded-full bg-amber-500/10 items-center justify-center text-amber-500"><Clock size={15}/></span>
                    : <span className="opacity-30">—</span>}
                </td>
                <td className="text-xs opacity-50 whitespace-nowrap">{formatDate(r.updated_at)}</td>
                <td className="text-center">
                  <button onClick={() => onView(r.census_id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 transition-colors">
                    <Eye size={12}/> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-40 text-right px-4 py-2 border-t border-slate-100">{safeRows.length} registro(s)</p>
    </div>
  );
}
