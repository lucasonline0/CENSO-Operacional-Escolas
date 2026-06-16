package main

import (
	"context"
	"database/sql"
	"fmt"
)

// =====================================================================
// Relatório gerencial — Condições da Merenda Escolar
// =====================================================================
// Exporta, sem paginação, todas as escolas do recorte com a oferta, a
// qualidade, as condições da cozinha, os equipamentos e um Status
// Operacional simples para priorização. Escolas sem censo concluído no
// ano permanecem no recorte e aparecem como "Sem dados".
//
// Fonte: schools s LEFT JOIN census_responses cr (cr.year = $1 AND
// cr.status = 'completed') + LEFT JOIN reg_integracao. Os filtros globais
// incidem sobre schools s. Campos do JSONB são lidos com NULLIF/cast
// seguro, conforme a convenção do projeto.
//
// Observação de mapeamento: o censo registra o estoque de EPIs e
// extintores num único campo (estoque_epi_extintor: Completo/Parcial/
// Inexistente). Por isso as colunas "EPIs" e "Extintores" refletem esse
// mesmo campo, enquanto "Manutenção Preventiva" usa manutencao_extintores
// (Está na validade/Validade vencida).
// =====================================================================

// merendaReportColumns são os cabeçalhos do relatório, na ordem exigida pela
// especificação.
var merendaReportColumns = []string{
	"Região de Integração",
	"DRE",
	"Município",
	"Zona",
	"Código INEP",
	"Escola",
	"Oferta Regular",
	"Qualidade da Merenda",
	"Atende Necessidades",
	"Condições da Cozinha",
	"Tamanho da Cozinha",
	"Possui Refeitório",
	"Refeitório Adequado",
	"Freezers",
	"Geladeiras",
	"Fogões",
	"Bebedouros",
	"Despensa Exclusiva",
	"Depósito de Conserva",
	"EPIs",
	"Extintores",
	"Manutenção Preventiva",
	"Status Operacional",
}

// merendaReportRow guarda os valores brutos de uma escola, já de-NULLificados
// (categóricos como "" quando ausentes), para classificação e projeção.
type merendaReportRow struct {
	Regiao    string
	DRE       string
	Municipio string
	Zona      string
	INEP      string
	Escola    string

	HasCensus bool

	OfertaRegular      string
	QualidadeMerenda   string
	AtendeNecessidades string
	CondicoesCozinha   string
	TamanhoCozinha     string
	PossuiRefeitorio   string
	RefeitorioAdequado string
	QtdFreezers        sql.NullFloat64
	QtdGeladeiras      sql.NullFloat64
	QtdFogoes          sql.NullFloat64
	QtdBebedouros      sql.NullFloat64
	DespensaExclusiva  string
	DepositoConserva   string
	EstoqueEpiExtintor string
	ManutencaoExtint   string
}

// classifyMerendaStatus classifica o Status Operacional de Merenda, conforme a
// tabela documentada na especificação. Critérios (defensivos, só disparam em
// valores conhecidos):
//
//	Sem censo concluído                              -> Sem dados
//	Crítico (qualquer um):
//	  - sem oferta regular (oferta_regular = "Não")
//	  - não atende necessidades (atende_necessidades = "Não")
//	  - cozinha ruim/precária (condicoes_cozinha = "Precária")
//	Atenção (qualquer um):
//	  - oferta com falhas
//	  - qualidade da merenda Regular ou Ruim
//	  - atende necessidades apenas Parcialmente
//	  - condições da cozinha Regular
//	  - refeitório inadequado (refeitorio_adequado = "Não")
//	  - equipamentos insuficientes (sem refrigeração: 0 freezers e 0 geladeiras,
//	    ou estoque de EPI/extintor inexistente)
//	Sem problema relevante                           -> Adequado
func classifyMerendaStatus(r merendaReportRow) string {
	if !r.HasCensus {
		return statusOperacionalSemDados
	}
	if isMerendaCritico(r) {
		return statusOperacionalCritico
	}
	if isMerendaAtencao(r) {
		return statusOperacionalAtencao
	}
	return statusOperacionalAdequado
}

