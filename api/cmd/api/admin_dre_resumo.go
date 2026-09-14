package main

import (
	"database/sql"
	"fmt"
	"net/http"
)

// DRESummaryPayload reúne os indicadores operacionais essenciais de uma DRE.
// O total de alunos considera apenas censos concluídos no ano de referência;
// adesão = escolas com censo concluído / total de escolas vinculadas.
type DRESummaryPayload struct {
	DREID                     int     `json:"dre_id"`
	DRE                       string  `json:"dre"`
	AnoReferencia             int     `json:"ano_referencia"`
	TotalEscolas              int     `json:"total_escolas"`
	TotalAlunos               float64 `json:"total_alunos"`
	CensusAdherencePercentage int     `json:"census_adherence_percentage"`
}

// Em schema pós-0020 o vínculo é exclusivamente schools.dre_id -> dres.id. O
// ramo textual existe apenas para o schema de transição do CI enquanto #210
// ainda não aplica 0020 no bootstrap compartilhado.
const dreSummarySelectSQL = `
	WITH target_dre AS (
		SELECT id, TRIM(nome) AS nome
		FROM dres
		WHERE id = $1
	),
	latest_census AS (
		SELECT DISTINCT ON (cr.school_id)
			cr.school_id,
			cr.status,
			cr.data
		FROM census_responses cr
		WHERE cr.year = $2
		ORDER BY cr.school_id, cr.updated_at DESC, cr.id DESC
	)
	SELECT
		d.id,
		d.nome,
		COUNT(s.id) AS total_escolas,
		COALESCE(SUM(
			CASE
				WHEN cr.status = 'completed'
				 AND cr.data->>'total_alunos' ~ '^[0-9]+(\.[0-9]+)?$'
				THEN (cr.data->>'total_alunos')::numeric
				ELSE 0
			END
		), 0)::float8 AS total_alunos,
		COUNT(s.id) FILTER (WHERE cr.status = 'completed') AS completed
	FROM target_dre d
	LEFT JOIN schools s
	  ON CASE
		WHEN EXISTS (
			SELECT 1 FROM pg_attribute
			WHERE attrelid = to_regclass('schools')
			  AND attname = 'dre_id'
			  AND NOT attisdropped
		) THEN NULLIF(to_jsonb(s)->>'dre_id', '')::int = d.id
		ELSE UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome))
	  END
	LEFT JOIN latest_census cr ON cr.school_id = s.id
	GROUP BY d.id, d.nome
`

func buildDRESummaryPayload(dreID int, dre string, year, totalSchools int, totalStudents float64, completed int) DRESummaryPayload {
	return DRESummaryPayload{
		DREID:                     dreID,
		DRE:                       dre,
		AnoReferencia:             year,
		TotalEscolas:              totalSchools,
		TotalAlunos:               totalStudents,
		CensusAdherencePercentage: completionPercentage(completed, totalSchools),
	}
}

// AdminDRESummary retorna o resumo operacional de uma DRE da entidade mestre.
// Mantém o endpoint restrito a administradores, como o restante da gestão de
// DREs. DRE inativa continua consultável; somente ID inexistente retorna 404.
func (app *application) AdminDRESummary(w http.ResponseWriter, r *http.Request) {
	if !app.requireAdminDREManagement(w, r) {
		return
	}

	dreID, err := parsePositiveRouteID(r, "id", "ID de DRE")
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	year := parseAnalyticsFilters(r).Year
	var dreName string
	var totalSchools, completed int
	var totalStudents float64

	err = app.models.Schools.DB.QueryRowContext(r.Context(), dreSummarySelectSQL, dreID, year).Scan(
		&dreID,
		&dreName,
		&totalSchools,
		&totalStudents,
		&completed,
	)
	if err == sql.ErrNoRows {
		app.errorJSON(w, fmt.Errorf("DRE não encontrada"), http.StatusNotFound)
		return
	}
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao consultar resumo da DRE: %w", err), http.StatusInternalServerError)
		return
	}

	payload := buildDRESummaryPayload(dreID, dreName, year, totalSchools, totalStudents, completed)
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: payload})
}
