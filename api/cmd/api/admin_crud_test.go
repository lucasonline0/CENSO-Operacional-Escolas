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
)

func createTestJWT(username, role, dre string) string {
	claims := adminClaims{
		Username: username,
		Role:     role,
		DRE:      dre,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "censo-admin",
			Subject:   "admin",
		},
	}
	tok, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
	return tok
}

// ─── 1. Testes de Autorização (403 Forbidden para não-admin) ─────────────────

func TestAdminDREAndUsersEndpointsForbiddenForDREUser(t *testing.T) {
	app := setupTestApp()

	endpoints := []struct {
		name    string
		method  string
		url     string
		handler func(w http.ResponseWriter, r *http.Request)
		body    string
	}{
		{
			name:    "POST /v1/admin/dres forbidden for DRE",
			method:  http.MethodPost,
			url:     "/v1/admin/dres",
			handler: app.AdminCreateDRE,
			body:    `{"nome":"DRE ABAETETUBA"}`,
		},
		{
			name:    "GET /v1/admin/dres forbidden for DRE",
			method:  http.MethodGet,
			url:     "/v1/admin/dres",
			handler: app.AdminListDREs,
			body:    "",
		},
		{
			name:    "PUT /v1/admin/dres/1 forbidden for DRE",
			method:  http.MethodPut,
			url:     "/v1/admin/dres/1",
			handler: app.AdminUpdateDRE,
			body:    `{"nome":"DRE NOVO NOME"}`,
		},
		{
			name:    "POST /v1/admin/users forbidden for DRE",
			method:  http.MethodPost,
			url:     "/v1/admin/users",
			handler: app.AdminCreateUser,
			body:    `{"username":"user1","password":"password123","role":"dre","dre":"DRE BELEM"}`,
		},
		{
			name:    "GET /v1/admin/users forbidden for DRE",
			method:  http.MethodGet,
			url:     "/v1/admin/users",
			handler: app.AdminListUsers,
			body:    "",
		},
		{
			name:    "PATCH /v1/admin/users/1/status forbidden for DRE",
			method:  http.MethodPatch,
			url:     "/v1/admin/users/1/status",
			handler: app.AdminUpdateUserStatus,
			body:    `{"active":false}`,
		},
		{
			name:    "POST /v1/admin/users/1/reset-password forbidden for DRE",
			method:  http.MethodPost,
			url:     "/v1/admin/users/1/reset-password",
			handler: app.AdminResetUserPassword,
			body:    `{"password":"newPassword123"}`,
		},
	}

	for _, tc := range endpoints {
		t.Run(tc.name, func(t *testing.T) {
			var req *http.Request
			if tc.body != "" {
				req = httptest.NewRequest(tc.method, tc.url, strings.NewReader(tc.body))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(tc.method, tc.url, nil)
			}

			// Context com Role = dre
			scope := AdminAccessScope{
				Username: "user_dre_belem",
				Role:     RoleDRE,
				DRE:      "DRE BELEM",
			}
			ctx := context.WithValue(req.Context(), contextKeyAdminScope, scope)
			ctx = context.WithValue(ctx, contextKeyAdminUser, scope.Username)
			req = req.WithContext(ctx)

			rr := httptest.NewRecorder()
			tc.handler(rr, req)

			if rr.Code != http.StatusForbidden {
				t.Fatalf("expected status 403 Forbidden, got %d. Body: %s", rr.Code, rr.Body.String())
			}

			var resp jsonResponse
			if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if !resp.Error {
				t.Fatalf("expected resp.Error to be true")
			}
			if !strings.Contains(strings.ToLower(resp.Message), "acesso restrito") {
				t.Fatalf("expected message to mention 'acesso restrito', got %q", resp.Message)
			}
		})
	}
}

// ─── 2. Testes de Roteamento Chi e Middleware de Autenticação ───────────────

