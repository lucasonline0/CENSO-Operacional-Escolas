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
	ID                 int
	Username           string
	Email              string
	PasswordHash       string
	Role               string
	UserActive         bool
	AuthVersion        int
	MustChangePassword bool
	DREID              int
	DRE                string
	DREActive          bool
	DataScope          string
	Permissions        []string
	DREIDs             []int
}

func (m *AdminUserModel) getRuntimeAccess(ctx context.Context, byID bool, id int, username string) (*RuntimeAdminAccess, error) {
	if m.DB == nil {
		return nil, ErrUserNotFound
	}

	canonical, err := hasColumn(ctx, m.DB, "admin_users", "dre_id")
	if err != nil {
		return nil, err
	}

	hasAuthVer, err := hasColumn(ctx, m.DB, "admin_users", "auth_version")
	if err != nil {
		return nil, err
	}
	hasDataScope, err := hasColumn(ctx, m.DB, "admin_users", "data_scope")
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
		// Resolve uma identidade em consulta única e falha fechada se um dado
		// legado produzir colisão entre os namespaces username/e-mail.
		identityMatch := `(LOWER(BTRIM(u.username)) = LOWER(BTRIM($1))
			OR LOWER(BTRIM(COALESCE(to_jsonb(u)->>'email', ''))) = LOWER(BTRIM($1)))`
		predicate = identityMatch + ` AND (
			SELECT COUNT(*)
			FROM admin_users matched
			WHERE LOWER(BTRIM(matched.username)) = LOWER(BTRIM($1))
			   OR LOWER(BTRIM(COALESCE(to_jsonb(matched)->>'email', ''))) = LOWER(BTRIM($1))
		) = 1`
	}

	authVerCol := "1 AS auth_version"
	if hasAuthVer {
		authVerCol = "COALESCE(u.auth_version, 1)"
	}
	dataScopeCol := "'selected'"
	if hasDataScope {
		dataScopeCol = "COALESCE(u.data_scope, 'selected')"
	}

	if canonical {
		query = `
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role, u.active, ` + authVerCol + `,
			       COALESCE((to_jsonb(u)->>'must_change_password')::boolean, false),
			       COALESCE(d.id, 0), COALESCE(d.nome, ''), COALESCE(d.ativa, false),
			       ` + dataScopeCol + `
			FROM admin_users u
			LEFT JOIN dres d ON d.id = u.dre_id
			WHERE ` + predicate
	} else {
		// Antes da migration 0020, a relação ainda é textual. A resolução é
		// exclusivamente contra dres e exige exatamente uma correspondência
		// normalizada; schools nunca participa da identidade/autorização.
		query = `
			SELECT u.id, u.username, COALESCE(to_jsonb(u)->>'email', ''), u.password_hash, u.role, u.active, ` + authVerCol + `,
			       COALESCE((to_jsonb(u)->>'must_change_password')::boolean, false),
			       COALESCE(d.id, 0), COALESCE(d.nome, ''), COALESCE(d.ativa, false), 'selected'
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
		&access.Email,
		&access.PasswordHash,
		&access.Role,
		&access.UserActive,
		&access.AuthVersion,
		&access.MustChangePassword,
		&access.DREID,
		&access.DRE,
		&access.DREActive,
		&access.DataScope,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	// 0027 is required in production. During old-schema tests this query may
	// not be available; legacy DRE permissions remain the safe equivalent.
	rows, permissionsErr := m.DB.QueryContext(ctx, `SELECT permission FROM admin_user_permissions WHERE user_id=$1 ORDER BY permission`, access.ID)
	if permissionsErr == nil {
		defer rows.Close()
		for rows.Next() {
			var p string
			if err := rows.Scan(&p); err != nil {
				return nil, err
			}
			access.Permissions = append(access.Permissions, p)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if access.DataScope == "selected" {
			dreRows, err := m.DB.QueryContext(ctx, `
				SELECT aud.dre_id
				FROM admin_user_dres aud
				JOIN dres d ON d.id = aud.dre_id
				WHERE aud.user_id = $1
				  AND d.ativa = true
				ORDER BY aud.dre_id`, access.ID)
			if err != nil {
				return nil, err
			}
			defer dreRows.Close()
			for dreRows.Next() {
				var id int
				if err := dreRows.Scan(&id); err != nil {
					return nil, err
				}
				access.DREIDs = append(access.DREIDs, id)
			}
			if err := dreRows.Err(); err != nil {
				return nil, err
			}
		}
	} else if access.Role == "dre" {
		access.Permissions = []string{"census.read", "analytics.read", "reports.read"}
		if access.DREID > 0 {
			access.DREIDs = []int{access.DREID}
		}
	} else {
		return nil, permissionsErr
	}
	return &access, nil
}

// GetRuntimeAccessByUsername é usado no login e em tokens legados sem user_id.
func (m *AdminUserModel) GetRuntimeAccessByUsername(ctx context.Context, username string) (*RuntimeAdminAccess, error) {
	return m.getRuntimeAccess(ctx, false, 0, username)
}

// GetRuntimeAccessByIdentity resolve e-mail ou username de forma explícita e
// rejeita colisões entre namespaces em vez de aplicar fallback ambíguo.
func (m *AdminUserModel) GetRuntimeAccessByIdentity(ctx context.Context, identity string) (*RuntimeAdminAccess, error) {
	return m.getRuntimeAccess(ctx, false, 0, identity)
}

// GetRuntimeAccessByID é o caminho principal para tokens novos da #206.
func (m *AdminUserModel) GetRuntimeAccessByID(ctx context.Context, id int) (*RuntimeAdminAccess, error) {
	return m.getRuntimeAccess(ctx, true, id, "")
}
