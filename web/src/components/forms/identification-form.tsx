"use client";

import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { schoolIdentificationSchema, SchoolIdentificationForm } from "@/schemas/school-census"; 
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { schoolData } from "@/data/schools"; 
import { useCensusPersistence } from "@/hooks/use-census-persistence";

interface IdentificationFormProps {
  onSuccess: (schoolId: number) => void;
  initialId?: number | null; 
}

const turnosOptions = ["Manhã", "Tarde", "Noite", "Integral"];

export function IdentificationForm({ onSuccess, initialId }: IdentificationFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<SchoolIdentificationForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schoolIdentificationSchema) as any,
    defaultValues: {
      nome_escola: "", codigo_inep: "", cnpj: "", endereco: "", telefone_institucional: "",
      municipio: "", cep: "", zona: undefined, nome_diretor: "", matricula_diretor: "",
      contato_diretor: "", dre: "", turnos: [],
    },
  });

  // Hook configurado para 'schools' (Passo 0)
  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    initialId,
    "identification",
    form.reset,
    form.getValues(),
    "schools"
  );

  useEffect(() => {
    const subscription = form.watch((value) => saveLocalDraft(value as SchoolIdentificationForm));
    return () => subscription.unsubscribe();
  }, [form, saveLocalDraft]);

  const selectedDre = form.watch("dre");
  const selectedMunicipio = form.watch("municipio");

  // 1. Extrair todas as DREs únicas disponíveis no sistema (Inversão de Lógica)
  const allDres = useMemo(() => {
    const dresSet = new Set<string>();
    Object.values(schoolData).forEach((municipioMap) => {
      Object.keys(municipioMap).forEach((dre) => dresSet.add(dre));
    });
    return Array.from(dresSet).sort();
  }, []);

  // 2. Filtrar Municípios com base na DRE selecionada
  // Só mostra municípios que possuem a DRE selecionada
  const filteredMunicipios = useMemo(() => {
    if (!selectedDre) return [];
    
    return Object.keys(schoolData).filter(municipio => 
      Object.keys(schoolData[municipio]).includes(selectedDre)
    ).sort();
  }, [selectedDre]);

  // 3. Filtrar Escolas (Depende do Município e da DRE)
  const escolas = useMemo(() => {
    if (!selectedMunicipio || !selectedDre || !schoolData[selectedMunicipio]?.[selectedDre]) return [];
    return schoolData[selectedMunicipio][selectedDre].sort();
  }, [selectedMunicipio, selectedDre]);

  // Efeito: Limpar Município se a DRE mudar (para evitar inconsistência)
  useEffect(() => {
    const currentMunicipio = form.getValues("municipio");
    // Se o município selecionado não pertence mais à lista da nova DRE, limpa
    if (selectedDre && currentMunicipio && !filteredMunicipios.includes(currentMunicipio)) {
        form.setValue("municipio", "");
        form.setValue("nome_escola", "");
    }
  }, [selectedDre, filteredMunicipios, form]);

  // Efeito: Limpar Escola se Município ou DRE mudar
  useEffect(() => {
    const currentEscola = form.getValues("nome_escola");
    if (selectedDre && selectedMunicipio && currentEscola && !escolas.includes(currentEscola)) {
        form.setValue("nome_escola", "");
    }
  }, [selectedDre, selectedMunicipio, escolas, form]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setIsSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/v1/schools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      
      clearLocalDraft();
      onSuccess(result.data.id);
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando Identificação...</div>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* CAMPO DRE (AGORA É O PRIMEIRO) */}
          <FormField control={form.control} name="dre" render={({ field }) => (
              <FormItem>
                <FormLabel>DRE / Setor *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione a DRE primeiro..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    {allDres.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CAMPO MUNICÍPIO (FILTRADO PELA DRE) */}
          <FormField control={form.control} name="municipio" render={({ field }) => (
              <FormItem>
                <FormLabel>Município *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""} disabled={!selectedDre}>
                  <FormControl><SelectTrigger><SelectValue placeholder={selectedDre ? "Selecione..." : "Aguardando DRE..."} /></SelectTrigger></FormControl>
                  <SelectContent>
                    {filteredMunicipios.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CAMPO ZONA */}
          <FormField control={form.control} name="zona" render={({ field }) => (
              <FormItem>
                <FormLabel>Zona *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                  <SelectContent><SelectItem value="Urbana">Urbana</SelectItem><SelectItem value="Rural">Rural</SelectItem><SelectItem value="Ribeirinha">Ribeirinha</SelectItem></SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8">
            <FormField control={form.control} name="nome_escola" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Escola *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={!selectedMunicipio}>
                    <FormControl><SelectTrigger><SelectValue placeholder={selectedMunicipio ? "Selecione..." : "..."} /></SelectTrigger></FormControl>
                    <SelectContent>{escolas.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="md:col-span-4">
            <FormField control={form.control} name="codigo_inep" render={({ field }) => (
                <FormItem><FormLabel>Código INEP *</FormLabel><FormControl><Input placeholder="00000000" maxLength={8} {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField control={form.control} name="cnpj" render={({ field }) => (<FormItem><FormLabel>CNPJ</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="telefone_institucional" render={({ field }) => (<FormItem><FormLabel>Telefone</FormLabel><FormControl><Input placeholder="(91) 00000-0000" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="cep" render={({ field }) => (<FormItem><FormLabel>CEP *</FormLabel><FormControl><Input placeholder="00000-000" maxLength={9} {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
        </div>

        <FormField control={form.control} name="endereco" render={({ field }) => (<FormItem><FormLabel>Endereço Completo *</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />

        <div className="p-4 bg-slate-50 border rounded-md space-y-4">
            <h4 className="font-medium text-slate-700">Dados do Diretor (Se houver)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="nome_diretor" render={({ field }) => (<FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="matricula_diretor" render={({ field }) => (<FormItem><FormLabel>Matrícula</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="contato_diretor" render={({ field }) => (<FormItem><FormLabel>Contato</FormLabel><FormControl><Input placeholder="(91) 9...." {...field} value={field.value || ""} /></FormControl></FormItem>)} />
            </div>
        </div>

        <FormField control={form.control} name="turnos" render={() => (
            <FormItem>
              <div className="mb-4"><FormLabel className="text-base">Turnos de Funcionamento *</FormLabel></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {turnosOptions.map((turno) => (
                  <FormField key={turno} control={form.control} name="turnos" render={({ field }) => (
                      <FormItem key={turno} className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value?.includes(turno)} onCheckedChange={(checked) => checked ? field.onChange([...field.value, turno]) : field.onChange(field.value?.filter((value) => value !== turno))} />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">{turno}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto">
            {isSaving ? "Salvando..." : "Salvar e Continuar →"}
          </Button>
        </div>
      </form>
    </Form>
  );
}