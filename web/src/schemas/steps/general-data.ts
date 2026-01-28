import { z } from "zod";

export const generalDataSchema = z.object({
  tipo_predio: z.enum(["Próprio", "Alugado", "Compartilhado", "Cedido"]),
  possui_anexos: z.enum(["Sim", "Não"]),
  qtd_anexos: z.coerce.number().optional(),
  tipo_predio_anexo: z.enum(["Próprio", "Alugado", "Compartilhado", "Cedido"]).optional(),
  
  etapas_ofertadas: z.array(z.string()).optional(),
  modalidades_ofertadas: z.array(z.string()).optional(),
  
  turmas_manha: z.coerce.number().default(0),
  turmas_tarde: z.coerce.number().default(0),
  turmas_noite: z.coerce.number().default(0),
  
  total_alunos: z.coerce.number().default(0),
  alunos_pcd: z.coerce.number().default(0),
  alunos_rural: z.coerce.number().default(0),
  alunos_urbana: z.coerce.number().default(0),
  
  // Opções exatas do documento
  muro_cerca: z.enum(["Sim, muro", "Sim, cerca", "Sim, ambos", "Não possui"]),
  perimetro_fechado: z.enum(["Sim, totalmente", "Parcialmente", "Não"]).optional(),
  
  // Opções exatas do documento
  situacao_estrutura: z.enum([
    "Necessita de reforma geral",
    "Necessita de reforma parcial (melhoria pontual)",
    "Reforma em andamento",
    "Está em reforma, porém a obra está parada",
    "Foi reformada recentemente"
  ]),
  
  data_ultima_reforma: z.string().optional(),
  
  // Ambientes
  ambientes: z.array(z.string()).optional(),
  
  quadra_coberta: z.enum(["Sim", "Não"]).optional(),
  qtd_quadras: z.coerce.number().default(0),
  banda_fanfarra: z.enum(["Sim", "Não"]),
  
  banheiros_alunos: z.coerce.number().default(0),
  banheiros_prof: z.coerce.number().default(0),
  banheiros_chuveiro: z.coerce.number().default(0),
  banheiros_vasos_funcionais: z.enum(["Todos", "Alguns", "Nenhum"]),
  
  salas_climatizadas: z.coerce.number().default(0),
  
  energia: z.enum(["Concessionária de energia - Equatorial", "Geração própria", "Outro"]),
  transformador: z.enum(["Sim", "Não"]),
  rede_eletrica_atende: z.enum(["Sim", "Parcialmente", "Não"]),
  
  // Principais problemas elétricos
  problemas_eletricos: z.array(z.string()).optional(),
  
  estrutura_climatizacao: z.enum(["Sim", "Não, somente com adequações", "Não, todas as salas são climatizadas"]),
  suporta_novos_equipamentos: z.enum(["Sim", "Parcialmente", "Não"]),
  
  cameras_funcionamento: z.enum(["Sim, funcionando plenamente", "Sim, parcialmente", "Não possui"]),
  cameras_cobrem: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
});

export type GeneralDataFormValues = z.infer<typeof generalDataSchema>;