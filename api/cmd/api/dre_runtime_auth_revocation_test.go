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
	"golang.org/x/crypto/bcrypt"
)

const runtimeAuthTestSecret = "dre-runtime-auth-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz"

func resetRuntimeLoginLimiter() {
	loginRL.mu.Lock()
	loginRL.attempts = make(map[string][]time.Time)
	loginRL.mu.Unlock()
}

func setupRuntimeAuthTest(t *testing.T) (*application, http.Handler, models.Models) {
	t.Helper()
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	t.Setenv("ADMIN_USERNAME", "")
	t.Setenv("ADMIN_PASSWORD_HASH", "")
	t.Setenv("TRUSTED_PROXY_COUNT", "0")
	resetRuntimeLoginLimiter()

	_, m := setupDRELifecycleTestDB(t, true)
	app := &application{models: m}
	return app, app.routes(), m
}

func runtimeLoginRequest(t *testing.T, handler http.Handler, username, password, remoteAddr string) (*httptest.ResponseRecorder, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/admin/login", strings.NewReader(fmt.Sprintf(`{"username":%q,"password":%q}`, username, password)))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remoteAddr
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		return rr, ""
	}
	token, err := decodeRuntimeLoginToken(rr.Body.Bytes())
	if err != nil {
		t.Fatalf("decode runtime login token: %v; body=%s", err, rr.Body.String())
	}
	return rr, token
}

func runtimeMeRequest(handler http.Handler, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/v1/admin/me", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

type runtimeMePayload struct {
	Error bool `json:"error"`
	Data  struct {
		Username string  `json:"username"`
		Role     string  `json:"role"`
		DRE      *string `json:"dre"`
	} `json:"data"`
}

func decodeRuntimeMe(t *testing.T, rr *httptest.ResponseRecorder) runtimeMePayload {
	t.Helper()
	var payload runtimeMePayload
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode /admin/me: %v; body=%s", err, rr.Body.String())
	}
	return payload
}

