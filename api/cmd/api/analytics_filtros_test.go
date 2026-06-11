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
}

func TestParseAnalyticsFilters_AbsentFiltersEmpty(t *testing.T) {
	q := url.Values{}
	f := parseAnalyticsFiltersFromValues(q, fixedNow)
	if f.DRE != "" || f.Municipio != "" || f.Zona != "" || f.RegiaoIntegracao != "" {
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
	}
	args := f.Args()
	if len(args) != 5 {
		t.Fatalf("expected 5 args, got %d", len(args))
	}
	want := []any{2024, "d", "m", "z", "r"}
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
	}
	for _, frag := range mustContain {
		if !strings.Contains(sql, frag) {
			t.Fatalf("WhereSQL missing %q\n--- got ---\n%s", frag, sql)
		}
	}
}
