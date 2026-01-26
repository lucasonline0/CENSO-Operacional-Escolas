import { z } from "zod";

// crio uns enums pra não repetir texto
const simNao = z.enum(["Sim", "Não"]);
const bomRegularRuim = z.enum(["Bom", "Regular", "Ruim", "Inoperante", "Excelente", "Precária"]).optional();
// valido a identificação (o que faltou no form anterior)
export const identificationSchema = z.object({
  nome_escola: z.string().min(1, "Obrigatório"),
  codigo_inep: z.string().min(8, "Mínimo 8 dígitos"),
  cnpj: z.string().optional(),
  endereco: z.string().min(1, "Obrigatório"),
  telefone: z.string().optional(),
  municipio: z.string().min(1, "Obrigatório"),
  cep: z.string().optional(),
  zona: z.enum(["Urbana", "Rural", "Ribeirinha"]),
  nome_diretor: z.string().optional(),
  matricula_diretor: z.string().optional(),
  contato_diretor: z.string().optional(),
  dre: z.string().min(1, "Obrigatório"),
  turnos: z.array(z.string()).optional(),
});

// defino as regras de infraestrutura básica
export const generalDataSchema = z.object({
  tipo_predio: z.enum(["Próprio", "Alugado", "Compartilhado", "Cedido"]).optional(),
  possui_anexos: simNao.optional(),
  qtd_anexos: z.coerce.number().optional(),
  tipo_predio_anexo: z.enum(["Próprio", "Alugado", "Compartilhado", "Cedido"]).optional(),
  
  etapas_ofertadas: z.array(z.string()).optional(),
  modalidades_ofertadas: z.array(z.string()).optional(),
  
  turmas_manha: z.coerce.number().optional(),
  turmas_tarde: z.coerce.number().optional(),
  turmas_noite: z.coerce.number().optional(),
  total_alunos: z.coerce.number().optional(),
  alunos_pcd: z.coerce.number().optional(),
  alunos_rural: z.coerce.number().optional(),
  alunos_urbana: z.coerce.number().optional(),

  muro_cerca: z.enum(["Sim, muro", "Sim, cerca", "Sim, ambos", "Não possui"]).optional(),
  perimetro_fechado: z.enum(["Sim, totalmente", "Parcialmente", "Não"]).optional(),
  
  situacao_estrutura: z.enum([
    "Necessita de reforma geral", 
    "Necessita de reforma parcial (melhoria pontual)",
    "Reforma em andamento",
    "Está em reforma, porém a obra está parada",
    "Foi reformada recentemente"
  ]).optional(),
  data_ultima_reforma: z.string().optional(),

  ambientes: z.array(z.string()).optional(),
  
  quadra_coberta: simNao.optional(),
  qtd_quadras: z.coerce.number().optional(),
  banda_fanfarra: simNao.optional(),
  
  banheiros_alunos: z.coerce.number().optional(),
  banheiros_prof: z.coerce.number().optional(),
  banheiros_chuveiro: z.coerce.number().optional(),
  banheiros_vasos_funcionais: z.enum(["Todos", "Alguns", "Nenhum"]).optional(),
  
  salas_climatizadas: z.coerce.number().optional(),
  energia: z.enum(["Concessionária - Equatorial", "Geração própria", "Outro"]).optional(),
  transformador: simNao.optional(),
  rede_eletrica_atende: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  problemas_eletricos: z.array(z.string()).optional(),
  estrutura_climatizacao: z.enum(["Sim", "Não, somente com adequações", "Não, todas as salas são climatizadas"]).optional(),
  suporta_novos_equipamentos: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  
  cameras_funcionamento: z.enum(["Sim, funcionando plenamente", "Sim, parcialmente", "Não possui"]).optional(),
  cameras_cobrem: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
});

