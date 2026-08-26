"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  Building2,
  User,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { copyToClipboard, formatCredentialsText } from "./credentialsUtils";

interface CredentialsSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  username: string;
  password?: string;
  dre: string;
}

export function CredentialsSuccessModal({
  isOpen,
  onClose,
  title = "Credenciais Geradas com Sucesso!",
  subtitle = "O acesso foi configurado. Copie e transmita as credenciais com segurança.",
  username,
  password,
  dre,
}: CredentialsSuccessModalProps) {
  const [showPassword, setShowPassword] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyAll = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = formatCredentialsText({
      dre,
      username,
      password,
      url: origin ? `${origin}/admin` : undefined,
    });
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    }
  };

  const handleCopyUser = async () => {
    const ok = await copyToClipboard(username);
    if (ok) {
      setCopiedUser(true);
      setTimeout(() => setCopiedUser(false), 2000);
    }
  };

  const handleCopyPass = async () => {
    if (!password) return;
    const ok = await copyToClipboard(password);
    if (ok) {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 dark:from-emerald-700 dark:to-teal-800 px-6 py-5 text-white relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white flex-shrink-0 shadow-inner">
              <CheckCircle2 size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-xs text-white/90 mt-0.5">{subtitle}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Card com as credenciais */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 space-y-3">
            {/* DRE */}
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Building2 size={14} className="text-slate-400" />
                DRE / Regional
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 text-right">
                {dre}
              </span>
            </div>

            {/* Usuário */}
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <User size={14} className="text-slate-400" />
                Usuário
              </span>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono font-semibold bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-300">
                  {username}
                </code>
                <button
                  type="button"
                  title="Copiar usuário"
                  onClick={handleCopyUser}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                >
                  {copiedUser ? (
                    <Check size={14} className="text-emerald-500" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>

            {/* Senha */}
            {password && (
              <div className="flex items-center justify-between py-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <KeyRound size={14} className="text-slate-400" />
                  Senha de Acesso
                </span>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 px-2.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60 tracking-wider">
                    {showPassword ? password : "••••••••••••"}
                  </code>
                  <button
                    type="button"
                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    title="Copiar senha"
                    onClick={handleCopyPass}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                  >
                    {copiedPass ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Alerta de Segurança */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Segurança:</strong> A senha não será exibida novamente após fechar esta janela. Certifique-se de copiar as credenciais agora e compartilhá-las por canal seguro com o gestor da DRE.
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyAll}
              className={`
                w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm
                ${
                  copiedAll
                    ? "bg-emerald-600 text-white"
                    : "bg-sky-600 hover:bg-sky-700 text-white"
                }
              `}
            >
              {copiedAll ? (
                <>
                  <Check size={16} />
                  Credenciais Copiadas!
                </>
              ) : (
                <>
                  <Copy size={16} />
                  Copiar Credenciais Completas
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
