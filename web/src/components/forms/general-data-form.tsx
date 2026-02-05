"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { generalDataSchema, GeneralDataFormValues } from "@/schemas/steps/general-data";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormControl, FormLabel } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectInput, RadioInput, NumberInput, TextInput } from "@/components/ui/form-components";
import { Separator } from "@/components/ui/separator";
import { useCensusPersistence } from "@/hooks/use-census-persistence";
import { Input } from "@/components/ui/input";

interface GeneralDataFormProps {
  schoolId: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function GeneralDataForm({ schoolId, onSuccess, onBack }: GeneralDataFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [availableTurnos, setAvailableTurnos] = useState<string[]>([]);
  
  // Ref para controlar atualizações internas e evitar loop infinito nos cálculos
  const isInternalUpdate = useRef(false);

  const form = useForm<GeneralDataFormValues>({
    resolver: zodResolver(generalDataSchema) as unknown as Resolver<GeneralDataFormValues>,
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
      banheiros_vasos_funcionais: "",
      salas_climatizadas: 0, 
      qtd_salas_aula: 0,
    }
  });

  const { isLoading, saveLocalDraft, clearLocalDraft } = useCensusPersistence(
    schoolId, "general_data", form.reset, form.getValues()
  );

  useEffect(() => {
    const subscription = form.watch((value) => saveLocalDraft(value as GeneralDataFormValues));
    return () => subscription.unsubscribe();
  }, [form, saveLocalDraft]);

