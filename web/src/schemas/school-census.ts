import { z } from "zod";

export const schoolIdentificationSchema = z.object({
  nome_escola: z.string().min(3, "Nome da escola é obrigatório"),
  codigo_inep: z.string().length(8, "Código INEP deve ter 8 dígitos"),
  // Conforme texto: "CNPJ (se houver)"
  cnpj: z.string().optional(),
  endereco: z.string().min(5, "Endereço completo é obrigatório"),
  telefone_institucional: z.string().optional(),
  municipio: z.string().min(1, "Selecione um município"),
  cep: z.string().min(8, "CEP obrigatório"),
  
  // Corrigido erro de Overload removendo objeto de erro customizado
  zona: z.enum(["Urbana", "Rural", "Ribeirinha"]),
  
  // Dados do Diretor
  nome_diretor: z.string().optional(),
  matricula_diretor: z.string().optional(),
  contato_diretor: z.string().optional(),
  
  dre: z.string().min(1, "Selecione a DRE/Setor"),
  
  // Turnos: Manhã, Tarde, Noite, Integral
  turnos: z.array(z.string()).refine((value) => value.length > 0, {
    message: "Selecione pelo menos um turno de funcionamento",
  }),
});

export type SchoolIdentificationForm = z.infer<typeof schoolIdentificationSchema>;