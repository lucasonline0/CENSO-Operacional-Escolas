"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Building2, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Mail, Shield, Sparkles, User, UserPlus } from "lucide-react";
import { createAdminUser } from "./api";
import { AdminModalShell } from "./AdminModalShell";
import { C } from "./constants";
import { copyToClipboard, generateSecurePassword } from "./credentialsUtils";
import type { AdminUserItem, DREItem } from "./types";

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AdminUserItem, passwordGenerated: string) => void;
  token: string;
  dres: DREItem[];
  preselectedDreId?: number | null;
}

const INPUT_CLASS = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400";
const LABEL_CLASS = "mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700";

function suggestedUsername(dre?: DREItem) {
  if (!dre) return "";
  const clean = dre.nome
    .toLowerCase()
    .replace(/^dre\s*[-_]?\s*/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return clean ? `dre.${clean}` : "";
}

export function UserFormModal({ isOpen, onClose, onSuccess, token, dres, preselectedDreId }: UserFormModalProps) {
  const [selectedDreId, setSelectedDreId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedDre = selectedDreId == null ? undefined : dres.find((d) => d.id === selectedDreId);
  const selectedDreIsActive = Boolean(selectedDre?.ativa);

  useEffect(() => {
    if (!isOpen) return;
    const activeDres = dres.filter((d) => d.ativa);
    const preselectedValid = preselectedDreId != null && dres.some((d) => d.id === preselectedDreId && d.ativa);
    const defaultDreId = preselectedValid ? preselectedDreId! : preselectedDreId != null ? null : (activeDres[0]?.id ?? null);
    const defaultDre = defaultDreId == null ? undefined : dres.find((d) => d.id === defaultDreId);

    setSelectedDreId(defaultDreId);
    setUsername(suggestedUsername(defaultDre));
    setEmail("");
    setPassword(generateSecurePassword(12));
    setShowPassword(true);
    setLoading(false);
    setCopied(false);
    setError(preselectedDreId != null && !preselectedValid ? "A DRE selecionada está inativa. Escolha uma DRE ativa." : "");
  }, [isOpen, preselectedDreId, dres]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  function handleDreChange(value: string) {
    const id = Number(value);
    const nextId = Number.isFinite(id) && id > 0 ? id : null;
    const dre = nextId == null ? undefined : dres.find((item) => item.id === nextId);
    setSelectedDreId(nextId);
    setUsername(suggestedUsername(dre));
    setError("");
  }

  function handleGeneratePassword() {
    setPassword(generateSecurePassword(12));
    setShowPassword(true);
  }

  async function handleCopyPassword() {
    if (!password) return;
    if (await copyToClipboard(password)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (selectedDreId == null) return setError("Selecione uma DRE.");
    if (!selectedDreIsActive) return setError("Não é possível criar usuário para uma DRE inativa.");
    if (!cleanUsername) return setError("Informe o nome de usuário.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Informe um e-mail válido.");
    if (cleanPassword.length < 12) return setError("A senha deve ter no mínimo 12 caracteres.");

    setLoading(true);
    setError("");
    try {
      const created = await createAdminUser(token, { username: cleanUsername, email: cleanEmail, password: cleanPassword, role: "dre", dre_id: selectedDreId });
      onSuccess(created, cleanPassword);
    } catch (requestError: unknown) {
      setError((requestError as Error).message || "Erro ao criar usuário.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminModalShell
      title="Novo Usuário Regional"
      subtitle="Crie uma credencial restrita à Diretoria Regional selecionada."
      Icon={UserPlus}
      onClose={onClose}
      closeDisabled={loading}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div>
          <label className={LABEL_CLASS}><Building2 size={13} className="text-slate-400" />DRE vinculada <span className="text-rose-500">*</span></label>
          <select className={INPUT_CLASS} value={selectedDreId ?? ""} onChange={(e) => handleDreChange(e.target.value)} required>
            <option value="" disabled>Selecione a DRE correspondente…</option>
            {dres.map((dre) => <option key={dre.id} value={dre.id} disabled={!dre.ativa}>{dre.nome}{dre.sigla ? ` (${dre.sigla})` : ""}{!dre.ativa ? " · Inativa" : ""}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}><Mail size={13} className="text-slate-400" />E-mail institucional <span className="text-rose-500">*</span></label>
          <input type="email" autoComplete="email" maxLength={254} className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="responsavel@seduc.pa.gov.br" required />
          <p className="mt-1.5 text-xs text-slate-500">Será a identidade principal de acesso desta conta.</p>
        </div>

        <div>
          <label className={LABEL_CLASS}><User size={13} className="text-slate-400" />Nome de usuário <span className="text-rose-500">*</span></label>
          <input className={`${INPUT_CLASS} font-mono`} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))} placeholder="dre.abaetetuba" required />
          <p className="mt-1.5 text-xs text-slate-500">Identificador institucional usado no login do painel.</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><KeyRound size={13} className="text-slate-400" />Senha temporária <span className="text-rose-500">*</span></label>
            <button type="button" onClick={handleGeneratePassword} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.primary }}><Sparkles size={13} />Gerar senha segura</button>
          </div>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} className={`${INPUT_CLASS} pr-20 font-mono`} value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required />
            <div className="absolute inset-y-0 right-2 flex items-center gap-1">
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              <button type="button" onClick={handleCopyPassword} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copiar senha">{copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}</button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Shield size={15} className="text-slate-400" />Primeiro acesso</span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Troca de senha obrigatória</span>
        </div>

        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={loading || !username.trim() || !email.trim() || !password.trim() || !selectedDreIsActive} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>{loading ? <><Loader2 size={15} className="animate-spin" />Cadastrando…</> : "Criar usuário"}</button>
        </div>
      </form>
    </AdminModalShell>
  );
}
