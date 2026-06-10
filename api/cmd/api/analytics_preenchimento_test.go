package main

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

// TestPreenchimentoParseFiltersDefaultYear cobre o ano padrão: ausente ou
// inválido cai no ano corrente (mesma regra de parseAnalyticsFilters).
func TestPreenchimentoParseFiltersDefaultYear(t *testing.T) {
	now := time.Date(2026, time.June, 10, 0, 0, 0, 0, time.UTC)

	t.Run("year ausente usa ano corrente", func(t *testing.T) {
		got := parsePreenchimentoDreFilters(url.Values{}, now)
		if got.Year != 2026 {
			t.Fatalf("year = %d; want 2026 (ano corrente)", got.Year)
		}
	})

	for _, invalid := range []string{"", "abc", "0", "-5", "  "} {
		t.Run("year invalido "+invalid, func(t *testing.T) {
			q := url.Values{"year": {invalid}}
			got := parsePreenchimentoDreFilters(q, now)
			if got.Year != 2026 {
				t.Fatalf("year inválido %q = %d; want 2026 (ano corrente)", invalid, got.Year)
			}
		})
	}
}

// TestPreenchimentoParseFiltersValidYear garante que um year válido é usado.
func TestPreenchimentoParseFiltersValidYear(t *testing.T) {
	now := time.Date(2026, time.June, 10, 0, 0, 0, 0, time.UTC)
	got := parsePreenchimentoDreFilters(url.Values{"year": {"2025"}}, now)
	if got.Year != 2025 {
		t.Fatalf("year = %d; want 2025", got.Year)
	}
	// Espaços ao redor do year são tolerados.
	got = parsePreenchimentoDreFilters(url.Values{"year": {" 2024 "}}, now)
	if got.Year != 2024 {
		t.Fatalf("year com espaços = %d; want 2024", got.Year)
	}
}

// TestPreenchimentoParseFiltersStrings cobre a leitura dos filtros globais
// textuais: valores são lidos, espaços removidos e ausência vira string vazia.
func TestPreenchimentoParseFiltersStrings(t *testing.T) {
	now := time.Date(2026, time.June, 10, 0, 0, 0, 0, time.UTC)

	t.Run("todos preenchidos", func(t *testing.T) {
		q := url.Values{
			"dre":               {"CASTANHAL"},
			"municipio":         {"BELEM"},
			"zona":              {"Urbana"},
			"regiao_integracao": {"GUAJARA"},
		}
		got := parsePreenchimentoDreFilters(q, now)
		if got.DRE != "CASTANHAL" || got.Municipio != "BELEM" ||
			got.Zona != "Urbana" || got.RegiaoIntegracao != "GUAJARA" {
			t.Fatalf("parsePreenchimentoDreFilters = %+v; filtros não lidos", got)
		}
	})

	t.Run("ausentes viram vazio", func(t *testing.T) {
		got := parsePreenchimentoDreFilters(url.Values{}, now)
		if got.DRE != "" || got.Municipio != "" || got.Zona != "" || got.RegiaoIntegracao != "" {
			t.Fatalf("filtros ausentes = %+v; want strings vazias", got)
		}
	})

	t.Run("espacos sao removidos (filtro desativado)", func(t *testing.T) {
		q := url.Values{
			"dre":               {"  "},
			"municipio":         {"  Castanhal  "},
			"zona":              {""},
			"regiao_integracao": {"\t"},
		}
		got := parsePreenchimentoDreFilters(q, now)
		if got.DRE != "" || got.Municipio != "Castanhal" || got.Zona != "" || got.RegiaoIntegracao != "" {
			t.Fatalf("filtros com espaços = %+v; want apenas municipio=Castanhal", got)
		}
	})
}

// TestPreenchimentoBuildQueryArgs garante que cada filtro global é posicionado
// no argumento correto ($1=year, $2=dre, $3=municipio, $4=zona,
// $5=regiao_integracao) e combinado por AND sobre schools s.
func TestPreenchimentoBuildQueryArgs(t *testing.T) {
	tests := []struct {
		name    string
		filters preenchimentoDreFilters
		want    []any
	}{
		{
			name:    "sem filtros",
			filters: preenchimentoDreFilters{Year: 2026},
			want:    []any{2026, "", "", "", ""},
		},
		{
			name:    "filtro por dre",
			filters: preenchimentoDreFilters{Year: 2026, DRE: "CASTANHAL"},
			want:    []any{2026, "CASTANHAL", "", "", ""},
		},
		{
			name:    "filtro por municipio",
			filters: preenchimentoDreFilters{Year: 2026, Municipio: "BELEM"},
			want:    []any{2026, "", "BELEM", "", ""},
		},
		{
			name:    "filtro por zona",
			filters: preenchimentoDreFilters{Year: 2026, Zona: "Urbana"},
			want:    []any{2026, "", "", "Urbana", ""},
		},
		{
			name:    "filtro por regiao_integracao",
			filters: preenchimentoDreFilters{Year: 2026, RegiaoIntegracao: "GUAJARA"},
			want:    []any{2026, "", "", "", "GUAJARA"},
		},
		{
			name: "multiplos filtros combinados por AND",
			filters: preenchimentoDreFilters{
				Year:             2025,
				DRE:              "BELEM",
				Municipio:        "BELEM",
				Zona:             "Urbana",
				RegiaoIntegracao: "GUAJARA",
			},
			want: []any{2025, "BELEM", "BELEM", "Urbana", "GUAJARA"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			query, args := buildPreenchimentoDreQuery(tt.filters)
			if len(args) != len(tt.want) {
				t.Fatalf("args = %v; want %v", args, tt.want)
			}
			for i := range tt.want {
				if args[i] != tt.want[i] {
					t.Fatalf("args[%d] = %v; want %v (args=%v)", i, args[i], tt.want[i], args)
				}
			}
			if query != preenchimentoDreSelectSQL {
				t.Fatalf("query difere de preenchimentoDreSelectSQL")
			}
		})
	}
}

