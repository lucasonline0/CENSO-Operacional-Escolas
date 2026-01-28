import { z } from "zod";

export const tecnologiaSchema = z.object({
  internet_disponivel: z.enum(["Sim", "Não"]),
  provedor_internet: z.enum(["Prodepa", "Starlink", "Outro"]).optional(),
  qualidade_internet: z.enum([
    "A internet não funciona ou está indisponível com frequência",
    "A internet apresenta lentidão frequente e compromete as atividades",
    "A internet possui velocidade aceitável, com eventuais oscilações",
    "A internet é estável e atende plenamente às necessidades da escola",
    "Não sei avaliar",
    "Não se aplica"
  ]).optional(),

  qtd_desktop_adm: z.coerce.number().min(0).default(0),
  qtd_desktop_alunos: z.coerce.number().min(0).default(0),
  qtd_notebooks: z.coerce.number().min(0).default(0),
  qtd_chromebooks: z.coerce.number().min(0).default(0),
  
  computadores_atendem: z.enum(["Sim", "Parcialmente", "Não"]),
  qtd_computadores_inoperantes: z.coerce.number().min(0).default(0),

  possui_projetor: z.enum(["Sim", "Não"]),
  qtd_projetores: z.coerce.number().min(0).default(0),
  possui_lousa_digital: z.enum(["Sim", "Não"]),
});

export type TecnologiaFormValues = z.infer<typeof tecnologiaSchema>;