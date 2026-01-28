import { z } from "zod";

export const servicosGeraisSchema = z.object({
  qtd_servicos_gerais_efetivo: z.coerce.number().min(0).default(0),
  qtd_servicos_gerais_temporario: z.coerce.number().min(0).default(0),
  qtd_servicos_gerais_terceirizado: z.coerce.number().min(0).default(0),
  
  qtd_atende_necessidade: z.enum(["Sim", "Não"]),
  quantitativo_necessario: z.coerce.number().min(0).optional(),

  empresa_terceirizada: z.enum([
    "AJ LOURENÇO", "DIAMOND", "E.B CARDOSO", "J.R LIMPEZA", 
    "KAPA CAPITAL", "LG SERVIÇOS", "LIMPAR", "SAP - SERVICE ALIANCA PARA", "Outra"
  ]).optional(),

  possui_supervisor: z.enum(["Sim", "Não"]),
  nome_supervisor: z.string().optional(),
});

export type ServicosGeraisFormValues = z.infer<typeof servicosGeraisSchema>;