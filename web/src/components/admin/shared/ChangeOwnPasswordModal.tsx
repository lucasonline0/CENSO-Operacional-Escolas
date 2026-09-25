"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { AdminModalShell } from "./AdminModalShell";
import { changeOwnPassword } from "./api";
import { C } from "./constants";

interface ChangeOwnPasswordModalProps {
  isOpen: boolean;
  token: string;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

const INPUT_CLASS = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400";

export function ChangeOwnPasswordModal({ isOpen, token, onClose, onSuccess }: ChangeOwnPasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setLoading(false);
    setError("");
  }, [isOpen]);

  if (!isOpen) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPassword) return setError("Informe sua senha atual.");
    if (newPassword.length < 12) return setError("A nova senha deve ter no mínimo 12 caracteres.");
    if (newPassword !== confirmPassword) return setError("A confirmação da nova senha não confere.");
    if (newPassword === currentPassword) return setError("Escolha uma senha diferente da atual.");

    setLoading(true);
    setError("");
    try {
      const result = await changeOwnPassword(token, currentPassword, newPassword, confirmPassword);
      if (!result.token) throw new Error("O servidor não retornou a nova sessão.");
      onSuccess(result.token);
    } catch (requestError: unknown) {
      setError((requestError as Error).message || "Não foi possível alterar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminModalShell
      title="Alterar minha senha"
      subtitle="Confirme sua senha atual e defina uma nova credencial."
      Icon={KeyRound}
      onClose={onClose}
      closeDisabled={loading}
      maxWidth="md"
    >
      <form onSubmit={submit} className="space-y-4 p-6">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Senha atual</span>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              className={INPUT_CLASS}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              maxLength={128}
              required
            />
            <button type="button" onClick={() => setShowCurrent((value) => !value)} className="absolute inset-y-0 right-2 flex items-center text-slate-400" aria-label={showCurrent ? "Ocultar senha atual" : "Mostrar senha atual"}>
              {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Nova senha</span>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              className={INPUT_CLASS}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={12}
              maxLength={128}
              required
            />
            <button type="button" onClick={() => setShowNew((value) => !value)} className="absolute inset-y-0 right-2 flex items-center text-slate-400" aria-label={showNew ? "Ocultar nova senha" : "Mostrar nova senha"}>
              {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <span className="mt-1 block text-xs text-slate-500">Mínimo de 12 caracteres.</span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Confirmar nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            className={INPUT_CLASS}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            required
          />
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
            {loading ? <><Loader2 size={15} className="animate-spin" />Alterando…</> : "Alterar senha"}
          </button>
        </div>
      </form>
    </AdminModalShell>
  );
}
