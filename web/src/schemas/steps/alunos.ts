import { z } from "zod";

const floatSchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      const formatted = val.replace(",", ".");
      return formatted === "" ? 0 : parseFloat(formatted);
    }
    return val;
  },
  z.coerce.number().min(0, "Não pode ser negativo")
);

export const alunosSchema = z.object({
  total_beneficiarios: z.coerce.number().min(0, "Não pode ser negativo"),
  
  taxa_abandono: floatSchema,
  taxa_reprovacao_fund1: floatSchema,
  taxa_reprovacao_fund2: floatSchema,
  taxa_reprovacao_medio: floatSchema,
  
  ideb_anos_iniciais: floatSchema.optional(),
  ideb_anos_finais: floatSchema.optional(),
  ideb_ensino_medio: floatSchema.optional(),
});

export type AlunosFormValues = z.infer<typeof alunosSchema>;