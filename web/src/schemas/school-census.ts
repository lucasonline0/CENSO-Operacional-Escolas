import { z } from "zod";

export const schoolIdentificationSchema = z.object({
  dre: z
    .string()
    .min(1, "Selecione a DRE/Setor"),
    
  municipio: z
    .string()
    .min(1, "Selecione o município"),
    
  zona: z.enum(["Urbana", "Rural", "Ribeirinha"]),

  nome_escola: z
    .string()
    .min(3, "O nome deve ter pelo menos 3 caracteres"),

  // INEP: Apenas números, exatamente 8 dígitos
  codigo_inep: z
    .string()
    .regex(/^\d{8}$/, "O INEP deve conter exatamente 8 números"),

  // CNPJ: Opcional, mas se preenchido, deve seguir o formato XX.XXX.XXX/XXXX-XX
  cnpj: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(val), {
      message: "CNPJ inválido. Use o formato 00.000.000/0000-00",
    }),

  // Telefone: Opcional, mas se preenchido, deve seguir (XX) XXXXX-XXXX
  telefone_institucional: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || /^\(\d{2}\) \d{4,5}-\d{4}$/.test(val), {
      message: "Telefone inválido. Formato esperado: (91) 90000-0000",
    }),

  // CEP: Obrigatório, formato XXXXX-XXX
  cep: z
    .string()
    .regex(/^\d{5}-\d{3}$/, "O CEP deve estar no formato 00000-000"),

  endereco: z
    .string()
    .min(5, "Informe o endereço completo"),

  // Dados do Diretor (Opcionais)
  nome_diretor: z.string().optional(),
  matricula_diretor: z.string().optional(),
  contato_diretor: z.string().optional(),

  turnos: z
    .array(z.string())
    .min(1, "Selecione pelo menos um turno de funcionamento"),
});

export type SchoolIdentificationForm = z.infer<typeof schoolIdentificationSchema>;