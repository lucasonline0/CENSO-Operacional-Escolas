import { z } from "zod";

const avaliacaoOpcoes = ["Ruim", "Regular", "Bom", "Excelente"] as const;

export const avaliacaoSchema = z.object({
  avaliacao_merendeiras: z.enum(avaliacaoOpcoes),
  avaliacao_portaria: z.enum(avaliacaoOpcoes),
  avaliacao_limpeza: z.enum(avaliacaoOpcoes),
  avaliacao_comunicacao: z.enum(avaliacaoOpcoes),
  avaliacao_supervisao: z.enum(avaliacaoOpcoes),
});

export type AvaliacaoFormValues = z.infer<typeof avaliacaoSchema>;