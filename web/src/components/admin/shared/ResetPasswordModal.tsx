"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Building2, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Sparkles, User } from "lucide-react";
import { resetAdminUserPassword } from "./api";
import { AdminModalShell } from "./AdminModalShell";
import { C } from "./constants";
import { copyToClipboard, generateSecurePassword } from "./credentialsUtils";
import type { AdminUserItem } from "./types";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AdminUserItem, newPassword: string) => void;
  token: string;
  user: AdminUserItem | null;
}

const INPUT_CLASS = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400";

export function ResetPasswordModal({ isOpen, onClose, onSuccess, token, user }: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPassword(generateSecurePassword(12));
    setShowPassword(true);
    setLoading(false);
    setError("");
    setCopied(false);
  }, [isOpen, user]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !user) return null;
  const targetUser = user;

  function generatePassword() {
    setPassword(generateSecurePassword(12));
    setShowPassword(true);
  }

  async function copyPassword() {
    if (!password) return;
    if (await copyToClipboard(password)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanPassword = password.trim();
    if (!cleanPassword) return setError("Informe a nova senha.");
    if (cleanPassword.length < 12) return setError("A senha deve ter no mínimo 12 caracteres.");

    setLoading(true);
    setError("");
    try {
      await resetAdminUserPassword(token, targetUser.id, cleanPassword);
      onSuccess(targetUser, cleanPassword);
    } catch (requestError: unknown) {
      setError((requestError as Error).message || "Erro ao redefinir a senha do usuário.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminModalShell
      title="Redefinir senha"
      subtitle="Defina uma nova senha de acesso para esta conta regional."
      Icon={KeyRound}
      onClose={onClose}
      closeDisabled={loading}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-slate-500"><User size={14} />Usuário</span><span className="font-mono font-semibold text-slate-800">{targetUser.username}</span></div>
          <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-slate-500"><Building2 size={14} />DRE vinculada</span><span className="max-w-[220px] truncate font-semibold text-slate-800">{targetUser.dre}</span></div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-slate-700">Nova senha de acesso <span className="text-rose-500">*</span></label>
            <button type="button" onClick={generatePassword} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.primary }}><Sparkles size={13} />Gerar senha segura</button>
          </div>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={`${INPUT_CLASS} pr-20 font-mono`} minLength={12} required />
            <div className="absolute inset-y-0 right-2 flex items-center gap-1">
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              <button type="button" onClick={copyPassword} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copiar senha">{copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}</button>
            </div>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">A troca revoga as sessões anteriores e passa a valer imediatamente.</p>
        </div>

        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={loading || !password.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>{loading ? <><Loader2 size={15} className="animate-spin" />Salvando…</> : "Redefinir senha"}</button>
        </div>
      </form>
    </AdminModalShell>
  );
}
