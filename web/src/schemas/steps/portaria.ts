import { z } from "zod";

export const portariaSchema = z.object({
  possui_guarita: z.enum(["Sim", "Não"]),
  controle_portao: z.enum(["Manual", "Fechadura", "Eletrônica"]),
  iluminacao_externa: z.enum(["Adequada", "Regular", "Insuficiente"]),
  possui_botao_panico: z.enum(["Sim", "Não"]),
  
  qtd_agentes_portaria: z.coerce.number().min(0).default(0),
  
  qtd_atende_necessidade: z.enum(["Sim", "Não"]),
  quantitativo_necessario: z.coerce.number().min(0).optional(),

  empresa_terceirizada: z.enum([
    "AJ LOURENÇO", "DIAMOND", "E.B CARDOSO", "J.R LIMPEZA", 
    "KAPA CAPITAL", "LG SERVIÇOS", "LIMPAR", "SAP - SERVICE ALIANCA PARA", "Outra"
  ]).optional(),

  possui_supervisor: z.enum(["Sim", "Não"]),
  nome_supervisor: z.string().optional(),
});

export type PortariaFormValues = z.infer<typeof portariaSchema>;