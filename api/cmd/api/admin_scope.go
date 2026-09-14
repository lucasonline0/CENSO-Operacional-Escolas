package main

import (
	"context"
	"strings"
)

// AdminAccessScope representa a identidade e o escopo territorial/organizacional
// do usuário autenticado no painel administrativo. DREID é a identidade
// canônica usada para autorização; DRE permanece no contrato para exibição e
// compatibilidade com clientes existentes.
type AdminAccessScope struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	DREID    int    `json:"dre_id,omitempty"`
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

// IsAuthorizedForDREID é a verificação canônica de autorização territorial.
// Admin possui acesso amplo; perfil DRE só acessa objetos vinculados exatamente
// ao mesmo dres.id resolvido no runtime.
func (scope AdminAccessScope) IsAuthorizedForDREID(targetDREID int) bool {
	if scope.Role == RoleAdmin {
		return true
	}
	if scope.Role == RoleDRE {
		return scope.DREID > 0 && targetDREID > 0 && scope.DREID == targetDREID
	}
	return false
}

// IsAuthorizedForDRE preserva o contrato textual para código/testes em schema
// pré-0020. Em caminhos canônicos de autorização deve-se usar
// IsAuthorizedForDREID; esta comparação não é fonte de identidade quando DREID
// está disponível.
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
