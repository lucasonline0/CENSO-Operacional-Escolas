package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func requestWithAnalyticsScope(scope AdminAccessScope, query string) *http.Request {
	r := httptest.NewRequest("GET", "/admin/analytics/filtros/opcoes?"+query, nil)
	return r.WithContext(context.WithValue(r.Context(), contextKeyAdminScope, scope))
}

func TestParseAnalyticsFilters_AdminScopeKeepsQueryDRE(t *testing.T) {
	f := parseAnalyticsFilters(requestWithAnalyticsScope(AdminAccessScope{Role: RoleAdmin}, "dre=DRE_B"))
	if f.DRE != "DRE_B" {
		t.Fatalf("expected query DRE, got %q", f.DRE)
	}
}

func TestParseAnalyticsFilters_DREScopeOverridesQueryAndTrims(t *testing.T) {
	f := parseAnalyticsFilters(requestWithAnalyticsScope(AdminAccessScope{Role: RoleDRE, DRE: "  DRE_A  "}, "dre=DRE_B"))
	if f.DRE != "DRE_A" {
		t.Fatalf("expected authorized DRE, got %q", f.DRE)
	}
}

func TestParseAnalyticsFilters_WithoutScopeKeepsCompatibility(t *testing.T) {
	r := httptest.NewRequest("GET", "/admin/analytics?dre=DRE_B", nil)
	if f := parseAnalyticsFilters(r); f.DRE != "DRE_B" {
		t.Fatalf("expected query DRE, got %q", f.DRE)
	}
}

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

func TestParseAnalyticsFilters_InvalidSchoolIDMeansNoFilter(t *testing.T) {
	for _, raw := range []string{"", "   ", "abc", "0", "-1", "1.5"} {
		f := parseAnalyticsFiltersFromValues(url.Values{"school_id": {raw}}, fixedNow)
		if f.SchoolID != 0 {
			t.Fatalf("school_id %q: expected no filter, got %d", raw, f.SchoolID)
		}
	}
}

func TestParseAnalyticsFilters_SchoolAndINEPWithOtherFilters(t *testing.T) {
	f := parseAnalyticsFiltersFromValues(url.Values{
		"school_id": {"42"}, "codigo_inep": {" 15000001 "},
		"dre": {"DRE A"}, "municipio": {"Cidade A"}, "zona": {"Urbana"},
		"regiao_integracao": {"RI A"},
	}, fixedNow)
	if f.SchoolID != 42 || f.CodigoINEP != "15000001" || f.DRE != "DRE A" ||
		f.Municipio != "Cidade A" || f.Zona != "Urbana" || f.RegiaoIntegracao != "RI A" {
		t.Fatalf("combined filters were not preserved: %+v", f)
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
		DREID:            77,
	}
	args := f.Args()
	if len(args) != 8 {
		t.Fatalf("expected 8 args, got %d", len(args))
	}
	want := []any{2024, "d", "m", "z", "r", 99, "15000001", 77}
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
	if strings.Contains(sql, "15000001") || strings.Contains(sql, "DRE") || strings.Contains(sql, "42") {
		t.Fatalf("WhereSQL must not interpolate request values: %s", sql)
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

func TestFiltrosOpcoesSchoolsWhere_AuthorizedDRESurvivesExcept(t *testing.T) {
	f := AnalyticsFilters{DRE: "DRE_A"}
	where, args := filtrosOpcoesSchoolsWhereWithAuthorization(f, "s", "dre", " DRE_A ")
	if !strings.Contains(where, "s.dre") || len(args) != 6 || args[0] != "DRE_A" {
		t.Fatalf("authorized DRE was removed from cascade: where=%s args=%#v", where, args)
	}
	if strings.Contains(where, "($1 = '' OR") {
		t.Fatalf("authorization must be mandatory: %s", where)
	}
}

func TestFiltrosOpcoesDREsQuery_UsesActiveMasterDREs(t *testing.T) {
	query, args := filtrosOpcoesDREsQuery(AnalyticsFilters{}, "")
	for _, part := range []string{
		"FROM dres d",
		"d.ativa = TRUE",
		"TRIM(d.nome)",
		"ORDER BY UPPER(TRIM(d.nome)), TRIM(d.nome)",
	} {
		if !strings.Contains(query, part) {
			t.Fatalf("master DRE query missing %q:\n%s", part, query)
		}
	}
	if strings.Contains(query, "FROM schools s") {
		t.Fatalf("unfiltered master DRE query must include DREs without schools:\n%s", query)
	}
	if len(args) != 0 {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestFiltrosOpcoesDREsQuery_CascadesOtherSchoolFilters(t *testing.T) {
	query, args := filtrosOpcoesDREsQuery(AnalyticsFilters{Municipio: "Belem"}, "")
	if !strings.Contains(query, "EXISTS (") || !strings.Contains(query, "FROM schools s") {
		t.Fatalf("DRE query must cascade municipio through schools:\n%s", query)
	}
	if !strings.Contains(query, "UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome))") {
		t.Fatalf("DRE query must match school DREs to master DRE names:\n%s", query)
	}
	if len(args) != 5 || args[0] != "Belem" {
		t.Fatalf("unexpected cascade arguments: %#v", args)
	}
}

func TestFiltrosOpcoesDREsQuery_DREAuthorizationIsMandatory(t *testing.T) {
	query, args := filtrosOpcoesDREsQuery(AnalyticsFilters{DRE: "DRE_B"}, " DRE_A ")
	if !strings.Contains(query, "UPPER(TRIM(d.nome)) = UPPER(TRIM($1))") {
		t.Fatalf("DRE scope must constrain master DREs:\n%s", query)
	}
	if len(args) != 1 || args[0] != "DRE_A" {
		t.Fatalf("unexpected authorization arguments: %#v", args)
	}
	if strings.Contains(query, "DRE_B") {
		t.Fatalf("query must not trust requested DRE value:\n%s", query)
	}
}

func TestFiltrosOpcoesDREsQuery_RebindsCascadeArgumentsAfterAuthorization(t *testing.T) {
	query, args := filtrosOpcoesDREsQuery(AnalyticsFilters{Municipio: "Belem"}, "DRE_A")
	if !strings.Contains(query, "d.nome)) = UPPER(TRIM($1))") || !strings.Contains(query, "s.dre)) = UPPER(TRIM($2))") {
		t.Fatalf("authorization arguments were not rebound correctly:\n%s", query)
	}
	if len(args) != 7 || args[0] != "DRE_A" || args[1] != "DRE_A" || args[2] != "Belem" {
		t.Fatalf("unexpected authorization cascade arguments: %#v", args)
	}
}
