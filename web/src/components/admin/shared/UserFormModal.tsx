"use client";

import React, { useState, useEffect } from "react";
import {
  UserPlus,
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
  KeyRound,
  Shield,
} from "lucide-react";
import { createAdminUser } from "./api";
import { generateSecurePassword, copyToClipboard } from "./credentialsUtils";
import type { DREItem, AdminUserItem } from "./types";

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AdminUserItem, passwordGenerated: string) => void;
  token: string;
  dres: DREItem[];
  preselectedDre?: string | null;
}

export function UserFormModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  dres,
  preselectedDre,
}: UserFormModalProps) {
  const [selectedDre, setSelectedDre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const activeDres = dres.filter((d) => d.ativa);
      const preselectedValid = preselectedDre &&
        dres.some(d => d.nome === preselectedDre && d.ativa);
      const defaultDre = preselectedValid
        ? preselectedDre
        : (activeDres.length > 0 ? activeDres[0].nome : (dres[0]?.nome ?? ""));
      setSelectedDre(defaultDre);
      
      if (defaultDre) {
        const clean = defaultDre
          .toLowerCase()
          .replace(/^dre\s*[-_]?\s*/i, "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "");
        setUsername(`dre.${clean}`);
      } else {
        setUsername("");
      }

      const initialPass = generateSecurePassword(12);
      setPassword(initialPass);
      setShowPassword(true);
      setError("");
      setLoading(false);
      setCopied(false);
    }
  }, [isOpen, preselectedDre, dres]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleDreChange = (dreNome: string) => {
    setSelectedDre(dreNome);
    // Ajustar sugestão de username caso o usuário não tenha personalizado muito
    if (dreNome) {
      const clean = dreNome
        .toLowerCase()
        .replace(/^dre\s*[-_]?\s*/i, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
      setUsername(`dre.${clean}`);
    }
  };

  const handleGeneratePassword = () => {
    const newPass = generateSecurePassword(12);
    setPassword(newPass);
    setShowPassword(true);
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    const ok = await copyToClipboard(password);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    const p = password.trim();

    if (!selectedDre) {
      setError("Selecione uma DRE.");
      return;
    }
    const selectedDreObj = dres.find(d => d.nome === selectedDre);
    if (!selectedDreObj || !selectedDreObj.ativa) {
      setError("Não é possível criar usuário para uma DRE inativa.");
      return;
    }
    if (!u) {
      setError("Informe o nome de usuário.");
      return;
    }
    if (p.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const created = await createAdminUser(token, {
        username: u,
        password: p,
        role: "dre",
        dre: selectedDre,
      });
      onSuccess(created, p);
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao criar usuário.");
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
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Novo Usuário Regional
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadastre um usuário com permissão de acesso à sua respectiva DRE.
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
          {/* Seleção da DRE */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Building2 size={13} className="text-slate-400" />
              DRE Vinculada <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedDre}
              onChange={(e) => handleDreChange(e.target.value)}
              className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              required
            >
              <option value="" disabled>
                Selecione a DRE correspondente…
              </option>
              {dres.map((d) => (
                <option key={d.id} value={d.nome} disabled={!d.ativa}>
                  {d.nome} {d.sigla ? `(${d.sigla})` : ""} {!d.ativa ? "· [Inativa]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Nome de Usuário (login) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User size={13} className="text-slate-400" />
              Nome de Usuário (Login) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
              placeholder="ex: dre.santarem"
              className="w-full font-mono text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              required
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Identificador único para autenticação institucional.
            </p>
          </div>

          {/* Senha e Gerador */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <KeyRound size={13} className="text-slate-400" />
                Senha Inicial <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGeneratePassword}
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
                  onClick={handleCopyPassword}
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
          </div>

          {/* Perfil fixo */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
              <Shield size={14} className="text-slate-400" />
              Perfil de Acesso
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded-full text-[11px]">
              DRE (Acesso Regional Restrito)
            </span>
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
              disabled={loading || !username.trim() || !password.trim() || !dres.some(d => d.ativa)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Cadastrando…
                </>
              ) : (
                "Criar Usuário"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
