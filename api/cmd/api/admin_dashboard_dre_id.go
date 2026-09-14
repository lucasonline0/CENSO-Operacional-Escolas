package main

import (
	"fmt"
	"net/http"
	"strings"
)

// AdminDashboardCanonical é o caminho canônico do dashboard. Em schema
// pós-0020, autorização e agrupamento usam schools.dre_id -> dres.id; o nome
// textual é apenas o valor de apresentação retornado pela entidade mestre.
func (app *application) AdminDashboardCanonical(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB
	scope, _ := GetAdminAccessScope(ctx)
	s := DashboardStats{ByDre: []DreStats{}, Recent: []CensusRow{}}
	dreName := schoolDRENameExpr("s")

	if scope.Role == RoleDRE {
		auth := schoolDREAuthorizationPredicate("s", "$1", "$2")
		args := []any{scope.DREID, strings.TrimSpace(scope.DRE)}

		err := db.QueryRowContext(ctx, `
			SELECT
				(SELECT COUNT(*) FROM schools s WHERE `+auth+`),
				COUNT(*) FILTER (WHERE cr.status = 'completed' AND `+auth+`),
				COUNT(*) FILTER (WHERE cr.status = 'draft' AND `+auth+`),
				COUNT(*) FILTER (WHERE cr.status = 'completed' AND cr.sheet_synced_at IS NULL AND `+auth+`)
			FROM census_responses cr
			JOIN schools s ON s.id = cr.school_id`, args...).Scan(
			&s.TotalSchools, &s.CompletedCensuses, &s.DraftCensuses, &s.PendingSync)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao buscar totais"), http.StatusInternalServerError)
			return
		}

		rows, err := db.QueryContext(ctx, `
			WITH scoped_schools AS (
				SELECT s.id, `+dreName+` AS dre
				FROM schools s
				WHERE `+auth+`
			)
			SELECT ss.dre,
				COUNT(DISTINCT ss.id) AS total,
				COUNT(DISTINCT ss.id) FILTER (WHERE cr.status = 'completed') AS completed,
				COUNT(DISTINCT ss.id) FILTER (WHERE cr.status = 'draft') AS draft
			FROM scoped_schools ss
			LEFT JOIN census_responses cr ON cr.school_id = ss.id
			GROUP BY ss.dre
			ORDER BY ss.dre`, args...)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao buscar por DRE"), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var d DreStats
			if err := rows.Scan(&d.Dre, &d.Total, &d.Completed, &d.Draft); err != nil {
				app.errorJSON(w, err, http.StatusInternalServerError)
				return
			}
			s.ByDre = append(s.ByDre, d)
		}
		if err := rows.Err(); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}

		rows2, err := db.QueryContext(ctx, `
			SELECT cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio,
				`+dreName+` AS dre, cr.year, cr.status, cr.updated_at,
				(cr.sheet_synced_at IS NOT NULL)
			FROM census_responses cr
			JOIN schools s ON s.id = cr.school_id
			WHERE `+auth+`
			ORDER BY cr.updated_at DESC
			LIMIT 50`, args...)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao buscar censos recentes"), http.StatusInternalServerError)
			return
		}
		defer rows2.Close()
		for rows2.Next() {
			var c CensusRow
			if err := rows2.Scan(&c.CensusID, &c.SchoolID, &c.Nome, &c.INEP, &c.Municipio,
				&c.Dre, &c.Year, &c.Status, &c.UpdatedAt, &c.Synced); err != nil {
				app.errorJSON(w, err, http.StatusInternalServerError)
				return
			}
			s.Recent = append(s.Recent, c)
		}
		if err := rows2.Err(); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
	} else {
		err := db.QueryRowContext(ctx, `
			SELECT
				(SELECT COUNT(*) FROM schools),
				COUNT(*) FILTER (WHERE cr.status = 'completed'),
				COUNT(*) FILTER (WHERE cr.status = 'draft'),
				COUNT(*) FILTER (WHERE cr.status = 'completed' AND cr.sheet_synced_at IS NULL)
			FROM census_responses cr`).Scan(
			&s.TotalSchools, &s.CompletedCensuses, &s.DraftCensuses, &s.PendingSync)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao buscar totais"), http.StatusInternalServerError)
			return
		}

		rows, err := db.QueryContext(ctx, `
			WITH canonical_schools AS (
				SELECT s.id, `+dreName+` AS dre
				FROM schools s
			)
			SELECT cs.dre,
				COUNT(DISTINCT cs.id) AS total,
				COUNT(DISTINCT cs.id) FILTER (WHERE cr.status = 'completed') AS completed,
				COUNT(DISTINCT cs.id) FILTER (WHERE cr.status = 'draft') AS draft
			FROM canonical_schools cs
			LEFT JOIN census_responses cr ON cr.school_id = cs.id
			GROUP BY cs.dre
			ORDER BY cs.dre`)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao buscar por DRE"), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var d DreStats
			if err := rows.Scan(&d.Dre, &d.Total, &d.Completed, &d.Draft); err != nil {
				app.errorJSON(w, err, http.StatusInternalServerError)
				return
			}
			s.ByDre = append(s.ByDre, d)
		}
		if err := rows.Err(); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}

		rows2, err := db.QueryContext(ctx, `
			SELECT cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio,
				`+dreName+` AS dre, cr.year, cr.status, cr.updated_at,
				(cr.sheet_synced_at IS NOT NULL)
			FROM census_responses cr
			JOIN schools s ON s.id = cr.school_id
			ORDER BY cr.updated_at DESC
			LIMIT 50`)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao buscar censos recentes"), http.StatusInternalServerError)
			return
		}
		defer rows2.Close()
		for rows2.Next() {
			var c CensusRow
			if err := rows2.Scan(&c.CensusID, &c.SchoolID, &c.Nome, &c.INEP, &c.Municipio,
				&c.Dre, &c.Year, &c.Status, &c.UpdatedAt, &c.Synced); err != nil {
				app.errorJSON(w, err, http.StatusInternalServerError)
				return
			}
			s.Recent = append(s.Recent, c)
		}
		if err := rows2.Err(); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: s})
}
