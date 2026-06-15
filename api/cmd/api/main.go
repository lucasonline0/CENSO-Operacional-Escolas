package main

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"

	"censo-api/internal/models"
	"censo-api/internal/services"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
)

// migrationsFS embute, no próprio binário, todos os .sql em
// api/cmd/api/migrations/. Isso elimina a dependência de um caminho
// relativo em runtime (problema observado no deploy Railway, onde
// o working directory do processo não contém o diretório
// infra/migrations/ que existe no monorepo).
//
// A cópia em infra/migrations/ é mantida como referência operacional
// e fonte de verdade documental — qualquer mudança numa view deve ser
// refletida nas DUAS pastas.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

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
	cwd, _ := os.Getwd()
	logger.Printf("Executando a partir de: %s", cwd)

	// PROCURA O .ENV DE FORMA INTELIGENTE EM VÁRIOS LUGARES
	envPaths := []string{
		".env",                                    // Tenta na mesma pasta de onde o comando rodou
		filepath.Join(cwd, ".env"),                // Tenta no caminho absoluto atual
		filepath.Join(cwd, "..", ".env"),          // Tenta um nível acima (raiz do projeto)
		filepath.Join(cwd, "..", "infra", ".env"), // Tenta na pasta infra
	}

	envLoaded := false
	for _, p := range envPaths {
		if err := godotenv.Load(p); err == nil {
			logger.Printf("Arquivo .env carregado com sucesso de: %s", p)
			envLoaded = true
			break // Para de procurar assim que encontrar e carregar um .env válido
		}
	}

	if !envLoaded {
		logger.Println("AVISO: Nenhum arquivo .env encontrado. Dependendo das variáveis do sistema.")
	} else if os.Getenv("ADMIN_USERNAME") != "" {
		logger.Println("Credenciais de ADMIN carregadas no ambiente com sucesso.")
	}

	var cfg config

	// Valida configuração de segurança crítica antes de subir o servidor.
	// Aborta cedo (em vez de cair num segredo default inseguro) se o JWT
	// não estiver corretamente configurado.
	if err := validateSecurityConfig(); err != nil {
		logger.Fatal("ERRO FATAL SEGURANÇA: ", err)
	}

	cfg.port = os.Getenv("PORT")
	if cfg.port == "" {
		cfg.port = "8000"
	}
	cfg.env = os.Getenv("APP_ENV")
	if cfg.env == "" {
		cfg.env = "production"
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DB_DSN")
	}

	if dsn == "" {
		dbHost := os.Getenv("DB_HOST")
		if dbHost != "" {
			// sslmode configurável: padrão "disable" para o docker local sem TLS,
			// mas permite exigir TLS (DB_SSLMODE=require) em produção.
			sslmode := os.Getenv("DB_SSLMODE")
			if sslmode == "" {
				sslmode = "disable"
			}
			dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s timezone=UTC connect_timeout=5",
				os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"), sslmode)
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

	// Aplica as migrations idempotentes embarcadas no binário via
	// go:embed (api/cmd/api/migrations/*.sql). Todas devem usar
	// CREATE OR REPLACE / IF NOT EXISTS e poder rodar várias vezes
	// sem efeito colateral.
	if err = applyMigrations(db, logger); err != nil {
		logger.Printf("AVISO: applyMigrations: %v", err)
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

// applyMigrations executa, em ordem alfabética, todos os arquivos .sql
// embarcados em migrationsFS (api/cmd/api/migrations/*.sql). Cada arquivo
// deve ser idempotente (CREATE OR REPLACE VIEW, IF NOT EXISTS, etc.) —
// não há tabela de controle de versão nesta fase.
//
// Como o conteúdo está embarcado no binário via go:embed, o resultado é
// independente do working directory do processo — funciona igual no
// docker local, no Railway e em qualquer outro ambiente.
//
// Erros ao aplicar uma migration individual são logados com detalhe e
// não derrubam o servidor: o startup segue, e o operador vê no log
// qual arquivo falhou e por quê.
func applyMigrations(db *sql.DB, logger *log.Logger) error {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("applyMigrations: ler embed migrations/: %w", err)
	}

	files := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if filepath.Ext(e.Name()) != ".sql" {
			continue
		}
		files = append(files, e.Name())
	}
	sort.Strings(files)

	if len(files) == 0 {
		logger.Println("applyMigrations: nenhum .sql embarcado, pulando.")
		return nil
	}

	logger.Printf("applyMigrations: %d migration(s) encontrada(s): %v", len(files), files)

	for _, name := range files {
		content, err := fs.ReadFile(migrationsFS, "migrations/"+name)
		if err != nil {
			logger.Printf("applyMigrations: ERRO lendo %s do embed: %v", name, err)
			continue
		}
		if _, err := db.Exec(string(content)); err != nil {
			logger.Printf("applyMigrations: ERRO aplicando %s: %v", name, err)
			continue
		}
		logger.Printf("applyMigrations: %s aplicada com sucesso", name)
	}
	return nil
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

		// Endpoints públicos do formulário. Ficam atrás do gate opcional de
		// X-API-Key (requirePublicAPIKey): inerte até PUBLIC_API_KEY ser
		// definido no servidor, então não quebra nada em produção.
		r.Group(func(pub chi.Router) {
			pub.Use(app.requirePublicAPIKey)
			pub.Get("/locations", app.GetLocations)
			pub.Get("/schools", app.GetSchools)
			pub.Post("/schools", app.CreateSchool)
			pub.Get("/census", app.GetCenso)
			pub.Post("/census", app.CreateOrUpdateCenso)
			pub.Post("/upload", app.uploadPhoto)
		})

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

			// Fase 1 — camada analítica baseada em PostgreSQL.
			// Endpoints adicionais; não substituem sheet-metrics nem indicadores-metrics.
			protected.Get("/admin/analytics/overview", app.AdminAnalyticsOverview)

			// Fase 2A — backend analítico da Caracterização da Rede.
			// Adicionais; a UI segue consumindo sheet-metrics até a Fase 2B.
			protected.Get("/admin/analytics/caracterizacao/perfil", app.AdminAnalyticsCaracterizacaoPerfil)
			protected.Get("/admin/analytics/caracterizacao/dre", app.AdminAnalyticsCaracterizacaoDRE)
			protected.Get("/admin/analytics/caracterizacao/oferta-funcionamento", app.AdminAnalyticsCaracterizacaoOfertaFuncionamento)
			protected.Get("/admin/analytics/caracterizacao/infraestrutura-educacional", app.AdminAnalyticsCaracterizacaoInfraEducacional)

			// Frente 1 — Pessoal e Gestão Escolar + Tecnologia
			protected.Get("/admin/analytics/pessoal-gestao/estrutura", app.AdminAnalyticsPessoalEstrutura)
			protected.Get("/admin/analytics/pessoal-gestao/coordenacao", app.AdminAnalyticsPessoalCoordenacao)
			protected.Get("/admin/analytics/pessoal-gestao/quadro-pessoal", app.AdminAnalyticsPessoalQuadro)
			protected.Get("/admin/analytics/tecnologia/infraestrutura", app.AdminAnalyticsTecnologiaInfra)
			protected.Get("/admin/analytics/tecnologia/uso-pedagogico", app.AdminAnalyticsTecnologiaUso)

			// Frente 2 — Infraestrutura/Segurança + Merenda + Serviços Terceirizados.
			protected.Get("/admin/analytics/infraestrutura/condicoes", app.AdminAnalyticsInfraCondicoes)
			protected.Get("/admin/analytics/infraestrutura/seguranca", app.AdminAnalyticsInfraSeguranca)
			protected.Get("/admin/analytics/infraestrutura/energia", app.AdminAnalyticsInfraEnergia)
			protected.Get("/admin/analytics/merenda/oferta", app.AdminAnalyticsMerendaOferta)
			protected.Get("/admin/analytics/merenda/equipamentos", app.AdminAnalyticsMerendaEquipamentos)
			protected.Get("/admin/analytics/merenda/recursos-humanos", app.AdminAnalyticsMerendaRH)
			protected.Get("/admin/analytics/merenda/condicoes-sanitarias", app.AdminAnalyticsMerendaCondicoesSanitarias)
			protected.Get("/admin/analytics/servicos-terceirizados/visao-geral", app.AdminAnalyticsServicosVisaoGeral)
			protected.Get("/admin/analytics/servicos-terceirizados/servicos-gerais", app.AdminAnalyticsServicosGerais)
			protected.Get("/admin/analytics/servicos-terceirizados/portaria", app.AdminAnalyticsServicosPortaria)
			protected.Get("/admin/analytics/servicos-terceirizados/manipuladores-alimentos", app.AdminAnalyticsServicosManipuladoresAlimentos)
			protected.Get("/admin/analytics/escolas/saude-operacional", app.AdminAnalyticsSaudeOperacionalEscolas)

			// Gestão Financeira e Governança — repasses PRODEP (PR técnico 2).
			protected.Get("/admin/analytics/financeiro-governanca/prodep", app.AdminAnalyticsFinanceiroGovernancaProdep)

			// Gestão Financeira e Governança — Governança Institucional (Censo, PR 1).
			protected.Get("/admin/analytics/financeiro-governanca/institucional", app.AdminAnalyticsFinanceiroGovernancaInstitucional)

			// Perfil dos Alunos e Resultados — IDEB 2023 (IDEB-04, lê ideb_resultados).
			protected.Get("/admin/analytics/perfil-alunos-resultados/ideb", app.AdminAnalyticsPerfilAlunosResultadosIDEB)

			// Andamento do preenchimento do censo por DRE.
			protected.Get("/admin/analytics/preenchimento/dre", app.AdminAnalyticsPreenchimentoDre)

			// Filtros globais do dashboard.
			protected.Get("/admin/analytics/filtros/opcoes", app.AdminAnalyticsFiltrosOpcoes)
		})
	})

	return mux
}
