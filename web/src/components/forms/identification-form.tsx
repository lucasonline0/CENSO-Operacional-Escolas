"use client";

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

export function IdentificationForm() {
  // 1. Inicializa o Hook Form com validação Zod
  const form = useForm<SchoolIdentificationForm>({
    resolver: zodResolver(schoolIdentificationSchema),
    defaultValues: {
      nome_escola: "",
      codigo_inep: "",
      municipio: "",
      uf: "PA", // Padrão
      zona: undefined,
      dre: "",
    },
  });

  // 2. Função de Envio (Por enquanto, apenas loga no console)
  function onSubmit(data: SchoolIdentificationForm) {
    console.log("📝 Dados validados prontos para envio:", data);
    alert("Dados validados! Verifique o console (F12).");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          <div className="md:col-span-8">
            <FormField
              control={form.control}
              name="nome_escola"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Escola *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: E.E.E.M. AUGUSTO MEIRA" {...field} />
                  </FormControl>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <FormField
            control={form.control}
            name="municipio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Município *</FormLabel>
                <FormControl>
                  <Input placeholder="Belém" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>DRE (Diretoria) *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a DRE" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="bel_1">Belém 1</SelectItem>
                    <SelectItem value="bel_2">Belém 2</SelectItem>
                    <SelectItem value="anani">Ananindeua</SelectItem>
                    <SelectItem value="maraba">Marabá</SelectItem>
                  </SelectContent>
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
                <FormLabel>Zona de Localização *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
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

        <FormField
          control={form.control}
          name="endereco"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço Completo *</FormLabel>
              <FormControl>
                <Input placeholder="Rua, Número, Bairro, CEP" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" className="w-full md:w-auto bg-blue-600 hover:bg-blue-700">
            Salvar e Continuar &rarr;
          </Button>
        </div>

      </form>
    </Form>
  );
}