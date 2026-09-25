"use client";

import React from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { AdminModalShell } from "./AdminModalShell";

type Dependencies = { schools?: number; users?: number; custom_profiles?: number; census?: number };
interface Props { kind: "user" | "dre"; name: string; loading: boolean; error?: string; dependencies?: Dependencies | null; onClose: () => void; onConfirm: () => void }

export function DeleteConfirmationModal({ kind, name, loading, error, dependencies, onClose, onConfirm }: Props) {
  const isUser = kind === "user";
  return <AdminModalShell title={isUser ? "Excluir perfil?" : "Excluir DRE?"} Icon={Trash2} onClose={onClose} closeDisabled={loading} maxWidth="md">
    <div className="space-y-4 p-6">
      <p className="font-semibold text-slate-800">{isUser ? `Usuário: ${name}` : name}</p>
      <p className="text-sm leading-6 text-slate-600">{isUser ? "Este usuário perderá imediatamente o acesso. Esta ação não pode ser desfeita." : "A exclusão só será realizada se esta DRE não possuir escolas, usuários ou dados vinculados."}</p>
      {dependencies && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="mb-2 font-bold">Não é possível excluir esta DRE.</p><ul className="space-y-1"><li>Escolas: {dependencies.schools ?? 0}</li><li>Usuários: {dependencies.users ?? 0}</li><li>Perfis personalizados: {dependencies.custom_profiles ?? 0}</li><li>Registros censitários: {dependencies.census ?? 0}</li></ul></div>}
      {error && !dependencies && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertTriangle size={17} />{error}</div>}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium">Cancelar</button><button type="button" onClick={onConfirm} disabled={loading || Boolean(dependencies)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-40">{loading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{loading ? "Excluindo…" : isUser ? "Excluir perfil" : "Excluir DRE"}</button></div>
    </div>
  </AdminModalShell>;
}
