package main

import (
	"context"
	"strings"
)

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

// IsAuthorizedForDRE verifica se o escopo de acesso do usuário permite visualizar dados
// da DRE informada. O perfil "admin" possui acesso ilimitado; o perfil "dre" só acessa
// sua própria DRE (compara sem diferenciar maiúsculas/minúsculas nem espaços extras).
func (scope AdminAccessScope) IsAuthorizedForDRE(targetDRE string) bool {
	if scope.Role == RoleAdmin {
		return true
	}
	if scope.Role == RoleDRE {
		userDRE := strings.TrimSpace(scope.DRE)
		target := strings.TrimSpace(targetDRE)
		return userDRE != "" && strings.EqualFold(userDRE, target)
	}
	return false
}
