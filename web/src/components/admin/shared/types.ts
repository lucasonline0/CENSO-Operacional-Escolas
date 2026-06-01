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

export interface CensusFull extends CensusRow { data: unknown; created_at: string; }

export interface CensusPage {
  rows: CensusRow[];
  total: number;
  page: number;
  limit: number;
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
}

export interface InfraSeguranca {
  pct_possui_guarita: number;
  pct_controle_portao: number;
  pct_iluminacao_externa: number;
  pct_possui_botao_panico: number;
  pct_cameras_funcionais: number;
  pct_plano_evacuacao: number;
  pct_politica_bullying: number;
  dist_cameras: CategoricStat[];
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
  dist_condicoes_cozinha: CategoricStat[];
  pct_possui_refeitorio: number;
}

export interface MerendaEquipamentos {
  freezers: EquipTotais;
  geladeiras: EquipTotais;
  fogoes: EquipTotais;
  fornos: EquipTotais;
  bebedouros: EquipTotais;
  dist_estados: EstadoEquipStat[];
}

export interface MerendaRH {
  total_estatutaria: number;
  total_terceirizada: number;
  total_temporaria: number;
  pct_com_supervisor: number;
  top_empresas: EmpresaStat[];
}

// Frente 2 — Serviços Terceirizados.
// Payloads de /v1/admin/analytics/servicos-terceirizados/{visao-geral,servicos-gerais,portaria}.
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
}

export interface ServicosPortaria {
  pct_com_agentes: number;
  media_agentes_por_escola: number;
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
export interface TecnologiaInfra {
  escolas_com_internet: number;
  percentual_internet: number;
  por_provedor: CategoricStat[];
  por_qualidade: CategoricStat[];
  total_desktops_adm: number;
  total_desktops_alunos: number;
  total_notebooks: number;
  total_chromebooks: number;
  escolas_com_computadores_inoperantes: number;
  percentual_computadores_atendem: number;
}

export interface TecnologiaUso {
  escolas_com_projetor: number;
  percentual_com_projetor: number;
  total_projetores: number;
  escolas_com_lousa_digital: number;
  percentual_com_lousa_digital: number;
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
