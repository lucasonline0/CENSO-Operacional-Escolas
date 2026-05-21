package main

import (
	"fmt"
	"net/http"
)

// =====================================================================
// Fase 2A — Backend analítico da Caracterização da Rede
// =====================================================================
// Endpoints abaixo consomem vw_censo_enriquecida (migration 0002),
// derivada de vw_censo_base. Critérios provisórios herdados da Fase 1:
//
//   - status = 'completed';
//   - ano corrente (EXTRACT(YEAR FROM CURRENT_DATE));
//   - sem deduplicação automática por INEP;
//   - COUNT(DISTINCT school_id) quando o indicador é "quantidade de
//     escolas" — uma escola com censos em múltiplos anos não é contada
//     duas vezes.
//
// Divergências contra Google Sheets devem ser registradas em
// docs/dashboard/validacao-fase-2.md, não corrigidas silenciosamente.
// =====================================================================

// CaracterizacaoPerfil é o payload de
// GET /v1/admin/analytics/caracterizacao/perfil.
type CaracterizacaoPerfil struct {
	KPIs               CaracterizacaoKPIs       `json:"kpis"`
	PorPorte           []PorteStat              `json:"por_porte"`
	PorZona            []ZonaPercentStat        `json:"por_zona"`
	MatriculasPorPorte []MatriculasPorPorteStat `json:"matriculas_por_porte"`
}

// CaracterizacaoKPIs reúne os indicadores agregados do topo da aba.
type CaracterizacaoKPIs struct {
	TotalEscolas         int     `json:"total_escolas"`
	TotalAlunos          float64 `json:"total_alunos"`
	MediaAlunosPorEscola float64 `json:"media_alunos_por_escola"`
	AlunosPcd            float64 `json:"alunos_pcd"`
}

