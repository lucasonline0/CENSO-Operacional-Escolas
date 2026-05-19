package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"censo-api/internal/models"
	"censo-api/internal/services"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
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

	// --- CORREÇÃO DE PATH ---
	// Verifica o diretório atual para debug
	cwd, _ := os.Getwd()
	logger.Printf("Executando a partir de: %s", cwd)

	// Tenta carregar o .env. Ajuste o caminho se necessário.
	// Se você estiver na pasta /api, talvez precise subir um nível para achar a pasta /infra
	envPath := filepath.Join(cwd, "..", "infra", ".env")
	err := godotenv.Load(envPath)
	if err != nil {
		logger.Printf("Aviso: Não encontrou .env em %s, tentando caminho local...", envPath)
		_ = godotenv.Load(".env")
	}

	var cfg config

	cfg.port = os.Getenv("PORT")
	if cfg.port == "" {
		cfg.port = "8000"
	}
	cfg.env = "production"

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DB_DSN")
	}

	if dsn == "" {
		dbHost := os.Getenv("DB_HOST")
		if dbHost != "" {
			dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable timezone=UTC connect_timeout=5",
				os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))
		}
	}

	if dsn == "" {
		logger.Fatal("ERRO FATAL: Variáveis de banco (DB_HOST ou DSN) não foram encontradas.")
	}
	cfg.db.dsn = dsn

	logger.Println("Iniciando conexão com banco...")
	db, err := openDB(cfg)
	if err != nil {
		logger.Fatal("ERRO FATAL BANCO:", err)
	}
	defer db.Close()
	logger.Println("Banco conectado!")

	// Migração: garante que a coluna sheet_synced_at existe (bancos antigos não a têm).
	_, err = db.Exec(`ALTER TABLE census_responses ADD COLUMN IF NOT EXISTS sheet_synced_at TIMESTAMP DEFAULT NULL`)
	if err != nil {
		logger.Printf("AVISO: migração sheet_synced_at: %v", err)
	} else {
		logger.Println("Migração sheet_synced_at OK")
	}

	// ... (Resto do seu código permanece igual)
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

	// Job de retry: a cada 10 minutos re-sincroniza censos completed que
	// não chegaram à planilha (goroutine falhou silenciosamente antes).
	go app.sheetSyncRetryJob()

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

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	if err = db.Ping(); err != nil {
		return nil, err
	}
	return db, nil
}

func (app *application) sheetSyncRetryJob() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		app.syncPendingToSheets()
	}
}

func (app *application) syncPendingToSheets() {
	if app.sheets == nil {
		return
	}
	pending, err := app.models.Census.GetPendingSheetSync()
	if err != nil {
		app.logger.Println("sheetSync: erro ao buscar pendentes:", err)
		return
	}
	if len(pending) == 0 {
		return
	}
	app.logger.Printf("sheetSync: %d censo(s) pendente(s) para planilha", len(pending))
	for _, c := range pending {
		school, err := app.models.Schools.Get(c.SchoolID)
		if err != nil {
			app.logger.Printf("sheetSync: erro escola %d: %v", c.SchoolID, err)
			continue
		}
		if err = app.sheets.AppendCenso(*c, *school); err != nil {
			app.logger.Printf("sheetSync: erro ao enviar escola %d: %v", c.SchoolID, err)
			continue
		}
		if err = app.models.Census.MarkSheetSynced(c.ID); err != nil {
			app.logger.Printf("sheetSync: erro ao marcar sincronizado %d: %v", c.ID, err)
		} else {
			app.logger.Printf("sheetSync: escola %d sincronizada", c.SchoolID)
		}
	}
}

func (app *application) routes() http.Handler {
	mux := chi.NewRouter()
	mux.Use(middleware.Recoverer)
	mux.Use(middleware.Logger)
	mux.Use(app.enableCORS)

	mux.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Censo API Online"))
	})

	mux.Route("/v1", func(r chi.Router) {
		r.Get("/health", app.HealthCheck)
		r.Get("/locations", app.GetLocations)
		r.Get("/schools", app.GetSchools)
		r.Post("/schools", app.CreateSchool)
		r.Get("/census", app.GetCenso)
		r.Post("/census", app.CreateOrUpdateCenso)
		r.Post("/upload", app.uploadPhoto)

		// Admin: login público + rotas protegidas por JWT
		r.Post("/admin/login", app.AdminLogin)
		r.Group(func(protected chi.Router) {
			protected.Use(app.requireAdminAuth)
			protected.Get("/admin/dashboard", app.AdminDashboard)
			protected.Get("/admin/sheet-metrics", app.AdminSheetMetrics)
			protected.Get("/admin/indicadores-metrics", app.AdminIndicadoresMetrics)
			protected.Get("/admin/census", app.AdminGetCensus)
			protected.Get("/admin/census/{id}", app.AdminGetCensusByID)
			protected.Post("/admin/sync-sheets", app.AdminSyncSheets)
		})
	})

	return mux
}