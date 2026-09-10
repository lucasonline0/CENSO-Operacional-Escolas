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

// ─── 1. Testes de Autorização (403 Forbidden para role=dre) ───────────────────

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
			name:    "POST /v1/admin/dres (criação de DRE) forbidden for DRE",
			method:  http.MethodPost,
			url:     "/v1/admin/dres",
			handler: app.AdminCreateDRE,
			body:    `{"nome":"DRE ABAETETUBA"}`,
		},
		{
			name:    "GET /v1/admin/dres (listagem de DREs) forbidden for DRE",
			method:  http.MethodGet,
			url:     "/v1/admin/dres",
			handler: app.AdminListDREs,
			body:    "",
		},
		{
			name:    "PUT /v1/admin/dres/1 (edição de DRE) forbidden for DRE",
			method:  http.MethodPut,
			url:     "/v1/admin/dres/1",
			handler: app.AdminUpdateDRE,
			body:    `{"nome":"DRE NOVO NOME"}`,
		},
		{
			name:    "POST /v1/admin/users (criação de usuário) forbidden for DRE",
			method:  http.MethodPost,
			url:     "/v1/admin/users",
			handler: app.AdminCreateUser,
			body:    `{"username":"user1","password":"password1234","role":"dre","dre":"DRE BELEM"}`,
		},
		{
			name:    "GET /v1/admin/users (listagem de usuários) forbidden for DRE",
			method:  http.MethodGet,
			url:     "/v1/admin/users",
			handler: app.AdminListUsers,
			body:    "",
		},
		{
			name:    "PATCH /v1/admin/users/1/status (ativação/desativação de usuário) forbidden for DRE",
			method:  http.MethodPatch,
			url:     "/v1/admin/users/1/status",
			handler: app.AdminUpdateUserStatus,
			body:    `{"active":false}`,
		},
		{
			name:    "POST /v1/admin/users/1/reset-password (reset de senha) forbidden for DRE",
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

// ─── 2. Testes de Autorização para Escopos Ausentes ou Não-Admin ─────────────

func TestAdminDREAndUsersEndpointsForbiddenForNonAdminOrMissingScope(t *testing.T) {
	app := setupTestApp()

	handlers := []struct {
		name    string
		method  string
		url     string
		handler func(w http.ResponseWriter, r *http.Request)
	}{
		{"AdminCreateDRE", http.MethodPost, "/v1/admin/dres", app.AdminCreateDRE},
		{"AdminListDREs", http.MethodGet, "/v1/admin/dres", app.AdminListDREs},
		{"AdminUpdateDRE", http.MethodPut, "/v1/admin/dres/1", app.AdminUpdateDRE},
		{"AdminCreateUser", http.MethodPost, "/v1/admin/users", app.AdminCreateUser},
		{"AdminListUsers", http.MethodGet, "/v1/admin/users", app.AdminListUsers},
		{"AdminUpdateUserStatus", http.MethodPatch, "/v1/admin/users/1/status", app.AdminUpdateUserStatus},
		{"AdminResetUserPassword", http.MethodPost, "/v1/admin/users/1/reset-password", app.AdminResetUserPassword},
	}

	testCases := []struct {
		name  string
		scope *AdminAccessScope
	}{
		{
			name:  "missing scope from context",
			scope: nil,
		},
		{
			name:  "empty role",
			scope: &AdminAccessScope{Username: "unknown", Role: "", DRE: ""},
		},
		{
			name:  "viewer role",
			scope: &AdminAccessScope{Username: "viewer_user", Role: "viewer", DRE: "DRE BELEM"},
		},
		{
			name:  "school role",
			scope: &AdminAccessScope{Username: "escola_user", Role: "escola", DRE: "DRE BELEM"},
		},
	}

	for _, tc := range testCases {
		for _, h := range handlers {
			testName := h.name + " - " + tc.name
			t.Run(testName, func(t *testing.T) {
				req := httptest.NewRequest(h.method, h.url, strings.NewReader(`{}`))
				req.Header.Set("Content-Type", "application/json")

				if tc.scope != nil {
					ctx := context.WithValue(req.Context(), contextKeyAdminScope, *tc.scope)
					req = req.WithContext(ctx)
				}

				rr := httptest.NewRecorder()
				h.handler(rr, req)

				if rr.Code != http.StatusForbidden {
					t.Fatalf("expected status 403 Forbidden on %s, got %d. Body: %s", testName, rr.Code, rr.Body.String())
				}

				var resp jsonResponse
				if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
					t.Fatalf("failed to decode response: %v", err)
				}
				if !resp.Error {
					t.Fatalf("expected resp.Error to be true")
				}
			})
		}
	}
}

// ─── 3. Testes de Roteamento Chi e Middleware de Autenticação ───────────────

