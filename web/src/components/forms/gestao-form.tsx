"use client";

import { useState, useEffect } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gestaoSchema, GestaoFormValues } from "@/schemas/steps/gestao"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { RadioInput, NumberInput, SelectInput } from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";
import { useCensusPersistence } from "@/hooks/use-census-persistence";

interface GestaoFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function GestaoForm({ schoolId, onSuccess, onBack }: GestaoFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<GestaoFormValues>({
    resolver: zodResolver(gestaoSchema) as unknown as Resolver<GestaoFormValues>,
    defaultValues: {
      regularizada_cee: undefined,
      conselho_escolar: undefined,
      recursos_prodep: undefined,
      valor_prodep: 0,
      recursos_federais: undefined,
      valor_federais: 0,
      gremio_estudantil: undefined,
      reunioes_comunidade: undefined,
      plano_evacuacao: undefined,
      politica_bullying: undefined,
    }
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId, "gestao", form.reset, form.getValues()
  );

  useEffect(() => {
    const subscription = form.watch((value) => saveLocalDraft(value as GestaoFormValues));
    return () => subscription.unsubscribe();
  }, [form, saveLocalDraft]);

  async function onSubmit(data: GestaoFormValues) {
    setIsSaving(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL; 
      const response = await fetch(`${baseUrl}/v1/census`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, year: 2026, status: "draft", data: data }),
      });

      if (!response.ok) throw new Error("erro ao salvar");
      clearLocalDraft();
      onSuccess();
    } catch (error) {
      console.error(error);
      alert("erro ao salvar dados.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Gestão...</div>;
  const control = form.control;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Gestão, Participação e Política</h3>
            <RadioInput<GestaoFormValues> control={control} name="regularizada_cee" label="A escola está regularizada junto ao CEE/PA?" options={["Sim", "Não"]} />
            <div className="p-4 bg-slate-50 border rounded-md space-y-4">
                <RadioInput<GestaoFormValues> control={control} name="conselho_escolar" label="A escola possui Conselho Escolar constituído?" options={["Sim", "Não"]} />
                {form.watch("conselho_escolar") === "Sim" && (<RadioInput<GestaoFormValues> control={control} name="conselho_ativo" label="O Conselho Escolar está em funcionamento ativo?" options={["Sim", "Parcialmente", "Não"]} />)}
            </div>
        </div>
        <Separator />
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Recursos Financeiros</h3>
            <div className="p-4 border rounded-md bg-blue-50/30 space-y-4">
                <RadioInput<GestaoFormValues> control={control} name="recursos_prodep" label="A escola recebeu recursos do PRODEP em 2024/2025?" options={["Sim", "Não", "Não sabe informar"]} />
                {form.watch("recursos_prodep") === "Sim" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NumberInput<GestaoFormValues> control={control} name="valor_prodep" label="Quanto a escola recebeu de recurso do PRODEP?" />
                        <SelectInput<GestaoFormValues> control={control} name="execucao_prodep" label="Os recursos do PRODEP foram executados?" options={["Sim, totalmente", "Parcialmente", "Não executados"]} />
                        <SelectInput<GestaoFormValues> control={control} name="pendencias_prodep" label="Há pendências na prestação de contas do PRODEP?" options={["Não", "Sim, em regularização", "Sim, pendente/atrasada"]} />
                    </div>
                )}
            </div>
            <div className="p-4 border rounded-md bg-green-50/30 space-y-4">
                <RadioInput<GestaoFormValues> control={control} name="recursos_federais" label="A escola recebeu recursos federais em 2024/25?" options={["Sim", "Não"]} />
                {form.watch("recursos_federais") === "Sim" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NumberInput<GestaoFormValues> control={control} name="valor_federais" label="Quanto a escola recebeu de recursos federais?" />
                        <SelectInput<GestaoFormValues> control={control} name="execucao_federais" label="Os recursos federais foram executados?" options={["Sim, totalmente", "Parcialmente", "Não executados"]} />
                        <SelectInput<GestaoFormValues> control={control} name="pendencias_federais" label="Há pendências na prestação de recursos federais?" options={["Não", "Sim, em regularização", "Sim, pendente/atrasada"]} />
                    </div>
                )}
            </div>
        </div>
        <Separator />
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Participação e Segurança</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <RadioInput<GestaoFormValues> control={control} name="gremio_estudantil" label="A escola possui grêmio estudantil?" options={["Sim", "Não"]} />
                 <SelectInput<GestaoFormValues> control={control} name="reunioes_comunidade" label="Reuniões com comunidade escolar" options={["Não ocorrem", "Eventuais (1–2 por ano)", "Regulares (semestrais)", "Frequentes (mensais ou mais)"]} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput<GestaoFormValues> control={control} name="plano_evacuacao" label="A escola possui plano de evacuação e emergência?" options={["Sim", "Não"]} />
                <SelectInput<GestaoFormValues> control={control} name="politica_bullying" label="A escola possui política contra bullying/violência" options={["Sim, formalizada e aplicada", "Parcialmente (ações pontuais)", "Não possui"]} />
            </div>
        </div>
        <div className="flex justify-between pt-6">
            <Button type="button" variant="outline" onClick={onBack}>← Voltar</Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">{isSaving ? "Salvando..." : "Salvar e Continuar →"}</Button>
        </div>
      </form>
    </Form>
  );
}