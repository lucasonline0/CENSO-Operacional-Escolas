package main

import "context"

// AdminAccessScope representa a identidade e o escopo territorial/organizacional
// do usuário autenticado no painel administrativo.
type AdminAccessScope struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	DRE      string `json:"dre"`
}

const (
	RoleAdmin = "admin"
	RoleDRE   = "dre"
)

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
