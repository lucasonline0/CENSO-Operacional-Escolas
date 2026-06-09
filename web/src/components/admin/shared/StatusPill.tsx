import React from "react";
import { CheckCircle2, FileText } from "lucide-react";

export function StatusPill({ status }: { status: string }) {
  return status === "completed" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 size={11} strokeWidth={2.5} /> Concluído
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <FileText size={11} strokeWidth={2.5} /> Rascunho
    </span>
  );
}
