package database

import (
	"database/sql"
	"time"

	_ "github.com/lib/pq" // Driver do Postgres
)

// New abre a conexão com o banco de dados
func New(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	// Configurações do Pool de Conexões
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxIdleTime(15 * time.Minute)

	// Tenta um Ping para garantir que conectou mesmo
	if err = db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}