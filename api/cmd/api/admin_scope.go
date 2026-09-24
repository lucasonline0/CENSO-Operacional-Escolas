package main

import (
	"context"
	"strconv"
	"strings"
)

// AdminAccessScope representa a identidade e o escopo territorial/organizacional
// do usuário autenticado no painel administrativo. DREID é a identidade
// canônica usada para autorização; DRE permanece no contrato para exibição e
// compatibilidade com clientes existentes.
type AdminAccessScope struct {
	Username           string `json:"username"`
	Role               string `json:"role"`
	DREID              int    `json:"dre_id,omitempty"`
	DRE                string `json:"dre"`
	permissions        *map[string]bool
	DataScope          string `json:"data_scope"`
	dreIDs             *[]int
	MustChangePassword bool `json:"must_change_password"`
}

const (
	RoleAdmin = "admin"
	RoleDRE   = "dre"
)

const (
	PermissionCensusRead         = "census.read"
	PermissionAnalyticsRead      = "analytics.read"
	PermissionReportsRead        = "reports.read"
	PermissionUsersRead          = "users.read"
	PermissionUsersCreate        = "users.create"
	PermissionUsersManage        = "users.manage"
	PermissionUsersResetPassword = "users.reset_password"
	PermissionDREsManage         = "dres.manage"
	PermissionSchoolsManageDRE   = "schools.manage_dre"
	PermissionSyncExecute        = "sync.execute"
)

var permissionCatalog = map[string]bool{
	PermissionCensusRead: true, PermissionAnalyticsRead: true, PermissionReportsRead: true,
	PermissionUsersRead: true, PermissionUsersCreate: true, PermissionUsersManage: true,
	PermissionUsersResetPassword: true, PermissionDREsManage: true,
	PermissionSchoolsManageDRE: true, PermissionSyncExecute: true,
}

func IsKnownPermission(permission string) bool { return permissionCatalog[permission] }
func allPermissions() map[string]bool {
	p := make(map[string]bool, len(permissionCatalog))
	for k := range permissionCatalog {
		p[k] = true
	}
	return p
}
func (scope AdminAccessScope) HasPermission(permission string) bool {
	if !IsKnownPermission(permission) || scope.MustChangePassword {
		return false
	}
	// Compatibility for old unit callers that construct the trusted ENV-admin
	// scope directly. Runtime ENV admin always carries an explicit full set.
	if scope.permissions == nil && scope.Role == RoleAdmin && scope.DataScope == "" {
		return true
	}
	return scope.permissions != nil && (*scope.permissions)[permission]
}
func newPermissionSet(items []string) *map[string]bool { p := permissionsMap(items); return &p }
func newDREIDs(items []int) *[]int                     { ids := append([]int(nil), items...); return &ids }
func (scope AdminAccessScope) PermissionNames() []string {
	if scope.permissions == nil {
		return nil
	}
	return permissionNames(*scope.permissions)
}
func (scope AdminAccessScope) ScopedDREIDs() []int {
	if scope.dreIDs == nil {
		return nil
	}
	return append([]int(nil), (*scope.dreIDs)...)
}

func dreScopeSQLArg(primary int, ids []int) any {
	seen := make(map[int]bool, len(ids)+1)
	parts := make([]string, 0, len(ids)+1)
	for _, id := range ids {
		if id > 0 && !seen[id] {
			seen[id] = true
			parts = append(parts, strconv.Itoa(id))
		}
	}
	if len(parts) == 0 && primary > 0 {
		parts = append(parts, strconv.Itoa(primary))
	}
	if len(parts) == 0 {
		return 0
	}
	return strings.Join(parts, ",")
}

func (scope AdminAccessScope) SQLDREScopeParam() any {
	if scope.DataScope != "selected" && !(scope.DataScope == "" && scope.Role == RoleDRE) {
		return 0
	}
	return dreScopeSQLArg(scope.DREID, scope.ScopedDREIDs())
}

type contextKey string

const (
	contextKeyAdminUser  contextKey = "admin_username"
	contextKeyAdminScope contextKey = "admin_access_scope"
)

// GetAdminAccessScope recupera o escopo de acesso do contexto HTTP.
func GetAdminAccessScope(ctx context.Context) (AdminAccessScope, bool) {
	scope, ok := ctx.Value(contextKeyAdminScope).(AdminAccessScope)
	return scope, ok
}

// IsAuthorizedForDREID é a verificação canônica de autorização territorial.
// Admin possui acesso amplo; perfil DRE só acessa objetos vinculados exatamente
// ao mesmo dres.id resolvido no runtime.
func (scope AdminAccessScope) IsAuthorizedForDREID(targetDREID int) bool {
	if (scope.DataScope == "all" || (scope.DataScope == "" && scope.Role == RoleAdmin)) && !scope.MustChangePassword {
		return true
	}
	if (scope.DataScope == "selected" || (scope.DataScope == "" && scope.Role == RoleDRE)) && targetDREID > 0 && !scope.MustChangePassword {
		for _, id := range scope.ScopedDREIDs() {
			if id == targetDREID {
				return true
			}
		}
		return scope.DREID > 0 && scope.DREID == targetDREID
	}
	return false
}

// IsAuthorizedForDRE preserva o contrato textual para código/testes em schema
// pré-0020. Em caminhos canônicos de autorização deve-se usar
// IsAuthorizedForDREID; esta comparação não é fonte de identidade quando DREID
// está disponível.
func (scope AdminAccessScope) IsAuthorizedForDRE(targetDRE string) bool {
	if (scope.DataScope == "all" || (scope.DataScope == "" && scope.Role == RoleAdmin)) && !scope.MustChangePassword {
		return true
	}
	if (scope.DataScope == "selected" || (scope.DataScope == "" && scope.Role == RoleDRE)) && !scope.MustChangePassword {
		userDRE := strings.TrimSpace(scope.DRE)
		target := strings.TrimSpace(targetDRE)
		return userDRE != "" && strings.EqualFold(userDRE, target)
	}
	return false
}
