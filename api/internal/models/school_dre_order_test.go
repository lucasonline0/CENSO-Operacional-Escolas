package models

import (
	"errors"
	"fmt"
	"testing"
)

func TestNormalizedSchoolIDsForUpdateUsesDeterministicLockOrder(t *testing.T) {
	input := []int{9, 3, 7, 3, 1, 9, 2}
	got, err := normalizedSchoolIDsForUpdate(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []int{1, 2, 3, 7, 9}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("got %v, want deterministic order %v", got, want)
	}
}

func TestNormalizedSchoolIDsForUpdatePreservesValidation(t *testing.T) {
	if _, err := normalizedSchoolIDsForUpdate([]int{2, 0, 1}); !errors.Is(err, ErrSchoolInvalidID) {
		t.Fatalf("expected ErrSchoolInvalidID, got %v", err)
	}
}
