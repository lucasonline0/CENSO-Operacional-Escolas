import { z } from "zod";

export const observacoesSchema = z.object({
  prioridade_1: z.string().min(1, "Obrigatório"),
  prioridade_2: z.string().min(1, "Obrigatório"),
  prioridade_3: z.string().min(1, "Obrigatório"),
  
  demanda_urgente: z.enum(["Sim", "Não"]),
  descricao_urgencia: z.string().optional(),
  
  sugestao_melhoria: z.enum(["Sim", "Não"]),
  descricao_sugestao: z.string().optional(),
  
  nome_responsavel: z.string().min(3, "Nome do responsável pelo preenchimento é obrigatório"),
  cargo_funcao: z.string().min(3, "Cargo/Função é obrigatório"),
  matricula_funcional: z.string().optional(),
  
  declaracao_verdadeira: z.boolean().refine(val => val === true, {
    message: "Você deve declarar que as informações são verdadeiras."
  }),
});

export type ObservacoesFormValues = z.infer<typeof observacoesSchema>;