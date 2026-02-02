import { z } from "zod";

export const tecnologiaSchema = z.object({
  internet_disponivel: z.enum(["Sim", "Não"]),
  provedor_internet: z.string().optional(),
  qualidade_internet: z.string().optional(),
  
  qtd_desktop_adm: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_desktop_alunos: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_notebooks: z.coerce.number().min(0, "Não pode ser negativo"),
  qtd_chromebooks: z.coerce.number().min(0, "Não pode ser negativo"),
  
  computadores_atendem: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  qtd_computadores_inoperantes: z.coerce.number().min(0, "Não pode ser negativo"),
  
  possui_projetor: z.enum(["Sim", "Não"]),
  qtd_projetores: z.coerce.number().min(0, "Não pode ser negativo").optional(),
  possui_lousa_digital: z.enum(["Sim", "Não"]),
});

export type TecnologiaFormValues = z.infer<typeof tecnologiaSchema>;