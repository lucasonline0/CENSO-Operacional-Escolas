package main

import (
	"database/sql"
	"strings"
	"testing"
	"time"
)

// TestReportsCatalogRecognizesInfraestrutura garante que o relatório de
// Infraestrutura/Segurança está registrado com os metadados esperados.
func TestReportsCatalogRecognizesInfraestrutura(t *testing.T) {
	def, ok := lookupReport(reportInfraestruturaSegurancaID)
	if !ok {
		t.Fatalf("lookupReport(%q) = not found", reportInfraestruturaSegurancaID)
	}
	if def.Title != "Relatório de Infraestrutura, Energia e Segurança Escolar" {
		t.Fatalf("Title = %q; inesperado", def.Title)
	}
	if def.SheetName != "Infra Segurança" {
		t.Fatalf("SheetName = %q; want %q", def.SheetName, "Infra Segurança")
	}
	if def.FileBase != "relatorio_infraestrutura_seguranca_escolas" {
		t.Fatalf("FileBase = %q; inesperado", def.FileBase)
	}
}

// TestInfraestruturaReportColumns trava a ordem e o conteúdo das colunas.
func TestInfraestruturaReportColumns(t *testing.T) {
	want := []string{
		"Região de Integração", "DRE", "Município", "Zona", "Código INEP", "Escola",
		"Tipo de Prédio", "Situação da Estrutura", "Necessita Reforma", "Reforma Crítica",
		"Obra Parada", "Rede Elétrica Atende", "Suporta Novos Equipamentos", "Energia",
		"Estrutura para Climatização", "Salas Climatizadas", "Salas Não Climatizadas",
		"Guarita", "Botão de Pânico", "Câmeras", "Controle de Portão", "Iluminação Externa",
		"Muro/Cerca", "Plano de Evacuação", "Política contra Bullying", "Status Operacional",
	}
	if len(infraestruturaReportColumns) != len(want) {
		t.Fatalf("len colunas = %d; want %d", len(infraestruturaReportColumns), len(want))
	}
	for i := range want {
		if infraestruturaReportColumns[i] != want[i] {
			t.Fatalf("coluna[%d] = %q; want %q", i, infraestruturaReportColumns[i], want[i])
		}
	}
	if infraestruturaReportColumns[len(infraestruturaReportColumns)-1] != "Status Operacional" {
		t.Fatalf("última coluna deve ser Status Operacional")
	}
}

// TestClassifyInfraStatus cobre a tabela de classificação operacional.
func TestClassifyInfraStatus(t *testing.T) {
	base := infraReportRow{
		HasCensus:             true,
		SituacaoEstrutura:     situacaoSemReforma,
		RedeEletricaAtende:    "Sim",
		Energia:               "Concessionária de energia - Equatorial",
		EstruturaClimatizacao: "Sim",
		Cameras:               "Sim, funcionando plenamente",
		IluminacaoExterna:     "Adequada",
		MuroCerca:             "Sim, muro",
	}

	tests := []struct {
		name   string
		mutate func(r *infraReportRow)
		want   string
	}{
		{"sem censo", func(r *infraReportRow) { r.HasCensus = false }, statusOperacionalSemDados},
		{"adequado", func(r *infraReportRow) {}, statusOperacionalAdequado},
		{"critico reforma geral", func(r *infraReportRow) { r.SituacaoEstrutura = situacaoReformaGeral }, statusOperacionalCritico},
		{"critico obra parada", func(r *infraReportRow) { r.SituacaoEstrutura = situacaoObraParada }, statusOperacionalCritico},
		{"critico rede nao atende", func(r *infraReportRow) { r.RedeEletricaAtende = "Não" }, statusOperacionalCritico},
		{"critico energia ausente", func(r *infraReportRow) { r.Energia = "" }, statusOperacionalCritico},
		{"atencao reforma parcial", func(r *infraReportRow) { r.SituacaoEstrutura = situacaoReformaParcial }, statusOperacionalAtencao},
		{"atencao rede parcial", func(r *infraReportRow) { r.RedeEletricaAtende = "Parcialmente" }, statusOperacionalAtencao},
		{"atencao sem climatizacao", func(r *infraReportRow) { r.EstruturaClimatizacao = "Não" }, statusOperacionalAtencao},
		{"atencao sem cameras", func(r *infraReportRow) { r.Cameras = "Não possui" }, statusOperacionalAtencao},
		{"atencao iluminacao insuficiente", func(r *infraReportRow) { r.IluminacaoExterna = "Insuficiente" }, statusOperacionalAtencao},
		{"atencao sem muro", func(r *infraReportRow) { r.MuroCerca = "Não possui" }, statusOperacionalAtencao},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := base
			tt.mutate(&r)
			if got := classifyInfraStatus(r); got != tt.want {
				t.Fatalf("classifyInfraStatus = %q; want %q", got, tt.want)
			}
		})
	}
}

