package models

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserNotFound         = errors.New("usuário não encontrado")
	ErrUserInactive         = errors.New("usuário inativo")
	ErrInvalidDRE           = errors.New("DRE não encontrada")
	ErrUsernameExists       = errors.New("username já está em uso")
	ErrEmailExists          = errors.New("e-mail já está em uso")
	ErrIdentityCollision    = errors.New("e-mail e usuário conflitam com uma conta existente")
	ErrInvalidEmail         = errors.New("e-mail inválido")
	ErrInvalidRole          = errors.New("role inválida")
	ErrDRERequiredForDRE    = errors.New("DRE é obrigatória para a role dre")
	ErrPasswordSetupInvalid = errors.New("desafio de primeiro acesso inválido ou já utilizado")
)

type AdminUser struct {
	ID                 int       `json:"id"`
	Username           string    `json:"username"`
	Email              string    `json:"email,omitempty"`
	PasswordHash       string    `json:"-"`
	Role               string    `json:"role"`
	DRE                string    `json:"dre"`
	DREID              int       `json:"dre_id,omitempty"`
	Active             bool      `json:"active"`
	AuthVersion        int       `json:"auth_version,omitempty"`
	MustChangePassword bool      `json:"must_change_password"`
	Permissions        []string  `json:"permissions,omitempty"`
	DataScope          string    `json:"data_scope,omitempty"`
	DREIDs             []int     `json:"dre_ids,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

var ErrInvalidPermission = errors.New("permissão inválida")
var ErrInvalidDataScope = errors.New("escopo de dados inválido")

var authorizationPermissionCatalog = map[string]bool{"census.read": true, "analytics.read": true, "reports.read": true, "users.read": true, "users.create": true, "users.manage": true, "users.reset_password": true, "dres.manage": true, "schools.manage_dre": true, "sync.execute": true}

func (m *AdminUserModel) ProvisionCustom(ctx context.Context, username, email, temporaryPassword string, permissions []string, dataScope string, dreIDs []int) (*AdminUser, error) {
	username = strings.TrimSpace(username)
	if username == "" || len(username) > 64 {
		return nil, errors.New("username inválido")
	}
	if len(temporaryPassword) < 12 {
		return nil, errors.New("senha deve ter no mínimo 12 caracteres")
	}
	email, err := NormalizeAdminEmail(email)
	if err != nil {
		return nil, err
	}
	dataScope = strings.ToLower(strings.TrimSpace(dataScope))
	if dataScope != "all" && dataScope != "selected" {
		return nil, ErrInvalidDataScope
	}
	if dataScope == "selected" && len(dreIDs) == 0 {
		return nil, ErrInvalidDataScope
	}
	unique := map[string]bool{}
	for _, p := range permissions {
		if !authorizationPermissionCatalog[p] {
			return nil, ErrInvalidPermission
		}
		unique[p] = true
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(temporaryPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var u AdminUser
	err = tx.QueryRowContext(ctx, `INSERT INTO admin_users (username,email,password_hash,role,active,auth_version,must_change_password,data_scope,created_at,updated_at) VALUES ($1,$2,$3,'custom',true,1,true,$4,NOW(),NOW()) RETURNING id,username,email,role,active,auth_version,must_change_password,data_scope,created_at,updated_at`, username, email, string(hash), dataScope).Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.Active, &u.AuthVersion, &u.MustChangePassword, &u.DataScope, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, ErrUsernameExists
		}
		return nil, err
	}
	for p := range unique {
		if _, err := tx.ExecContext(ctx, `INSERT INTO admin_user_permissions(user_id,permission) VALUES($1,$2)`, u.ID, p); err != nil {
			return nil, err
		}
		u.Permissions = append(u.Permissions, p)
	}
	if dataScope == "selected" {
		for _, id := range dreIDs {
			var active bool
			if err := tx.QueryRowContext(ctx, `SELECT ativa FROM dres WHERE id=$1`, id).Scan(&active); err != nil || !active {
				return nil, ErrInvalidDRE
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO admin_user_dres(user_id,dre_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, u.ID, id); err != nil {
				return nil, err
			}
			u.DREIDs = append(u.DREIDs, id)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &u, nil
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
	if len(username) > 64 {
		return "", "", errors.New("username deve ter no máximo 64 caracteres")
	}
	if len(plainPassword) < 12 {
		return "", "", errors.New("senha deve ter no mínimo 12 caracteres")
	}
	if role != "dre" {
		return "", "", ErrInvalidRole
	}
	return username, role, nil
}

func NormalizeAdminEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" {
		return "", errors.New("e-mail não pode ser vazio")
	}
	if len(email) > 254 || strings.ContainsAny(email, "\r\n\t ") {
		return "", ErrInvalidEmail
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || !strings.Contains(email, "@") {
		return "", ErrInvalidEmail
	}
	at := strings.LastIndex(email, "@")
	domain := email[at+1:]
	if !strings.Contains(domain, ".") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") {
		return "", ErrInvalidEmail
	}
	return email, nil
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

// ProvisionForDREID cria uma nova conta com e-mail obrigatório e credencial
// temporária. O hash é a única representação persistida da senha e a conta não
// pode receber sessão normal enquanto MustChangePassword permanecer verdadeiro.
func (m *AdminUserModel) ProvisionForDREID(ctx context.Context, username, email, temporaryPassword, role string, dreID int) (*AdminUser, error) {
	username, role, err := normalizeAdminUserCreateInput(username, temporaryPassword, role)
	if err != nil {
		return nil, err
	}
	email, err = NormalizeAdminEmail(email)
	if err != nil {
		return nil, err
	}
	if dreID <= 0 {
		return nil, ErrInvalidDRE
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(temporaryPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}

	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var dre canonicalDRE
	if err := tx.QueryRowContext(ctx, `
		SELECT id, nome, ativa
		FROM dres
		WHERE id = $1
		FOR SHARE`, dreID).Scan(&dre.ID, &dre.Nome, &dre.Active); err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrInvalidDRE
		}
		return nil, err
	}
	if !dre.Active {
		return nil, ErrDREInactive
	}

	// Serializa provisionamentos feitos pela aplicação para que colisões entre
	// os namespaces username/e-mail não sejam introduzidas por corrida.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('admin_users_identity'))`); err != nil {
		return nil, err
	}
	var usernameExists, emailExists, crossCollision bool
	if err := tx.QueryRowContext(ctx, `
		SELECT
			EXISTS (SELECT 1 FROM admin_users WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($1))),
			EXISTS (SELECT 1 FROM admin_users WHERE email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM($2))),
			EXISTS (
				SELECT 1 FROM admin_users
				WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($2))
				   OR (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM($1)))
			)`, username, email).Scan(&usernameExists, &emailExists, &crossCollision); err != nil {
		return nil, err
	}
	if usernameExists {
		return nil, ErrUsernameExists
	}
	if emailExists {
		return nil, ErrEmailExists
	}
	if crossCollision {
		return nil, ErrIdentityCollision
	}

	var u AdminUser
	err = tx.QueryRowContext(ctx, `
		INSERT INTO admin_users (
			username, email, password_hash, role, dre_id, active,
			auth_version, must_change_password, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, true, 1, true, NOW(), NOW())
		RETURNING id, username, email, role, COALESCE(dre, ''), dre_id,
		          active, auth_version, must_change_password, created_at, updated_at`,
		username, email, string(hash), role, dre.ID,
	).Scan(
		&u.ID, &u.Username, &u.Email, &u.Role, &u.DRE, &u.DREID,
		&u.Active, &u.AuthVersion, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		msg := strings.ToLower(err.Error())
		switch {
		case strings.Contains(msg, "email") && (strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")):
			return nil, ErrEmailExists
		case strings.Contains(msg, "username") && (strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")):
			return nil, ErrUsernameExists
		default:
			return nil, err
		}
	}
	u.PasswordHash = string(hash)
	// New legacy-compatible DRE provisioning receives the same explicit
	// capabilities and selected scope as accounts backfilled by migration 0027.
	var authorizationTablesPresent bool
	if err := tx.QueryRowContext(ctx, `SELECT to_regclass(current_schema() || '.admin_user_permissions') IS NOT NULL AND to_regclass(current_schema() || '.admin_user_dres') IS NOT NULL`).Scan(&authorizationTablesPresent); err != nil {
		return nil, err
	}
	if authorizationTablesPresent {
		for _, permission := range []string{"census.read", "analytics.read", "reports.read"} {
			if _, execErr := tx.ExecContext(ctx, `INSERT INTO admin_user_permissions(user_id, permission) VALUES($1,$2) ON CONFLICT DO NOTHING`, u.ID, permission); execErr != nil {
				return nil, execErr
			}
		}
		if _, execErr := tx.ExecContext(ctx, `INSERT INTO admin_user_dres(user_id, dre_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, u.ID, dre.ID); execErr != nil {
			return nil, execErr
		}
	}
	if err := tx.Commit(); err != nil {
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
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1),
			       COALESCE((to_jsonb(u)->>'must_change_password')::boolean, false),
			       u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1) AND u.active = true`
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.AuthVersion, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		query := `
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, false, u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1) AND u.active = true`
		u.AuthVersion = 1
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
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
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1),
			       COALESCE((to_jsonb(u)->>'must_change_password')::boolean, false),
			       u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1)`
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.AuthVersion, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		query := `
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, false, u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE LOWER(u.username) = LOWER($1)`
		u.AuthVersion = 1
		err = m.DB.QueryRowContext(ctx, query, strings.TrimSpace(username)).Scan(
			&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
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
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1),
			       COALESCE((to_jsonb(u)->>'must_change_password')::boolean, false),
			       u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE u.id = $1`
		err = m.DB.QueryRowContext(ctx, query, id).Scan(
			&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.AuthVersion, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		query := `
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, false, u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE u.id = $1`
		u.AuthVersion = 1
		err = m.DB.QueryRowContext(ctx, query, id).Scan(
			&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.DRE, &u.DREID,
			&u.Active, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
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

// ResetTemporaryPasswordByID revoga sessões, grava somente o bcrypt da nova
// credencial temporária e recoloca a conta no fluxo obrigatório de primeiro acesso.
func (m *AdminUserModel) ResetTemporaryPasswordByID(ctx context.Context, id int, temporaryPassword string) error {
	if id <= 0 {
		return ErrUserNotFound
	}
	if len(temporaryPassword) < 12 {
		return errors.New("nova senha deve ter no mínimo 12 caracteres")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(temporaryPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}
	result, err := m.DB.ExecContext(ctx, `
		UPDATE admin_users
		SET password_hash = $1,
		    must_change_password = true,
		    auth_version = COALESCE(auth_version, 1) + 1,
		    updated_at = NOW()
		WHERE id = $2`, string(hash), id)
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

// CompleteFirstAccess troca a credencial temporária de maneira condicional e
// atômica. A versão esperada vincula o update ao challenge emitido e torna o
// token de uso único: reuso ou reset concorrente afeta zero linhas.
func (m *AdminUserModel) CompleteFirstAccess(ctx context.Context, userID, expectedAuthVersion int, newPlainPassword string) (int, error) {
	if userID <= 0 || expectedAuthVersion <= 0 {
		return 0, ErrPasswordSetupInvalid
	}
	if len(newPlainPassword) < 12 {
		return 0, errors.New("nova senha deve ter no mínimo 12 caracteres")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPlainPassword), bcrypt.DefaultCost)
	if err != nil {
		return 0, fmt.Errorf("erro ao gerar hash da senha: %w", err)
	}

	var newAuthVersion int
	err = m.DB.QueryRowContext(ctx, `
		UPDATE admin_users u
		SET password_hash = $1,
		    must_change_password = false,
		    auth_version = COALESCE(u.auth_version, 1) + 1,
		    updated_at = NOW()
		WHERE u.id = $2
		  AND u.active = true
		  AND u.must_change_password = true
		  AND COALESCE(u.auth_version, 1) = $3
		  AND (
		      (u.role = 'dre' AND EXISTS (
		          SELECT 1 FROM dres d
		          WHERE d.id = u.dre_id AND d.ativa = true
		      ))
		      OR
		      (u.role = 'custom' AND u.data_scope = 'all')
		      OR
		      (u.role = 'custom' AND u.data_scope = 'selected' AND EXISTS (
		          SELECT 1
		          FROM admin_user_dres aud
		          JOIN dres d ON d.id = aud.dre_id
		          WHERE aud.user_id = u.id AND d.ativa = true
		      ))
		  )
		RETURNING u.auth_version`, string(hash), userID, expectedAuthVersion).Scan(&newAuthVersion)
	if err == sql.ErrNoRows {
		return 0, ErrPasswordSetupInvalid
	}
	if err != nil {
		return 0, err
	}
	return newAuthVersion, nil
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
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, COALESCE(u.auth_version, 1),
			       COALESCE((to_jsonb(u)->>'must_change_password')::boolean, false),
			       u.created_at, u.updated_at
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			ORDER BY u.username`
	} else {
		query = `
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.role,
			       COALESCE(d.nome, u.dre, ''), COALESCE(u.dre_id, 0),
			       u.active, false, u.created_at, u.updated_at
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
				&u.ID, &u.Username, &u.Email, &u.Role, &u.DRE, &u.DREID,
				&u.Active, &u.AuthVersion, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
			); err != nil {
				return nil, err
			}
		} else {
			u.AuthVersion = 1
			if err := rows.Scan(
				&u.ID, &u.Username, &u.Email, &u.Role, &u.DRE, &u.DREID,
				&u.Active, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt,
			); err != nil {
				return nil, err
			}
		}
		users = append(users, &u)
	}
	return users, rows.Err()
}
