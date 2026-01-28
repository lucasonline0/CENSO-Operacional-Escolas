import { z } from "zod";

export const gestaoSchema = z.object({
  regularizada_cee: z.enum(["Sim", "Não"]),
  
  conselho_escolar: z.enum(["Sim", "Não"]),
  conselho_ativo: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  
  recursos_prodep: z.enum(["Sim", "Não", "Não sabe informar"]),
  valor_prodep: z.coerce.number().min(0).optional(),
  execucao_prodep: z.enum(["Sim, totalmente", "Parcialmente", "Não executados"]).optional(),
  pendencias_prodep: z.enum(["Não", "Sim, em regularização", "Sim, pendente/atrasada"]).optional(),
  
  recursos_federais: z.enum(["Sim", "Não"]),
  valor_federais: z.coerce.number().min(0).optional(),
  execucao_federais: z.enum(["Sim, totalmente", "Parcialmente", "Não executados"]).optional(),
  pendencias_federais: z.enum(["Não", "Sim, em regularização", "Sim, pendente/atrasada"]).optional(),
  
  gremio_estudantil: z.enum(["Sim", "Não"]),
  
  reunioes_comunidade: z.enum([
    "Não ocorrem", 
    "Eventuais (1–2 por ano)", 
    "Regulares (semestrais)", 
    "Frequentes (mensais ou mais)"
  ]),
  
  plano_evacuacao: z.enum(["Sim", "Não"]),
  
  politica_bullying: z.enum([
    "Sim, formalizada e aplicada", 
    "Parcialmente (ações pontuais)", 
    "Não possui"
  ]),
});

export type GestaoFormValues = z.infer<typeof gestaoSchema>;