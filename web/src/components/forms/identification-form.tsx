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

// Importa os dados gerados pelo Python
// Se der erro aqui, é porque você ainda não rodou o script Python!
import { schoolData } from "@/data/schools"; 

export function IdentificationForm() {
  const [isLoading, setIsLoading] = useState(false);

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

  // --- LÓGICA DE CASCATA (DATABASE) ---

  const selectedMunicipio = form.watch("municipio");
  const selectedDre = form.watch("dre");

  // 1. Lista de Municípios (Ordenada)
  const municipios = useMemo(() => {
    return Object.keys(schoolData || {}).sort();
  }, []);

  // 2. Lista de DREs (Baseada no Município selecionado)
  const dres = useMemo(() => {
    if (!selectedMunicipio || !schoolData[selectedMunicipio]) return [];
    return Object.keys(schoolData[selectedMunicipio]).sort();
  }, [selectedMunicipio]);

  // 3. Lista de Escolas (Baseada na DRE selecionada)
  const escolas = useMemo(() => {
    if (!selectedMunicipio || !selectedDre || !schoolData[selectedMunicipio]?.[selectedDre]) return [];
    return schoolData[selectedMunicipio][selectedDre].sort();
  }, [selectedMunicipio, selectedDre]);

  // Reset automático dos campos filhos quando o pai muda
  useEffect(() => {
    if (selectedMunicipio && !dres.includes(form.getValues("dre"))) {
        form.setValue("dre", "");
        form.setValue("nome_escola", "");
    }
  }, [selectedMunicipio, dres, form]);

  useEffect(() => {
    if (selectedDre && !escolas.includes(form.getValues("nome_escola"))) {
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

      if (!response.ok) throw new Error(await response.text());

      const result = await response.json();
      alert(`✅ Escola salva com sucesso! ID: ${result.data.id}`);
    } catch (error) {
      console.error(error);
      alert("❌ Erro ao salvar. Verifique se o backend Go está rodando.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* GRUPO 1: Localização Hierárquica */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* MUNICÍPIO */}
          <FormField
            control={form.control}
            name="municipio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Município *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {municipios.map((muni) => (
                      <SelectItem key={muni} value={muni}>{muni}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* DRE / URE */}
          <FormField
            control={form.control}
            name="dre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>DRE / Setor *</FormLabel>
                <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={!selectedMunicipio}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {dres.map((dre) => (
                      <SelectItem key={dre} value={dre}>{dre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ZONA */}
          <FormField
            control={form.control}
            name="zona"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Zona *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  </FormControl>
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

        {/* GRUPO 2: Escola e INEP */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8">
            <FormField
              control={form.control}
              name="nome_escola"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Escola *</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={!selectedDre}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedDre ? "Selecione a Escola" : "..."} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {escolas.map((esc) => (
                        <SelectItem key={esc} value={esc}>{esc}</SelectItem>
                      ))}
                    </SelectContent>
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
                  <FormControl>
                    <Input placeholder="00000000" maxLength={8} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* GRUPO 3: Endereço */}
        <FormField
          control={form.control}
          name="endereco"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço Completo *</FormLabel>
              <FormControl>
                <Input placeholder="Logradouro, Número, Bairro, CEP" {...field} />
              </FormControl>
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