func createRuntimeDREUser(t *testing.T, m models.Models, dreName, username, password string) (*models.DRE, *models.AdminUser) {
	t.Helper()
	ctx := context.Background()
	dre, err := m.DREs.Create(ctx, models.DRE{Nome: dreName, Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}
	user, err := m.AdminUsers.CreateForDREID(ctx, username, password, RoleDRE, dre.ID)
	if err != nil {
		t.Fatalf("create DRE user: %v", err)
	}
	return dre, user
}

func TestRuntimeDRETokenStableIdentityAndMeTracksCurrentDatabaseState(t *testing.T) {
	app, handler, m := setupRuntimeAuthTest(t)
	_ = app
	ctx := context.Background()
	password := "runtime-password-206"
	dre, user := createRuntimeDREUser(t, m, "DRE RUNTIME ORIGINAL", "runtime.user", password)

	rr, token := runtimeLoginRequest(t, handler, user.Username, password, "10.20.30.1:5001")
	if rr.Code != http.StatusOK {
		t.Fatalf("login status=%d body=%s", rr.Code, rr.Body.String())
	}

	claims, err := parseRuntimeAdminToken(token)
	if err != nil {
		t.Fatalf("parse issued runtime token: %v", err)
	}
	if claims.UserID != user.ID || claims.DREID != dre.ID {
		t.Fatalf("stable claims mismatch: user_id=%d/%d dre_id=%d/%d", claims.UserID, user.ID, claims.DREID, dre.ID)
	}
	if claims.Subject != fmt.Sprintf("admin-user:%d", user.ID) {
		t.Fatalf("stable subject mismatch: %q", claims.Subject)
	}
	if claims.DRE != "DRE RUNTIME ORIGINAL" {
		t.Fatalf("unexpected initial DRE snapshot: %q", claims.DRE)
	}

	meBefore := runtimeMeRequest(handler, token)
	if meBefore.Code != http.StatusOK {
		t.Fatalf("initial /me status=%d body=%s", meBefore.Code, meBefore.Body.String())
	}
	before := decodeRuntimeMe(t, meBefore)
	if before.Data.DRE == nil || *before.Data.DRE != dre.Nome || before.Data.Username != user.Username {
		t.Fatalf("initial /me stale: %+v", before.Data)
	}

	dre.Nome = "DRE RUNTIME RENOMEADA"
	if _, err := m.DREs.Update(ctx, *dre); err != nil {
		t.Fatalf("rename DRE: %v", err)
	}
	if _, err := m.AdminUsers.DB.ExecContext(ctx, `UPDATE admin_users SET username = $1, updated_at = NOW() WHERE id = $2`, "runtime.user.renamed", user.ID); err != nil {
		t.Fatalf("rename username fixture: %v", err)
	}

	// O JWT continua contendo snapshots antigos. O resultado correto só pode vir
	// de uma resolução runtime por identidade estável.
	staleClaims, err := parseRuntimeAdminToken(token)
	if err != nil {
		t.Fatalf("parse stale token: %v", err)
	}
	if staleClaims.DRE != "DRE RUNTIME ORIGINAL" || staleClaims.Username != "runtime.user" {
		t.Fatalf("fixture deixou de provar claims stale: dre=%q username=%q", staleClaims.DRE, staleClaims.Username)
	}

	meAfter := runtimeMeRequest(handler, token)
	if meAfter.Code != http.StatusOK {
		t.Fatalf("same token after rename status=%d body=%s", meAfter.Code, meAfter.Body.String())
	}
	after := decodeRuntimeMe(t, meAfter)
	if after.Data.DRE == nil || *after.Data.DRE != "DRE RUNTIME RENOMEADA" || after.Data.Username != "runtime.user.renamed" || after.Data.Role != RoleDRE {
		t.Fatalf("/me did not resolve current DB state: %+v", after.Data)
	}
}

func TestRuntimeDREImmediateRevocationForUserAndDREStatus(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	password := "runtime-status-password"
	dre, user := createRuntimeDREUser(t, m, "DRE STATUS", "status.user", password)

	_, token := runtimeLoginRequest(t, handler, user.Username, password, "10.20.30.2:5002")
	if token == "" {
		t.Fatalf("expected initial token")
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusOK {
		t.Fatalf("baseline request failed: %d %s", rr.Code, rr.Body.String())
	}

	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, false); err != nil {
		t.Fatalf("deactivate user: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("same token survived user deactivation: status=%d body=%s", rr.Code, rr.Body.String())
	}

	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, true); err != nil {
		t.Fatalf("reactivate user: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusOK {
		t.Fatalf("same token did not recover after user reactivation: %d %s", rr.Code, rr.Body.String())
	}

	if err := m.DREs.SetActive(ctx, dre.ID, false); err != nil {
		t.Fatalf("deactivate DRE: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("same token survived DRE deactivation: status=%d body=%s", rr.Code, rr.Body.String())
	}

	loginInactive, inactiveToken := runtimeLoginRequest(t, handler, user.Username, password, "10.20.30.3:5003")
	if loginInactive.Code != http.StatusUnauthorized || inactiveToken != "" {
		t.Fatalf("inactive DRE accepted login: status=%d body=%s", loginInactive.Code, loginInactive.Body.String())
	}

	if err := m.DREs.SetActive(ctx, dre.ID, true); err != nil {
		t.Fatalf("reactivate DRE: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusOK {
		t.Fatalf("same old token did not recover after DRE reactivation: %d %s", rr.Code, rr.Body.String())
	}
	loginActive, newToken := runtimeLoginRequest(t, handler, user.Username, password, "10.20.30.4:5004")
	if loginActive.Code != http.StatusOK || newToken == "" {
		t.Fatalf("reactivated DRE did not accept login: status=%d body=%s", loginActive.Code, loginActive.Body.String())
	}
}

func TestRuntimeLegacyDRETokenIsRevalidatedAgainstCurrentDatabase(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	dre, user := createRuntimeDREUser(t, m, "DRE LEGACY ORIGINAL", "legacy.runtime.user", "legacy-password")

	legacy := adminClaims{
		Username: user.Username,
		Role:     RoleDRE,
		DRE:      "DRE CLAIM ANTIGA",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "censo-admin",
			Subject:   "admin",
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, legacy).SignedString(jwtSecret())
	if err != nil {
		t.Fatalf("sign legacy token: %v", err)
	}

	dre.Nome = "DRE LEGACY RENOMEADA"
	if _, err := m.DREs.Update(ctx, *dre); err != nil {
		t.Fatalf("rename DRE: %v", err)
	}

	rr := runtimeMeRequest(handler, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("legacy token should be upgraded runtime, status=%d body=%s", rr.Code, rr.Body.String())
	}
	me := decodeRuntimeMe(t, rr)
	if me.Data.DRE == nil || *me.Data.DRE != "DRE LEGACY RENOMEADA" {
		t.Fatalf("legacy token trusted stale DRE claim: %+v", me.Data)
	}

	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, false); err != nil {
		t.Fatalf("deactivate legacy user: %v", err)
	}
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("legacy token survived user deactivation: %d %s", rr.Code, rr.Body.String())
	}
}

func TestRuntimeEnvAdminCompatibilityAndJWTGuards(t *testing.T) {
	t.Setenv("ADMIN_JWT_SECRET", runtimeAuthTestSecret)
	t.Setenv("TRUSTED_PROXY_COUNT", "0")
	resetRuntimeLoginLimiter()

	password := "env-admin-runtime-password"
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt env admin: %v", err)
	}
	t.Setenv("ADMIN_USERNAME", "runtime_env_admin")
	t.Setenv("ADMIN_PASSWORD_HASH", string(hash))

	app := &application{}
	handler := app.routes()
	login, token := runtimeLoginRequest(t, handler, "runtime_env_admin", password, "10.20.30.5:5005")
	if login.Code != http.StatusOK || token == "" {
		t.Fatalf("env admin login failed: status=%d body=%s", login.Code, login.Body.String())
	}
	claims, err := parseRuntimeAdminToken(token)
	if err != nil {
		t.Fatalf("parse env admin token: %v", err)
	}
	if claims.Role != RoleAdmin || claims.UserID != 0 || claims.DREID != 0 || claims.Username != "runtime_env_admin" {
		t.Fatalf("env admin claims changed incompatibly: %+v", claims)
	}
	me := runtimeMeRequest(handler, token)
	if me.Code != http.StatusOK {
		t.Fatalf("env admin /me failed: %d %s", me.Code, me.Body.String())
	}

	tests := []struct {
		name  string
		token func() string
	}{
		{
			name: "expired",
			token: func() string {
				c := runtimeAdminClaims{Username: "runtime_env_admin", Role: RoleAdmin, RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
					IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Hour)),
					Issuer:    "censo-admin",
				}}
				s, _ := signRuntimeAdminToken(c)
				return s
			},
		},
		{
			name: "wrong issuer",
			token: func() string {
				c := runtimeAdminClaims{Username: "runtime_env_admin", Role: RoleAdmin, RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
					Issuer:    "outro-emissor",
				}}
				s, _ := signRuntimeAdminToken(c)
				return s
			},
		},
		{
			name: "hs384 rejected",
			token: func() string {
				c := runtimeAdminClaims{Username: "runtime_env_admin", Role: RoleAdmin, RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
					Issuer:    "censo-admin",
				}}
				s, _ := jwt.NewWithClaims(jwt.SigningMethodHS384, c).SignedString(jwtSecret())
				return s
			},
		},
		{
			name: "unknown role",
			token: func() string {
				c := runtimeAdminClaims{Username: "x", Role: "superman", RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
					Issuer:    "censo-admin",
				}}
				s, _ := signRuntimeAdminToken(c)
				return s
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rr := runtimeMeRequest(handler, tc.token())
			if rr.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d body=%s", rr.Code, rr.Body.String())
			}
		})
	}

	if rr := runtimeMeRequest(handler, ""); rr.Code != http.StatusUnauthorized {
		t.Fatalf("missing bearer token accepted: %d %s", rr.Code, rr.Body.String())
	}
}

