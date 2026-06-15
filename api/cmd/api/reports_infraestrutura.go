package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// =====================================================================
// Relatório gerencial — Infraestrutura, Energia e Segurança Escolar
// =====================================================================
// Exporta, sem paginação, todas as escolas do recorte com os campos de
// prédio, energia e segurança do censo e um Status Operacional simples
// para priorização. Escolas sem censo concluído no ano permanecem no
// recorte e aparecem como "Sem dados".
//
// Fonte: schools s LEFT JOIN census_responses cr (cr.year = $1 AND
// cr.status = 'completed') + LEFT JOIN reg_integracao. Os filtros globais
// incidem sobre schools s. Campos do JSONB são lidos com NULLIF/cast
// seguro, conforme a convenção do projeto. Não reutiliza endpoints
// analíticos: lê o JSONB diretamente para manter o relatório isolado.
// =====================================================================

// infraestruturaReportColumns são os cabeçalhos do relatório, na ordem exigida
// pela especificação.
var infraestruturaReportColumns = []string{
	"Região de Integração",
	"DRE",
	"Município",
	"Zona",
	"Código INEP",
	"Escola",
	"Tipo de Prédio",
	"Situação da Estrutura",
	"Necessita Reforma",
	"Reforma Crítica",
	"Obra Parada",
	"Rede Elétrica Atende",
	"Suporta Novos Equipamentos",
	"Energia",
	"Estrutura para Climatização",
	"Salas Climatizadas",
	"Salas Não Climatizadas",
	"Guarita",
	"Botão de Pânico",
	"Câmeras",
	"Controle de Portão",
	"Iluminação Externa",
	"Muro/Cerca",
	"Plano de Evacuação",
	"Política contra Bullying",
	"Status Operacional",
}

// Valores canônicos de situacao_estrutura relevantes para a classificação.
// Espelham as opções do formulário (web/src/schemas/steps/general-data.ts) e
// os scores da Saúde Operacional, sem duplicar a metodologia de pontuação.
const (
	situacaoReformaGeral   = "Necessita de reforma geral"
	situacaoObraParada     = "Está em reforma, porém a obra está parada"
	situacaoReformaParcial = "Necessita de reforma parcial (melhoria pontual)"
	situacaoReformaAndando = "Reforma em andamento"
	situacaoSemReforma     = "Não necessita de reforma."
	situacaoReformada      = "Foi reformada recentemente"
)

// infraReportRow guarda os valores brutos de uma escola, já de-NULLificados
// (categóricos como "" quando ausentes), para classificação e projeção.
type infraReportRow struct {
	Regiao    string
	DRE       string
	Municipio string
	Zona      string
	INEP      string
	Escola    string

	HasCensus bool

	TipoPredio            string
	SituacaoEstrutura     string
	RedeEletricaAtende    string
	SuportaNovosEquip     string
	Energia               string
	EstruturaClimatizacao string
	SalasClimatizadas     sql.NullFloat64
	QtdSalasAula          sql.NullFloat64
	PossuiGuarita         string
	BotaoPanico           string
	Cameras               string
	ControlePortao        string
	IluminacaoExterna     string
	MuroCerca             string
	PlanoEvacuacao        string
	PoliticaBullying      string
}

// infraNecessitaReforma deriva a coluna "Necessita Reforma" de situacao_estrutura.
// Defensiva: só responde "Sim"/"Não" para valores conhecidos; demais viram
// "Não informado".
func infraNecessitaReforma(situacao string) string {
	switch situacao {
	case situacaoReformaGeral, situacaoObraParada, situacaoReformaParcial, situacaoReformaAndando:
		return "Sim"
	case situacaoSemReforma, situacaoReformada:
		return "Não"
	default:
		return "Não informado"
	}
}

// infraReformaCritica indica se a estrutura está em condição crítica de reforma
// (necessita de reforma geral).
func infraReformaCritica(situacao string) string {
	if situacao == situacaoReformaGeral {
		return "Sim"
	}
	if situacao == "" {
		return "Não informado"
	}
	return "Não"
}

// infraObraParada indica se há obra de reforma parada.
func infraObraParada(situacao string) string {
	if situacao == situacaoObraParada {
		return "Sim"
	}
	if situacao == "" {
		return "Não informado"
	}
	return "Não"
}

