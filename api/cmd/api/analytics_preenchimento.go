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
// o cadastro de escolas. DREID é preenchido somente pelo escopo autenticado.
type preenchimentoDreFilters struct {
	Year             int
	DREID            int
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

// A query-base mantém o contrato histórico de cinco argumentos usado pelos
// testes auxiliares. Em schema pós-0020, porém, filtros, join e agregação são
// resolvidos por schools.dre_id -> dres.id. O texto de schools.dre só é
// consultado quando a coluna dre_id ainda não existe no schema de transição.
const preenchimentoDreSelectSQL = `
	WITH schema_mode AS (
		SELECT EXISTS (
			SELECT 1 FROM pg_attribute
			WHERE attrelid = to_regclass('schools')
			  AND attname = 'dre_id'
			  AND NOT attisdropped
		) AS canonical
	),
	latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id,
			status
		FROM census_responses
		WHERE year = $1
		ORDER BY school_id, updated_at DESC, id DESC
	),
	filtered_schools AS (
		SELECT
			s.id,
			s.dre,
			CASE WHEN m.canonical THEN NULLIF(to_jsonb(s)->>'dre_id', '')::int ELSE NULL END AS dre_id,
			m.canonical
		FROM schools s
		CROSS JOIN schema_mode m
		WHERE ($2 = '' OR CASE
			WHEN m.canonical THEN EXISTS (
				SELECT 1 FROM dres fd
				WHERE fd.id = NULLIF(to_jsonb(s)->>'dre_id', '')::int
				  AND UPPER(TRIM(fd.nome)) = UPPER(TRIM($2))
			)
			ELSE UPPER(TRIM(s.dre)) = UPPER(TRIM($2))
		END)
		  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
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
		  ON CASE WHEN s.canonical THEN s.dre_id = d.id
		          ELSE UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome)) END
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
		  ON CASE WHEN s.canonical THEN s.dre_id = d.id
		          ELSE UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome)) END
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

// A variante scoped adiciona school_id/codigo_inep e recebe $8=dre_id do
// escopo autenticado. Quando $8 > 0 e 0020 existe, o filtro territorial usa o
// ID diretamente; o nome não participa da decisão de autorização.
const preenchimentoDreScopedSelectSQL = `
	WITH schema_mode AS (
		SELECT EXISTS (
			SELECT 1 FROM pg_attribute
			WHERE attrelid = to_regclass('schools')
			  AND attname = 'dre_id'
			  AND NOT attisdropped
		) AS canonical
	),
	latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id,
			status
		FROM census_responses
		WHERE year = $1
		ORDER BY school_id, updated_at DESC, id DESC
	),
	filtered_schools AS (
		SELECT
			s.id,
			s.dre,
			CASE WHEN m.canonical THEN NULLIF(to_jsonb(s)->>'dre_id', '')::int ELSE NULL END AS dre_id,
			m.canonical
		FROM schools s
		CROSS JOIN schema_mode m
		WHERE ($2 = '' OR CASE
			WHEN m.canonical AND $8 > 0 THEN NULLIF(to_jsonb(s)->>'dre_id', '')::int = $8
			WHEN m.canonical THEN EXISTS (
				SELECT 1 FROM dres fd
				WHERE fd.id = NULLIF(to_jsonb(s)->>'dre_id', '')::int
				  AND UPPER(TRIM(fd.nome)) = UPPER(TRIM($2))
			)
			ELSE UPPER(TRIM(s.dre)) = UPPER(TRIM($2))
		END)
		  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
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
		  ON CASE WHEN s.canonical THEN s.dre_id = d.id
		          ELSE UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome)) END
		LEFT JOIN latest_census cr ON cr.school_id = s.id
		WHERE d.ativa = TRUE
		  AND NULLIF(TRIM(d.nome), '') IS NOT NULL
		  AND ($2 = '' OR CASE WHEN $8 > 0 THEN d.id = $8 ELSE UPPER(TRIM(d.nome)) = UPPER(TRIM($2)) END)
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
		  ON CASE WHEN s.canonical THEN s.dre_id = d.id
		          ELSE UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome)) END
		LEFT JOIN latest_census cr ON cr.school_id = s.id
		WHERE d.id IS NULL
		  AND $8 = 0
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
	f.DREID = shared.DREID
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
		f.DREID,
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
