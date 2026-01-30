package database

import (
	"database/sql"
	"time"

	_ "github.com/lib/pq"
)

func New(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(150)
	db.SetMaxIdleConns(50)
	db.SetConnMaxLifetime(time.Hour)
	db.SetConnMaxIdleTime(15 * time.Minute)

	if err = db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}