// valido a parte da merenda e cozinha
export const foodSchema = z.object({
  cozinha_condicao: bomRegularRuim.optional(),
  cozinha_tamanho: z.enum(["Pequena", "Média", "Grande"]).optional(),
  merenda_regular: z.enum(["Sim", "Sim, com falhas", "Não"]).optional(),
  merenda_qualidade: z.enum(["Sim", "Regular", "Ruim"]).optional(),
  merenda_atende: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  
  possui_refeitorio: simNao.optional(),
  refeitorio_atende: simNao.optional(),
  possui_balanca: simNao.optional(),
  
  freezers_qtd: z.coerce.number().optional(),
  freezers_estado: bomRegularRuim.optional(),
  geladeiras_qtd: z.coerce.number().optional(),
  geladeiras_estado: bomRegularRuim.optional(),
  fogoes_qtd: z.coerce.number().optional(),
  fogoes_estado: bomRegularRuim.optional(),
  fornos_qtd: z.coerce.number().optional(),
  fornos_estado: bomRegularRuim.optional(),
  bebedouros_qtd: z.coerce.number().optional(),
  bebedouros_estado: bomRegularRuim.optional(),
  
  bancadas_inox: simNao.optional(),
  exaustao: simNao.optional(),
  despensa_exclusiva: simNao.optional(),
  deposito_conserva: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  
  epis_extintor: z.enum(["Completo", "Parcial", "Inexistente"]).optional(),
  extintores_validade: z.enum(["Está na validade", "Validade vencida"]).optional(),
  
  merendeiras_estatutaria: z.coerce.number().optional(),
  merendeiras_terceirizada: z.coerce.number().optional(),
  merendeiras_temporaria: z.coerce.number().optional(),
  merendeiras_atende: simNao.optional(),
  empresa_merendeiras: z.string().optional(),
  supervisor_merenda: simNao.optional(),
  nome_supervisor_merenda: z.string().optional(),
});

// valido serviços gerais e limpeza
export const cleaningSchema = z.object({
  sg_efetivo: z.coerce.number().optional(),
  sg_temporario: z.coerce.number().optional(),
  sg_terceirizado: z.coerce.number().optional(),
  sg_atende: simNao.optional(),
  sg_necessario: z.coerce.number().optional(),
  empresa_sg: z.string().optional(),
  supervisor_sg: simNao.optional(),
  nome_supervisor_sg: z.string().optional(),
});

// valido a segurança e portaria
export const securitySchema = z.object({
  possui_guarita: simNao.optional(),
  controle_portao: z.enum(["Manual", "Fechadura", "Eletrônica"]).optional(),
  iluminacao_externa: z.enum(["Adequada", "Regular", "Insuficiente"]).optional(),
  botao_panico: simNao.optional(),
  
  portaria_qtd: z.coerce.number().optional(),
  portaria_atende: simNao.optional(),
  portaria_necessario: z.coerce.number().optional(),
  empresa_portaria: z.string().optional(),
  supervisor_portaria: simNao.optional(),
  nome_supervisor_portaria: z.string().optional(),
});

// valido equipamentos de ti
export const techSchema = z.object({
  internet_disponivel: simNao.optional(),
  provedor: z.enum(["Prodepa", "Starlink", "Outro"]).optional(),
  internet_qualidade: z.string().optional(),
  
  pc_admin: z.coerce.number().optional(),
  pc_alunos: z.coerce.number().optional(),
  notebooks: z.coerce.number().optional(),
  chromebooks: z.coerce.number().optional(),
  pc_atende: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  pc_inoperantes: z.coerce.number().optional(),
  
  projetor: simNao.optional(),
  projetor_qtd: z.coerce.number().optional(),
  lousa_digital: simNao.optional(),
});

// valido o quadro de funcionários
export const staffSchema = z.object({
  possui_direcao: simNao.optional(),
  possui_vice_pedagogico: simNao.optional(),
  possui_vice_admin: simNao.optional(),
  possui_secretario: simNao.optional(),
  possui_coord_pedagogico: simNao.optional(),
  qtd_coord_pedagogico: z.coerce.number().optional(),
  
  coord_area_mat: simNao.optional(),
  coord_area_ling: simNao.optional(),
  coord_area_hum: simNao.optional(),
  coord_area_nat: simNao.optional(),
  
  professores_efetivos: z.coerce.number().optional(),
  professores_temporarios: z.coerce.number().optional(),
  servidores_admin: z.coerce.number().optional(),
  
  prof_readaptado: simNao.optional(),
  prof_readaptado_qtd: z.coerce.number().optional(),
});

