import { z } from "zod";

export const generalDataSchema = z.object({
  // Infraestrutura
  tipo_predio: z.enum(["Próprio", "Alugado", "Compartilhado", "Cedido"]),
  possui_anexos: z.enum(["Sim", "Não"]),
  qtd_anexos: z.coerce.number().optional(),
  tipo_predio_anexo: z.enum(["Próprio", "Alugado", "Compartilhado", "Cedido"]).optional(),

  // Ensino
  etapas_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma etapa"),
  modalidades_ofertadas: z.array(z.string()).min(1, "Selecione pelo menos uma modalidade"),
  
  // CORREÇÃO: Campo adicionado
  qtd_salas_aula: z.coerce.number().min(0, "Informe a quantidade de salas"),

  turmas_manha: z.coerce.number(),
  turmas_tarde: z.coerce.number(),
  turmas_noite: z.coerce.number(),
  total_alunos: z.coerce.number().min(1, "Informe o total de alunos"),
  alunos_pcd: z.coerce.number(),
  alunos_rural: z.coerce.number(),
  alunos_urbana: z.coerce.number(),

  // Segurança e Manutenção
  muro_cerca: z.string().min(1, "Informe sobre muro/cerca"),
  perimetro_fechado: z.string().optional(),
  situacao_estrutura: z.string().min(1, "Informe a situação da estrutura"),
  data_ultima_reforma: z.string().optional(),

  // Ambientes
  ambientes: z.array(z.string()),
  quadra_coberta: z.string().optional(),
  qtd_quadras: z.coerce.number().optional(),
  banda_fanfarra: z.string().optional(),

  // Sanitários e Climatização
  banheiros_alunos: z.coerce.number(),
  banheiros_prof: z.coerce.number(),
  banheiros_chuveiro: z.coerce.number(),
  banheiros_vasos_funcionais: z.string().min(1, "Informe sobre os vasos"),
  salas_climatizadas: z.coerce.number(),

  // Energia e Câmeras
  energia: z.string().min(1, "Informe o fornecimento de energia"),
  transformador: z.string().optional(),
  rede_eletrica_atende: z.string().min(1, "A rede elétrica atende?"),
  problemas_eletricos: z.array(z.string()).optional(),
  estrutura_climatizacao: z.string().min(1, "Informe sobre climatização"),
  suporta_novos_equipamentos: z.string().min(1, "Suporta novos equipamentos?"),
  cameras_funcionamento: z.string().min(1, "Informe sobre câmeras"),
  cameras_cobrem: z.string().optional(),
});

export type GeneralDataFormValues = z.infer<typeof generalDataSchema>;