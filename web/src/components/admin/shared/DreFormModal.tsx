"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Building2, Loader2, Mail, MapPin, Phone, Tag, User } from "lucide-react";
import { createDRE, updateDRE } from "./api";
import { AdminModalShell } from "./AdminModalShell";
import { QuickStatusToggle } from "./QuickStatusToggle";
import { C } from "./constants";
import type { DREItem } from "./types";

interface DreFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (dre: DREItem) => void;
  token: string;
  dreToEdit?: DREItem | null;
}

const INPUT_CLASS = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400";
const LABEL_CLASS = "mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700";

export function DreFormModal({ isOpen, onClose, onSuccess, token, dreToEdit }: DreFormModalProps) {
  const isEditing = Boolean(dreToEdit);
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [municipioSede, setMunicipioSede] = useState("");
  const [polo, setPolo] = useState("");
  const [gestorNome, setGestorNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setNome(dreToEdit?.nome ?? "");
    setSigla(dreToEdit?.sigla ?? "");
    setMunicipioSede(dreToEdit?.municipio_sede ?? "");
    setPolo(dreToEdit?.polo ?? "");
    setGestorNome(dreToEdit?.gestor_nome ?? "");
    setEmail(dreToEdit?.email ?? "");
    setTelefone(dreToEdit?.telefone ?? "");
    setAtiva(dreToEdit?.ativa ?? true);
    setError("");
    setLoading(false);
  }, [isOpen, dreToEdit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nome.trim()) {
      setError("O nome da DRE é obrigatório.");
      return;
    }

    setLoading(true);
    setError("");
    const payload: Partial<DREItem> = {
      nome: nome.trim(),
      sigla: sigla.trim(),
      municipio_sede: municipioSede.trim(),
      polo: polo.trim(),
      gestor_nome: gestorNome.trim(),
      email: email.trim(),
      telefone: telefone.trim(),
      ativa,
    };

    try {
      const saved = isEditing && dreToEdit
        ? await updateDRE(token, dreToEdit.id, payload)
        : await createDRE(token, payload);
      onSuccess(saved);
    } catch (requestError: unknown) {
      setError((requestError as Error).message || "Erro ao salvar dados da DRE.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminModalShell
      title={isEditing ? "Editar Diretoria Regional" : "Nova Diretoria Regional"}
      subtitle={isEditing ? "Atualize o cadastro e os contatos institucionais da DRE." : "Cadastre uma nova Diretoria Regional de Ensino."}
      Icon={Building2}
      onClose={onClose}
      closeDisabled={loading}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}><Building2 size={13} className="text-slate-400" />Nome da DRE <span className="text-rose-500">*</span></label>
            <input className={INPUT_CLASS} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: ABAETETUBA" required />
          </div>
          <div>
            <label className={LABEL_CLASS}><Tag size={13} className="text-slate-400" />Sigla</label>
            <input className={`${INPUT_CLASS} font-mono uppercase`} value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} placeholder="DRE-ABA" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}><MapPin size={13} className="text-slate-400" />Município sede</label>
            <input className={INPUT_CLASS} value={municipioSede} onChange={(e) => setMunicipioSede(e.target.value)} placeholder="Abaetetuba" />
          </div>
          <div>
            <label className={LABEL_CLASS}><MapPin size={13} className="text-slate-400" />Polo / região</label>
            <input className={INPUT_CLASS} value={polo} onChange={(e) => setPolo(e.target.value)} placeholder="Baixo Tocantins" />
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}><User size={13} className="text-slate-400" />Gestor(a) responsável</label>
          <input className={INPUT_CLASS} value={gestorNome} onChange={(e) => setGestorNome(e.target.value)} placeholder="Nome do responsável" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}><Mail size={13} className="text-slate-400" />E-mail institucional</label>
            <input type="email" className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dre@seduc.pa.gov.br" />
          </div>
          <div>
            <label className={LABEL_CLASS}><Phone size={13} className="text-slate-400" />Telefone</label>
            <input className={INPUT_CLASS} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(91) 0000-0000" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Status da regional</p>
            <p className="mt-0.5 text-xs text-slate-500">{ativa ? "Ativa e disponível para novos vínculos de acesso." : "Inativa; novos usuários não poderão ser vinculados."}</p>
          </div>
          <QuickStatusToggle checked={ativa} onChange={setAtiva} activeLabel="Ativa" inactiveLabel="Inativa" />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={loading || !nome.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-50" style={{ background: C.primary }}>
            {loading ? <><Loader2 size={15} className="animate-spin" />Salvando…</> : isEditing ? "Atualizar DRE" : "Salvar DRE"}
          </button>
        </div>
      </form>
    </AdminModalShell>
  );
}
