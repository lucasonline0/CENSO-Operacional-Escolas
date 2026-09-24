package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"censo-api/internal/models"

	"github.com/golang-jwt/jwt/v5"
)

type passwordSetupResponse struct {
	Error bool   `json:"error"`
	Code  string `json:"code"`
	Data  struct {
		ChallengeToken string `json:"challenge_token"`
		Token          string `json:"token"`
	} `json:"data"`
}

func decodePasswordSetupResponse(t *testing.T, recorder *httptest.ResponseRecorder) passwordSetupResponse {
	t.Helper()
	var response passwordSetupResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode password setup response: %v body=%s", err, recorder.Body.String())
	}
	return response
}

func passwordSetupRequest(handler http.Handler, challenge, newPassword, confirmPassword string) *httptest.ResponseRecorder {
	body := fmt.Sprintf(`{"new_password":%q,"confirm_password":%q}`, newPassword, confirmPassword)
	req := httptest.NewRequest(http.MethodPost, "/v1/admin/first-access/password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if challenge != "" {
		req.Header.Set("Authorization", "Bearer "+challenge)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestDREFirstAccessEmailAndOneTimeChallenge(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()

	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE FIRST ACCESS", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}
	temporaryPassword := "Temporary!Password123"
	finalPassword := "Definitive!Password456"
	user, err := m.AdminUsers.ProvisionForDREID(ctx, "first.access", "  FIRST.ACCESS@EXAMPLE.TEST ", temporaryPassword, RoleDRE, dre.ID)
	if err != nil {
		t.Fatalf("provision user: %v", err)
	}
	if user.Email != "first.access@example.test" || !user.MustChangePassword {
		t.Fatalf("provisioned identity/state mismatch: %+v", user)
	}
	initialVersion := user.AuthVersion

	login, token := runtimeLoginRequest(t, handler, "FIRST.ACCESS@EXAMPLE.TEST", temporaryPassword, "203.0.113.10:5010")
	if login.Code != http.StatusForbidden || token != "" {
		t.Fatalf("temporary credential received normal session: status=%d token=%q body=%s", login.Code, token, login.Body.String())
	}
	setup := decodePasswordSetupResponse(t, login)
	if setup.Code != "PASSWORD_SETUP_REQUIRED" || setup.Data.ChallengeToken == "" {
		t.Fatalf("missing explicit password setup contract: %s", login.Body.String())
	}
	if rr := runtimeMeRequest(handler, setup.Data.ChallengeToken); rr.Code != http.StatusUnauthorized {
		t.Fatalf("password setup challenge accessed dashboard middleware: %d %s", rr.Code, rr.Body.String())
	}

	if rr := passwordSetupRequest(handler, setup.Data.ChallengeToken, finalPassword, "different-password"); rr.Code != http.StatusBadRequest {
		t.Fatalf("mismatched confirmation status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr := passwordSetupRequest(handler, setup.Data.ChallengeToken, "short", "short"); rr.Code != http.StatusBadRequest {
		t.Fatalf("short password status=%d body=%s", rr.Code, rr.Body.String())
	}

	completed := passwordSetupRequest(handler, setup.Data.ChallengeToken, finalPassword, finalPassword)
	if completed.Code != http.StatusOK {
		t.Fatalf("complete first access status=%d body=%s", completed.Code, completed.Body.String())
	}
	normalToken := decodePasswordSetupResponse(t, completed).Data.Token
	if normalToken == "" {
		t.Fatal("first access did not return normal session")
	}
	if rr := runtimeMeRequest(handler, normalToken); rr.Code != http.StatusOK {
		t.Fatalf("normal session after setup status=%d body=%s", rr.Code, rr.Body.String())
	}
	updated, err := m.AdminUsers.GetByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("get completed user: %v", err)
	}
	if updated.MustChangePassword || updated.AuthVersion != initialVersion+1 {
		t.Fatalf("setup state/version mismatch: pending=%v version=%d want=%d", updated.MustChangePassword, updated.AuthVersion, initialVersion+1)
	}

	if reused := passwordSetupRequest(handler, setup.Data.ChallengeToken, "Another!Password789", "Another!Password789"); reused.Code != http.StatusUnauthorized {
		t.Fatalf("challenge reuse status=%d body=%s", reused.Code, reused.Body.String())
	}
	if oldLogin, oldToken := runtimeLoginRequest(t, handler, user.Email, temporaryPassword, "203.0.113.11:5011"); oldLogin.Code != http.StatusUnauthorized || oldToken != "" {
		t.Fatalf("temporary password remained valid: status=%d body=%s", oldLogin.Code, oldLogin.Body.String())
	}
	if newLogin, newToken := runtimeLoginRequest(t, handler, user.Username, finalPassword, "203.0.113.12:5012"); newLogin.Code != http.StatusOK || newToken == "" {
		t.Fatalf("legacy username compatibility failed: status=%d body=%s", newLogin.Code, newLogin.Body.String())
	}
}

func TestDREFirstAccessChallengeRevokedByAccountOrDREState(t *testing.T) {
	for _, tc := range []struct {
		name       string
		deactivate func(context.Context, models.Models, *models.DRE, *models.AdminUser) error
	}{
		{
			name: "user deactivated",
			deactivate: func(ctx context.Context, m models.Models, _ *models.DRE, user *models.AdminUser) error {
				return m.AdminUsers.SetActiveByID(ctx, user.ID, false)
			},
		},
		{
			name: "DRE deactivated",
			deactivate: func(ctx context.Context, m models.Models, dre *models.DRE, _ *models.AdminUser) error {
				return m.DREs.SetActive(ctx, dre.ID, false)
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, handler, m := setupRuntimeAuthTest(t)
			ctx := context.Background()
			dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE CHALLENGE " + tc.name, Ativa: true})
			if err != nil {
				t.Fatalf("create DRE: %v", err)
			}
			user, err := m.AdminUsers.ProvisionForDREID(ctx, "challenge."+strings.ReplaceAll(tc.name, " ", "."), strings.ReplaceAll(tc.name, " ", ".")+"@example.test", "Temporary!Password123", RoleDRE, dre.ID)
			if err != nil {
				t.Fatalf("provision user: %v", err)
			}
			login, _ := runtimeLoginRequest(t, handler, user.Email, "Temporary!Password123", "203.0.113.20:5020")
			challenge := decodePasswordSetupResponse(t, login).Data.ChallengeToken
			if challenge == "" {
				t.Fatalf("missing challenge: %s", login.Body.String())
			}
			if err := tc.deactivate(ctx, m, dre, user); err != nil {
				t.Fatalf("deactivate during setup: %v", err)
			}
			if rr := passwordSetupRequest(handler, challenge, "Definitive!Password456", "Definitive!Password456"); rr.Code != http.StatusUnauthorized {
				t.Fatalf("revoked challenge status=%d body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestPasswordSetupChallengeValidationWithoutDatabase(t *testing.T) {
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	app := &application{}
	handler := app.routes()
	now := time.Now()

	claims := passwordSetupClaims{
		UserID: 1, AuthVersion: 1, Purpose: passwordSetupPurpose,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "password-setup:1", Issuer: passwordSetupIssuer,
			Audience: jwt.ClaimStrings{passwordSetupAudience},
			IssuedAt: jwt.NewNumericDate(now.Add(-time.Hour)), ExpiresAt: jwt.NewNumericDate(now.Add(-time.Minute)),
		},
	}
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
	if err != nil {
		t.Fatalf("sign expired challenge: %v", err)
	}

	for name, challenge := range map[string]string{
		"missing":  "",
		"tampered": expired + "x",
		"expired":  expired,
		"normal JWT": func() string {
			token, _ := signRuntimeAdminToken(runtimeAdminClaims{Username: "admin", Role: RoleAdmin, RegisteredClaims: jwt.RegisteredClaims{Subject: "admin-env", Issuer: "censo-admin", IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour))}})
			return token
		}(),
	} {
		t.Run(name, func(t *testing.T) {
			if rr := passwordSetupRequest(handler, challenge, "Definitive!Password456", "Definitive!Password456"); rr.Code != http.StatusUnauthorized {
				t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestAdministrativeResetReturnsAccountToFirstAccess(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE RESET FIRST ACCESS", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}
	user, err := m.AdminUsers.ProvisionForDREID(ctx, "reset.first.access", "reset.first.access@example.test", "Temporary!Password123", RoleDRE, dre.ID)
	if err != nil {
		t.Fatalf("provision: %v", err)
	}
	login, _ := runtimeLoginRequest(t, handler, user.Email, "Temporary!Password123", "203.0.113.30:5030")
	challenge := decodePasswordSetupResponse(t, login).Data.ChallengeToken
	completed := passwordSetupRequest(handler, challenge, "Definitive!Password456", "Definitive!Password456")
	normalToken := decodePasswordSetupResponse(t, completed).Data.Token
	if normalToken == "" {
		t.Fatalf("complete setup: %s", completed.Body.String())
	}

	if err := m.AdminUsers.ResetTemporaryPasswordByID(ctx, user.ID, "Reset!Temporary789"); err != nil {
		t.Fatalf("administrative reset: %v", err)
	}
	if rr := runtimeMeRequest(handler, normalToken); rr.Code != http.StatusUnauthorized {
		t.Fatalf("old session survived reset: %d %s", rr.Code, rr.Body.String())
	}
	resetLogin, resetToken := runtimeLoginRequest(t, handler, user.Email, "Reset!Temporary789", "203.0.113.31:5031")
	if resetLogin.Code != http.StatusForbidden || resetToken != "" || decodePasswordSetupResponse(t, resetLogin).Code != "PASSWORD_SETUP_REQUIRED" {
		t.Fatalf("reset did not restore first-access flow: status=%d token=%q body=%s", resetLogin.Code, resetToken, resetLogin.Body.String())
	}
}


func TestCustomFirstAccessCompletesForGlobalAndSelectedScopes(t *testing.T) {
	for _, tc := range []struct {
		name      string
		dataScope string
		selected  bool
	}{
		{name: "global", dataScope: "all"},
		{name: "selected", dataScope: "selected", selected: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, handler, m := setupRuntimeAuthTest(t)
			ctx := context.Background()

			var dreIDs []int
			if tc.selected {
				dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE CUSTOM FIRST ACCESS " + tc.name, Ativa: true})
				if err != nil {
					t.Fatalf("create DRE: %v", err)
				}
				dreIDs = []int{dre.ID}
			}

			temporaryPassword := "Temporary!Custom123"
			finalPassword := "Definitive!Custom456"
			user, err := m.AdminUsers.ProvisionCustom(
				ctx,
				"custom.first."+tc.name,
				"custom.first."+tc.name+"@example.test",
				temporaryPassword,
				[]string{PermissionCensusRead},
				tc.dataScope,
				dreIDs,
			)
			if err != nil {
				t.Fatalf("provision custom: %v", err)
			}

			login, token := runtimeLoginRequest(t, handler, user.Email, temporaryPassword, "203.0.113.40:5040")
			if login.Code != http.StatusForbidden || token != "" {
				t.Fatalf("temporary credential received normal session: status=%d token=%q body=%s", login.Code, token, login.Body.String())
			}
			challenge := decodePasswordSetupResponse(t, login).Data.ChallengeToken
			if challenge == "" {
				t.Fatalf("missing first-access challenge: %s", login.Body.String())
			}

			completed := passwordSetupRequest(handler, challenge, finalPassword, finalPassword)
			if completed.Code != http.StatusOK {
				t.Fatalf("custom first access failed: status=%d body=%s", completed.Code, completed.Body.String())
			}
			normalToken := decodePasswordSetupResponse(t, completed).Data.Token
			if normalToken == "" {
				t.Fatal("custom first access did not issue a normal session")
			}
			if rr := runtimeMeRequest(handler, normalToken); rr.Code != http.StatusOK {
				t.Fatalf("custom session after setup status=%d body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}


func selfPasswordChangeRequest(handler http.Handler, token, currentPassword, newPassword string) *httptest.ResponseRecorder {
	body := fmt.Sprintf(`{"current_password":%q,"new_password":%q,"confirm_password":%q}`, currentPassword, newPassword, newPassword)
	req := httptest.NewRequest(http.MethodPost, "/v1/admin/me/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestAuthenticatedUserCanRotateOwnPassword(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE SELF PASSWORD", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}
	user, err := m.AdminUsers.ProvisionForDREID(ctx, "self.password", "self.password@example.test", "Temporary!Password123", RoleDRE, dre.ID)
	if err != nil {
		t.Fatalf("provision: %v", err)
	}
	firstLogin, _ := runtimeLoginRequest(t, handler, user.Email, "Temporary!Password123", "203.0.113.50:5050")
	challenge := decodePasswordSetupResponse(t, firstLogin).Data.ChallengeToken
	completed := passwordSetupRequest(handler, challenge, "Definitive!Password456", "Definitive!Password456")
	oldToken := decodePasswordSetupResponse(t, completed).Data.Token
	if oldToken == "" {
		t.Fatalf("complete first access: %s", completed.Body.String())
	}

	wrong := selfPasswordChangeRequest(handler, oldToken, "Wrong!Password123", "Rotated!Password789")
	if wrong.Code != http.StatusUnauthorized {
		t.Fatalf("wrong current password status=%d body=%s", wrong.Code, wrong.Body.String())
	}
	if rr := runtimeMeRequest(handler, oldToken); rr.Code != http.StatusOK {
		t.Fatalf("wrong current password revoked valid session: %d %s", rr.Code, rr.Body.String())
	}

	changed := selfPasswordChangeRequest(handler, oldToken, "Definitive!Password456", "Rotated!Password789")
	if changed.Code != http.StatusOK {
		t.Fatalf("change own password status=%d body=%s", changed.Code, changed.Body.String())
	}
	newToken := decodePasswordSetupResponse(t, changed).Data.Token
	if newToken == "" {
		t.Fatalf("change response missing renewed token: %s", changed.Body.String())
	}
	if rr := runtimeMeRequest(handler, oldToken); rr.Code != http.StatusUnauthorized {
		t.Fatalf("old token survived password rotation: %d %s", rr.Code, rr.Body.String())
	}
	if rr := runtimeMeRequest(handler, newToken); rr.Code != http.StatusOK {
		t.Fatalf("renewed token invalid: %d %s", rr.Code, rr.Body.String())
	}
	if oldLogin, token := runtimeLoginRequest(t, handler, user.Email, "Definitive!Password456", "203.0.113.51:5051"); oldLogin.Code != http.StatusUnauthorized || token != "" {
		t.Fatalf("old password remained valid: status=%d body=%s", oldLogin.Code, oldLogin.Body.String())
	}
	if login, token := runtimeLoginRequest(t, handler, user.Email, "Rotated!Password789", "203.0.113.52:5052"); login.Code != http.StatusOK || token == "" {
		t.Fatalf("new password login failed: status=%d body=%s", login.Code, login.Body.String())
	}
}
