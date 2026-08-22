"use client";

import React, { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Landmark, X, Loader2, AlertCircle } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { novaDreSchema, type NovaDreFormValues } from "@/schemas/admin/nova-dre";
import { apiFetch, createDre } from "./api";
import { C } from "./constants";
import type { FiltrosOpcoes } from "./types";

// Modal de cadastro de nova DRE — aba "Gestão de DREs e Acessos".
// Montado/desmontado pelo pai quando aberto/fechado (padrão JsonModal).
// Endpoint de criação ainda sem contrato final do backend: ver createDre() em shared/api.ts.
interface NovaDreModalProps {
  token: string;
  onClose: () => void;
  onSuccess: () => void;
  onUnauth: () => void;
}

const INPUT_CLASS = "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400";
const SELECT_CLASS = `h-9 w-full rounded-md border px-3 text-sm shadow-xs focus:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 ${INPUT_CLASS}`;

export function NovaDreModal({ token, onClose, onSuccess, onUnauth }: NovaDreModalProps) {
  const [apiError, setApiError] = useState("");
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [municipiosErro, setMunicipiosErro] = useState(false);

  // Fonte dos polos ainda não exposta pelo backend — select obrigatório
  // permanece vazio até que a lista seja disponibilizada.
  const polos: string[] = [];

  const form = useForm<NovaDreFormValues>({
    resolver: zodResolver(novaDreSchema) as unknown as Resolver<NovaDreFormValues>,
    defaultValues: {
      nome: "",
      sigla: "",
      municipio_sede: "",
      polo: "",
      responsavel_nome: "",
      responsavel_email: "",
      responsavel_telefone: "",
    },
    mode: "onTouched",
  });

  const submitting = form.formState.isSubmitting;

  useEffect(() => {
    let cancelled = false;
    apiFetch<FiltrosOpcoes>("/v1/admin/analytics/filtros/opcoes", token)
      .then((d) => { if (!cancelled) setMunicipios(d.municipios ?? []); })
      .catch(() => { if (!cancelled) setMunicipiosErro(true); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", fn);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", fn);
    };
  }, [submitting, onClose]);

  const onSubmit = async (values: NovaDreFormValues) => {
    setApiError("");
    try {
      await createDre(token, values);
      onSuccess();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg === "UNAUTHORIZED") {
        onUnauth();
        return;
      }
      setApiError(msg || "Não foi possível cadastrar a DRE. Tente novamente.");
    }
  };

  const maskTelefone = (raw: string) => {
    let v = raw.replace(/\D/g, "");
    if (v.length > 11) v = v.substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    return v;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={submitting ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nova-dre-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: C.primaryLight }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: C.primary }}>
              <Landmark size={19} />
            </div>
            <div>
              <h2 id="nova-dre-title" className="font-bold text-slate-800">Cadastrar nova DRE</h2>
              <p className="text-xs text-slate-600">Diretoria Regional de Educação</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Fechar modal"
            className="w-9 h-9 rounded-lg hover:bg-black/10 flex items-center justify-center text-slate-700 disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulário */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0">
            <div className="px-6 py-5 overflow-y-auto flex-1">
              {apiError && (
                <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <AlertCircle size={16} style={{ color: C.danger }} className="mt-0.5 shrink-0" />
                  <span className="text-sm" style={{ color: C.danger }}>{apiError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Nome da DRE *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex.: Diretoria Regional de Educação de Belém"
                          autoFocus
                          disabled={submitting}
                          className={INPUT_CLASS}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sigla"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sigla *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex.: DREBELEM"
                          maxLength={12}
                          disabled={submitting}
                          className={INPUT_CLASS}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            field.onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="municipio_sede"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Município Sede *</FormLabel>
                      <FormControl>
                        <select
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          disabled={submitting}
                          className={SELECT_CLASS}
                        >
                          <option value="" disabled>Selecione...</option>
                          {municipios.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </FormControl>
                      {municipiosErro && (
                        <FormDescription>Não foi possível carregar os municípios.</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="polo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Polo *</FormLabel>
                      <FormControl>
                        <select
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          disabled={submitting}
                          className={SELECT_CLASS}
                        >
                          <option value="" disabled>Selecione...</option>
                          {polos.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </FormControl>
                      {polos.length === 0 && (
                        <FormDescription>Nenhuma opção disponível no momento.</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="responsavel_nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Responsável *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nome completo"
                          disabled={submitting}
                          className={INPUT_CLASS}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="responsavel_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="responsavel@educ.pa.gov.br"
                          disabled={submitting}
                          className={INPUT_CLASS}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="responsavel_telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone *</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="(91) 90000-0000"
                          maxLength={15}
                          inputMode="tel"
                          disabled={submitting}
                          className={INPUT_CLASS}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(maskTelefone(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ background: C.primary }}
              >
                {submitting && <Loader2 size={15} className="animate-spin" />}
                {submitting ? "Cadastrando…" : "Cadastrar DRE"}
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