func TestAdminDREAndUsersRoutesWithMux(t *testing.T) {
	os.Setenv("ADMIN_JWT_SECRET", "123456789012345678901234567890123456")
	app := &application{}
	handler := app.routes()

	adminToken := createTestJWT("admin_master", RoleAdmin, "")
	dreToken := createTestJWT("user_belem", RoleDRE, "DRE BELEM")

	routesToTest := []struct {
		method string
		url    string
		body   string
	}{
		{http.MethodPost, "/v1/admin/dres", `{"nome":"DRE TESTE"}`},
		{http.MethodGet, "/v1/admin/dres", ""},
		{http.MethodPut, "/v1/admin/dres/1", `{"nome":"DRE NOVO NOME"}`},
		{http.MethodPost, "/v1/admin/users", `{"username":"user_test","password":"secretpassword","role":"dre","dre":"DRE BELEM"}`},
		{http.MethodGet, "/v1/admin/users", ""},
		{http.MethodPatch, "/v1/admin/users/1/status", `{"active":false}`},
		{http.MethodPost, "/v1/admin/users/1/reset-password", `{"password":"newPassword123"}`},
	}

	for _, route := range routesToTest {
		t.Run(route.method+" "+route.url+" - Unauthenticated (401)", func(t *testing.T) {
			var req *http.Request
			if route.body != "" {
				req = httptest.NewRequest(route.method, route.url, strings.NewReader(route.body))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(route.method, route.url, nil)
			}

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized for missing token, got %d", rr.Code)
			}
		})

		t.Run(route.method+" "+route.url+" - DRE Role Token (403)", func(t *testing.T) {
			var req *http.Request
			if route.body != "" {
				req = httptest.NewRequest(route.method, route.url, strings.NewReader(route.body))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(route.method, route.url, nil)
			}
			req.Header.Set("Authorization", "Bearer "+dreToken)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusForbidden {
				t.Fatalf("expected 403 Forbidden for DRE token on %s %s, got %d", route.method, route.url, rr.Code)
			}
		})

		t.Run(route.method+" "+route.url+" - Admin Token Passes Auth Gate", func(t *testing.T) {
			var req *http.Request
			if route.body != "" {
				req = httptest.NewRequest(route.method, route.url, strings.NewReader(route.body))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(route.method, route.url, nil)
			}
			req.Header.Set("Authorization", "Bearer "+adminToken)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			// Garantir que a requisição NÃO foi barrada por 401 ou 403 (ou seja, o gate de auth aceitou admin)
			if rr.Code == http.StatusUnauthorized || rr.Code == http.StatusForbidden {
				t.Fatalf("admin token unexpectedly blocked by auth gate on %s %s with status %d", route.method, route.url, rr.Code)
			}
		})
	}
}

// ─── 3. Testes Unitários de Validação de Input dos Handlers ─────────────────

func TestAdminCreateDREValidation(t *testing.T) {
	app := setupTestApp()

	t.Run("empty body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/dres", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateDRE(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for empty DRE name, got %d", rr.Code)
		}
	})

	t.Run("whitespace nome", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/dres", strings.NewReader(`{"nome":"   "}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateDRE(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for whitespace DRE name, got %d", rr.Code)
		}
	})

	t.Run("malformed json", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/dres", strings.NewReader(`{nome:`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateDRE(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for malformed JSON, got %d", rr.Code)
		}
	})
}

func TestAdminUpdateDREValidation(t *testing.T) {
	app := setupTestApp()

	t.Run("invalid ID format", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/v1/admin/dres/abc", strings.NewReader(`{"nome":"DRE ABAETETUBA"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateDRE(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for non-integer ID, got %d", rr.Code)
		}
	})

	t.Run("zero ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/v1/admin/dres/0", strings.NewReader(`{"nome":"DRE ABAETETUBA"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateDRE(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for zero ID, got %d", rr.Code)
		}
	})
}

func TestAdminCreateUserValidation(t *testing.T) {
	app := setupTestApp()

	t.Run("empty body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateUser(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for empty user payload, got %d", rr.Code)
		}
	})

	t.Run("short password", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(`{
			"username": "user1",
			"password": "123",
			"role": "dre",
			"dre": "DRE BELEM"
		}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateUser(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for short password, got %d", rr.Code)
		}
	})

	t.Run("invalid role", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(`{
			"username": "user1",
			"password": "password123",
			"role": "superadmin",
			"dre": "DRE BELEM"
		}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateUser(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for invalid role, got %d", rr.Code)
		}
	})

	t.Run("missing DRE", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(`{
			"username": "user1",
			"password": "password123",
			"role": "dre",
			"dre": ""
		}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateUser(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for missing DRE, got %d", rr.Code)
		}
	})
}

func TestAdminUpdateUserStatusValidation(t *testing.T) {
	app := setupTestApp()

	t.Run("invalid user ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, "/v1/admin/users/0/status", strings.NewReader(`{"active":false}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateUserStatus(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for user ID 0, got %d", rr.Code)
		}
	})

	t.Run("missing status or active field", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, "/v1/admin/users/1/status", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateUserStatus(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for missing status field, got %d", rr.Code)
		}
	})

	t.Run("invalid status value string", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, "/v1/admin/users/1/status", strings.NewReader(`{"status":"invalid_val"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateUserStatus(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for invalid status string, got %d", rr.Code)
		}
	})
}

func TestAdminResetUserPasswordValidation(t *testing.T) {
	app := setupTestApp()

	t.Run("invalid user ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/xyz/reset-password", strings.NewReader(`{"password":"newPassword123"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for non-numeric ID, got %d", rr.Code)
		}
	})

	t.Run("short password", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/1/reset-password", strings.NewReader(`{"password":"123"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for short password, got %d", rr.Code)
		}
	})

	t.Run("empty password", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/1/reset-password", strings.NewReader(`{"password":""}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for empty password, got %d", rr.Code)
		}
	})
}
