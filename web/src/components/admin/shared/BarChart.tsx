import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { C } from "./constants";

// Componente interno para exibir o tooltip flutuante
function ChartTooltip({
  active,
  label,
  value,
  pct,
  unit = "",
  x,
  y,
}: {
  active: boolean;
  label: string;
  value: number;
  pct?: string;
  unit?: string;
  x: number;
  y: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
  }, []);

  if (!active || !mounted) return null;

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-xs flex flex-col gap-1 min-w-[140px] border border-slate-700/50 backdrop-blur-sm animate-scale-in"
      style={{ left: x + 16, top: y - 16 }}
    >
      <div className="font-bold border-b border-white/10 pb-1 mb-1">{label}</div>
      <div className="flex justify-between items-center gap-4">
        <span className="text-slate-400">Quantidade:</span>
        <span className="font-mono font-bold">{value.toLocaleString("pt-BR")}{unit}</span>
      </div>
      {pct && (
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-400">Representação:</span>
          <span className="font-mono font-bold">{pct}%</span>
        </div>
      )}
    </div>,
    document.body
  );
}
// Vertical bar chart (estilo Looker Studio).
export function VBarChart({
  rows,
  color = C.primary,
  showPct = true,
  barMaxWidth = 56,
  gapClass = "gap-3",
  valueInside = false,
}: {
  rows: { label: string; value: number }[];
  color?: string;
  showPct?: boolean;
  barMaxWidth?: number;
  gapClass?: string;
  valueInside?: boolean;
}) {
  const [hovered, setHovered] = useState<{ label: string; value: number; pct: string; x: number; y: number } | null>(null);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className={`flex items-end justify-around ${gapClass} w-full h-52 pt-6 relative`}>
      <ChartTooltip
        active={!!hovered}
        label={hovered?.label ?? ""}
        value={hovered?.value ?? 0}
        pct={hovered?.pct}
        x={hovered?.x ?? 0}
        y={hovered?.y ?? 0}
      />
      {rows.map((r) => {
        const pctVal = total > 0 ? (r.value / total) * 100 : 0;
        const pctText = pctVal.toFixed(1);
        const height = total > 0 ? (r.value / max) * 100 : 0;
        const valueText = showPct ? `${pctText}%` : r.value.toLocaleString("pt-BR");
        return (
          <div
            key={r.label}
            className="flex flex-col items-center gap-1 flex-1 min-w-0 group cursor-default"
            onMouseMove={(e) => setHovered({ label: r.label, value: r.value, pct: pctText, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHovered(null)}
          >
            {/* valor acima da barra */}
            {!valueInside && (
              <span className="text-xs font-bold tabular-nums transition-transform group-hover:scale-110 group-hover:translate-y-[-2px]" style={{ color }}>
                {valueText}
              </span>
            )}
            {/* barra */}
            <div
              className="w-full flex items-end"
              style={{ height: "120px", maxWidth: barMaxWidth }}
            >
              <div
                className="w-full rounded-t-md transition-all duration-300 flex justify-center hover:opacity-90 hover:shadow-[0_-4px_12px_rgba(0,0,0,0.1)] cursor-pointer relative overflow-hidden group-hover:brightness-110"
                style={{ height: `${Math.max(height, 2)}%`, background: color }}
              >
                {valueInside && (
                  <span className="text-xs font-bold tabular-nums text-white pt-1.5">
                    {valueText}
                  </span>
                )}
                {/* Overlay de brilho no hover */}
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            {/* rótulo abaixo */}
            <span className="text-xs text-slate-500 text-center leading-tight line-clamp-2 w-full transition-colors group-hover:text-slate-900 group-hover:font-medium">{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal bar chart.
export function HBarChart({
  rows,
  unit = "",
  color = C.primary,
  labelWidth = "5rem",
  rowGap = "0.5rem",
}: {
  rows: { label: string; value: number; pct?: number; display?: string; trailing?: string }[];
  unit?: string;
  color?: string;
  labelWidth?: string;
  rowGap?: string;
}) {
  const [hovered, setHovered] = useState<{ label: string; value: number; pct?: string; x: number; y: number } | null>(null);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const showPct = rows.some((r) => r.pct !== undefined);
  const showTrailing = rows.some((r) => r.trailing !== undefined);

  return (
    <div className="flex flex-col w-full relative" style={{ gap: rowGap }}>
      <ChartTooltip
        active={!!hovered}
        label={hovered?.label ?? ""}
        value={hovered?.value ?? 0}
        pct={hovered?.pct}
        unit={unit}
        x={hovered?.x ?? 0}
        y={hovered?.y ?? 0}
      />
      {rows.map((r) => {
        const barWidth = (r.value / max) * 100;
        // Se a row já tiver pct, usa ela. Senão, calcula sobre o total do gráfico.
        const pctVal = r.pct ?? (total > 0 ? (r.value / total) * 100 : undefined);
        const pctText = pctVal !== undefined ? pctVal.toFixed(1) : undefined;

        return (
          <div
            key={r.label}
            className="flex items-center gap-3 text-sm group cursor-default"
            onMouseMove={(e) => setHovered({ label: r.label, value: r.value, pct: pctText, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="shrink-0 text-right text-slate-500 text-xs transition-colors group-hover:text-slate-900 group-hover:font-medium" style={{ width: labelWidth }}>{r.label}</span>
            <div className="flex-1 h-6 bg-slate-100 rounded relative overflow-hidden transition-transform group-hover:scale-[1.01] group-hover:translate-x-1">
              <div
                className="h-full rounded transition-all duration-300 hover:opacity-90 cursor-pointer group-hover:brightness-110"
                style={{ width: `${barWidth}%`, background: color }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-white mix-blend-luminosity pointer-events-none group-hover:scale-105 transition-transform origin-left">
                {r.display ?? `${r.value.toLocaleString("pt-BR")}${unit}`}
              </span>
              {/* Overlay de brilho no hover */}
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            {showPct && (
              <span className="w-12 shrink-0 text-right text-xs text-slate-500 tabular-nums group-hover:text-slate-900 group-hover:font-bold transition-colors">
                {r.pct !== undefined ? `${r.pct.toFixed(1)}%` : ""}
              </span>
            )}
            {showTrailing && (
              <span className="w-12 shrink-0 text-right text-slate-500 text-xs tabular-nums group-hover:text-slate-900 transition-colors">
                {r.trailing}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
