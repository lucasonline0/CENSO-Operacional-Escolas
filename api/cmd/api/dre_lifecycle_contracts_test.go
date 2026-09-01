package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"censo-api/internal/models"
)

func TestDRECreateWithAtivaFalsePersists(t *testing.T) {
	ctx := context.Background()
	_, m := setupDRELifecycleTestDB(t, true)

	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE TESTE INATIVA", Ativa: false})
	if err != nil {
		t.Fatalf("create DRE with ativa=false: %v", err)
	}
	if dre.Ativa {
		t.Fatalf("expected ativa=false to persist, got ativa=%v", dre.Ativa)
	}
}

func TestInactiveDRERejectsUserCreation(t *testing.T) {
	ctx := context.Background()
	_, m := setupDRELifecycleTestDB(t, true)

	inactive, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE INATIVA PARA USER", Ativa: false})
	if err != nil {
		t.Fatalf("create inactive DRE: %v", err)
	}

	_, err = m.AdminUsers.Create(ctx, "inactive.user", "password123", "dre", inactive.Nome)
	if err == nil {
		t.Fatal("expected inactive DRE to reject user creation, got no error")
	}
	if !errors.Is(err, models.ErrDREInactive) {
		t.Fatalf("expected ErrDREInactive, got: %v", err)
	}
}

func TestDREInactiveUserCannotAuthenticate(t *testing.T) {
	ctx := context.Background()
	_, m := setupDRELifecycleTestDB(t, true)

	active, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ATIVA PARA AUTH", Ativa: true})
	if err != nil {
		t.Fatalf("create active DRE: %v", err)
	}

	_, err = m.AdminUsers.Create(ctx, "auth.user", "password123", "dre", active.Nome)
	if err != nil {
		t.Fatalf("create DRE user: %v", err)
	}

	if err := m.DREs.SetActive(ctx, active.ID, false); err != nil {
		t.Fatalf("deactivate DRE: %v", err)
	}

	_, err = m.AdminUsers.CreateForDREID(ctx, "blocked.user", "password123", "dre", active.ID)
	if err == nil {
		t.Fatal("expected inactive DRE to reject user creation by ID, got no error")
	}
	if !errors.Is(err, models.ErrDREInactive) {
		t.Fatalf("expected ErrDREInactive, got: %v", err)
	}

	if err := m.DREs.SetActive(ctx, active.ID, true); err != nil {
		t.Fatalf("reactivate DRE: %v", err)
	}
}

func TestRenamePreservesUserAndSchoolLinks(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)

	dreA, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ALPHA", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE A: %v", err)
	}

	_, err = m.DREs.Create(ctx, models.DRE{Nome: "DRE BETA", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE B: %v", err)
	}

	var schoolID int
	if err := db.QueryRow(`INSERT INTO schools DEFAULT VALUES RETURNING id`).Scan(&schoolID); err != nil {
		t.Fatalf("create school: %v", err)
	}
	if _, _, err := m.Schools.AssignToDRE(ctx, dreA.ID, []int{schoolID}); err != nil {
		t.Fatalf("assign school to DRE A: %v", err)
	}

	user, err := m.AdminUsers.CreateForDREID(ctx, "alpha.user", "password123", "dre", dreA.ID)
	if err != nil {
		t.Fatalf("create DRE A user: %v", err)
	}

	dreA.Nome = "DRE ALPHA RENAMED"
	updated, err := m.DREs.Update(ctx, *dreA)
	if err != nil {
		t.Fatalf("rename DRE: %v", err)
	}
	if updated.ID != dreA.ID || updated.Nome != "DRE ALPHA RENAMED" {
		t.Fatalf("unexpected renamed DRE: %#v", updated)
	}

	var schoolDREID, userDREID int
	var schoolDRE, userDRE string
	if err := db.QueryRow(`SELECT dre_id, dre FROM schools WHERE id = $1`, schoolID).Scan(&schoolDREID, &schoolDRE); err != nil {
		t.Fatalf("read school after rename: %v", err)
	}
	if err := db.QueryRow(`SELECT dre_id, dre FROM admin_users WHERE id = $1`, user.ID).Scan(&userDREID, &userDRE); err != nil {
		t.Fatalf("read user after rename: %v", err)
	}
	if schoolDREID != dreA.ID || userDREID != dreA.ID || schoolDRE != updated.Nome || userDRE != updated.Nome {
		t.Fatalf("rename broke canonical links: school=(%d,%q) user=(%d,%q)", schoolDREID, schoolDRE, userDREID, userDRE)
	}
}