func TestRuntimeDREAuthorizationStress6000RequestsWithStaleClaims(t *testing.T) {
	app, _, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	dre, user := createRuntimeDREUser(t, m, "DRE STRESS AUTH 000", "runtime.stress.user", "stress-password")

	now := time.Now()
	claims := runtimeAdminClaims{
		UserID:   user.ID,
		DREID:    dre.ID,
		Username: user.Username,
		Role:     RoleDRE,
		DRE:      dre.Nome,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(2 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "censo-admin",
			Subject:   fmt.Sprintf("admin-user:%d", user.ID),
		},
	}
	token, err := signRuntimeAdminToken(claims)
	if err != nil {
		t.Fatalf("sign stress token: %v", err)
	}

	expectedDRE := dre.Nome
	calls := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scope, ok := GetAdminAccessScope(r.Context())
		if !ok {
			t.Errorf("runtime scope missing")
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if scope.Username != user.Username || scope.Role != RoleDRE || scope.DRE != expectedDRE {
			t.Errorf("iteration scope stale: %+v expected DRE=%q", scope, expectedDRE)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		calls++
		w.WriteHeader(http.StatusNoContent)
	})
	protected := app.requireRuntimeAdminAuth(next)

	for i := 0; i < 6000; i++ {
		if i > 0 && i%1000 == 0 {
			expectedDRE = fmt.Sprintf("DRE STRESS AUTH %03d", i/1000)
			dre.Nome = expectedDRE
			if _, err := m.DREs.Update(ctx, *dre); err != nil {
				t.Fatalf("iteration %d rename: %v", i, err)
			}
		}

		req := httptest.NewRequest(http.MethodGet, "/v1/admin/me", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)
		if rr.Code != http.StatusNoContent {
			t.Fatalf("iteration %d status=%d body=%s", i, rr.Code, rr.Body.String())
		}
	}
	if calls != 6000 {
		t.Fatalf("authorized calls=%d want=6000", calls)
	}

	// O snapshot original continuou propositalmente stale durante todo o stress.
	parsed, err := parseRuntimeAdminToken(token)
	if err != nil {
		t.Fatalf("parse stress token: %v", err)
	}
	if parsed.DRE != "DRE STRESS AUTH 000" {
		t.Fatalf("stress token unexpectedly mutated: %q", parsed.DRE)
	}
}

