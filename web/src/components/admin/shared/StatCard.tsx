import React from "react";

export function StatCard({
  label, value, Icon, tone, sub,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  tone: "blue" | "green" | "amber" | "orange" | "purple";
  sub?: string;
}) {
  const tones = {
    blue:   { bg: "bg-blue-50",   icon: "text-blue-700",   ring: "ring-blue-100" },
    green:  { bg: "bg-emerald-50",icon: "text-emerald-700",ring: "ring-emerald-100" },
    amber:  { bg: "bg-amber-50",  icon: "text-amber-700",  ring: "ring-amber-100" },
    orange: { bg: "bg-orange-50", icon: "text-orange-700", ring: "ring-orange-100" },
    purple: { bg: "bg-purple-50", icon: "text-purple-700", ring: "ring-purple-100" },
  };
  const t = tones[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-slate-300 transition-all duration-300 group cursor-default animate-fade-in-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide group-hover:text-slate-700 transition-colors">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums group-hover:scale-105 origin-left transition-transform">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
          {sub && <p className="text-xs text-slate-400 mt-1 group-hover:text-slate-500 transition-colors">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${t.bg} ${t.icon} ring-1 ${t.ring} group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
          <Icon size={21} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
