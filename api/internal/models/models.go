package models

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// school representa a tabela de escolas
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

// censusresponse guarda o pacotão de respostas das 14 páginas
type CensusResponse struct {
	ID        int             `json:"id"`
	SchoolID  int             `json:"school_id"`
	Year      int             `json:"year"`
	Status    string          `json:"status"`
	Data      json.RawMessage `json:"data"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type SchoolModel struct {
	DB *sql.DB
}

type CensusModel struct {
	DB *sql.DB
}

// models agrupa tudo pro main.go usar
type Models struct {
	Schools SchoolModel
	Census  CensusModel
}

// newmodels inicializa os conectores
func NewModels(db *sql.DB) Models {
	return Models{
		Schools: SchoolModel{DB: db},
		Census:  CensusModel{DB: db},
	}
}

// insert salva uma nova escola
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

// upsert salva ou atualiza o censo (se já existir, atualiza)
func (m *CensusModel) Upsert(response CensusResponse) error {
	stmt := `
		INSERT INTO census_responses (school_id, year, status, data, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (school_id, year) 
		DO UPDATE SET 
			status = EXCLUDED.status,
			data = EXCLUDED.data,
			updated_at = NOW()
		RETURNING id`

	return m.DB.QueryRow(stmt, 
		response.SchoolID, 
		response.Year, 
		response.Status, 
		response.Data,
	).Scan(&response.ID)
}

// getbyschoolid busca o censo de uma escola
func (m *CensusModel) GetBySchoolID(schoolID int, year int) (*CensusResponse, error) {
	stmt := `SELECT id, school_id, year, status, data, created_at, updated_at 
	         FROM census_responses WHERE school_id = $1 AND year = $2`

	var c CensusResponse
	var data []byte 

	err := m.DB.QueryRow(stmt, schoolID, year).Scan(
		&c.ID, &c.SchoolID, &c.Year, &c.Status, &data, &c.CreatedAt, &c.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil 
	}
	if err != nil {
		return nil, err
	}

	c.Data = json.RawMessage(data)
	return &c, nil
}