func TestAdminDREAndUsersRoutesWithMux(t *testing.T) {
	os.Setenv("ADMIN_JWT_SECRET", "123456789012345678901234567890123456")
	app := setupTestApp()
	handler := app.routes()

	adminToken := createTestJWT("admin_master", RoleAdmin, "")
	dreToken := createTestJWT("user_belem", RoleDRE, "DRE BELEM")

	routesToTest := []struct {
		name      string
		method    string
		url       string
		dreBody   string
		adminBody string
	}{
		{
			name:      "POST /v1/admin/dres",
			method:    http.MethodPost,
			url:       "/v1/admin/dres",
			dreBody:   `{"nome":"DRE TESTE"}`,
			adminBody: `{}`, // Invalid body triggers 400 validation error in handler, confirming auth passed
		},
		{
			name:      "GET /v1/admin/dres",
			method:    http.MethodGet,
			url:       "/v1/admin/dres",
			dreBody:   "",
			adminBody: "",
		},
		{
			name:      "PUT /v1/admin/dres/{id}",
			method:    http.MethodPut,
			url:       "/v1/admin/dres/0", // ID 0 triggers 400 validation error in handler
			dreBody:   `{"nome":"DRE NOVO NOME"}`,
			adminBody: `{}`,
		},
		{
			name:      "POST /v1/admin/users",
			method:    http.MethodPost,
			url:       "/v1/admin/users",
			dreBody:   `{"username":"user_test","password":"secretpassword","role":"dre","dre":"DRE BELEM"}`,
			adminBody: `{}`, // Invalid body triggers 400 validation error in handler
		},
		{
			name:      "GET /v1/admin/users",
			method:    http.MethodGet,
			url:       "/v1/admin/users",
			dreBody:   "",
			adminBody: "",
		},
		{
			name:      "PATCH /v1/admin/users/{id}/status",
			method:    http.MethodPatch,
			url:       "/v1/admin/users/0/status", // ID 0 triggers 400 validation error in handler
			dreBody:   `{"active":false}`,
			adminBody: `{}`,
		},
		{
			name:      "POST /v1/admin/users/{id}/reset-password",
			method:    http.MethodPost,
			url:       "/v1/admin/users/0/reset-password", // ID 0 triggers 400 validation error in handler
			dreBody:   `{"password":"newPassword123"}`,
			adminBody: `{}`,
		},
	}

	for _, route := range routesToTest {
		t.Run(route.name+" - Unauthenticated (401)", func(t *testing.T) {
			var req *http.Request
			if route.dreBody != "" {
				req = httptest.NewRequest(route.method, route.url, strings.NewReader(route.dreBody))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(route.method, route.url, nil)
			}

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized for missing token on %s, got %d", route.name, rr.Code)
			}
		})

		t.Run(route.name+" - DRE Role Token (403)", func(t *testing.T) {
			var req *http.Request
			if route.dreBody != "" {
				req = httptest.NewRequest(route.method, route.url, strings.NewReader(route.dreBody))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(route.method, route.url, nil)
			}
			req.Header.Set("Authorization", "Bearer "+dreToken)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusForbidden {
				t.Fatalf("expected 403 Forbidden for DRE token on %s, got %d. Body: %s", route.name, rr.Code, rr.Body.String())
			}
		})

		t.Run(route.name+" - Admin Token Passes Auth Gate", func(t *testing.T) {
			var req *http.Request
			if route.adminBody != "" {
				req = httptest.NewRequest(route.method, route.url, strings.NewReader(route.adminBody))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(route.method, route.url, nil)
			}
			req.Header.Set("Authorization", "Bearer "+adminToken)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			// Garantir que o token de admin NÃO é barrado por 401 nem por 403
			if rr.Code == http.StatusUnauthorized || rr.Code == http.StatusForbidden {
				t.Fatalf("admin token unexpectedly blocked by auth gate on %s with status %d", route.name, rr.Code)
			}
		})
	}
}

// ─── 4. Testes Unitários de Validação de Input dos Handlers (Admin) ──────────

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

	t.Run("negative ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/v1/admin/dres/-1", strings.NewReader(`{"nome":"DRE ABAETETUBA"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateDRE(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for negative ID, got %d", rr.Code)
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
			"password": "password1234",
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
			"password": "password1234",
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

	t.Run("empty username", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(`{
			"username": "",
			"password": "password1234",
			"role": "dre",
			"dre": "DRE BELEM"
		}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateUser(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for empty username, got %d", rr.Code)
		}
	})

	t.Run("whitespace username", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(`{
			"username": "   ",
			"password": "password1234",
			"role": "dre",
			"dre": "DRE BELEM"
		}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateUser(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for whitespace username, got %d", rr.Code)
		}
	})

	t.Run("malformed json", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(`{invalid json`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminCreateUser(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for malformed JSON, got %d", rr.Code)
		}
	})
}

func TestAdminUpdateUserStatusValidation(t *testing.T) {
	app := setupTestApp()

	t.Run("invalid user ID string", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, "/v1/admin/users/abc/status", strings.NewReader(`{"active":false}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateUserStatus(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for non-integer user ID, got %d", rr.Code)
		}
	})

	t.Run("invalid user ID 0", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, "/v1/admin/users/0/status", strings.NewReader(`{"active":false}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateUserStatus(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for user ID 0, got %d", rr.Code)
		}
	})

	t.Run("negative user ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, "/v1/admin/users/-1/status", strings.NewReader(`{"active":false}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateUserStatus(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for user ID -1, got %d", rr.Code)
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

	t.Run("malformed json", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, "/v1/admin/users/1/status", strings.NewReader(`{status:`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminUpdateUserStatus(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for malformed JSON, got %d", rr.Code)
		}
	})
}

func TestAdminResetUserPasswordValidation(t *testing.T) {
	app := setupTestApp()

	t.Run("invalid user ID string", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/xyz/reset-password", strings.NewReader(`{"password":"newPassword123"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for non-numeric ID, got %d", rr.Code)
		}
	})

	t.Run("zero user ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/0/reset-password", strings.NewReader(`{"password":"newPassword123"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for zero ID, got %d", rr.Code)
		}
	})

	t.Run("negative user ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/-1/reset-password", strings.NewReader(`{"password":"newPassword123"}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for negative ID, got %d", rr.Code)
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

	t.Run("whitespace password", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/1/reset-password", strings.NewReader(`{"password":"   "}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for whitespace password, got %d", rr.Code)
		}
	})

	t.Run("malformed json", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/users/1/reset-password", strings.NewReader(`{password:`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, AdminAccessScope{Role: RoleAdmin}))

		rr := httptest.NewRecorder()
		app.AdminResetUserPassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for malformed JSON, got %d", rr.Code)
		}
	})
}