// PorteStat é a distribuição de escolas por porte (donut).
type PorteStat struct {
	Porte      string  `json:"porte"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

// ZonaPercentStat é a distribuição de escolas por zona (donut), com
// percentual já calculado no SQL para evitar reprocessamento no front.
type ZonaPercentStat struct {
	Zona       string  `json:"zona"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

// MatriculasPorPorteStat é a soma de alunos por porte (gráfico de barras).
type MatriculasPorPorteStat struct {
	Porte       string  `json:"porte"`
	TotalAlunos float64 `json:"total_alunos"`
}

// CaracterizacaoDRE é o payload de
// GET /v1/admin/analytics/caracterizacao/dre.
type CaracterizacaoDRE struct {
	TopDRES       []DRECountStat   `json:"top_dres"`
	Detalhamento  []DRESummaryStat `json:"detalhamento"`
}

// DRECountStat é a contagem de escolas por DRE ordenada desc (top).
type DRECountStat struct {
	DRE     string `json:"dre"`
	Escolas int    `json:"escolas"`
}

// DRESummaryStat é o resumo agregado por DRE para a tabela detalhada.
type DRESummaryStat struct {
	DRE                  string  `json:"dre"`
	Escolas              int     `json:"escolas"`
	TotalAlunos          float64 `json:"total_alunos"`
	MediaAlunosPorEscola float64 `json:"media_alunos_por_escola"`
	SalasAula            float64 `json:"salas_aula"`
}

// AnalyticsOverview é o payload do endpoint GET /v1/admin/analytics/overview.
// Reúne os KPIs principais do dashboard a partir do PostgreSQL (view
// vw_censo_base), substituindo, nos cards principais, a leitura que hoje
// vem de sheet-metrics.
type AnalyticsOverview struct {
	TotalSchools         int        `json:"total_schools"`
	TotalCensuses        int        `json:"total_censuses"`
	Completed            int        `json:"completed"`
	Drafts               int        `json:"drafts"`
	TotalAlunos          float64    `json:"total_alunos"`
	AlunosPcd            float64    `json:"alunos_pcd"`
	MediaAlunosPorEscola float64    `json:"media_alunos_por_escola"`
	PorZona              []ZonaStat `json:"por_zona"`
}

// ZonaStat é a contagem de escolas por zona.
type ZonaStat struct {
	Zona  string `json:"zona"`
	Total int    `json:"total"`
}

// AdminAnalyticsOverview lê vw_censo_base e devolve os KPIs principais.
//
// Critérios usados (documentados aqui para evitar drift no futuro):
//
//   - Contagens operacionais usam diretamente o banco via vw_censo_base
//     (que produz LEFT JOIN entre schools e census_responses):
//     * "total_schools"  = total de escolas cadastradas (independente de censo).
//     * "total_censuses" = total de linhas de censo registradas (todas as
//       combinações school_id × year), filtrando "census_id IS NOT NULL"
//       para descartar escolas sem nenhum censo (LEFT JOIN preenche NULL).
//   - "completed" e "drafts" contam ESCOLAS DISTINTAS (COUNT DISTINCT
//     school_id) — uma escola com censos em vários anos é contada uma
//     única vez. Isso casa com a semântica do card "Total de Escolas
//     (Censos concluídos)" no painel admin.
//   - Métricas QUANTITATIVAS DE ALUNOS ("total_alunos", "alunos_pcd",
//     "media_alunos_por_escola") consideram somente:
//        status = 'completed'  AND  year = EXTRACT(YEAR FROM CURRENT_DATE)::int
//     O filtro de ano corrente evita inflação caso a base já contenha
//     censos completados de múltiplos anos (cenário futuro do ciclo
//     anual). Filtros por ano via querystring serão tratados em fase
//     futura — por ora o critério é fixo no ano corrente.
//   - "por_zona" agrupa escolas (COUNT DISTINCT school_id) por s.zona;
//     uma escola sem zona informada cai em "Não informado".
func (app *application) AdminAnalyticsOverview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := AnalyticsOverview{
		PorZona: []ZonaStat{},
	}

	// 1) Contagens operacionais e quantitativos de alunos (1 query).
	//    - COUNT DISTINCT school_id em completed/drafts: evita contar
	//      a mesma escola múltiplas vezes quando houver censos de mais
	//      de um ano.
	//    - SUM/AVG filtram pelo ano corrente para evitar inflação
	//      acumulada entre ciclos anuais.
	//    - COALESCE garante 0 quando não há linhas completed no ano.
	err := db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM schools)                                                       AS total_schools,
			COUNT(*) FILTER (WHERE census_id IS NOT NULL)                                        AS total_censuses,
			COUNT(DISTINCT school_id) FILTER (WHERE status = 'completed')                        AS completed,
			COUNT(DISTINCT school_id) FILTER (WHERE status = 'draft')                            AS drafts,
			COALESCE(SUM(total_alunos)
				FILTER (
					WHERE status = 'completed'
					  AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
				), 0)::float8                                                                    AS total_alunos,
			COALESCE(SUM(alunos_pcd)
				FILTER (
					WHERE status = 'completed'
					  AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
				), 0)::float8                                                                    AS alunos_pcd,
			COALESCE(AVG(total_alunos)
				FILTER (
					WHERE status = 'completed'
					  AND total_alunos IS NOT NULL
					  AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
				), 0)::float8                                                                    AS media_alunos
		FROM vw_censo_base
	`).Scan(
		&out.TotalSchools,
		&out.TotalCensuses,
		&out.Completed,
		&out.Drafts,
		&out.TotalAlunos,
		&out.AlunosPcd,
		&out.MediaAlunosPorEscola,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao calcular overview: %v", err), http.StatusInternalServerError)
		return
	}

	// 2) Distribuição por zona — escolas DISTINTAS por zona.
	rows, err := db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(zona, ''), 'Não informado') AS zona,
			COUNT(DISTINCT school_id)                   AS total
		FROM vw_censo_base
		GROUP BY 1
		ORDER BY 2 DESC, 1
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao agrupar por zona: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var z ZonaStat
		if err := rows.Scan(&z.Zona, &z.Total); err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao ler zona: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorZona = append(out.PorZona, z)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao iterar zona: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// AdminAnalyticsCaracterizacaoPerfil lê vw_censo_enriquecida e devolve
// KPIs + distribuições principais da aba "Caracterização da Rede".
//
// Critérios (Fase 2A — provisórios, herdados da Fase 1):
//   - filtros analíticos:   status='completed' AND year=ano corrente;
//   - "total_escolas":      COUNT DISTINCT school_id;
//   - "total_alunos":       SUM(total_alunos);
//   - "media_alunos_por_escola": AVG(total_alunos) considerando apenas
//     escolas com total_alunos NOT NULL — evita média subestimada;
//   - "alunos_pcd":         SUM(alunos_pcd);
//   - "por_porte" e "por_zona": percentual sobre o total de escolas
//     consideradas (mesmo recorte);
//   - "matriculas_por_porte": SUM(total_alunos) GROUP BY porte_escola.
func (app *application) AdminAnalyticsCaracterizacaoPerfil(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := CaracterizacaoPerfil{
		PorPorte:           []PorteStat{},
		PorZona:            []ZonaPercentStat{},
		MatriculasPorPorte: []MatriculasPorPorteStat{},
	}

	// 1) KPIs agregados.
	err := db.QueryRowContext(ctx, `
		SELECT
			COUNT(DISTINCT school_id)                                    AS total_escolas,
			COALESCE(SUM(total_alunos), 0)::float8                       AS total_alunos,
			COALESCE(AVG(total_alunos) FILTER (WHERE total_alunos IS NOT NULL), 0)::float8 AS media_alunos,
			COALESCE(SUM(alunos_pcd),   0)::float8                       AS alunos_pcd
		FROM vw_censo_enriquecida
		WHERE status = 'completed'
		  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
	`).Scan(
		&out.KPIs.TotalEscolas,
		&out.KPIs.TotalAlunos,
		&out.KPIs.MediaAlunosPorEscola,
		&out.KPIs.AlunosPcd,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro nos KPIs de caracterização: %v", err), http.StatusInternalServerError)
		return
	}

	// 2) Escolas por porte (donut). Percentual computado sobre o total
	//    de escolas DISTINTAS dentro do mesmo recorte completed/ano.
	rowsPorte, err := db.QueryContext(ctx, `
		WITH base AS (
			SELECT school_id, porte_escola_nome, porte_escola_cod
			FROM vw_censo_enriquecida
			WHERE status = 'completed'
			  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		totais AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS total FROM base
		)
		SELECT
			b.porte_escola_nome                                      AS porte,
			COUNT(DISTINCT b.school_id)                              AS escolas,
			CASE WHEN t.total > 0
				 THEN ROUND(100.0 * COUNT(DISTINCT b.school_id) / t.total, 2)
				 ELSE 0
			END::float8                                              AS percentual,
			MIN(b.porte_escola_cod)                                  AS ord
		FROM base b CROSS JOIN totais t
		GROUP BY b.porte_escola_nome, t.total
		ORDER BY ord
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em por_porte: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsPorte.Close()
	for rowsPorte.Next() {
		var p PorteStat
		var ord int
		if err := rowsPorte.Scan(&p.Porte, &p.Escolas, &p.Percentual, &ord); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo por_porte: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorPorte = append(out.PorPorte, p)
	}
	if err := rowsPorte.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando por_porte: %v", err), http.StatusInternalServerError)
		return
	}

	// 3) Escolas por zona (donut). 'Não informado' agrupa NULL/vazio.
	rowsZona, err := db.QueryContext(ctx, `
		WITH base AS (
			SELECT school_id, COALESCE(NULLIF(zona, ''), 'Não informado') AS zona
			FROM vw_censo_enriquecida
			WHERE status = 'completed'
			  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		totais AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS total FROM base
		)
		SELECT
			b.zona                                                   AS zona,
			COUNT(DISTINCT b.school_id)                              AS escolas,
			CASE WHEN t.total > 0
				 THEN ROUND(100.0 * COUNT(DISTINCT b.school_id) / t.total, 2)
				 ELSE 0
			END::float8                                              AS percentual
		FROM base b CROSS JOIN totais t
		GROUP BY b.zona, t.total
		ORDER BY escolas DESC, zona
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em por_zona: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsZona.Close()
	for rowsZona.Next() {
		var z ZonaPercentStat
		if err := rowsZona.Scan(&z.Zona, &z.Escolas, &z.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo por_zona: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorZona = append(out.PorZona, z)
	}
	if err := rowsZona.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando por_zona: %v", err), http.StatusInternalServerError)
		return
	}

	// 4) Matrículas por porte (barras): SUM(total_alunos) por faixa.
	rowsMat, err := db.QueryContext(ctx, `
		SELECT
			porte_escola_nome              AS porte,
			COALESCE(SUM(total_alunos), 0)::float8 AS total_alunos,
			MIN(porte_escola_cod)          AS ord
		FROM vw_censo_enriquecida
		WHERE status = 'completed'
		  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		GROUP BY porte_escola_nome
		ORDER BY ord
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em matriculas_por_porte: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsMat.Close()
	for rowsMat.Next() {
		var m MatriculasPorPorteStat
		var ord int
		if err := rowsMat.Scan(&m.Porte, &m.TotalAlunos, &ord); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo matriculas_por_porte: %v", err), http.StatusInternalServerError)
			return
		}
		out.MatriculasPorPorte = append(out.MatriculasPorPorte, m)
	}
	if err := rowsMat.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando matriculas_por_porte: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// AdminAnalyticsCaracterizacaoDRE lê vw_censo_enriquecida e devolve o
