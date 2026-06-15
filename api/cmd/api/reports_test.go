package main

import (
	"net/url"
	"strings"
	"testing"
)

// TestReportsCatalogRecognizesPiloto garante que o relatório piloto está
// registrado e expõe os metadados esperados.
func TestReportsCatalogRecognizesPiloto(t *testing.T) {
	def, ok := lookupReport(reportCensoPreenchimentoID)
	if !ok {
		t.Fatalf("lookupReport(%q) = not found; esperado encontrado", reportCensoPreenchimentoID)
	}
	if def.ID != reportCensoPreenchimentoID {
		t.Fatalf("ID = %q; want %q", def.ID, reportCensoPreenchimentoID)
	}
	if def.SheetName != "Preenchimento Censo" {
		t.Fatalf("SheetName = %q; want %q", def.SheetName, "Preenchimento Censo")
	}
	if def.FileBase != "relatorio_censo_preenchimento_escolas" {
		t.Fatalf("FileBase = %q; inesperado", def.FileBase)
	}
	if strings.TrimSpace(def.Title) == "" {
		t.Fatalf("Title vazio")
	}
}

// TestReportsCatalogUnknownNotFound garante que um report_id inexistente
// não é resolvido.
func TestReportsCatalogUnknownNotFound(t *testing.T) {
	if _, ok := lookupReport("relatorio-que-nao-existe"); ok {
		t.Fatalf("lookupReport de id inexistente retornou ok=true")
	}
	if _, ok := lookupReport(""); ok {
		t.Fatalf("lookupReport(\"\") retornou ok=true")
	}
}

// TestNormalizeReportFormat cobre o default xlsx e a normalização de caixa.
func TestNormalizeReportFormat(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"", "xlsx"},
		{"   ", "xlsx"},
		{"xlsx", "xlsx"},
		{"XLSX", "xlsx"},
		{" Xlsx ", "xlsx"},
		{"pdf", "pdf"},
		{"csv", "csv"},
	}
	for _, tt := range tests {
		if got := normalizeReportFormat(tt.in); got != tt.want {
			t.Fatalf("normalizeReportFormat(%q) = %q; want %q", tt.in, got, tt.want)
		}
	}
}

// TestParseReportFiltersYear garante que year ausente/inválido vira 0
// (todos os anos) — diferente de parseAnalyticsFilters.
func TestParseReportFiltersYear(t *testing.T) {
	for _, invalid := range []string{"", "abc", "0", "-3", "  "} {
		got := parseReportFilters(url.Values{"year": {invalid}})
		if got.Year != 0 {
			t.Fatalf("year %q = %d; want 0 (todos os anos)", invalid, got.Year)
		}
	}
	got := parseReportFilters(url.Values{"year": {" 2026 "}})
	if got.Year != 2026 {
		t.Fatalf("year válido = %d; want 2026", got.Year)
	}
}

// TestParseReportFiltersStringsAndArgs cobre a leitura dos filtros textuais
// e a ordem posicional dos argumentos.
func TestParseReportFiltersStringsAndArgs(t *testing.T) {
	q := url.Values{
		"year":              {"2026"},
		"dre":               {"  BELEM  "},
		"municipio":         {"Belém"},
		"zona":              {"Urbana"},
		"regiao_integracao": {"GUAJARA"},
	}
	f := parseReportFilters(q)
	if f.DRE != "BELEM" || f.Municipio != "Belém" || f.Zona != "Urbana" || f.RegiaoIntegracao != "GUAJARA" {
		t.Fatalf("filtros = %+v; leitura incorreta", f)
	}
	args := f.args()
	want := []any{2026, "BELEM", "Belém", "Urbana", "GUAJARA"}
	if len(args) != len(want) {
		t.Fatalf("args = %v; want %v", args, want)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("args[%d] = %v; want %v", i, args[i], want[i])
		}
	}
}

// TestCensoStatusLabel cobre a tabela de classificação gerencial.
func TestCensoStatusLabel(t *testing.T) {
	tests := []struct {
		name      string
		status    string
		hasCensus bool
		synced    bool
		want      string
	}{
		{"sem resposta", "", false, false, "Pendente"},
		{"rascunho", "draft", true, false, "Rascunho"},
		{"completed nao sincronizado", "completed", true, false, "Pendente de Sincronização"},
		{"completed sincronizado", "completed", true, true, "Concluído"},
		{"status inesperado", "qualquer", true, false, "Verificar"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := censoStatusLabel(tt.status, tt.hasCensus, tt.synced); got != tt.want {
				t.Fatalf("censoStatusLabel(%q,%v,%v) = %q; want %q",
					tt.status, tt.hasCensus, tt.synced, got, tt.want)
			}
		})
	}
}

// TestSituacaoOperacional garante que cada status gerencial mapeia para uma
// frase operacional distinta.
func TestSituacaoOperacional(t *testing.T) {
	labels := []string{"Pendente", "Rascunho", "Pendente de Sincronização", "Concluído", "Verificar"}
	seen := map[string]bool{}
	for _, l := range labels {
		s := situacaoOperacional(l)
		if strings.TrimSpace(s) == "" {
			t.Fatalf("situacaoOperacional(%q) vazia", l)
		}
		if seen[s] {
			t.Fatalf("situacaoOperacional(%q) = %q duplicada", l, s)
		}
		seen[s] = true
	}
}

