"use client";

import React from "react";
import { X } from "lucide-react";
import { C } from "./constants";

interface AdminModalShellProps {
  title: string;
  subtitle?: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  onClose: () => void;
  children: React.ReactNode;
  closeDisabled?: boolean;
  maxWidth?: "md" | "lg" | "xl";
}

const WIDTHS = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const;

export function AdminModalShell({
  title,
  subtitle,
  Icon,
  onClose,
  children,
  closeDisabled = false,
  maxWidth = "lg",
}: AdminModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px] animate-fade-in"
      onClick={() => !closeDisabled && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[calc(100vh-2rem)] w-full ${WIDTHS[maxWidth]} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-scale-in`}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-4"
          style={{ background: C.primaryLight }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ background: C.primary }}
            >
              <Icon size={19} strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p>}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Fechar janela"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}
