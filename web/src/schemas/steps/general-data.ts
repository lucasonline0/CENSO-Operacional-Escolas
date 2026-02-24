import { z } from "zod";

const numberSchema = z.coerce
  .number()
  .transform((val) => (Number.isNaN(val) ? 0 : val))
  .pipe(z.number().min(0, "O valor não pode ser negativo"));

export const generalDataSchema = z.object({
  tipo_predio: z.string().min(1, "Selecione o tipo de prédio"),
  possui_anexos: z.enum(["Sim", "Não"]),
  qtd_anexos: numberSchema.optional(),
  tipo_predio_anexo: z.string().optional(),
  
  etapas_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma etapa"),
  modalidades_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma modalidade"),
  
  qtd_salas_aula: numberSchema.pipe(z.number().min(1, "Obrigatório ter pelo menos 1 sala")),
  turmas_manha: numberSchema.optional(),
  turmas_tarde: numberSchema.optional(),
  turmas_noite: numberSchema.optional(),
  
  total_alunos: numberSchema.pipe(z.number().min(1, "Obrigatório ter pelo menos 1 aluno")),
  alunos_pcd: numberSchema,
  alunos_rural: numberSchema,
  alunos_urbana: numberSchema,
  
  muro_cerca: z.string().min(1, "Campo obrigatório"),
  perimetro_fechado: z.enum(["Sim, totalmente", "Parcialmente", "Não"]).optional(),
  situacao_estrutura: z.string().min(1, "Campo obrigatório"),
  data_ultima_reforma: z.string().optional(),
  
  ambientes: z.array(z.string()).optional(),
  quadra_coberta: z.enum(["Sim", "Não"]).optional(),
  qtd_quadras: numberSchema.optional(),
  banda_fanfarra: z.enum(["Sim", "Não"]),
  
  banheiros_alunos: numberSchema,
  banheiros_prof: numberSchema,
  banheiros_chuveiro: numberSchema,
  banheiros_vasos_funcionais: z.string().min(1, "Campo obrigatório"),
  
  salas_climatizadas: numberSchema,
  energia: z.string().min(1, "Campo obrigatório"),
  rede_eletrica_atende: z.enum(["Sim", "Parcialmente", "Não"]),
  problemas_eletricos: z.array(z.string()).min(1, "Selecione pelo menos uma opção"),
  estrutura_climatizacao: z.enum(["Sim", "Não", "Não, somente com adequações", "Não, todas as salas são climatizadas"]),
  suporta_novos_equipamentos: z.enum(["Sim", "Parcialmente", "Não"]),
  
  cameras_funcionamento: z.string().min(1, "Selecione uma opção"),
  cameras_cobrem: z.string().optional(),
}).superRefine((data, ctx) => {
  const total = data.total_alunos || 0;
  const rural = data.alunos_rural || 0;
  const urbana = data.alunos_urbana || 0;
  
  if (total !== (rural + urbana)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "O total de alunos deve ser igual à soma de alunos da zona rural e urbana",
      path: ["total_alunos"],
    });
  }

  // Torna "perímetro fechado" obrigatório se houver muro/cerca
  if (data.muro_cerca !== "Não possui" && !data.perimetro_fechado) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Campo obrigatório",
      path: ["perimetro_fechado"],
    });
  }

  // Torna "câmeras cobrem" obrigatório se houver câmeras
  if (data.cameras_funcionamento !== "Não possui" && !data.cameras_cobrem) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Campo obrigatório",
      path: ["cameras_cobrem"],
    });
  }
});

export type GeneralDataFormValues = z.infer<typeof generalDataSchema>;