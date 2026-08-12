package main

import (
	"context"
	"fmt"
)

// =====================================================================
// Relatório gerencial — Gestão Financeira e Governança
// =====================================================================
// Exporta, sem paginação, todas as escolas do recorte com o panorama
// detalhado de Gestão Financeira (repasses PRODEP) e Governança
// Institucional (Conselho Escolar, regularização no CEE).
// =====================================================================

var financeiroGovernancaReportColumns = []string{
	"Região de Integração",
	"DRE",
	"Município",
	"Zona",
	"Código INEP",
	"Escola",
	"Status do Censo",
	"Regularizada CEE",
	"Conselho Escolar",
	"Conselho Ativo",
	"Total Recebido (PRODEP)",
	"Total Reprogramado (PRODEP)",
	"% Reprogramado",
}

const financeiroGovernancaSelectSQL = `
	WITH prodep_agg AS (
		SELECT
			school_id,
			SUM(valor_recebido) AS total_recebido,
			SUM(valor_reprogramado) AS total_reprogramado
		FROM prodep_repasses
		WHERE usar_na_carga = true
		  AND ($1 = 0 OR ano = $1)
		  AND school_id IS NOT NULL
		GROUP BY school_id
	), latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id, id AS census_id, status, year, updated_at, sheet_synced_at
		FROM census_responses
		WHERE ($1 = 0 OR year = $1)
		ORDER BY school_id, updated_at DESC, id DESC
	)
	SELECT
		COALESCE(ri.regiao_de_integracao, '') AS regiao_integracao,
		COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
		COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado') AS municipio,
		COALESCE(NULLIF(TRIM(s.zona), ''), '') AS zona,
		COALESCE(s.codigo_inep, '') AS codigo_inep,
		COALESCE(NULLIF(TRIM(s.nome_escola), ''), 'Sem nome') AS nome_escola,
		(cr.census_id IS NOT NULL) AS has_censo,
		COALESCE(cr.status, '') AS status_censo,
		(cr.sheet_synced_at IS NOT NULL) AS synced,
		COALESCE(NULLIF(gov.regularizada_cee, ''), '') AS regularizada_cee,
		COALESCE(NULLIF(gov.conselho_escolar, ''), '') AS conselho_escolar,
		COALESCE(NULLIF(gov.conselho_ativo, ''), '') AS conselho_ativo,
		COALESCE(p.total_recebido, 0)::float8 AS total_recebido,
		COALESCE(p.total_reprogramado, 0)::float8 AS total_reprogramado
	FROM schools s
	LEFT JOIN latest_census cr ON cr.school_id = s.id
	LEFT JOIN vw_censo_governanca_institucional gov ON gov.census_id = cr.census_id
	LEFT JOIN prodep_agg p ON p.school_id = s.id
	LEFT JOIN reg_integracao ri ON UPPER(TRIM(ri.municipio)) = UPPER(TRIM(s.municipio))
	WHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))
	  AND ($6 = 0 OR s.id = $6)
	  AND ($7 = '' OR UPPER(TRIM(COALESCE(s.codigo_inep, ''))) = UPPER(TRIM($7)))
	ORDER BY
		UPPER(TRIM(s.dre)),
		UPPER(TRIM(s.municipio)),
		UPPER(TRIM(s.nome_escola)),
		s.codigo_inep
`

func (app *application) buildFinanceiroGovernancaReportData(ctx context.Context, def ReportDefinition, f reportFilters) (reportData, error) {
	dbRows, err := app.models.Schools.DB.QueryContext(ctx, financeiroGovernancaSelectSQL, f.scopedArgs()...)
	if err != nil {
		return reportData{}, fmt.Errorf("consultar financeiro governanca: %w", err)
	}
	defer dbRows.Close()

	var data [][]any
	for dbRows.Next() {
		var (
			regiao, dre, municipio, zona, inep, escola string
			hasCenso, synced                           bool
			statusCenso                                string
			regularizada, conselho, conselhoAtivo      string
			totalRecebido, totalReprogramado           float64
		)

		if err := dbRows.Scan(
			&regiao, &dre, &municipio, &zona, &inep, &escola,
			&hasCenso, &statusCenso, &synced,
			&regularizada, &conselho, &conselhoAtivo,
			&totalRecebido, &totalReprogramado,
		); err != nil {
			return reportData{}, fmt.Errorf("ler linha financeiro governanca: %w", err)
		}

		isCompleted := hasCenso && statusCenso == "completed"
		statusLabel := censoStatusLabel(statusCenso, hasCenso, synced)

		// Calculates percentage
		var pct float64
		if totalRecebido > 0 {
			pct = round2(totalReprogramado / totalRecebido * 100)
		}

		cells := []any{
			regiao,
			dre,
			municipio,
			zona,
			inep,
			escola,
			statusLabel,
			reportTextCell(isCompleted, regularizada),
			reportTextCell(isCompleted, conselho),
			reportTextCell(isCompleted, conselhoAtivo),
			totalRecebido,
			totalReprogramado,
			pct,
		}

		data = append(data, cells)
	}
	if err := dbRows.Err(); err != nil {
		return reportData{}, fmt.Errorf("iterar linhas financeiro governanca: %w", err)
	}

	return reportData{
		Title:       def.Title,
		SheetName:   def.SheetName,
		FiltersLine: f.describe(),
		Headers:     financeiroGovernancaReportColumns,
		Rows:        data,
	}, nil
}
