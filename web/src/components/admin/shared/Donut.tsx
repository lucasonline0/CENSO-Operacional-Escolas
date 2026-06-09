import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// Componente interno para exibir o tooltip flutuante
function ChartTooltip({
  active,
  label,
  value,
  pct,
  x,
  y,
}: {
  active: boolean;
  label: string;
  value: number;
  pct?: string;
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
        <span className="font-mono font-bold">{value.toLocaleString("pt-BR")}</span>
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
export function PieChart({
  segments,
  size = 170,
}: {
  segments: { label: string; value: number; color: string; pct?: number }[];
  size?: number;
}) {
  const [hovered, setHovered] = useState<{ label: string; value: number; pct: string; x: number; y: number } | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = 50, cy = 50, r = 46;

  let currentAngle = -Math.PI / 2;
  const slices = segments.map((seg) => {
    const fraction = total === 0 ? 0 : seg.value / total;
    const angle = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    currentAngle += angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(currentAngle);
    const y2 = cy + r * Math.sin(currentAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = fraction === 0
      ? ""
      : `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
    return { ...seg, d };
  });

  return (
    <div className="flex flex-col items-center gap-4 relative">
      <ChartTooltip
        active={!!hovered}
        label={hovered?.label ?? ""}
        value={hovered?.value ?? 0}
        pct={hovered?.pct}
        x={hovered?.x ?? 0}
        y={hovered?.y ?? 0}
      />
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        {total === 0
          ? <circle cx={cx} cy={cy} r={r} fill="#EFF2F6" />
          : slices.map((s) => {
            const pct = s.pct !== undefined
              ? s.pct.toFixed(1)
              : total === 0 ? "0.0" : ((s.value / total) * 100).toFixed(1);

            return s.d && (
              <path
                key={s.label}
                d={s.d}
                fill={s.color}
                className="transition-opacity hover:opacity-80 cursor-pointer"
                onMouseMove={(e) => setHovered({ label: s.label, value: s.value, pct, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })
        }
      </svg>
      <ul className="w-full space-y-1.5">
        {segments.map((s) => {
          const pct = s.pct !== undefined
            ? s.pct.toFixed(1)
            : total === 0 ? "0.0" : ((s.value / total) * 100).toFixed(1);
          return (
            <li
              key={s.label}
              className="flex items-center justify-between text-sm group cursor-default hover:bg-slate-50 rounded px-1 transition-colors"
              onMouseMove={(e) => setHovered({ label: s.label, value: s.value, pct, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-3 h-3 rounded-sm shrink-0 transition-transform group-hover:scale-110" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {s.value.toLocaleString("pt-BR")}
                <span className="text-slate-400 font-normal ml-1 text-xs">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Donut({
  segments,
  label,
  sub,
  size = 170,
}: {
  segments: { label: string; value: number; color: string; pct?: number }[];
  label?: string;
  sub?: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState<{ label: string; value: number; pct: string; x: number; y: number } | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 38, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  // Pré-computa o comprimento e o offset cumulativo de cada arco.
  const lens = segments.map((seg) => (total === 0 ? 0 : (seg.value / total) * circ));
  const offsets = lens.reduce<number[]>(
    (acc, len) => [...acc, (acc[acc.length - 1] ?? 0) + len],
    [0],
  );
  const arcs = segments.map((seg, i) => {
    const pct = seg.pct !== undefined
      ? seg.pct.toFixed(1)
      : total === 0 ? "0.0" : ((seg.value / total) * 100).toFixed(1);

    return (
      <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none"
        stroke={seg.color} strokeWidth="15"
        strokeDasharray={`${lens[i]} ${circ - lens[i]}`}
        strokeDashoffset={-offsets[i]}
        transform={`rotate(-90 ${cx} ${cy})`}
        className="transition-all hover:stroke-[18px] cursor-pointer"
        onMouseMove={(e) => setHovered({ label: seg.label, value: seg.value, pct, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHovered(null)}
      />
    );
  });

  return (
    <div className="flex flex-col items-center gap-4 relative">
      <ChartTooltip
        active={!!hovered}
        label={hovered?.label ?? ""}
        value={hovered?.value ?? 0}
        pct={hovered?.pct}
        x={hovered?.x ?? 0}
        y={hovered?.y ?? 0}
      />
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EFF2F6" strokeWidth="15" />
        {arcs}
        {label !== undefined && (
          <>
            <text x="50" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1E293B">{label}</text>
            {sub && <text x="50" y="58" textAnchor="middle" fontSize="6.5" fill="#64748B">{sub}</text>}
          </>
        )}
      </svg>
      <ul className="w-full space-y-1.5">
        {segments.map((s) => {
          const pct = s.pct !== undefined
            ? s.pct.toFixed(1)
            : total === 0 ? "0.0" : ((s.value / total) * 100).toFixed(1);
          return (
            <li
              key={s.label}
              className="flex items-center justify-between text-sm group cursor-default hover:bg-slate-50 rounded px-1 transition-colors"
              onMouseMove={(e) => setHovered({ label: s.label, value: s.value, pct, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-3 h-3 rounded-sm shrink-0 transition-transform group-hover:scale-110" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {s.value.toLocaleString("pt-BR")}
                <span className="text-slate-400 font-normal ml-1 text-xs">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

