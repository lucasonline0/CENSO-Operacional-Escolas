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
	DREID        int       `json:"dre_id,omitempty"`
	Active       bool      `json:"active"`
	AuthVersion  int       `json:"auth_version,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type AdminUserModel struct {
	DB *sql.DB
}

type canonicalDRE struct {
	ID     int
	Nome   string
	Active bool
}

func (m *AdminUserModel) resolveDREByName(ctx context.Context, dre string) (*canonicalDRE, error) {
	dre = strings.TrimSpace(dre)
	if dre == "" {
		return nil, ErrDRERequiredForDRE
	}

	var d canonicalDRE
	err := m.DB.QueryRowContext(ctx, `
		SELECT id, nome, ativa
		FROM dres
		WHERE UPPER(BTRIM(nome)) = UPPER(BTRIM($1))`, dre).Scan(&d.ID, &d.Nome, &d.Active)
	if err == sql.ErrNoRows {
		return nil, ErrInvalidDRE
	}
	if err != nil {
		return nil, err
	}
	if !d.Active {
		return nil, ErrDREInactive
	}
	return &d, nil
}

func (m *AdminUserModel) resolveDREByID(ctx context.Context, dreID int) (*canonicalDRE, error) {
	if dreID <= 0 {
		return nil, ErrInvalidDRE
	}

	var d canonicalDRE
	err := m.DB.QueryRowContext(ctx, `
		SELECT id, nome, ativa
		FROM dres
		WHERE id = $1`, dreID).Scan(&d.ID, &d.Nome, &d.Active)
	if err == sql.ErrNoRows {
		return nil, ErrInvalidDRE
	}
	if err != nil {
		return nil, err
	}
	if !d.Active {
		return nil, ErrDREInactive
	}
	return &d, nil
}

func normalizeAdminUserCreateInput(username, plainPassword, role string) (string, string, error) {
	username = strings.TrimSpace(username)
	role = strings.TrimSpace(strings.ToLower(role))

	if username == "" {
		return "", "", errors.New("username não pode ser vazio")
	}
	if len(plainPassword) < 12 {
		return "", "", errors.New("senha deve ter no mínimo 12 caracteres")
	}
	if role != "dre" {
		return "", "", ErrInvalidRole
	}
	return username, role, nil
}

func (m *AdminUserModel) createForCanonicalDRE(ctx context.Context, username, plainPassword, role string, dre *canonicalDRE) (*AdminUser, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plainPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}

	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return nil, err
	}

	var (
		query string
		u     AdminUser
	)
	u.PasswordHash = string(hash)

	if hasAuthVer {
		query = `
			INSERT INTO admin_users (username, password_hash, role, dre_id, active, auth_version, created_at, updated_at)
			VALUES ($1, $2, $3, $4, true, 1, NOW(), NOW())
			RETURNING id, username, role, COALESCE(dre, ''), dre_id, active, COALESCE(auth_version, 1), created_at, updated_at`
		err = m.DB.QueryRowContext(ctx, query, username, u.PasswordHash, role, dre.ID).Scan(
			&u.ID, &u.Username, &u.Role, &u.DRE, &u.DREID, &u.Active, &u.AuthVersion, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		query = `
			INSERT INTO admin_users (username, password_hash, role, dre_id, active, created_at, updated_at)
			VALUES ($1, $2, $3, $4, true, NOW(), NOW())
			RETURNING id, username, role, COALESCE(dre, ''), dre_id, active, created_at, updated_at`
		u.AuthVersion = 1
		err = m.DB.QueryRowContext(ctx, query, username, u.PasswordHash, role, dre.ID).Scan(
			&u.ID, &u.Username, &u.Role, &u.DRE, &u.DREID, &u.Active, &u.CreatedAt, &u.UpdatedAt,
		)
	}

	if err != nil {
		msg := strings.ToLower(err.Error())
		if strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate") {
			return nil, ErrUsernameExists
		}
		return nil, err
	}
	return &u, nil
}

// GetActiveByUsername localiza um usuario ativo pelo username. O nome da DRE
// retornado e derivado do dre_id sempre que houver relacao canonica.
func (m *AdminUserModel) GetActiveByUsername(ctx context.Context, username string) (*AdminUser, error) {
	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return nil, err
	}

	var u AdminUser
	if hasAuthVer {
		query := `
			SELECT u.id, u.username, u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1), u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1) AND u.active = true`
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.AuthVersion, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		query := `
			SELECT u.id, u.username, u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1) AND u.active = true`
		u.AuthVersion = 1
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.CreatedAt, &u.UpdatedAt,
		)
	}

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetByUsername localiza um usuario ativo ou inativo pelo username.
func (m *AdminUserModel) GetByUsername(ctx context.Context, username string) (*AdminUser, error) {
	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return nil, err
	}

	var u AdminUser
	if hasAuthVer {
		query := `
			SELECT u.id, u.username, u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1), u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1)`
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.AuthVersion, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		query := `
			SELECT u.id, u.username, u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1)`
		u.AuthVersion = 1
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.CreatedAt, &u.UpdatedAt,
		)
	}

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ValidateDRE valida exclusivamente a entidade mestre dres. Nao existe mais
// fallback para schools: texto em uma escola nunca cria ou valida uma regional.
func (m *AdminUserModel) ValidateDRE(ctx context.Context, dre string) (bool, error) {
	dre = strings.TrimSpace(dre)
	if dre == "" {
		return false, nil
	}

	var ativa bool
	err := m.DB.QueryRowContext(ctx, `
		SELECT ativa
		FROM dres
		WHERE UPPER(BTRIM(nome)) = UPPER(BTRIM($1))`, dre).Scan(&ativa)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !ativa {
		return false, ErrDREInactive
	}
	return true, nil
}

// Create preserva o contrato legado que recebe o nome da DRE, mas o nome e
// apenas resolvido na entidade mestre. O INSERT persiste o vinculo por dre_id.
func (m *AdminUserModel) Create(ctx context.Context, username, plainPassword, role, dre string) (*AdminUser, error) {
	username, role, err := normalizeAdminUserCreateInput(username, plainPassword, role)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(dre) == "" {
		return nil, ErrDRERequiredForDRE
	}

	canonical, err := m.resolveDREByName(ctx, dre)
	if err != nil {
		return nil, err
	}
	return m.createForCanonicalDRE(ctx, username, plainPassword, role, canonical)
}

// CreateForDREID e o caminho canonico para novos callers/handlers. Ele evita
// qualquer dependencia de nome textual para estabelecer o relacionamento.
func (m *AdminUserModel) CreateForDREID(ctx context.Context, username, plainPassword, role string, dreID int) (*AdminUser, error) {
	username, role, err := normalizeAdminUserCreateInput(username, plainPassword, role)
	if err != nil {
		return nil, err
	}
	canonical, err := m.resolveDREByID(ctx, dreID)
	if err != nil {
		return nil, err
	}
	return m.createForCanonicalDRE(ctx, username, plainPassword, role, canonical)
}

// GetByID localiza um usuario pelo seu ID numerico.
func (m *AdminUserModel) GetByID(ctx context.Context, id int) (*AdminUser, error) {
	if id <= 0 {
		return nil, ErrUserNotFound
	}

	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return nil, err
	}

	var u AdminUser
	if hasAuthVer {
		query := `
			SELECT u.id, u.username, u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1), u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE u.id = $1`
		err = m.DB.QueryRowContext(ctx, query, id).Scan(
			&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.AuthVersion, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		query := `
			SELECT u.id, u.username, u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE u.id = $1`
		u.AuthVersion = 1
		err = m.DB.QueryRowContext(ctx, query, id).Scan(
			&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.CreatedAt, &u.UpdatedAt,
		)
	}

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// UpdatePassword atualiza a senha de um usuario existente usando bcrypt pelo username,
// incrementando auth_version de forma atomica para invalidar tokens anteriores.
func (m *AdminUserModel) UpdatePassword(ctx context.Context, username string, newPlainPassword string) error {
	username = strings.TrimSpace(username)
	if len(newPlainPassword) < 12 {
		return errors.New("nova senha deve ter no mínimo 12 caracteres")
	}

	u, err := m.GetByUsername(ctx, username)
	if err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPlainPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}

	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return err
	}

	var query string
	if hasAuthVer {
		query = `UPDATE admin_users SET password_hash = $1, auth_version = COALESCE(auth_version, 1) + 1, updated_at = NOW() WHERE id = $2`
	} else {
		query = `UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`
	}
	_, err = m.DB.ExecContext(ctx, query, string(hash), u.ID)
	return err
}

// UpdatePasswordByID atualiza a senha de um usuario existente usando bcrypt pelo ID,
// incrementando auth_version de forma atomica para invalidar tokens anteriores.
func (m *AdminUserModel) UpdatePasswordByID(ctx context.Context, id int, newPlainPassword string) error {
	if id <= 0 {
		return ErrUserNotFound
	}
	if len(newPlainPassword) < 12 {
		return errors.New("nova senha deve ter no mínimo 12 caracteres")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPlainPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}

	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return err
	}

	var query string
	if hasAuthVer {
		query = `UPDATE admin_users SET password_hash = $1, auth_version = COALESCE(auth_version, 1) + 1, updated_at = NOW() WHERE id = $2`
	} else {
		query = `UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`
	}

	result, err := m.DB.ExecContext(ctx, query, string(hash), id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}
	return nil
}

// SetActive ativa ou desativa uma conta de usuario pelo username.
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

// SetActiveByID ativa ou desativa uma conta de usuario pelo ID.
func (m *AdminUserModel) SetActiveByID(ctx context.Context, id int, active bool) error {
	if id <= 0 {
		return ErrUserNotFound
	}

	query := `UPDATE admin_users SET active = $1, updated_at = NOW() WHERE id = $2`
	result, err := m.DB.ExecContext(ctx, query, active, id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}
	return nil
}

// List retorna todas as contas cadastradas sem expor o hash da senha e sempre
// prefere o nome atual da DRE resolvido pela FK canonica.
func (m *AdminUserModel) List(ctx context.Context) ([]*AdminUser, error) {
	if m.DB == nil {
		return nil, errors.New("database not configured")
	}

	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return nil, err
	}

	var query string
	if hasAuthVer {
		query = `
			SELECT u.id, u.username, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1), u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			ORDER BY u.username`
	} else {
		query = `
			SELECT u.id, u.username, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			ORDER BY u.username`
	}

	rows, err := m.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]*AdminUser, 0)
	for rows.Next() {
		var u AdminUser
		if hasAuthVer {
			if err := rows.Scan(
				&u.ID, &u.Username, &u.Role, &u.DRE, &u.DREID,
				&u.Active, &u.AuthVersion, &u.CreatedAt, &u.UpdatedAt,
			); err != nil {
				return nil, err
			}
		} else {
			u.AuthVersion = 1
			if err := rows.Scan(
				&u.ID, &u.Username, &u.Role, &u.DRE, &u.DREID,
				&u.Active, &u.CreatedAt, &u.UpdatedAt,
			); err != nil {
				return nil, err
			}
		}
		users = append(users, &u)
	}
	return users, rows.Err()
}