// TestRuntimeDREPasswordResetRevokesPriorTokensImmediately cobre os 10 passos obrigatórios da feature:
// 1. login DRE e emissão de token A;
// 2. token A acessa /v1/admin/me com 200;
// 3. admin redefine senha;
// 4. token A passa a receber 401 imediatamente;
// 5. senha antiga não autentica;
// 6. nova senha autentica e gera token B;
// 7. token B funciona;
// 8. reset subsequente invalida B;
// 9. desativação/reativação existente continua com comportamento esperado;
// 10. rename de DRE não invalida sessão por engano.
func TestRuntimeDREPasswordResetRevokesPriorTokensImmediately(t *testing.T) {
	app, handler, m := setupRuntimeAuthTest(t)
	_ = app
	ctx := context.Background()

	// 0. Setup: DRE e Usuário DRE
	initialPassword := "initial-password-123"
	dre, user := createRuntimeDREUser(t, m, "DRE REVOGACAO TESTE", "user.reset.test", initialPassword)

	// 1. login DRE e emissão de token A
	loginA, tokenA := runtimeLoginRequest(t, handler, user.Username, initialPassword, "10.80.1.1:7001")
	if loginA.Code != http.StatusOK || tokenA == "" {
		t.Fatalf("passo 1 falhou: login A retornou code=%d body=%s", loginA.Code, loginA.Body.String())
	}

	claimsA, err := parseRuntimeAdminToken(tokenA)
	if err != nil {
		t.Fatalf("passo 1 parse token A: %v", err)
	}
	if claimsA.AuthVersion != 1 {
		t.Fatalf("passo 1 auth_version esperado 1, obteve %d", claimsA.AuthVersion)
	}

	// 2. token A acessa /v1/admin/me com 200
	meA := runtimeMeRequest(handler, tokenA)
	if meA.Code != http.StatusOK {
		t.Fatalf("passo 2 falhou: token A /me status=%d body=%s", meA.Code, meA.Body.String())
	}

	// 3. admin redefine senha (via UpdatePasswordByID / endpoint)
	newPassword1 := "new-password-step3-456"
	if err := m.AdminUsers.UpdatePasswordByID(ctx, user.ID, newPassword1); err != nil {
		t.Fatalf("passo 3 falhou: reset de senha: %v", err)
	}

	// 4. token A passa a receber 401 imediatamente (sem depender do TTL)
	meAAfterReset := runtimeMeRequest(handler, tokenA)
	if meAAfterReset.Code != http.StatusUnauthorized {
		t.Fatalf("passo 4 falhou: token A deveria receber 401 apos reset, mas recebeu %d body=%s", meAAfterReset.Code, meAAfterReset.Body.String())
	}

	// 5. senha antiga não autentica
	loginOld, _ := runtimeLoginRequest(t, handler, user.Username, initialPassword, "10.80.1.2:7002")
	if loginOld.Code != http.StatusUnauthorized {
		t.Fatalf("passo 5 falhou: senha antiga deveria receber 401, recebeu %d body=%s", loginOld.Code, loginOld.Body.String())
	}

	// 6. nova senha autentica e gera token B
	loginB, tokenB := runtimeLoginRequest(t, handler, user.Username, newPassword1, "10.80.1.3:7003")
	if loginB.Code != http.StatusOK || tokenB == "" {
		t.Fatalf("passo 6 falhou: nova senha nao autenticou: code=%d body=%s", loginB.Code, loginB.Body.String())
	}

	claimsB, err := parseRuntimeAdminToken(tokenB)
	if err != nil {
		t.Fatalf("passo 6 parse token B: %v", err)
	}
	if claimsB.AuthVersion != 2 {
		t.Fatalf("passo 6 auth_version esperado 2, obteve %d", claimsB.AuthVersion)
	}

	// 7. token B funciona
	meB := runtimeMeRequest(handler, tokenB)
	if meB.Code != http.StatusOK {
		t.Fatalf("passo 7 falhou: token B /me status=%d body=%s", meB.Code, meB.Body.String())
	}

	// 8. reset subsequente invalida B
	newPassword2 := "third-password-step8-789"
	if err := m.AdminUsers.UpdatePasswordByID(ctx, user.ID, newPassword2); err != nil {
		t.Fatalf("passo 8 falhou: reset subsequente: %v", err)
	}
	meBAfterReset2 := runtimeMeRequest(handler, tokenB)
	if meBAfterReset2.Code != http.StatusUnauthorized {
		t.Fatalf("passo 8 falhou: token B deveria receber 401 apos 2o reset, mas recebeu %d body=%s", meBAfterReset2.Code, meBAfterReset2.Body.String())
	}

	// Emitir token C com a senha do passo 8
	loginC, tokenC := runtimeLoginRequest(t, handler, user.Username, newPassword2, "10.80.1.4:7004")
	if loginC.Code != http.StatusOK || tokenC == "" {
		t.Fatalf("login C falhou: code=%d body=%s", loginC.Code, loginC.Body.String())
	}
	if rr := runtimeMeRequest(handler, tokenC); rr.Code != http.StatusOK {
		t.Fatalf("token C baseline /me falhou: %d %s", rr.Code, rr.Body.String())
	}

	// 9. desativação/reativação existente continua com comportamento esperado
	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, false); err != nil {
		t.Fatalf("passo 9 desativar usuario: %v", err)
	}
	if rr := runtimeMeRequest(handler, tokenC); rr.Code != http.StatusUnauthorized {
		t.Fatalf("passo 9 falhou: token C sobreviveu a desativacao do usuario: status=%d", rr.Code)
	}
	if err := m.AdminUsers.SetActiveByID(ctx, user.ID, true); err != nil {
		t.Fatalf("passo 9 reativar usuario: %v", err)
	}
	if rr := runtimeMeRequest(handler, tokenC); rr.Code != http.StatusOK {
		t.Fatalf("passo 9 falhou: token C nao recuperou apos reativacao do usuario: status=%d", rr.Code)
	}

	// 10. rename de DRE não invalida sessão por engano
	dre.Nome = "DRE REVOGACAO RENOMEADA"
	if _, err := m.DREs.Update(ctx, *dre); err != nil {
		t.Fatalf("passo 10 renomear DRE: %v", err)
	}
	meCAfterRename := runtimeMeRequest(handler, tokenC)
	if meCAfterRename.Code != http.StatusOK {
		t.Fatalf("passo 10 falhou: rename da DRE invalidou sessao por engano: status=%d body=%s", meCAfterRename.Code, meCAfterRename.Body.String())
	}
	mePayload := decodeRuntimeMe(t, meCAfterRename)
	if mePayload.Data.DRE == nil || *mePayload.Data.DRE != "DRE REVOGACAO RENOMEADA" {
		t.Fatalf("passo 10 falhou: DRE renomeada nao refletida no /me: %+v", mePayload.Data)
	}
}