// TestClassifyInfraStatusCriticoPrecedeAtencao garante que crítico tem
// prioridade quando há problemas dos dois níveis simultaneamente.
func TestClassifyInfraStatusCriticoPrecedeAtencao(t *testing.T) {
	r := infraReportRow{
		HasCensus:         true,
		SituacaoEstrutura: situacaoReformaGeral, // crítico
		Cameras:           "Não possui",         // atenção
		Energia:           "Geração própria",
	}
	if got := classifyInfraStatus(r); got != statusOperacionalCritico {
		t.Fatalf("classifyInfraStatus = %q; want Crítico", got)
	}
}

// TestInfraDerivedReformColumns cobre as colunas derivadas de situacao_estrutura.
func TestInfraDerivedReformColumns(t *testing.T) {
	tests := []struct {
		situacao                 string
		necessita, critica, obra string
	}{
		{situacaoReformaGeral, "Sim", "Sim", "Não"},
		{situacaoObraParada, "Sim", "Não", "Sim"},
		{situacaoReformaParcial, "Sim", "Não", "Não"},
		{situacaoSemReforma, "Não", "Não", "Não"},
		{situacaoReformada, "Não", "Não", "Não"},
		{"", "Não informado", "Não informado", "Não informado"},
	}
	for _, tt := range tests {
		if got := infraNecessitaReforma(tt.situacao); got != tt.necessita {
			t.Fatalf("infraNecessitaReforma(%q) = %q; want %q", tt.situacao, got, tt.necessita)
		}
		if got := infraReformaCritica(tt.situacao); got != tt.critica {
			t.Fatalf("infraReformaCritica(%q) = %q; want %q", tt.situacao, got, tt.critica)
		}
		if got := infraObraParada(tt.situacao); got != tt.obra {
			t.Fatalf("infraObraParada(%q) = %q; want %q", tt.situacao, got, tt.obra)
		}
	}
}

// TestInfraSalasNaoClimatizadas valida a regra max(salas - climatizadas, 0).
func TestInfraSalasNaoClimatizadas(t *testing.T) {
	nf := func(v float64) sql.NullFloat64 { return sql.NullFloat64{Float64: v, Valid: true} }
	null := sql.NullFloat64{}

	if got := infraSalasNaoClimatizadas(null, nf(2)); got.Valid {
		t.Fatalf("salas_aula NULL deve produzir NULL; got %+v", got)
	}
	if got := infraSalasNaoClimatizadas(nf(10), nf(3)); !got.Valid || got.Float64 != 7 {
		t.Fatalf("10-3 = %+v; want 7", got)
	}
	if got := infraSalasNaoClimatizadas(nf(5), nf(8)); !got.Valid || got.Float64 != 0 {
		t.Fatalf("piso 0 falhou: %+v", got)
	}
	if got := infraSalasNaoClimatizadas(nf(4), null); !got.Valid || got.Float64 != 4 {
		t.Fatalf("climatizadas NULL deve tratar como 0: %+v", got)
	}
}

// TestSortReportOperacionalPriority garante a ordem Crítico > Atenção >
// Adequado > Sem dados e os desempates territoriais.
func TestSortReportOperacionalPriority(t *testing.T) {
	rows := []reportOperacionalRow{
		{Status: statusOperacionalSemDados, DRE: "A", Municipio: "A", Escola: "A", INEP: "1"},
		{Status: statusOperacionalAdequado, DRE: "A", Municipio: "A", Escola: "A", INEP: "2"},
		{Status: statusOperacionalCritico, DRE: "Z", Municipio: "Z", Escola: "Z", INEP: "3"},
		{Status: statusOperacionalCritico, DRE: "A", Municipio: "A", Escola: "A", INEP: "4"},
		{Status: statusOperacionalAtencao, DRE: "A", Municipio: "A", Escola: "A", INEP: "5"},
	}
	sortReportOperacional(rows)

	wantINEP := []string{"4", "3", "5", "2", "1"}
	for i, w := range wantINEP {
		if rows[i].INEP != w {
			t.Fatalf("ordem[%d] INEP = %q; want %q (rows=%+v)", i, rows[i].INEP, w, rows)
		}
	}
}

