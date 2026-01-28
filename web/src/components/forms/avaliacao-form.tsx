"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { avaliacaoSchema, AvaliacaoFormValues } from "@/schemas/steps/avaliacao"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { RadioInput } from "@/components/ui/form-components";

const STORAGE_KEY = "censo_draft_avaliacao_v1";
const OPCOES = ["Ruim", "Regular", "Bom", "Excelente"];

interface AvaliacaoFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function AvaliacaoForm({ schoolId, onSuccess, onBack }: AvaliacaoFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const form = useForm<AvaliacaoFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(avaliacaoSchema) as any,
    defaultValues: {}
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return () => (subscription as any).unsubscribe();
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
                {isLoading ? "Salvando..." : "Salvar e Continuar →"}
            </Button>
        </div>
      </form>
    </Form>
  );
}