  // Busca os dados da escola para saber os turnos
  useEffect(() => {
    if (schoolId) {
        const fetchSchoolData = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/v1/schools?id=${schoolId}`);
                if (response.ok) {
                    const json = await response.json();
                    if (json.data && Array.isArray(json.data.turnos)) {
                        setAvailableTurnos(json.data.turnos);
                    }
                }
            } catch (error) {
                console.error("Erro ao buscar turnos da escola:", error);
            }
        };
        fetchSchoolData();
    }
  }, [schoolId]);

  // Lógica de Autopreenchimento Bidirecional (Rural <-> Urbana) com proteção contra loop
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      // Se a alteração foi causada pelo próprio código (cálculo), ignoramos para não travar a digitação
      if (isInternalUpdate.current) return;

      const total = Number(form.getValues("total_alunos") || 0);

      // Cenário 1: Mudou o Total -> Recalcula Urbana (mantém Rural fixa)
      if (name === "total_alunos") {
         const rural = Number(form.getValues("alunos_rural") || 0);
         if (total >= rural) {
             const newUrbana = total - rural;
             if (Number(form.getValues("alunos_urbana")) !== newUrbana) {
                 isInternalUpdate.current = true;
                 form.setValue("alunos_urbana", newUrbana, { shouldValidate: true });
                 isInternalUpdate.current = false;
             }
         }
      }

      // Cenário 2: Preencheu Rural -> Calcula Urbana
      if (name === "alunos_rural") {
        const rural = Number(value.alunos_rural || 0);
        if (total >= rural) {
            const newUrbana = total - rural;
            // Só atualiza se o valor for diferente para evitar re-render desnecessário
            if (Number(form.getValues("alunos_urbana")) !== newUrbana) {
                isInternalUpdate.current = true;
                form.setValue("alunos_urbana", newUrbana, { shouldValidate: true });
                isInternalUpdate.current = false;
            }
        }
      }

      // Cenário 3: Preencheu Urbana -> Calcula Rural
      if (name === "alunos_urbana") {
        const urbana = Number(value.alunos_urbana || 0);
        if (total >= urbana) {
            const newRural = total - urbana;
            if (Number(form.getValues("alunos_rural")) !== newRural) {
                isInternalUpdate.current = true;
                form.setValue("alunos_rural", newRural, { shouldValidate: true });
                isInternalUpdate.current = false;
            }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);

    if (files.length > 10) {
        setUploadMessage("❌ Máximo de 10 fotos permitidas por vez.");
        e.target.value = "";
        return;
    }

    setIsUploading(true);
    setUploadMessage("Iniciando envio...");
    
    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("school_id", schoolId.toString());

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/v1/upload`, {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(error);
            errorCount++;
        }
    }

    if (errorCount === 0) {
        setUploadMessage(`✅ ${successCount} foto(s) enviada(s) com sucesso!`);
    } else {
        setUploadMessage(`⚠️ ${successCount} enviada(s), ${errorCount} falha(s).`);
    }
    
    setIsUploading(false);
    e.target.value = "";
  };

  async function onSubmit(data: GeneralDataFormValues) {
    setIsSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/v1/census`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, year: 2026, status: "draft", data: data }),
      });

      if (!response.ok) throw new Error("erro ao salvar");
      clearLocalDraft();
      onSuccess();
    } catch (error) {
      console.error(error);
      alert("erro ao salvar dados.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <div className="text-center py-8 text-slate-500">Carregando Dados Gerais...</div>;
  const control = form.control;

  // Helpers para verificar visibilidade dos turnos
  const showManha = availableTurnos.includes("Manhã") || availableTurnos.includes("Integral");
  const showTarde = availableTurnos.includes("Tarde") || availableTurnos.includes("Integral");
  const showNoite = availableTurnos.includes("Noite");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Infraestrutura Escolar</h3>
            <RadioInput<GeneralDataFormValues> control={control} name="tipo_predio" label="Tipo de prédio *" options={["Próprio", "Alugado", "Compartilhado", "Cedido"]} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RadioInput<GeneralDataFormValues> control={control} name="possui_anexos" label="A escola possui anexos? *" options={["Sim", "Não"]} />
                {form.watch("possui_anexos") === "Sim" && (
                    <div className="space-y-4">
                        <NumberInput<GeneralDataFormValues> control={control} name="qtd_anexos" label="Quantidade de anexos" />
                        <RadioInput<GeneralDataFormValues> control={control} name="tipo_predio_anexo" label="Tipo de prédio do anexo" options={["Próprio", "Alugado", "Compartilhado", "Cedido"]} />
                    </div>
                )}
            </div>
        </div>
        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Ensino</h3>
            
            <div className="p-4 bg-blue-50 border rounded-md">
               <NumberInput<GeneralDataFormValues> control={control} name="qtd_salas_aula" label="Quantidade Total de Salas de Aula" />
            </div>

            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Etapas ofertadas</label>
                <div className="grid grid-cols-2 gap-2">
                    {["Ensino Infantil", "Ensino Fundamental I", "Ensino Fundamental II", "Ensino Médio"].map((item) => (
                        <FormField key={item} control={form.control} name="etapas_ofertadas" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v: string) => v !== item))} /></FormControl>
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
                                <FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v: string) => v !== item))} /></FormControl>
                                <FormLabel className="font-normal cursor-pointer">{item}</FormLabel>
                            </FormItem>
                        )} />
                    ))}
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-md">
                {showManha && (
                    <NumberInput<GeneralDataFormValues> control={control} name="turmas_manha" label="Qtd. Turmas (Manhã)" />
                )}
                {showTarde && (
                    <NumberInput<GeneralDataFormValues> control={control} name="turmas_tarde" label="Qtd. Turmas (Tarde)" />
                )}
                {showNoite && (
                    <NumberInput<GeneralDataFormValues> control={control} name="turmas_noite" label="Qtd. Turmas (Noite)" />
                )}
                
                {!showManha && !showTarde && !showNoite && (
                    <div className="col-span-full text-center text-sm text-slate-500 italic">
                        Nenhum turno foi selecionado na etapa de Identificação.
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberInput<GeneralDataFormValues> control={control} name="total_alunos" label="Total de alunos matriculados" />
                <NumberInput<GeneralDataFormValues> control={control} name="alunos_pcd" label="Qtd. alunos PcD (Preenchimento Manual)" />
                <NumberInput<GeneralDataFormValues> control={control} name="alunos_rural" label="Qtd. alunos residência rural" />
                <NumberInput<GeneralDataFormValues> control={control} name="alunos_urbana" label="Qtd. alunos residência urbana" />
            </div>
        </div>
        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Segurança e Manutenção</h3>
            <RadioInput<GeneralDataFormValues> control={control} name="muro_cerca" label="A escola possui muro ou cerca?" options={["Sim, muro", "Sim, cerca", "Não possui"]} />
            {form.watch("muro_cerca") !== "Não possui" && (
                <RadioInput<GeneralDataFormValues> control={control} name="perimetro_fechado" label="O muro ou cerca fecham todo o perímetro?" options={["Sim, totalmente", "Parcialmente", "Não"]} />
            )}
            <SelectInput<GeneralDataFormValues> control={control} name="situacao_estrutura" label="Situação da estrutura da escola" options={["Necessita de reforma geral", "Necessita de reforma parcial (melhoria pontual)", "Reforma em andamento", "Está em reforma, porém a obra está parada", "Foi reformada recentemente"]} />
            
            <div className="p-4 border border-dashed border-blue-300 rounded-md bg-blue-50/50 text-center">
                <p className="text-sm text-slate-700 mb-2 font-medium">Anexar Fotos para Análise</p>
                <div className="max-w-xs mx-auto">
                    <Input 
                        type="file" 
                        accept="image/*"
                        multiple 
                        onChange={handleFileUpload} 
                        disabled={isUploading}
                        className="bg-white"
                    />
                </div>
                {isUploading && <p className="text-xs text-blue-600 mt-2 animate-pulse">Enviando fotos...</p>}
                {uploadMessage && <p className={`text-xs mt-2 font-bold ${uploadMessage.includes("sucesso") ? "text-green-600" : uploadMessage.includes("falha") ? "text-orange-600" : "text-red-600"}`}>{uploadMessage}</p>}
                <p className="text-xs text-slate-400 mt-2">Você pode selecionar até 10 fotos. Elas serão salvas na pasta da escola.</p>
            </div>

            <TextInput<GeneralDataFormValues> control={control} name="data_ultima_reforma" label="Data da última reforma (dd/mm/aaaa)" placeholder="dd/mm/aaaa" />
        </div>
        <Separator />

        <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800">Ambientes Escolares</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {["Biblioteca", "Laboratório de Ciências", "Laboratório de Informática", "Quadra Esportiva", "Refeitório", "Cozinha", "Sala dos Professores", "Auditório", "Secretaria", "Sala de leitura", "SAEE", "Sala de reunião"].map((item) => (
                    <FormField key={item} control={form.control} name="ambientes" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v: string) => v !== item))} /></FormControl>
                            <FormLabel className="font-normal cursor-pointer">{item}</FormLabel>
                        </FormItem>
                    )} />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                {form.watch("ambientes")?.includes("Quadra Esportiva") && (
                    <div className="space-y-4 border p-4 rounded-md">
                        <RadioInput<GeneralDataFormValues> control={control} name="quadra_coberta" label="A quadra esportiva é coberta?" options={["Sim", "Não"]} />
                        <NumberInput<GeneralDataFormValues> control={control} name="qtd_quadras" label="Quantas quadras esportivas?" />
                    </div>
                )}
                <div className="p-4 border rounded-md h-fit">
                    <RadioInput<GeneralDataFormValues> control={control} name="banda_fanfarra" label="A escola possui banda escolar/fanfarra?" options={["Sim", "Não"]} />
                </div>
            </div>
        </div>
        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Sanitários e Climatização</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <NumberInput<GeneralDataFormValues> control={control} name="banheiros_alunos" label="Banheiros Alunos" />
                <NumberInput<GeneralDataFormValues> control={control} name="banheiros_prof" label="Banheiros Prof/Adm" />
                <NumberInput<GeneralDataFormValues> control={control} name="banheiros_chuveiro" label="Banheiros c/ Chuveiro" />
            </div>
            <RadioInput<GeneralDataFormValues> control={control} name="banheiros_vasos_funcionais" label="Os banheiros possuem vasos sanitários funcionais?" options={["Todos", "Alguns", "Nenhum"]} />
            <div className="bg-blue-50 p-4 rounded-md">
                <NumberInput<GeneralDataFormValues> control={control} name="salas_climatizadas" label="Quantidade de salas de aula climatizadas" />
            </div>
        </div>
        <Separator />

        <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-800">Energia Elétrica e Câmeras</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SelectInput<GeneralDataFormValues> control={control} name="energia" label="Fornecimento de energia" options={["Concessionária de energia - Equatorial", "Geração própria", "Outro"]} />
                {/* Removido: transformador */}
            </div>
            <RadioInput<GeneralDataFormValues> control={control} name="rede_eletrica_atende" label="A rede elétrica interna atende a demanda?" options={["Sim", "Parcialmente", "Não"]} />
            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Principais problemas elétricos</label>
                <div className="grid grid-cols-2 gap-2">
                    {["Quedas frequentes", "Sobrecarga", "Fiação antiga", "Quadro elétrico inadequado", "Não há problemas aparentes"].map((item) => (
                        <FormField key={item} control={form.control} name="problemas_eletricos" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((v: string) => v !== item))} /></FormControl>
                                <FormLabel className="font-normal cursor-pointer">{item}</FormLabel>
                            </FormItem>
                        )} />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SelectInput<GeneralDataFormValues> control={control} name="estrutura_climatizacao" label="Estrutura permite climatizar salas?" options={["Sim", "Não, somente com adequações", "Não, todas as salas são climatizadas"]} />
                <RadioInput<GeneralDataFormValues> control={control} name="suporta_novos_equipamentos" label="Suporta novos equipamentos?" options={["Sim", "Parcialmente", "Não"]} />
            </div>
            <div className="p-4 border rounded-md bg-slate-50 space-y-4">
                <SelectInput<GeneralDataFormValues> control={control} name="cameras_funcionamento" label="Possui câmeras em funcionamento?" options={["Sim, funcionando plenamente", "Sim, parcialmente", "Não possui"]} />
                {form.watch("cameras_funcionamento") !== "Não possui" && (
                    <RadioInput<GeneralDataFormValues> control={control} name="cameras_cobrem" label="Cobrem áreas essenciais?" options={["Sim", "Parcialmente", "Não"]} />
                )}
            </div>
        </div>

        <div className="flex justify-between pt-6">
            <Button type="button" variant="outline" onClick={onBack}>← Voltar</Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">{isSaving ? "Salvando..." : "Salvar e Continuar →"}</Button>
        </div>
      </form>
    </Form>
  );
}