"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { generalDataSchema } from "@/schemas/steps/general-data"; 
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { 
  SelectInput, 
  RadioInput, 
  CheckboxGroup, 
  NumberInput, 
  TextInput 
} from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";

const STORAGE_KEY = "censo_draft_general_v1";

type GeneralDataFormValues = z.infer<typeof generalDataSchema>;

interface GeneralDataFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function GeneralDataForm({ schoolId, onSuccess, onBack }: GeneralDataFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const form = useForm({
    resolver: zodResolver(generalDataSchema),
    defaultValues: {
        etapas_ofertadas: [],
        modalidades_ofertadas: [],
        ambientes: [],
        problemas_eletricos: [],
        tipo_predio: undefined,
        possui_anexos: undefined,
        muro_cerca: undefined,
        perimetro_fechado: undefined,
        situacao_estrutura: undefined,
        tipo_predio_anexo: undefined,
    }
  });

  useEffect(() => {
    async function fetchData() {
        let serverData = null;

        try {
            const response = await fetch(`http://localhost:8000/v1/census?school_id=${schoolId}`);
            if (response.ok) {
                const result = await response.json();
                if (result.data) {
                    serverData = result.data;
                }
            }
        } catch (error) {
            console.error("erro ao buscar dados:", error);
        }

        const savedDraft = localStorage.getItem(STORAGE_KEY);
        let draftData = null;
        if (savedDraft) {
             try {
                 draftData = JSON.parse(savedDraft);
             } catch (e) {
                 console.error(e);
             }
        }

        const mergedData = {
            ...form.getValues(),
            ...(serverData || {}),
            ...(draftData || {}) 
        };

        form.reset(mergedData);
        setIsFetching(false);
    }

    if (schoolId) {
        fetchData();
    }
  }, [schoolId, form]);

  useEffect(() => {
      const subscription = form.watch((value) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      });
      return () => subscription.unsubscribe();
  }, [form]);

  async function onSubmit(data: GeneralDataFormValues) {
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

  if (isFetching) {
      return <div className="text-center py-8 text-slate-500">Carregando dados salvos...</div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-4">
            <h3 className="text-lg font-medium">Estrutura Física</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SelectInput 
                    control={form.control} 
                    name="tipo_predio" 
                    label="Tipo de prédio *" 
                    options={["Próprio", "Alugado", "Compartilhado", "Cedido"]} 
                />
                
                <RadioInput 
                    control={form.control} 
                    name="possui_anexos" 
                    label="A escola possui anexos? *" 
                    options={["Sim", "Não"]} 
                />
            </div>

            {form.watch("possui_anexos") === "Sim" && (
                <div className="p-4 border rounded-md bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <NumberInput 
                        control={form.control} 
                        name="qtd_anexos" 
                        label="Quantidade de anexos" 
                    />
                    <SelectInput 
                        control={form.control} 
                        name="tipo_predio_anexo" 
                        label="Tipo de prédio do anexo" 
                        options={["Próprio", "Alugado", "Compartilhado", "Cedido"]} 
                    />
                </div>
            )}
        </div>

        <Separator />

        <div className="space-y-4">
            <h3 className="text-lg font-medium">Oferta de Ensino</h3>
            
            <CheckboxGroup 
                control={form.control} 
                name="etapas_ofertadas" 
                label="Etapas ofertadas" 
                options={[
                    "Ensino Infantil", 
                    "Ensino Fundamental I", 
                    "Ensino Fundamental II", 
                    "Ensino Médio"
                ]} 
            />

            <CheckboxGroup 
                control={form.control} 
                name="modalidades_ofertadas" 
                label="Modalidades ofertadas" 
                options={[
                    "Ensino Regular", "Ensino Integral", "Educação de Jovens e Adultos (EJA)",
                    "Educação Especial", "Educação Profissional e Tecnológica", "Educação do Campo",
                    "Educação Escolar Indígena", "Educação Quilombola", "CEMEP", "SOME", "PPL"
                ]} 
            />
        </div>

        <Separator />

        <div className="space-y-4">
            <h3 className="text-lg font-medium">Quantitativos</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <NumberInput control={form.control} name="turmas_manha" label="Turmas (Manhã)" />
                <NumberInput control={form.control} name="turmas_tarde" label="Turmas (Tarde)" />
                <NumberInput control={form.control} name="turmas_noite" label="Turmas (Noite)" />
                <NumberInput control={form.control} name="total_alunos" label="Total Alunos" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <NumberInput control={form.control} name="alunos_pcd" label="Alunos PcD" />
                <NumberInput control={form.control} name="alunos_rural" label="Residência Rural" />
                <NumberInput control={form.control} name="alunos_urbana" label="Residência Urbana" />
            </div>
        </div>

        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium">Segurança e Estrutura</h3>
            
            <RadioInput 
                control={form.control} 
                name="muro_cerca" 
                label="A escola possui muro ou cerca no perímetro?" 
                options={["Sim, muro", "Sim, cerca", "Sim, ambos", "Não possui"]} 
            />

            <RadioInput 
                control={form.control} 
                name="perimetro_fechado" 
                label="O muro ou cerca fecham todo o perímetro?" 
                options={["Sim, totalmente", "Parcialmente", "Não"]} 
            />

            <SelectInput 
                control={form.control} 
                name="situacao_estrutura" 
                label="Em relação a situação da estrutura da escola" 
                options={[
                    "Necessita de reforma geral",
                    "Necessita de reforma parcial (melhoria pontual)",
                    "Reforma em andamento",
                    "Está em reforma, porém a obra está parada",
                    "Foi reformada recentemente"
                ]} 
            />

            <TextInput control={form.control} name="data_ultima_reforma" label="Data da última reforma (dd/mm/aaaa)" />
        </div>

        <Separator />

        <div className="space-y-4">
            <h3 className="text-lg font-medium">Ambientes Escolares</h3>
            <CheckboxGroup 
                control={form.control} 
                name="ambientes" 
                label="A escola possui:" 
                options={[
                    "Biblioteca", "Laboratório de Ciências", "Laboratório de Informática",
                    "Quadra Esportiva", "Refeitório", "Cozinha", "Sala dos Professores",
                    "Auditório", "Secretaria", "Sala de leitura", "SAEE", "Sala de reunião"
                ]} 
            />
            
            {form.watch("ambientes")?.includes("Quadra Esportiva") && (
                <div className="p-4 bg-slate-50 border rounded-md space-y-4">
                    <RadioInput control={form.control} name="quadra_coberta" label="A quadra é coberta?" options={["Sim", "Não"]} />
                    <NumberInput control={form.control} name="qtd_quadras" label="Quantas quadras?" />
                </div>
            )}
             <RadioInput control={form.control} name="banda_fanfarra" label="Possui banda/fanfarra?" options={["Sim", "Não"]} />
        </div>

        <Separator />

        <div className="space-y-4">
            <h3 className="text-lg font-medium">Instalações Sanitárias</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <NumberInput control={form.control} name="banheiros_alunos" label="Banheiros Alunos" />
                <NumberInput control={form.control} name="banheiros_prof" label="Banheiros Prof/Adm" />
                <NumberInput control={form.control} name="banheiros_chuveiro" label="Com Chuveiro" />
            </div>
            <RadioInput 
                control={form.control} 
                name="banheiros_vasos_funcionais" 
                label="Os vasos sanitários são funcionais?" 
                options={["Todos", "Alguns", "Nenhum"]} 
            />
        </div>

        <Separator />

         <div className="space-y-4">
            <h3 className="text-lg font-medium">Energia e Climatização</h3>
            <NumberInput control={form.control} name="salas_climatizadas" label="Qtd. Salas Climatizadas" />
            
            <SelectInput 
                control={form.control} 
                name="energia" 
                label="Fornecimento de energia" 
                options={["Concessionária - Equatorial", "Geração própria", "Outro"]} 
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput control={form.control} name="transformador" label="Atendida por transformadores?" options={["Sim", "Não"]} />
                <RadioInput control={form.control} name="rede_eletrica_atende" label="Rede atende a demanda?" options={["Sim", "Parcialmente", "Não"]} />
            </div>

            <CheckboxGroup 
                control={form.control} 
                name="problemas_eletricos" 
                label="Principais problemas elétricos:" 
                options={[
                    "Quedas frequentes", "Sobrecarga", "Fiação antiga", 
                    "Quadro elétrico inadequado", "Não há problemas aparentes"
                ]} 
            />

            <RadioInput 
                control={form.control} 
                name="estrutura_climatizacao" 
                label="Permite climatizar salas?" 
                options={["Sim", "Não, somente com adequações", "Não, todas as salas são climatizadas"]} 
            />
            
            <RadioInput 
                control={form.control} 
                name="suporta_novos_equipamentos" 
                label="Suporta novos equipamentos?" 
                options={["Sim", "Parcialmente", "Não"]} 
            />
        </div>

        <Separator />

        <div className="space-y-4">
            <h3 className="text-lg font-medium">Segurança Eletrônica</h3>
            <RadioInput 
                control={form.control} 
                name="cameras_funcionamento" 
                label="Câmeras em funcionamento?" 
                options={["Sim, funcionando plenamente", "Sim, parcialmente", "Não possui"]} 
            />
            <RadioInput 
                control={form.control} 
                name="cameras_cobrem" 
                label="Cobrem áreas essenciais?" 
                options={["Sim", "Parcialmente", "Não"]} 
            />
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