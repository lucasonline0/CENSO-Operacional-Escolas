"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  X,
  Loader2,
  AlertCircle,
  Mail,
  Phone,
  User,
  MapPin,
  Tag,
} from "lucide-react";
import { createDRE, updateDRE } from "./api";
import { QuickStatusToggle } from "./QuickStatusToggle";
import type { DREItem } from "./types";

interface DreFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (dre: DREItem) => void;
  token: string;
  dreToEdit?: DREItem | null;
}

export function DreFormModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  dreToEdit,
}: DreFormModalProps) {
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
    if (isOpen) {
      if (dreToEdit) {
        setNome(dreToEdit.nome || "");
        setSigla(dreToEdit.sigla || "");
        setMunicipioSede(dreToEdit.municipio_sede || "");
        setPolo(dreToEdit.polo || "");
        setGestorNome(dreToEdit.gestor_nome || "");
        setEmail(dreToEdit.email || "");
        setTelefone(dreToEdit.telefone || "");
        setAtiva(dreToEdit.ativa);
      } else {
        setNome("");
        setSigla("");
        setMunicipioSede("");
        setPolo("");
        setGestorNome("");
        setEmail("");
        setTelefone("");
        setAtiva(true);
      }
      setError("");
      setLoading(false);
    }
  }, [isOpen, dreToEdit]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNome = nome.trim();

    if (!trimmedNome) {
      setError("O nome da DRE é obrigatório.");
      return;
    }

    setLoading(true);
    setError("");

    const payload: Partial<DREItem> = {
      nome: trimmedNome,
      sigla: sigla.trim(),
      municipio_sede: municipioSede.trim(),
      polo: polo.trim(),
      gestor_nome: gestorNome.trim(),
      email: email.trim(),
      telefone: telefone.trim(),
      ativa,
    };

    try {
      let result: DREItem;
      if (isEditing && dreToEdit) {
        result = await updateDRE(token, dreToEdit.id, payload);
      } else {
        result = await createDRE(token, payload);
      }
      onSuccess(result);
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao salvar dados da DRE.");
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
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isEditing ? "Editar Diretoria Regional (DRE)" : "Nova Diretoria Regional (DRE)"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing
                  ? "Atualize as informações cadastrais e de contato institucional."
                  : "Cadastre uma nova regional administrativa para a rede estadual."}
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

        {/* Form Body with Scroll */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Nome e Sigla */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" />
                Nome da DRE <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="ex: DRE - BELEM"
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Tag size={13} className="text-slate-400" />
                Sigla
              </label>
              <input
                type="text"
                value={sigla}
                onChange={(e) => setSigla(e.target.value.toUpperCase())}
                placeholder="ex: DRE-BEL"
                className="w-full text-sm font-mono uppercase bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Município Sede e Polo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" />
                Município Sede
              </label>
              <input
                type="text"
                value={municipioSede}
                onChange={(e) => setMunicipioSede(e.target.value)}
                placeholder="ex: Belém"
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" />
                Polo / Região
              </label>
              <input
                type="text"
                value={polo}
                onChange={(e) => setPolo(e.target.value)}
                placeholder="ex: Metropolitano"
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Gestor Responsável */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User size={13} className="text-slate-400" />
              Gestor(a) Responsável
            </label>
            <input
              type="text"
              value={gestorNome}
              onChange={(e) => setGestorNome(e.target.value)}
              placeholder="ex: Maria de Nazaré Silva"
              className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          {/* E-mail e Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Mail size={13} className="text-slate-400" />
                E-mail Institucional
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dre.belem@seduc.pa.gov.br"
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Phone size={13} className="text-slate-400" />
                Telefone de Contato
              </label>
              <input
                type="text"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(91) 98888-7777"
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Ativo */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                Status da Regional
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {ativa
                  ? "A regional está ativa e apta a receber vínculos de usuários."
                  : "A regional está inativa (novos usuários não poderão ser vinculados)."}
              </span>
            </div>
            <QuickStatusToggle
              checked={ativa}
              onChange={setAtiva}
              activeLabel="Ativa"
              inactiveLabel="Inativa"
            />
          </div>

          {/* Erro */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
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
              disabled={loading || !nome.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Salvando…
                </>
              ) : isEditing ? (
                "Atualizar DRE"
              ) : (
                "Salvar DRE"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
