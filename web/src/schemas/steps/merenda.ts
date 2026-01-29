import { z } from "zod";

export const merendaSchema = z.object({
  // Estrutura
  condicoes_cozinha: z.enum(["Boa", "Regular", "Precária"]),
  tamanho_cozinha: z.enum(["Pequena", "Média", "Grande"]),
  oferta_regular: z.string().min(1, "Informe a regularidade"),
  qualidade_merenda: z.string().min(1, "Informe a qualidade"),
  atende_necessidades: z.string().min(1, "Atende às necessidades?"),
  possui_refeitorio: z.string().min(1, "Possui refeitório?"),
  refeitorio_adequado: z.string().optional(),
  possui_balanca: z.string().optional(),

  // Inventário
  qtd_freezers: z.coerce.number(),
  estado_freezers: z.string().optional(),
  qtd_geladeiras: z.coerce.number(),
  estado_geladeiras: z.string().optional(),
  qtd_fogoes: z.coerce.number(),
  estado_fogoes: z.string().optional(),
  qtd_fornos: z.coerce.number(),
  estado_fornos: z.string().optional(),
  qtd_bebedouros: z.coerce.number(),
  estado_bebedouros: z.string().optional(),

  bancadas_inox: z.string().optional(),
  sistema_exaustao: z.string().optional(),
  despensa_exclusiva: z.string().optional(),
  deposito_conserva: z.string().optional(),
  estoque_epi_extintor: z.string().optional(),
  manutencao_extintores: z.string().optional(),

  // Equipe (Renomeado)
  qtd_merendeiras_estatutaria: z.coerce.number(),
  qtd_merendeiras_terceirizada: z.coerce.number(),
  qtd_merendeiras_temporaria: z.coerce.number(),
  
  qtd_atende_necessidade_merenda: z.string().min(1, "A quantidade atende?"),
  empresa_terceirizada_merenda: z.string().optional(),
  possui_supervisor_merenda: z.string().optional(),
  nome_supervisor_merenda: z.string().optional(),
  contato_supervisor_merenda: z.string().optional(),
});

export type MerendaFormValues = z.infer<typeof merendaSchema>;