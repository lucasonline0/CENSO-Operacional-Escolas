"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { observacoesSchema, ObservacoesFormValues } from "@/schemas/steps/observacoes"; 
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormControl, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator"; 
import { 
  RadioInput, 
  TextInput 
} from "@/components/ui/form-components";
import { Textarea } from "@/components/ui/textarea";

const STORAGE_KEY = "censo_draft_observacoes_v1";

interface ObservacoesFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function ObservacoesForm({ schoolId, onSuccess, onBack }: ObservacoesFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const form = useForm<ObservacoesFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(observacoesSchema) as any,
    defaultValues: {
        declaracao_verdadeira: false
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
            status: "completed", 
            data: data 
        }),
      });

      if (!response.ok) throw new Error("erro ao salvar");
      localStorage.removeItem(STORAGE_KEY);
      onSuccess();
    } catch (error) {
      console.error(error);
      alert("erro ao finalizar censo.");
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
            <h3 className="text-lg font-medium text-slate-800">Observações Gerais</h3>
            
            <div className="space-y-4">
                <h4 className="text-sm font-medium text-slate-700">Cite três prioridades da escola</h4>
                <TextInput control={control} name="prioridade_1" label="1. Prioridade" />
                <TextInput control={control} name="prioridade_2" label="2. Prioridade" />
                <TextInput control={control} name="prioridade_3" label="3. Prioridade" />
            </div>

            <div className="p-4 border rounded-md bg-red-50/50 space-y-4">
                <RadioInput control={control} name="demanda_urgente" label="Existe alguma demanda considerada urgente?" options={["Sim", "Não"]} />
                {form.watch("demanda_urgente") === "Sim" && (
                    <FormField control={form.control} name="descricao_urgencia" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Em caso afirmativo, descreva.</FormLabel>
                            <FormControl><Textarea {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}
            </div>

            <div className="p-4 border rounded-md bg-green-50/50 space-y-4">
                <RadioInput control={control} name="sugestao_melhoria" label="Deseja registrar alguma sugestão de melhoria?" options={["Sim", "Não"]} />
                {form.watch("sugestao_melhoria") === "Sim" && (
                    <FormField control={form.control} name="descricao_sugestao" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Se sim, descreva a sua sugestão.</FormLabel>
                            <FormControl><Textarea {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Responsável pelo Preenchimento</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TextInput control={control} name="nome_responsavel" label="Nome do responsável pelo preenchimento" />
                <TextInput control={control} name="cargo_funcao" label="Cargo/Função" />
                <TextInput control={control} name="matricula_funcional" label="Matrícula funcional" />
            </div>

            <FormField control={form.control} name="declaracao_verdadeira" render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                    <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>Declaro que as informações são verdadeiras *</FormLabel>
                    </div>
                </FormItem>
            )} />
        </div>

        <div className="flex justify-between pt-6">
            <Button type="button" variant="outline" onClick={onBack}>
                ← Voltar
            </Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transform transition hover:scale-105">
                {isLoading ? "Enviando..." : "✅ FINALIZAR CENSO"}
            </Button>
        </div>
      </form>
    </Form>
  );
}