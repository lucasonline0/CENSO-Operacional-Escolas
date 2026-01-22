import { z } from "zod";

export const schoolIdentificationSchema = z.object({
  dre: z.string().min(1, "Selecione a DRE"),
  municipio: z.string().min(1, "O município é obrigatório"),
  nome_escola: z.string().min(3, "O nome da escola deve ter pelo menos 3 letras"),
  codigo_inep: z.string().length(8, "O código INEP deve ter exatamente 8 dígitos"), // Exemplo de regra rígida

  cnpj: z.string().optional(),
  
  endereco: z.string().min(5, "Digite o endereço completo"),
  
  zona: z.enum(["Urbana", "Rural", "Ribeirinha"], {
    errorMap: () => ({ message: "Selecione a zona da escola" }),
  }),
  
  dependencia_administrativa: z.enum(["Estadual", "Municipal"], {
    errorMap: () => ({ message: "Selecione a dependência" }),
  }),
  
  telefone_institucional: z.string().min(10, "Telefone inválido"),
});

// Tipagem automática para o TypeScript usar nos formulários
export type SchoolIdentificationForm = z.infer<typeof schoolIdentificationSchema>;