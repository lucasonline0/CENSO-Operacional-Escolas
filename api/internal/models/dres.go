package models

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

var (
	ErrDRENotFound     = errors.New("DRE não encontrada")
	ErrDREExists       = errors.New("nome da DRE já está em uso")
	ErrDREInactive     = errors.New("DRE está inativa")
	ErrDRENameRequired = errors.New("nome da DRE não pode ser vazio")
	ErrDREInvalidID    = errors.New("ID da DRE inválido")
)

type DRE struct {
	ID            int       `json:"id"`
	Nome          string    `json:"nome"`
	Sigla         string    `json:"sigla"`
	MunicipioSede string    `json:"municipio_sede"`
	Polo          string    `json:"polo"`
	GestorNome    string    `json:"gestor_nome"`
	Email         string    `json:"email"`
	Telefone      string    `json:"telefone"`
	Ativa         bool      `json:"ativa"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type DREModel struct {
	DB *sql.DB
}

func isDREDuplicateError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}

// Create insere uma nova DRE. O campo nome e obrigatorio e o status recebido
// pelo caller e respeitado literalmente. O handler HTTP e responsavel pelo
// default ativa=true quando o campo nao vier no payload.
func (m *DREModel) Create(ctx context.Context, dre DRE) (*DRE, error) {
	nome := strings.TrimSpace(dre.Nome)
	if nome == "" {
		return nil, ErrDRENameRequired
	}

	sigla := strings.TrimSpace(dre.Sigla)
	municipioSede := strings.TrimSpace(dre.MunicipioSede)
	polo := strings.TrimSpace(dre.Polo)
	gestorNome := strings.TrimSpace(dre.GestorNome)
	email := strings.TrimSpace(dre.Email)
	telefone := strings.TrimSpace(dre.Telefone)

	query := `
		INSERT INTO dres (nome, sigla, municipio_sede, polo, gestor_nome, email, telefone, ativa, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		RETURNING id, nome, COALESCE(sigla, ''), COALESCE(municipio_sede, ''), COALESCE(polo, ''),
		          COALESCE(gestor_nome, ''), COALESCE(email, ''), COALESCE(telefone, ''),
		          ativa, created_at, updated_at`

	var d DRE
	err := m.DB.QueryRowContext(ctx, query,
		nome, sigla, municipioSede, polo, gestorNome, email, telefone, dre.Ativa,
	).Scan(
		&d.ID, &d.Nome, &d.Sigla, &d.MunicipioSede, &d.Polo,
		&d.GestorNome, &d.Email, &d.Telefone,
		&d.Ativa, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		if isDREDuplicateError(err) {
			return nil, ErrDREExists
		}
		return nil, err
	}
	return &d, nil
}

// GetByID busca uma DRE pelo seu ID numerico.
func (m *DREModel) GetByID(ctx context.Context, id int) (*DRE, error) {
	if id <= 0 {
		return nil, ErrDREInvalidID
	}

	query := `
		SELECT id, nome, COALESCE(sigla, ''), COALESCE(municipio_sede, ''), COALESCE(polo, ''),
		       COALESCE(gestor_nome, ''), COALESCE(email, ''), COALESCE(telefone, ''),
		       ativa, created_at, updated_at
		FROM dres
		WHERE id = $1`

	var d DRE
	err := m.DB.QueryRowContext(ctx, query, id).Scan(
		&d.ID, &d.Nome, &d.Sigla, &d.MunicipioSede, &d.Polo,
		&d.GestorNome, &d.Email, &d.Telefone,
		&d.Ativa, &d.CreatedAt, &d.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrDRENotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// GetByNome busca uma DRE pelo seu nome sem diferenciar caixa e tolerando espacos.
func (m *DREModel) GetByNome(ctx context.Context, nome string) (*DRE, error) {
	nome = strings.TrimSpace(nome)
	if nome == "" {
		return nil, ErrDRENameRequired
	}

	query := `
		SELECT id, nome, COALESCE(sigla, ''), COALESCE(municipio_sede, ''), COALESCE(polo, ''),
		       COALESCE(gestor_nome, ''), COALESCE(email, ''), COALESCE(telefone, ''),
		       ativa, created_at, updated_at
		FROM dres
		WHERE UPPER(TRIM(nome)) = UPPER(TRIM($1))`

	var d DRE
	err := m.DB.QueryRowContext(ctx, query, nome).Scan(
		&d.ID, &d.Nome, &d.Sigla, &d.MunicipioSede, &d.Polo,
		&d.GestorNome, &d.Email, &d.Telefone,
		&d.Ativa, &d.CreatedAt, &d.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrDRENotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// List retorna todas as DREs cadastradas, ordenadas pelo nome.
func (m *DREModel) List(ctx context.Context) ([]*DRE, error) {
	if m.DB == nil {
		return nil, errors.New("database not configured")
	}

	query := `
		SELECT id, nome, COALESCE(sigla, ''), COALESCE(municipio_sede, ''), COALESCE(polo, ''),
		       COALESCE(gestor_nome, ''), COALESCE(email, ''), COALESCE(telefone, ''),
		       ativa, created_at, updated_at
		FROM dres
		ORDER BY nome ASC`

	rows, err := m.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dres := make([]*DRE, 0)
	for rows.Next() {
		var d DRE
		if err := rows.Scan(
			&d.ID, &d.Nome, &d.Sigla, &d.MunicipioSede, &d.Polo,
			&d.GestorNome, &d.Email, &d.Telefone,
			&d.Ativa, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		dres = append(dres, &d)
	}
	return dres, rows.Err()
}

// Update atualiza a entidade mestre e sincroniza, na MESMA transacao, os nomes
// legados mantidos em schools/admin_users. No schema pos-0020 a selecao dos
// filhos usa dre_id. Durante a janela de rollout em um schema anterior, o nome
// antigo bloqueado na mesma transacao e usado apenas para localizar os registros
// legados. Qualquer falha faz rollback de toda a operacao.
func (m *DREModel) Update(ctx context.Context, dre DRE) (*DRE, error) {
	if dre.ID <= 0 {
		return nil, ErrDREInvalidID
	}

	nome := strings.TrimSpace(dre.Nome)
	if nome == "" {
		return nil, ErrDRENameRequired
	}

	sigla := strings.TrimSpace(dre.Sigla)
	municipioSede := strings.TrimSpace(dre.MunicipioSede)
	polo := strings.TrimSpace(dre.Polo)
	gestorNome := strings.TrimSpace(dre.GestorNome)
	email := strings.TrimSpace(dre.Email)
	telefone := strings.TrimSpace(dre.Telefone)

	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var oldName string
	err = tx.QueryRowContext(ctx, `SELECT nome FROM dres WHERE id = $1 FOR UPDATE`, dre.ID).Scan(&oldName)
	if err == sql.ErrNoRows {
		return nil, ErrDRENotFound
	}
	if err != nil {
		return nil, err
	}
	oldName = strings.TrimSpace(oldName)

	schoolsCanonical, err := hasColumn(ctx, tx, "schools", "dre_id")
	if err != nil {
		return nil, err
	}
	usersCanonical, err := hasColumn(ctx, tx, "admin_users", "dre_id")
	if err != nil {
		return nil, err
	}

	query := `
		UPDATE dres
		SET nome = $1, sigla = $2, municipio_sede = $3, polo = $4,
		    gestor_nome = $5, email = $6, telefone = $7, ativa = $8, updated_at = NOW()
		WHERE id = $9
		RETURNING id, nome, COALESCE(sigla, ''), COALESCE(municipio_sede, ''), COALESCE(polo, ''),
		          COALESCE(gestor_nome, ''), COALESCE(email, ''), COALESCE(telefone, ''),
		          ativa, created_at, updated_at`

	var d DRE
	err = tx.QueryRowContext(ctx, query,
		nome, sigla, municipioSede, polo, gestorNome, email, telefone, dre.Ativa, dre.ID,
	).Scan(
		&d.ID, &d.Nome, &d.Sigla, &d.MunicipioSede, &d.Polo,
		&d.GestorNome, &d.Email, &d.Telefone,
		&d.Ativa, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		if isDREDuplicateError(err) {
			return nil, ErrDREExists
		}
		return nil, err
	}

	if usersCanonical {
		_, err = tx.ExecContext(ctx, `
			UPDATE admin_users
			SET dre = LEFT($1, 128), updated_at = NOW()
			WHERE dre_id = $2 AND dre IS DISTINCT FROM LEFT($1, 128)`, d.Nome, d.ID)
	} else {
		_, err = tx.ExecContext(ctx, `
			UPDATE admin_users
			SET dre = $1, updated_at = NOW()
			WHERE UPPER(BTRIM(COALESCE(dre, ''))) = UPPER(BTRIM($2))`, d.Nome, oldName)
	}
	if err != nil {
		return nil, err
	}

	if schoolsCanonical {
		_, err = tx.ExecContext(ctx, `
			UPDATE schools
			SET dre = LEFT($1, 100)
			WHERE dre_id = $2 AND dre IS DISTINCT FROM LEFT($1, 100)`, d.Nome, d.ID)
	} else {
		_, err = tx.ExecContext(ctx, `
			UPDATE schools
			SET dre = $1
			WHERE UPPER(BTRIM(COALESCE(dre, ''))) = UPPER(BTRIM($2))`, d.Nome, oldName)
	}
	if err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return &d, nil
}

// SetActive ativa ou desativa uma DRE pelo ID.
func (m *DREModel) SetActive(ctx context.Context, id int, active bool) error {
	if id <= 0 {
		return ErrDREInvalidID
	}

	query := `UPDATE dres SET ativa = $1, updated_at = NOW() WHERE id = $2`
	result, err := m.DB.ExecContext(ctx, query, active, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrDRENotFound
	}

	return nil
}

// SetActiveByNome existe apenas para compatibilidade de callers legados. Novos
// fluxos devem preferir SetActive por ID.
func (m *DREModel) SetActiveByNome(ctx context.Context, nome string, active bool) error {
	nome = strings.TrimSpace(nome)
	if nome == "" {
		return ErrDRENameRequired
	}

	query := `UPDATE dres SET ativa = $1, updated_at = NOW() WHERE UPPER(TRIM(nome)) = UPPER(TRIM($2))`
	result, err := m.DB.ExecContext(ctx, query, active, nome)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrDRENotFound
	}

	return nil
}
