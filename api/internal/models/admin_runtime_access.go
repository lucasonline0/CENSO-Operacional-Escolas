package models

import (
	"context"
	"database/sql"
	"strings"
)

// RuntimeAdminAccess representa o estado efetivo de autorização de uma conta
// DRE no momento da requisição. DRE/flags sempre vêm da entidade mestre dres;
// o texto legado admin_users.dre só é usado para localizar essa entidade
// durante a janela de rollout anterior à coluna dre_id.
type RuntimeAdminAccess struct {
	ID           int
	Username     string
	PasswordHash string
	Role         string
	UserActive   bool
	DREID        int
	DRE          string
	DREActive    bool
}

func (m *AdminUserModel) getRuntimeAccess(ctx context.Context, byID bool, id int, username string) (*RuntimeAdminAccess, error) {
	if m.DB == nil {
		return nil, ErrUserNotFound
	}

	canonical, err := hasColumn(ctx, m.DB, "admin_users", "dre_id")
	if err != nil {
		return nil, err
	}

	var query string
	var arg any
	if byID {
		if id <= 0 {
			return nil, ErrUserNotFound
		}
		arg = id
	} else {
		username = strings.TrimSpace(username)
		if username == "" {
			return nil, ErrUserNotFound
		}
		arg = username
	}

	predicate := "u.id = $1"
	if !byID {
		predicate = "LOWER(u.username) = LOWER($1)"
	}

	if canonical {
		query = `
			SELECT u.id, u.username, u.password_hash, u.role, u.active,
			       COALESCE(d.id, 0), COALESCE(d.nome, ''), COALESCE(d.ativa, false)
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE ` + predicate
	} else {
		// Antes da migration 0020, a relação ainda é textual. A resolução é
		// exclusivamente contra dres e exige exatamente uma correspondência
		// normalizada; schools nunca participa da identidade/autorização.
		query = `
			SELECT u.id, u.username, u.password_hash, u.role, u.active,
			       COALESCE(d.id, 0), COALESCE(d.nome, ''), COALESCE(d.ativa, false)
			FROM admin_users u
			LEFT JOIN LATERAL (
				SELECT MIN(d0.id) AS dre_id, COUNT(*) AS matches
				FROM dres d0
				WHERE UPPER(BTRIM(d0.nome)) = UPPER(BTRIM(COALESCE(u.dre, '')))
			) resolved ON true
			LEFT JOIN dres d ON d.id = resolved.dre_id AND resolved.matches = 1
			WHERE ` + predicate
	}

	var access RuntimeAdminAccess
	err = m.DB.QueryRowContext(ctx, query, arg).Scan(
		&access.ID,
		&access.Username,
		&access.PasswordHash,
		&access.Role,
		&access.UserActive,
		&access.DREID,
		&access.DRE,
		&access.DREActive,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &access, nil
}

// GetRuntimeAccessByUsername é usado no login e em tokens legados sem user_id.
func (m *AdminUserModel) GetRuntimeAccessByUsername(ctx context.Context, username string) (*RuntimeAdminAccess, error) {
	return m.getRuntimeAccess(ctx, false, 0, username)
}

// GetRuntimeAccessByID é o caminho principal para tokens novos da #206.
func (m *AdminUserModel) GetRuntimeAccessByID(ctx context.Context, id int) (*RuntimeAdminAccess, error) {
	return m.getRuntimeAccess(ctx, true, id, "")
}
