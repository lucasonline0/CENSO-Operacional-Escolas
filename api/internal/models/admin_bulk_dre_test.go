package models

import (
	"golang.org/x/crypto/bcrypt"
	"strings"
	"testing"
)

func TestBootstrapSlugAndPassword(t *testing.T) {
	cases := map[string]string{"DRE ABAETETUBA": "abaetetuba", "DRE São Félix-do Xingu": "saofelixdoxingu", "Altamira": "altamira"}
	for input, want := range cases {
		if got := bootstrapSlug(input); got != want {
			t.Errorf("bootstrapSlug(%q)=%q, want %q", input, got, want)
		}
	}
	password, err := bootstrapPassword()
	if err != nil {
		t.Fatal(err)
	}
	if len(password) < 16 {
		t.Fatalf("password too short: %d", len(password))
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(hash), password) {
		t.Fatal("bcrypt output exposed plaintext")
	}
}
func TestIsE2EDRE(t *testing.T) {
	if !isE2EDRE("DRE-E2E-123", "X") || !isE2EDRE("Oficial", "e2e") || isE2EDRE("DRE Altamira", "ALT") {
		t.Fatal("fixture classification failed")
	}
}