func isMerendaCritico(r merendaReportRow) bool {
	if r.OfertaRegular == "Não" {
		return true
	}
	if r.AtendeNecessidades == "Não" {
		return true
	}
	if r.CondicoesCozinha == "Precária" {
		return true
	}
	return false
}

func isMerendaAtencao(r merendaReportRow) bool {
	if r.OfertaRegular == "Sim, com falhas" {
		return true
	}
	switch r.QualidadeMerenda {
	case "Regular", "Ruim":
		return true
	}
	if r.AtendeNecessidades == "Parcialmente" {
		return true
	}
	if r.CondicoesCozinha == "Regular" {
		return true
	}
	if r.RefeitorioAdequado == "Não" {
		return true
	}
	if merendaSemRefrigeracao(r) {
		return true
	}
	if r.EstoqueEpiExtintor == "Inexistente" {
		return true
	}
	return false
}

// merendaSemRefrigeracao indica ausência de refrigeração quando tanto freezers
// quanto geladeiras são conhecidos e iguais a zero. Quantidades ausentes (NULL)
// não disparam o sinal — defensivo, não infla a criticidade.
func merendaSemRefrigeracao(r merendaReportRow) bool {
	return r.QtdFreezers.Valid && r.QtdFreezers.Float64 == 0 &&
		r.QtdGeladeiras.Valid && r.QtdGeladeiras.Float64 == 0
}

// merendaSelectSQL parte de schools s, com LEFT JOIN na resposta do ano
// (status='completed') para manter escolas sem censo no recorte, e LEFT JOIN em
// reg_integracao para a Região de Integração. Filtros globais incidem sobre
// schools s. Não pagina; a ordenação final por prioridade operacional é em Go.
//
// $1=year (sempre específico), $2=dre, $3=municipio, $4=zona, $5=regiao.
const merendaSelectSQL = `
	SELECT
		COALESCE(ri.regiao_de_integracao, '') AS regiao_integracao,
		COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
		COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado') AS municipio,
		COALESCE(NULLIF(TRIM(s.zona), ''), '') AS zona,
		COALESCE(s.codigo_inep, '') AS codigo_inep,
		COALESCE(NULLIF(TRIM(s.nome_escola), ''), 'Sem nome') AS nome_escola,
		(cr.id IS NOT NULL) AS has_censo,
		COALESCE(NULLIF(cr.data->>'oferta_regular', ''), '')      AS oferta_regular,
		COALESCE(NULLIF(cr.data->>'qualidade_merenda', ''), '')   AS qualidade_merenda,
		COALESCE(NULLIF(cr.data->>'atende_necessidades', ''), '') AS atende_necessidades,
		COALESCE(NULLIF(cr.data->>'condicoes_cozinha', ''), '')   AS condicoes_cozinha,
		COALESCE(NULLIF(cr.data->>'tamanho_cozinha', ''), '')     AS tamanho_cozinha,
		COALESCE(NULLIF(cr.data->>'possui_refeitorio', ''), '')   AS possui_refeitorio,
		COALESCE(NULLIF(cr.data->>'refeitorio_adequado', ''), '') AS refeitorio_adequado,
		CASE WHEN cr.data->>'qtd_freezers' ~ '^-?[0-9]+(\.[0-9]+)?$'
			 THEN (cr.data->>'qtd_freezers')::numeric END         AS qtd_freezers,
		CASE WHEN cr.data->>'qtd_geladeiras' ~ '^-?[0-9]+(\.[0-9]+)?$'
			 THEN (cr.data->>'qtd_geladeiras')::numeric END       AS qtd_geladeiras,
		CASE WHEN cr.data->>'qtd_fogoes' ~ '^-?[0-9]+(\.[0-9]+)?$'
			 THEN (cr.data->>'qtd_fogoes')::numeric END           AS qtd_fogoes,
		CASE WHEN cr.data->>'qtd_bebedouros' ~ '^-?[0-9]+(\.[0-9]+)?$'
			 THEN (cr.data->>'qtd_bebedouros')::numeric END       AS qtd_bebedouros,
		COALESCE(NULLIF(cr.data->>'despensa_exclusiva', ''), '')   AS despensa_exclusiva,
		COALESCE(NULLIF(cr.data->>'deposito_conserva', ''), '')    AS deposito_conserva,
		COALESCE(NULLIF(cr.data->>'estoque_epi_extintor', ''), '')  AS estoque_epi_extintor,
		COALESCE(NULLIF(cr.data->>'manutencao_extintores', ''), '') AS manutencao_extintores
	FROM schools s
	LEFT JOIN census_responses cr
		ON cr.school_id = s.id AND cr.year = $1 AND cr.status = 'completed'
	LEFT JOIN reg_integracao ri ON UPPER(TRIM(ri.municipio)) = UPPER(TRIM(s.municipio))
	WHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))
	ORDER BY
		UPPER(TRIM(s.dre)),
		UPPER(TRIM(s.municipio)),
		UPPER(TRIM(s.nome_escola)),
		s.codigo_inep
`