func TestRuntimeLegacyDRETokenRevokedWhenPasswordIsReset(t *testing.T) {
	_, handler, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	dre, user := createRuntimeDREUser(t, m, "DRE LEGACY RESET", "legacy.reset.user", "legacy-pass-123")

	// Token legado emitido sem claim auth_version (versão 0)
	legacy := adminClaims{
		Username: user.Username,
		Role:     RoleDRE,
		DRE:      dre.Nome,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "censo-admin",
			Subject:   "admin",
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, legacy).SignedString(jwtSecret())
	if err != nil {
		t.Fatalf("sign legacy token: %v", err)
	}

	// Token legado com auth_version no banco == 1 deve funcionar na janela de transição
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusOK {
		t.Fatalf("legacy token should be accepted before password reset, got %d body=%s", rr.Code, rr.Body.String())
	}

	// Ao redefinir a senha do usuário, auth_version incrementa para 2
	if err := m.AdminUsers.UpdatePasswordByID(ctx, user.ID, "new-legacy-pass-456"); err != nil {
		t.Fatalf("update password: %v", err)
	}

	// Token legado agora DEVE ser revogado imediatamente (401)
	if rr := runtimeMeRequest(handler, token); rr.Code != http.StatusUnauthorized {
		t.Fatalf("legacy token survived password reset: got %d body=%s", rr.Code, rr.Body.String())
	}
}

