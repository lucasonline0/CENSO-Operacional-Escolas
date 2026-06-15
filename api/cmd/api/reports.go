package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// =====================================================================
// Relatórios gerenciais — handler HTTP e relatório piloto
// =====================================================================
// Rota: GET /v1/admin/reports/{report_id} (protegida por requireAdminAuth).
// Respostas:
//   - 401: token ausente/inválido (tratado pelo middleware).
//   - 404: report_id não consta no catálogo.
//   - 400: format diferente de xlsx.
//   - 500: erro interno (consulta/geração).
//   - 200: arquivo XLSX como anexo.
//
// Esta camada é independente dos endpoints analíticos: não altera
// consultas, views nem cálculos existentes. Reaproveita apenas o padrão
// de filtros globais (year, dre, municipio, zona, regiao_integracao).
// =====================================================================

// reportFormatXLSX é o único formato suportado nesta fase.
const reportFormatXLSX = "xlsx"

// reportFilters reúne os filtros globais aplicáveis ao relatório. Difere
// de AnalyticsFilters num ponto importante: year ausente/ inválido
// significa "todos os anos" (Year = 0), e não o ano corrente — um
// relatório de acompanhamento deve poder consolidar o histórico.
type reportFilters struct {
	Year             int // 0 = todos os anos
	DRE              string
	Municipio        string
	Zona             string
	RegiaoIntegracao string
}

