"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Database, X, Loader2, AlertCircle, Copy, Download } from "lucide-react";
import { apiFetch } from "./api";
import { C } from "./constants";
import type { CensusFull } from "./types";

function highlight(json: string): React.ReactNode[] {
  return json.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g).map((tok, i) => {
    if (!tok) return null;
    if (/^"/.test(tok)) return <span key={i} className={tok.endsWith(":") ? "text-sky-400 font-medium" : "text-emerald-400"}>{tok}</span>;
    if (/^(true|false)$/.test(tok)) return <span key={i} className="text-purple-400 font-medium">{tok}</span>;
    if (/^null$/.test(tok))          return <span key={i} className="text-slate-500">{tok}</span>;
    if (/^-?\d/.test(tok))           return <span key={i} className="text-orange-400">{tok}</span>;
    return <span key={i} className="text-slate-400">{tok}</span>;
  });
}

export function JsonModal({ censusId, token, onClose }: { censusId: number; token: string; onClose: () => void }) {
  const [data, setData]     = useState<CensusFull | null>(null);
  const [err, setErr]       = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<CensusFull>(`/v1/admin/census/${censusId}`, token).then(setData).catch((e) => setErr((e as Error).message));
  }, [censusId, token]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const fmt = useMemo(() => (data ? JSON.stringify(data.data ?? {}, null, 2) : ""), [data]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(fmt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  const dl = () => {
    if (!data) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `censo_${data.codigo_inep}_${data.year}.json`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: C.primaryLight }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: C.primary }}>
              <Database size={19} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Resposta do Censo — JSON</h2>
              {data && <p className="text-xs text-slate-600">{data.nome_escola} · INEP {data.codigo_inep} · {data.year}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-black/10 flex items-center justify-center text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-900">
          {!data && !err && <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin mr-2" size={22} /> Carregando…</div>}
          {err   && <div className="flex items-center justify-center py-20 text-rose-400"><AlertCircle size={18} className="mr-2" />{err}</div>}
          {data  && <pre className="text-xs font-mono leading-relaxed p-5 whitespace-pre-wrap break-words">{highlight(fmt)}</pre>}
        </div>
        <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">{data ? `${fmt.length.toLocaleString("pt-BR")} chars` : ""}</span>
          <div className="flex gap-2">
            <button onClick={copy} disabled={!data} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 text-slate-700">
              <Copy size={13} /> {copied ? "Copiado!" : "Copiar"}
            </button>
            <button onClick={dl} disabled={!data} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: C.primary }}>
              <Download size={13} /> Baixar JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
