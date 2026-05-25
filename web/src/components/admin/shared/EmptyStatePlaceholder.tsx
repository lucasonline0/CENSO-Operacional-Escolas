import React from "react";
import { Construction } from "lucide-react";
import { C } from "./constants";

export type EmptyStatePlaceholderProps = {
  title: string;
  description: string;
  icon?: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  sections?: string[];
};

export function EmptyStatePlaceholder({
  title,
  description,
  icon: Icon,
  sections,
}: EmptyStatePlaceholderProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div
        className="px-6 py-4 border-b flex items-center gap-2"
        style={{ background: C.primaryLight }}
      >
        {Icon && <Icon size={16} className="shrink-0" strokeWidth={2} />}
        <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
      </div>

      <div className="px-6 py-10 flex flex-col items-center text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-sm mb-4"
          style={{ background: C.primary }}
        >
          <Construction size={26} strokeWidth={1.75} />
        </div>
        <h3 className="font-semibold text-slate-800 text-base">Em construção</h3>
        <p className="text-sm text-slate-600 max-w-2xl mt-2">{description}</p>

        {sections && sections.length > 0 && (
          <div className="mt-7 w-full max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
              Blocos previstos
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {sections.map((s) => (
                <li
                  key={s}
                  className="border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 bg-slate-50/60 text-left"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
