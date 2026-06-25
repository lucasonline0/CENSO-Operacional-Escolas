// Tipos compartilhados pela página /admin e seus componentes.
// Extraídos de web/src/app/admin/page.tsx no PR de refactor estrutural —
// nenhum tipo foi alterado.

export interface DreDbStats { dre: string; total: number; completed: number; draft: number; }

export interface CensusRow {
  census_id: number; school_id: number; nome_escola: string; codigo_inep: string;
  municipio: string; dre: string; year: number; status: string;
  updated_at: string; synced: boolean;
}

export interface DashboardData {
  total_schools: number; completed_censuses: number; draft_censuses: number;
  pending_sync: number; by_dre: DreDbStats[]; recent: CensusRow[];
}

export interface ZonaStat  { zona: string;  count: number; }
export interface PorteStat { porte: string; count: number; alunos: number; }
export interface DreSheetsStats { dre: string; escolas: number; alunos: number; salas: number; }

export interface SheetMetrics {
  total_escolas: number; total_alunos: number; total_alunos_pcd: number;
  media_alunos_por_escola: number;
  por_zona: ZonaStat[]; por_porte: PorteStat[]; por_dre: DreSheetsStats[];
}

export interface BenefStat     { faixa: string; count: number; }
export interface AbandonoStat  { faixa: string; count: number; }
export interface DreAbandono   { dre: string; media: number; count: number; }

export interface IndicadoresMetrics {
  escolas_risco_fluxo: number;
  por_faixa_benef:     BenefStat[];
  por_faixa_abandono:  AbandonoStat[];
  top_dre_abandono:    DreAbandono[];
}

// Fase 2B.1: payloads analíticos PostgreSQL da aba "Caracterização da Rede".
// /v1/admin/analytics/caracterizacao/perfil e /caracterizacao/dre substituem,
// respectivamente, a parte de KPIs/donuts/matrículas e a parte de DRE da aba.
// O endpoint legado /v1/admin/sheet-metrics segue como fallback.
export interface CaracterizacaoKpis {
  total_escolas:            number;
  total_alunos:             number;
  media_alunos_por_escola:  number;
  alunos_pcd:               number;
}
export interface CaracterizacaoPortePg { porte: string; escolas: number; percentual: number; }
export interface CaracterizacaoZonaPg  { zona: string;  escolas: number; percentual: number; }
export interface CaracterizacaoMatPortePg { porte: string; total_alunos: number; }
export interface CaracterizacaoPerfilPg {
  kpis:                  CaracterizacaoKpis;
  por_porte:             CaracterizacaoPortePg[];
  por_zona:              CaracterizacaoZonaPg[];
  matriculas_por_porte:  CaracterizacaoMatPortePg[];
}
export interface DreCountPg   { dre: string; escolas: number; }
export interface DreSummaryPg {
  dre:                     string;
  escolas:                 number;
  total_alunos:            number;
  media_alunos_por_escola: number;
  salas_aula:              number;
}
export interface CaracterizacaoDREPg {
  top_dres:     DreCountPg[];
  detalhamento: DreSummaryPg[];
}

// CAR-INFRA-01 — Caracterização da Rede: Infraestrutura Educacional.
// Payload de /v1/admin/analytics/caracterizacao/infraestrutura-educacional.
export interface CaracterizacaoAmbienteStat {
  label: string;
  escolas: number;
  percentual: number;
}

export interface CaracterizacaoCoberturaEssenciais {
  total_essenciais: number;
  media_ambientes_essenciais: number;
  pct_cobertura_plena: number;
  por_faixa: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}

export interface CaracterizacaoMediaEssenciaisPorPorte {
  porte: string;
  media: number;
}

export interface CaracterizacaoInfraEducacionalPg {
  ambientes: CaracterizacaoAmbienteStat[];
  cobertura_essenciais: CaracterizacaoCoberturaEssenciais;
  media_essenciais_por_porte: CaracterizacaoMediaEssenciaisPorPorte[];
  ambientes_essenciais: string[];
}

export interface CensusFull extends CensusRow { data: unknown; created_at: string; }

// Resumo do recorte global da tela "Registros do Censo". Respeita os filtros
// globais (year, dre, municipio, zona, regiao_integracao), mas não os filtros
// locais da listagem (status, search, page, limit).
export interface CensusSummary {
  total_schools: number;
  completed_censuses: number;
  draft_censuses: number;
  pending_sync: number;
}

