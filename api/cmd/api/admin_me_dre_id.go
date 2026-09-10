package main

import (
	"fmt"
	"net/http"
	"strings"
)

// AdminMeCanonical mantém o nome da DRE no contrato e expõe também o ID
// canônico para clientes que já conseguem migrar para dre_id.
func (app *application) AdminMeCanonical(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok {
		app.errorJSON(w, fmt.Errorf("escopo de acesso não encontrado"), http.StatusUnauthorized)
		return
	}

	var drePtr *string
	var dreIDPtr *int
	if scope.Role == RoleDRE && strings.TrimSpace(scope.DRE) != "" {
		dreVal := scope.DRE
		drePtr = &dreVal
		if scope.DREID > 0 {
			dreID := scope.DREID
			dreIDPtr = &dreID
		}
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error: false,
		Data: map[string]interface{}{
			"username": scope.Username,
			"role":     scope.Role,
			"dre_id":   dreIDPtr,
			"dre":      drePtr,
		},
	})
}
