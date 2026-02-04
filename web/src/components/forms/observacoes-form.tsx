"use client";

import { useState, useEffect } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { observacoesSchema, ObservacoesFormValues } from "@/schemas/steps/observacoes"; 
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormControl, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator"; 
import { 
  RadioInput, 
  TextInput,
  SelectInput 
} from "@/components/ui/form-components";
import { Textarea } from "@/components/ui/textarea";
import { useCensusPersistence } from "@/hooks/use-census-persistence";

interface ObservacoesFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function ObservacoesForm({ schoolId, onSuccess, onBack }: ObservacoesFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ObservacoesFormValues>({
    resolver: zodResolver(observacoesSchema) as unknown as Resolver<ObservacoesFormValues>,
    defaultValues: {
        prioridade_1: "",
        prioridade_2: "",
        prioridade_3: "",
        demanda_urgente: undefined,
        sugestao_melhoria: undefined,
        nome_responsavel: "",
        cargo_funcao: "",
        declaracao_verdadeira: false
    }
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId,
    "observacoes",
    form.reset,
    form.getValues()
  );

  useEffect(() => {
    const subscription = form.watch((value) => {
        saveLocalDraft(value as ObservacoesFormValues);
    });
    return () => subscription.unsubscribe();
  }, [form, saveLocalDraft]);

  async function onSubmit(data: ObservacoesFormValues) {
    setIsSaving(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${baseUrl}/v1/census`, {
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
      clearLocalDraft();
      onSuccess();
    } catch (error) {
      console.error(error);
      alert("erro ao finalizar censo.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Observações...</div>;

  const control = form.control;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Observações Gerais</h3>
            
            <div className="space-y-4">
                <h4 className="text-sm font-medium text-slate-700">Cite três prioridades da escola</h4>
                <TextInput<ObservacoesFormValues> control={control} name="prioridade_1" label="1. Prioridade" />
                <TextInput<ObservacoesFormValues> control={control} name="prioridade_2" label="2. Prioridade" />
                <TextInput<ObservacoesFormValues> control={control} name="prioridade_3" label="3. Prioridade" />
            </div>

            <div className="p-4 border rounded-md bg-red-50/50 space-y-4">
                <RadioInput<ObservacoesFormValues> control={control} name="demanda_urgente" label="Existe alguma demanda considerada urgente?" options={["Sim", "Não"]} />
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
                <RadioInput<ObservacoesFormValues> control={control} name="sugestao_melhoria" label="Deseja registrar alguma sugestão de melhoria?" options={["Sim", "Não"]} />
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
                <TextInput<ObservacoesFormValues> control={control} name="nome_responsavel" label="Nome do responsável pelo preenchimento" />
                
                <SelectInput<ObservacoesFormValues>
                    control={control}
                    name="cargo_funcao"
                    label="Cargo/Função"
                    options={[
                        "Direção Escolar",
                        "Vice-Diretor Administrativo",
                        "Vice-Diretor Pedagógico",
                        "Secretário Escolar",
                        "Coordenador Pedagógico"
                    ]}
                />

                <TextInput<ObservacoesFormValues> control={control} name="matricula_funcional" label="Matrícula funcional" />
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
                {isSaving ? "Enviando..." : "✅ FINALIZAR CENSO"}
            </Button>
        </div>
      </form>
    </Form>
  );
}