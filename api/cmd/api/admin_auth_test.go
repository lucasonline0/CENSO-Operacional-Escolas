package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

func setupTestApp() *application {
	os.Setenv("ADMIN_JWT_SECRET", "123456789012345678901234567890123456")
	app := &application{}
	return app
}

// 1. login admin legado via env continua válido
func TestLegacyEnvAdminLogin(t *testing.T) {
	app := setupTestApp()

	pass := "supersecret123"
	hash, _ := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	os.Setenv("ADMIN_USERNAME", "admin_test")
	os.Setenv("ADMIN_PASSWORD_HASH", string(hash))

	reqBody := `{"username": "admin_test", "password": "supersecret123"}`
	req := httptest.NewRequest("POST", "/v1/admin/login", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.AdminLogin(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var resp jsonResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	dataMap, ok := resp.Data.(map[string]interface{})
	if !ok || dataMap["token"] == nil {
		t.Fatalf("expected token in response data")
	}

	tokenStr := dataMap["token"].(string)
	claims := &adminClaims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret(), nil
	})
	if err != nil || !tok.Valid {
		t.Fatalf("generated token is invalid: %v", err)
	}

	if claims.Username != "admin_test" || claims.Role != RoleAdmin || claims.DRE != "" {
		t.Fatalf("claims mismatch: username=%s, role=%s, dre=%s", claims.Username, claims.Role, claims.DRE)
	}
}

// 2. senha errada não autentica
func TestWrongPasswordRejection(t *testing.T) {
	app := setupTestApp()

	hash, _ := bcrypt.GenerateFromPassword([]byte("correctpassword"), bcrypt.DefaultCost)
	os.Setenv("ADMIN_USERNAME", "admin_test")
	os.Setenv("ADMIN_PASSWORD_HASH", string(hash))

	reqBody := `{"username": "admin_test", "password": "wrongpassword"}`
	req := httptest.NewRequest("POST", "/v1/admin/login", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.AdminLogin(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for wrong password, got %d", rr.Code)
	}
}

// 3. token DRE sem DRE é inválido
func TestDRETokenWithoutDRERejected(t *testing.T) {
	app := setupTestApp()

	claims := adminClaims{
		Username: "user_dre",
		Role:     RoleDRE,
		DRE:      "", // Sem DRE
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "censo-admin",
		},
	}
	tokStr, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())

	nextCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
	})

	req := httptest.NewRequest("GET", "/v1/admin/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokStr)
	rr := httptest.NewRecorder()

	app.requireAdminAuth(nextHandler).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for DRE token without DRE, got %d", rr.Code)
	}
	if nextCalled {
		t.Fatalf("next handler should not have been called")
	}
}

// 4. token expirado continua inválido
func TestExpiredTokenRejected(t *testing.T) {
	app := setupTestApp()

	claims := adminClaims{
		Username: "admin_test",
		Role:     RoleAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)), // Expirado
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			Issuer:    "censo-admin",
		},
	}
	tokStr, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())

	req := httptest.NewRequest("GET", "/v1/admin/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokStr)
	rr := httptest.NewRecorder()

	app.requireAdminAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for expired token, got %d", rr.Code)
	}
}

// 5. algoritmo JWT inválido continua rejeitado
func TestInvalidSigningAlgorithmRejected(t *testing.T) {
	app := setupTestApp()

	claims := adminClaims{
		Username: "admin_test",
		Role:     RoleAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "censo-admin",
		},
	}

	// Sign using 'none' algorithm
	tokStr, _ := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)

	req := httptest.NewRequest("GET", "/v1/admin/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokStr)
	rr := httptest.NewRecorder()

	app.requireAdminAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for token signed with 'none' algorithm, got %d", rr.Code)
	}
}

// 6. Role desconhecida rejeitada
func TestUnknownRoleRejected(t *testing.T) {
	app := setupTestApp()

	claims := adminClaims{
		Username: "user_invalid",
		Role:     "superman",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "censo-admin",
		},
	}
	tokStr, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())

	req := httptest.NewRequest("GET", "/v1/admin/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokStr)
	rr := httptest.NewRecorder()

	app.requireAdminAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for unknown role, got %d", rr.Code)
	}
}

// 7. /admin/me retorna o perfil correto
func TestAdminMeEndpoint(t *testing.T) {
	app := setupTestApp()

	t.Run("admin role profile", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/admin/me", nil)
		scope := AdminAccessScope{Username: "admin_env", Role: RoleAdmin, DRE: ""}
		ctx := req.Context()
		ctx = context.WithValue(ctx, contextKeyAdminScope, scope)
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		app.AdminMe(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rr.Code)
		}

		var resp jsonResponse
		json.Unmarshal(rr.Body.Bytes(), &resp)
		data := resp.Data.(map[string]interface{})

		if data["username"] != "admin_env" || data["role"] != RoleAdmin || data["dre"] != nil {
			t.Fatalf("admin /me response invalid: %+v", data)
		}
	})

	t.Run("dre role profile", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/admin/me", nil)
		scope := AdminAccessScope{Username: "user_belem", Role: RoleDRE, DRE: "DRE BELEM"}
		ctx := req.Context()
		ctx = context.WithValue(ctx, contextKeyAdminScope, scope)
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		app.AdminMe(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rr.Code)
		}

		var resp jsonResponse
		json.Unmarshal(rr.Body.Bytes(), &resp)
		data := resp.Data.(map[string]interface{})

		if data["username"] != "user_belem" || data["role"] != RoleDRE || data["dre"] != "DRE BELEM" {
			t.Fatalf("dre /me response invalid: %+v", data)
		}
	})
}
