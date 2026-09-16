"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  User,
} from "lucide-react";
import { AdminModalShell } from "./AdminModalShell";
import { C } from "./constants";
import { copyToClipboard, formatCredentialsText } from "./credentialsUtils";

interface CredentialsSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  username: string;
  password?: string;
  dre: string;
  onResetPassword?: () => void;
}

export function CredentialsSuccessModal({
  isOpen,
  onClose,
  title = "Credenciais geradas com sucesso",
  subtitle = "Copie os dados abaixo antes de concluir.",
  username,
  password,
  dre,
  onResetPassword,
}: CredentialsSuccessModalProps) {
  const [showPassword, setShowPassword] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const hasVisiblePassword = Boolean(password);

  useEffect(() => {
    if (isOpen) {
      setShowPassword(true);
      setCopiedAll(false);
      setCopiedUser(false);
      setCopiedPass(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function copyAll() {
    if (!password) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = formatCredentialsText({ dre, username, password, url: origin ? `${origin}/admin` : undefined });
    if (await copyToClipboard(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    }
  }

  async function copyUser() {
    if (await copyToClipboard(username)) {
      setCopiedUser(true);
      setTimeout(() => setCopiedUser(false), 1800);
    }
  }

  async function copyPassword() {
    if (!password) return;
    if (await copyToClipboard(password)) {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 1800);
    }
  }

  return (
    <AdminModalShell
      title={title}
      subtitle={subtitle}
      Icon={hasVisiblePassword ? CheckCircle2 : KeyRound}
      onClose={onClose}
      maxWidth="lg"
    >
      <div className="space-y-5 p-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-500"><Building2 size={15} />DRE / Regional</span>
            <span className="text-right text-sm font-semibold text-slate-800">{dre}</span>
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-500"><User size={15} />Usuário</span>
            <div className="flex min-w-0 items-center gap-2">
              <code className="truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-sm font-semibold" style={{ color: C.primary }}>{username}</code>
              <button type="button" onClick={copyUser} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copiar usuário">{copiedUser ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}</button>
            </div>
          </div>

          {password ? (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-slate-500"><KeyRound size={15} />Senha de acesso</span>
              <div className="flex min-w-0 items-center gap-1">
                <code className="truncate rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-sm font-semibold text-amber-900">{showPassword ? password : "••••••••••••"}</code>
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                <button type="button" onClick={copyPassword} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copiar senha">{copiedPass ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-slate-500"><KeyRound size={15} />Senha de acesso</span>
              <div className="flex min-w-0 items-center gap-2 text-right">
                <code className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-sm font-semibold tracking-wider text-slate-500">••••••••••••</code>
                <LockKeyhole size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>

        {password ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p><strong>Segurança:</strong> a senha não será exibida novamente depois que esta janela for fechada. Copie as credenciais agora e compartilhe-as por canal seguro.</p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            <LockKeyhole size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <p><strong>Senha protegida:</strong> a senha atual é armazenada somente como hash e não pode ser recuperada ou exibida. Para obter uma senha visível novamente, redefina o acesso; a nova senha será mostrada imediatamente após a alteração.</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">{password ? "Concluir" : "Fechar"}</button>

          {password ? (
            <button type="button" onClick={copyAll} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white" style={{ background: copiedAll ? C.success : C.primary }}>{copiedAll ? <><Check size={16} />Credenciais copiadas</> : <><Copy size={16} />Copiar credenciais</>}</button>
          ) : onResetPassword ? (
            <button type="button" onClick={onResetPassword} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white" style={{ background: C.primary }}><KeyRound size={16} />Redefinir senha</button>
          ) : null}
        </div>
      </div>
    </AdminModalShell>
  );
}
