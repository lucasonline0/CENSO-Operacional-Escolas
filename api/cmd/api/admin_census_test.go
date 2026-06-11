package main

// Testes de /v1/admin/census (tela "Registros do Censo").
//
// Limitação: o repositório não possui infraestrutura de teste com banco de
// dados (não há harness de PostgreSQL nos testes — ver
// analytics_saude_operacional_test.go, que segue o mesmo padrão). Por isso a
// cobertura aqui é unitária, sobre os helpers que alimentam o handler:
//
//   - parseCensusListParams — leitura e defaults dos parâmetros;
//   - censusListWhereSQL / whereArgs — forma da cláusula compartilhada e ordem
//     dos argumentos (a presença do valor no placeholder correto comprova que o
//     filtro incide na query, inclusive no recorte vazio, que é só um recorte
//     sem linhas correspondentes);
//   - censusListCountSQL / censusListSelectSQL — COUNT e listagem usam a MESMA
//     cláusula (mesma constante), logo respeitam os mesmos filtros;
//   - censusSummarySQL / summaryArgs — o resumo respeita os filtros globais e
//     não recebe status/search/page/limit.
//
// O comportamento fim-a-fim (linhas retornadas, contagens reais, paginação com
// dados) depende de banco e fica para validação em homologação, como nas demais
// telas migradas.

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

// ─── parseCensusListParams ───────────────────────────────────────────────────

// Cenário 1 da task: sem filtros — tudo desativado, paginação default.
func TestCensusListParamsDefaults(t *testing.T) {
	got := parseCensusListParams(url.Values{})
	want := censusListParams{Limit: 10, Page: 1}
	if got != want {
		t.Fatalf("parseCensusListParams(empty) = %+v; want %+v", got, want)
	}
}

func TestCensusListParamsParsing(t *testing.T) {
	q := url.Values{
		"status":            {"completed"},
		"year":              {"2026"},
		"dre":               {"  CASTANHAL  "},
		"municipio":         {"BELEM"},
		"zona":              {"Urbana"},
		"regiao_integracao": {"GUAJARA"},
		"search":            {"  escola azul  "},
		"limit":             {"100"},
		"page":              {"3"},
	}
	got := parseCensusListParams(q)
	want := censusListParams{
		Status:           "completed",
		Year:             2026,
		DRE:              "CASTANHAL",
		Municipio:        "BELEM",
		Zona:             "Urbana",
		RegiaoIntegracao: "GUAJARA",
		Search:           "escola azul",
		Limit:            100,
		Page:             3,
	}
	if got != want {
		t.Fatalf("parseCensusListParams = %+v; want %+v", got, want)
	}
}

// Cenário 16 da task: limit inválido volta para 10; só {10,50,100,1000} valem.
func TestCensusListParamsLimitFallback(t *testing.T) {
	for _, valid := range []int{10, 50, 100, 1000} {
		t.Run(fmt.Sprintf("valid_%d", valid), func(t *testing.T) {
			got := parseCensusListParams(url.Values{"limit": {strconv.Itoa(valid)}})
			if got.Limit != valid {
				t.Fatalf("limit = %d; want %d", got.Limit, valid)
			}
		})
	}
	for _, invalid := range []string{"0", "-5", "25", "999", "1001", "abc", ""} {
		t.Run("invalid_"+invalid, func(t *testing.T) {
			got := parseCensusListParams(url.Values{"limit": {invalid}})
			if got.Limit != 10 {
				t.Fatalf("limit(%q) = %d; want fallback 10", invalid, got.Limit)
			}
		})
	}
}

// Cenário 17 da task: page ausente ou inválida volta para 1.
func TestCensusListParamsPageFallback(t *testing.T) {
	if got := parseCensusListParams(url.Values{"page": {"4"}}); got.Page != 4 {
		t.Fatalf("page = %d; want 4", got.Page)
	}
	for _, invalid := range []string{"0", "-1", "abc", ""} {
		t.Run("invalid_"+invalid, func(t *testing.T) {
			got := parseCensusListParams(url.Values{"page": {invalid}})
			if got.Page != 1 {
				t.Fatalf("page(%q) = %d; want fallback 1", invalid, got.Page)
			}
		})
	}
}

// year ausente/inválido não filtra (Year=0); nunca assume ano corrente.
func TestCensusListParamsYearFallback(t *testing.T) {
	if got := parseCensusListParams(url.Values{"year": {"2025"}}); got.Year != 2025 {
		t.Fatalf("year = %d; want 2025", got.Year)
	}
	for _, invalid := range []string{"", "abc", "0", "-2026"} {
		t.Run("invalid_"+invalid, func(t *testing.T) {
			got := parseCensusListParams(url.Values{"year": {invalid}})
			if got.Year != 0 {
				t.Fatalf("year(%q) = %d; want 0 (sem filtro)", invalid, got.Year)
			}
		})
	}
}

