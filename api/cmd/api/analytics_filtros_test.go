package main

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

var fixedNow = time.Date(2025, time.March, 15, 10, 0, 0, 0, time.UTC)

func TestParseAnalyticsFilters_YearMissingUsesCurrent(t *testing.T) {
	q := url.Values{}
	f := parseAnalyticsFiltersFromValues(q, fixedNow)
	if f.Year != fixedNow.Year() {
		t.Fatalf("expected year %d, got %d", fixedNow.Year(), f.Year)
	}
}

func TestParseAnalyticsFilters_YearInvalidUsesCurrent(t *testing.T) {
	cases := []string{"abc", "0", "-5", "   ", ""}
	for _, c := range cases {
		q := url.Values{"year": {c}}
		f := parseAnalyticsFiltersFromValues(q, fixedNow)
		if f.Year != fixedNow.Year() {
			t.Fatalf("year %q: expected fallback %d, got %d", c, fixedNow.Year(), f.Year)
		}
	}
}

func TestParseAnalyticsFilters_YearValidWithSpaces(t *testing.T) {
	q := url.Values{"year": {"  2024  "}}
	f := parseAnalyticsFiltersFromValues(q, fixedNow)
	if f.Year != 2024 {
		t.Fatalf("expected year 2024, got %d", f.Year)
	}
}

func TestParseAnalyticsFilters_TextualFiltersTrimmed(t *testing.T) {
	q := url.Values{
		"dre":               {"  DRE Belém  "},
		"municipio":         {"  Belém "},
		"zona":              {" Urbana "},
		"regiao_integracao": {"  Metropolitana "},
		"codigo_inep":       {"  15000001  "},
	}
	f := parseAnalyticsFiltersFromValues(q, fixedNow)
	if f.DRE != "DRE Belém" {
		t.Fatalf("dre not trimmed: %q", f.DRE)
	}
	if f.Municipio != "Belém" {
		t.Fatalf("municipio not trimmed: %q", f.Municipio)
	}
	if f.Zona != "Urbana" {
		t.Fatalf("zona not trimmed: %q", f.Zona)
	}
	if f.RegiaoIntegracao != "Metropolitana" {
		t.Fatalf("regiao_integracao not trimmed: %q", f.RegiaoIntegracao)
	}
	if f.CodigoINEP != "15000001" {
		t.Fatalf("codigo_inep not trimmed: %q", f.CodigoINEP)
	}
}

func TestParseAnalyticsFilters_SchoolID(t *testing.T) {
	f := parseAnalyticsFiltersFromValues(url.Values{"school_id": {" 42 "}}, fixedNow)
	if f.SchoolID != 42 {
		t.Fatalf("expected school_id 42, got %d", f.SchoolID)
	}
}

func TestParseAnalyticsFilters_CodigoINEP(t *testing.T) {
	f := parseAnalyticsFiltersFromValues(url.Values{"codigo_inep": {" 15000001 "}}, fixedNow)
	if f.CodigoINEP != "15000001" {
		t.Fatalf("expected codigo_inep to be trimmed, got %q", f.CodigoINEP)
	}
}

func TestParseAnalyticsFilters_AbsentFiltersEmpty(t *testing.T) {
	q := url.Values{}
	f := parseAnalyticsFiltersFromValues(q, fixedNow)
	if f.DRE != "" || f.Municipio != "" || f.Zona != "" || f.RegiaoIntegracao != "" || f.SchoolID != 0 || f.CodigoINEP != "" {
		t.Fatalf("expected empty textual filters, got %+v", f)
	}
}

func TestAnalyticsFilters_ArgsOrder(t *testing.T) {
	f := AnalyticsFilters{
		Year:             2024,
		DRE:              "d",
		Municipio:        "m",
		Zona:             "z",
		RegiaoIntegracao: "r",
		SchoolID:         99,
		CodigoINEP:       "15000001",
	}
	args := f.Args()
	if len(args) != 7 {
		t.Fatalf("expected 7 args, got %d", len(args))
	}
	want := []any{2024, "d", "m", "z", "r", 99, "15000001"}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("arg %d: expected %v, got %v", i, want[i], args[i])
		}
	}
}

func TestAnalyticsFilters_WhereSQL(t *testing.T) {
	sql := AnalyticsFilters{}.WhereSQL()
	mustContain := []string{
		"status = 'completed'",
		"year = $1",
		"census_id IS NOT NULL",
		"UPPER(TRIM(dre)) = UPPER(TRIM($2))",
		"UPPER(TRIM(municipio)) = UPPER(TRIM($3))",
		"UPPER(TRIM(zona)) = UPPER(TRIM($4))",
		"UPPER(TRIM(municipio)) IN",
		"UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))",
		"($6 = 0 OR school_id = $6)",
		"UPPER(TRIM(codigo_inep)) = UPPER(TRIM($7))",
	}
	for _, frag := range mustContain {
		if !strings.Contains(sql, frag) {
			t.Fatalf("WhereSQL missing %q\n--- got ---\n%s", frag, sql)
		}
	}
}

func TestFiltrosOpcoesSchoolsWhere_CascadesSchoolAndINEP(t *testing.T) {
	f := AnalyticsFilters{
		DRE: "DRE A", Municipio: "Cidade A", Zona: "Urbana",
		RegiaoIntegracao: "RI A", SchoolID: 42, CodigoINEP: "15000001",
	}
	where, args := filtrosOpcoesSchoolsWhere(f, "s", "school_id")
	if strings.Contains(where, "s.id = $") {
		t.Fatalf("school list must exclude its own school_id filter: %s", where)
	}
	if !strings.Contains(where, "s.codigo_inep") {
		t.Fatalf("school list must retain codigo_inep cascade: %s", where)
	}
	want := []any{"DRE A", "Cidade A", "Urbana", "RI A", "15000001"}
	if len(args) != len(want) {
		t.Fatalf("expected %d cascade args, got %d: %#v", len(want), len(args), args)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("arg %d: expected %v, got %v", i, want[i], args[i])
		}
	}
}

func TestFiltrosOpcoesSchoolsWhere_INEPOptionsUseSchoolID(t *testing.T) {
	f := AnalyticsFilters{SchoolID: 42, CodigoINEP: "15000001"}
	where, args := filtrosOpcoesSchoolsWhere(f, "s", "codigo_inep")
	if !strings.Contains(where, "s.id = $5") {
		t.Fatalf("INEP options must retain school_id cascade: %s", where)
	}
	if strings.Contains(where, "s.codigo_inep") {
		t.Fatalf("INEP options must exclude their own filter: %s", where)
	}
	if len(args) != 5 || args[4] != 42 {
		t.Fatalf("unexpected INEP option args: %#v", args)
	}
}
