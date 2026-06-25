package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// AnalyticsFilters holds the parsed query-string filters common to all
// analytical endpoints. Default year = current year; string filters default
// to "" (= no filter applied in WhereSQL).
type AnalyticsFilters struct {
	Year             int
	DRE              string
	Municipio        string
	Zona             string
	RegiaoIntegracao string
}

func parseAnalyticsFilters(r *http.Request) AnalyticsFilters {
	return parseAnalyticsFiltersFromValues(r.URL.Query(), time.Now())
}

// parseAnalyticsFiltersFromValues is the testable core of parseAnalyticsFilters.
// Textual filters are trimmed of surrounding whitespace; absent filters become
// "". Year falls back to now.Year() when missing, blank, non-numeric, zero or
// negative.
func parseAnalyticsFiltersFromValues(q url.Values, now time.Time) AnalyticsFilters {
	f := AnalyticsFilters{
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

// WhereSQL returns a parameterized WHERE fragment (no table alias prefix).
// $1=year, $2=dre, $3=municipio, $4=zona, $5=regiao_integracao.
// Empty string params disable the corresponding filter.
// Pair with Args() to get the matching positional arguments.
func (f AnalyticsFilters) WhereSQL() string {
	return `status = 'completed'
      AND year = $1
      AND census_id IS NOT NULL
      AND ($2 = '' OR UPPER(TRIM(dre)) = UPPER(TRIM($2)))
      AND ($3 = '' OR UPPER(TRIM(municipio)) = UPPER(TRIM($3)))
      AND ($4 = '' OR UPPER(TRIM(zona)) = UPPER(TRIM($4)))
      AND ($5 = '' OR UPPER(TRIM(municipio)) IN (
        SELECT UPPER(TRIM(municipio))
        FROM reg_integracao
        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
      ))`
}

// Args returns the five positional arguments that match WhereSQL in order.
func (f AnalyticsFilters) Args() []any {
	return []any{f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao}
}

func queryStringSlice(app *application, ctx context.Context, query string, args ...any) ([]string, error) {
	rows, err := app.models.Schools.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]string, 0)
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

type FiltrosEscolaItem struct {
	SchoolID   int     `json:"school_id"`
	CodigoINEP *string `json:"codigo_inep"`
	NomeEscola string  `json:"nome_escola"`
	Municipio  string  `json:"municipio"`
	DRE        string  `json:"dre"`
	Zona       *string `json:"zona"`
}

type FiltrosOpcoes struct {
	Anos              []int               `json:"anos"`
	RegioesIntegracao []string            `json:"regioes_integracao"`
	DREs              []string            `json:"dres"`
	Municipios        []string            `json:"municipios"`
	Zonas             []string            `json:"zonas"`
	Escolas           []FiltrosEscolaItem `json:"escolas"`
}

// AdminAnalyticsFiltrosOpcoes retorna as listas para popular os selects
// dos filtros globais do dashboard. Aceita os mesmos query params dos filtros
// analíticos e aplica cascata: cada lista é filtrada pelos demais filtros ativos.
func (app *application) AdminAnalyticsFiltrosOpcoes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	f := parseAnalyticsFilters(r)

	anos, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT year::text
		FROM census_responses
		WHERE status = 'completed'
		ORDER BY year::text DESC
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("anos: %w", err), http.StatusInternalServerError)
		return
	}
	anosInt := make([]int, 0, len(anos))
	for _, a := range anos {
		var n int
		if _, err := fmt.Sscanf(a, "%d", &n); err == nil {
			anosInt = append(anosInt, n)
		}
	}

	// Regiões: filtradas por dre, municipio, zona (não pela própria regiao)
	regioes, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT r.regiao_de_integracao
		FROM reg_integracao r
		JOIN schools s ON s.municipio = r.municipio
		WHERE ($1 = '' OR s.dre = $1)
		  AND ($2 = '' OR s.municipio = $2)
		  AND ($3 = '' OR s.zona = $3)
		ORDER BY 1
	`, f.DRE, f.Municipio, f.Zona)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("regioes_integracao: %w", err), http.StatusInternalServerError)
		return
	}

	// DREs: filtradas por municipio, zona, regiao (não pela própria dre)
	dres, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre
		FROM schools s
		WHERE ($1 = '' OR s.municipio = $1)
		  AND ($2 = '' OR s.zona = $2)
		  AND ($3 = '' OR s.municipio IN (SELECT municipio FROM reg_integracao WHERE regiao_de_integracao = $3))
		ORDER BY 1
	`, f.Municipio, f.Zona, f.RegiaoIntegracao)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dres: %w", err), http.StatusInternalServerError)
		return
	}

	// Municípios: filtrados por dre, zona, regiao (não pelo próprio municipio)
	municipios, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado') AS municipio
		FROM schools s
		WHERE ($1 = '' OR s.dre = $1)
		  AND ($2 = '' OR s.zona = $2)
		  AND ($3 = '' OR s.municipio IN (SELECT municipio FROM reg_integracao WHERE regiao_de_integracao = $3))
		ORDER BY 1
	`, f.DRE, f.Zona, f.RegiaoIntegracao)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("municipios: %w", err), http.StatusInternalServerError)
		return
	}

	// Zonas: filtradas por dre, municipio, regiao (não pela própria zona)
	zonas, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT s.zona
		FROM schools s
		WHERE s.zona IS NOT NULL AND TRIM(s.zona) <> ''
		  AND ($1 = '' OR s.dre = $1)
		  AND ($2 = '' OR s.municipio = $2)
		  AND ($3 = '' OR s.municipio IN (SELECT municipio FROM reg_integracao WHERE regiao_de_integracao = $3))
		ORDER BY 1
	`, f.DRE, f.Municipio, f.RegiaoIntegracao)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("zonas: %w", err), http.StatusInternalServerError)
		return
	}

	rows, err := app.models.Schools.DB.QueryContext(ctx, `
		SELECT
			id,
			codigo_inep,
			COALESCE(NULLIF(TRIM(nome_escola), ''), 'Sem nome') AS nome_escola,
			COALESCE(NULLIF(TRIM(municipio), ''), 'Não informado') AS municipio,
			COALESCE(NULLIF(TRIM(dre), ''), 'Não informado') AS dre,
			zona
		FROM schools
		ORDER BY nome_escola
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("escolas: %w", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	escolas := make([]FiltrosEscolaItem, 0)
	for rows.Next() {
		var item FiltrosEscolaItem
		var inep, zona *string
		if err := rows.Scan(&item.SchoolID, &inep, &item.NomeEscola, &item.Municipio, &item.DRE, &zona); err != nil {
			app.errorJSON(w, fmt.Errorf("ler escola: %w", err), http.StatusInternalServerError)
			return
		}
		if inep != nil && *inep != "" {
			item.CodigoINEP = inep
		}
		if zona != nil && *zona != "" {
			item.Zona = zona
		}
		escolas = append(escolas, item)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar escolas: %w", err), http.StatusInternalServerError)
		return
	}

	out := FiltrosOpcoes{
		Anos:              anosInt,
		RegioesIntegracao: regioes,
		DREs:              dres,
		Municipios:        municipios,
		Zonas:             zonas,
		Escolas:           escolas,
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// parseEscolasPageSize valida o parâmetro page_size para endpoints /escolas.
// Valores permitidos: 10, 50, 100, 1000. Default: 10.
func parseEscolasPageSize(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || (n != 10 && n != 50 && n != 100 && n != 1000) {
		return 10
	}
	return n
}

// parseEscolasPage valida o parâmetro page (>=1). Default: 1.
func parseEscolasPage(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 1 {
		return 1
	}
	return n
}

// parseEscolasDirection valida o parâmetro direction para endpoints /escolas.
// Valores aceitos: "asc" e "desc". Default: "asc".
func parseEscolasDirection(raw string) string {
	if strings.TrimSpace(raw) == "desc" {
		return "desc"
	}
	return "asc"
}
