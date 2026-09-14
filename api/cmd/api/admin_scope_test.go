package main

import (
	"context"
	"testing"
)

func TestGetAdminAccessScope(t *testing.T) {
	t.Run("scope present in context", func(t *testing.T) {
		want := AdminAccessScope{
			Username: "user_dre_belem",
			Role:     RoleDRE,
			DRE:      "DRE BELEM",
		}
		ctx := context.WithValue(context.Background(), contextKeyAdminScope, want)
		got, ok := GetAdminAccessScope(ctx)
		if !ok {
			t.Fatalf("expected scope to be found in context")
		}
		if got != want {
			t.Fatalf("GetAdminAccessScope = %+v; want %+v", got, want)
		}
	})

	t.Run("scope absent from context", func(t *testing.T) {
		_, ok := GetAdminAccessScope(context.Background())
		if ok {
			t.Fatalf("expected scope to NOT be found in empty context")
		}
	})
}

func TestIsAuthorizedForDRE(t *testing.T) {
	adminScope := AdminAccessScope{Username: "admin", Role: RoleAdmin, DRE: ""}
	dreBelemScope := AdminAccessScope{Username: "user_belem", Role: RoleDRE, DRE: "DRE BELEM"}
	dreSpacedScope := AdminAccessScope{Username: "user_belem", Role: RoleDRE, DRE: "  DRE BELEM  "}
	unknownRoleScope := AdminAccessScope{Username: "other", Role: "guest", DRE: "DRE BELEM"}

	t.Run("admin role has global access", func(t *testing.T) {
		if !adminScope.IsAuthorizedForDRE("DRE BELEM") {
			t.Errorf("admin should be authorized for DRE BELEM")
		}
		if !adminScope.IsAuthorizedForDRE("DRE CASTANHAL") {
			t.Errorf("admin should be authorized for DRE CASTANHAL")
		}
		if !adminScope.IsAuthorizedForDRE("") {
			t.Errorf("admin should be authorized even if target DRE is empty")
		}
	})

	t.Run("dre role authorized for same DRE", func(t *testing.T) {
		if !dreBelemScope.IsAuthorizedForDRE("DRE BELEM") {
			t.Errorf("DRE BELEM scope should access DRE BELEM")
		}
	})

	t.Run("dre role case insensitive and whitespace tolerant", func(t *testing.T) {
		if !dreBelemScope.IsAuthorizedForDRE("dre belem") {
			t.Errorf("DRE BELEM scope should access lowercase dre belem")
		}
		if !dreBelemScope.IsAuthorizedForDRE("  DRE BELEM  ") {
			t.Errorf("DRE BELEM scope should access target with extra spaces")
		}
		if !dreSpacedScope.IsAuthorizedForDRE("DRE BELEM") {
			t.Errorf("DRE scope with spaces should access clean target DRE")
		}
	})

	t.Run("dre role forbidden for different DRE (BOLA)", func(t *testing.T) {
		if dreBelemScope.IsAuthorizedForDRE("DRE CASTANHAL") {
			t.Errorf("DRE BELEM scope must NOT access DRE CASTANHAL")
		}
		if dreBelemScope.IsAuthorizedForDRE("DRE MARABA") {
			t.Errorf("DRE BELEM scope must NOT access DRE MARABA")
		}
		if dreBelemScope.IsAuthorizedForDRE("") {
			t.Errorf("DRE BELEM scope must NOT access empty target DRE")
		}
	})

	t.Run("unknown role has no access", func(t *testing.T) {
		if unknownRoleScope.IsAuthorizedForDRE("DRE BELEM") {
			t.Errorf("unknown role must NOT be authorized for any DRE")
		}
	})
}
