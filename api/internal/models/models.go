package models

import (
	"context"
	"database/sql"
	"time"
)

type Models struct {
	Schools SchoolModel
}

func NewModels(db *sql.DB) Models {
	return Models{
		Schools: SchoolModel{DB: db},
	}
}

type SchoolModel struct {
	DB *sql.DB
}

// Insert insere uma nova escola no banco de dados e retorna o ID gerado
func (m SchoolModel) Insert(school *School) error {
	// Timeout de 3 segundos para evitar travamentos
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `
		INSERT INTO schools (nome_escola, codigo_inep, municipio)
		VALUES ($1, $2, $3)
		RETURNING id, created_at`

	args := []any{school.NomeEscola, school.CodigoINEP, school.Municipio}

	// Executa a query e preenche o ID gerado na struct original
	return m.DB.QueryRowContext(ctx, query, args...).Scan(&school.ID, &school.CreatedAt)
}