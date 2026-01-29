import { z } from "zod";

export const portariaSchema = z.object({
  // Infraestrutura
  possui_guarita: z.string().min(1, "Possui guarita?"),
  possui_botao_panico: z.string().optional(),
  controle_portao: z.string().optional(),
  iluminacao_externa: z.string().optional(),

  // RH (Renomeado)
  qtd_agentes_portaria: z.coerce.number(),
  
  qtd_atende_necessidade_portaria: z.string().min(1, "A quantidade atende?"),
  quantitativo_necessario_portaria: z.coerce.number().optional(),
  empresa_terceirizada_portaria: z.string().optional(),
  possui_supervisor_portaria: z.string().optional(),
  nome_supervisor_portaria: z.string().optional(),
  contato_supervisor_portaria: z.string().optional(),
});

export type PortariaFormValues = z.infer<typeof portariaSchema>;