"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { servidoresSchema, ServidoresFormValues } from "@/schemas/steps/servidores"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { RadioInput, NumberInput } from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";
import { useCensusPersistence } from "@/hooks/use-census-persistence";

interface ServidoresFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function ServidoresForm({ schoolId, onSuccess, onBack }: ServidoresFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ServidoresFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(servidoresSchema) as any,
    defaultValues: {
        qtd_coord_pedagogico: 0,
        qtd_professores_efetivos: 0,
        qtd_professores_temporarios: 0,
        qtd_servidores_administrativos: 0,
        qtd_professor_readaptado: 0,
    }
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId,
    "servidores",
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

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Servidores...</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const control = form.control as any;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Equipe Gestora</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput control={control} name="possui_direcao" label="Possui Direção Escolar?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="possui_secretario" label="Possui Secretário Escolar?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="possui_vice_pedagogico" label="Possui Vice-Diretor Pedagógico?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="possui_vice_administrativo" label="Possui Vice-Diretor Administrativo?" options={["Sim", "Não"]} />
            </div>

            <div className="p-4 bg-slate-50 border rounded-md grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <RadioInput control={control} name="possui_coord_pedagogico" label="Possui Coordenador Pedagógico?" options={["Sim", "Não"]} />
                {form.watch("possui_coord_pedagogico") === "Sim" && (
                    <NumberInput control={control} name="qtd_coord_pedagogico" label="Quantitativo" />
                )}
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Coordenação de Área</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput control={control} name="possui_coord_area_matematica" label="Prof. Coord. Área (Matemática)?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="possui_coord_area_linguagem" label="Prof. Coord. Área (Linguagem)?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="possui_coord_area_humanas" label="Prof. Coord. Área (Humanas)?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="possui_coord_area_natureza" label="Prof. Coord. Área (Natureza)?" options={["Sim", "Não"]} />
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Corpo Docente e Administrativo</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <NumberInput control={control} name="qtd_professores_efetivos" label="Professores Efetivos" />
                <NumberInput control={control} name="qtd_professores_temporarios" label="Professores Temporários" />
                <NumberInput control={control} name="qtd_servidores_administrativos" label="Servidores Administrativos" />
            </div>

            <div className="p-4 bg-yellow-50/50 border border-yellow-100 rounded-md grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <RadioInput control={control} name="possui_professor_readaptado" label="Possui professor readaptado?" options={["Sim", "Não"]} />
                {form.watch("possui_professor_readaptado") === "Sim" && (
                    <NumberInput control={control} name="qtd_professor_readaptado" label="Quantitativo de readaptados" />
                )}
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