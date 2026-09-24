package models

import (
	"context"
	"testing"
)

func TestAdminUserModelValidation(t *testing.T) {
	m := &AdminUserModel{DB: nil}
	ctx := context.Background()

	t.Run("empty username validation", func(t *testing.T) {
		_, err := m.Create(ctx, "", "password1234", "dre", "DRE BELEM")
		if err == nil || err.Error() != "username não pode ser vazio" {
			t.Fatalf("expected empty username error, got %v", err)
		}
	})

	t.Run("whitespace username validation", func(t *testing.T) {
		_, err := m.Create(ctx, "   ", "password1234", "dre", "DRE BELEM")
		if err == nil || err.Error() != "username não pode ser vazio" {
			t.Fatalf("expected empty username error, got %v", err)
		}
	})

	t.Run("short password validation", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "123", "dre", "DRE BELEM")
		if err == nil || err.Error() != "senha deve ter no mínimo 12 caracteres" {
			t.Fatalf("expected short password error, got %v", err)
		}
	})

	t.Run("invalid role validation", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "password1234", "admin", "DRE BELEM")
		if err != ErrInvalidRole {
			t.Fatalf("expected ErrInvalidRole, got %v", err)
		}
	})

	t.Run("missing DRE validation for dre role", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "password1234", "dre", "")
		if err != ErrDRERequiredForDRE {
			t.Fatalf("expected ErrDRERequiredForDRE, got %v", err)
		}
	})

	t.Run("whitespace DRE validation for dre role", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "password1234", "dre", "   ")
		if err != ErrDRERequiredForDRE {
			t.Fatalf("expected ErrDRERequiredForDRE, got %v", err)
		}
	})

	t.Run("short new password on UpdatePassword validation", func(t *testing.T) {
		err := m.UpdatePassword(ctx, "user1", "123")
		if err == nil || err.Error() != "nova senha deve ter no mínimo 12 caracteres" {
			t.Fatalf("expected short new password error, got %v", err)
		}
	})

	t.Run("UpdatePasswordByID invalid ID validation", func(t *testing.T) {
		err := m.UpdatePasswordByID(ctx, 0, "password1234")
		if err != ErrUserNotFound {
			t.Fatalf("expected ErrUserNotFound for id=0, got %v", err)
		}

		err = m.UpdatePasswordByID(ctx, -1, "password1234")
		if err != ErrUserNotFound {
			t.Fatalf("expected ErrUserNotFound for id=-1, got %v", err)
		}
	})

	t.Run("UpdatePasswordByID short password validation", func(t *testing.T) {
		err := m.UpdatePasswordByID(ctx, 1, "123")
		if err == nil || err.Error() != "nova senha deve ter no mínimo 12 caracteres" {
			t.Fatalf("expected short new password error, got %v", err)
		}
	})

	t.Run("SetActiveByID invalid ID validation", func(t *testing.T) {
		err := m.SetActiveByID(ctx, 0, true)
		if err != ErrUserNotFound {
			t.Fatalf("expected ErrUserNotFound for id=0, got %v", err)
		}

		err = m.SetActiveByID(ctx, -1, false)
		if err != ErrUserNotFound {
			t.Fatalf("expected ErrUserNotFound for id=-1, got %v", err)
		}
	})

	t.Run("GetByID invalid ID validation", func(t *testing.T) {
		_, err := m.GetByID(ctx, 0)
		if err != ErrUserNotFound {
			t.Fatalf("expected ErrUserNotFound for id=0, got %v", err)
		}

		_, err = m.GetByID(ctx, -1)
		if err != ErrUserNotFound {
			t.Fatalf("expected ErrUserNotFound for id=-1, got %v", err)
		}
	})

	t.Run("ValidateDRE empty string returns false without error", func(t *testing.T) {
		valid, err := m.ValidateDRE(ctx, "")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if valid {
			t.Fatalf("expected valid to be false for empty DRE")
		}

		valid, err = m.ValidateDRE(ctx, "   ")
		if err != nil {
			t.Fatalf("expected nil error for whitespace DRE, got %v", err)
		}
		if valid {
			t.Fatalf("expected valid to be false for whitespace DRE")
		}
	})
}

func TestNormalizeAdminEmail(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "trim and lowercase", input: "  Gestor.DRE@Example.COM ", want: "gestor.dre@example.com"},
		{name: "empty", input: "   ", wantErr: true},
		{name: "missing at", input: "gestor.example.com", wantErr: true},
		{name: "missing domain", input: "gestor@", wantErr: true},
		{name: "domain without dot", input: "gestor@localhost", wantErr: true},
		{name: "display name rejected", input: "Gestor <gestor@example.com>", wantErr: true},
		{name: "spaces rejected", input: "gestor dre@example.com", wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeAdminEmail(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("NormalizeAdminEmail(%q) unexpectedly succeeded: %q", tc.input, got)
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("NormalizeAdminEmail(%q)=(%q,%v), want (%q,nil)", tc.input, got, err, tc.want)
			}
		})
	}
}
