package main

import (
	"context"
	"fmt"
	"net/http"
)

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
// dos filtros globais do dashboard.
func (app *application) AdminAnalyticsFiltrosOpcoes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

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

	regioes, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT regiao_de_integracao
		FROM reg_integracao
		ORDER BY regiao_de_integracao
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("regioes_integracao: %w", err), http.StatusInternalServerError)
		return
	}

	dres, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT COALESCE(NULLIF(TRIM(dre), ''), 'Não informado') AS dre
		FROM schools
		ORDER BY 1
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dres: %w", err), http.StatusInternalServerError)
		return
	}

	municipios, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT COALESCE(NULLIF(TRIM(municipio), ''), 'Não informado') AS municipio
		FROM schools
		ORDER BY 1
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("municipios: %w", err), http.StatusInternalServerError)
		return
	}

	zonas, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT zona
		FROM schools
		WHERE zona IS NOT NULL AND TRIM(zona) <> ''
		ORDER BY zona
	`)
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