// resumo por DRE consumido pela tabela "Detalhamento por DRE" e pelas
// barras "Escolas por DRE" da aba "Caracterização da Rede".
//
// Critérios (Fase 2A — provisórios, herdados da Fase 1):
//   - status='completed' AND year=ano corrente;
//   - "escolas":              COUNT DISTINCT school_id;
//   - "total_alunos":         SUM(total_alunos);
//   - "media_alunos_por_escola": AVG(total_alunos) restrita a escolas
//                              com total_alunos NOT NULL;
//   - "salas_aula":           SUM(qtd_salas_aula);
//   - DREs vazias/NULL caem em 'Não informado' para não sumirem do top.
func (app *application) AdminAnalyticsCaracterizacaoDRE(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := CaracterizacaoDRE{
		TopDRES:      []DRECountStat{},
		Detalhamento: []DRESummaryStat{},
	}

	// 1) Detalhamento por DRE. A mesma agregação serve para o "top",
	//    então calculamos uma vez e derivamos top_dres em Go,
	//    evitando uma segunda query e mantendo consistência total
	//    entre os dois blocos.
	rows, err := db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(dre, ''), 'Não informado')                                     AS dre,
			COUNT(DISTINCT school_id)                                                      AS escolas,
			COALESCE(SUM(total_alunos), 0)::float8                                         AS total_alunos,
			COALESCE(AVG(total_alunos) FILTER (WHERE total_alunos IS NOT NULL), 0)::float8 AS media_alunos,
			COALESCE(SUM(qtd_salas_aula), 0)::float8                                       AS salas_aula
		FROM vw_censo_enriquecida
		WHERE status = 'completed'
		  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		GROUP BY 1
		ORDER BY escolas DESC, dre
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro no detalhamento por DRE: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var d DRESummaryStat
		if err := rows.Scan(&d.DRE, &d.Escolas, &d.TotalAlunos, &d.MediaAlunosPorEscola, &d.SalasAula); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo DRE: %v", err), http.StatusInternalServerError)
			return
		}
		out.Detalhamento = append(out.Detalhamento, d)
		out.TopDRES = append(out.TopDRES, DRECountStat{DRE: d.DRE, Escolas: d.Escolas})
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando DRE: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}
