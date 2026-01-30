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

	// Carrega .env localmente (ignorado em produção)
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")
	_ = godotenv.Load("../../.env")

	var cfg config
	
	// Porta Railway
	cfg.port = os.Getenv("PORT")
	if cfg.port == "" {
		cfg.port = "8000"
	}
	cfg.env = "production"

	// Banco de Dados
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DB_DSN")
	}

	// Fallback Local
	if dsn == "" {
		dbHost := os.Getenv("DB_HOST")
		if dbHost != "" {
			dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable timezone=UTC connect_timeout=5",
				os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))
		}
	}

	if dsn == "" {
		logger.Fatal("ERRO FATAL: Variáveis de banco não encontradas.")
	}
	cfg.db.dsn = dsn

	// Conexão DB
	logger.Println("Iniciando conexão com banco...")
	db, err := openDB(cfg)
	if err != nil {
		logger.Fatal("ERRO FATAL BANCO:", err)
	}
	defer db.Close()
	logger.Println("Banco conectado!")

	// Inicializa serviços
	sheetsService, err := services.NewSheetsService()
	if err != nil {
		logger.Println("AVISO: SheetsService erro:", err)
	} else {
		logger.Println("SheetsService iniciado.")
	}

	driveService, err := services.NewDriveService()
	if err != nil {
		logger.Println("AVISO: DriveService erro:", err)
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

	// Servidor
	srv := &http.Server{
		Addr:         fmt.Sprintf("0.0.0.0:%s", cfg.port),
		Handler:      app.routes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	logger.Printf("Servidor rodando porta %s", cfg.port)
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
	mux.Use(middleware.Logger)

	mux.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
			"https://censo-operacional-escolas.vercel.app",
			"http://localhost:3000",
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	mux.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Censo API Online"))
	})

	mux.Get("/v1/health", app.HealthCheck)
	mux.Get("/v1/locations", app.GetLocations) // Nova Rota

	mux.Get("/v1/schools", app.GetSchools)
	mux.Post("/v1/schools", app.CreateSchool)
	mux.Get("/v1/census", app.GetCenso)
	mux.Post("/v1/census", app.CreateOrUpdateCenso)
	mux.Post("/v1/upload", app.uploadPhoto)

	return mux
}