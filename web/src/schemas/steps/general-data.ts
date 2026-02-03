import { z } from "zod";

const numberSchema = z.coerce
  .number()
  .transform((val) => (Number.isNaN(val) ? 0 : val))
  .pipe(z.number().min(0, "O valor não pode ser negativo"));

export const generalDataSchema = z.object({
  tipo_predio: z.string().min(1, "Selecione o tipo de prédio"),
  possui_anexos: z.enum(["Sim", "Não"]),
  qtd_anexos: numberSchema.optional(),
  tipo_predio_anexo: z.string().optional(),
  
  etapas_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma etapa"),
  modalidades_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma modalidade"),
  
  qtd_salas_aula: numberSchema,
  turmas_manha: numberSchema.optional(),
  turmas_tarde: numberSchema.optional(),
  turmas_noite: numberSchema.optional(),
  
  total_alunos: numberSchema,
  alunos_pcd: numberSchema.optional(),
  alunos_rural: numberSchema.optional(),
  alunos_urbana: numberSchema.optional(),
  
  muro_cerca: z.string().min(1, "Campo obrigatório"),
  perimetro_fechado: z.enum(["Sim, totalmente", "Parcialmente", "Não"]),
  situacao_estrutura: z.string().min(1, "Campo obrigatório"),
  data_ultima_reforma: z.string().optional(),
  
  ambientes: z.array(z.string()).optional(),
  quadra_coberta: z.enum(["Sim", "Não"]),
  qtd_quadras: numberSchema.optional(),
  banda_fanfarra: z.enum(["Sim", "Não"]),
  
  banheiros_alunos: numberSchema,
  banheiros_prof: numberSchema,
  banheiros_chuveiro: numberSchema,
  banheiros_vasos_funcionais: z.string().min(1, "Campo obrigatório"),
  
  salas_climatizadas: numberSchema,
  energia: z.string().min(1, "Campo obrigatório"),
  transformador: z.enum(["Sim", "Não"]),
  rede_eletrica_atende: z.enum(["Sim", "Parcialmente", "Não"]),
  problemas_eletricos: z.array(z.string()).optional(),
  estrutura_climatizacao: z.enum(["Sim", "Não", "Não, somente com adequações", "Não, todas as salas são climatizadas"]),
  suporta_novos_equipamentos: z.enum(["Sim", "Parcialmente", "Não"]),
  
  cameras_funcionamento: z.string().min(1, "Selecione uma opção"),
  cameras_cobrem: z.string().optional(),
});

export type GeneralDataFormValues = z.infer<typeof generalDataSchema>;