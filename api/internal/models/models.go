package models

import (
	"context"
	"database/sql"
	"time"
)

 
type School struct {
	ID        int       `json:"id"`
	Nome      string    `json:"nome_escola"`
	INEP      string    `json:"codigo_inep"`
	Municipio string    `json:"municipio"`
	Dre       string    `json:"dre"`      
	Zona      string    `json:"zona"`     
	Endereco  string    `json:"endereco"` 
	CreatedAt time.Time `json:"created_at"`
}

type SchoolModel struct {
	DB *sql.DB
}

type Models struct {
	Schools SchoolModel
}

func NewModels(db *sql.DB) Models {
	return Models{
		Schools: SchoolModel{DB: db},
	}
}

func (m *SchoolModel) Insert(school School) (int, error) {
	stmt := `
		INSERT INTO schools (nome_escola, codigo_inep, municipio, dre, zona, endereco, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		RETURNING id`

	var id int
	
	err := m.DB.QueryRowContext(context.Background(), stmt, 
		school.Nome, 
		school.INEP, 
		school.Municipio,
		school.Dre,
		school.Zona,
		school.Endereco,
	).Scan(&id)

	if err != nil {
		return 0, err
	}

	return id, nil
}