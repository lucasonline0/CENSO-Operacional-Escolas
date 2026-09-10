package main

import (
	"context"
	"net/http"
	"sync"
	"testing"

	"censo-api/internal/models"
)

func requireAuthVersion(t *testing.T, m models.Models, userID, want int) *models.AdminUser {
	t.Helper()
	u, err := m.AdminUsers.GetByID(context.Background(), userID)
	if err != nil {
		t.Fatalf("GetByID(%d): %v", userID, err)
	}
	if u.AuthVersion != want {
		t.Fatalf("user %d auth_version=%d; want %d", userID, u.AuthVersion, want)
	}
	return u
}

func TestDRESessionRevocationMigrationIsCritical(t *testing.T) {
	if !isCriticalAdministrativeMigration("0025_dre_session_revocation.sql") {
		t.Fatal("0025_dre_session_revocation.sql must fail closed as a critical administrative migration")
	}
}

func TestDREUserDeactivationRevokesPermanentlyAndIsIdempotent(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	password := "user-deactivation-password"
	_, user := createRuntimeDREUser(t, m, "DRE USER REVOCATION", "user.revocation", password)

	loginA, tokenA := runtimeLoginRequest(t, handler, user.Username, password, "10.90.1.1:8001")
	if loginA.Code != http.StatusOK || tokenA == "" {
		t.Fatalf("initial login failed: code=%d body=%s", loginA.Code, loginA.Body.String())
	}
	claimsA, err := parseRuntimeAdminToken(tokenA)
	if err != nil {
		t.Fatalf("parse initial token: %v", err)
	}
	if claimsA.AuthVersion != 1 {
		t.Fatalf("initial auth_version=%d; want 1", claimsA.AuthVersion)
	}

	const workers = 8
	var wg sync.WaitGroup
	errCh := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errCh <- m.AdminUsers.SetActiveByID(ctx, user.ID, false)
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatalf("concurrent deactivate: %v", err)
		}
	}

	afterDeactivate := requireAuthVersion(t, m, user.ID, 2)
	if afterDeactivate.Active {
		t.Fatal("user remained active after deactivation")
	}
	if rr := runtimeMeRequest(handler, tokenA); rr.Code != http.StatusUnauthorized {
		t.Fatalf("token A survived deactivation: code=%d body=%s", rr.Code, rr.Body.String())
	}

	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, true); err != nil {
		t.Fatalf("reactivate user: %v", err)
	}
	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, true); err != nil {
		t.Fatalf("repeat reactivation: %v", err)
	}
	reactivated := requireAuthVersion(t, m, user.ID, 2)
	if !reactivated.Active {
		t.Fatal("user did not reactivate")
	}
	if rr := runtimeMeRequest(handler, tokenA); rr.Code != http.StatusUnauthorized {
		t.Fatalf("token A resurrected after reactivation: code=%d body=%s", rr.Code, rr.Body.String())
	}

	loginB, tokenB := runtimeLoginRequest(t, handler, user.Username, password, "10.90.1.2:8002")
	if loginB.Code != http.StatusOK || tokenB == "" {
		t.Fatalf("new login after reactivation failed: code=%d body=%s", loginB.Code, loginB.Body.String())
	}
	claimsB, err := parseRuntimeAdminToken(tokenB)
	if err != nil {
		t.Fatalf("parse fresh token: %v", err)
	}
	if claimsB.AuthVersion != 2 {
		t.Fatalf("fresh token auth_version=%d; want 2", claimsB.AuthVersion)
	}
	if rr := runtimeMeRequest(handler, tokenB); rr.Code != http.StatusOK {
		t.Fatalf("fresh token rejected: code=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDREDeactivationViaUpdateRevokesOnlyLinkedUsersAndNeverResurrects(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	passwordA := "dre-update-password-a"
	passwordB := "dre-update-password-b"

	dreA, userA1 := createRuntimeDREUser(t, m, "DRE UPDATE A", "update.a1", passwordA)
	userA2, err := m.AdminUsers.CreateForDREID(ctx, "update.a2", "dre-update-password-a2", RoleDRE, dreA.ID)
	if err != nil {
		t.Fatalf("create second DRE A user: %v", err)
	}
	_, userB := createRuntimeDREUser(t, m, "DRE UPDATE B", "update.b", passwordB)

	loginA, tokenA := runtimeLoginRequest(t, handler, userA1.Username, passwordA, "10.90.2.1:8101")
	if loginA.Code != http.StatusOK || tokenA == "" {
		t.Fatalf("login DRE A failed: code=%d body=%s", loginA.Code, loginA.Body.String())
	}
	loginB, tokenB := runtimeLoginRequest(t, handler, userB.Username, passwordB, "10.90.2.2:8102")
	if loginB.Code != http.StatusOK || tokenB == "" {
		t.Fatalf("login DRE B failed: code=%d body=%s", loginB.Code, loginB.Body.String())
	}

	requireAuthVersion(t, m, userA1.ID, 1)
	requireAuthVersion(t, m, userA2.ID, 1)
	requireAuthVersion(t, m, userB.ID, 1)

	dreA.Ativa = false
	if _, err := m.DREs.Update(ctx, *dreA); err != nil {
		t.Fatalf("deactivate DRE A via Update: %v", err)
	}
	requireAuthVersion(t, m, userA1.ID, 2)
	requireAuthVersion(t, m, userA2.ID, 2)
	requireAuthVersion(t, m, userB.ID, 1)
	if rr := runtimeMeRequest(handler, tokenA); rr.Code != http.StatusUnauthorized {
		t.Fatalf("DRE A token survived deactivation: code=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr := runtimeMeRequest(handler, tokenB); rr.Code != http.StatusOK {
		t.Fatalf("unrelated DRE B token was revoked: code=%d body=%s", rr.Code, rr.Body.String())
	}

	if _, err := m.DREs.Update(ctx, *dreA); err != nil {
		t.Fatalf("repeat DRE A deactivation: %v", err)
	}
	requireAuthVersion(t, m, userA1.ID, 2)
	requireAuthVersion(t, m, userA2.ID, 2)

	dreA.Ativa = true
	if _, err := m.DREs.Update(ctx, *dreA); err != nil {
		t.Fatalf("reactivate DRE A via Update: %v", err)
	}
	requireAuthVersion(t, m, userA1.ID, 2)
	requireAuthVersion(t, m, userA2.ID, 2)
	if rr := runtimeMeRequest(handler, tokenA); rr.Code != http.StatusUnauthorized {
		t.Fatalf("old DRE A token resurrected after reactivation: code=%d body=%s", rr.Code, rr.Body.String())
	}

	loginFresh, tokenFresh := runtimeLoginRequest(t, handler, userA1.Username, passwordA, "10.90.2.3:8103")
	if loginFresh.Code != http.StatusOK || tokenFresh == "" {
		t.Fatalf("fresh DRE A login after reactivation failed: code=%d body=%s", loginFresh.Code, loginFresh.Body.String())
	}
	claimsFresh, err := parseRuntimeAdminToken(tokenFresh)
	if err != nil {
		t.Fatalf("parse fresh DRE A token: %v", err)
	}
	if claimsFresh.AuthVersion != 2 {
		t.Fatalf("fresh DRE A token auth_version=%d; want 2", claimsFresh.AuthVersion)
	}
	if rr := runtimeMeRequest(handler, tokenFresh); rr.Code != http.StatusOK {
		t.Fatalf("fresh DRE A token rejected: code=%d body=%s", rr.Code, rr.Body.String())
	}
}
