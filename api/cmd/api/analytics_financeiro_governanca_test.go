package main

import (
	"net/url"
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
