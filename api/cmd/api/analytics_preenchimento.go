package main

import (
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// PreenchimentoDreRow descreve o andamento do preenchimento do censo de uma DRE
// dentro do recorte global: total de escolas, quantas concluíram, quantas estão
// em rascunho, quantas ainda não têm censo no ano e o percentual de conclusão.
type PreenchimentoDreRow struct {
	DRE                  string `json:"dre"`
	Total                int    `json:"total"`
	Completed            int    `json:"completed"`
	Draft                int    `json:"draft"`
	Pending              int    `json:"pending"`
	CompletionPercentage int    `json:"completion_percentage"`
}

// PreenchimentoDrePayload é a resposta do endpoint de andamento por DRE. Os
// totais consolidam todas as DREs do recorte. ano_referencia ecoa o ano usado.
type PreenchimentoDrePayload struct {
	AnoReferencia  int                   `json:"ano_referencia"`
	TotalEscolas   int                   `json:"total_escolas"`
	TotalCompleted int                   `json:"total_completed"`
	TotalDraft     int                   `json:"total_draft"`
	TotalPending   int                   `json:"total_pending"`
	DREs           []PreenchimentoDreRow `json:"dres"`
}

// preenchimentoDreFilters reúne os filtros globais do dashboard aplicados sobre
// o cadastro de escolas. Strings vazias significam "filtro desativado". O ano
// segue os demais endpoints analíticos: valor válido enviado pelo cliente ou o
// ano corrente como fallback.
type preenchimentoDreFilters struct {
	Year             int
	DRE              string
	Municipio        string
	Zona             string
	RegiaoIntegracao string
	SchoolID         int
	CodigoINEP       string
}

func parsePreenchimentoDreFilters(q url.Values, now time.Time) preenchimentoDreFilters {
	f := preenchimentoDreFilters{
		Year:             now.Year(),
		DRE:              strings.TrimSpace(q.Get("dre")),
		Municipio:        strings.TrimSpace(q.Get("municipio")),
		Zona:             strings.TrimSpace(q.Get("zona")),
		RegiaoIntegracao: strings.TrimSpace(q.Get("regiao_integracao")),
	}
	if y, err := strconv.Atoi(strings.TrimSpace(q.Get("year"))); err == nil && y > 0 {
		f.Year = y
	}
	return f
}

// preenchimentoDreSelectSQL parte da entidade mestre dres, garantindo que uma
// DRE ativa recém-criada apareça mesmo sem escolas vinculadas. Escolas com DRE
// legada/não mapeada continuam aparecendo numa linha própria para não provocar
// perda silenciosa de dados operacionais durante a transição para a entidade
// mestre.
//
// Filtros territoriais são aplicados primeiro a schools. Quando não existe
// filtro de escola/território, todas as DREs ativas aparecem, inclusive com
// total=0. Quando existe algum desses filtros, linhas mestre sem nenhuma escola
// correspondente são omitidas, preservando a semântica de cascata do dashboard.
const preenchimentoDreSelectSQL = `
	WITH latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id,
			status
		FROM census_responses
		WHERE year = $1
		ORDER BY school_id, updated_at DESC, id DESC
	),
	filtered_schools AS (
		SELECT s.id, s.dre
		FROM schools s
		WHERE ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
		  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
		  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
		        SELECT UPPER(TRIM(municipio))
		        FROM reg_integracao
		        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
		      ))
	),
	master_rows AS (
		SELECT
			TRIM(d.nome) AS dre,
			COUNT(s.id) AS total,
			COUNT(s.id) FILTER (WHERE cr.status = 'completed') AS completed,
			COUNT(s.id) FILTER (WHERE cr.status = 'draft') AS draft
		FROM dres d
		LEFT JOIN filtered_schools s
		  ON UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome))
		LEFT JOIN latest_census cr ON cr.school_id = s.id
		WHERE d.ativa = TRUE
		  AND NULLIF(TRIM(d.nome), '') IS NOT NULL
		  AND ($2 = '' OR UPPER(TRIM(d.nome)) = UPPER(TRIM($2)))
		GROUP BY d.id, d.nome
		HAVING (($3 = '' AND $4 = '' AND $5 = '') OR COUNT(s.id) > 0)
	),
	legacy_rows AS (
		SELECT
			COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
			COUNT(s.id) AS total,
			COUNT(s.id) FILTER (WHERE cr.status = 'completed') AS completed,
			COUNT(s.id) FILTER (WHERE cr.status = 'draft') AS draft
		FROM filtered_schools s
		LEFT JOIN dres d
		  ON d.ativa = TRUE
		 AND UPPER(TRIM(d.nome)) = UPPER(TRIM(s.dre))
		LEFT JOIN latest_census cr ON cr.school_id = s.id
		WHERE d.id IS NULL
		  AND ($2 = '' OR UPPER(TRIM(COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado'))) = UPPER(TRIM($2)))
		GROUP BY COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')
	)
	SELECT dre, total, completed, draft
	FROM (
		SELECT 0 AS sort_order, dre, total, completed, draft FROM master_rows
		UNION ALL
		SELECT 1 AS sort_order, dre, total, completed, draft FROM legacy_rows
	) rows_union
	ORDER BY sort_order, UPPER(dre), dre
`

func buildPreenchimentoDreQuery(f preenchimentoDreFilters) (string, []any) {
	return preenchimentoDreSelectSQL, []any{
		f.Year,
		f.DRE,
		f.Municipio,
		f.Zona,
		f.RegiaoIntegracao,
	}
}

// A variante scoped adiciona school_id/codigo_inep sem alterar o contrato da
// query-base usado pelos testes e por chamadas que só precisam dos cinco filtros
// históricos.
const preenchimentoDreScopedSelectSQL = `
	WITH latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id,
			status
		FROM census_responses
		WHERE year = $1
		ORDER BY school_id, updated_at DESC, id DESC
	),
	filtered_schools AS (
		SELECT s.id, s.dre
		FROM schools s
		WHERE ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
		  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
		  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
		        SELECT UPPER(TRIM(municipio))
		        FROM reg_integracao
		        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
		      ))
		  AND ($6 = 0 OR s.id = $6)
		  AND ($7 = '' OR UPPER(TRIM(COALESCE(s.codigo_inep, ''))) = UPPER(TRIM($7)))
	),
	master_rows AS (
		SELECT
			TRIM(d.nome) AS dre,
			COUNT(s.id) AS total,
			COUNT(s.id) FILTER (WHERE cr.status = 'completed') AS completed,
			COUNT(s.id) FILTER (WHERE cr.status = 'draft') AS draft
		FROM dres d
		LEFT JOIN filtered_schools s
		  ON UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome))
		LEFT JOIN latest_census cr ON cr.school_id = s.id
		WHERE d.ativa = TRUE
		  AND NULLIF(TRIM(d.nome), '') IS NOT NULL
		  AND ($2 = '' OR UPPER(TRIM(d.nome)) = UPPER(TRIM($2)))
		GROUP BY d.id, d.nome
		HAVING (($3 = '' AND $4 = '' AND $5 = '' AND $6 = 0 AND $7 = '') OR COUNT(s.id) > 0)
	),
	legacy_rows AS (
		SELECT
			COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
			COUNT(s.id) AS total,
			COUNT(s.id) FILTER (WHERE cr.status = 'completed') AS completed,
			COUNT(s.id) FILTER (WHERE cr.status = 'draft') AS draft
		FROM filtered_schools s
		LEFT JOIN dres d
		  ON d.ativa = TRUE
		 AND UPPER(TRIM(d.nome)) = UPPER(TRIM(s.dre))
		LEFT JOIN latest_census cr ON cr.school_id = s.id
		WHERE d.id IS NULL
		  AND ($2 = '' OR UPPER(TRIM(COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado'))) = UPPER(TRIM($2)))
		GROUP BY COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')
	)
	SELECT dre, total, completed, draft
	FROM (
		SELECT 0 AS sort_order, dre, total, completed, draft FROM master_rows
		UNION ALL
		SELECT 1 AS sort_order, dre, total, completed, draft FROM legacy_rows
	) rows_union
	ORDER BY sort_order, UPPER(dre), dre
`

func preenchimentoDreFiltersFromRequest(r *http.Request, now time.Time) preenchimentoDreFilters {
	f := parsePreenchimentoDreFilters(r.URL.Query(), now)
	shared := parseAnalyticsFilters(r)
	f.DRE = shared.DRE
	f.Municipio = shared.Municipio
	f.Zona = shared.Zona
	f.RegiaoIntegracao = shared.RegiaoIntegracao
	f.SchoolID = shared.SchoolID
	f.CodigoINEP = shared.CodigoINEP
	return f
}

func buildPreenchimentoDreScopedQuery(f preenchimentoDreFilters) (string, []any) {
	return preenchimentoDreScopedSelectSQL, []any{
		f.Year,
		f.DRE,
		f.Municipio,
		f.Zona,
		f.RegiaoIntegracao,
		f.SchoolID,
		f.CodigoINEP,
	}
}

func completionPercentage(completed, total int) int {
	if total <= 0 {
		return 0
	}
	return int(math.Round(float64(completed) / float64(total) * 100))
}

func buildPreenchimentoDreRow(dre string, total, completed, draft int) PreenchimentoDreRow {
	pending := total - completed - draft
	if pending < 0 {
		pending = 0
	}
	return PreenchimentoDreRow{
		DRE:                  dre,
		Total:                total,
		Completed:            completed,
		Draft:                draft,
		Pending:              pending,
		CompletionPercentage: completionPercentage(completed, total),
	}
}

func (app *application) AdminAnalyticsPreenchimentoDre(w http.ResponseWriter, r *http.Request) {
	filters := preenchimentoDreFiltersFromRequest(r, time.Now())
	query, args := buildPreenchimentoDreScopedQuery(filters)

	rows, err := app.models.Schools.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("consultar preenchimento por DRE: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	payload := PreenchimentoDrePayload{
		AnoReferencia: filters.Year,
		DREs:          make([]PreenchimentoDreRow, 0),
	}

	for rows.Next() {
		var dre string
		var total, completed, draft int
		if err := rows.Scan(&dre, &total, &completed, &draft); err != nil {
			app.errorJSON(w, fmt.Errorf("ler linha de preenchimento por DRE: %v", err), http.StatusInternalServerError)
			return
		}
		row := buildPreenchimentoDreRow(dre, total, completed, draft)
		payload.DREs = append(payload.DREs, row)
		payload.TotalEscolas += row.Total
		payload.TotalCompleted += row.Completed
		payload.TotalDraft += row.Draft
		payload.TotalPending += row.Pending
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar preenchimento por DRE: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: payload})
}
