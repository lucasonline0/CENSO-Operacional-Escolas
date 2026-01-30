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
	port string // Mudado para string para facilitar
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
	// Logger simples
	logger := log.New(os.Stdout, "", log.Ldate|log.Ltime)

	// Tenta carregar .env (ignora erro se não existir, pois em prod usa variáveis de ambiente)
	_ = godotenv.Load() 
    // Tenta carregar de pastas acima caso esteja rodando de ./cmd/api
    _ = godotenv.Load("../.env")
    _ = godotenv.Load("../../.env")

	var cfg config
    
    // CONFIGURAÇÃO DA PORTA (CRÍTICO PARA RAILWAY)
    // O Railway define a variável PORT. Se não tiver, usa 8000 (local).
	cfg.port = os.Getenv("PORT")
	if cfg.port == "" {
		cfg.port = "8000"
	}
    
	cfg.env = "production" // Assume produção por padrão para segurança

	// CONFIGURAÇÃO DO BANCO
    // 1. Tenta pegar a string de conexão completa (Railway fornece DATABASE_URL)
	dsn := os.Getenv("DATABASE_URL")
    if dsn == "" {
        dsn = os.Getenv("DB_DSN")
    }

    // 2. Se não tiver DSN direto, tenta montar (para desenvolvimento local)
	if dsn == "" {
		dbHost := os.Getenv("DB_HOST")
		dbPort := os.Getenv("DB_PORT")
		dbUser := os.Getenv("DB_USER")
		dbPass := os.Getenv("DB_PASSWORD")
		dbName := os.Getenv("DB_NAME")

		if dbHost != "" {
			dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable timezone=UTC connect_timeout=5",
				dbHost, dbPort, dbUser, dbPass, dbName)
		}
	}

    // Se ainda assim não tiver DSN, não adianta continuar.
	if dsn == "" {
		logger.Fatal("ERRO CRÍTICO: Variável DATABASE_URL ou DB_DSN não encontrada.")
	}
	cfg.db.dsn = dsn

    // CONEXÃO AO BANCO
	db, err := openDB(cfg)
	if err != nil {
		logger.Fatal("ERRO FATAL AO CONECTAR BANCO:", err)
	}
	defer db.Close()

    // INICIALIZAÇÃO DE SERVIÇOS
	sheetsService, err := services.NewSheetsService()
	if err != nil {
		logger.Println("AVISO: SheetsService não iniciou:", err)
	}

	driveService, err := services.NewDriveService()
	if err != nil {
		logger.Println("AVISO: DriveService não iniciou:", err)
	}

	app := &application{
		config: cfg,
		logger: logger,
		models: models.NewModels(db),
		sheets: sheetsService,
		drive:  driveService,
	}

    // SERVIDOR HTTP
    // Importante: ListenAndServe usa o endereço ":PORTA", o que significa "0.0.0.0:PORTA"
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.port),
		Handler:      app.routes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	logger.Printf("Servidor iniciando na porta %s", cfg.port)
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
    
    // Logger de requisições ajuda a ver se o tráfego está chegando
    mux.Use(middleware.Logger) 

	mux.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
            "https://censo-operacional-escolas.vercel.app", 
            "http://localhost:3000",
            "*", // Temporário para garantir que funciona, depois restringimos
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