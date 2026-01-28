"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { generalDataSchema, GeneralDataFormValues } from "@/schemas/steps/general-data"; 
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormControl, FormLabel } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  SelectInput, 
  RadioInput, 
  NumberInput, 
  TextInput 
} from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";

const STORAGE_KEY = "censo_draft_general_v1";

interface GeneralDataFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function GeneralDataForm({ schoolId, onSuccess, onBack }: GeneralDataFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const form = useForm<GeneralDataFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(generalDataSchema) as any,
    defaultValues: {
        etapas_ofertadas: [],
        modalidades_ofertadas: [],
        ambientes: [],
        problemas_eletricos: [],
        turmas_manha: 0,
        turmas_tarde: 0,
        turmas_noite: 0,
        total_alunos: 0,
        alunos_pcd: 0,
        alunos_rural: 0,
        alunos_urbana: 0,
        qtd_anexos: 0,
        qtd_quadras: 0,
        banheiros_alunos: 0,
        banheiros_prof: 0,
        banheiros_chuveiro: 0,
        salas_climatizadas: 0,
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
        
        {/* BLOCO 1: INFRAESTRUTURA BÁSICA */}
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Infraestrutura Escolar</h3>
            
            <RadioInput control={control} name="tipo_predio" label="Tipo de prédio *" options={["Próprio", "Alugado", "Compartilhado", "Cedido"]} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput control={control} name="possui_anexos" label="A escola possui anexos? *" options={["Sim", "Não"]} />
                {form.watch("possui_anexos") === "Sim" && (
                    <div className="space-y-4">
                        <NumberInput control={control} name="qtd_anexos" label="Quantidade de anexos" />
                        <RadioInput control={control} name="tipo_predio_anexo" label="Tipo de prédio do anexo" options={["Próprio", "Alugado", "Compartilhado", "Cedido"]} />
                    </div>
                )}
            </div>
        </div>

        <Separator />

        {/* BLOCO 2: ETAPAS E MODALIDADES */}
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Ensino</h3>
            
            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Etapas ofertadas</label>
                <div className="grid grid-cols-2 gap-2">
                    {["Ensino Infantil", "Ensino Fundamental I", "Ensino Fundamental II", "Ensino Médio"].map((item) => (
                        <FormField key={item} control={form.control} name="etapas_ofertadas" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                    <Checkbox 
                                        checked={field.value?.includes(item)}
                                        onCheckedChange={(checked) => {
                                            return checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v) => v !== item))
                                        }}
                                    />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">{item}</FormLabel>
                            </FormItem>
                        )} />
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Modalidades ofertadas</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {["Ensino Regular", "Ensino Integral", "Educação de Jovens e Adultos (EJA)", "Educação Especial", "Educação Profissional e Tecnológica", "Educação do Campo", "Educação Escolar Indígena", "Educação Quilombola", "CEMEP", "SOME", "PPL"].map((item) => (
                        <FormField key={item} control={form.control} name="modalidades_ofertadas" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                    <Checkbox 
                                        checked={field.value?.includes(item)}
                                        onCheckedChange={(checked) => {
                                            return checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v) => v !== item))
                                        }}
                                    />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">{item}</FormLabel>
                            </FormItem>
                        )} />
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-md">
                <NumberInput control={control} name="turmas_manha" label="Qtd. Turmas (Manhã)" />
                <NumberInput control={control} name="turmas_tarde" label="Qtd. Turmas (Tarde)" />
                <NumberInput control={control} name="turmas_noite" label="Qtd. Turmas (Noite)" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberInput control={control} name="total_alunos" label="Total de alunos matriculados" />
                <NumberInput control={control} name="alunos_pcd" label="Qtd. alunos PcD" />
                <NumberInput control={control} name="alunos_rural" label="Qtd. alunos residência rural" />
                <NumberInput control={control} name="alunos_urbana" label="Qtd. alunos residência urbana" />
            </div>
        </div>

        <Separator />

        {/* BLOCO 3: SEGURANÇA E ESTRUTURA */}
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Segurança e Manutenção</h3>
            
            <RadioInput control={control} name="muro_cerca" label="A escola possui muro ou cerca?" options={["Sim, muro", "Sim, cerca", "Sim, ambos", "Não possui"]} />
            
            {form.watch("muro_cerca") !== "Não possui" && (
                <RadioInput control={control} name="perimetro_fechado" label="O muro ou cerca fecham todo o perímetro?" options={["Sim, totalmente", "Parcialmente", "Não"]} />
            )}

            <SelectInput 
                control={control} 
                name="situacao_estrutura" 
                label="Situação da estrutura da escola" 
                options={[
                    "Necessita de reforma geral",
                    "Necessita de reforma parcial (melhoria pontual)",
                    "Reforma em andamento",
                    "Está em reforma, porém a obra está parada",
                    "Foi reformada recentemente"
                ]} 
            />

            <div className="p-4 border border-dashed rounded-md bg-slate-50 text-center">
                <p className="text-sm text-slate-600 mb-2">Anexar Fotos para Análise</p>
                <p className="text-xs text-slate-400 mb-4">Para necessidade de reforma geral, anexar 10 fotos. Para melhoria, 5 fotos.</p>
                <Button type="button" variant="secondary" className="w-full">Solte os arquivos aqui ou Explore</Button>
            </div>

            <TextInput control={control} name="data_ultima_reforma" label="Data da última reforma (dd/mm/aaaa)" placeholder="dd/mm/aaaa" />
        </div>

        <Separator />

        {/* BLOCO 4: AMBIENTES */}
        <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800">Ambientes Escolares</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {["Biblioteca", "Laboratório de Ciências", "Laboratório de Informática", "Quadra Esportiva", "Refeitório", "Cozinha", "Sala dos Professores", "Auditório", "Secretaria", "Sala de leitura", "SAEE", "Sala de reunião"].map((item) => (
                    <FormField key={item} control={form.control} name="ambientes" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                                <Checkbox 
                                    checked={field.value?.includes(item)}
                                    onCheckedChange={(checked) => {
                                        return checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v) => v !== item))
                                    }}
                                />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">{item}</FormLabel>
                        </FormItem>
                    )} />
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                {form.watch("ambientes")?.includes("Quadra Esportiva") && (
                    <div className="space-y-4 border p-4 rounded-md">
                        <RadioInput control={control} name="quadra_coberta" label="A quadra esportiva é coberta?" options={["Sim", "Não"]} />
                        <NumberInput control={control} name="qtd_quadras" label="Quantas quadras esportivas?" />
                    </div>
                )}
                <div className="p-4 border rounded-md h-fit">
                    <RadioInput control={control} name="banda_fanfarra" label="A escola possui banda escolar/fanfarra?" options={["Sim", "Não"]} />
                </div>
            </div>
        </div>

        <Separator />

        {/* BLOCO 5: SANITÁRIOS E CLIMATIZAÇÃO */}
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Sanitários e Climatização</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <NumberInput control={control} name="banheiros_alunos" label="Banheiros Alunos" />
                <NumberInput control={control} name="banheiros_prof" label="Banheiros Prof/Adm" />
                <NumberInput control={control} name="banheiros_chuveiro" label="Banheiros c/ Chuveiro" />
            </div>
            <RadioInput control={control} name="banheiros_vasos_funcionais" label="Os banheiros possuem vasos sanitários funcionais?" options={["Todos", "Alguns", "Nenhum"]} />
            <div className="bg-blue-50 p-4 rounded-md">
                <NumberInput control={control} name="salas_climatizadas" label="Quantidade de salas de aula climatizadas" />
            </div>
        </div>

        <Separator />

        {/* BLOCO 6: ENERGIA ELÉTRICA */}
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Energia Elétrica e Câmeras</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SelectInput 
                    control={control} 
                    name="energia" 
                    label="Fornecimento de energia" 
                    options={["Concessionária de energia - Equatorial", "Geração própria", "Outro"]} 
                />
                <RadioInput control={control} name="transformador" label="Atendida por transformadores?" options={["Sim", "Não"]} />
            </div>

            <RadioInput control={control} name="rede_eletrica_atende" label="A rede elétrica interna atende a demanda?" options={["Sim", "Parcialmente", "Não"]} />

            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Principais problemas elétricos</label>
                <div className="grid grid-cols-2 gap-2">
                    {["Quedas frequentes", "Sobrecarga", "Fiação antiga", "Quadro elétrico inadequado", "Não há problemas aparentes"].map((item) => (
                        <FormField key={item} control={form.control} name="problemas_eletricos" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                    <Checkbox 
                                        checked={field.value?.includes(item)}
                                        onCheckedChange={(checked) => {
                                            return checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v) => v !== item))
                                        }}
                                    />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">{item}</FormLabel>
                            </FormItem>
                        )} />
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SelectInput 
                    control={control} 
                    name="estrutura_climatizacao" 
                    label="Estrutura permite climatizar salas?" 
                    options={["Sim", "Não, somente com adequações", "Não, todas as salas são climatizadas"]} 
                />
                <RadioInput control={control} name="suporta_novos_equipamentos" label="Suporta novos equipamentos?" options={["Sim", "Parcialmente", "Não"]} />
            </div>

            <div className="p-4 border rounded-md bg-slate-50 space-y-4">
                <SelectInput 
                    control={control} 
                    name="cameras_funcionamento" 
                    label="Possui câmeras em funcionamento?" 
                    options={["Sim, funcionando plenamente", "Sim, parcialmente", "Não possui"]} 
                />
                {form.watch("cameras_funcionamento") !== "Não possui" && (
                    <RadioInput control={control} name="cameras_cobrem" label="Cobrem áreas essenciais?" options={["Sim", "Parcialmente", "Não"]} />
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