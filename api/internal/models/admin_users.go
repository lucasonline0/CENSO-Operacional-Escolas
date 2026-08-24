package models

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserNotFound      = errors.New("usuário não encontrado")
	ErrUserInactive      = errors.New("usuário inativo")
	ErrInvalidDRE        = errors.New("DRE não encontrada")
	ErrUsernameExists    = errors.New("username já está em uso")
	ErrInvalidRole       = errors.New("role inválida")
	ErrDRERequiredForDRE = errors.New("DRE é obrigatória para a role dre")
)

type AdminUser struct {
	ID           int       `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	DRE          string    `json:"dre"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type AdminUserModel struct {
	DB *sql.DB
}

// GetActiveByUsername localiza um usuário ativo pelo username.
func (m *AdminUserModel) GetActiveByUsername(ctx context.Context, username string) (*AdminUser, error) {
	query := `
		SELECT id, username, password_hash, role, COALESCE(dre, ''), active, created_at, updated_at
		FROM admin_users
		WHERE LOWER(username) = LOWER($1) AND active = true`

	var u AdminUser
	err := m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
		&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.Active, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetByUsername localiza um usuário (ativo ou inativo) pelo username.
func (m *AdminUserModel) GetByUsername(ctx context.Context, username string) (*AdminUser, error) {
	query := `
		SELECT id, username, password_hash, role, COALESCE(dre, ''), active, created_at, updated_at
		FROM admin_users
		WHERE LOWER(username) = LOWER($1)`

	var u AdminUser
	err := m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
		&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.Active, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ValidateDRE verifica se a DRE existe e está ativa, consultando prioritariamente a tabela 'dres'.
// Se a DRE estiver cadastrada na tabela 'dres', verifica se está ativa (retornando ErrDREInactive caso inativa).
// Caso não esteja na tabela 'dres', realiza fallback para a tabela 'schools'.
func (m *AdminUserModel) ValidateDRE(ctx context.Context, dre string) (bool, error) {
	dre = strings.TrimSpace(dre)
	if dre == "" {
		return false, nil
	}

	// 1. Prioridade: tabela dres
	var ativa bool
	queryDRE := `SELECT ativa FROM dres WHERE UPPER(TRIM(nome)) = UPPER(TRIM($1))`
	err := m.DB.QueryRowContext(ctx, queryDRE, dre).Scan(&ativa)
	if err == nil {
		if !ativa {
			return false, ErrDREInactive
		}
		return true, nil
	}

	if err != sql.ErrNoRows {
		// Se a tabela dres não existir (ambiente sem migration), faz fallback silencioso para schools
		if !strings.Contains(err.Error(), "does not exist") && !strings.Contains(err.Error(), "não existe") {
			return false, err
		}
	}

	// 2. Fallback: tabela schools
	querySchools := `SELECT EXISTS(SELECT 1 FROM schools WHERE UPPER(TRIM(dre)) = UPPER(TRIM($1)))`
	var exists bool
	err = m.DB.QueryRowContext(ctx, querySchools, dre).Scan(&exists)
	return exists, err
}

// Create cria um novo usuário DRE com senha bcrypt e validação de DRE.
func (m *AdminUserModel) Create(ctx context.Context, username, plainPassword, role, dre string) (*AdminUser, error) {
	username = strings.TrimSpace(username)
	role = strings.TrimSpace(strings.ToLower(role))
	dre = strings.TrimSpace(dre)

	if username == "" {
		return nil, errors.New("username não pode ser vazio")
	}
	if len(plainPassword) < 6 {
		return nil, errors.New("senha deve ter no mínimo 6 caracteres")
	}
	if role != "dre" {
		return nil, ErrInvalidRole
	}
	if dre == "" {
		return nil, ErrDRERequiredForDRE
	}

	validDRE, err := m.ValidateDRE(ctx, dre)
	if err != nil {
		if errors.Is(err, ErrDREInactive) {
			return nil, ErrDREInactive
		}
		return nil, fmt.Errorf("erro ao validar DRE: %w", err)
	}
	if !validDRE {
		return nil, ErrInvalidDRE
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(plainPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}

	query := `
		INSERT INTO admin_users (username, password_hash, role, dre, active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, true, NOW(), NOW())
		RETURNING id, username, role, dre, active, created_at, updated_at`

	var u AdminUser
	u.PasswordHash = string(hash)
	err = m.DB.QueryRowContext(ctx, query, username, u.PasswordHash, role, dre).Scan(
		&u.ID, &u.Username, &u.Role, &u.DRE, &u.Active, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return nil, ErrUsernameExists
		}
		return nil, err
	}
	return &u, nil
}

// UpdatePassword atualiza a senha de um usuário existente usando bcrypt.
func (m *AdminUserModel) UpdatePassword(ctx context.Context, username, newPlainPassword string) error {
	username = strings.TrimSpace(username)
	if len(newPlainPassword) < 6 {
		return errors.New("nova senha deve ter no mínimo 6 caracteres")
	}

	u, err := m.GetByUsername(ctx, username)
	if err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPlainPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}

	query := `UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`
	_, err = m.DB.ExecContext(ctx, query, string(hash), u.ID)
	return err
}

// SetActive ativa ou desativa uma conta de usuário.
func (m *AdminUserModel) SetActive(ctx context.Context, username string, active bool) error {
	username = strings.TrimSpace(username)
	u, err := m.GetByUsername(ctx, username)
	if err != nil {
		return err
	}

	query := `UPDATE admin_users SET active = $1, updated_at = NOW() WHERE id = $2`
	_, err = m.DB.ExecContext(ctx, query, active, u.ID)
	return err
}

// List retorna todas as contas cadastradas sem expor o hash da senha.
func (m *AdminUserModel) List(ctx context.Context) ([]*AdminUser, error) {
	query := `
		SELECT id, username, role, COALESCE(dre, ''), active, created_at, updated_at
		FROM admin_users
		ORDER BY username`

	rows, err := m.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*AdminUser
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.DRE, &u.Active, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, &u)
	}
	return users, rows.Err()
}