// buildMerendaReportData executa a consulta, classifica o Status Operacional de
// cada escola, ordena por prioridade operacional e projeta as colunas do XLSX.
// Não pagina.
func (app *application) buildMerendaReportData(ctx context.Context, def ReportDefinition, f reportFilters) (reportData, error) {
	dbRows, err := app.models.Schools.DB.QueryContext(ctx, merendaSelectSQL, f.args()...)
	if err != nil {
		return reportData{}, fmt.Errorf("consultar merenda: %w", err)
	}
	defer dbRows.Close()

	rows := make([]reportOperacionalRow, 0)
	for dbRows.Next() {
		var r merendaReportRow
		if err := dbRows.Scan(
			&r.Regiao, &r.DRE, &r.Municipio, &r.Zona, &r.INEP, &r.Escola,
			&r.HasCensus,
			&r.OfertaRegular, &r.QualidadeMerenda, &r.AtendeNecessidades,
			&r.CondicoesCozinha, &r.TamanhoCozinha, &r.PossuiRefeitorio, &r.RefeitorioAdequado,
			&r.QtdFreezers, &r.QtdGeladeiras, &r.QtdFogoes, &r.QtdBebedouros,
			&r.DespensaExclusiva, &r.DepositoConserva, &r.EstoqueEpiExtintor, &r.ManutencaoExtint,
		); err != nil {
			return reportData{}, fmt.Errorf("ler linha merenda: %w", err)
		}

		status := classifyMerendaStatus(r)

		cells := []any{
			r.Regiao,
			r.DRE,
			r.Municipio,
			r.Zona,
			r.INEP,
			r.Escola,
			reportTextCell(r.HasCensus, r.OfertaRegular),
			reportTextCell(r.HasCensus, r.QualidadeMerenda),
			reportTextCell(r.HasCensus, r.AtendeNecessidades),
			reportTextCell(r.HasCensus, r.CondicoesCozinha),
			reportTextCell(r.HasCensus, r.TamanhoCozinha),
			reportTextCell(r.HasCensus, r.PossuiRefeitorio),
			reportTextCell(r.HasCensus, r.RefeitorioAdequado),
			reportIntCell(r.HasCensus, r.QtdFreezers),
			reportIntCell(r.HasCensus, r.QtdGeladeiras),
			reportIntCell(r.HasCensus, r.QtdFogoes),
			reportIntCell(r.HasCensus, r.QtdBebedouros),
			reportTextCell(r.HasCensus, r.DespensaExclusiva),
			reportTextCell(r.HasCensus, r.DepositoConserva),
			reportTextCell(r.HasCensus, r.EstoqueEpiExtintor),
			reportTextCell(r.HasCensus, r.EstoqueEpiExtintor),
			reportTextCell(r.HasCensus, r.ManutencaoExtint),
			status,
		}

		rows = append(rows, reportOperacionalRow{
			Status:    status,
			DRE:       r.DRE,
			Municipio: r.Municipio,
			Escola:    r.Escola,
			INEP:      r.INEP,
			Cells:     cells,
		})
	}
	if err := dbRows.Err(); err != nil {
		return reportData{}, fmt.Errorf("iterar linhas merenda: %w", err)
	}

	sortReportOperacional(rows)

	data := make([][]any, 0, len(rows))
	for _, row := range rows {
		data = append(data, row.Cells)
	}

	return reportData{
		Title:       def.Title,
		SheetName:   def.SheetName,
		FiltersLine: f.describe(),
		Headers:     merendaReportColumns,
		Rows:        data,
	}, nil
}