// Espaços em branco equivalem a filtro desativado.
func TestCensusListParamsBlankFilters(t *testing.T) {
	q := url.Values{
		"status":            {"  "},
		"dre":               {""},
		"municipio":         {"\t"},
		"zona":              {" "},
		"regiao_integracao": {"  "},
		"search":            {"   "},
	}
	got := parseCensusListParams(q)
	want := censusListParams{Limit: 10, Page: 1}
	if got != want {
		t.Fatalf("parseCensusListParams(blanks) = %+v; want %+v", got, want)
	}
}

// ─── whereArgs — cenários 2 a 8 da task ──────────────────────────────────────

// Cada filtro ocupa o placeholder correto de censusListWhereSQL; múltiplos
// filtros preenchem múltiplos placeholders e a cláusula combina-os por AND.
func TestCensusListWhereArgsOrder(t *testing.T) {
	tests := []struct {
		name   string
		params censusListParams
		want   []any
	}{
		{
			name:   "sem filtros",
			params: censusListParams{Limit: 10, Page: 1},
			want:   []any{"", 0, "", "", "", "", ""},
		},
		{
			name:   "filtro por status",
			params: censusListParams{Status: "completed"},
			want:   []any{"completed", 0, "", "", "", "", ""},
		},
		{
			name:   "filtro por year",
			params: censusListParams{Year: 2026},
			want:   []any{"", 2026, "", "", "", "", ""},
		},
		{
			name:   "filtro por DRE",
			params: censusListParams{DRE: "CASTANHAL"},
			want:   []any{"", 0, "CASTANHAL", "", "", "", ""},
		},
		{
			name:   "filtro por municipio",
			params: censusListParams{Municipio: "BELEM"},
			want:   []any{"", 0, "", "BELEM", "", "", ""},
		},
		{
			name:   "filtro por zona",
			params: censusListParams{Zona: "Urbana"},
			want:   []any{"", 0, "", "", "Urbana", "", ""},
		},
		{
			name:   "filtro por regiao de integracao",
			params: censusListParams{RegiaoIntegracao: "GUAJARA"},
			want:   []any{"", 0, "", "", "", "GUAJARA", ""},
		},
		{
			name:   "busca textual",
			params: censusListParams{Search: "escola azul"},
			want:   []any{"", 0, "", "", "", "", "escola azul"},
		},
		{
			name: "combinacao por AND",
			params: censusListParams{
				Status: "draft", Year: 2025, DRE: "BELEM", Municipio: "BELEM",
				Zona: "Rural", RegiaoIntegracao: "GUAJARA", Search: "inep",
			},
			want: []any{"draft", 2025, "BELEM", "BELEM", "Rural", "GUAJARA", "inep"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.params.whereArgs()
			if len(got) != len(tt.want) {
				t.Fatalf("args = %v; want %v", got, tt.want)
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Fatalf("args[%d] = %v; want %v (args=%v)", i, got[i], tt.want[i], got)
				}
			}
		})
	}
}

// ─── Forma das queries ───────────────────────────────────────────────────────

// A cláusula compartilhada aplica cada filtro no campo certo, combinada por AND.
func TestCensusListWhereShape(t *testing.T) {
	mustContain := []string{
		`($1 = '' OR cr.status = $1)`,
		`($2 = 0 OR cr.year = $2)`,
		`($3 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($3)))`,
		`($4 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($4)))`,
		`($5 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($5)))`,
		`FROM reg_integracao`,
		`UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($6))`,
	}
	for _, fragment := range mustContain {
		if !strings.Contains(censusListWhereSQL, fragment) {
			t.Fatalf("censusListWhereSQL não contém %q", fragment)
		}
	}
	if strings.Count(censusListWhereSQL, "AND ($") < 6 {
		t.Fatalf("filtros não parecem combinados por AND: %s", censusListWhereSQL)
	}
}

// Cenário 12 da task: a busca textual roda no banco (ILIKE parametrizado) sobre
// escola, INEP, município, DRE, status e ano — não apenas na página carregada.
func TestCensusListSearchShape(t *testing.T) {
	mustContain := []string{
		`s.nome_escola ILIKE '%' || $7 || '%'`,
		`s.codigo_inep ILIKE '%' || $7 || '%'`,
		`s.municipio ILIKE '%' || $7 || '%'`,
		`s.dre ILIKE '%' || $7 || '%'`,
		`cr.status ILIKE '%' || $7 || '%'`,
		`cr.year::text ILIKE '%' || $7 || '%'`,
	}
	for _, fragment := range mustContain {
		if !strings.Contains(censusListWhereSQL, fragment) {
			t.Fatalf("busca não cobre %q", fragment)
		}
	}
}

