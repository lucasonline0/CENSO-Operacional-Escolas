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
