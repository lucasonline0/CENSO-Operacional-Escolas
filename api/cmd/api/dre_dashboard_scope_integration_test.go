package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// TestRuntimeDREDashboardScopeEndToEnd reproduces the real profile-DRE flow:
// provision a DRE user, authenticate, then exercise the dashboard endpoints
// through the real router with two DREs present in the same database.
//
// The important contract is both positive and negative: DRE A must receive its
// own populated data while hostile filters that point at DRE B must never widen
// the authorized scope.
func TestRuntimeDREDashboardScopeEndToEnd(t *testing.T) {
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	t.Setenv("ADMIN_USERNAME", "")
	t.Setenv("ADMIN_PASSWORD_HASH", "")
	t.Setenv("TRUSTED_PROXY_COUNT", "0")
	resetRuntimeLoginLimiter()

	db, m := setupRuntimeScopeCanonicalDB(t)
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS reg_integracao (
			municipio TEXT NOT NULL,
			regiao_de_integracao TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS ideb_resultados (
			id SERIAL PRIMARY KEY,
			school_id INTEGER NOT NULL REFERENCES schools(id),
			ano INTEGER NOT NULL
		);
	`); err != nil {
		t.Fatalf("create filter support tables: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO reg_integracao (municipio, regiao_de_integracao)
		VALUES ('BELEM', 'METROPOLITANA')
	`); err != nil {
		t.Fatalf("seed integration region: %v", err)
	}

	ids := seedScopeCensusFixture(t, db, m)
	var schoolA, schoolB int
	if err := db.QueryRow(`SELECT school_id FROM census_responses WHERE id = $1`, ids.censusA).Scan(&schoolA); err != nil {
		t.Fatalf("resolve school A: %v", err)
	}
	if err := db.QueryRow(`SELECT school_id FROM census_responses WHERE id = $1`, ids.censusB).Scan(&schoolB); err != nil {
		t.Fatalf("resolve school B: %v", err)
	}

	if _, err := m.AdminUsers.CreateForDREID(context.Background(), "dashboard.alpha", "dashboard-password", RoleDRE, ids.dreAID); err != nil {
		t.Fatalf("create DRE dashboard user: %v", err)
	}

	app := &application{models: m}
	handler := app.routes()
	login, token := runtimeLoginRequest(t, handler, "dashboard.alpha", "dashboard-password", "10.70.5.1:6006")
	if login.Code != http.StatusOK || token == "" {
		t.Fatalf("DRE login failed: code=%d body=%s", login.Code, login.Body.String())
	}

	get := func(path string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}
	decode := func(rr *httptest.ResponseRecorder, target any) {
		t.Helper()
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
		}
		if err := json.Unmarshal(rr.Body.Bytes(), target); err != nil {
			t.Fatalf("decode response: %v body=%s", err, rr.Body.String())
		}
	}

	t.Run("me exposes canonical scope", func(t *testing.T) {
		var body struct {
			Data struct {
				Role  string `json:"role"`
				DREID int    `json:"dre_id"`
				DRE   string `json:"dre"`
			} `json:"data"`
		}
		decode(get("/v1/admin/me"), &body)
		if body.Data.Role != RoleDRE || body.Data.DREID != ids.dreAID || body.Data.DRE != "DRE SCOPE ALPHA" {
			t.Fatalf("unexpected /me scope: %+v", body.Data)
		}
	})

	t.Run("dashboard is populated only by own DRE", func(t *testing.T) {
		var body struct {
			Data DashboardStats `json:"data"`
		}
		decode(get("/v1/admin/dashboard"), &body)
		if body.Data.TotalSchools != 1 || body.Data.CompletedCensuses != 1 {
			t.Fatalf("DRE dashboard must be populated by own fixture: %+v", body.Data)
		}
		if len(body.Data.ByDre) != 1 || body.Data.ByDre[0].Dre != "DRE SCOPE ALPHA" {
			t.Fatalf("dashboard leaked or lost DRE aggregation: %+v", body.Data.ByDre)
		}
		if len(body.Data.Recent) != 1 || body.Data.Recent[0].CensusID != ids.censusA {
			t.Fatalf("dashboard recent rows leaked or lost scope: %+v", body.Data.Recent)
		}
	})

	t.Run("hostile DRE query cannot widen census list", func(t *testing.T) {
		path := "/v1/admin/census?year=2026&limit=100&page=1&dre=" + url.QueryEscape("DRE SCOPE BETA")
		var body struct {
			Data struct {
				Rows  []CensusRow `json:"rows"`
				Total int         `json:"total"`
			} `json:"data"`
		}
		decode(get(path), &body)
		if body.Data.Total != 1 || len(body.Data.Rows) != 1 || body.Data.Rows[0].CensusID != ids.censusA {
			t.Fatalf("hostile dre query changed authorized census scope: %+v", body.Data)
		}
	})

	t.Run("foreign school and INEP fail closed", func(t *testing.T) {
		path := fmt.Sprintf("/v1/admin/census?year=2026&limit=100&page=1&school_id=%d&codigo_inep=15000002", schoolB)
		var body struct {
			Data struct {
				Rows  []CensusRow `json:"rows"`
				Total int         `json:"total"`
			} `json:"data"`
		}
		decode(get(path), &body)
		if body.Data.Total != 0 || len(body.Data.Rows) != 0 {
			t.Fatalf("foreign school/INEP returned data: %+v", body.Data)
		}
	})

	t.Run("filter options expose only own DRE", func(t *testing.T) {
		path := "/v1/admin/analytics/filtros/opcoes?dre=" + url.QueryEscape("DRE SCOPE BETA")
		var body struct {
			Data FiltrosOpcoes `json:"data"`
		}
		decode(get(path), &body)
		if len(body.Data.DREs) != 1 || body.Data.DREs[0] != "DRE SCOPE ALPHA" {
			t.Fatalf("DRE options escaped authenticated scope: %#v", body.Data.DREs)
		}
		if len(body.Data.Escolas) != 1 || body.Data.Escolas[0].SchoolID != schoolA {
			t.Fatalf("school options escaped authenticated scope: %#v", body.Data.Escolas)
		}
		if len(body.Data.CodigosINEP) != 1 || body.Data.CodigosINEP[0] != "15000001" {
			t.Fatalf("INEP options escaped authenticated scope: %#v", body.Data.CodigosINEP)
		}
	})

	t.Run("preenchimento returns only own DRE", func(t *testing.T) {
		path := "/v1/admin/analytics/preenchimento/dre?year=2026&dre=" + url.QueryEscape("DRE SCOPE BETA")
		var body struct {
			Data PreenchimentoDrePayload `json:"data"`
		}
		decode(get(path), &body)
		if body.Data.TotalEscolas != 1 || body.Data.TotalCompleted != 1 || len(body.Data.DREs) != 1 {
			t.Fatalf("unexpected preenchimento payload: %+v", body.Data)
		}
		if body.Data.DREs[0].DRE != "DRE SCOPE ALPHA" {
			t.Fatalf("preenchimento leaked another DRE: %+v", body.Data.DREs)
		}
	})

	_ = schoolB // retained explicitly to document the foreign fixture used above.
}
