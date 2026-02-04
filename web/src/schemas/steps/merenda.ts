import { z } from "zod";

export const merendaSchema = z.object({
  condicoes_cozinha: z.string().min(1, "Campo obrigatório"),
  tamanho_cozinha: z.string().min(1, "Campo obrigatório"),
  oferta_regular: z.string().min(1, "Campo obrigatório"),
  qualidade_merenda: z.string().min(1, "Campo obrigatório"),
  
  atende_necessidades: z.enum(["Sim", "Parcialmente", "Não"]), // Refere-se à estrutura/oferta
  possui_refeitorio: z.enum(["Sim", "Não"]),
  refeitorio_adequado: z.enum(["Sim", "Não"]).optional(),
  possui_balanca: z.enum(["Sim", "Não"]),
  
  qtd_freezers: z.coerce.number().min(0, "Não pode ser negativo"),
  estado_freezers: z.string().optional(),
  qtd_geladeiras: z.coerce.number().min(0, "Não pode ser negativo"),
  estado_geladeiras: z.string().optional(),
  qtd_fogoes: z.coerce.number().min(0, "Não pode ser negativo"),
  estado_fogoes: z.string().optional(),
  qtd_fornos: z.coerce.number().min(0, "Não pode ser negativo"),
  estado_fornos: z.string().optional(),
  
  qtd_bebedouros: z.coerce.number().min(0, "Não pode ser negativo"),
  estado_bebedouros: z.string().optional(),
  bancadas_inox: z.enum(["Sim", "Não"]),
  sistema_exaustao: z.enum(["Sim", "Não"]),
  
  despensa_exclusiva: z.enum(["Sim", "Não"]),
  deposito_conserva: z.enum(["Sim", "Parcialmente", "Não"]),
  estoque_epi_extintor: z.string().optional(),
  manutencao_extintores: z.string().optional(),
  
  // Recursos Humanos - Merendeiras
  qtd_merendeiras_estatutaria: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_merendeiras_terceirizada: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_merendeiras_temporaria: z.coerce.number().min(0, "Não pode ser negativo"),
  
  // Pergunta Quantitativa (Adicionada)
  qtd_atende_necessidade_merenda: z.enum(["Sim", "Não"]).optional(),
  quantitativo_necessario_merenda: z.coerce.number().optional(), // Novo campo
  
  empresa_terceirizada_merenda: z.string().optional(),
  possui_supervisor_merenda: z.enum(["Sim", "Não"]).optional(),
  nome_supervisor_merenda: z.string().optional(),
  contato_supervisor_merenda: z.string().optional(),
});

export type MerendaFormValues = z.infer<typeof merendaSchema>;