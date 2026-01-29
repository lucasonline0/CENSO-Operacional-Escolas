package models

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

type School struct {
	ID               int             `json:"id"`
	Nome             string          `json:"nome_escola"`
	INEP             string          `json:"codigo_inep"`
	Municipio        string          `json:"municipio"`
	Dre              string          `json:"dre"`      
	Zona             string          `json:"zona"`     
	Endereco         string          `json:"endereco"` 
	CNPJ             string          `json:"cnpj"` 
	Telefone         string          `json:"telefone_institucional"`
	Email            string          `json:"email"`
	CEP              string          `json:"cep"`
	NomeDiretor      string          `json:"nome_diretor"`
	MatriculaDiretor string          `json:"matricula_diretor"`
	ContatoDiretor   string          `json:"contato_diretor"`
	
	Turnos               json.RawMessage `json:"turnos"` 
	EtapasOfertadas      json.RawMessage `json:"etapas_ofertadas"`
	ModalidadesOfertadas json.RawMessage `json:"modalidades_ofertadas"`

	CreatedAt        time.Time       `json:"created_at"`
}

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

type Models struct {
	Schools SchoolModel
	Census  CensusModel
}

func NewModels(db *sql.DB) Models {
	return Models{
		Schools: SchoolModel{DB: db},
		Census:  CensusModel{DB: db},
	}
}

func (m *SchoolModel) Insert(school School) (int, error) {
	var existingID int
	queryCheck := `SELECT id FROM schools WHERE codigo_inep = $1`
	err := m.DB.QueryRowContext(context.Background(), queryCheck, school.INEP).Scan(&existingID)

	turnos := string(school.Turnos)
	etapas := string(school.EtapasOfertadas)
	modalidades := string(school.ModalidadesOfertadas)

	if err == nil {
		queryUpdate := `
			UPDATE schools 
			SET nome_escola = $1, municipio = $2, dre = $3, zona = $4, endereco = $5, 
			    cnpj = $6, telefone = $7, email = $8, cep = $9, 
			    nome_diretor = $10, matricula_diretor = $11, contato_diretor = $12,
			    turnos = $13, etapas_ofertadas = $14, modalidades_ofertadas = $15
			WHERE id = $16`
		
		_, errUpdate := m.DB.ExecContext(context.Background(), queryUpdate, 
			school.Nome, school.Municipio, school.Dre, school.Zona, school.Endereco, 
			school.CNPJ, school.Telefone, school.Email, school.CEP,
			school.NomeDiretor, school.MatriculaDiretor, school.ContatoDiretor,
			turnos, etapas, modalidades,
			existingID)
		
		if errUpdate != nil {
			return 0, errUpdate
		}
		
		return existingID, nil
	}

	stmt := `
		INSERT INTO schools (
			nome_escola, codigo_inep, municipio, dre, zona, endereco, 
			cnpj, telefone, email, cep, nome_diretor, matricula_diretor, contato_diretor, 
			turnos, etapas_ofertadas, modalidades_ofertadas,
			created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
		RETURNING id`

	var id int
	err = m.DB.QueryRowContext(context.Background(), stmt, 
		school.Nome, 
		school.INEP, 
		school.Municipio,
		school.Dre, 
		school.Zona,
		school.Endereco,
		school.CNPJ,
		school.Telefone,
		school.Email,
		school.CEP,
		school.NomeDiretor,
		school.MatriculaDiretor,
		school.ContatoDiretor,
		turnos,
		etapas,
		modalidades,
	).Scan(&id)

	if err != nil {
		return 0, err
	}

	return id, nil
}

func (m *SchoolModel) Get(id int) (*School, error) {
	query := `
		SELECT id, nome_escola, codigo_inep, municipio, dre, zona, endereco, 
		       COALESCE(cnpj, ''), COALESCE(telefone, ''), COALESCE(email, ''), COALESCE(cep, ''),
		       COALESCE(nome_diretor, ''), COALESCE(matricula_diretor, ''), COALESCE(contato_diretor, ''),
		       COALESCE(turnos, ''), COALESCE(etapas_ofertadas, ''), COALESCE(modalidades_ofertadas, ''),
		       created_at
		FROM schools
		WHERE id = $1`

	var s School
	var turnos, etapas, modalidades string

	err := m.DB.QueryRowContext(context.Background(), query, id).Scan(
		&s.ID, &s.Nome, &s.INEP, &s.Municipio, &s.Dre, &s.Zona, &s.Endereco, 
		&s.CNPJ, &s.Telefone, &s.Email, &s.CEP,
		&s.NomeDiretor, &s.MatriculaDiretor, &s.ContatoDiretor,
		&turnos, &etapas, &modalidades,
		&s.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	if turnos != "" { s.Turnos = json.RawMessage([]byte(turnos)) }
	if etapas != "" { s.EtapasOfertadas = json.RawMessage([]byte(etapas)) }
	if modalidades != "" { s.ModalidadesOfertadas = json.RawMessage([]byte(modalidades)) }

	return &s, nil
}

func (m *SchoolModel) GetAll() ([]*School, error) {
	query := `
		SELECT id, nome_escola, codigo_inep, municipio, dre, zona, endereco, 
		       COALESCE(cnpj, ''), COALESCE(telefone, ''), COALESCE(email, ''), COALESCE(cep, ''),
		       COALESCE(nome_diretor, ''), COALESCE(matricula_diretor, ''), COALESCE(contato_diretor, ''),
		       COALESCE(turnos, ''), COALESCE(etapas_ofertadas, ''), COALESCE(modalidades_ofertadas, ''),
		       created_at
		FROM schools
		ORDER BY nome_escola`

	rows, err := m.DB.QueryContext(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schools []*School
	for rows.Next() {
		var s School
		var turnos, etapas, modalidades string
		err := rows.Scan(
			&s.ID, &s.Nome, &s.INEP, &s.Municipio, &s.Dre, &s.Zona, &s.Endereco, 
			&s.CNPJ, &s.Telefone, &s.Email, &s.CEP,
			&s.NomeDiretor, &s.MatriculaDiretor, &s.ContatoDiretor,
			&turnos, &etapas, &modalidades,
			&s.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		
		if turnos != "" { s.Turnos = json.RawMessage([]byte(turnos)) }
		if etapas != "" { s.EtapasOfertadas = json.RawMessage([]byte(etapas)) }
		if modalidades != "" { s.ModalidadesOfertadas = json.RawMessage([]byte(modalidades)) }
		
		schools = append(schools, &s)
	}

	return schools, nil
}

func (m *CensusModel) Upsert(response CensusResponse) error {
	stmt := `
		INSERT INTO census_responses (school_id, year, status, data, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (school_id, year) 
		DO UPDATE SET 
			status = EXCLUDED.status,
			data = COALESCE(census_responses.data, '{}'::jsonb) || EXCLUDED.data, 
			updated_at = NOW()
		RETURNING id`

	return m.DB.QueryRow(stmt, 
		response.SchoolID, 
		response.Year, 
		response.Status, 
		response.Data,
	).Scan(&response.ID)
}

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