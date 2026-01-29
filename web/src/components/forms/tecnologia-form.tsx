"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tecnologiaSchema, TecnologiaFormValues } from "@/schemas/steps/tecnologia"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { SelectInput, RadioInput, NumberInput } from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";
import { useCensusPersistence } from "@/hooks/use-census-persistence";

interface TecnologiaFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function TecnologiaForm({ schoolId, onSuccess, onBack }: TecnologiaFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<TecnologiaFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(tecnologiaSchema) as any,
    defaultValues: {
        qtd_desktop_adm: 0,
        qtd_desktop_alunos: 0,
        qtd_notebooks: 0,
        qtd_chromebooks: 0,
        qtd_computadores_inoperantes: 0,
        qtd_projetores: 0,
    }
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId,
    "tecnologia",
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

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Tecnologia...</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const control = form.control as any;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Conectividade</h3>
            
            <RadioInput 
                control={control} 
                name="internet_disponivel" 
                label="Internet disponível?" 
                options={["Sim", "Não"]} 
            />

            {form.watch("internet_disponivel") === "Sim" && (
                <div className="grid grid-cols-1 gap-6 p-4 bg-blue-50/50 rounded-md border">
                    <RadioInput 
                        control={control} 
                        name="provedor_internet" 
                        label="Provedor" 
                        options={["Prodepa", "Starlink", "Outro"]} 
                    />
                    <SelectInput 
                        control={control} 
                        name="qualidade_internet" 
                        label="Qualidade e Velocidade" 
                        options={[
                            "A internet não funciona ou está indisponível com frequência",
                            "A internet apresenta lentidão frequente e compromete as atividades",
                            "A internet possui velocidade aceitável, com eventuais oscilações",
                            "A internet é estável e atende plenamente às necessidades da escola",
                            "Não sei avaliar",
                            "Não se aplica"
                        ]} 
                    />
                </div>
            )}
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Computadores e Dispositivos</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <NumberInput control={control} name="qtd_desktop_adm" label="Desktops Administrativos" />
                <NumberInput control={control} name="qtd_desktop_alunos" label="Desktops para Alunos" />
                <NumberInput control={control} name="qtd_notebooks" label="Notebooks Disponíveis" />
                <NumberInput control={control} name="qtd_chromebooks" label="Chromebooks Disponíveis" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <RadioInput 
                    control={control} 
                    name="computadores_atendem" 
                    label="Os computadores atendem à demanda?" 
                    options={["Sim", "Parcialmente", "Não"]} 
                />
                <NumberInput control={control} name="qtd_computadores_inoperantes" label="Quantidade de inoperantes" />
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Multimídia</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 p-4 border rounded-md">
                    <RadioInput control={control} name="possui_projetor" label="Possui projetor multimídia?" options={["Sim", "Não"]} />
                    {form.watch("possui_projetor") === "Sim" && (
                        <NumberInput control={control} name="qtd_projetores" label="Quantidade de projetores" />
                    )}
                </div>
                
                <div className="p-4 border rounded-md h-fit">
                    <RadioInput control={control} name="possui_lousa_digital" label="Possui lousa digital?" options={["Sim", "Não"]} />
                </div>
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