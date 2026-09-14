package models

import (
	"encoding/base64"
	"strings"
	"testing"
)

func testVaultKey(seed byte) string {
	key := make([]byte, 32)
	for i := range key {
		key[i] = seed + byte(i)
	}
	return base64.StdEncoding.EncodeToString(key)
}

func TestPasswordVaultRoundTripAndRandomNonce(t *testing.T) {
	t.Setenv(adminPasswordVaultEnv, testVaultKey(7))
	username := "dre.abaetetuba"
	password := "SenhaForte-12345"

	first, err := encryptPasswordForVault(username, password)
	if err != nil {
		t.Fatalf("encrypt first: %v", err)
	}
	second, err := encryptPasswordForVault(username, password)
	if err != nil {
		t.Fatalf("encrypt second: %v", err)
	}
	if first == second {
		t.Fatal("AES-GCM ciphertext must differ because each write uses a fresh nonce")
	}
	if !strings.HasPrefix(first, passwordVaultPrefix) {
		t.Fatalf("missing vault version prefix: %q", first)
	}

	got, err := decryptPasswordFromVault(username, first)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if got != password {
		t.Fatalf("round trip mismatch: got %q want %q", got, password)
	}
}

func TestPasswordVaultRejectsWrongKeyAndWrongUserAAD(t *testing.T) {
	t.Setenv(adminPasswordVaultEnv, testVaultKey(11))
	ciphertext, err := encryptPasswordForVault("dre.alpha", "SenhaAlpha-12345")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	if _, err := decryptPasswordFromVault("dre.beta", ciphertext); err == nil {
		t.Fatal("ciphertext must be bound to the username through GCM additional data")
	}

	t.Setenv(adminPasswordVaultEnv, testVaultKey(99))
	if _, err := decryptPasswordFromVault("dre.alpha", ciphertext); err == nil {
		t.Fatal("ciphertext must not decrypt with a different key")
	}
}

func TestPasswordVaultConfigurationValidation(t *testing.T) {
	t.Setenv(adminPasswordVaultEnv, "")
	if PasswordVaultConfigured() {
		t.Fatal("empty vault key must not be considered configured")
	}

	t.Setenv(adminPasswordVaultEnv, "not-base64")
	if PasswordVaultConfigured() {
		t.Fatal("malformed vault key must not be considered configured")
	}

	t.Setenv(adminPasswordVaultEnv, base64.StdEncoding.EncodeToString([]byte("too-short")))
	if PasswordVaultConfigured() {
		t.Fatal("non-32-byte vault key must not be considered configured")
	}

	t.Setenv(adminPasswordVaultEnv, testVaultKey(3))
	if !PasswordVaultConfigured() {
		t.Fatal("valid 32-byte base64 vault key should be configured")
	}
}
