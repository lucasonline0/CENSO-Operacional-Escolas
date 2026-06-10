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
    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
      <table className="w-full text-sm min-w-[880px]">
        <thead style={{ background: C.primary }} className="text-white">
          <tr>
            {["Escola","INEP","Município","DRE","Ano","Status","Planilha","Atualizado",""].map((h, i) => (
              <th key={i} className={`px-4 py-3 font-semibold ${i >= 4 ? "text-center" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((r, i) => (
            <tr key={r.census_id} className={`border-t border-slate-100 ${i%2===0?"bg-white":"bg-slate-50/40"} hover:bg-blue-50/50 transition-colors`}>
              <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate" title={r.nome_escola}>{r.nome_escola}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.codigo_inep}</td>
              <td className="px-4 py-3 text-slate-600">{r.municipio}</td>
              <td className="px-4 py-3 text-slate-600 max-w-[130px] truncate" title={r.dre}>{r.dre}</td>
              <td className="px-4 py-3 text-center text-slate-600">{r.year}</td>
              <td className="px-4 py-3 text-center"><StatusPill status={r.status} /></td>
              <td className="px-4 py-3 text-center text-lg">
                {r.synced
                  ? <span className="inline-flex w-7 h-7 rounded-full bg-emerald-50 items-center justify-center text-emerald-600"><CheckCircle2 size={15}/></span>
                  : r.status === "completed"
                  ? <span className="inline-flex w-7 h-7 rounded-full bg-amber-50 items-center justify-center text-amber-500"><Clock size={15}/></span>
                  : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(r.updated_at)}</td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => onView(r.census_id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors">
                  <Eye size={12}/> Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 text-right px-4 py-2 border-t border-slate-100">{safeRows.length} registro(s)</p>
    </div>
  );
}