// Cenário 9 da task: COUNT(*) e listagem usam a MESMA cláusula (a constante
// censusListWhereSQL aparece literalmente nas duas queries), então o total
// paginado respeita exatamente os filtros das linhas exibidas.
func TestCensusListCountAndSelectShareWhere(t *testing.T) {
	if !strings.Contains(censusListCountSQL, censusListWhereSQL) {
		t.Fatalf("COUNT não embute censusListWhereSQL")
	}
	if !strings.Contains(censusListSelectSQL, censusListWhereSQL) {
		t.Fatalf("SELECT não embute censusListWhereSQL")
	}
	if !strings.Contains(censusListCountSQL, "SELECT COUNT(*)") {
		t.Fatalf("censusListCountSQL não é um COUNT: %s", censusListCountSQL)
	}
}

// Cenários 10 e 13 da task: a listagem pagina via LIMIT $8 OFFSET $9 — os
// placeholders vêm DEPOIS dos sete filtros (inclusive search), portanto busca e
// paginação convivem na mesma query. O COUNT não pagina.
func TestCensusListPaginationShape(t *testing.T) {
	if !strings.Contains(censusListSelectSQL, "LIMIT $8 OFFSET $9") {
		t.Fatalf("SELECT não pagina com LIMIT $8 OFFSET $9: %s", censusListSelectSQL)
	}
	if !strings.Contains(censusListSelectSQL, "ORDER BY cr.updated_at DESC") {
		t.Fatalf("SELECT perdeu a ordenação por updated_at")
	}
	if strings.Contains(censusListCountSQL, "LIMIT") {
		t.Fatalf("COUNT não deve paginar: %s", censusListCountSQL)
	}
}

// ─── Resumo dos cards — cenários 14 e 15 da task ─────────────────────────────

// O resumo respeita os filtros globais: year incide sobre cr.year e os filtros
// territoriais sobre schools s, nas duas partes da query (subquery de escolas e
// contadores de censo).
func TestCensusSummaryRespectsGlobalFilters(t *testing.T) {
	mustContain := []string{
		`($1 = 0 OR cr.year = $1)`,
		`($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))`,
		`($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))`,
		`($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))`,
		`UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))`,
	}
	for _, fragment := range mustContain {
		if !strings.Contains(censusSummarySQL, fragment) {
			t.Fatalf("censusSummarySQL não contém %q", fragment)
		}
	}
	// Os filtros territoriais valem também para total_schools (subquery sobre
	// schools, que conta escolas — não respostas de censo).
	if strings.Count(censusSummarySQL, "UPPER(TRIM(s.dre)) = UPPER(TRIM($2))") != 2 {
		t.Fatalf("filtro de DRE deve aparecer na subquery de escolas e nos contadores")
	}
	if !strings.Contains(censusSummarySQL, "(SELECT COUNT(*)\n\t\t FROM schools s") {
		t.Fatalf("total_schools deve contar escolas (subquery em schools): %s", censusSummarySQL)
	}
}

// O resumo NÃO é afetado por status/search/page/limit: a query usa só $1..$5
// (filtros globais) e os status aparecem apenas como literais fixos dos cards.
func TestCensusSummaryIgnoresLocalFilters(t *testing.T) {
	for _, placeholder := range []string{"$6", "$7", "$8", "$9"} {
		if strings.Contains(censusSummarySQL, placeholder) {
			t.Fatalf("censusSummarySQL usa %s; resumo só recebe filtros globais", placeholder)
		}
	}
	if strings.Contains(censusSummarySQL, "ILIKE") {
		t.Fatalf("censusSummarySQL não deve ter busca textual")
	}
	if strings.Contains(censusSummarySQL, "LIMIT") {
		t.Fatalf("censusSummarySQL não deve paginar")
	}
	args := censusListParams{
		Status: "draft", Year: 2026, DRE: "BELEM", Municipio: "BELEM",
		Zona: "Urbana", RegiaoIntegracao: "GUAJARA", Search: "x", Limit: 50, Page: 9,
	}.summaryArgs()
	want := []any{2026, "BELEM", "BELEM", "Urbana", "GUAJARA"}
	if len(args) != len(want) {
		t.Fatalf("summaryArgs = %v; want %v", args, want)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("summaryArgs[%d] = %v; want %v", i, args[i], want[i])
		}
	}

	mustContain := []string{
		`COUNT(*) FILTER (WHERE cr.status = 'completed')`,
		`COUNT(*) FILTER (WHERE cr.status = 'draft')`,
		`COUNT(*) FILTER (WHERE cr.status = 'completed' AND cr.sheet_synced_at IS NULL)`,
	}
	for _, fragment := range mustContain {
		if !strings.Contains(censusSummarySQL, fragment) {
			t.Fatalf("censusSummarySQL não contém %q", fragment)
		}
	}
}
