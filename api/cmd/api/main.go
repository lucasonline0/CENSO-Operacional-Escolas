package main

import (
	"api/internal/models"
	"api/pkg/database"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

type config struct {
	port int
	env  string
	db   struct {
		dsn          string
		maxOpenConns int
		maxIdleConns int
		maxIdleTime  string
	}
}

type application struct {
	config config
	logger *log.Logger
	models models.Models
}

func main() {
	var cfg config

	flag.IntVar(&cfg.port, "port", 8000, "Porta do servidor API")
	flag.StringVar(&cfg.env, "env", "development", "Ambiente (development|staging|production)")

	getEnv := func(key, defaultValue string) string {
		if value := os.Getenv(key); value != "" {
			return value
		}
		return defaultValue
	}

	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "censo_seduc_secure_dev")
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbName := getEnv("DB_NAME", "censo_seduc")

	defaultDSN := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", dbUser, dbPassword, dbHost, dbPort, dbName)
	flag.StringVar(&cfg.db.dsn, "db-dsn", defaultDSN, "PostgreSQL DSN")

	flag.IntVar(&cfg.db.maxOpenConns, "db-max-open-conns", 25, "Máximo de conexões abertas")
	flag.IntVar(&cfg.db.maxIdleConns, "db-max-idle-conns", 25, "Máximo de conexões inativas")
	flag.StringVar(&cfg.db.maxIdleTime, "db-max-idle-time", "15m", "Tempo máximo de inatividade da conexão")

	flag.Parse()

	logger := log.New(os.Stdout, "", log.Ldate|log.Ltime)

	db, err := database.New(cfg.db.dsn)
	if err != nil {
		logger.Fatal(err)
	}
	defer db.Close()

	logger.Printf("Conexão com o banco de dados estabelecida com sucesso")

	app := &application{
		config: cfg,
		logger: logger,
		models: models.NewModels(db),
	}

	mux := http.NewServeMux()
	
	mux.HandleFunc("GET /v1/healthcheck", app.healthcheckHandler)
	
	// ALTERAÇÃO AQUI: Removemos o "POST " para garantir compatibilidade
	mux.HandleFunc("/v1/schools", app.createSchoolHandler)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.port),
		Handler:      mux,
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	logger.Printf("Iniciando servidor %s na porta %d", cfg.env, cfg.port)
	err = srv.ListenAndServe()
	logger.Fatal(err)
}