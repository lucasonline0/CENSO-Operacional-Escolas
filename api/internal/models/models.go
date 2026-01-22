package models

import "database/sql"

// Models é o container que agrupa todos os seus modelos de banco
type Models struct {
	Schools SchoolModel
}

// NewModels retorna todos os modelos inicializados com a conexão do banco
func NewModels(db *sql.DB) Models {
	return Models{
		Schools: SchoolModel{DB: db},
	}
}

// SchoolModel será responsável por executar os SQLs (Insert, Select)
type SchoolModel struct {
	DB *sql.DB
}

// Insert salvará a escola (implementaremos amanhã)
func (m SchoolModel) Insert(school *School) error {
	// Futuro código SQL aqui
	return nil
}