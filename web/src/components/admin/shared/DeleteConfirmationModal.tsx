"use client";

import React from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { AdminModalShell } from "./AdminModalShell";

interface Props { name: string; loading: boolean; error?: string; onClose: () => void; onConfirm: () => void }

export function DeleteConfirmationModal({ name, loading, error, onClose, onConfirm }: Props) {
  return <AdminModalShell title="Excluir perfil?" Icon={Trash2} onClose={onClose} closeDisabled={loading} maxWidth="md">
    <div className="space-y-4 p-6">
      <p className="font-semibold text-slate-800">Usuário: {name}</p>
      <p className="text-sm leading-6 text-slate-600">Este usuário perderá imediatamente o acesso. Esta ação não pode ser desfeita.</p>
      {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertTriangle size={17} />{error}</div>}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium">Cancelar</button><button type="button" onClick={onConfirm} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-40">{loading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{loading ? "Excluindo…" : "Excluir perfil"}</button></div>
    </div>
  </AdminModalShell>;
}
