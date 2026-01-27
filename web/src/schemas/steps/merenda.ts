import { z } from "zod";

export const merendaSchema = z.object({
  condicoes_cozinha: z.enum(["Boa", "Regular", "Precária"]),
  tamanho_cozinha: z.enum(["Pequena", "Média", "Grande"]),
  oferta_regular: z.enum(["Sim", "Sim, com falhas", "Não"]),
  qualidade_merenda: z.enum(["Sim", "Regular", "Ruim"]),
  atende_necessidades: z.enum(["Sim", "Parcialmente", "Não"]),
  possui_refeitorio: z.enum(["Sim", "Não"]),
  refeitorio_adequado: z.enum(["Sim", "Não"]).optional(),
  possui_balanca: z.enum(["Sim", "Não"]),

  qtd_freezers: z.coerce.number().min(0).default(0),
  estado_freezers: z.enum(["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]).optional(),
  
  qtd_geladeiras: z.coerce.number().min(0).default(0),
  estado_geladeiras: z.enum(["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]).optional(),
  
  qtd_fogoes: z.coerce.number().min(0).default(0),
  estado_fogoes: z.enum(["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]).optional(),
  
  qtd_fornos: z.coerce.number().min(0).default(0),
  estado_fornos: z.enum(["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]).optional(),
  
  qtd_bebedouros: z.coerce.number().min(0).default(0),
  estado_bebedouros: z.enum(["Bom – funcionando plenamente", "Regular – funciona, com limitações", "Ruim – funcionamento comprometido", "Inoperante"]).optional(),

  bancadas_inox: z.enum(["Sim", "Não"]),
  sistema_exaustao: z.enum(["Sim", "Não"]),
  despensa_exclusiva: z.enum(["Sim", "Não"]),
  deposito_conserva: z.enum(["Sim", "Parcialmente", "Não"]),
  estoque_epi_extintor: z.enum(["Completo", "Parcial", "Inexistente"]),
  manutencao_extintores: z.enum(["Está na validade", "Validade vencida"]).optional(),

  qtd_merendeiras_estatutaria: z.coerce.number().min(0).default(0),
  qtd_merendeiras_terceirizada: z.coerce.number().min(0).default(0),
  qtd_merendeiras_temporaria: z.coerce.number().min(0).default(0),
  qtd_atende_necessidade: z.enum(["Sim", "Não"]),
  
  empresa_terceirizada: z.enum([
    "AJ LOURENÇO", "DIAMOND", "E.B CARDOSO", "J.R LIMPEZA", 
    "KAPA CAPITAL", "LG SERVIÇOS", "LIMPAR", "SAP - SERVICE ALIANCA PARA", "Outra"
  ]).optional(),
  
  possui_supervisor: z.enum(["Sim", "Não"]),
  nome_supervisor: z.string().optional(),
});

export type MerendaFormValues = z.infer<typeof merendaSchema>;