export interface CensusPage {
  rows: CensusRow[];
  total: number;
  page: number;
  limit: number;
  summary: CensusSummary;
}

// Frente 2 — Infraestrutura e Segurança.
// Payloads de /v1/admin/analytics/infraestrutura/{condicoes,seguranca}.
export interface CategoricStat {
  valor: string;
  escolas: number;
  percentual: number;
}

export interface AmbienteStat {
  ambiente: string;
  escolas: number;
}

export interface InfraCondicoes {
  por_tipo_predio: CategoricStat[];
  por_situacao_estrutura: CategoricStat[];
  pct_com_muro_ou_cerca: number;
  pct_perimetro_fechado: number;
  top_ambientes: AmbienteStat[];
  dist_muro_cerca: CategoricStat[];
  dist_perimetro_fechado: CategoricStat[];
  pct_reforma_critica: number;
  pct_reforma_geral: number;
  pct_obra_parada: number;
  pct_cobertura_plena: number;
}

export interface InfraSeguranca {
  pct_possui_guarita: number;
  pct_controle_portao: number;
  pct_possui_botao_panico: number;
  pct_cameras_funcionais: number;
  pct_plano_evacuacao: number;
  pct_politica_bullying: number;
  dist_cameras: CategoricStat[];
  dist_iluminacao_externa: CategoricStat[];
  dist_controle_portao: CategoricStat[];
}

export interface ClimatizacaoSalaRow {
  faixa:            string;
  total_salas:      number;
  climatizadas:     number;
  nao_climatizadas: number;
}

export interface InfraEnergia {
  dist_rede_eletrica_atende:    CategoricStat[];
  dist_estrutura_climatizacao:  CategoricStat[];
  dist_climatizacao_salas:      CategoricStat[];
  tabela_climatizacao:          ClimatizacaoSalaRow[];
}

// Frente 2 — Merenda Escolar.
// Payloads de /v1/admin/analytics/merenda/{oferta,equipamentos,recursos-humanos}.
export interface EquipTotais {
  total: number;
  media_por_escola: number;
}

export interface EstadoEquipStat {
  equipamento: string;
  estado: string;
  escolas: number;
}

export interface EmpresaStat {
  empresa: string;
  escolas: number;
}

export interface MerendaOferta {
  dist_oferta_regular: CategoricStat[];
  dist_qualidade: CategoricStat[];
  pct_atende_necessidades: number;
  dist_atende_necessidades: CategoricStat[];
  dist_condicoes_cozinha: CategoricStat[];
  pct_possui_refeitorio: number;
  dist_possui_refeitorio: CategoricStat[];
  dist_tamanho_cozinha: CategoricStat[];
  dist_refeitorio_adequado: CategoricStat[];
}

export interface PresencaEquipamentoStat {
  equipamento: string;
  escolas: number;
  percentual: number;
}

export interface FaixaQtdTiposEquipamentosStat {
  label: string;
  escolas: number;
  percentual: number;
}

export interface EstadoConsolidadoEquipamentoStat {
  equipamento: string;
  estado: string;
  escolas: number;
  percentual: number;
}

export interface MediaEquipamentoMerendaStat {
  equipamento: string;
  media: number;
}

export interface CriticidadeEquipamentoStat {
  equipamento: string;
  escolas_criticas: number;
  percentual: number;
}

export interface MerendaEquipamentos {
  freezers: EquipTotais;
  geladeiras: EquipTotais;
  fogoes: EquipTotais;
  fornos: EquipTotais;
  bebedouros: EquipTotais;
  dist_estados: EstadoEquipStat[];
  presenca_por_tipo: PresencaEquipamentoStat[];
  faixas_qtd_tipos: FaixaQtdTiposEquipamentosStat[];
  estado_consolidado: EstadoConsolidadoEquipamentoStat[];
  media_por_tipo: MediaEquipamentoMerendaStat[];
  criticidade_por_equipamento: CriticidadeEquipamentoStat[];
}

export interface MerendaRH {
  total_estatutaria: number;
  total_terceirizada: number;
  total_temporaria: number;
  pct_com_supervisor: number;
  top_empresas: EmpresaStat[];
}

// MER-01C — Merenda Escolar: Condições Sanitárias e Segurança.
// Payload de /v1/admin/analytics/merenda/condicoes-sanitarias.
// As distribuições categóricas usam denominador = escolas com valor informado.
// presenca_itens_basicos usa denominador = total de escolas concluídas no recorte.
export interface MerendaItemBasicoStat {
  item: string;
  escolas: number;
  percentual: number;
}

