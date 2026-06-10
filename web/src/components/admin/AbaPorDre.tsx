import React from "react";
import { MapPinned } from "lucide-react";
import { C } from "./shared/constants";
import type { DashboardData } from "./shared/types";

export function AbaPorDre({ dbData }: { dbData: DashboardData }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-fade-in-up">
      <div className="px-6 py-4 border-b flex items-start gap-2" style={{ background: C.primaryLight }}>
        <MapPinned size={16} style={{ color: C.primary }} className="mt-0.5 shrink-0" />
        <div>
          <h2 className="font-semibold text-slate-800 text-sm">Andamento do Preenchimento por Diretoria Regional de Ensino</h2>
          <p className="text-xs text-slate-500 mt-0.5">Percentual de escolas com censo concluído ou em rascunho, agrupado por DRE.</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {["DRE","Total","Concluídos","Rascunhos","% Conclusão"].map((h, i) => (
              <th key={i} className={`px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide ${i===0?"text-left":"text-center"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dbData.by_dre.map((d, i) => {
            const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
            return (
              <tr key={d.dre} className={`transition-colors hover:bg-blue-50/40 ${i%2===0?"bg-white":"bg-slate-50/50"}`}>
                <td className="px-5 py-3 font-medium text-slate-800">{d.dre}</td>
                <td className="px-5 py-3 text-center text-slate-600 tabular-nums">{d.total}</td>
                <td className="px-5 py-3 text-center text-emerald-700 font-semibold tabular-nums">{d.completed}</td>
                <td className="px-5 py-3 text-center text-amber-600 tabular-nums">{d.draft}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: C.primary }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-10 text-right tabular-nums">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
