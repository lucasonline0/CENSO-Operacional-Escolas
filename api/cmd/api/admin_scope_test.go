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
