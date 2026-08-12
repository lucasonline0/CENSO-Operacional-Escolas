package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCoreAnalyticsDREScopeOverridesQueryAndKeepsSchoolFilters(t *testing.T) {
	req := httptest.NewRequest("GET", "/v1/admin/analytics/overview?dre=DRE_B&school_id=42&codigo_inep=15000123", nil)
	ctx := context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{
		Username: "dre-a",
		Role:     RoleDRE,
		DRE:      "DRE_A",
	})
	f := parseAnalyticsFilters(req.WithContext(ctx))
	if f.DRE != "DRE_A" {
		t.Fatalf("DRE scope not enforced: got %q", f.DRE)
	}
	if f.SchoolID != 42 {
		t.Fatalf("school_id not preserved: got %d", f.SchoolID)
	}
	if f.CodigoINEP != "15000123" {
		t.Fatalf("codigo_inep not preserved: got %q", f.CodigoINEP)
	}
}

func TestCoreAnalyticsSchoolTablesApplySchoolAndINEP(t *testing.T) {
	queries := map[string]string{
		"caracterizacaoEscolasSelectSQL": caracterizacaoEscolasSelectSQL,
		"merendaEscolasSelectSQL":        merendaEscolasSelectSQL,
		"pessoalEscolasSelectSQL":        pessoalEscolasSelectSQL,
		"servicosEscolasSelectSQL":       servicosEscolasSelectSQL,
		"tecnologiaEscolasSelectSQL":     tecnologiaEscolasSelectSQL,
	}
	for name, query := range queries {
		t.Run(name, func(t *testing.T) {
			if !strings.Contains(query, "$6 = 0 OR s.id = $6") {
				t.Fatalf("school_id predicate missing from %s", name)
			}
			if !strings.Contains(query, "codigo_inep") || !strings.Contains(query, "$7") {
				t.Fatalf("codigo_inep predicate missing from %s", name)
			}
		})
	}
}

func TestInfraestruturaAnalyticsSelectSQLAppliesSchoolAndINEP(t *testing.T) {
	if !strings.Contains(infraestruturaAnalyticsSelectSQL, "$6 = 0 OR s.id = $6") {
		t.Fatal("school_id predicate missing from infraestrutura analytics query")
	}
	if !strings.Contains(infraestruturaAnalyticsSelectSQL, "codigo_inep") || !strings.Contains(infraestruturaAnalyticsSelectSQL, "$7") {
		t.Fatal("codigo_inep predicate missing from infraestrutura analytics query")
	}
}
