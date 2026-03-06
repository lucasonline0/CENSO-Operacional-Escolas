import { z } from "zod";

const avaliacaoOpcoes = ["Ruim", "Regular", "Bom", "Excelente"] as const;
const avaliacaoOpcoesComNaoAplica = ["Ruim", "Regular", "Bom", "Excelente", "Não se aplica"] as const;

export const avaliacaoSchema = z.object({
  avaliacao_merendeiras: z.enum(avaliacaoOpcoesComNaoAplica),
  avaliacao_portaria: z.enum(avaliacaoOpcoesComNaoAplica),
  avaliacao_limpeza: z.enum(avaliacaoOpcoesComNaoAplica),
  avaliacao_comunicacao: z.enum(avaliacaoOpcoes),
  avaliacao_supervisao: z.enum(avaliacaoOpcoes),
});

export type AvaliacaoFormValues = z.infer<typeof avaliacaoSchema>;