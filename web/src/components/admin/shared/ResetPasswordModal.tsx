"use client";

import React, { useState, useEffect } from "react";
import {
  KeyRound,
  X,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertCircle,
  Building2,
  User,
} from "lucide-react";
import { resetAdminUserPassword } from "./api";
import { generateSecurePassword, copyToClipboard } from "./credentialsUtils";
import type { AdminUserItem } from "./types";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AdminUserItem, newPassword: string) => void;
  token: string;
  user: AdminUserItem | null;
}

export function ResetPasswordModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  user,
}: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initialPass = generateSecurePassword(12);
      setPassword(initialPass);
      setShowPassword(true);
      setError("");
      setLoading(false);
      setCopied(false);
    }
  }, [isOpen, user]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !user) return null;

  const handleGenerate = () => {
    const newPass = generateSecurePassword(12);
    setPassword(newPass);
    setShowPassword(true);
  };

  const handleCopy = async () => {
    if (!password) return;
    const ok = await copyToClipboard(password);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = password.trim();
    if (!trimmed) {
      setError("Informe a nova senha.");
      return;
    }
    if (trimmed.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await resetAdminUserPassword(token, user.id, trimmed);
      onSuccess(user, trimmed);
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao redefinir a senha do usuário.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Redefinir Senha
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gere ou defina uma nova senha para o usuário.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar modal"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Info do Usuário */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                <User size={13} />
                Usuário
              </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {user.username}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                <Building2 size={13} />
                DRE Vinculada
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                {user.dre}
              </span>
            </div>
          </div>

          {/* Campo de Senha */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nova Senha de Acesso <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300"
              >
                <Sparkles size={13} />
                Gerar Senha Segura
              </button>
            </div>

            <div className="relative flex items-center">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full font-mono text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-3.5 pr-20 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                required
                minLength={6}
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  title={showPassword ? "Ocultar senha" : "Ver senha"}
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  type="button"
                  title="Copiar senha"
                  onClick={handleCopy}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {copied ? (
                    <Check size={15} className="text-emerald-500" />
                  ) : (
                    <Copy size={15} />
                  )}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              A nova senha entrará em vigor imediatamente para as próximas tentativas de login.
            </p>
          </div>

          {/* Erro */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Salvando…
                </>
              ) : (
                "Redefinir Senha"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
