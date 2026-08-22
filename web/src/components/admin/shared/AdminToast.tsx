"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { C } from "./constants";

// Toast leve do painel admin — feedback pós-ação (ex.: DRE criada).
// Controlado por estado do componente pai; auto-dismiss em 4s.
export interface AdminToastData {
  type: "success" | "error";
  message: string;
}

export function AdminToast({
  toast,
  onDismiss,
}: {
  toast: AdminToastData | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const ok = toast.type === "success";

  return (
    <div className="fixed bottom-5 right-5 z-[110] animate-fade-in-up max-w-[calc(100vw-2.5rem)]">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg"
      >
        {ok ? (
          <CheckCircle2 size={18} style={{ color: C.success }} className="shrink-0" />
        ) : (
          <AlertCircle size={18} style={{ color: C.danger }} className="shrink-0" />
        )}
        <span className="text-sm font-medium text-slate-800">{toast.message}</span>
        <button
          onClick={onDismiss}
          aria-label="Fechar notificação"
          className="ml-1 text-slate-400 hover:text-slate-600 shrink-0"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
