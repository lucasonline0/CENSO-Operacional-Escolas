package main

import (
	"database/sql"
	"strings"
	"testing"
)

// TestReportsCatalogRecognizesMerenda garante que o relatório de Merenda está
// registrado com os metadados esperados.
func TestReportsCatalogRecognizesMerenda(t *testing.T) {
	def, ok := lookupReport(reportMerendaCondicoesID)
	if !ok {
		t.Fatalf("lookupReport(%q) = not found", reportMerendaCondicoesID)
	}
	if def.Title != "Relatório de Condições da Merenda Escolar" {
		t.Fatalf("Title = %q; inesperado", def.Title)
	}
	if def.SheetName != "Merenda Escolar" {
		t.Fatalf("SheetName = %q; want %q", def.SheetName, "Merenda Escolar")
	}
	if def.FileBase != "relatorio_merenda_escolar_condicoes" {
		t.Fatalf("FileBase = %q; inesperado", def.FileBase)
	}
}

// TestMerendaReportColumns trava a ordem e o conteúdo das colunas.
func TestMerendaReportColumns(t *testing.T) {
	want := []string{
		"Região de Integração", "DRE", "Município", "Zona", "Código INEP", "Escola",
		"Oferta Regular", "Qualidade da Merenda", "Atende Necessidades", "Condições da Cozinha",
		"Tamanho da Cozinha", "Possui Refeitório", "Refeitório Adequado", "Freezers",
		"Geladeiras", "Fogões", "Bebedouros", "Despensa Exclusiva", "Depósito de Conserva",
		"EPIs", "Extintores", "Manutenção Preventiva", "Status Operacional",
	}
	if len(merendaReportColumns) != len(want) {
		t.Fatalf("len colunas = %d; want %d", len(merendaReportColumns), len(want))
	}
	for i := range want {
		if merendaReportColumns[i] != want[i] {
			t.Fatalf("coluna[%d] = %q; want %q", i, merendaReportColumns[i], want[i])
		}
	}
	if merendaReportColumns[len(merendaReportColumns)-1] != "Status Operacional" {
		t.Fatalf("última coluna deve ser Status Operacional")
	}
}

// TestClassifyMerendaStatus cobre a tabela de classificação operacional.
func TestClassifyMerendaStatus(t *testing.T) {
	nf := func(v float64) sql.NullFloat64 { return sql.NullFloat64{Float64: v, Valid: true} }
	base := merendaReportRow{
		HasCensus:          true,
		OfertaRegular:      "Sim",
		QualidadeMerenda:   "Boa",
		AtendeNecessidades: "Sim",
		CondicoesCozinha:   "Boa",
		RefeitorioAdequado: "Sim",
		EstoqueEpiExtintor: "Completo",
		QtdFreezers:        nf(1),
		QtdGeladeiras:      nf(1),
	}

	tests := []struct {
		name   string
		mutate func(r *merendaReportRow)
		want   string
	}{
		{"sem censo", func(r *merendaReportRow) { r.HasCensus = false }, statusOperacionalSemDados},
		{"adequado", func(r *merendaReportRow) {}, statusOperacionalAdequado},
		{"critico sem oferta", func(r *merendaReportRow) { r.OfertaRegular = "Não" }, statusOperacionalCritico},
		{"critico nao atende", func(r *merendaReportRow) { r.AtendeNecessidades = "Não" }, statusOperacionalCritico},
		{"critico cozinha precaria", func(r *merendaReportRow) { r.CondicoesCozinha = "Precária" }, statusOperacionalCritico},
		{"atencao oferta com falhas", func(r *merendaReportRow) { r.OfertaRegular = "Sim, com falhas" }, statusOperacionalAtencao},
		{"atencao qualidade regular", func(r *merendaReportRow) { r.QualidadeMerenda = "Regular" }, statusOperacionalAtencao},
		{"atencao qualidade ruim", func(r *merendaReportRow) { r.QualidadeMerenda = "Ruim" }, statusOperacionalAtencao},
		{"atencao atende parcial", func(r *merendaReportRow) { r.AtendeNecessidades = "Parcialmente" }, statusOperacionalAtencao},
		{"atencao cozinha regular", func(r *merendaReportRow) { r.CondicoesCozinha = "Regular" }, statusOperacionalAtencao},
		{"atencao refeitorio inadequado", func(r *merendaReportRow) { r.RefeitorioAdequado = "Não" }, statusOperacionalAtencao},
		{"atencao sem refrigeracao", func(r *merendaReportRow) { r.QtdFreezers = nf(0); r.QtdGeladeiras = nf(0) }, statusOperacionalAtencao},
		{"atencao epi inexistente", func(r *merendaReportRow) { r.EstoqueEpiExtintor = "Inexistente" }, statusOperacionalAtencao},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := base
			tt.mutate(&r)
			if got := classifyMerendaStatus(r); got != tt.want {
				t.Fatalf("classifyMerendaStatus = %q; want %q", got, tt.want)
			}
		})
	}
}

