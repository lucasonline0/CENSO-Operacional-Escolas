package models

import (
	"context"
	"testing"
)

func TestAdminUserModelValidation(t *testing.T) {
	m := &AdminUserModel{DB: nil}
	ctx := context.Background()

	t.Run("empty username validation", func(t *testing.T) {
		_, err := m.Create(ctx, "", "password123", "dre", "DRE BELEM")
		if err == nil || err.Error() != "username não pode ser vazio" {
			t.Fatalf("expected empty username error, got %v", err)
		}
	})

	t.Run("whitespace username validation", func(t *testing.T) {
		_, err := m.Create(ctx, "   ", "password123", "dre", "DRE BELEM")
		if err == nil || err.Error() != "username não pode ser vazio" {
			t.Fatalf("expected empty username error, got %v", err)
		}
	})

	t.Run("short password validation", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "123", "dre", "DRE BELEM")
		if err == nil || err.Error() != "senha deve ter no mínimo 6 caracteres" {
			t.Fatalf("expected short password error, got %v", err)
		}
	})

	t.Run("invalid role validation", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "password123", "admin", "DRE BELEM")
		if err != ErrInvalidRole {
			t.Fatalf("expected ErrInvalidRole, got %v", err)
		}
	})

	t.Run("missing DRE validation for dre role", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "password123", "dre", "")
		if err != ErrDRERequiredForDRE {
			t.Fatalf("expected ErrDRERequiredForDRE, got %v", err)
		}
	})

	t.Run("whitespace DRE validation for dre role", func(t *testing.T) {
		_, err := m.Create(ctx, "user1", "password123", "dre", "   ")
		if err != ErrDRERequiredForDRE {
			t.Fatalf("expected ErrDRERequiredForDRE, got %v", err)
		}
	})

	t.Run("short new password on UpdatePassword validation", func(t *testing.T) {
		err := m.UpdatePassword(ctx, "user1", "123")
		if err == nil || err.Error() != "nova senha deve ter no mínimo 6 caracteres" {
			t.Fatalf("expected short new password error, got %v", err)
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
