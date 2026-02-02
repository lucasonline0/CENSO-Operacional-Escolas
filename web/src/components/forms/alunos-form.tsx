"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { alunosSchema, AlunosFormValues } from "@/schemas/steps/alunos"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { NumberInput } from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";
import { useCensusPersistence } from "@/hooks/use-census-persistence";

interface AlunosFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function AlunosForm({ schoolId, onSuccess, onBack }: AlunosFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<AlunosFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(alunosSchema) as any,
    defaultValues: {
        total_beneficiarios: 0,
        taxa_abandono: 0,
        taxa_reprovacao_fund1: 0,
        taxa_reprovacao_fund2: 0,
        taxa_reprovacao_medio: 0,
        ideb_anos_iniciais: 0,
        ideb_anos_finais: 0,
        ideb_ensino_medio: 0,
    }
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId,
    "alunos",
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/v1/census`, {
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

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Alunos...</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const control = form.control as any;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Indicadores Sociais</h3>
            <div className="p-4 bg-slate-50 border rounded-md">
                <NumberInput 
                    control={control} 
                    name="total_beneficiarios" 
                    label="Total de Beneficiários de programas sociais" 
                />
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Rendimento Escolar (%)</h3>
            <p className="text-sm text-slate-500">Utilize ponto para casas decimais (ex: 5.5).</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <NumberInput control={control} name="taxa_abandono" label="Taxa de Abandono/Desistência Geral (%)" />
                <div className="hidden md:block"></div> {/* Spacer */}
                
                <NumberInput control={control} name="taxa_reprovacao_fund1" label="Reprovação - Fund. I (%)" />
                <NumberInput control={control} name="taxa_reprovacao_fund2" label="Reprovação - Fund. II (%)" />
                <NumberInput control={control} name="taxa_reprovacao_medio" label="Reprovação - Ensino Médio (%)" />
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">IDEB (Nota 0 a 10)</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <NumberInput control={control} name="ideb_anos_iniciais" label="Ideb - Anos Iniciais" />
                <NumberInput control={control} name="ideb_anos_finais" label="Ideb - Anos Finais" />
                <NumberInput control={control} name="ideb_ensino_medio" label="Ideb - Ensino Médio" />
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