package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"censo-api/internal/models"
)

func TestSchoolDREErrorStatus(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{"invalid DRE id", models.ErrDREInvalidID, http.StatusBadRequest},
		{"missing schools", models.ErrSchoolIDsRequired, http.StatusBadRequest},
		{"invalid school id wrapped", errors.New("placeholder"), http.StatusInternalServerError},
		{"DRE not found", models.ErrDRENotFound, http.StatusNotFound},
		{"school not found", models.ErrSchoolNotFound, http.StatusNotFound},
		{"inactive DRE", models.ErrDREInactive, http.StatusConflict},
		{"unexpected", errors.New("db down"), http.StatusInternalServerError},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := schoolDREErrorStatus(tc.err); got != tc.want {
				t.Fatalf("got %d, want %d", got, tc.want)
			}
		})
	}

	wrappedInvalidSchool := errors.Join(errors.New("context"), models.ErrSchoolInvalidID)
	if got := schoolDREErrorStatus(wrappedInvalidSchool); got != http.StatusBadRequest {
		t.Fatalf("wrapped ErrSchoolInvalidID: got %d", got)
	}
}

func TestSchoolDREManagementHandlersRequireAdmin(t *testing.T) {
	app := setupTestApp()
	tests := []struct {
		name    string
		method  string
		url     string
		body    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"batch association", http.MethodPost, "/v1/admin/dres/1/schools", `{"school_ids":[1]}`, app.AdminAssignSchoolsToDRE},
		{"single remap", http.MethodPatch, "/v1/admin/schools/1/dre", `{"dre_id":1}`, app.AdminMoveSchoolToDRE},
	}

	for _, tc := range tests {
		t.Run(tc.name+" missing scope", func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.url, strings.NewReader(tc.body))
			rr := httptest.NewRecorder()
			tc.handler(rr, req)
			if rr.Code != http.StatusForbidden {
				t.Fatalf("got %d, want 403", rr.Code)
			}
		})
		t.Run(tc.name+" DRE role", func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.url, strings.NewReader(tc.body))
			scope := AdminAccessScope{Username: "dre-user", Role: RoleDRE, DRE: "DRE BELEM"}
			req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, scope))
			rr := httptest.NewRecorder()
			tc.handler(rr, req)
			if rr.Code != http.StatusForbidden {
				t.Fatalf("got %d, want 403", rr.Code)
			}
		})
	}
}

func TestSchoolDREManagementRoutesAuth(t *testing.T) {
	app := setupTestApp()
	handler := app.routes()
	adminToken := createTestJWT("admin", RoleAdmin, "")
	dreToken := createTestJWT("dre-user", RoleDRE, "DRE BELEM")

	routes := []struct {
		method string
		url    string
		body   string
	}{
		{http.MethodPost, "/v1/admin/dres/0/schools", `{"school_ids":[1]}`},
		{http.MethodPatch, "/v1/admin/schools/0/dre", `{"dre_id":1}`},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.url+" unauthenticated", func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.url, strings.NewReader(route.body))
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusUnauthorized {
				t.Fatalf("got %d, want 401; body=%s", rr.Code, rr.Body.String())
			}
		})
		t.Run(route.method+" "+route.url+" DRE token", func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.url, strings.NewReader(route.body))
			req.Header.Set("Authorization", "Bearer "+dreToken)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusForbidden {
				t.Fatalf("got %d, want 403; body=%s", rr.Code, rr.Body.String())
			}
		})
		t.Run(route.method+" "+route.url+" admin reaches validation", func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.url, strings.NewReader(route.body))
			req.Header.Set("Authorization", "Bearer "+adminToken)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("got %d, want 400; body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestAdminAssignSchoolsToDREValidationBeforeDatabase(t *testing.T) {
	app := setupTestApp()
	handler := app.routes()
	adminToken := createTestJWT("admin", RoleAdmin, "")

	tests := []struct {
		name string
		body string
	}{
		{"empty school list", `{}`},
		{"zero school id", `{"school_ids":[1,0]}`},
		{"negative convenience id", `{"school_id":-1}`},
		{"malformed JSON", `{"school_ids":[1,}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/v1/admin/dres/1/schools", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer "+adminToken)
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("got %d, want 400; body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestAdminMoveSchoolToDREValidationBeforeDatabase(t *testing.T) {
	app := setupTestApp()
	handler := app.routes()
	adminToken := createTestJWT("admin", RoleAdmin, "")

	tests := []struct {
		name string
		body string
	}{
		{"missing target", `{}`},
		{"invalid DRE id", `{"dre_id":0}`},
		{"both target forms", `{"dre_id":1,"dre":"DRE BELEM"}`},
		{"blank name", `{"dre":"   "}`},
		{"malformed JSON", `{"dre_id":`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPatch, "/v1/admin/schools/1/dre", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer "+adminToken)
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("got %d, want 400; body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}