// classifyInfraStatus classifica o Status Operacional de Infraestrutura,
// conforme a tabela documentada na especificação. Critérios (defensivos, só
// disparam em valores conhecidos):
//
//	Sem censo concluído                              -> Sem dados
//	Crítico (qualquer um):
//	  - estrutura: necessita de reforma geral
//	  - obra de reforma parada
//	  - rede elétrica não atende ("Não")
//	  - energia ausente (campo vazio)
//	Atenção (qualquer um):
//	  - estrutura: necessita de reforma parcial
//	  - rede elétrica atende parcialmente
//	  - sem estrutura de climatização ("Não" / "Não, somente com adequações")
//	  - câmeras "Não possui"
//	  - iluminação externa "Insuficiente"
//	  - sem muro/cerca ("Não possui")
//	Sem problema relevante                           -> Adequado
func classifyInfraStatus(r infraReportRow) string {
	if !r.HasCensus {
		return statusOperacionalSemDados
	}
	if isInfraCritico(r) {
		return statusOperacionalCritico
	}
	if isInfraAtencao(r) {
		return statusOperacionalAtencao
	}
	return statusOperacionalAdequado
}

func isInfraCritico(r infraReportRow) bool {
	switch r.SituacaoEstrutura {
	case situacaoReformaGeral, situacaoObraParada:
		return true
	}
	if r.RedeEletricaAtende == "Não" {
		return true
	}
	if strings.TrimSpace(r.Energia) == "" {
		return true
	}
	return false
}

func isInfraAtencao(r infraReportRow) bool {
	if r.SituacaoEstrutura == situacaoReformaParcial {
		return true
	}
	if r.RedeEletricaAtende == "Parcialmente" {
		return true
	}
	switch r.EstruturaClimatizacao {
	case "Não", "Não, somente com adequações":
		return true
	}
	if r.Cameras == "Não possui" {
		return true
	}
	if r.IluminacaoExterna == "Insuficiente" {
		return true
	}
	if r.MuroCerca == "Não possui" {
		return true
	}
	return false
}

// infraSalasNaoClimatizadas replica a regra da vw_censo_enriquecida: salas não
// climatizadas = max(qtd_salas_aula - salas_climatizadas, 0); NULL quando
// qtd_salas_aula é desconhecido (não infla o numerador artificialmente).
func infraSalasNaoClimatizadas(qtdSalas, salasClim sql.NullFloat64) sql.NullFloat64 {
	if !qtdSalas.Valid {
		return sql.NullFloat64{}
	}
	clim := 0.0
	if salasClim.Valid {
		clim = salasClim.Float64
	}
	diff := qtdSalas.Float64 - clim
	if diff < 0 {
		diff = 0
	}
	return sql.NullFloat64{Float64: diff, Valid: true}
}

