package main

import (
	"fmt"
	"net/http"
	"sort"
)

type IndiceGovernancaEscola struct {
	SchoolID          int     `json:"school_id"`
	CodigoINEP        *string `json:"codigo_inep"`
	Escola            string  `json:"escola"`
	DRE               string  `json:"dre"`
	Municipio         string  `json:"municipio"`
	HasCenso          bool    `json:"has_censo"`
	ConselhoEscolar   bool    `json:"conselho_escolar"`
	ConselhoAtivo     bool    `json:"conselho_ativo"`
	RegularizadaCEE   bool    `json:"regularizada_cee"`
	GremioEstudantil  bool    `json:"gremio_estudantil"`
	PrestacaoContasOK bool    `json:"prestacao_contas_ok"`
	Score             int     `json:"score"`
	Status            string  `json:"status"` // "Excelente", "Regular", "Crítico", "Sem dados"
}

type IndiceGovernancaResumo struct {
	Excelentes int `json:"excelentes"`
	Regulares  int `json:"regulares"`
	Criticas   int `json:"criticas"`
	SemDados   int `json:"sem_dados"`
}

type IndiceGovernancaPayload struct {
	TotalEscolas int                      `json:"total_escolas"`
	Resumo       IndiceGovernancaResumo   `json:"resumo"`
	Escolas      []IndiceGovernancaEscola `json:"escolas"`
}

func (app *application) writeIndiceGovernancaPayload(w http.ResponseWriter, payload IndiceGovernancaPayload) error {
	return app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: payload})
}

const indiceGovernancaSelectSQL = `
	WITH prodep_agg AS (
		SELECT
			school_id,
			BOOL_OR(status_prestacao_contas = 'ok') AS prestacao_contas_ok
		FROM prodep_repasses
		WHERE usar_na_carga = true AND school_id IS NOT NULL
		GROUP BY school_id
	), latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id, id AS census_id, status, data
		FROM census_responses
		WHERE status = 'completed'
		ORDER BY school_id, updated_at DESC, id DESC
	)
	SELECT
		s.id,
		s.codigo_inep,
		COALESCE(NULLIF(TRIM(s.nome_escola), ''), 'Sem nome') AS escola,
		COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
		COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado') AS municipio,
		(cr.census_id IS NOT NULL) AS has_censo,
		COALESCE(cr.data->>'conselho_escolar' = 'Sim', false) AS conselho_escolar,
		COALESCE(cr.data->>'conselho_ativo' = 'Sim', false) AS conselho_ativo,
		COALESCE(cr.data->>'regularizada_cee' = 'Sim', false) AS regularizada_cee,
		COALESCE(cr.data->>'gremio_estudantil' = 'Sim', false) AS gremio_estudantil,
		COALESCE(p.prestacao_contas_ok, false) AS prestacao_contas_ok
	FROM schools s
	LEFT JOIN latest_census cr ON cr.school_id = s.id
	LEFT JOIN prodep_agg p ON p.school_id = s.id
	WHERE ($1 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($1)))
	  AND ($2 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($3)))
`

func (app *application) AdminAnalyticsGovernancaIndiceEscolas(w http.ResponseWriter, r *http.Request) {
	filters := parseGovernancaInstitucionalFilters(r.URL.Query())

	rows, err := app.models.Schools.DB.QueryContext(r.Context(), indiceGovernancaSelectSQL, filters.args()...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao consultar indice de governanca: %w", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var escolas []IndiceGovernancaEscola
	var resumo IndiceGovernancaResumo

	for rows.Next() {
		var e IndiceGovernancaEscola
		if err := rows.Scan(
			&e.SchoolID,
			&e.CodigoINEP,
			&e.Escola,
			&e.DRE,
			&e.Municipio,
			&e.HasCenso,
			&e.ConselhoEscolar,
			&e.ConselhoAtivo,
			&e.RegularizadaCEE,
			&e.GremioEstudantil,
			&e.PrestacaoContasOK,
		); err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao ler indice de governanca: %w", err), http.StatusInternalServerError)
			return
		}

		if !e.HasCenso {
			e.Status = "Sem dados"
			resumo.SemDados++
		} else {
			score := 0
			if e.ConselhoEscolar {
				score++
			}
			if e.ConselhoAtivo {
				score++
			}
			if e.RegularizadaCEE {
				score++
			}
			if e.GremioEstudantil {
				score++
			}
			if e.PrestacaoContasOK {
				score++
			}
			e.Score = score

			if score >= 4 {
				e.Status = "Excelente"
				resumo.Excelentes++
			} else if score >= 2 {
				e.Status = "Regular"
				resumo.Regulares++
			} else {
				e.Status = "Crítico"
				resumo.Criticas++
			}
		}
		escolas = append(escolas, e)
	}

	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro na iteracao do indice de governanca: %w", err), http.StatusInternalServerError)
		return
	}

	// Ordena por score decrescente, e escolas sem dados pro final
	sort.SliceStable(escolas, func(i, j int) bool {
		if escolas[i].Status == "Sem dados" && escolas[j].Status != "Sem dados" {
			return false
		}
		if escolas[i].Status != "Sem dados" && escolas[j].Status == "Sem dados" {
			return true
		}
		if escolas[i].Score != escolas[j].Score {
			return escolas[i].Score > escolas[j].Score
		}
		return escolas[i].Escola < escolas[j].Escola
	})

	// Se não houver itens, para que serialize como array vazio e não null:
	if escolas == nil {
		escolas = []IndiceGovernancaEscola{}
	}

	payload := IndiceGovernancaPayload{
		TotalEscolas: len(escolas),
		Resumo:       resumo,
		Escolas:      escolas,
	}

	if err := app.writeIndiceGovernancaPayload(w, payload); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao serializar indice de governanca: %w", err), http.StatusInternalServerError)
	}
}