// valido os indicadores dos alunos
export const studentsSchema = z.object({
  beneficiarios: z.coerce.number().optional(),
  taxa_abandono: z.coerce.number().optional(),
  reprovacao_fund1: z.coerce.number().optional(),
  reprovacao_fund2: z.coerce.number().optional(),
  reprovacao_medio: z.coerce.number().optional(),
  ideb_iniciais: z.coerce.number().optional(),
  ideb_finais: z.coerce.number().optional(),
  ideb_medio: z.coerce.number().optional(),
});

// valido gestão, grêmio e recursos
export const managementSchema = z.object({
  regularizada_cee: simNao.optional(),
  conselho_escolar: simNao.optional(),
  conselho_ativo: z.enum(["Sim", "Parcialmente", "Não"]).optional(),
  
  recursos_prodep: z.enum(["Sim", "Não", "Não sabe informar"]).optional(),
  prodep_valor: z.string().optional(),
  prodep_execucao: z.enum(["Sim, totalmente", "Parcialmente", "Não executados"]).optional(),
  prodep_pendencia: z.enum(["Não", "Sim, em regularização", "Sim, pendente/atrasada"]).optional(),
  
  recursos_federais: simNao.optional(),
  federal_valor: z.string().optional(),
  federal_execucao: z.enum(["Sim, totalmente", "Parcialmente", "Não executados"]).optional(),
  federal_pendencia: z.enum(["Não", "Sim, em regularização", "Sim, pendente/atrasada"]).optional(),
  
  gremio: simNao.optional(),
  reunioes_comunidade: z.enum(["Não ocorrem", "Eventuais (1–2 por ano)", "Regulares (semestrais)", "Frequentes (mensais ou mais)"]).optional(),
  plano_evacuacao: simNao.optional(),
  bullying: z.enum(["Sim, formalizada e aplicada", "Parcialmente (ações pontuais)", "Não possui"]).optional(),
});

// valido as notas que o diretor deu
export const ratingSchema = z.object({
  nota_merendeiras: z.enum(["Ruim", "Regular", "Bom", "Excelente"]).optional(),
  nota_portaria: z.enum(["Ruim", "Regular", "Bom", "Excelente"]).optional(),
  nota_limpeza: z.enum(["Ruim", "Regular", "Bom", "Excelente"]).optional(),
  nota_comunicacao: z.enum(["Ruim", "Regular", "Bom", "Excelente"]).optional(),
  nota_supervisao: z.enum(["Ruim", "Regular", "Bom", "Excelente"]).optional(),
});

// valido as observações finais
export const observationsSchema = z.object({
  prioridades: z.string().optional(),
  demanda_urgente: simNao.optional(),
  descricao_urgencia: z.string().optional(),
  sugestao_melhoria: simNao.optional(),
  descricao_sugestao: z.string().optional(),
  
  responsavel_nome: z.string().min(1, "Obrigatório"),
  responsavel_cargo: z.string().optional(),
  responsavel_matricula: z.string().optional(),
  declaracao_verdadeira: z.boolean().refine(val => val === true, "Você deve declarar que as informações são verdadeiras"),
});

// junto tudo num schema único
export const censusFormSchema = z.object({
  ...identificationSchema.shape,
  ...generalDataSchema.shape,
  ...foodSchema.shape,
  ...cleaningSchema.shape,
  ...securitySchema.shape,
  ...techSchema.shape,
  ...staffSchema.shape,
  ...studentsSchema.shape,
  ...managementSchema.shape,
  ...ratingSchema.shape,
  ...observationsSchema.shape,
});

export type CensusForm = z.infer<typeof censusFormSchema>;