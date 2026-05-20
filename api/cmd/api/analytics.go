package main

import (
	"fmt"
	"net/http"
)

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
