import { z } from "zod";

export const alunosSchema = z.object({
  total_beneficiarios: z.coerce.number().min(0, "Não pode ser negativo"),
  taxa_abandono: z.coerce.number().min(0, "Não pode ser negativo"),
  
  taxa_reprovacao_fund1: z.coerce.number().min(0, "Não pode ser negativo"),
  taxa_reprovacao_fund2: z.coerce.number().min(0, "Não pode ser negativo"),
  taxa_reprovacao_medio: z.coerce.number().min(0, "Não pode ser negativo"),
  
  ideb_anos_iniciais: z.coerce.number().min(0, "Não pode ser negativo").optional(),
  ideb_anos_finais: z.coerce.number().min(0, "Não pode ser negativo").optional(),
  ideb_ensino_medio: z.coerce.number().min(0, "Não pode ser negativo").optional(),
});

export type AlunosFormValues = z.infer<typeof alunosSchema>;