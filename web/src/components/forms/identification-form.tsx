"use client";

import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { schoolIdentificationSchema, SchoolIdentificationForm } from "@/schemas/school-census"; 
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { schoolData } from "@/data/schools"; 

const STORAGE_KEY = "censo_draft_identification_v1";

interface IdentificationFormProps {
  onSuccess: (schoolId: number) => void;
}

export function IdentificationForm({ onSuccess }: IdentificationFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  const form = useForm<SchoolIdentificationForm>({
    resolver: zodResolver(schoolIdentificationSchema),
    defaultValues: {
      nome_escola: "",
      codigo_inep: "",
      municipio: "",
      zona: undefined,
      dre: "",
      endereco: "",
    },
  });

  // recupero o rascunho salvo no storage
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        form.reset(parsed);
      } catch (e) {
        console.error("erro ao restaurar rascunho:", e);
      }
    }
    setIsRestoring(false);
  }, [form]);

  // salvo rascunho a cada alteração do form
  useEffect(() => {
    const subscription = form.watch((value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // logica de filtros de municipio e dre
  const selectedMunicipio = form.watch("municipio");
  const selectedDre = form.watch("dre");

  const municipios = useMemo(() => {
    return Object.keys(schoolData || {}).sort();
  }, []);

  const dres = useMemo(() => {
    if (!selectedMunicipio || !schoolData[selectedMunicipio]) return [];
    return Object.keys(schoolData[selectedMunicipio]).sort();
  }, [selectedMunicipio]);

  const escolas = useMemo(() => {
    if (!selectedMunicipio || !selectedDre || !schoolData[selectedMunicipio]?.[selectedDre]) return [];
    return schoolData[selectedMunicipio][selectedDre].sort();
  }, [selectedMunicipio, selectedDre]);

  // reseta campos dependentes se o pai mudar
  useEffect(() => {
    const currentDre = form.getValues("dre");
    if (selectedMunicipio && currentDre && !dres.includes(currentDre)) {
        form.setValue("dre", "");
        form.setValue("nome_escola", "");
    }
  }, [selectedMunicipio, dres, form]);

  useEffect(() => {
    const currentEscola = form.getValues("nome_escola");
    if (selectedDre && currentEscola && !escolas.includes(currentEscola)) {
        form.setValue("nome_escola", "");
    }
  }, [selectedDre, escolas, form]);

  async function onSubmit(data: SchoolIdentificationForm) {
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/v1/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // verifica resposta e lança erro com texto do backend
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "erro desconhecido no servidor");
      }

      const result = await response.json();
      
      localStorage.removeItem(STORAGE_KEY);
      
      // notifica sucesso pro componente pai
      onSuccess(result.data.id);

    } catch (error) {
      // tratamento de erro seguro sem usar any
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      alert(`erro ao salvar: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (isRestoring) return <div className="p-4 text-gray-500">recuperando dados...</div>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormField
            control={form.control}
            name="municipio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Município *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                  <SelectContent>{municipios.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>DRE / Setor *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""} disabled={!selectedMunicipio}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                  <SelectContent>{dres.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="zona"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Zona *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="Urbana">Urbana</SelectItem>
                    <SelectItem value="Rural">Rural</SelectItem>
                    <SelectItem value="Ribeirinha">Ribeirinha</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8">
            <FormField
              control={form.control}
              name="nome_escola"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Escola *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={!selectedDre}>
                    <FormControl><SelectTrigger><SelectValue placeholder={selectedDre ? "Selecione..." : "..."} /></SelectTrigger></FormControl>
                    <SelectContent>{escolas.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="md:col-span-4">
            <FormField
              control={form.control}
              name="codigo_inep"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código INEP *</FormLabel>
                  <FormControl><Input placeholder="00000000" maxLength={8} {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="endereco"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço Completo *</FormLabel>
              <FormControl><Input placeholder="Logradouro..." {...field} value={field.value || ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto">
            {isLoading ? "Salvando..." : "Salvar e Continuar →"}
          </Button>
        </div>
      </form>
    </Form>
  );
}