// TestSanitizeFileNamePart garante nomes seguros (minúsculas, sem acentos,
// sem espaços, sem caracteres especiais).
func TestSanitizeFileNamePart(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"DRE Belém", "dre_belem"},
		{"  São Félix  ", "sao_felix"},
		{"Conceição/Araguaia", "conceicao_araguaia"},
		{"GUAJARÁ", "guajara"},
		{"a..b__c", "a_b_c"},
		{"!@#$", ""},
		{"Já é 2026!", "ja_e_2026"},
	}
	for _, tt := range tests {
		if got := sanitizeFileNamePart(tt.in); got != tt.want {
			t.Fatalf("sanitizeFileNamePart(%q) = %q; want %q", tt.in, got, tt.want)
		}
	}
}

// TestBuildReportFileName cobre os exemplos da especificação.
func TestBuildReportFileName(t *testing.T) {
	base := "relatorio_censo_preenchimento_escolas"

	tests := []struct {
		name    string
		filters reportFilters
		want    string
	}{
		{
			name:    "ano especifico",
			filters: reportFilters{Year: 2026},
			want:    "relatorio_censo_preenchimento_escolas_2026.xlsx",
		},
		{
			name:    "todos os anos",
			filters: reportFilters{Year: 0},
			want:    "relatorio_censo_preenchimento_escolas_todos_anos.xlsx",
		},
		{
			name:    "ano e dre",
			filters: reportFilters{Year: 2026, DRE: "Belém"},
			want:    "relatorio_censo_preenchimento_escolas_2026_dre_belem.xlsx",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildReportFileName(base, tt.filters)
			if got != tt.want {
				t.Fatalf("buildReportFileName = %q; want %q", got, tt.want)
			}
			if strings.ContainsAny(got, " /\\") {
				t.Fatalf("filename %q contém caractere inseguro", got)
			}
		})
	}
}

// TestWriteReportXLSXNonEmpty garante que a geração produz um arquivo XLSX
// não vazio com o título e os cabeçalhos esperados.
func TestWriteReportXLSXNonEmpty(t *testing.T) {
	rd := reportData{
		Title:       "Relatório de Teste",
		SheetName:   "Preenchimento Censo",
		FiltersLine: "Filtros aplicados — Ano: 2026",
		Headers:     censoPreenchimentoReportColumns,
		Rows: [][]any{
			{"GUAJARA", "BELEM", "BELEM", "Urbana", "12345678", "Escola X",
				"Pendente", "", "", "Não", "", "Aguardando preenchimento"},
			{"GUAJARA", "BELEM", "BELEM", "Urbana", "87654321", "Escola Y",
				"Concluído", 2026, "01/06/2026 10:00", "Sim", "02/06/2026 11:00", "Concluído e sincronizado"},
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

	// A aba deve existir com o nome amigável.
	if idx, err := f.GetSheetIndex("Preenchimento Censo"); err != nil || idx < 0 {
		t.Fatalf("aba 'Preenchimento Censo' não encontrada (idx=%d, err=%v)", idx, err)
	}

	// Título na A1.
	if v, err := f.GetCellValue("Preenchimento Censo", "A1"); err != nil || v != "Relatório de Teste" {
		t.Fatalf("A1 = %q (err=%v); want título", v, err)
	}

	// Primeiro cabeçalho na linha 4.
	if v, err := f.GetCellValue("Preenchimento Censo", "A4"); err != nil || v != "Região de Integração" {
		t.Fatalf("A4 = %q (err=%v); want primeiro cabeçalho", v, err)
	}

	// Primeira linha de dados na linha 5.
	if v, err := f.GetCellValue("Preenchimento Censo", "G5"); err != nil || v != "Pendente" {
		t.Fatalf("G5 = %q (err=%v); want 'Pendente'", v, err)
	}
}

// TestCensoPreenchimentoQueryShape valida o formato da consulta do piloto:
// parte de schools s, usa LEFT JOIN (inclui escolas pendentes), filtro de
// ano opcional ($1 = 0 OR year = $1), filtros globais por AND e ordenação
// por prioridade gerencial. Não pode exigir status='completed' no WHERE.
func TestCensoPreenchimentoQueryShape(t *testing.T) {
	q := censoPreenchimentoSelectSQL

	mustContain := []string{
		"FROM schools s",
		"LEFT JOIN latest_census cr",
		"LEFT JOIN reg_integracao ri",
		"DISTINCT ON (school_id)",
		"($1 = 0 OR year = $1)",
		"($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
		"($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))",
		"($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))",
		"FROM reg_integracao",
		"UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))",
		"WHEN cr.status IS NULL THEN 1",
		"WHEN cr.status = 'draft' THEN 2",
	}
	for _, frag := range mustContain {
		if !strings.Contains(q, frag) {
			t.Fatalf("query não contém %q", frag)
		}
	}

	if strings.Contains(q, "INNER JOIN") {
		t.Fatalf("query usa INNER JOIN; o LEFT JOIN deve incluir escolas pendentes")
	}
	if strings.Contains(q, "AND status = 'completed'") || strings.Contains(q, "s.status = 'completed'") {
		t.Fatalf("query exige status='completed' no WHERE geral; pendentes/rascunhos seriam excluídos")
	}
}
