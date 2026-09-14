package main

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"censo-api/internal/models"

	"golang.org/x/crypto/bcrypt"
)

func TestRuntimeDREAuthorizationTransitionSchemaWithoutDREID(t *testing.T) {
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	t.Setenv("ADMIN_USERNAME", "")
	t.Setenv("ADMIN_PASSWORD_HASH", "")
	t.Setenv("TRUSTED_PROXY_COUNT", "0")
	resetRuntimeLoginLimiter()

	db, m := setupDRELifecycleTestDB(t, false)
	app := &application{models: m}
	handler := app.routes()
	ctx := context.Background()

	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE TRANSICAO", Ativa: true})
	if err != nil {
		t.Fatalf("create transition DRE: %v", err)
	}

	password := "transition-runtime-password"
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt transition user: %v", err)
	}
	var userID int
	if err := db.QueryRowContext(ctx, `
		INSERT INTO admin_users (username, password_hash, role, dre, active, created_at, updated_at)
		VALUES ($1, $2, 'dre', $3, true, NOW(), NOW())
		RETURNING id`, "transition.user", string(hash), dre.Nome).Scan(&userID); err != nil {
		t.Fatalf("seed transition user: %v", err)
	}

	login, token := runtimeLoginRequest(t, handler, "transition.user", password, "10.20.30.6:5006")
	if login.Code != http.StatusOK || token == "" {
		t.Fatalf("transition login status=%d body=%s", login.Code, login.Body.String())
	}
	claims, err := parseRuntimeAdminToken(token)
	if err != nil {
		t.Fatalf("parse transition token: %v", err)
	}
	if claims.UserID != userID || claims.DREID != dre.ID || claims.DRE != dre.Nome {
		t.Fatalf("transition token did not derive stable identity: user_id=%d/%d dre_id=%d/%d dre=%q", claims.UserID, userID, claims.DREID, dre.ID, claims.DRE)
	}

	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusOK {
		t.Fatalf("transition baseline /me status=%d body=%s", rr.Code, rr.Body.String())
	}

	dre.Nome = "DRE TRANSICAO RENOMEADA"
	if _, err := m.DREs.Update(ctx, *dre); err != nil {
		t.Fatalf("rename transition DRE: %v", err)
	}
	me := runtimeMeRequest(handler, token)
	if me.Code != http.StatusOK {
		t.Fatalf("same transition token after rename status=%d body=%s", me.Code, me.Body.String())
	}
	payload := decodeRuntimeMe(t, me)
	if payload.Data.DRE == nil || *payload.Data.DRE != dre.Nome {
		t.Fatalf("transition token trusted stale DRE claim: %+v", payload.Data)
	}

	if err := m.DREs.SetActive(ctx, dre.ID, false); err != nil {
		t.Fatalf("deactivate transition DRE: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("transition token survived DRE deactivation: %d %s", rr.Code, rr.Body.String())
	}
	if err := m.DREs.SetActive(ctx, dre.ID, true); err != nil {
		t.Fatalf("reactivate transition DRE: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusOK {
		t.Fatalf("transition token did not recover after DRE reactivation: %d %s", rr.Code, rr.Body.String())
	}

	if _, err := db.ExecContext(ctx, `UPDATE admin_users SET active = false, updated_at = NOW() WHERE id = $1`, userID); err != nil {
		t.Fatalf("deactivate transition user: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("transition token survived user deactivation: %d %s", rr.Code, rr.Body.String())
	}
}

func TestRuntimeTransitionSchemaNeverUsesSchoolsAsDREIdentity(t *testing.T) {
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	t.Setenv("ADMIN_USERNAME", "")
	t.Setenv("ADMIN_PASSWORD_HASH", "")
	t.Setenv("TRUSTED_PROXY_COUNT", "0")
	resetRuntimeLoginLimiter()

	db, m := setupDRELifecycleTestDB(t, false)
	app := &application{models: m}
	handler := app.routes()
	ctx := context.Background()

	if _, err := db.ExecContext(ctx, `INSERT INTO schools (dre) VALUES ('DRE SOMENTE ESCOLA')`); err != nil {
		t.Fatalf("seed ghost school DRE: %v", err)
	}
	password := "ghost-transition-password"
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt ghost user: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO admin_users (username, password_hash, role, dre, active, created_at, updated_at)
		VALUES ('ghost.transition.user', $1, 'dre', 'DRE SOMENTE ESCOLA', true, NOW(), NOW())`, string(hash)); err != nil {
		t.Fatalf("seed ghost transition user: %v", err)
	}

	login, token := runtimeLoginRequest(t, handler, "ghost.transition.user", password, "10.20.30.7:5007")
	if login.Code != http.StatusUnauthorized || token != "" {
		t.Fatalf("schools-only DRE became runtime identity: status=%d token=%q body=%s", login.Code, token, login.Body.String())
	}

	access, err := m.AdminUsers.GetRuntimeAccessByUsername(ctx, "ghost.transition.user")
	if err != nil {
		t.Fatalf("resolve ghost transition user: %v", err)
	}
	if access.DREID != 0 || access.DRE != "" || access.DREActive {
		t.Fatalf("ghost DRE unexpectedly resolved: id=%d dre=%q active=%v", access.DREID, access.DRE, access.DREActive)
	}

	_ = fmt.Sprintf("%d", access.ID) // keep the stable account identity explicitly exercised
}
