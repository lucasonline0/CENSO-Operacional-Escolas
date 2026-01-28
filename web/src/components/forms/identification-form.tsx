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
import { Checkbox } from "@/components/ui/checkbox";
import { schoolData } from "@/data/schools"; 

const STORAGE_KEY = "censo_draft_identification_v1";

interface IdentificationFormProps {
  onSuccess: (schoolId: number) => void;
  initialId?: number | null; 
}

const turnosOptions = ["Manhã", "Tarde", "Noite", "Integral"];

export function IdentificationForm({ onSuccess, initialId }: IdentificationFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  const form = useForm<SchoolIdentificationForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schoolIdentificationSchema) as any,
    defaultValues: {
      nome_escola: "",
      codigo_inep: "",
      cnpj: "",
      endereco: "",
      telefone_institucional: "",
      municipio: "",
      cep: "",
      zona: undefined,
      nome_diretor: "",
      matricula_diretor: "",
      contato_diretor: "",
      dre: "",
      turnos: [],
    },
  });

  useEffect(() => {
    async function restoreData() {
        if (initialId) {
            try {
                const response = await fetch(`http://localhost:8000/v1/schools?id=${initialId}`);
                if (response.ok) {
                    const result = await response.json();
                    if (result.data) {
                        form.reset(result.data);
                        setIsRestoring(false);
                        return;
                    }
                }
            } catch (e) {
                console.error("erro ao buscar escola:", e);
            }
        }

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
    }
    
    restoreData();
  }, [initialId, form]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = form.watch((value: any) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form]);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/v1/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "erro desconhecido no servidor");
      }

      const result = await response.json();
      
      localStorage.removeItem(STORAGE_KEY);
      
      onSuccess(result.data.id);

    } catch (error) {
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

        {/* Novos Campos Conforme Lista */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ (se houver)</FormLabel>
                  <FormControl><Input placeholder="00.000.000/0000-00" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telefone_institucional"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone Institucional</FormLabel>
                  <FormControl><Input placeholder="(91) 00000-0000" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="cep"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP *</FormLabel>
                  <FormControl><Input placeholder="00000-000" maxLength={9} {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>

        <FormField
          control={form.control}
          name="endereco"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço Completo *</FormLabel>
              <FormControl><Input placeholder="Logradouro, número, bairro..." {...field} value={field.value || ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="p-4 bg-slate-50 border rounded-md space-y-4">
            <h4 className="font-medium text-slate-700">Dados do Diretor (Se houver)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                    control={form.control}
                    name="nome_diretor"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Nome do Diretor</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="matricula_diretor"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Matrícula</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="contato_diretor"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Contato (WhatsApp)</FormLabel>
                        <FormControl><Input placeholder="(91) 9...." {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                    )}
                />
            </div>
        </div>

        <FormField
          control={form.control}
          name="turnos"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-base">Turnos de Funcionamento *</FormLabel>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {turnosOptions.map((turno) => (
                  <FormField
                    key={turno}
                    control={form.control}
                    name="turnos"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={turno}
                          className="flex flex-row items-start space-x-3 space-y-0"
                        >
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(turno)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...field.value, turno])
                                  : field.onChange(
                                      field.value?.filter(
                                        (value) => value !== turno
                                      )
                                    )
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            {turno}
                          </FormLabel>
                        </FormItem>
                      )
                    }}
                  />
                ))}
              </div>
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