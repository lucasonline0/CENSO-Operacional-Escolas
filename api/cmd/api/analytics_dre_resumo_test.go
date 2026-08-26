package main

import (
	"context"
	"math"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPreenchimentoMasterQueryShape(t *testing.T) {
	query := preenchimentoDreScopedSelectSQL
	mustContain := []string{
		"FROM dres d",
		"d.ativa = TRUE",
		"LEFT JOIN filtered_schools s",
		"LEFT JOIN latest_census cr",
		"COUNT(s.id) AS total",
		"HAVING (($3 = '' AND $4 = '' AND $5 = '' AND $6 = 0 AND $7 = '') OR COUNT(s.id) > 0)",
		"legacy_rows AS",
		"d.id IS NULL",
		"UNION ALL",
	}
	for _, fragment := range mustContain {
		if !strings.Contains(query, fragment) {
			t.Fatalf("query de preenchimento não contém %q", fragment)
		}
	}
	if strings.Contains(query, "FROM schools s\n\tLEFT JOIN latest_census") {
		t.Fatal("query ainda parte diretamente de schools; DRE sem escola seria perdida")
	}
}

func TestPreenchimentoScopedArgs(t *testing.T) {
	f := preenchimentoDreFilters{
		Year:             2026,
		DRE:              "DRE BELEM",
		Municipio:        "BELEM",
		Zona:             "URBANA",
		RegiaoIntegracao: "GUAJARA",
		SchoolID:         42,
		CodigoINEP:       "15000000",
	}
	query, args := buildPreenchimentoDreScopedQuery(f)
	if query != preenchimentoDreScopedSelectSQL {
		t.Fatal("buildPreenchimentoDreScopedQuery retornou SQL inesperado")
	}
	want := []any{2026, "DRE BELEM", "BELEM", "URBANA", "GUAJARA", 42, "15000000"}
	if len(args) != len(want) {
		t.Fatalf("len(args)=%d; want %d", len(args), len(want))
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("args[%d]=%v; want %v", i, args[i], want[i])
		}
	}
}

func TestDRESummaryQueryShape(t *testing.T) {
	mustContain := []string{
		"FROM dres",
		"WHERE id = $1",
		"WHERE cr.year = $2",
		"LEFT JOIN schools s",
		"UPPER(TRIM(s.dre)) = UPPER(TRIM(d.nome))",
		"cr.status = 'completed'",
		"cr.data->>'total_alunos'",
		"COUNT(s.id) FILTER (WHERE cr.status = 'completed')",
	}
	for _, fragment := range mustContain {
		if !strings.Contains(dreSummarySelectSQL, fragment) {
			t.Fatalf("dreSummarySelectSQL não contém %q", fragment)
		}
	}
	if !strings.Contains(dreSummarySelectSQL, "^[0-9]+(\\.[0-9]+)?$") {
		t.Fatal("total_alunos deve aceitar somente número não-negativo bem formado")
	}
}

func TestBuildDRESummaryPayload(t *testing.T) {
	payload := buildDRESummaryPayload(9, "DRE TESTE", 2026, 8, 1234, 6)
	if payload.DREID != 9 || payload.DRE != "DRE TESTE" || payload.AnoReferencia != 2026 {
		t.Fatalf("identificação inválida: %+v", payload)
	}
	if payload.TotalEscolas != 8 || payload.TotalAlunos != 1234 {
		t.Fatalf("totais inválidos: %+v", payload)
	}
	if payload.CensusAdherencePercentage != 75 {
		t.Fatalf("adesão=%d; want 75", payload.CensusAdherencePercentage)
	}

	empty := buildDRESummaryPayload(10, "DRE ZERO", 2026, 0, 0, 0)
	if empty.CensusAdherencePercentage != 0 {
		t.Fatalf("DRE sem escolas deve ter 0%%, got %d", empty.CensusAdherencePercentage)
	}
}

// 20 mil cenários determinísticos validam as invariantes matemáticas usadas
// tanto no preenchimento quanto no resumo de DRE.
func TestDREAnalyticsProperties20000Scenarios(t *testing.T) {
	rng := rand.New(rand.NewSource(189))
	for i := 0; i < 20000; i++ {
		total := rng.Intn(5000)
		completed := 0
		draft := 0
		if total > 0 {
			completed = rng.Intn(total + 1)
			draft = rng.Intn(total - completed + 1)
		}

		row := buildPreenchimentoDreRow("DRE", total, completed, draft)
		if row.Pending < 0 {
			t.Fatalf("scenario %d: pending negativo: %+v", i, row)
		}
		if row.Completed+row.Draft+row.Pending != total {
			t.Fatalf("scenario %d: partição inválida: %+v", i, row)
		}
		if row.CompletionPercentage < 0 || row.CompletionPercentage > 100 {
			t.Fatalf("scenario %d: percentual fora de 0..100: %+v", i, row)
		}
		wantPct := 0
		if total > 0 {
			wantPct = int(math.Round(float64(completed) / float64(total) * 100))
		}
		if row.CompletionPercentage != wantPct {
			t.Fatalf("scenario %d: pct=%d; want %d", i, row.CompletionPercentage, wantPct)
		}

		students := float64(rng.Intn(250000))
		summary := buildDRESummaryPayload(1, "DRE", 2026, total, students, completed)
		if summary.CensusAdherencePercentage != wantPct {
			t.Fatalf("scenario %d: summary pct=%d; want %d", i, summary.CensusAdherencePercentage, wantPct)
		}
		if summary.TotalEscolas != total || summary.TotalAlunos != students {
			t.Fatalf("scenario %d: summary alterou totais: %+v", i, summary)
		}
	}
}

func TestDRESummaryRouteAuthorizationAndValidation(t *testing.T) {
	app := setupTestApp()
	handler := app.routes()
	adminToken := createTestJWT("admin", RoleAdmin, "")
	dreToken := createTestJWT("dre-user", RoleDRE, "DRE BELEM")

	t.Run("sem token retorna 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/admin/dres/1/resumo", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("got %d, want 401", rr.Code)
		}
	})

	t.Run("role DRE retorna 403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/admin/dres/1/resumo", nil)
		req.Header.Set("Authorization", "Bearer "+dreToken)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Fatalf("got %d, want 403; body=%s", rr.Code, rr.Body.String())
		}
	})

	for _, path := range []string{"/v1/admin/dres/0/resumo", "/v1/admin/dres/-1/resumo", "/v1/admin/dres/abc/resumo"} {
		t.Run("admin ID inválido "+path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Authorization", "Bearer "+adminToken)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("got %d, want 400; body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestDRESummaryDirectHandlerRequiresAdminBeforeDB(t *testing.T) {
	app := setupTestApp()
	req := httptest.NewRequest(http.MethodGet, "/v1/admin/dres/1/resumo", nil)
	scope := AdminAccessScope{Username: "dre", Role: RoleDRE, DRE: "DRE BELEM"}
	req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, scope))
	rr := httptest.NewRecorder()
	app.AdminDRESummary(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rr.Code)
	}
}
