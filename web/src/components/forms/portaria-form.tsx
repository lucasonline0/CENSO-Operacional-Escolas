"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { portariaSchema, PortariaFormValues } from "@/schemas/steps/portaria"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { 
  SelectInput, 
  RadioInput, 
  NumberInput, 
  TextInput 
} from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";

const STORAGE_KEY = "censo_draft_portaria_v1";

interface PortariaFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function PortariaForm({ schoolId, onSuccess, onBack }: PortariaFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const form = useForm<PortariaFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(portariaSchema) as any,
    defaultValues: {
        qtd_agentes_portaria: 0,
        quantitativo_necessario: 0,
    }
  });

  useEffect(() => {
    async function fetchData() {
        let serverData = null;
        try {
            const response = await fetch(`http://localhost:8000/v1/schools?id=${schoolId}`);
            if (!response.ok) {
                 const resCenso = await fetch(`http://localhost:8000/v1/census?school_id=${schoolId}`);
                 if (resCenso.ok) {
                    const result = await resCenso.json();
                    if (result.data) serverData = result.data;
                 }
            } else {
                const result = await response.json();
                if (result.data) serverData = result.data;
            }
        } catch (error) {
            console.error(error);
        }

        const savedDraft = localStorage.getItem(STORAGE_KEY);
        let draftData = null;
        if (savedDraft) {
             try { draftData = JSON.parse(savedDraft); } catch (e) { console.error(e); }
        }

        const mergedData = {
            ...form.getValues(),
            ...(serverData || {}),
            ...(draftData || {}) 
        };

        form.reset(mergedData);
        setIsFetching(false);
    }
    if (schoolId) fetchData();
  }, [schoolId, form]);

  useEffect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscription = form.watch((value: any) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      });
      return () => subscription.unsubscribe();
  }, [form]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setIsLoading(true);
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
      localStorage.removeItem(STORAGE_KEY);
      onSuccess();
    } catch (error) {
      console.error(error);
      alert("erro ao salvar dados.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isFetching) return <div className="text-center py-8 text-slate-500">Carregando...</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const control = form.control as any;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Infraestrutura e Segurança</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput 
                    control={control} 
                    name="possui_guarita" 
                    label="Possui guarita?" 
                    options={["Sim", "Não"]} 
                />
                <RadioInput 
                    control={control} 
                    name="possui_botao_panico" 
                    label="Possui botão de pânico/alarme?" 
                    options={["Sim", "Não"]} 
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SelectInput 
                    control={control} 
                    name="controle_portao" 
                    label="Controle de portão" 
                    options={["Manual", "Fechadura", "Eletrônica"]} 
                />
                <SelectInput 
                    control={control} 
                    name="iluminacao_externa" 
                    label="Iluminação externa" 
                    options={["Adequada", "Regular", "Insuficiente"]} 
                />
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Recursos Humanos (Portaria)</h3>
            
            <NumberInput control={control} name="qtd_agentes_portaria" label="Quantidade de Agentes de Portaria" />

            <div className="p-4 bg-slate-50 border rounded-md grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <RadioInput 
                    control={control} 
                    name="qtd_atende_necessidade" 
                    label="A quantidade atual atende a necessidade?" 
                    options={["Sim", "Não"]} 
                />
                
                {form.watch("qtd_atende_necessidade") === "Não" && (
                    <NumberInput 
                        control={control} 
                        name="quantitativo_necessario" 
                        label="Qual o quantitativo necessário?" 
                    />
                )}
            </div>

            <div className="p-4 bg-blue-50/50 border rounded-md space-y-4">
                <SelectInput 
                    control={control} 
                    name="empresa_terceirizada" 
                    label="Empresa Terceirizada (Portaria)" 
                    options={[
                        "AJ LOURENÇO", "DIAMOND", "E.B CARDOSO", "J.R LIMPEZA", 
                        "KAPA CAPITAL", "LG SERVIÇOS", "LIMPAR", "SAP - SERVICE ALIANCA PARA", "Outra"
                    ]} 
                />
                
                <RadioInput control={control} name="possui_supervisor" label="Há supervisor da empresa?" options={["Sim", "Não"]} />
                
                {form.watch("possui_supervisor") === "Sim" && (
                     <TextInput control={control} name="nome_supervisor" label="Nome do Supervisor" />
                )}
            </div>
        </div>

        <div className="flex justify-between pt-6">
            <Button type="button" variant="outline" onClick={onBack}>
                ← Voltar
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {isLoading ? "Salvando..." : "Salvar e Continuar →"}
            </Button>
        </div>
      </form>
    </Form>
  );
}