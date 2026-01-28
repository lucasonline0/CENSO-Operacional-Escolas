import { z } from "zod";

export const alunosSchema = z.object({
  total_beneficiarios: z.coerce.number().min(0).default(0),
  
  taxa_abandono: z.coerce.number().min(0).max(100).default(0),
  taxa_reprovacao_fund1: z.coerce.number().min(0).max(100).default(0),
  taxa_reprovacao_fund2: z.coerce.number().min(0).max(100).default(0),
  taxa_reprovacao_medio: z.coerce.number().min(0).max(100).default(0),

  ideb_anos_iniciais: z.coerce.number().min(0).max(10).default(0),
  ideb_anos_finais: z.coerce.number().min(0).max(10).default(0),
  ideb_ensino_medio: z.coerce.number().min(0).max(10).default(0),
});

export type AlunosFormValues = z.infer<typeof alunosSchema>;