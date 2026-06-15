package main

import (
	"net/url"
	"strings"
	"testing"
)

func TestParseProdepFilters_DefaultsAllDisabled(t *testing.T) {
	f, err := parseProdepFilters(url.Values{})
	if err != nil {
		t.Fatalf("filtros vazios não devem falhar: %v", err)
	}
	if f.Ano != 0 || f.Categoria != "" || f.DRE != "" || f.Municipio != "" ||
		f.RI != "" || f.MatchStatus != "" || f.StatusPrestacaoContas != "" {
		t.Fatalf("esperava todos os filtros desativados, obtive %+v", f)
	}
}

func TestParseProdepFilters_ValidValues(t *testing.T) {
	q := url.Values{
		"ano":                     {"2024"},
		"categoria":               {"alimentacao"},
		"dre":                     {" DRE X "},
		"municipio":               {"Belém"},
		"ri":                      {"RI 1"},
		"match_status":            {"matched_by_base_dige"},
		"status_prestacao_contas": {"nao_prestou_contas"},
	}
	f, err := parseProdepFilters(q)
	if err != nil {
		t.Fatalf("valores válidos não devem falhar: %v", err)
	}
	if f.Ano != 2024 {
		t.Fatalf("ano: esperava 2024, obtive %d", f.Ano)
	}
	if f.Categoria != "alimentacao" {
		t.Fatalf("categoria: esperava alimentacao, obtive %q", f.Categoria)
	}
	if f.DRE != "DRE X" { // TrimSpace aplicado
		t.Fatalf("dre: esperava \"DRE X\" (trim), obtive %q", f.DRE)
	}
	if f.MatchStatus != "matched_by_base_dige" {
		t.Fatalf("match_status inesperado: %q", f.MatchStatus)
	}
	if f.StatusPrestacaoContas != "nao_prestou_contas" {
		t.Fatalf("status_prestacao_contas inesperado: %q", f.StatusPrestacaoContas)
	}
}

func TestParseProdepFilters_InvalidValuesRejected(t *testing.T) {
	cases := map[string]url.Values{
		"ano fora do domínio":       {"ano": {"2022"}},
		"ano não numérico":          {"ano": {"abc"}},
		"categoria inválida":        {"categoria": {"transporte"}},
		"match_status inválido":     {"match_status": {"qualquer"}},
		"status_prestacao inválido": {"status_prestacao_contas": {"pendente"}},
	}
	for name, q := range cases {
		if _, err := parseProdepFilters(q); err == nil {
			t.Fatalf("%s: esperava erro de validação, obtive nil", name)
		}
	}
}

func TestProdepAccentMapsSameLength(t *testing.T) {
	// translate() exige que os dois lados tenham o mesmo número de caracteres.
	from := []rune(prodepAccentFrom)
	to := []rune(prodepAccentTo)
	if len(from) != len(to) {
		t.Fatalf("mapas de acento com tamanhos diferentes: from=%d to=%d", len(from), len(to))
	}
}

func TestSQLNormalizeProdep_WithPrefix(t *testing.T) {
	got := sqlNormalizeProdep("$3::text", "DRE")
	for _, want := range []string{"regexp_replace(", "$3::text", "DRE", "translate(", "UPPER(TRIM("} {
		if !strings.Contains(got, want) {
			t.Fatalf("expressão normalizada não contém %q: %s", want, got)
		}
	}
}

func TestSQLNormalizeProdep_NoPrefix(t *testing.T) {
	got := sqlNormalizeProdep("COALESCE(municipio_resolvido, '')", "")
	if strings.Contains(got, "regexp_replace(") {
		t.Fatalf("prefixo vazio não deveria gerar regexp_replace: %s", got)
	}
	for _, want := range []string{"translate(", "UPPER(TRIM(", "municipio_resolvido"} {
		if !strings.Contains(got, want) {
			t.Fatalf("expressão normalizada não contém %q: %s", want, got)
		}
	}
}

func TestProdepWhereSQLNormalizesGeoFilters(t *testing.T) {
	// O WHERE montado deve aplicar a normalização aos filtros geográficos e
	// preservar os filtros enumerados sem alteração.
	for _, want := range []string{"dre_prodep", "municipio_resolvido", "ri_prodep", "translate(", "regexp_replace("} {
		if !strings.Contains(prodepWhereSQL, want) {
			t.Fatalf("prodepWhereSQL não contém %q", want)
		}
	}
	if !strings.Contains(prodepWhereSQL, "usar_na_carga = true") {
		t.Fatalf("prodepWhereSQL deve manter o filtro usar_na_carga = true")
	}
}

func TestPctReprogramado(t *testing.T) {
	cases := []struct {
		reprogramado, recebido, want float64
	}{
		{0, 0, 0},     // denominador zero → 0
		{50, 0, 0},    // denominador zero → 0 (mesmo com numerador)
		{50, 200, 25}, // 25%
		{1, 3, 33.33}, // arredonda a 2 casas
		{100, 100, 100},
	}
	for _, c := range cases {
		if got := pctReprogramado(c.reprogramado, c.recebido); got != c.want {
			t.Fatalf("pctReprogramado(%v, %v) = %v, esperava %v", c.reprogramado, c.recebido, got, c.want)
		}
	}
}
