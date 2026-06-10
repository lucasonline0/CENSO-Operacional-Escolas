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
// o cadastro de escolas (schools s). Strings vazias significam "filtro
// desativado". O ano de referência segue a mesma regra dos demais endpoints
// analíticos: usa o year enviado quando válido, senão o ano corrente.
type preenchimentoDreFilters struct {
	Year             int
	DRE              string
	Municipio        string
	Zona             string
	RegiaoIntegracao string
}

// parsePreenchimentoDreFilters lê os filtros globais da query string. Espaços em
// branco são removidos (um valor só com espaços equivale a ausência de filtro).
// O ano segue parseAnalyticsFilters: year inválido/ausente cai no ano corrente.
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

// preenchimentoDreSelectSQL agrega o andamento do preenchimento por DRE partindo
// de schools s (não de census_responses), de modo que escolas sem censo no ano
// permaneçam no recorte e sejam contadas como pendentes via LEFT JOIN.
//
// A CTE latest_census colapsa eventuais respostas duplicadas por escola/ano em
// uma única linha (DISTINCT ON school_id, mantendo a mais recente). Há a
// constraint unique_school_year que já garante unicidade; o DISTINCT ON é uma
// salvaguarda defensiva caso isso mude.
//
// Os filtros globais incidem sobre schools s e por isso este endpoint NÃO
// reutiliza AnalyticsFilters.WhereSQL(), que exige status = 'completed' AND
// census_id IS NOT NULL — o que excluiria rascunhos e pendentes que precisamos
// contar. A comparação usa UPPER(TRIM(...)) para tolerar caixa e espaços.
const preenchimentoDreSelectSQL = `
	WITH latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id,
			status
		FROM census_responses
		WHERE year = $1
		ORDER BY school_id, updated_at DESC, id DESC
	)
	SELECT
		COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
		COUNT(*) AS total,
		COUNT(*) FILTER (WHERE cr.status = 'completed') AS completed,
		COUNT(*) FILTER (WHERE cr.status = 'draft') AS draft
	FROM schools s
	LEFT JOIN latest_census cr ON cr.school_id = s.id
	WHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))
	GROUP BY COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')
	ORDER BY dre
`

// buildPreenchimentoDreQuery devolve a query e os argumentos posicionais na
// ordem esperada por preenchimentoDreSelectSQL: $1=year, $2=dre, $3=municipio,
// $4=zona, $5=regiao_integracao.
func buildPreenchimentoDreQuery(f preenchimentoDreFilters) (string, []any) {
	return preenchimentoDreSelectSQL, []any{
		f.Year,
		f.DRE,
		f.Municipio,
		f.Zona,
		f.RegiaoIntegracao,
	}
}

// completionPercentage devolve o percentual inteiro de conclusão (completed /
// total * 100), arredondado, espelhando o que a UI atual já faz com Math.round.
// Retorna 0 quando não há escolas no recorte.
func completionPercentage(completed, total int) int {
	if total <= 0 {
		return 0
	}
	return int(math.Round(float64(completed) / float64(total) * 100))
}

// buildPreenchimentoDreRow monta uma linha do payload calculando pendentes e
// percentual a partir dos totais agregados no banco.
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

// AdminAnalyticsPreenchimentoDre retorna o andamento do preenchimento do censo
// por DRE, respeitando os filtros globais (year, dre, municipio, zona,
// regiao_integracao). Recorte vazio devolve payload válido com totais zerados.
func (app *application) AdminAnalyticsPreenchimentoDre(w http.ResponseWriter, r *http.Request) {
	filters := parsePreenchimentoDreFilters(r.URL.Query(), time.Now())
	query, args := buildPreenchimentoDreQuery(filters)

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
