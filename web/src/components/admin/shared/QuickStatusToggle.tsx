"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface QuickStatusToggleProps {
  checked: boolean;
  onChange: (nextState: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  activeLabel?: string;
  inactiveLabel?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}

export function QuickStatusToggle({
  checked,
  onChange,
  disabled = false,
  loading = false,
  label,
  activeLabel = "Ativo",
  inactiveLabel = "Inativo",
  size = "md",
  ariaLabel,
}: QuickStatusToggleProps) {
  const isSm = size === "sm";

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || loading) return;
    onChange(!checked);
  };

  const statusText = checked ? activeLabel : inactiveLabel;

  return (
    <div
      className="inline-flex items-center gap-2 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label || `Alternar status (${statusText})`}
        disabled={disabled || loading}
        onClick={handleToggle}
        className={`
          relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1
          ${isSm ? "h-5 w-9" : "h-6 w-11"}
          ${checked ? "bg-emerald-600 dark:bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}
          ${disabled || loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out
            flex items-center justify-center
            ${isSm ? "h-4 w-4 mt-0.5" : "h-5 w-5 mt-0.5"}
            ${checked ? (isSm ? "translate-x-4 ml-0.5" : "translate-x-5 ml-0.5") : "translate-x-0.5"}
          `}
        >
          {loading && (
            <Loader2
              size={isSm ? 10 : 12}
              className="animate-spin text-slate-600"
              aria-hidden="true"
            />
          )}
        </span>
      </button>

      {(label || statusText) && (
        <span
          className={`text-xs font-medium ${
            checked
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {label || statusText}
        </span>
      )}
    </div>
  );
}
