package models

import (
	"context"
	"testing"
)

func TestDREModelValidation(t *testing.T) {
	m := &DREModel{DB: nil}
	ctx := context.Background()

	t.Run("Create empty nome validation", func(t *testing.T) {
		_, err := m.Create(ctx, DRE{Nome: ""})
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired, got %v", err)
		}
	})

	t.Run("Create whitespace nome validation", func(t *testing.T) {
		_, err := m.Create(ctx, DRE{Nome: "   "})
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired, got %v", err)
		}
	})

	t.Run("GetByID invalid ID validation", func(t *testing.T) {
		_, err := m.GetByID(ctx, 0)
		if err != ErrDREInvalidID {
			t.Fatalf("expected ErrDREInvalidID for id=0, got %v", err)
		}

		_, err = m.GetByID(ctx, -1)
		if err != ErrDREInvalidID {
			t.Fatalf("expected ErrDREInvalidID for id=-1, got %v", err)
		}
	})

	t.Run("GetByNome empty nome validation", func(t *testing.T) {
		_, err := m.GetByNome(ctx, "")
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired, got %v", err)
		}

		_, err = m.GetByNome(ctx, "   ")
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired for whitespace, got %v", err)
		}
	})

	t.Run("Update invalid ID validation", func(t *testing.T) {
		_, err := m.Update(ctx, DRE{ID: 0, Nome: "DRE BELEM"})
		if err != ErrDREInvalidID {
			t.Fatalf("expected ErrDREInvalidID for id=0, got %v", err)
		}

		_, err = m.Update(ctx, DRE{ID: -3, Nome: "DRE BELEM"})
		if err != ErrDREInvalidID {
			t.Fatalf("expected ErrDREInvalidID for id=-3, got %v", err)
		}
	})

	t.Run("Update empty nome validation", func(t *testing.T) {
		_, err := m.Update(ctx, DRE{ID: 1, Nome: ""})
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired for empty nome, got %v", err)
		}

		_, err = m.Update(ctx, DRE{ID: 1, Nome: "   "})
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired for whitespace nome, got %v", err)
		}
	})

	t.Run("SetActive invalid ID validation", func(t *testing.T) {
		err := m.SetActive(ctx, 0, true)
		if err != ErrDREInvalidID {
			t.Fatalf("expected ErrDREInvalidID for id=0, got %v", err)
		}

		err = m.SetActive(ctx, -2, false)
		if err != ErrDREInvalidID {
			t.Fatalf("expected ErrDREInvalidID for id=-2, got %v", err)
		}
	})

	t.Run("SetActiveByNome empty nome validation", func(t *testing.T) {
		err := m.SetActiveByNome(ctx, "", true)
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired for empty nome, got %v", err)
		}

		err = m.SetActiveByNome(ctx, "   ", false)
		if err != ErrDRENameRequired {
			t.Fatalf("expected ErrDRENameRequired for whitespace nome, got %v", err)
		}
	})
}
