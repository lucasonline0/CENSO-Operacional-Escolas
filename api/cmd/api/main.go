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
	port string
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
	logger := log.New(os.Stdout, "[CENSO-API] ", log.Ldate|log.Ltime|log.Lshortfile)

	// Tenta carregar .env localmente (em produção no Railway isso é ignorado/falha silenciosamente)
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")
	_ = godotenv.Load("../../.env")

	var cfg config
	
	// 1. Configuração da Porta (CRÍTICO PARA O RAILWAY)
	// O Railway injeta a porta na variável "PORT".
	cfg.port = os.Getenv("PORT")
	if cfg.port == "" {
		cfg.port = "8000" // Fallback apenas para desenvolvimento local
	}
	cfg.env = "production"

	// 2. Configuração do Banco de Dados
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DB_DSN")
	}

	// Fallback para montagem manual (Desenvolvimento Local)
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

	if dsn == "" {
		logger.Fatal("ERRO FATAL: Variável DATABASE_URL ou DB_DSN não encontrada. O servidor não pode iniciar.")
	}
	cfg.db.dsn = dsn

	// 3. Conexão com o Banco
	logger.Println("Iniciando conexão com o banco de dados...")
	db, err := openDB(cfg)
	if err != nil {
		logger.Fatal("ERRO FATAL AO CONECTAR BANCO:", err)
	}
	defer db.Close()
	logger.Println("Banco de dados conectado com sucesso!")

	// 4. Inicialização de Serviços Externos
	sheetsService, err := services.NewSheetsService()
	if err != nil {
		logger.Println("AVISO: SheetsService não iniciou (verifique credenciais):", err)
	} else {
		logger.Println("SheetsService iniciado.")
	}

	driveService, err := services.NewDriveService()
	if err != nil {
		logger.Println("AVISO: DriveService não iniciou (verifique credenciais):", err)
	} else {
		logger.Println("DriveService iniciado.")
	}

	app := &application{
		config: cfg,
		logger: logger,
		models: models.NewModels(db),
		sheets: sheetsService,
		drive:  driveService,
	}

	// 5. Configuração do Servidor
	srv := &http.Server{
		Addr:         fmt.Sprintf("0.0.0.0:%s", cfg.port), // Escuta em todas as interfaces
		Handler:      app.routes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	logger.Printf("Servidor pronto! Escutando na porta %s no ambiente %s", cfg.port, cfg.env)
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
	mux.Use(middleware.Logger) // Logs de requisição ajudam a ver se o tráfego chega

	// CORREÇÃO CRÍTICA DE CORS:
	// Removemos "*" porque AllowCredentials=true proíbe wildcard.
	mux.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
			"https://censo-operacional-escolas.vercel.app", // Teu Domínio de Produção
			"http://localhost:3000",                        // Teu Localhost
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Rota Raiz para Health Check do Railway (Evita 502 por timeout)
	mux.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Censo API Online"))
	})

	mux.Get("/v1/health", app.HealthCheck)

	mux.Get("/v1/schools", app.GetSchools)
	mux.Post("/v1/schools", app.CreateSchool)

	mux.Get("/v1/census", app.GetCenso)
	mux.Post("/v1/census", app.CreateOrUpdateCenso)

	mux.Post("/v1/upload", app.uploadPhoto)

	return mux
}