export interface MerendaCondicoesSanitarias {
  dist_despensa_exclusiva: CategoricStat[];
  dist_deposito_conserva: CategoricStat[];
  presenca_itens_basicos: MerendaItemBasicoStat[];
  dist_estoque_epi_extintor: CategoricStat[];
  dist_manutencao_extintores: CategoricStat[];
}

// Frente 2 — Serviços Terceirizados.
// Payloads de /v1/admin/analytics/servicos-terceirizados/{visao-geral,servicos-gerais,portaria,manipuladores-alimentos}.
export interface TerceirizacaoArea {
  area: string;
  escolas: number;
  percentual: number;
}

export interface ServicosVisaoGeral {
  por_area: TerceirizacaoArea[];
  por_quantidade_areas: CategoricStat[];
}

export interface ServicosGerais {
  total_efetivo: number;
  total_temporario: number;
  total_terceirizado: number;
  media_total_por_escola: number;
  top_empresas: EmpresaStat[];
}

export interface ServicosPortaria {
  pct_com_agentes: number;
  media_agentes_por_escola: number;
  top_empresas: EmpresaStat[];
}

export interface ServicosManipuladoresAlimentos {
  total_estatutaria: number;
  total_terceirizada: number;
  total_temporaria: number;
  total_geral: number;
  media_por_escola: number;
  pct_com_supervisor: number;
  dist_vinculo: CategoricStat[];
  dist_atende_necessidade: CategoricStat[];
  top_empresas: EmpresaStat[];
}

// Frente 1 — Pessoal e Gestão Escolar.
// Payloads de /v1/admin/analytics/pessoal-gestao/{estrutura,coordenacao,quadro-pessoal}.
export interface PessoalEstrutura {
  composicao_gestao: CategoricStat[];
  total_coordenadores_pedagogicos: number;
}

export interface PessoalCoordenacao {
  por_area: CategoricStat[];
  cobertura_media: number;
}

export interface QuadroPessoalMedias {
  efetivos: number;
  temporarios: number;
  administrativos: number;
  readaptados: number;
}

export interface QuadroPessoalDRE {
  dre: string;
  total_efetivos: number;
  total_temporarios: number;
  media_total_professores: number;
}

export interface QuadroPessoal {
  total_professores_efetivos: number;
  total_professores_temporarios: number;
  total_servidores_administrativos: number;
  total_professores_readaptados: number;
  media_por_escola: QuadroPessoalMedias;
  por_dre: QuadroPessoalDRE[];
}

// Frente 1 — Tecnologia e Equipamentos.
// Payloads de /v1/admin/analytics/tecnologia/{infraestrutura,uso-pedagogico}.
export interface MediaEquipamentoStat {
  valor: string;
  media: number;
}

export interface TecnologiaInfra {
  escolas_com_internet: number;
  percentual_internet: number;
  disponibilidade_internet: CategoricStat[];
  por_provedor: CategoricStat[];
  por_qualidade: CategoricStat[];
  total_desktops_adm: number;
  total_desktops_alunos: number;
  total_notebooks: number;
  total_chromebooks: number;
  media_equipamentos_por_escola: MediaEquipamentoStat[];
  escolas_com_computadores_inoperantes: number;
  total_computadores_inoperantes: number;
  percentual_computadores_atendem: number;
  computadores_atendem_demanda: CategoricStat[];
}

export interface TecnologiaUso {
  escolas_com_projetor: number;
  percentual_com_projetor: number;
  possui_projetor_dist: CategoricStat[];
  total_projetores: number;
  media_projetores_por_escola: number;
  escolas_com_lousa_digital: number;
  percentual_com_lousa_digital: number;
  possui_lousa_digital_dist: CategoricStat[];
}

// Caracterização da Rede — Organização da Oferta e Funcionamento.
// Payload de /v1/admin/analytics/caracterizacao/oferta-funcionamento.
export interface LabelEscolasStat { label: string; escolas: number; percentual: number; }
export interface MediaTurnosPorPorteStat { porte: string; media_turnos: number; }
export interface CaracterizacaoOfertaFuncionamento {
  etapas_ofertadas:       LabelEscolasStat[];
  modalidades_ofertadas:  LabelEscolasStat[];
  turnos:                 LabelEscolasStat[];
  media_turnos_por_porte: MediaTurnosPorPorteStat[];
}

