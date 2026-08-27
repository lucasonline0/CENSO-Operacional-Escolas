package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

func canonicalCensusListWhereSQL() string {
	dreFilter := `(
		$8 > 0 AND ` + schoolDREAuthorizationPredicate("s", "$8", "$3") + `
		OR $8 = 0 AND ($3 = '' OR ` + schoolDRENamePredicate("s", "$3") + `)
	)`
	dreSearch := schoolDRENameExpr("s")
	return `
	WHERE ($1 = '' OR cr.status = $1)
	  AND ($2 = 0 OR cr.year = $2)
	  AND ` + dreFilter + `
	  AND ($4 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($5)))
	  AND ($6 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($6))
	      ))
	  AND ($7 = ''
	       OR s.nome_escola ILIKE '%' || $7 || '%'
	       OR s.codigo_inep ILIKE '%' || $7 || '%'
	       OR s.municipio ILIKE '%' || $7 || '%'
	       OR ` + dreSearch + ` ILIKE '%' || $7 || '%'
	       OR cr.status ILIKE '%' || $7 || '%'
	       OR cr.year::text ILIKE '%' || $7 || '%')`
}

func canonicalCensusWhereArgs(p censusListParams, scope AdminAccessScope) []any {
	dreID := 0
	if scope.Role == RoleDRE {
		dreID = scope.DREID
	}
	return []any{p.Status, p.Year, p.DRE, p.Municipio, p.Zona, p.RegiaoIntegracao, p.Search, dreID}
}

func canonicalCensusSummarySQL() string {
	dreFilter := `(
		$6 > 0 AND ` + schoolDREAuthorizationPredicate("s", "$6", "$2") + `
		OR $6 = 0 AND ($2 = '' OR ` + schoolDRENamePredicate("s", "$2") + `)
	)`
	return `
	SELECT
		(SELECT COUNT(*)
		 FROM schools s
		 WHERE ` + dreFilter + `
		   AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
		   AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
		   AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
		         SELECT UPPER(TRIM(municipio))
		         FROM reg_integracao
		         WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
		       ))),
		COUNT(*) FILTER (WHERE cr.status = 'completed'),
		COUNT(*) FILTER (WHERE cr.status = 'draft'),
		COUNT(*) FILTER (WHERE cr.status = 'completed' AND cr.sheet_synced_at IS NULL)
	FROM census_responses cr
	JOIN schools s ON s.id = cr.school_id
	WHERE ($1 = 0 OR cr.year = $1)
	  AND ` + dreFilter + `
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))`
}

// AdminGetCensusCanonical é o caminho roteado da lista. A autorização de DRE
// usa a identidade runtime por ID; filtros administrativos por nome são
// resolvidos contra a entidade mestre e o vínculo canônico.
func (app *application) AdminGetCensusCanonical(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB
	scope, _ := GetAdminAccessScope(ctx)

	p := parseCensusListParams(r.URL.Query())
	if scope.Role == RoleDRE {
		p.DRE = strings.TrimSpace(scope.DRE)
	}
	whereArgs := canonicalCensusWhereArgs(p, scope)
	whereSQL := canonicalCensusListWhereSQL()

	countSQL := `SELECT COUNT(*) FROM census_responses cr JOIN schools s ON s.id = cr.school_id` + whereSQL
	var total int
	if err := db.QueryRowContext(ctx, countSQL, whereArgs...).Scan(&total); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao contar censos"), http.StatusInternalServerError)
		return
	}

	dreName := schoolDRENameExpr("s")
	selectSQL := `
		SELECT cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio,
			` + dreName + ` AS dre, cr.year, cr.status, cr.updated_at,
			(cr.sheet_synced_at IS NOT NULL)
		FROM census_responses cr
		JOIN schools s ON s.id = cr.school_id` + whereSQL + `
		ORDER BY cr.updated_at DESC
		LIMIT $9 OFFSET $10`
	offset := (p.Page - 1) * p.Limit
	rows, err := db.QueryContext(ctx, selectSQL, append(whereArgs, p.Limit, offset)...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao listar censos"), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	results := make([]CensusRow, 0)
	for rows.Next() {
		var c CensusRow
		if err := rows.Scan(&c.CensusID, &c.SchoolID, &c.Nome, &c.INEP, &c.Municipio,
			&c.Dre, &c.Year, &c.Status, &c.UpdatedAt, &c.Synced); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
		results = append(results, c)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	dreID := 0
	if scope.Role == RoleDRE {
		dreID = scope.DREID
	}
	var summary CensusSummary
	if err := db.QueryRowContext(ctx, canonicalCensusSummarySQL(),
		p.Year, p.DRE, p.Municipio, p.Zona, p.RegiaoIntegracao, dreID).Scan(
		&summary.TotalSchools, &summary.CompletedCensuses,
		&summary.DraftCensuses, &summary.PendingSync); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao resumir censos"), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: CensusPageResponse{
		Rows: results, Total: total, Page: p.Page, Limit: p.Limit, Summary: summary,
	}})
}

// AdminGetCensusByIDCanonical elimina a BOLA textual do caminho ativo. Em
// schema canônico, ausência ou mismatch de dre_id falha fechado. O booleano
// canonical_mode permite que o CI pré-0020 continue exercitando o contrato
// legado sem mascarar órfãos em bancos já migrados.
func (app *application) AdminGetCensusByIDCanonical(w http.ResponseWriter, r *http.Request) {
	scope, _ := GetAdminAccessScope(r.Context())

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id <= 0 {
		app.errorJSON(w, fmt.Errorf("id inválido"), http.StatusBadRequest)
		return
	}

	var c CensusFullRecord
	var rawData []byte
	var targetDREID int
	var canonicalMode bool
	dreName := schoolDRENameExpr("s")
	dreID := schoolDREIDExpr("s")
	err = app.models.Schools.DB.QueryRowContext(r.Context(), `
		SELECT cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio,
		       `+dreName+` AS dre, `+dreID+` AS dre_id,
		       `+canonicalSchoolDREColumnSQL+` AS canonical_mode,
		       cr.year, cr.status, cr.data, cr.created_at, cr.updated_at,
		       (cr.sheet_synced_at IS NOT NULL)
		FROM census_responses cr
		JOIN schools s ON s.id = cr.school_id
		WHERE cr.id = $1`, id).Scan(
		&c.CensusID, &c.SchoolID, &c.Nome, &c.INEP, &c.Municipio, &c.Dre, &targetDREID, &canonicalMode,
		&c.Year, &c.Status, &rawData, &c.CreatedAt, &c.UpdatedAt, &c.Synced,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("censo não encontrado"), http.StatusNotFound)
		return
	}

	if scope.Role == RoleDRE && canonicalMode {
		if scope.DREID <= 0 || targetDREID <= 0 || !scope.IsAuthorizedForDREID(targetDREID) {
			app.errorJSON(w, fmt.Errorf("acesso não permitido para esta DRE"), http.StatusForbidden)
			return
		}
	} else if !scope.IsAuthorizedForDRE(c.Dre) {
		app.errorJSON(w, fmt.Errorf("acesso não permitido para esta DRE"), http.StatusForbidden)
		return
	}

	c.Data = json.RawMessage(rawData)
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: c})
}
