package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"censo-api/internal/models"

	"golang.org/x/crypto/bcrypt"
)

// setupRuntimeScopeCanonicalDB constrói um schema canônico completo (pós-0020)
// com a estrutura de escolas/censos exigida pelos handlers de BOLA, mantido
// isolado por schema e connection única. Reaproveita setupDRELifecycleTestDB
// para não duplicar o bootstrap do vínculo canônico e dos models.
func setupRuntimeScopeCanonicalDB(t *testing.T) (*sql.DB, models.Models) {
	t.Helper()
	db, m := setupDRELifecycleTestDB(t, true)

	if _, err := db.Exec(`
		ALTER TABLE schools
			ADD COLUMN IF NOT EXISTS nome_escola VARCHAR(255) NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS codigo_inep VARCHAR(32),
			ADD COLUMN IF NOT EXISTS municipio VARCHAR(128),
			ADD COLUMN IF NOT EXISTS zona VARCHAR(64);

		CREATE TABLE IF NOT EXISTS census_responses (
			id SERIAL PRIMARY KEY,
			school_id INTEGER NOT NULL REFERENCES schools(id),
			year INTEGER NOT NULL,
			status VARCHAR(32) NOT NULL,
			data JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			sheet_synced_at TIMESTAMPTZ
		);
	`); err != nil {
		t.Fatalf("extend canonical schema for census BOLA: %v", err)
	}
	return db, m
}

type scopeCensusFixture struct {
	dreAID  int
	dreBID  int
	censusA int
	censusB int
}

// seedScopeCensusFixture cria um censo de escola em cada uma de duas DREs e
// retorna os IDs. Os vínculos são canônicos por dre_id.
func seedScopeCensusFixture(t *testing.T, db *sql.DB, m models.Models) scopeCensusFixture {
	t.Helper()
	ctx := context.Background()
	dreA, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE SCOPE ALPHA", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE Alpha: %v", err)
	}
	dreB, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE SCOPE BETA", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE Beta: %v", err)
	}

	insertCensus := func(inep string, dreID int) int {
		var schoolID, censusID int
		if err := db.QueryRow(`
			INSERT INTO schools (nome_escola, codigo_inep, municipio, zona, dre_id)
			VALUES ($1, $2, 'BELEM', 'Urbana', $3)
			RETURNING id
		`, "Escola "+inep, inep, dreID).Scan(&schoolID); err != nil {
			t.Fatalf("insert school: %v", err)
		}
		if err := db.QueryRow(`
			INSERT INTO census_responses (school_id, year, status, data)
			VALUES ($1, 2026, 'completed', '{"total_alunos": 100}'::jsonb)
			RETURNING id
		`, schoolID).Scan(&censusID); err != nil {
			t.Fatalf("insert census: %v", err)
		}
		return censusID
	}

	return scopeCensusFixture{
		dreAID:  dreA.ID,
		dreBID:  dreB.ID,
		censusA: insertCensus("15000001", dreA.ID),
		censusB: insertCensus("15000002", dreB.ID),
	}
}