// Índice de Saúde Operacional por escola.
// Payload de /v1/admin/analytics/escolas/saude-operacional.
export type SaudeOperacionalStatus =
  | "saudavel"
  | "atencao"
  | "critica"
  | "sem_dados";

export interface SaudeOperacionalPesos {
  infraestrutura: number;
  energia: number;
  merenda: number;
  seguranca: number;
  pessoal: number;
  tecnologia: number;
  pedagogico: number;
  governanca: number;
}

export interface SaudeOperacionalMetodologia {
  nome: string;
  versao: string;
  dimensoes_habilitadas: string[];
  pesos: SaudeOperacionalPesos;
}

export interface SaudeOperacionalDimensoes {
  infraestrutura: number | null;
  energia: number | null;
  merenda: number | null;
  seguranca: number | null;
  pessoal: number | null;
  tecnologia: number | null;
  pedagogico: number | null;
  governanca: number | null;
}

export interface SaudeOperacionalEscola {
  school_id: number;
  census_id: number | null;
  codigo_inep: string | null;
  escola: string;
  municipio: string;
  dre: string;
  zona: string | null;
  total_alunos: number | null;
  salas_aula: number | null;
  alunos_por_sala: number | null;
  saude: number | null;
  criticidade: number | null;
  status: SaudeOperacionalStatus;
  dimensoes: SaudeOperacionalDimensoes;
}

export interface SaudeOperacionalResumo {
  saudaveis: number;
  atencao: number;
  criticas: number;
  sem_dados: number;
  saude_media: number | null;
}

export interface SaudeOperacionalPayload {
  total_escolas: number;
  total_filtrado: number;
  page: number;
  page_size: number;
  total_pages: number;
  ano_referencia: number;
  metodologia: SaudeOperacionalMetodologia;
  resumo: SaudeOperacionalResumo;
  escolas: SaudeOperacionalEscola[];
}

// Andamento do preenchimento do censo por DRE.
// Payload de /v1/admin/analytics/preenchimento/dre. Respeita os filtros globais
// (year, dre, municipio, zona, regiao_integracao). pending = total sem censo no
// ano (total - completed - draft).
export interface PreenchimentoDreRow {
  dre: string;
  total: number;
  completed: number;
  draft: number;
  pending: number;
  completion_percentage: number;
}

export interface PreenchimentoDrePayload {
  ano_referencia: number;
  total_escolas: number;
  total_completed: number;
  total_draft: number;
  total_pending: number;
  dres: PreenchimentoDreRow[];
}

// Estado global de filtros do dashboard.
// Passado para cada aba e repassado como query params para os endpoints analíticos.
export interface DashboardFilters {
  ano?: number;
  regiao_integracao?: string;
  dre?: string;
  municipio?: string;
  zona?: string;
}

// Filtros globais do dashboard.
// Payload de GET /v1/admin/analytics/filtros/opcoes.
export interface FiltrosEscolaItem {
  school_id: number;
  codigo_inep: string | null;
  nome_escola: string;
  municipio: string;
  dre: string;
  zona: string | null;
}

export interface FiltrosOpcoes {
  anos: number[];
  regioes_integracao: string[];
  dres: string[];
  municipios: string[];
  zonas: string[];
  escolas: FiltrosEscolaItem[];
}

// ── Perfil dos Alunos e Resultados — IDEB 2023 (IDEB-05) ────────────────────
// Payload de GET /v1/admin/analytics/perfil-alunos-resultados/ideb.
// Espelha exatamente o contrato definido em
// api/cmd/api/analytics_perfil_alunos_ideb.go. IDEB ausente é `null`
// (Sem IDEB divulgado), NUNCA zero.
export interface IdebResumo {
  ano_referencia: number;
  total_registros: number;
  total_escolas_inep: number;
  registros_com_ideb: number;
  registros_sem_ideb: number;
  escolas_com_algum_ideb: number;
  escolas_sem_ideb_em_qualquer_etapa: number;
  cobertura_ideb_percentual: number;
  registros_sem_match_schools: number;
  ideb_medio_simples: number | null;
  ideb_medio_ponderado: number | null;
}

