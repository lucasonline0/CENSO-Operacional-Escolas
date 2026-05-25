import React from "react";

export function Donut({
  segments,
  label,
  sub,
  size = 170,
}: {
  segments: { label: string; value: number; color: string }[];
  label?: string;
  sub?: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 38, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  // Pré-computa o comprimento e o offset cumulativo de cada arco. Evita
  // mutar uma variável `let` dentro de .map() — incompatível com a regra
  // react-hooks/immutability do ESLint Next 16.
  const lens = segments.map((seg) => (total === 0 ? 0 : (seg.value / total) * circ));
  const offsets = lens.reduce<number[]>(
    (acc, len) => [...acc, (acc[acc.length - 1] ?? 0) + len],
    [0],
  );
  const arcs = segments.map((seg, i) => (
    <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none"
      stroke={seg.color} strokeWidth="15"
      strokeDasharray={`${lens[i]} ${circ - lens[i]}`}
      strokeDashoffset={-offsets[i]}
      transform={`rotate(-90 ${cx} ${cy})`} />
  ));

  return (
    <div className="flex flex-col items-center gap-4">
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
          const pct = total === 0 ? 0 : ((s.value / total) * 100).toFixed(1);
          return (
            <li key={s.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
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
