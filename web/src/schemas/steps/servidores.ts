import { z } from "zod";

export const servidoresSchema = z.object({
  possui_direcao: z.enum(["Sim", "Não"]),
  possui_vice_pedagogico: z.enum(["Sim", "Não"]),
  possui_vice_administrativo: z.enum(["Sim", "Não"]),
  possui_secretario: z.enum(["Sim", "Não"]),
  
  possui_coord_pedagogico: z.enum(["Sim", "Não"]),
  qtd_coord_pedagogico: z.coerce.number().min(0, "Não pode ser negativo").optional(),
  
  possui_coord_area_matematica: z.enum(["Sim", "Não"]),
  possui_coord_area_linguagem: z.enum(["Sim", "Não"]),
  possui_coord_area_humanas: z.enum(["Sim", "Não"]),
  possui_coord_area_natureza: z.enum(["Sim", "Não"]),
  
  qtd_professores_efetivos: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_professores_temporarios: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_servidores_administrativos: z.coerce.number().min(0, "Não pode ser negativo"),
  
  possui_professor_readaptado: z.enum(["Sim", "Não"]),
  qtd_professor_readaptado: z.coerce.number().min(0, "Não pode ser negativo").optional(),
});

export type ServidoresFormValues = z.infer<typeof servidoresSchema>;