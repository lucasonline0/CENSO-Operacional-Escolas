package main

import (
	"testing"
	"time"
)

// TestReportsCatalogRecognizesSaudeOperacional garante que o relatório de Saúde
// Operacional está registrado com os metadados esperados.
func TestReportsCatalogRecognizesSaudeOperacional(t *testing.T) {
	def, ok := lookupReport(reportSaudeOperacionalID)
	if !ok {
		t.Fatalf("lookupReport(%q) = not found; esperado encontrado", reportSaudeOperacionalID)
	}
	if def.ID != reportSaudeOperacionalID {
		t.Fatalf("ID = %q; want %q", def.ID, reportSaudeOperacionalID)
	}
	if def.SheetName != "Saude Operacional" {
		t.Fatalf("SheetName = %q; want %q", def.SheetName, "Saude Operacional")
	}
	if def.FileBase != "relatorio_saude_operacional_escolas" {
		t.Fatalf("FileBase = %q; want %q", def.FileBase, "relatorio_saude_operacional_escolas")
	}
	if def.Title != "Relatório de Índice de Saúde Operacional por Escola" {
		t.Fatalf("Title = %q; inesperado", def.Title)
	}
}

// TestResolveSaudeOperacionalReportYear cobre o ano específico e o fallback para
// o ano corrente quando o filtro está ausente/inválido (Year = 0).
func TestResolveSaudeOperacionalReportYear(t *testing.T) {
	now := time.Date(2026, time.June, 15, 0, 0, 0, 0, time.UTC)

	if got := resolveSaudeOperacionalReportYear(reportFilters{Year: 2025}, now); got != 2025 {
		t.Fatalf("ano específico = %d; want 2025", got)
	}
	if got := resolveSaudeOperacionalReportYear(reportFilters{Year: 0}, now); got != 2026 {
		t.Fatalf("ano ausente = %d; want 2026 (ano corrente)", got)
	}
}

// TestSaudeOperacionalStatusLabel garante a tradução dos status técnicos para
// rótulos legíveis na coluna Status.
func TestSaudeOperacionalStatusLabel(t *testing.T) {
	tests := map[string]string{
		"saudavel":   "Saudável",
		"atencao":    "Atenção",
		"critica":    "Crítica",
		"sem_dados":  "Sem dados",
		"inesperado": "Sem dados",
	}
	for in, want := range tests {
		if got := saudeOperacionalStatusLabel(in); got != want {
			t.Fatalf("saudeOperacionalStatusLabel(%q) = %q; want %q", in, got, want)
		}
	}
}

// TestSaudeOperacionalReportColumns garante a presença e ordem das colunas
// exigidas, incluindo Pedagógico e Governança ao final.
func TestSaudeOperacionalReportColumns(t *testing.T) {
	want := []string{
		"Região de Integração", "DRE", "Município", "Zona", "Código INEP", "Escola",
		"Alunos", "Salas", "Alunos por sala", "Índice de Saúde", "Criticidade", "Status",
		"Infraestrutura", "Energia", "Merenda", "Segurança", "Pessoal", "Tecnologia",
		"Pedagógico", "Governança",
	}
	if len(saudeOperacionalReportColumns) != len(want) {
		t.Fatalf("len(colunas) = %d; want %d", len(saudeOperacionalReportColumns), len(want))
	}
	for i := range want {
		if saudeOperacionalReportColumns[i] != want[i] {
			t.Fatalf("coluna[%d] = %q; want %q", i, saudeOperacionalReportColumns[i], want[i])
		}
	}
}

// TestSortSaudeOperacionalReport valida a ordenação: criticidade decrescente,
// sem_dados ao final e desempate por DRE/Município/Escola/INEP.
func TestSortSaudeOperacionalReport(t *testing.T) {
	escola := func(nome, dre, mun, inep, status string, criticidade *float64) SaudeOperacionalEscola {
		var inepPtr *string
		if inep != "" {
			inepPtr = ptrString(inep)
		}
		return SaudeOperacionalEscola{
			Escola:      nome,
			DRE:         dre,
			Municipio:   mun,
			CodigoINEP:  inepPtr,
			Status:      status,
			Criticidade: criticidade,
		}
	}

	semDados := escola("Z Escola Sem Dados", "DRE A", "Mun A", "11111111", "sem_dados", nil)
	critica := escola("Escola Critica", "DRE B", "Mun B", "22222222", "critica", ptrFloat(80))
	atencao := escola("Escola Atencao", "DRE C", "Mun C", "33333333", "atencao", ptrFloat(40))
	// Duas escolas com mesma criticidade para testar desempate por DRE.
	empateZ := escola("Escola Empate", "DRE Z", "Mun Z", "44444444", "critica", ptrFloat(60))
	empateA := escola("Escola Empate", "DRE A", "Mun A", "55555555", "critica", ptrFloat(60))

	in := []SaudeOperacionalEscola{semDados, atencao, empateZ, critica, empateA}
	got := sortSaudeOperacionalReport(in)

	// Ordem esperada: critica(80), empateA(60, DRE A), empateZ(60, DRE Z), atencao(40), semDados.
	wantINEP := []string{"22222222", "55555555", "44444444", "33333333", "11111111"}
	if len(got) != len(wantINEP) {
		t.Fatalf("len = %d; want %d", len(got), len(wantINEP))
	}
	for i, inep := range wantINEP {
		if reportINEPValue(got[i]) != inep {
			t.Fatalf("posição %d INEP = %q; want %q", i, reportINEPValue(got[i]), inep)
		}
	}

	// O slice de origem não deve ser alterado.
	if reportINEPValue(in[0]) != "11111111" {
		t.Fatalf("slice de origem foi alterado: in[0] INEP = %q", reportINEPValue(in[0]))
	}
}

