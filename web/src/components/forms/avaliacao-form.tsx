"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { avaliacaoSchema, AvaliacaoFormValues } from "@/schemas/steps/avaliacao"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { RadioInput } from "@/components/ui/form-components";
import { useCensusPersistence } from "@/hooks/use-census-persistence";

const OPCOES = ["Ruim", "Regular", "Bom", "Excelente"];

interface AvaliacaoFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function AvaliacaoForm({ schoolId, onSuccess, onBack }: AvaliacaoFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<AvaliacaoFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(avaliacaoSchema) as any,
    defaultValues: {}
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId,
    "avaliacao",
    form.reset,
    form.getValues()
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = form.watch((value: any) => {
        saveLocalDraft(value);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (subscription as any).unsubscribe();
  }, [form, saveLocalDraft]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
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

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Avaliação...</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const control = form.control as any;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Avaliação e Notas</h3>
            
            <div className="grid grid-cols-1 gap-6">
                <RadioInput control={control} name="avaliacao_merendeiras" label="Avaliação do serviço das merendeiras" options={OPCOES} />
                <RadioInput control={control} name="avaliacao_portaria" label="Avaliação do serviço dos agentes de portaria" options={OPCOES} />
                <RadioInput control={control} name="avaliacao_limpeza" label="Avaliação da prestação dos serviços dos limpeza" options={OPCOES} />
                <RadioInput control={control} name="avaliacao_comunicacao" label="Avaliação da Comunicação com empresa terceirizada" options={OPCOES} />
                <RadioInput control={control} name="avaliacao_supervisao" label="Avaliação do Atendimento da supervisão" options={OPCOES} />
            </div>
        </div>

        <div className="flex justify-between pt-6">
            <Button type="button" variant="outline" onClick={onBack}>
                ← Voltar
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {isSaving ? "Salvando..." : "Salvar e Continuar →"}
            </Button>
        </div>
      </form>
    </Form>
  );
}