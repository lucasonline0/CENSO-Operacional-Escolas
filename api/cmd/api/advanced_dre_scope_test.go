package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func advancedDRERequest(path string) *http.Request {
	req := httptest.NewRequest("GET", path, nil)
	ctx := context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{
		Username: "dre-a",
		Role:     RoleDRE,
		DRE:      "DRE_A",
		DREID:    77,
	})
	return req.WithContext(ctx)
}

func TestAdvancedScopeOverridesHostileDREAcrossSensitiveHandlers(t *testing.T) {
	req := advancedDRERequest("/v1/admin/analytics/x?dre=DRE_B&municipio=Belem&school_id=202&codigo_inep=15000202")

	health := saudeOperacionalFiltersFromRequest(req)
	if health.DRE != "DRE_A" || health.SchoolID != 202 || health.CodigoINEP != "15000202" {
		t.Fatalf("health scope mismatch: %+v", health)
	}

	ideb := applyIdebAccessScope(req, idebFilters{})
	if ideb.DRE != "DRE_A" || !ideb.RequireLinkedSchool || ideb.SchoolID != 202 || ideb.CodigoINEP != "15000202" {
		t.Fatalf("IDEB scope mismatch: %+v", ideb)
	}

	prodep := applyProdepAccessScope(req, prodepFilters{})
	if prodep.DRE != "DRE_A" || !prodep.RequireLinkedDRE || prodep.SchoolID != 202 || prodep.CodigoINEP != "15000202" {
		t.Fatalf("PRODEP scope mismatch: %+v", prodep)
	}

	preenchimento := preenchimentoDreFiltersFromRequest(req, time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC))
	if preenchimento.DRE != "DRE_A" || preenchimento.SchoolID != 202 || preenchimento.CodigoINEP != "15000202" {
		t.Fatalf("preenchimento scope mismatch: %+v", preenchimento)
	}

	report := parseReportFiltersRequest(req)
	if report.DRE != "DRE_A" || report.SchoolID != 202 || report.CodigoINEP != "15000202" {
		t.Fatalf("report scope mismatch: %+v", report)
	}
}

func TestAdvancedScopeIDEBFailsClosedForDREUnlinkedRows(t *testing.T) {
	required := []string{
		"$13 = false OR ir.school_id IS NOT NULL",
		"$11 = 0 OR ir.school_id = $11",
		"COALESCE(ir.codigo_inep, '')",
		"COALESCE(s.codigo_inep, '')",
	}
	for _, part := range required {
		if !strings.Contains(idebFromWhere, part) {
			t.Fatalf("IDEB security predicate missing: %q", part)
		}
	}

	adminReq := httptest.NewRequest("GET", "/v1/admin/analytics/x?codigo_inep=15000123", nil)
	admin := applyIdebAccessScope(adminReq, idebFilters{})
	if admin.RequireLinkedSchool {
		t.Fatal("admin must retain broad IDEB visibility, including quality/unmatched rows")
	}
}

func TestAdvancedScopePRODEPFailsClosedWithoutReliableDRELink(t *testing.T) {
	required := []string{
		"$8 = false OR ($11 > 0 AND EXISTS",
		"scope_s.id = prodep_repasses.school_id",
		"scope_s.id = prodep_repasses.school_id_sede",
		"dre_id",
		"$9 = 0 OR prodep_repasses.school_id = $9",
		"codigo_inep_prodep",
	}
	for _, part := range required {
		if !strings.Contains(prodepWhereSQL, part) {
			t.Fatalf("PRODEP security predicate missing: %q", part)
		}
	}
}

func TestAdvancedScopeSensitiveQueriesFilterBeforeAggregation(t *testing.T) {
	queries := map[string]string{
		"saude":                    saudeOperacionalSelectSQL,
		"governanca_institucional": governancaInstitucionalScopedWhereSQL,
		"indice_governanca":        indiceGovernancaSelectSQL,
		"preenchimento":            preenchimentoDreScopedSelectSQL,
	}
	for name, query := range queries {
		t.Run(name, func(t *testing.T) {
			if !strings.Contains(query, "codigo_inep") {
				t.Fatalf("%s lacks INEP scope", name)
			}
		})
	}
	if !strings.Contains(saudeOperacionalSelectSQL, "$6 = 0 OR s.id = $6") || !strings.Contains(saudeOperacionalSelectSQL, "$7") {
		t.Fatal("health dataset is not scoped by school/INEP")
	}
	if !strings.Contains(indiceGovernancaSelectSQL, "$5 = 0 OR s.id = $5") || !strings.Contains(indiceGovernancaSelectSQL, "$6") {
		t.Fatal("governance index is not scoped before summary")
	}
}

func TestAdvancedScopeEveryCurrentXLSXSchoolQueryIsScoped(t *testing.T) {
	queries := map[string]string{
		"censo-preenchimento": censoPreenchimentoSelectSQL,
		"infraestrutura":      infraestruturaSelectSQL,
		"merenda":             merendaSelectSQL,
		"financeiro":          financeiroGovernancaSelectSQL,
	}
	for name, query := range queries {
		t.Run(name, func(t *testing.T) {
			if !strings.Contains(query, "$6 = 0 OR s.id = $6") {
				t.Fatalf("%s report lacks school_id predicate", name)
			}
			if !strings.Contains(query, "codigo_inep") || !strings.Contains(query, "$7") {
				t.Fatalf("%s report lacks codigo_inep predicate", name)
			}
		})
	}
}

func TestAdvancedScopeReportRequestCannotOverrideTokenDRE(t *testing.T) {
	req := advancedDRERequest("/v1/admin/reports/saude-operacional-escolas?dre=DRE_B&school_id=99&codigo_inep=X")
	f := parseReportFiltersRequest(req)
	if f.DRE != "DRE_A" {
		t.Fatalf("report honored hostile DRE query: %q", f.DRE)
	}
	args := f.scopedArgs()
	if len(args) != 8 || args[1] != "DRE_A" || args[5] != 99 || args[6] != "X" || args[7] != 77 {
		t.Fatalf("unexpected scoped report args: %#v", args)
	}
}