// parseReportFilters lê os filtros da query string, removendo espaços. Um
// year ausente, em branco, não numérico, zero ou negativo desativa o
// filtro de ano (Year = 0).
func parseReportFilters(q url.Values) reportFilters {
	f := reportFilters{
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

// args devolve os argumentos posicionais na ordem usada pelas consultas de
// relatório: $1=year (0 = sem filtro), $2=dre, $3=municipio, $4=zona,
// $5=regiao_integracao.
func (f reportFilters) args() []any {
	return []any{f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao}
}

// describe monta a linha 2 do XLSX ("Filtros aplicados — ..."). Sempre
// informa o recorte de ano; filtros territoriais só aparecem quando ativos.
func (f reportFilters) describe() string {
	parts := make([]string, 0, 5)
	if f.Year > 0 {
		parts = append(parts, "Ano: "+strconv.Itoa(f.Year))
	} else {
		parts = append(parts, "Ano: todos")
	}
	if f.RegiaoIntegracao != "" {
		parts = append(parts, "Região de Integração: "+f.RegiaoIntegracao)
	}
	if f.DRE != "" {
		parts = append(parts, "DRE: "+f.DRE)
	}
	if f.Municipio != "" {
		parts = append(parts, "Município: "+f.Municipio)
	}
	if f.Zona != "" {
		parts = append(parts, "Zona: "+f.Zona)
	}
	return "Filtros aplicados — " + strings.Join(parts, " | ")
}

// normalizeReportFormat aplica o default xlsx quando o parâmetro está
// ausente e normaliza caixa/espaços para a validação.
func normalizeReportFormat(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	if raw == "" {
		return reportFormatXLSX
	}
	return raw
}

// censoStatusLabel classifica o status gerencial de uma escola a partir do
// status técnico do censo (hasCensus=false quando não há resposta) e do
// estado de sincronização com a planilha. Espelha a tabela documentada na
// especificação:
//
//	sem resposta                                   -> Pendente
//	draft                                          -> Rascunho
//	completed + sheet_synced_at IS NULL            -> Pendente de Sincronização
//	completed + sheet_synced_at IS NOT NULL        -> Concluído
//	qualquer outro                                 -> Verificar
func censoStatusLabel(status string, hasCensus, synced bool) string {
	if !hasCensus {
		return "Pendente"
	}
	switch status {
	case "draft":
		return "Rascunho"
	case "completed":
		if synced {
			return "Concluído"
		}
		return "Pendente de Sincronização"
	default:
		return "Verificar"
	}
}

// situacaoOperacional é a coluna complementar "Situação Operacional".
// Inicialmente deriva do status gerencial, traduzindo-o para uma frase de
// leitura operacional pelas DREs (documentado em código, conforme a spec).
func situacaoOperacional(statusLabel string) string {
	switch statusLabel {
	case "Pendente":
		return "Aguardando preenchimento"
	case "Rascunho":
		return "Preenchimento em andamento"
	case "Pendente de Sincronização":
		return "Concluído, aguardando sincronização"
	case "Concluído":
		return "Concluído e sincronizado"
	default:
		return "Verificar manualmente"
	}
}

// AdminGetReport é o handler da rota GET /v1/admin/reports/{report_id}.
func (app *application) AdminGetReport(w http.ResponseWriter, r *http.Request) {
	reportID := strings.TrimSpace(chi.URLParam(r, "report_id"))

	def, ok := lookupReport(reportID)
	if !ok {
		app.errorJSON(w, fmt.Errorf("relatório %q não encontrado", reportID), http.StatusNotFound)
		return
	}

	format := normalizeReportFormat(r.URL.Query().Get("format"))
	if format != reportFormatXLSX {
		app.errorJSON(w, fmt.Errorf("formato %q não suportado; use format=xlsx", format), http.StatusBadRequest)
		return
	}

	filters := parseReportFilters(r.URL.Query())

	var (
		rd  reportData
		err error
	)
	switch def.ID {
	case reportCensoPreenchimentoID:
		rd, err = app.buildCensoPreenchimentoReportData(r.Context(), def, filters)
	default:
		// Catálogo e dispatch desalinhados: defensivo.
		app.errorJSON(w, fmt.Errorf("relatório %q sem implementação", def.ID), http.StatusNotFound)
		return
	}
	if err != nil {
		app.logger.Printf("AdminGetReport %s: %v", def.ID, err)
		app.errorJSON(w, fmt.Errorf("erro ao gerar relatório"), http.StatusInternalServerError)
		return
	}

	f, err := writeReportXLSX(rd)
	if err != nil {
		app.logger.Printf("AdminGetReport %s: gerar xlsx: %v", def.ID, err)
		app.errorJSON(w, fmt.Errorf("erro ao gerar arquivo"), http.StatusInternalServerError)
		return
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		app.logger.Printf("AdminGetReport %s: serializar xlsx: %v", def.ID, err)
		app.errorJSON(w, fmt.Errorf("erro ao gerar arquivo"), http.StatusInternalServerError)
		return
	}

	filename := buildReportFileName(def.FileBase, filters)
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(buf.Bytes()); err != nil {
		app.logger.Printf("AdminGetReport %s: escrever resposta: %v", def.ID, err)
	}
}

// censoPreenchimentoReportColumns são os cabeçalhos do relatório piloto, na
// ordem exigida pela especificação (colunas territoriais comuns seguidas
// dos campos de acompanhamento).
var censoPreenchimentoReportColumns = []string{
	"Região de Integração",
	"DRE",
	"Município",
	"Zona",
	"Código INEP",
	"Escola",
	"Status do Censo",
	"Ano",
	"Última Atualização",
	"Sincronizado com Planilha",
	"Data de Sincronização",
	"Situação Operacional",
}

// censoPreenchimentoSelectSQL parte de schools s com LEFT JOIN na resposta
// de censo mais recente (CTE latest_census) para que escolas sem resposta
// permaneçam no recorte e apareçam como pendentes. A Região de Integração
// vem de um LEFT JOIN em reg_integracao (mesma grafia por município usada
// nos demais endpoints). NÃO reutiliza censusListSelectSQL/AnalyticsFilters,
// que fazem JOIN obrigatório com census_responses e excluiriam pendentes.
//
// Ano: $1 = 0 considera todas as respostas (pega a mais recente por escola);
// $1 > 0 restringe à resposta daquele ano. Demais filtros incidem sobre
// schools s com UPPER(TRIM(...)) para tolerar caixa e espaços.
//
// A ordenação segue a prioridade gerencial (Pendente, Rascunho, Pendente de
// Sincronização, Concluído, Verificar) e depois DRE, Município, Escola, INEP.
const censoPreenchimentoSelectSQL = `
	WITH latest_census AS (
		SELECT DISTINCT ON (school_id)
			school_id, status, year, updated_at, sheet_synced_at
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
		cr.status,
		cr.year,
		cr.updated_at,
		(cr.sheet_synced_at IS NOT NULL) AS synced,
		cr.sheet_synced_at
	FROM schools s
	LEFT JOIN latest_census cr ON cr.school_id = s.id
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
		CASE
			WHEN cr.status IS NULL THEN 1
			WHEN cr.status = 'draft' THEN 2
			WHEN cr.status = 'completed' AND cr.sheet_synced_at IS NULL THEN 3
			WHEN cr.status = 'completed' AND cr.sheet_synced_at IS NOT NULL THEN 4
			ELSE 5
		END,
		UPPER(TRIM(s.dre)),
		UPPER(TRIM(s.municipio)),
		UPPER(TRIM(s.nome_escola)),
		s.codigo_inep
`

// reportDateLayout é o formato pt-BR usado para datas no XLSX.
const reportDateLayout = "02/01/2006 15:04"

// buildCensoPreenchimentoReportData executa a consulta do relatório piloto
// e monta o reportData (sem paginar). Datas chegam formatadas em pt-BR; o
// ano vem como inteiro quando há resposta, ou célula vazia quando pendente.
func (app *application) buildCensoPreenchimentoReportData(ctx context.Context, def ReportDefinition, f reportFilters) (reportData, error) {
	rows, err := app.models.Schools.DB.QueryContext(ctx, censoPreenchimentoSelectSQL, f.args()...)
	if err != nil {
		return reportData{}, fmt.Errorf("consultar preenchimento: %w", err)
	}
	defer rows.Close()

	data := make([][]any, 0)
	for rows.Next() {
		var (
			regiao, dre, municipio, zona, inep, escola string
			status                                     sql.NullString
			year                                       sql.NullInt64
			updatedAt, syncedAt                        sql.NullTime
			synced                                     bool
		)
		if err := rows.Scan(&regiao, &dre, &municipio, &zona, &inep, &escola,
			&status, &year, &updatedAt, &synced, &syncedAt); err != nil {
			return reportData{}, fmt.Errorf("ler linha: %w", err)
		}

		label := censoStatusLabel(status.String, status.Valid, synced)

		anoCell := any("")
		if year.Valid {
			anoCell = int(year.Int64)
		}
		updatedCell := ""
		if updatedAt.Valid {
			updatedCell = updatedAt.Time.Format(reportDateLayout)
		}
		syncedCell := "Não"
		if synced {
			syncedCell = "Sim"
		}
		syncDateCell := ""
		if syncedAt.Valid {
			syncDateCell = syncedAt.Time.Format(reportDateLayout)
		}

		data = append(data, []any{
			regiao,
			dre,
			municipio,
			zona,
			inep,
			escola,
			label,
			anoCell,
			updatedCell,
			syncedCell,
			syncDateCell,
			situacaoOperacional(label),
		})
	}
	if err := rows.Err(); err != nil {
		return reportData{}, fmt.Errorf("iterar linhas: %w", err)
	}

	return reportData{
		Title:       def.Title,
		SheetName:   def.SheetName,
		FiltersLine: f.describe(),
		Headers:     censoPreenchimentoReportColumns,
		Rows:        data,
	}, nil
}
