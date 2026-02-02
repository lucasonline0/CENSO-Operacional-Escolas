import { z } from "zod";

export const servicosGeraisSchema = z.object({
  qtd_servicos_gerais_efetivo: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_servicos_gerais_temporario: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_servicos_gerais_terceirizado: z.coerce.number().min(0, "Não pode ser negativo"),
  
  qtd_atende_necessidade_sg: z.enum(["Sim", "Não"]).optional(),
  quantitativo_necessario_sg: z.coerce.number().min(0, "Não pode ser negativo").optional(),
  
  empresa_terceirizada_sg: z.string().optional(),
  possui_supervisor_sg: z.enum(["Sim", "Não"]).optional(),
  nome_supervisor_sg: z.string().optional(),
  contato_supervisor_sg: z.string().optional(),
});

export type ServicosGeraisFormValues = z.infer<typeof servicosGeraisSchema>;