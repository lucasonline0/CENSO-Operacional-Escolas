package main

import (
	"net/url"
	"strings"
	"testing"
)

func TestPctGovernanca(t *testing.T) {
	cases := []struct {
		total, denominador int64
		want               float64
	}{
		{0, 0, 0},      // denominador zero → 0 (não erro)
		{10, 0, 0},     // denominador zero → 0 mesmo com numerador
		{0, 822, 0},    // numerador zero → 0
		{411, 822, 50}, // 50%
		{1, 3, 33.33},  // arredonda a 2 casas
		{624, 822, 75.91},
		{822, 822, 100},
	}
	for _, c := range cases {
		if got := pctGovernanca(c.total, c.denominador); got != c.want {
			t.Fatalf("pctGovernanca(%d, %d) = %v, esperava %v", c.total, c.denominador, got, c.want)
		}
	}
}

func TestNovoGovernancaIndicador(t *testing.T) {
	ind := novoGovernancaIndicador(624, 822)
	if ind.Total != 624 {
		t.Fatalf("total: esperava 624, obtive %d", ind.Total)
	}
	if ind.Denominador != 822 {
		t.Fatalf("denominador: esperava 822, obtive %d", ind.Denominador)
	}
	if ind.Percentual != 75.91 {
		t.Fatalf("percentual: esperava 75.91, obtive %v", ind.Percentual)
	}

	// Denominador zero não deve quebrar e o percentual deve ser 0.
	vazio := novoGovernancaIndicador(0, 0)
	if vazio.Percentual != 0 {
		t.Fatalf("denominador zero: esperava percentual 0, obtive %v", vazio.Percentual)
	}
}

func TestParseGovernancaInstitucionalFilters_Defaults(t *testing.T) {
	f := parseGovernancaInstitucionalFilters(url.Values{})
	if f.DRE != "" || f.Municipio != "" || f.Zona != "" {
		t.Fatalf("esperava todos os filtros vazios, obtive %+v", f)
	}
}

func TestParseGovernancaInstitucionalFilters_TrimEIgnoraOutros(t *testing.T) {
	q := url.Values{
		"dre":       {"  DRE Abaetetuba  "},
		"municipio": {" Acará "},
		"zona":      {" Rural "},
		// Filtros que NÃO se aplicam a Governança Institucional devem ser ignorados.
		"ano": {"2025"},
		"ri":  {"RI Xingu"},
	}
	f := parseGovernancaInstitucionalFilters(q)
	if f.DRE != "DRE Abaetetuba" {
		t.Fatalf("dre: esperava \"DRE Abaetetuba\" (trim), obtive %q", f.DRE)
	}
	if f.Municipio != "Acará" {
		t.Fatalf("municipio: esperava \"Acará\" (trim), obtive %q", f.Municipio)
	}
	if f.Zona != "Rural" {
		t.Fatalf("zona: esperava \"Rural\" (trim), obtive %q", f.Zona)
	}
}

func TestGovernancaInstitucionalFiltersArgsOrder(t *testing.T) {
	f := governancaInstitucionalFilters{DRE: "d", Municipio: "m", Zona: "z"}
	args := f.args()
	if len(args) != 3 {
		t.Fatalf("esperava 3 args ($1=dre $2=municipio $3=zona), obtive %d", len(args))
	}
	if args[0] != "d" || args[1] != "m" || args[2] != "z" {
		t.Fatalf("ordem dos args incorreta: %+v", args)
	}
}

func TestGovernancaInstitucionalWhereSQLParametrizado(t *testing.T) {
	// O WHERE deve usar placeholders posicionais e comparações case-insensitive,
	// nunca interpolar valores da UI.
	for _, want := range []string{"$1", "$2", "$3", "UPPER(TRIM(dre))", "UPPER(TRIM(municipio))", "UPPER(TRIM(zona))"} {
		if !strings.Contains(governancaInstitucionalWhereSQL, want) {
			t.Fatalf("governancaInstitucionalWhereSQL não contém %q", want)
		}
	}
}
