package main

import (
	"fmt"
	"net/http"
	"strings"
)

// requireRequestCapability is deliberately backend-side: UI visibility is not
// an authorization boundary. Unknown routes and permissions deny by default.
func (app *application) requireRequestCapability(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/admin/me" {
			next.ServeHTTP(w, r)
			return
		}
		scope, ok := GetAdminAccessScope(r.Context())
		if !ok {
			app.errorJSON(w, fmt.Errorf("escopo de autorização ausente"), http.StatusForbidden)
			return
		}
		if r.URL.Path == "/v1/admin/dres" && r.Method == http.MethodGet {
			if scope.HasPermission(PermissionDREsManage) || scope.HasPermission(PermissionUsersCreate) || scope.HasPermission(PermissionUsersRead) {
				next.ServeHTTP(w, r)
				return
			}
			app.errorJSON(w, fmt.Errorf("permissão insuficiente"), http.StatusForbidden)
			return
		}
		permission := permissionForRequest(r)
		if permission == "" {
			app.errorJSON(w, fmt.Errorf("ação sem capability configurada"), http.StatusForbidden)
			return
		}
		if !scope.HasPermission(permission) {
			app.errorJSON(w, fmt.Errorf("permissão insuficiente"), http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func permissionForRequest(r *http.Request) string {
	p := r.URL.Path
	switch {
	case strings.HasPrefix(p, "/v1/admin/dres/") && strings.HasSuffix(p, "/resumo"):
		return PermissionAnalyticsRead
	case strings.Contains(p, "/analytics/") || p == "/v1/admin/dashboard" || p == "/v1/admin/sheet-metrics" || p == "/v1/admin/indicadores-metrics":
		return PermissionAnalyticsRead
	case strings.HasPrefix(p, "/v1/admin/reports/"):
		return PermissionReportsRead
	case strings.HasPrefix(p, "/v1/admin/census"):
		return PermissionCensusRead
	case p == "/v1/admin/sync-sheets":
		return PermissionSyncExecute
	case strings.HasPrefix(p, "/v1/admin/users/") && strings.HasSuffix(p, "/reset-password"):
		return PermissionUsersResetPassword
	case strings.HasPrefix(p, "/v1/admin/users/"):
		return PermissionUsersManage
	case p == "/v1/admin/users" && r.Method == http.MethodGet:
		return PermissionUsersRead
	case p == "/v1/admin/users" && r.Method == http.MethodPost:
		return PermissionUsersCreate
	case strings.HasPrefix(p, "/v1/admin/dres/") && strings.Contains(p, "/schools"):
		return PermissionSchoolsManageDRE
	case strings.HasPrefix(p, "/v1/admin/schools/"):
		return PermissionSchoolsManageDRE
	case strings.HasPrefix(p, "/v1/admin/dres"):
		return PermissionDREsManage
	default:
		return ""
	}
}
