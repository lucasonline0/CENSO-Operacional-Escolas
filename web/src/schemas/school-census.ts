import { z } from "zod";

export const schoolIdentificationSchema = z.object({
  // Validações dos campos que eu já desenhei na tela
  dre: z.string().min(1, "Selecione a DRE"),
  municipio: z.string().min(1, "O município é obrigatório"),
  nome_escola: z.string().min(3, "O nome da escola deve ter pelo menos 3 letras"),
  codigo_inep: z.string().length(8, "O código INEP deve ter exatamente 8 dígitos"),
  
  // Garanto que só passa se for igual ao que coloquei no meu Select
  zona: z.enum(["Urbana", "Rural", "Ribeirinha"], {
    error: "Selecione a zona da escola",
  }),
  
  endereco: z.string().min(5, "Digite o endereço completo"),
  
  // Deixei esses opcionais por enquanto pra não travar meu submit,
  // já que ainda não fiz os inputs deles no front
  dependencia_administrativa: z.string().optional(), 
  telefone_institucional: z.string().optional(),
  cnpj: z.string().optional(),
});

export type SchoolIdentificationForm = z.infer<typeof schoolIdentificationSchema>;