export interface IdebPorEtapa {
  etapa: string;
  registros: number;
  escolas: number;
  registros_com_ideb: number;
  registros_sem_ideb: number;
  cobertura_ideb_percentual: number;
  ideb_medio_simples: number | null;
  ideb_medio_ponderado: number | null;
  ideb_mediana: number | null;
  ideb_min: number | null;
  ideb_max: number | null;
  total_avaliado: number | null;
  percentual_avaliado_medio: number | null;
  proficiencia_portugues_media: number | null;
  proficiencia_matematica_media: number | null;
  fluxo_medio: number | null;
}

export interface IdebFaixaItem {
  etapa: string;
  faixa: string;
  registros: number;
  percentual: number;
}

export interface IdebPorDre {
  dre: string;
  etapa: string;
  registros: number;
  escolas: number;
  registros_com_ideb: number;
  registros_sem_ideb: number;
  ideb_medio_simples: number | null;
  ideb_medio_ponderado: number | null;
}

export interface IdebRankingItem {
  codigo_inep: string;
  nome_escola_origem: string;
  etapa: string;
  ideb: number | null;
  total_avaliado: number | null;
  percentual_avaliado: number | null;
  dre: string | null;
  municipio: string | null;
  status_ideb: string;
  status_vinculo: string;
}

export interface IdebRankings {
  maioresIdebs: IdebRankingItem[];
  menoresIdebs: IdebRankingItem[];
  semIdebDivulgado: IdebRankingItem[];
  baixaParticipacao: IdebRankingItem[];
}

export interface IdebQualidade {
  duplicidades_chave: number;
  registros_nd_proficiencia: number;
  percentuais_acima_100: number;
  percentuais_abaixo_80: number;
  registros_sem_match_schools: number;
}

export interface IdebMetadados {
  fonte_arquivo: string;
  fonte_metodologica: string;
  grao: string;
  import_batch_id: string | null;
  observacoes: string[];
}

export interface IdebAnalytics {
  resumo: IdebResumo;
  porEtapa: IdebPorEtapa[];
  distribuicaoFaixas: IdebFaixaItem[];
  porDre: IdebPorDre[];
  rankingEscolas: IdebRankings;
  qualidade: IdebQualidade;
  metadados: IdebMetadados;
}

// ── Tabelas escola-a-escola — payloads dos 6 novos endpoints /escolas ────────

export interface EscolasBaseRow {
  codigo_inep: string;
  nome_escola: string;
  dre: string;
  municipio: string;
  zona: string;
  regiao_integracao: string;
  has_censo: boolean;
}

export interface EscolasPayload<T extends EscolasBaseRow> {
  total_escolas: number;
  total_filtrado: number;
  page: number;
  page_size: number;
  total_pages: number;
  ano_referencia: number;
  escolas: T[];
}

export interface InfraEscolaRow extends EscolasBaseRow {
  tipo_predio: string;
  situacao_estrutura: string;
  energia: string;
  rede_eletrica_atende: string;
  possui_guarita: string;
  cameras_funcionamento: string;
  possui_botao_panico: string;
  muro_cerca: string;
  plano_evacuacao: string;
  status_operacional: string;
}

export interface MerendaEscolaRow extends EscolasBaseRow {
  oferta_regular: string;
  qualidade_merenda: string;
  possui_refeitorio: string;
  condicoes_cozinha: string;
  qtd_freezers: string;
  qtd_geladeiras: string;
  qtd_fogoes: string;
  qtd_fornos: string;
  empresa_terceirizada_merenda: string;
}

export interface ServicosEscolaRow extends EscolasBaseRow {
  empresa_terceirizada_portaria: string;
  qtd_agentes_portaria: string;
  empresa_terceirizada_sg: string;
  empresa_terceirizada_merenda: string;
  avaliacao_portaria: string;
  avaliacao_limpeza: string;
}

export interface PessoalEscolaRow extends EscolasBaseRow {
  nome_diretor: string;
  possui_direcao: string;
  possui_coord_pedagogico: string;
  qtd_professores_efetivos: string;
  qtd_professores_temporarios: string;
  qtd_servidores_administrativos: string;
}

export interface TecnologiaEscolaRow extends EscolasBaseRow {
  internet_disponivel: string;
  provedor_internet: string;
  qualidade_internet: string;
  qtd_desktop_alunos: string;
  qtd_notebooks: string;
  qtd_chromebooks: string;
  possui_projetor: string;
  possui_lousa_digital: string;
}

export interface CaracterizacaoEscolaRow extends EscolasBaseRow {
  total_alunos: string;
  porte: string;
  turnos_texto: string;
  etapas_texto: string;
  modalidades_texto: string;
}
