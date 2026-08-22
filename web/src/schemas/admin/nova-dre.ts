import { z } from "zod";

// Validação do modal de cadastro de nova DRE (aba "Gestão de DREs e Acessos").
// Todos os campos são obrigatórios; telefone e sigla recebem máscara/normalização
// no input — aqui validamos o resultado final.

const apenasDigitos = (v: string) => v.replace(/\D/g, "");

export const novaDreSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, "O nome deve ter pelo menos 3 caracteres"),

  // Normalizada para uppercase no onChange do input.
  sigla: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,12}$/, "Sigla inválida. Use de 2 a 12 letras ou números"),

  municipio_sede: z
    .string()
    .min(1, "Selecione o município sede"),

  polo: z
    .string()
    .min(1, "Selecione o polo"),

  responsavel_nome: z
    .string()
    .trim()
    .min(3, "Informe o nome do responsável"),

  responsavel_email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "E-mail inválido"),

  // Máscara aplicada no input: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX.
  responsavel_telefone: z
    .string()
    .refine((v) => {
      const d = apenasDigitos(v);
      return d.length === 10 || d.length === 11;
    }, { message: "Telefone inválido. Use DDD + número, ex.: (91) 90000-0000" }),
});

export type NovaDreFormValues = z.infer<typeof novaDreSchema>;
