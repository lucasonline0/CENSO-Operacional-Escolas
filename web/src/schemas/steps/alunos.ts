import { z } from "zod";

const floatSchema = z.string()
  .or(z.number())
  .transform((val, ctx) => {
    // Se já vier como número (valor default ou preenchido via number input), mantém
    if (typeof val === "number") return val;
    
    // Se for string, verifica se tem ponto
    if (val.includes(".")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Não utilize pontos. Use vírgula para decimais."
        });
        return z.NEVER;
    }

    // Tenta converter substituindo vírgula por ponto para o parse
    const formatted = val.replace(",", ".");
    const parsed = formatted === "" ? 0 : parseFloat(formatted);
    
    if (isNaN(parsed)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Valor inválido"
        });
        return z.NEVER;
    }

    return parsed;
  })
  .pipe(z.number().min(0, "Não pode ser negativo"));

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