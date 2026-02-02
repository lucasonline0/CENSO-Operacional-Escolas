import { z } from "zod";

export const portariaSchema = z.object({
  possui_guarita: z.enum(["Sim", "Não"]),
  controle_portao: z.string().min(1, "Selecione"),
  iluminacao_externa: z.string().min(1, "Selecione"),
  possui_botao_panico: z.enum(["Sim", "Não"]),
  
  qtd_agentes_portaria: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_atende_necessidade_portaria: z.enum(["Sim", "Não"]).optional(),
  quantitativo_necessario_portaria: z.coerce.number().min(0, "Não pode ser negativo").optional(),
  
  empresa_terceirizada_portaria: z.string().optional(),
  possui_supervisor_portaria: z.enum(["Sim", "Não"]).optional(),
  nome_supervisor_portaria: z.string().optional(),
  contato_supervisor_portaria: z.string().optional(),
});

export type PortariaFormValues = z.infer<typeof portariaSchema>;