// infraestruturaSelectSQL parte de schools s, com LEFT JOIN na resposta do ano
// (status='completed') para manter escolas sem censo no recorte, e LEFT JOIN em
// reg_integracao para a Região de Integração. Filtros globais incidem sobre
// schools s (UPPER(TRIM(...)) tolera caixa/espaços). Não pagina; a ordenação
// final por prioridade operacional é feita em Go.
//
// $1=year (sempre específico), $2=dre, $3=municipio, $4=zona, $5=regiao.
const infraestruturaSelectSQL = `
	SELECT
		COALESCE(ri.regiao_de_integracao, '') AS regiao_integracao,
		COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
		COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado') AS municipio,
		COALESCE(NULLIF(TRIM(s.zona), ''), '') AS zona,
		COALESCE(s.codigo_inep, '') AS codigo_inep,
		COALESCE(NULLIF(TRIM(s.nome_escola), ''), 'Sem nome') AS nome_escola,
		(cr.id IS NOT NULL) AS has_censo,
		COALESCE(NULLIF(cr.data->>'tipo_predio', ''), '')              AS tipo_predio,
		COALESCE(NULLIF(cr.data->>'situacao_estrutura', ''), '')       AS situacao_estrutura,
		COALESCE(NULLIF(cr.data->>'rede_eletrica_atende', ''), '')     AS rede_eletrica_atende,
		COALESCE(NULLIF(cr.data->>'suporta_novos_equipamentos', ''), '') AS suporta_novos_equipamentos,
		COALESCE(NULLIF(cr.data->>'energia', ''), '')                  AS energia,
		COALESCE(NULLIF(cr.data->>'estrutura_climatizacao', ''), '')   AS estrutura_climatizacao,
		CASE WHEN cr.data->>'salas_climatizadas' ~ '^-?[0-9]+(\.[0-9]+)?$'
			 THEN (cr.data->>'salas_climatizadas')::numeric END       AS salas_climatizadas,
		CASE WHEN cr.data->>'qtd_salas_aula' ~ '^-?[0-9]+(\.[0-9]+)?$'
			 THEN (cr.data->>'qtd_salas_aula')::numeric END           AS qtd_salas_aula,
		COALESCE(NULLIF(cr.data->>'possui_guarita', ''), '')          AS possui_guarita,
		COALESCE(NULLIF(cr.data->>'possui_botao_panico', ''), '')     AS possui_botao_panico,
		COALESCE(NULLIF(cr.data->>'cameras_funcionamento', ''), '')   AS cameras_funcionamento,
		COALESCE(NULLIF(cr.data->>'controle_portao', ''), '')         AS controle_portao,
		COALESCE(NULLIF(cr.data->>'iluminacao_externa', ''), '')      AS iluminacao_externa,
		COALESCE(NULLIF(cr.data->>'muro_cerca', ''), '')              AS muro_cerca,
		COALESCE(NULLIF(cr.data->>'plano_evacuacao', ''), '')         AS plano_evacuacao,
		COALESCE(NULLIF(cr.data->>'politica_bullying', ''), '')       AS politica_bullying
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

// buildInfraestruturaReportData executa a consulta, classifica o Status
// Operacional de cada escola, ordena por prioridade operacional e projeta as
// colunas do XLSX. Não pagina.
func (app *application) buildInfraestruturaReportData(ctx context.Context, def ReportDefinition, f reportFilters) (reportData, error) {
	dbRows, err := app.models.Schools.DB.QueryContext(ctx, infraestruturaSelectSQL, f.args()...)
	if err != nil {
		return reportData{}, fmt.Errorf("consultar infraestrutura: %w", err)
	}
	defer dbRows.Close()

	rows := make([]reportOperacionalRow, 0)
	for dbRows.Next() {
		var r infraReportRow
		if err := dbRows.Scan(
			&r.Regiao, &r.DRE, &r.Municipio, &r.Zona, &r.INEP, &r.Escola,
			&r.HasCensus,
			&r.TipoPredio, &r.SituacaoEstrutura, &r.RedeEletricaAtende, &r.SuportaNovosEquip,
			&r.Energia, &r.EstruturaClimatizacao, &r.SalasClimatizadas, &r.QtdSalasAula,
			&r.PossuiGuarita, &r.BotaoPanico, &r.Cameras, &r.ControlePortao,
			&r.IluminacaoExterna, &r.MuroCerca, &r.PlanoEvacuacao, &r.PoliticaBullying,
		); err != nil {
			return reportData{}, fmt.Errorf("ler linha infraestrutura: %w", err)
		}

		status := classifyInfraStatus(r)
		naoClim := infraSalasNaoClimatizadas(r.QtdSalasAula, r.SalasClimatizadas)

		cells := []any{
			r.Regiao,
			r.DRE,
			r.Municipio,
			r.Zona,
			r.INEP,
			r.Escola,
			reportTextCell(r.HasCensus, r.TipoPredio),
			reportTextCell(r.HasCensus, r.SituacaoEstrutura),
			reportSemDadosOr(r.HasCensus, infraNecessitaReforma(r.SituacaoEstrutura)),
			reportSemDadosOr(r.HasCensus, infraReformaCritica(r.SituacaoEstrutura)),
			reportSemDadosOr(r.HasCensus, infraObraParada(r.SituacaoEstrutura)),
			reportTextCell(r.HasCensus, r.RedeEletricaAtende),
			reportTextCell(r.HasCensus, r.SuportaNovosEquip),
			reportTextCell(r.HasCensus, r.Energia),
			reportTextCell(r.HasCensus, r.EstruturaClimatizacao),
			reportIntCell(r.HasCensus, r.SalasClimatizadas),
			reportIntCell(r.HasCensus, naoClim),
			reportTextCell(r.HasCensus, r.PossuiGuarita),
			reportTextCell(r.HasCensus, r.BotaoPanico),
			reportTextCell(r.HasCensus, r.Cameras),
			reportTextCell(r.HasCensus, r.ControlePortao),
			reportTextCell(r.HasCensus, r.IluminacaoExterna),
			reportTextCell(r.HasCensus, r.MuroCerca),
			reportTextCell(r.HasCensus, r.PlanoEvacuacao),
			reportTextCell(r.HasCensus, r.PoliticaBullying),
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
		return reportData{}, fmt.Errorf("iterar linhas infraestrutura: %w", err)
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
		Headers:     infraestruturaReportColumns,
		Rows:        data,
	}, nil
}
