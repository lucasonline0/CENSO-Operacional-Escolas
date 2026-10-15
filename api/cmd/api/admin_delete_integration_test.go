package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"censo-api/internal/models"
)

// PEDRO-09C — a exclusão de DRE foi removida da aplicação.
// Estes testes de integração comprovam que o caminho runtime de exclusão não
// existe mais (a rota nem é alcançável), ao mesmo tempo em que preservam a
// exclusão de usuários e a consulta de dependências da DRE.
// O teste de roteamento sem banco vive em admin_dre_crud_test.go.

// TestAdminDeleteDREEndpointCannotRemoveDREPostgreSQL tenta excluir uma DRE
// real pelo endpoint antigo com token de administrador global: a requisição
// falha no roteador e o registro permanece intacto no banco.
func TestAdminDeleteDREEndpointCannotRemoveDREPostgreSQL(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	_, handler, adminToken := newDREIntegrationApp(t, db)

	var dreID int
	if err := db.QueryRow(`INSERT INTO dres(nome,ativa) VALUES('DRE PEDRO 09C',true) RETURNING id`).Scan(&dreID); err != nil {
		t.Fatal(err)
	}

	rr := requestDREIntegration(t, handler, adminToken, http.MethodDelete,
		fmt.Sprintf("/v1/admin/dres/%d", dreID), nil)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("DELETE de DRE com admin global deveria ser 405, got %d body=%s", rr.Code, rr.Body.String())
	}

	var exists bool
	if err := db.QueryRow(`SELECT true FROM dres WHERE id=$1`, dreID).Scan(&exists); err != nil || !exists {
		t.Fatalf("DRE foi removida pela aplicação: exists=%v err=%v", exists, err)
	}
}

// TestAdminDeleteUserStillWorksPostgreSQL preserva o fluxo obrigatório de
// exclusão de usuários: DELETE /v1/admin/users/{id} continua removendo a
// conta (com revogação de sessão implícita na re-resolução de identidade) e
// NÃO remove a DRE associada.
func TestAdminDeleteUserStillWorksPostgreSQL(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	_, handler, adminToken := newDREIntegrationApp(t, db)
	m := models.NewModels(db)
	ctx := context.Background()

	var dreID int
	if err := db.QueryRow(`INSERT INTO dres(nome,ativa) VALUES('DRE USER DELETE',true) RETURNING id`).Scan(&dreID); err != nil {
		t.Fatal(err)
	}
	user, err := m.AdminUsers.ProvisionForDREID(ctx, "delete.target.user", "delete.target@example.test", "TemporaryPassword-123", "dre", dreID)
	if err != nil {
		t.Fatal(err)
	}

	rr := requestDREIntegration(t, handler, adminToken, http.MethodDelete,
		fmt.Sprintf("/v1/admin/users/%d", user.ID), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("DELETE de usuário deveria ser 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	var users int
	if err := db.QueryRow(`SELECT count(*) FROM admin_users WHERE id=$1`, user.ID).Scan(&users); err != nil || users != 0 {
		t.Fatalf("usuário não foi excluído: count=%d err=%v", users, err)
	}
	// Excluir o usuário não pode excluir sua DRE.
	if _, err := m.DREs.GetByID(ctx, dreID); err != nil {
		t.Fatalf("DRE associada foi afetada pela exclusão do usuário: %v", err)
	}
	// Sem vínculos órfãos de permissões/associações.
	var grants, links int
	if err = db.QueryRow(`SELECT (SELECT count(*) FROM admin_user_permissions WHERE user_id=$1),(SELECT count(*) FROM admin_user_dres WHERE user_id=$1)`, user.ID).Scan(&grants, &links); err != nil {
		t.Fatal(err)
	}
	if grants != 0 || links != 0 {
		t.Fatalf("orphan grants=%d links=%d", grants, links)
	}
}

// TestDREModelDependenciesStillWorksPostgreSQL preserva o método público de
// consulta de dependências (usado pela interface para exibir o estado da
// DRE), provando que ele não foi removido junto com o caminho de exclusão.
func TestDREModelDependenciesStillWorksPostgreSQL(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()

	var emptyID, busyID int
	if err := db.QueryRow(`INSERT INTO dres(nome,ativa) VALUES('DRE DEPS EMPTY',true) RETURNING id`).Scan(&emptyID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`INSERT INTO dres(nome,ativa) VALUES('DRE DEPS BUSY',true) RETURNING id`).Scan(&busyID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.AdminUsers.ProvisionCustom(ctx, "deps.target", "deps.target@example.test", "TemporaryPassword-123", []string{"census.read"}, "selected", []int{busyID}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.AdminUsers.ProvisionForDREID(ctx, "deps.dre.user", "deps.dre@example.test", "TemporaryPassword-123", "dre", busyID); err != nil {
		t.Fatal(err)
	}

	empty, err := m.DREs.Dependencies(ctx, emptyID)
	if err != nil {
		t.Fatal(err)
	}
	if empty.Schools != 0 || empty.Users != 0 || empty.CustomProfiles != 0 || empty.Census != 0 {
		t.Fatalf("empty deps=%+v, want zeros", empty)
	}

	busy, err := m.DREs.Dependencies(ctx, busyID)
	if err != nil {
		t.Fatal(err)
	}
	// Users conta admin_users.dre_id; CustomProfiles conta vínculos distintos
	// em admin_user_dres (perfil customizado + a própria conta regional).
	if busy.Users != 1 || busy.CustomProfiles != 2 {
		t.Fatalf("busy deps=%+v, want Users=1 CustomProfiles=2", busy)
	}

	// Consultar dependências não altera nada: ambas as DREs continuam existindo.
	if _, err = m.DREs.GetByID(ctx, emptyID); err != nil {
		t.Fatalf("empty DRE desapareceu: %v", err)
	}
	if _, err = m.DREs.GetByID(ctx, busyID); err != nil {
		t.Fatalf("busy DRE desapareceu: %v", err)
	}

	// A consulta com ID inválido ainda valida a entrada.
	if _, err = m.DREs.Dependencies(ctx, 0); !errors.Is(err, models.ErrDREInvalidID) {
		t.Fatalf("expected ErrDREInvalidID, got %v", err)
	}
}
