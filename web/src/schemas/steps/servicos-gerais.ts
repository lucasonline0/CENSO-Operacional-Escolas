import { z } from "zod";

export const servicosGeraisSchema = z.object({
  qtd_servicos_gerais_efetivo: z.coerce.number(),
  qtd_servicos_gerais_temporario: z.coerce.number(),
  qtd_servicos_gerais_terceirizado: z.coerce.number(),
  
  qtd_atende_necessidade_sg: z.string().min(1, "A quantidade atende?"),
  quantitativo_necessario_sg: z.coerce.number().optional(),
  empresa_terceirizada_sg: z.string().optional(),
  possui_supervisor_sg: z.string().optional(),
  nome_supervisor_sg: z.string().optional(),
  contato_supervisor_sg: z.string().optional(),
});

export type ServicosGeraisFormValues = z.infer<typeof servicosGeraisSchema>;