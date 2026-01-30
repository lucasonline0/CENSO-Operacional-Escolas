package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"censo-api/internal/models"
	"censo-api/internal/services"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
)

const version = "1.0.0"

type config struct {
	port int
	env  string
	db   struct {
		dsn string
	}
}

type application struct {
	config config
	logger *log.Logger
	models models.Models
	sheets *services.SheetsService
	drive  *services.DriveService
}

func main() {
	logger := log.New(os.Stdout, "", log.Ldate|log.Ltime)

	// Carrega .env de múltiplos níveis para garantir leitura local
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../.env")
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load("../../../.env")

	var cfg config
	cfg.port = 8000
	cfg.env = "development"

	// 1. Tenta pegar DSN direto (Railway injeta DATABASE_URL ou DB_DSN)
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}

	// 2. Se não achou DSN, tenta montar via partes (Dev Local)
	if dsn == "" {
		dbHost := os.Getenv("DB_HOST")
		dbPort := os.Getenv("DB_PORT")
		dbUser := os.Getenv("DB_USER")
		dbPass := os.Getenv("DB_PASSWORD")
		dbName := os.Getenv("DB_NAME")

		if dbHost != "" && dbUser != "" {
			dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable timezone=UTC connect_timeout=5",
				dbHost, dbPort, dbUser, dbPass, dbName)
		}
	}

	if dsn == "" {
		// Se cair aqui, o Railway vai fechar e gerar erro 503/CORS no front
		logger.Fatal("ERRO CRÍTICO: DB_DSN ou variáveis de banco não configuradas.")
	}
	cfg.db.dsn = dsn

	db, err := openDB(cfg)
	if err != nil {
		logger.Fatal("ERRO FATAL AO CONECTAR BANCO:", err)
	}
	defer db.Close()

	sheetsService, err := services.NewSheetsService()
	if err != nil {
		logger.Println("AVISO: SheetsService não iniciou (verifique credenciais):", err)
	}

	driveService, err := services.NewDriveService()
	if err != nil {
		logger.Println("AVISO: DriveService não iniciou (verifique credenciais):", err)
	} else {
		logger.Println("DriveService conectado.")
	}

	app := &application{
		config: cfg,
		logger: logger,
		models: models.NewModels(db),
		sheets: sheetsService,
		drive:  driveService,
	}

	// Tenta pegar porta do ambiente (Railway usa PORT)
	portStr := os.Getenv("PORT")
	if portStr != "" {
		fmt.Sscanf(portStr, "%d", &cfg.port)
	}

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.port),
		Handler:      app.routes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	logger.Printf("Servidor rodando na porta %d", cfg.port)
	err = srv.ListenAndServe()
	logger.Fatal(err)
}

func openDB(cfg config) (*sql.DB, error) {
	db, err := sql.Open("pgx", cfg.db.dsn)
	if err != nil {
		return nil, err
	}

	if err = db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

func (app *application) routes() http.Handler {
	mux := chi.NewRouter()

	mux.Use(middleware.Recoverer)
	
	// CONFIGURAÇÃO CORS ATUALIZADA
	// Adicionamos explicitamente o domínio da Vercel para evitar bloqueios
	mux.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
			"https://censo-operacional-escolas.vercel.app", // Teu Front na Vercel
			"http://localhost:3000",                        // Teu Front Local
			"https://*",                                    // Fallback
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	mux.Get("/v1/health", app.HealthCheck)

	mux.Get("/v1/schools", app.GetSchools)
	mux.Post("/v1/schools", app.CreateSchool)

	mux.Get("/v1/census", app.GetCenso)
	mux.Post("/v1/census", app.CreateOrUpdateCenso)

	mux.Post("/v1/upload", app.uploadPhoto)

	return mux
}