// TestOptCellHelpers cobre as células opcionais (vazias quando nil).
func TestOptCellHelpers(t *testing.T) {
	if optFloatCell(nil) != "" {
		t.Fatalf("optFloatCell(nil) != vazio")
	}
	if optFloatCell(ptrFloat(72.5)) != 72.5 {
		t.Fatalf("optFloatCell(72.5) = %v; want 72.5", optFloatCell(ptrFloat(72.5)))
	}
	if optIntCell(nil) != "" {
		t.Fatalf("optIntCell(nil) != vazio")
	}
	if optIntCell(ptrInt(120)) != 120 {
		t.Fatalf("optIntCell(120) = %v; want 120", optIntCell(ptrInt(120)))
	}
	if optStringCell(nil) != "" {
		t.Fatalf("optStringCell(nil) != vazio")
	}
	if optStringCell(ptrString("Urbana")) != "Urbana" {
		t.Fatalf("optStringCell(Urbana) = %v; want Urbana", optStringCell(ptrString("Urbana")))
	}
}

// TestWriteSaudeOperacionalReportXLSX garante que o gerador genérico produz um
// XLSX válido para o relatório de Saúde Operacional, com aba, título, cabeçalho
// na linha 4 e dados a partir da linha 5.
func TestWriteSaudeOperacionalReportXLSX(t *testing.T) {
	rd := reportData{
		Title:       "Relatório de Índice de Saúde Operacional por Escola",
		SheetName:   "Saude Operacional",
		FiltersLine: "Filtros aplicados — Ano: 2026",
		Headers:     saudeOperacionalReportColumns,
		Rows: [][]any{
			{"GUAJARA", "BELEM", "BELEM", "Urbana", "12345678", "Escola Critica",
				300, 10, 30.0, 35.0, 65.0, "Crítica",
				40.0, 50.0, 30.0, 20.0, 60.0, 45.0, 55.0, 50.0},
			{"", "DRE X", "Mun X", "", "", "Escola Sem Dados",
				"", "", "", "", "", "Sem dados",
				"", "", "", "", "", "", "", ""},
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
		t.Fatalf("arquivo XLSX vazio")
	}

	if idx, err := f.GetSheetIndex("Saude Operacional"); err != nil || idx < 0 {
		t.Fatalf("aba 'Saude Operacional' não encontrada (idx=%d, err=%v)", idx, err)
	}
	if v, err := f.GetCellValue("Saude Operacional", "A1"); err != nil || v != rd.Title {
		t.Fatalf("A1 = %q (err=%v); want título", v, err)
	}
	if v, err := f.GetCellValue("Saude Operacional", "A4"); err != nil || v != "Região de Integração" {
		t.Fatalf("A4 = %q (err=%v); want primeiro cabeçalho", v, err)
	}
	// Última coluna do cabeçalho (Governança) na coluna T (20ª).
	if v, err := f.GetCellValue("Saude Operacional", "T4"); err != nil || v != "Governança" {
		t.Fatalf("T4 = %q (err=%v); want 'Governança'", v, err)
	}
	// Status da primeira linha de dados na coluna L (12ª), linha 5.
	if v, err := f.GetCellValue("Saude Operacional", "L5"); err != nil || v != "Crítica" {
		t.Fatalf("L5 = %q (err=%v); want 'Crítica'", v, err)
	}
}

// TestBuildSaudeOperacionalReportFileName garante o nome de arquivo com ano
// específico, espelhando o exemplo da especificação.
func TestBuildSaudeOperacionalReportFileName(t *testing.T) {
	got := buildReportFileName("relatorio_saude_operacional_escolas", reportFilters{Year: 2026})
	want := "relatorio_saude_operacional_escolas_2026.xlsx"
	if got != want {
		t.Fatalf("buildReportFileName = %q; want %q", got, want)
	}
}
