"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { merendaSchema, MerendaFormValues } from "@/schemas/steps/merenda"; 
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { 
  SelectInput, 
  RadioInput, 
  NumberInput, 
  TextInput 
} from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";

const STORAGE_KEY = "censo_draft_merenda_v1";

interface MerendaFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function MerendaForm({ schoolId, onSuccess, onBack }: MerendaFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const form = useForm<MerendaFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(merendaSchema) as any,
    defaultValues: {
        qtd_freezers: 0,
        qtd_geladeiras: 0,
        qtd_fogoes: 0,
        qtd_fornos: 0,
        qtd_bebedouros: 0,
        qtd_merendeiras_estatutaria: 0,
        qtd_merendeiras_terceirizada: 0,
        qtd_merendeiras_temporaria: 0,
    }
  });

  useEffect(() => {
    async function fetchData() {
        let serverData = null;
        try {
            const response = await fetch(`http://localhost:8000/v1/schools?id=${schoolId}`); // Ajustado para buscar na rota correta de leitura
            if (!response.ok) {
                 // Tenta buscar no censo se não achar na escola (caso já tenha salvo rascunho)
                 const resCenso = await fetch(`http://localhost:8000/v1/census?school_id=${schoolId}`);
                 if (resCenso.ok) {
                    const result = await resCenso.json();
                    if (result.data) serverData = result.data;
                 }
            } else {
                const result = await response.json();
                if (result.data) serverData = result.data; // Dados base da escola
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
      const subscription = form.watch((value) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      });
      return () => subscription.unsubscribe();
  }, [form]);

  async function onSubmit(data: MerendaFormValues) {
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
        
        <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800">Estrutura e Qualidade</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput 
                    control={control} 
                    name="condicoes_cozinha" 
                    label="Condições da cozinha *" 
                    options={["Boa", "Regular", "Precária"]} 
                />
                <RadioInput 
                    control={control} 
                    name="tamanho_cozinha" 
                    label="Tamanho da cozinha *" 
                    options={["Pequena", "Média", "Grande"]} 
                />
            </div>

            <Separator className="my-2" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <SelectInput 
                    control={control} 
                    name="oferta_regular" 
                    label="A merenda é ofertada regularmente? *" 
                    options={["Sim", "Sim, com falhas", "Não"]} 
                />
                <SelectInput 
                    control={control} 
                    name="qualidade_merenda" 
                    label="Qualidade da merenda *" 
                    options={["Sim", "Regular", "Ruim"]} 
                />
            </div>
            
            <RadioInput 
                control={control} 
                name="atende_necessidades" 
                label="Atende às necessidades dos alunos? *" 
                options={["Sim", "Parcialmente", "Não"]} 
            />

            <div className="p-4 bg-slate-50 border rounded-md grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput control={control} name="possui_refeitorio" label="Possui refeitório?" options={["Sim", "Não"]} />
                {form.watch("possui_refeitorio") === "Sim" && (
                    <RadioInput control={control} name="refeitorio_adequado" label="Atende adequadamente?" options={["Sim", "Não"]} />
                )}
            </div>
             <RadioInput control={control} name="possui_balanca" label="Possui balança?" options={["Sim", "Não"]} />
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Inventário de Equipamentos</h3>
            <p className="text-sm text-slate-500">Informe a quantidade e o estado de conservação predominante.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                <div className="space-y-2 p-3 border rounded bg-white/50">
                    <NumberInput control={control} name="qtd_freezers" label="Qtd. Freezers" />
                    <SelectInput 
                        control={control} 
                        name="estado_freezers" 
                        label="Estado de Conservação" 
                        options={["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]} 
                    />
                </div>

                <div className="space-y-2 p-3 border rounded bg-white/50">
                    <NumberInput control={control} name="qtd_geladeiras" label="Qtd. Geladeiras" />
                    <SelectInput 
                        control={control} 
                        name="estado_geladeiras" 
                        label="Estado de Conservação" 
                        options={["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]} 
                    />
                </div>

                <div className="space-y-2 p-3 border rounded bg-white/50">
                    <NumberInput control={control} name="qtd_fogoes" label="Qtd. Fogões Industriais" />
                    <SelectInput 
                        control={control} 
                        name="estado_fogoes" 
                        label="Estado de Conservação" 
                        options={["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]} 
                    />
                </div>

                 <div className="space-y-2 p-3 border rounded bg-white/50">
                    <NumberInput control={control} name="qtd_fornos" label="Qtd. Fornos Elétricos/Gás" />
                    <SelectInput 
                        control={control} 
                        name="estado_fornos" 
                        label="Estado de Conservação" 
                        options={["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]} 
                    />
                </div>

                 <div className="space-y-2 p-3 border rounded bg-white/50">
                    <NumberInput control={control} name="qtd_bebedouros" label="Qtd. Bebedouros" />
                    <SelectInput 
                        control={control} 
                        name="estado_bebedouros" 
                        label="Estado de Conservação" 
                        options={["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]} 
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <RadioInput control={control} name="bancadas_inox" label="Possui bancadas de inox?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="sistema_exaustao" label="Possui sistema de exaustão?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="despensa_exclusiva" label="Despensa exclusiva p/ alimentos?" options={["Sim", "Não"]} />
                <RadioInput control={control} name="deposito_conserva" label="Depósito conserva adequadamente?" options={["Sim", "Parcialmente", "Não"]} />
            </div>

             <div className="p-4 bg-orange-50 border border-orange-200 rounded-md space-y-4">
                <RadioInput 
                    control={control} 
                    name="estoque_epi_extintor" 
                    label="Estoque de EPIs e Extintor" 
                    options={["Completo", "Parcial", "Inexistente"]} 
                />
                <RadioInput 
                    control={control} 
                    name="manutencao_extintores" 
                    label="Manutenção dos Extintores" 
                    options={["Está na validade", "Validade vencida"]} 
                />
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Equipe de Merenda</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <NumberInput control={control} name="qtd_merendeiras_estatutaria" label="Qtd. Estatutárias" />
                <NumberInput control={control} name="qtd_merendeiras_terceirizada" label="Qtd. Terceirizadas" />
                <NumberInput control={control} name="qtd_merendeiras_temporaria" label="Qtd. Temporárias" />
            </div>

            <RadioInput 
                control={control} 
                name="qtd_atende_necessidade" 
                label="A quantidade atual atende a necessidade?" 
                options={["Sim", "Não"]} 
            />

            <div className="p-4 bg-blue-50/50 border rounded-md space-y-4">
                <SelectInput 
                    control={control} 
                    name="empresa_terceirizada" 
                    label="Empresa Terceirizada (Merenda)" 
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