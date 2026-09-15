package models

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

const (
	adminPasswordVaultEnv = "ADMIN_PASSWORD_VAULT_KEY"
	passwordVaultPrefix   = "v1."
)

var (
	ErrPasswordVaultUnavailable = errors.New("cofre de senhas administrativas indisponível")
	ErrPasswordNotRecoverable   = errors.New("senha não possui cópia criptografada recuperável")
)

func passwordVaultKey() ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv(adminPasswordVaultEnv))
	if raw == "" {
		return nil, ErrPasswordVaultUnavailable
	}

	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("%w: chave deve estar em base64", ErrPasswordVaultUnavailable)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("%w: chave deve decodificar para 32 bytes", ErrPasswordVaultUnavailable)
	}
	return key, nil
}

// PasswordVaultConfigured informa se a chave AES-256-GCM está configurada de
// forma válida. A chave nunca é persistida no banco ou devolvida pela API.
func PasswordVaultConfigured() bool {
	_, err := passwordVaultKey()
	return err == nil
}

func passwordVaultAAD(username string) []byte {
	return []byte("censo-admin-password-v1:" + strings.ToLower(strings.TrimSpace(username)))
}

func encryptPasswordForVault(username, plaintext string) (string, error) {
	key, err := passwordVaultKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("criar cifra do cofre: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("criar GCM do cofre: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("gerar nonce do cofre: %w", err)
	}
	sealed := gcm.Seal(nil, nonce, []byte(plaintext), passwordVaultAAD(username))
	payload := append(nonce, sealed...)
	return passwordVaultPrefix + base64.RawURLEncoding.EncodeToString(payload), nil
}

func decryptPasswordFromVault(username, encoded string) (string, error) {
	if !strings.HasPrefix(encoded, passwordVaultPrefix) {
		return "", fmt.Errorf("formato de senha criptografada não suportado")
	}
	key, err := passwordVaultKey()
	if err != nil {
		return "", err
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(encoded, passwordVaultPrefix))
	if err != nil {
		return "", fmt.Errorf("decodificar senha criptografada: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("criar cifra do cofre: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("criar GCM do cofre: %w", err)
	}
	if len(payload) < gcm.NonceSize() {
		return "", fmt.Errorf("payload criptografado inválido")
	}
	nonce, ciphertext := payload[:gcm.NonceSize()], payload[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, passwordVaultAAD(username))
	if err != nil {
		return "", fmt.Errorf("descriptografar senha do cofre: %w", err)
	}
	return string(plaintext), nil
}

// StorePasswordForReveal persiste somente a cópia cifrada da senha. A
// autenticação continua usando exclusivamente password_hash (bcrypt).
func (m *AdminUserModel) StorePasswordForReveal(ctx context.Context, id int, plaintext string) error {
	if id <= 0 {
		return ErrUserNotFound
	}
	user, err := m.GetByID(ctx, id)
	if err != nil {
		return err
	}
	ciphertext, err := encryptPasswordForVault(user.Username, plaintext)
	if err != nil {
		return err
	}
	result, err := m.DB.ExecContext(ctx, `
		UPDATE admin_users
		SET password_ciphertext = $1, password_ciphertext_updated_at = NOW()
		WHERE id = $2`, ciphertext, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}
	return nil
}

// RevealPasswordByUsername devolve a senha em texto apenas quando existe uma
// cópia cifrada posterior à migration do cofre. Usuários legados permanecem
// irrecuperáveis até a primeira redefinição de senha.
func (m *AdminUserModel) RevealPasswordByUsername(ctx context.Context, username string) (*AdminUser, string, bool, error) {
	user, err := m.GetByUsername(ctx, username)
	if err != nil {
		return nil, "", false, err
	}

	var ciphertext sql.NullString
	if err := m.DB.QueryRowContext(ctx, `
		SELECT password_ciphertext
		FROM admin_users
		WHERE id = $1`, user.ID).Scan(&ciphertext); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, "", false, ErrUserNotFound
		}
		return nil, "", false, err
	}
	if !ciphertext.Valid || strings.TrimSpace(ciphertext.String) == "" {
		return user, "", false, nil
	}

	plaintext, err := decryptPasswordFromVault(user.Username, ciphertext.String)
	if err != nil {
		return nil, "", false, err
	}
	return user, plaintext, true, nil
}

// LogCredentialReveal registra apenas metadados do acesso. A senha e o
// ciphertext nunca entram no log de auditoria.
func (m *AdminUserModel) LogCredentialReveal(ctx context.Context, actorUsername, actorIP string, target *AdminUser) error {
	if target == nil || target.ID <= 0 {
		return ErrUserNotFound
	}
	_, err := m.DB.ExecContext(ctx, `
		INSERT INTO admin_credential_audit
			(actor_username, actor_ip, target_user_id, target_username, action, created_at)
		VALUES ($1, $2, $3, $4, 'reveal_password', NOW())`,
		strings.TrimSpace(actorUsername), strings.TrimSpace(actorIP), target.ID, target.Username,
	)
	return err
}