// TestClassifyMerendaCriticoPrecedeAtencao garante a precedência de crítico.
func TestClassifyMerendaCriticoPrecedeAtencao(t *testing.T) {
	r := merendaReportRow{
		HasCensus:        true,
		OfertaRegular:    "Não",     // crítico
		QualidadeMerenda: "Regular", // atenção
	}
	if got := classifyMerendaStatus(r); got != statusOperacionalCritico {
		t.Fatalf("classifyMerendaStatus = %q; want Crítico", got)
	}
}

// TestMerendaSemRefrigeracao garante que NULLs não disparam o sinal.
func TestMerendaSemRefrigeracao(t *testing.T) {
	nf := func(v float64) sql.NullFloat64 { return sql.NullFloat64{Float64: v, Valid: true} }
	null := sql.NullFloat64{}

	if merendaSemRefrigeracao(merendaReportRow{QtdFreezers: null, QtdGeladeiras: null}) {
		t.Fatalf("NULL/NULL não deveria sinalizar sem refrigeração")
	}
	if merendaSemRefrigeracao(merendaReportRow{QtdFreezers: nf(0), QtdGeladeiras: null}) {
		t.Fatalf("0/NULL não deveria sinalizar (geladeiras desconhecidas)")
	}
	if !merendaSemRefrigeracao(merendaReportRow{QtdFreezers: nf(0), QtdGeladeiras: nf(0)}) {
		t.Fatalf("0/0 deveria sinalizar sem refrigeração")
	}
	if merendaSemRefrigeracao(merendaReportRow{QtdFreezers: nf(0), QtdGeladeiras: nf(2)}) {
		t.Fatalf("0/2 não deveria sinalizar (há geladeiras)")
	}
}

// TestWriteMerendaXLSX garante a geração do XLSX com a aba e colunas.
func TestWriteMerendaXLSX(t *testing.T) {
	rd := reportData{
		Title:       "Relatório de Condições da Merenda Escolar",
		SheetName:   "Merenda Escolar",
		FiltersLine: "Filtros aplicados — Ano: 2026",
		Headers:     merendaReportColumns,
		Rows: [][]any{
			{"GUAJARA", "BELEM", "BELEM", "Urbana", "12345678", "Escola Crítica",
				"Não", "Ruim", "Não", "Precária", "Pequena", "Não", "Não informado",
				0, 0, 1, 2, "Não", "Não", "Inexistente", "Inexistente", "Validade vencida",
				statusOperacionalCritico},
			{"GUAJARA", "BELEM", "BELEM", "Urbana", "87654321", "Escola Sem Dados",
				"Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados",
				"Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados", "Sem dados",
				"Sem dados", "Sem dados", "Sem dados", statusOperacionalSemDados},
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
	if idx, err := f.GetSheetIndex("Merenda Escolar"); err != nil || idx < 0 {
		t.Fatalf("aba 'Merenda Escolar' não encontrada (idx=%d, err=%v)", idx, err)
	}
	if v, err := f.GetCellValue("Merenda Escolar", "A4"); err != nil || v != "Região de Integração" {
		t.Fatalf("A4 = %q (err=%v); want primeiro cabeçalho", v, err)
	}
	// Última coluna (W = 23ª) na linha 5 deve ser o status.
	if v, err := f.GetCellValue("Merenda Escolar", "W5"); err != nil || v != statusOperacionalCritico {
		t.Fatalf("W5 = %q (err=%v); want %q", v, err, statusOperacionalCritico)
	}
}

// TestMerendaSelectSQLShape valida o formato da consulta.
func TestMerendaSelectSQLShape(t *testing.T) {
	q := merendaSelectSQL
	mustContain := []string{
		"FROM schools s",
		"LEFT JOIN census_responses cr",
		"cr.year = $1 AND cr.status = 'completed'",
		"LEFT JOIN reg_integracao ri",
		"(cr.id IS NOT NULL) AS has_censo",
		"cr.data->>'oferta_regular'",
		"cr.data->>'manutencao_extintores'",
		"($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))",
	}
	for _, frag := range mustContain {
		if !strings.Contains(q, frag) {
			t.Fatalf("merendaSelectSQL não contém %q", frag)
		}
	}
	if strings.Contains(q, "INNER JOIN") {
		t.Fatalf("query não pode usar INNER JOIN (excluiria escolas sem dados)")
	}
}