// TestResolveReportYearDefault garante ano específico (não "todos os anos").
func TestResolveReportYearDefault(t *testing.T) {
	now := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	if got := resolveReportYearDefault(reportFilters{Year: 2025}, now); got != 2025 {
		t.Fatalf("year explícito = %d; want 2025", got)
	}
	if got := resolveReportYearDefault(reportFilters{Year: 0}, now); got != 2026 {
		t.Fatalf("year ausente = %d; want 2026 (ano corrente)", got)
	}
	if got := resolveReportYearDefault(reportFilters{}, now); got == 0 {
		t.Fatalf("year padrão não pode ser 0 (todos os anos)")
	}
}

// TestWriteInfraestruturaXLSX garante a geração do XLSX com a aba e colunas.
func TestWriteInfraestruturaXLSX(t *testing.T) {
	rd := reportData{
		Title:       "Relatório de Infraestrutura, Energia e Segurança Escolar",
		SheetName:   "Infra Segurança",
		FiltersLine: "Filtros aplicados — Ano: 2026",
		Headers:     infraestruturaReportColumns,
		Rows: [][]any{
			{"GUAJARA", "BELEM", "BELEM", "Urbana", "12345678", "Escola Crítica",
				"Próprio", "Necessita de reforma geral", "Sim", "Sim", "Não", "Não",
				"Não", "Geração própria", "Não", 2, 8, "Sim", "Não",
				"Não possui", "Manual", "Insuficiente", "Não possui", "Não", "Não possui",
				statusOperacionalCritico},
			{"GUAJARA", "BELEM", "BELEM", "Urbana", "87654321", "Escola Sem Dados",
				"Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados",
				"Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados",
				"Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados",
				statusOperacionalSemDados},
		},
	}

	f, err := writeReportXLSX(rd)
	if err != nil {
		t.Fatalf("writeReportXLSX erro: %v", err)
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		t.Fatalf("WriteToBuffer erro: %v", err)
	}
	if buf.Len() == 0 {
		t.Fatalf("XLSX vazio")
	}
	if idx, err := f.GetSheetIndex("Infra Segurança"); err != nil || idx < 0 {
		t.Fatalf("aba 'Infra Segurança' não encontrada (idx=%d, err=%v)", idx, err)
	}
	if v, err := f.GetCellValue("Infra Segurança", "A4"); err != nil || v != "Região de Integração" {
		t.Fatalf("A4 = %q (err=%v); want primeiro cabeçalho", v, err)
	}
	// Última coluna (Z = 26ª) na linha 5 deve ser o status.
	if v, err := f.GetCellValue("Infra Segurança", "Z5"); err != nil || v != statusOperacionalCritico {
		t.Fatalf("Z5 = %q (err=%v); want %q", v, err, statusOperacionalCritico)
	}
}

// TestInfraestruturaSelectSQLShape valida que a consulta parte de schools s com
// LEFT JOIN no censo concluído do ano (mantendo escolas sem dados) e aplica os
// filtros globais sobre schools s.
func TestInfraestruturaSelectSQLShape(t *testing.T) {
	q := infraestruturaSelectSQL
	mustContain := []string{
		"FROM schools s",
		"LEFT JOIN census_responses cr",
		"cr.year = $1 AND cr.status = 'completed'",
		"LEFT JOIN reg_integracao ri",
		"(cr.id IS NOT NULL) AS has_censo",
		"cr.data->>'situacao_estrutura'",
		"cr.data->>'plano_evacuacao'",
		"($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
	}
	for _, frag := range mustContain {
		if !strings.Contains(q, frag) {
			t.Fatalf("infraestruturaSelectSQL não contém %q", frag)
		}
	}
	if strings.Contains(q, "INNER JOIN") {
		t.Fatalf("query não pode usar INNER JOIN (excluiria escolas sem dados)")
	}
}
