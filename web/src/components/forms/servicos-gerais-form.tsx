"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { servicosGeraisSchema, ServicosGeraisFormValues } from "@/schemas/steps/servicos-gerais"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { SelectInput, RadioInput, NumberInput, TextInput } from "@/components/ui/form-components";
import { useCensusPersistence } from "@/hooks/use-census-persistence";

interface ServicosGeraisFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function ServicosGeraisForm({ schoolId, onSuccess, onBack }: ServicosGeraisFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ServicosGeraisFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(servicosGeraisSchema) as any,
    defaultValues: { 
        qtd_servicos_gerais_efetivo: 0, 
        qtd_servicos_gerais_temporario: 0, 
        qtd_servicos_gerais_terceirizado: 0, 
        quantitativo_necessario_sg: 0,
        qtd_atende_necessidade_sg: undefined,
        empresa_terceirizada_sg: undefined,
        possui_supervisor_sg: undefined,
        nome_supervisor_sg: "",
        contato_supervisor_sg: ""
    }
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId, "servicos_gerais", form.reset, form.getValues()
  );

  useEffect(() => {
    const subscription = form.watch((value) => saveLocalDraft(value as ServicosGeraisFormValues));
    return () => subscription.unsubscribe();
  }, [form, saveLocalDraft]);

  async function onSubmit(data: ServicosGeraisFormValues) {
    setIsSaving(true);
    try {
      const response = await fetch("http://localhost:8000/v1/census", {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            school_id: schoolId,
            year: 2026,
            status: "draft", 
            data: data 
        }),
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

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Serviços Gerais...</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const control = form.control as any;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Quadro de Funcionários (Serviços Gerais)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <NumberInput control={control} name="qtd_servicos_gerais_efetivo" label="Qtd. Efetivos" />
                <NumberInput control={control} name="qtd_servicos_gerais_temporario" label="Qtd. Temporários" />
                <NumberInput control={control} name="qtd_servicos_gerais_terceirizado" label="Qtd. Terceirizados" />
            </div>

            <div className="p-4 bg-slate-50 border rounded-md grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <RadioInput control={control} name="qtd_atende_necessidade_sg" label="A quantidade atual atende a necessidade?" options={["Sim", "Não"]} />
                {form.watch("qtd_atende_necessidade_sg") === "Não" && (
                    <NumberInput control={control} name="quantitativo_necessario_sg" label="Qual o quantitativo necessário?" />
                )}
            </div>

            <div className="p-4 bg-blue-50/50 border rounded-md space-y-4">
                <SelectInput control={control} name="empresa_terceirizada_sg" label="Empresa Terceirizada (Serviços Gerais)" options={["AJ LOURENÇO", "DIAMOND", "E.B CARDOSO", "J.R LIMPEZA", "KAPA CAPITAL", "LG SERVIÇOS", "LIMPAR", "SAP - SERVICE ALIANCA PARA", "Outra"]} />
                <RadioInput control={control} name="possui_supervisor_sg" label="Há supervisor da empresa?" options={["Sim", "Não"]} />
                
                {form.watch("possui_supervisor_sg") === "Sim" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextInput control={control} name="nome_supervisor_sg" label="Nome do Supervisor" />
                        <TextInput control={control} name="contato_supervisor_sg" label="Contato do Supervisor" placeholder="(91) 9..." />
                    </div>
                )}
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