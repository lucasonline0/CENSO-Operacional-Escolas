package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"censo-api/internal/models"
	"censo-api/internal/services" // Importando serviços (Drive e Sheets)

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
	sheets *services.SheetsService // Serviço de Planilhas
	drive  *services.DriveService  // Serviço de Drive (Novo)
}

func main() {
	logger := log.New(os.Stdout, "", log.Ldate|log.Ltime)

	err := godotenv.Load("../.env")
	if err != nil {
		if err := godotenv.Load("../../.env"); err != nil {
			logger.Println("Aviso: Arquivo .env não encontrado. O sistema tentará usar variáveis de ambiente do SO.")
		}
	}

	var cfg config
	cfg.port = 8000
	cfg.env = "development"

	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	if dbHost == "" || dbUser == "" || dbPass == "" || dbName == "" {
		logger.Fatal("Erro: Variáveis de ambiente de banco de dados (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) não estão configuradas.")
	}

	cfg.db.dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable timezone=UTC connect_timeout=5",
		dbHost, dbPort, dbUser, dbPass, dbName)

	db, err := openDB(cfg)
	if err != nil {
		logger.Fatal(err)
	}
	defer db.Close()

	// Inicializa serviços externos
	sheetsService, err := services.NewSheetsService()
	if err != nil {
		logger.Println("Aviso: Falha ao inicializar SheetsService (verifique credenciais):", err)
	}

	driveService, err := services.NewDriveService()
	if err != nil {
		logger.Println("Aviso: Falha ao inicializar DriveService (verifique credenciais):", err)
	}

	app := &application{
		config: cfg,
		logger: logger,
		models: models.NewModels(db),
		sheets: sheetsService,
		drive:  driveService,
	}

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.port),
		Handler:      app.routes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	logger.Printf("Starting %s server on %d", cfg.env, cfg.port)
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
	mux.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
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

	// Rota de Upload de Fotos
	mux.Post("/v1/upload", app.uploadPhoto)

	return mux
}