func TestAdminMeReflectsRenameAndStatus(t *testing.T) {
	ctx := context.Background()
	_, m := setupDRELifecycleTestDB(t, true)

	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ORIGINAL", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}

	_, err = m.AdminUsers.CreateForDREID(ctx, "me.user", "password123", "dre", dre.ID)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	dre.Nome = "DRE RENAMED"
	if _, err := m.DREs.Update(ctx, *dre); err != nil {
		t.Fatalf("rename DRE: %v", err)
	}

	tokStr := createTestJWT("me.user", "dre", "DRE RENAMED")
	req := httptest.NewRequest("GET", "/v1/admin/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokStr)

	app := setupTestApp()
	app.models = m
	app.logger = nil

	rr := httptest.NewRecorder()
	app.routes().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var resp jsonResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	data := resp.Data.(map[string]interface{})
	if data["username"] != "me.user" {
		t.Fatalf("expected username me.user, got %v", data["username"])
	}
	if data["role"] != "dre" {
		t.Fatalf("expected role dre, got %v", data["role"])
	}
	dreVal, _ := data["dre"].(string)
	if dreVal != "DRE RENAMED" {
		t.Fatalf("expected dre DRE RENAMED, got %v", dreVal)
	}
}

func TestDuplicateUsernameByCaseIsRejected(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)

	// Apply the 0021 migration to create normalized unique indexes
	_, err := db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_username_normalized
			ON admin_users (LOWER(BTRIM(username)));
		CREATE UNIQUE INDEX IF NOT EXISTS uq_dres_nome_normalized
			ON dres (LOWER(BTRIM(nome)));
	`)
	if err != nil {
		t.Fatalf("create normalized unique indexes: %v", err)
	}

	if _, err = m.DREs.Create(ctx, models.DRE{Nome: "DRE TESTE", Ativa: true}); err != nil {
		t.Fatalf("create DRE TESTE: %v", err)
	}

	_, err = m.AdminUsers.Create(ctx, "DupUser", "password123", "dre", "DRE TESTE")
	if err != nil {
		t.Fatalf("create first user: %v", err)
	}

	_, err = m.AdminUsers.Create(ctx, "dupuser", "password123", "dre", "DRE TESTE")
	if err == nil {
		t.Fatal("expected duplicate username (case difference) to be rejected")
	}
	if !errors.Is(err, models.ErrUsernameExists) {
		t.Fatalf("expected ErrUsernameExists, got: %v", err)
	}
}

func TestDuplicateDRENameByCaseIsRejected(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)

	// Apply the 0021 migration to create normalized unique indexes
	_, err := db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_username_normalized
			ON admin_users (LOWER(BTRIM(username)));
		CREATE UNIQUE INDEX IF NOT EXISTS uq_dres_nome_normalized
			ON dres (LOWER(BTRIM(nome)));
	`)
	if err != nil {
		t.Fatalf("create normalized unique indexes: %v", err)
	}

	_, err = m.DREs.Create(ctx, models.DRE{Nome: "DRE TESTE"})
	if err != nil {
		t.Fatalf("create first DRE: %v", err)
	}

	_, err = m.DREs.Create(ctx, models.DRE{Nome: "dre teste"})
	if err == nil {
		t.Fatal("expected duplicate DRE name (case difference) to be rejected")
	}
	if !errors.Is(err, models.ErrDREExists) {
		t.Fatalf("expected ErrDREExists, got: %v", err)
	}
}

func TestDREEntityAbsentInDresNotValidatedBySchoolsText(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, false)

	if _, err := db.Exec(`INSERT INTO schools (dre) VALUES ('DRE FANTASMA')`); err != nil {
		t.Fatalf("seed legacy school text: %v", err)
	}

	valid, err := m.AdminUsers.ValidateDRE(ctx, "DRE FANTASMA")
	if err != nil {
		t.Fatalf("ValidateDRE returned infrastructure error: %v", err)
	}
	if valid {
		t.Fatalf("schools text incorrectly validated a DRE absent from master table")
	}
	if _, err := m.AdminUsers.Create(ctx, "ghost.user", "password123", "dre", "DRE FANTASMA"); !errors.Is(err, models.ErrInvalidDRE) {
		t.Fatalf("master-absent DRE did not return ErrInvalidDRE: %v", err)
	}
}