// TestRuntimeDREUserCannotEscalateRoleOrAccessAdminCRUD garante que um token
// runtime de role=dre não promove role nem alcança CRUD administrativo. A
// rejeição precisa ser 403 (autorização), distinta de 401 (autenticação).
func TestRuntimeDREUserCannotEscalateRoleOrAccessAdminCRUD(t *testing.T) {
	app, handler, m := setupRuntimeAuthTest(t)
	_ = app
	dreA, _ := createRuntimeDREUser(t, m, "DRE CRUD ALPHA", "crud.alpha", "crud-password")

	// Admin CRUD exige role=admin, avaliado antes de tocar o banco. Não existe
	// usuário admin persistível por model (só via ENV); o target nem precisa
	// existir porque o guard de role retorna 403 primeiro.
	const targetID = 999

	_, token := runtimeLoginRequest(t, handler, "crud.alpha", "crud-password", "10.70.1.1:6001")
	if token == "" {
		t.Fatalf("expected DRE token")
	}

	me := runtimeMeRequest(handler, token)
	if me.Code != http.StatusOK {
		t.Fatalf("/me status=%d body=%s", me.Code, me.Body.String())
	}
	if decoded := decodeRuntimeMe(t, me); decoded.Data.Role != RoleDRE {
		t.Fatalf("DRE token escalated role: %+v", decoded.Data)
	}

	cases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "create DRE", method: http.MethodPost, path: "/v1/admin/dres", body: `{"nome":"DRE INVASORA"}`},
		{name: "create user", method: http.MethodPost, path: "/v1/admin/users", body: `{"username":"pwn.user","password":"x123456789012"}`},
		{name: "set admin status", method: http.MethodPatch, path: fmt.Sprintf("/v1/admin/users/%d/status", targetID), body: `{"active":false}`},
		{name: "reset admin password", method: http.MethodPost, path: fmt.Sprintf("/v1/admin/users/%d/reset-password", targetID), body: `{"password":"y123456789012"}`},
		{name: "update DRE", method: http.MethodPut, path: fmt.Sprintf("/v1/admin/dres/%d", dreA.ID), body: `{"nome":"DRE INVALIDA"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer "+token)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for admin CRUD via DRE token, got %d body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

// TestRuntimeBOLACrossDRECensusBlocked verifica que um token da DRE A não lê um
// censo da DRE B (403) ao mesmo tempo em que continua lendo o próprio (200).
func TestRuntimeBOLACrossDRECensusBlocked(t *testing.T) {
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	t.Setenv("ADMIN_USERNAME", "")
	t.Setenv("ADMIN_PASSWORD_HASH", "")
	t.Setenv("TRUSTED_PROXY_COUNT", "0")
	resetRuntimeLoginLimiter()

	db, m := setupRuntimeScopeCanonicalDB(t)
	app := &application{models: m}
	handler := app.routes()

	ids := seedScopeCensusFixture(t, db, m)
	if _, err := m.AdminUsers.CreateForDREID(context.Background(), "scope.alpha", "scope-password", RoleDRE, ids.dreAID); err != nil {
		t.Fatalf("create DRE Alpha user: %v", err)
	}

	_, token := runtimeLoginRequest(t, handler, "scope.alpha", "scope-password", "10.70.2.1:6002")
	if token == "" {
		t.Fatalf("expected DRE scope token")
	}

	getCensus := func(id int) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/v1/admin/census/%d", id), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}

	if rr := getCensus(ids.censusA); rr.Code != http.StatusOK {
		t.Fatalf("same-DRE census should be accessible, got %d body=%s", rr.Code, rr.Body.String())
	}
	if rr := getCensus(ids.censusB); rr.Code != http.StatusForbidden {
		t.Fatalf("cross-DRE census should be 403 (BOLA), got %d body=%s", rr.Code, rr.Body.String())
	}
}

// TestRuntimeEnvAdminMaintainsBroadAccessRegression garante que o admin legado
// por ENV mantém acesso amplo a CRUD e a censos de qualquer DRE, sem depender
// de registros de usuário no banco.
func TestRuntimeEnvAdminMaintainsBroadAccessRegression(t *testing.T) {
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	t.Setenv("ADMIN_USERNAME", "scope_env_admin")
	t.Setenv("ADMIN_PASSWORD_HASH", mustBcrypt(t, "scope-env-admin-password"))
	t.Setenv("TRUSTED_PROXY_COUNT", "0")
	resetRuntimeLoginLimiter()

	db, m := setupRuntimeScopeCanonicalDB(t)
	app := &application{models: m}
	handler := app.routes()

	ids := seedScopeCensusFixture(t, db, m)

	login, token := runtimeLoginRequest(t, handler, "scope_env_admin", "scope-env-admin-password", "10.70.3.1:6003")
	if login.Code != http.StatusOK || token == "" {
		t.Fatalf("env admin login failed: %d %s", login.Code, login.Body.String())
	}

	// Acesso amplo: env admin lê censo de qualquer DRE.
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/v1/admin/census/%d", ids.censusB), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("env admin should reach any-DRE census, got %d body=%s", rr.Code, rr.Body.String())
	}

	// Acesso amplo: env admin cria DRE.
	req = httptest.NewRequest(http.MethodPost, "/v1/admin/dres", strings.NewReader(`{"nome":"DRE ENV ADMIN"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK && rr.Code != http.StatusCreated {
		t.Fatalf("env admin should create DRE, got %d body=%s", rr.Code, rr.Body.String())
	}

	me := runtimeMeRequest(handler, token)
	if me.Code != http.StatusOK {
		t.Fatalf("env admin /me failed: %d %s", me.Code, me.Body.String())
	}
	if decoded := decodeRuntimeMe(t, me); decoded.Data.Role != RoleAdmin {
		t.Fatalf("env admin should keep role=admin, got %+v", decoded.Data)
	}
}

// TestRuntimeAuth401Vs403Consistency afirma que revogação de identidade produz
// 401 (middleware) enquanto violação de escopo/autorização produz 403 (handler).
func TestRuntimeAuth401Vs403Consistency(t *testing.T) {
	app, handler, m := setupRuntimeAuthTest(t)
	_ = app
	ctx := context.Background()
	dre, user := createRuntimeDREUser(t, m, "DRE STATUS CODE", "status.code", "code-password")

	_, token := runtimeLoginRequest(t, handler, "status.code", "code-password", "10.70.4.1:6004")
	if token == "" {
		t.Fatalf("expected token")
	}

	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, false); err != nil {
		t.Fatalf("deactivate user: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("revoked user expected 401, got %d body=%s", rr.Code, rr.Body.String())
	}
	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, true); err != nil {
		t.Fatalf("reactivate user: %v", err)
	}

	if err := m.DREs.SetActive(ctx, dre.ID, false); err != nil {
		t.Fatalf("deactivate DRE: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("revoked DRE expected 401, got %d body=%s", rr.Code, rr.Body.String())
	}
	if err := m.DREs.SetActive(ctx, dre.ID, true); err != nil {
		t.Fatalf("reactivate DRE: %v", err)
	}

	// Autorização: admin CRUD exige role=admin; o token DRE não pode promover
	// role nem acessar CRUD. O 403 é emitido pelo guard de role no handler.
	req := httptest.NewRequest(http.MethodPost, "/v1/admin/dres", strings.NewReader(`{"nome":"DRE X"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("role violation expected 403, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func mustBcrypt(t *testing.T, password string) string {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	return string(hash)
}
