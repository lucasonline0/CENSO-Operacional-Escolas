package main

import (
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// PessoalEstrutura é o payload de GET /v1/admin/analytics/pessoal-gestao/estrutura.
type PessoalEstrutura struct {
	ComposicaoGestao          []CategoricStat `json:"composicao_gestao"`
	TotalCoordenadoresPedagog float64         `json:"total_coordenadores_pedagogicos"`
}

// PessoalCoordenacao é o payload de GET /v1/admin/analytics/pessoal-gestao/coordenacao.
type PessoalCoordenacao struct {
	PorArea       []CategoricStat `json:"por_area"`
	CoberturaMedia float64         `json:"cobertura_media"`
}

// =========================================================================
// Pessoal e Gestão Escolar
// =========================================================================

// AdminAnalyticsPessoalEstrutura retorna indicadores sobre a composição da gestão escolar.
// Baseado na view vw_censo_direcao_escolar (Migration 0003).
// Suporta filtros: ?year=&dre=&municipio=&zona=&porte_escola=
func (app *application) AdminAnalyticsPessoalEstrutura(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	// Captura de filtros da Query String
	qs := r.URL.Query()
	yearStr := qs.Get("year")
	dre := qs.Get("dre")
	municipio := qs.Get("municipio")
	zona := qs.Get("zona")
	porte := qs.Get("porte_escola")

	// Ano corrente como fallback
	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	out := PessoalEstrutura{
		ComposicaoGestao: []CategoricStat{},
	}

	// SQL base com filtros parametrizados
	// Nota: Unimos com vw_censo_enriquecida para suportar o filtro de porte_escola
	const baseQuery = `
		FROM vw_censo_direcao_escolar v
		JOIN vw_censo_enriquecida e ON e.census_id = v.census_id
		WHERE v.status = 'completed'
		  AND v.year = $1
		  AND ($2 = '' OR v.dre = $2)
		  AND ($3 = '' OR v.municipio = $3)
		  AND ($4 = '' OR v.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`

	// 1) Composição da Gestão (% de Sim por cargo)
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT v.school_id, v.cargo, v.possui, v.ordem
			%s
		),
		tot_escolas AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base
		)
		SELECT 
			cargo, 
			COUNT(DISTINCT school_id) FILTER (WHERE possui) AS escolas,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE possui) / NULLIF(tot_escolas.n, 0), 1), 0)::float8 AS percentual
		FROM base CROSS JOIN tot_escolas
		GROUP BY cargo, ordem, tot_escolas.n
		ORDER BY ordem
	`, baseQuery), year, dre, municipio, zona, porte)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("composicao_gestao: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var s CategoricStat
		if err := rows.Scan(&s.Valor, &s.Escolas, &s.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("scan composicao_gestao: %v", err), http.StatusInternalServerError)
			return
		}
		out.ComposicaoGestao = append(out.ComposicaoGestao, s)
	}

	// 2) Total de Coordenadores Pedagógicos (Soma quantitativa)
	// Como a view 003 é format Long, buscamos o quantitativo diretamente no JSON via vw_censo_base
	err = db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(
				CASE WHEN cr.data->>'qtd_coord_pedagogico' ~ '^-?[0-9]+(\.[0-9]+)?$'
					 THEN (cr.data->>'qtd_coord_pedagogico')::numeric
					 ELSE 0
				END
			), 0)::float8
		FROM vw_censo_base b
		JOIN census_responses cr ON cr.id = b.census_id
		JOIN vw_censo_enriquecida e ON e.census_id = b.census_id
		WHERE b.status = 'completed'
		  AND b.year = $1
		  AND ($2 = '' OR b.dre = $2)
		  AND ($3 = '' OR b.municipio = $3)
		  AND ($4 = '' OR b.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`, year, dre, municipio, zona, porte).Scan(&out.TotalCoordenadoresPedagog)

	if err != nil {
		app.errorJSON(w, fmt.Errorf("total_coordenadores: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// AdminAnalyticsPessoalCoordenacao retorna indicadores sobre coordenadores por área.
// Baseado na view vw_censo_coordenacao_area (Migration 0004).
func (app *application) AdminAnalyticsPessoalCoordenacao(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	// Captura de filtros da Query String
	qs := r.URL.Query()
	yearStr := qs.Get("year")
	dre := qs.Get("dre")
	municipio := qs.Get("municipio")
	zona := qs.Get("zona")
	porte := qs.Get("porte_escola")

	// Ano corrente como fallback
	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	out := PessoalCoordenacao{
		PorArea: []CategoricStat{},
	}

	// SQL base com filtros parametrizados
	const baseQuery = `
		FROM vw_censo_coordenacao_area v
		JOIN vw_censo_enriquecida e ON e.census_id = v.census_id
		WHERE v.status = 'completed'
		  AND v.year = $1
		  AND ($2 = '' OR v.dre = $2)
		  AND ($3 = '' OR v.municipio = $3)
		  AND ($4 = '' OR v.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`

	// 1) Distribuição por Área (% de Sim por área)
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT v.school_id, v.area, v.possui, v.ordem
			%s
		),
		tot_escolas AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base
		)
		SELECT 
			area, 
			COUNT(DISTINCT school_id) FILTER (WHERE possui) AS escolas,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE possui) / NULLIF(tot_escolas.n, 0), 1), 0)::float8 AS percentual
		FROM base CROSS JOIN tot_escolas
		GROUP BY area, ordem, tot_escolas.n
		ORDER BY ordem
	`, baseQuery), year, dre, municipio, zona, porte)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("por_area: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var s CategoricStat
		if err := rows.Scan(&s.Valor, &s.Escolas, &s.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("scan por_area: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorArea = append(out.PorArea, s)
	}

	// 2) Cobertura Média (Média de áreas cobertas por escola)
	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT school_id, COUNT(*) FILTER (WHERE possui) AS qtd_areas
			%s
			GROUP BY school_id
		)
		SELECT COALESCE(ROUND(AVG(qtd_areas), 2), 0)::float8
		FROM base
	`, baseQuery), year, dre, municipio, zona, porte).Scan(&out.CoberturaMedia)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("cobertura_media: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// TODO: Implementar AdminAnalyticsPessoalQuadro
// TODO: Implementar AdminAnalyticsTecnologiaInfra
// TODO: Implementar AdminAnalyticsTecnologiaUso
