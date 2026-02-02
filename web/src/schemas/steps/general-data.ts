import { z } from "zod";

export const generalDataSchema = z.object({
  tipo_predio: z.string().min(1, "Selecione o tipo de prédio"),
  possui_anexos: z.enum(["Sim", "Não"]),
  qtd_anexos: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  tipo_predio_anexo: z.string().optional(),
  
  etapas_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma etapa"),
  modalidades_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma modalidade"),
  
  qtd_salas_aula: z.coerce.number().min(0, "O valor não pode ser negativo"),
  turmas_manha: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  turmas_tarde: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  turmas_noite: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  
  total_alunos: z.coerce.number().min(0, "O valor não pode ser negativo"),
  alunos_pcd: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  alunos_rural: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  alunos_urbana: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  
  muro_cerca: z.string().min(1, "Campo obrigatório"),
  perimetro_fechado: z.enum(["Sim", "Não"]),
  situacao_estrutura: z.string().min(1, "Campo obrigatório"),
  data_ultima_reforma: z.string().optional(),
  
  ambientes: z.array(z.string()).optional(),
  quadra_coberta: z.enum(["Sim", "Não"]),
  qtd_quadras: z.coerce.number().min(0, "O valor não pode ser negativo").optional(),
  banda_fanfarra: z.enum(["Sim", "Não"]),
  
  banheiros_alunos: z.coerce.number().min(0, "O valor não pode ser negativo"),
  banheiros_prof: z.coerce.number().min(0, "O valor não pode ser negativo"),
  banheiros_chuveiro: z.coerce.number().min(0, "O valor não pode ser negativo"),
  banheiros_vasos_funcionais: z.coerce.number().min(0, "O valor não pode ser negativo"),
  
  salas_climatizadas: z.coerce.number().min(0, "O valor não pode ser negativo"),
  energia: z.string().min(1, "Campo obrigatório"),
  transformador: z.enum(["Sim", "Não"]),
  rede_eletrica_atende: z.enum(["Sim", "Não"]),
  problemas_eletricos: z.array(z.string()).optional(), // Corrigido para array
  estrutura_climatizacao: z.enum(["Sim", "Não", "Não, somente com adequações", "Não, todas as salas são climatizadas"]),
  suporta_novos_equipamentos: z.enum(["Sim", "Parcialmente", "Não"]),
  
  cameras_funcionamento: z.string().min(1, "Selecione uma opção"),
  cameras_cobrem: z.string().optional(),
});

export type GeneralDataFormValues = z.infer<typeof generalDataSchema>;