// TestPreenchimentoQueryShape valida o formato da query: parte de schools s, usa
// LEFT JOIN, limita census_responses ao ano, conta completed e draft, agrupa por
// DRE com fallback "Não informado", combina filtros por AND e usa DISTINCT ON
// como salvaguarda contra múltiplos censos por escola/ano. Não pode exigir
// status='completed' no WHERE geral nem census_id IS NOT NULL.
func TestPreenchimentoQueryShape(t *testing.T) {
	query := preenchimentoDreSelectSQL

	mustContain := []string{
		"FROM schools s",
		"LEFT JOIN latest_census cr",
		"FROM census_responses",
		"WHERE year = $1",
		"DISTINCT ON (school_id)",
		"FILTER (WHERE cr.status = 'completed')",
		"FILTER (WHERE cr.status = 'draft')",
		"COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')",
		"($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
		"($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))",
		"($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))",
		"FROM reg_integracao",
		"UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))",
	}
	for _, fragment := range mustContain {
		if !strings.Contains(query, fragment) {
			t.Fatalf("query não contém %q", fragment)
		}
	}

	// O LEFT JOIN deve ser preservado: escolas sem censo continuam no recorte.
	if strings.Contains(query, "INNER JOIN") {
		t.Fatalf("query usa INNER JOIN; o LEFT JOIN deve ser preservado")
	}
	// O WHERE geral não pode restringir o universo a censos concluídos nem exigir
	// census_id — isso eliminaria rascunhos e pendentes que precisamos contar.
	if strings.Contains(query, "s.status = 'completed'") ||
		strings.Contains(query, "AND status = 'completed'") {
		t.Fatalf("query exige status='completed' no WHERE geral; rascunhos/pendentes seriam excluídos")
	}
	if strings.Contains(query, "census_id IS NOT NULL") {
		t.Fatalf("query exige census_id IS NOT NULL; escolas sem censo seriam excluídas")
	}

	// Os filtros globais devem estar sob a mesma cláusula WHERE (combinados por AND).
	if strings.Count(query, " AND ($") < 3 {
		t.Fatalf("filtros globais não parecem combinados por AND: %s", query)
	}
}

// TestPreenchimentoDoesNotUseAnalyticsWhereSQL garante, de forma defensiva, que
// este endpoint não reutiliza o WHERE de AnalyticsFilters, que exige
// status='completed' AND census_id IS NOT NULL.
func TestPreenchimentoDoesNotUseAnalyticsWhereSQL(t *testing.T) {
	if strings.Contains(preenchimentoDreSelectSQL, (AnalyticsFilters{}).WhereSQL()) {
		t.Fatalf("preenchimentoDreSelectSQL reutiliza AnalyticsFilters.WhereSQL(); use WHERE próprio")
	}
}

// TestPreenchimentoCompletionPercentage cobre o cálculo do percentual inteiro.
func TestPreenchimentoCompletionPercentage(t *testing.T) {
	tests := []struct {
		name      string
		completed int
		total     int
		want      int
	}{
		{"recorte vazio", 0, 0, 0},
		{"metade", 5, 10, 50},
		{"tudo concluido", 10, 10, 100},
		{"nada concluido", 0, 10, 0},
		{"arredonda para cima", 2, 3, 67},
		{"arredonda para baixo", 1, 3, 33},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := completionPercentage(tt.completed, tt.total); got != tt.want {
				t.Fatalf("completionPercentage(%d, %d) = %d; want %d", tt.completed, tt.total, got, tt.want)
			}
		})
	}
}

// TestPreenchimentoBuildRow cobre o cálculo de pendentes e percentual por linha:
// pending = total - completed - draft.
func TestPreenchimentoBuildRow(t *testing.T) {
	t.Run("conta completed, draft e pending", func(t *testing.T) {
		row := buildPreenchimentoDreRow("CASTANHAL", 10, 4, 3)
		if row.DRE != "CASTANHAL" {
			t.Fatalf("dre = %q; want CASTANHAL", row.DRE)
		}
		if row.Total != 10 || row.Completed != 4 || row.Draft != 3 {
			t.Fatalf("contagens = %+v; want total=10 completed=4 draft=3", row)
		}
		if row.Pending != 3 {
			t.Fatalf("pending = %d; want 3 (10-4-3)", row.Pending)
		}
		if row.CompletionPercentage != 40 {
			t.Fatalf("completion_percentage = %d; want 40", row.CompletionPercentage)
		}
	})

	t.Run("pending nunca fica negativo", func(t *testing.T) {
		// Defensivo: se as contagens forem inconsistentes, pending não fica < 0.
		row := buildPreenchimentoDreRow("X", 2, 2, 1)
		if row.Pending != 0 {
			t.Fatalf("pending = %d; want 0 (clamp em zero)", row.Pending)
		}
	})

	t.Run("escola sem censo conta como pendente", func(t *testing.T) {
		row := buildPreenchimentoDreRow("Y", 5, 0, 0)
		if row.Pending != 5 || row.CompletionPercentage != 0 {
			t.Fatalf("row = %+v; want pending=5 e 0%%", row)
		}
	})
}
