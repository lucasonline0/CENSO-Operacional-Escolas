package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBulkDREBootstrapEndpointsAreEnvAdminOnly(t *testing.T) {
	app := setupTestApp()
	perms := map[string]bool{PermissionUsersManage: true}
	actors := []AdminAccessScope{
		{UserID: 42, Username: "custom.global", Role: "custom", DataScope: "all", permissions: &perms},
		{UserID: 7, Username: "dre.user", Role: RoleDRE, DataScope: "selected", permissions: &perms, dreIDs: newDREIDs([]int{1})},
		{UserID: 9, Username: "db.admin", Role: RoleAdmin, DataScope: "all", permissions: &perms},
	}
	for _, actor := range actors {
		for _, tc := range []struct {
			method, path string
			handler      http.HandlerFunc
		}{{http.MethodGet, "/v1/admin/users/bulk-dre-bootstrap/preview", app.AdminBulkDREBootstrapPreview}, {http.MethodPost, "/v1/admin/users/bulk-dre-bootstrap", app.AdminBulkDREBootstrap}} {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, actor))
			rr := httptest.NewRecorder()
			tc.handler(rr, req)
			if rr.Code != http.StatusForbidden {
				t.Errorf("actor=%s %s %s status=%d", actor.Username, tc.method, tc.path, rr.Code)
			}
		}
	}
}
