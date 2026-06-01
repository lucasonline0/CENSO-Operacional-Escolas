import React from "react";
import { C } from "./constants";

// Vertical bar chart (estilo Looker Studio)
export function VBarChart({
  rows,
  color = C.primary,
  showPct = true,
}: {
  rows: { label: string; value: number }[];
  color?: string;
  showPct?: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max   = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex items-end justify-around gap-3 w-full h-52 pt-6 relative">
      {rows.map((r) => {
        const pct    = total > 0 ? ((r.value / total) * 100).toFixed(1) : "0.0";
        const height = total > 0 ? (r.value / max) * 100 : 0;
        return (
          <div key={r.label} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            {/* label acima da barra */}
            <span className="text-xs font-bold tabular-nums" style={{ color }}>
              {showPct ? `${pct}%` : r.value.toLocaleString("pt-BR")}
            </span>
            {/* barra */}
            <div className="w-full max-w-[56px] flex items-end" style={{ height: "120px" }}>
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{ height: `${Math.max(height, 2)}%`, background: color }}
              />
            </div>
            {/* rótulo abaixo */}
            <span className="text-xs text-slate-500 text-center leading-tight line-clamp-2 w-full">{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal bar chart.
// A largura da barra é proporcional a `value` (mantém o comportamento
// histórico). Por linha:
//   - o rótulo dentro da barra é `display`, quando informado (senão usa
//     o formato numérico padrão `value` + `unit`);
//   - `trailing`, quando informado, é renderizado FORA da barra, à direita,
//     em cinza — útil para exibir o percentual ao lado do valor numérico.
// Quando nenhuma linha tem `trailing`, a coluna à direita não é renderizada,
// preservando o layout original das demais abas.
export function HBarChart({
  rows,
  unit = "",
  color = C.primary,
}: {
  rows: { label: string; value: number; display?: string; trailing?: string }[];
  unit?: string;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const showTrailing = rows.some((r) => r.trailing !== undefined);
  return (
    <div className="space-y-2 w-full">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        return (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0 text-right text-slate-500 text-xs">{r.label}</span>
            <div className="flex-1 h-6 bg-slate-100 rounded relative overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-white mix-blend-luminosity">
                {r.display ?? `${r.value.toLocaleString("pt-BR")}${unit}`}
              </span>
            </div>
            {showTrailing && (
              <span className="w-12 shrink-0 text-right text-slate-500 text-xs tabular-nums">
                {r.trailing}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
