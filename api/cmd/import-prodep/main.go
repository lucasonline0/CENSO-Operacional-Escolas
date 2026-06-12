// import-prodep importa os repasses financeiros do PRODEP a partir do CSV final
// aprovado na frente de saneamento PRODEP/base_dige
// (_local/prodep_base_dige_final/prodep_long_final.csv, não versionado) para a
// tabela prodep_repasses.
//
// Uso (a partir da pasta api/):
//
//	go run ./cmd/import-prodep --file ../_local/prodep_base_dige_final/prodep_long_final.csv --dry-run
//	go run ./cmd/import-prodep --file ../_local/prodep_base_dige_final/prodep_long_final.csv
//
// Regras invioláveis:
//   - codigo_inep_prodep é a chave de identidade e NUNCA é substituído pelo
//     INEP da sede (caso anexo). A sede vai em colunas separadas.
//   - A tabela schools NÃO é alterada: o importador apenas referencia
//     schools(id) via school_id/school_id_sede e aborta se houver id órfão.
package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
)

// Invariantes do arquivo final aprovado. O importador aborta se o CSV não
// reproduzir exatamente estes números — é uma trava de segurança contra
// importar um arquivo errado ou corrompido.
const (
	expectedRows              = 5046
	expectedINEPs             = 841
	expectedRecebidoCents     = int64(23571151078) // 235.711.510,78
	expectedReprogramadoCents = int64(8899170761)  // 88.991.707,61
)

var expectedRowsByStatus = map[string]int{
	"matched_by_inep_schools": 4476,
	"matched_by_base_dige":    540,
	"prodep_only_validado":    24,
	"anexo_vinculado_sede":    6,
}

var expectedINEPsByStatus = map[string]int{
	"matched_by_inep_schools": 746,
	"matched_by_base_dige":    90,
	"prodep_only_validado":    4,
	"anexo_vinculado_sede":    1,
}

// Cabeçalho obrigatório, na semântica esperada. A ordem das colunas no arquivo
// não importa: usamos um índice por nome.
var requiredColumns = []string{
	"codigo_inep_prodep",
	"escola_nome_prodep",
	"dre_prodep",
	"ri_prodep",
	"municipio_prodep",
	"municipio_resolvido",
	"ano",
	"categoria",
	"valor_recebido",
	"valor_reprogramado",
	"status_prestacao_contas",
	"match_status_final",
	"usar_na_carga",
	"school_id",
	"codigo_inep_sede",
	"school_id_sede",
	"fonte_match",
	"observacao_match",
}

type repasse struct {
	codigoInepProdep   string
	escolaNomeProdep   string
	dreProdep          string
	riProdep           string
	municipioProdep    string
	municipioResolvido string
	ano                int
	categoria          string
	valorRecebido      float64
	valorReprogramado  float64
	statusPrestacao    sql.NullString
	matchStatus        string
	usarNaCarga        bool
	schoolID           sql.NullInt64
	codigoInepSede     sql.NullString
	schoolIDSede       sql.NullInt64
	fonteMatch         string
	observacaoMatch    string
}

func main() {
	var (
		filePath = flag.String("file", "", "caminho do CSV PRODEP (obrigatório)")
		dryRun   = flag.Bool("dry-run", false, "valida tudo, mas não grava no banco")
		dsnFlag  = flag.String("dsn", "", "DSN PostgreSQL (opcional; default = variáveis de ambiente)")
	)
	flag.Parse()

	if err := run(*filePath, *dryRun, *dsnFlag); err != nil {
		fmt.Fprintln(os.Stderr, "ERRO:", err)
		os.Exit(1)
	}
}

func run(filePath string, dryRun bool, dsnFlag string) error {
	if filePath == "" {
		return errors.New("--file é obrigatório")
	}

	// --- Leitura e parsing do CSV ---
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("lendo arquivo: %w", err)
	}
	hash := sha256.Sum256(raw)
	sourceHash := hex.EncodeToString(hash[:])

	rows, err := parseCSV(raw)
	if err != nil {
		return err
	}

	// --- Validação das invariantes (arquivo) ---
	recCents, reprCents, inepSet, rowsByStatus, inepsByStatus, err := validateInvariants(rows)
	if err != nil {
		return err
	}

	// --- Conexão (necessária fora do dry-run; usada no dry-run quando disponível) ---
	dsn := resolveDSN(dsnFlag)
	var db *sql.DB
	if dsn != "" {
		db, err = openDB(dsn)
		if err != nil {
			if !dryRun {
				return fmt.Errorf("conectando ao banco: %w", err)
			}
			fmt.Fprintf(os.Stderr, "AVISO: dry-run sem conexão (%v) — FKs NÃO validadas.\n", err)
			db = nil
		}
		if db != nil {
			defer db.Close()
		}
	} else {
		if !dryRun {
			return errors.New("DSN não encontrado: informe --dsn ou DATABASE_URL/DB_DSN/DB_HOST no ambiente")
		}
		fmt.Fprintln(os.Stderr, "AVISO: dry-run sem DSN — FKs NÃO validadas.")
	}

	// --- Pré-checagem de FKs (antes de qualquer escrita) ---
	fkValidated := false
	if db != nil {
		if err := precheckForeignKeys(db, rows); err != nil {
			return err
		}
		fkValidated = true
	}

	// --- Gravação (pulada em dry-run) ---
	var batchID int64
	imported := false
	if !dryRun {
		batchID, err = importRows(db, rows, filepath.Base(filePath), sourceHash, recCents, reprCents)
		if err != nil {
			return err
		}
		imported = true
	}

	printSummary(summary{
		file:          filePath,
		rows:          len(rows),
		ineps:         len(inepSet),
		recCents:      recCents,
		reprCents:     reprCents,
		rowsByStatus:  rowsByStatus,
		inepsByStatus: inepsByStatus,
		dryRun:        dryRun,
		fkValidated:   fkValidated,
		imported:      imported,
		batchID:       batchID,
	})
	return nil
}

// parseCSV lê o arquivo tratando o BOM UTF-8 na primeira coluna, valida o
// cabeçalho e converte cada linha em repasse.
func parseCSV(raw []byte) ([]repasse, error) {
	r := csv.NewReader(strings.NewReader(string(raw)))
	r.FieldsPerRecord = -1 // valida manualmente contra o header

	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("lendo cabeçalho: %w", err)
	}
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\uFEFF") // remove BOM
	}

	idx := make(map[string]int, len(header))
	for i, name := range header {
		idx[strings.TrimSpace(name)] = i
	}
	var missing []string
	for _, col := range requiredColumns {
		if _, ok := idx[col]; !ok {
			missing = append(missing, col)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("colunas obrigatórias ausentes no cabeçalho: %s", strings.Join(missing, ", "))
	}

	get := func(rec []string, col string) string { return strings.TrimSpace(rec[idx[col]]) }

	var out []repasse
	line := 1
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("lendo linha %d: %w", line+1, err)
		}
		line++
		if len(rec) < len(header) {
			return nil, fmt.Errorf("linha %d: %d colunas, esperado %d", line, len(rec), len(header))
		}

		ano, err := strconv.Atoi(get(rec, "ano"))
		if err != nil {
			return nil, fmt.Errorf("linha %d: ano inválido %q", line, get(rec, "ano"))
		}
		vrec, err := parseValor(get(rec, "valor_recebido"))
		if err != nil {
			return nil, fmt.Errorf("linha %d: valor_recebido inválido: %w", line, err)
		}
		vrepr, err := parseValor(get(rec, "valor_reprogramado"))
		if err != nil {
			return nil, fmt.Errorf("linha %d: valor_reprogramado inválido: %w", line, err)
		}
		usar, err := parseBoolSim(get(rec, "usar_na_carga"))
		if err != nil {
			return nil, fmt.Errorf("linha %d: usar_na_carga inválido: %w", line, err)
		}

		out = append(out, repasse{
			codigoInepProdep:   get(rec, "codigo_inep_prodep"),
			escolaNomeProdep:   get(rec, "escola_nome_prodep"),
			dreProdep:          get(rec, "dre_prodep"),
			riProdep:           get(rec, "ri_prodep"),
			municipioProdep:    get(rec, "municipio_prodep"),
			municipioResolvido: get(rec, "municipio_resolvido"),
			ano:                ano,
			categoria:          get(rec, "categoria"),
			valorRecebido:      vrec,
			valorReprogramado:  vrepr,
			statusPrestacao:    nullString(get(rec, "status_prestacao_contas")),
			matchStatus:        get(rec, "match_status_final"), // mapeia para match_status
			usarNaCarga:        usar,
			schoolID:           nullInt(get(rec, "school_id")),
			codigoInepSede:     nullString(get(rec, "codigo_inep_sede")),
			schoolIDSede:       nullInt(get(rec, "school_id_sede")),
			fonteMatch:         get(rec, "fonte_match"),
			observacaoMatch:    get(rec, "observacao_match"),
		})
	}
	return out, nil
}

// validateInvariants confere as travas obrigatórias e retorna os agregados
// usados no resumo. Aborta no primeiro desvio.
func validateInvariants(rows []repasse) (recCents, reprCents int64, inepSet map[string]bool, rowsByStatus map[string]int, inepsByStatus map[string]map[string]bool, err error) {
	if len(rows) != expectedRows {
		return 0, 0, nil, nil, nil, fmt.Errorf("total de linhas = %d, esperado %d", len(rows), expectedRows)
	}

	inepSet = make(map[string]bool)
	rowsByStatus = make(map[string]int)
	inepsByStatus = make(map[string]map[string]bool)
	keySeen := make(map[string]bool)

	for i, r := range rows {
		if !r.usarNaCarga {
			return 0, 0, nil, nil, nil, fmt.Errorf("linha %d (INEP %s): usar_na_carga != sim", i+2, r.codigoInepProdep)
		}
		recCents += toCents(r.valorRecebido)
		reprCents += toCents(r.valorReprogramado)
		inepSet[r.codigoInepProdep] = true

		key := r.codigoInepProdep + "|" + strconv.Itoa(r.ano) + "|" + r.categoria
		if keySeen[key] {
			return 0, 0, nil, nil, nil, fmt.Errorf("duplicata em (codigo_inep_prodep, ano, categoria): %s", key)
		}
		keySeen[key] = true

		rowsByStatus[r.matchStatus]++
		if inepsByStatus[r.matchStatus] == nil {
			inepsByStatus[r.matchStatus] = make(map[string]bool)
		}
		inepsByStatus[r.matchStatus][r.codigoInepProdep] = true
	}

	if len(inepSet) != expectedINEPs {
		return 0, 0, nil, nil, nil, fmt.Errorf("INEPs distintos = %d, esperado %d", len(inepSet), expectedINEPs)
	}
	if recCents != expectedRecebidoCents {
		return 0, 0, nil, nil, nil, fmt.Errorf("total valor_recebido = %s, esperado %s",
			formatCents(recCents), formatCents(expectedRecebidoCents))
	}
	if reprCents != expectedReprogramadoCents {
		return 0, 0, nil, nil, nil, fmt.Errorf("total valor_reprogramado = %s, esperado %s",
			formatCents(reprCents), formatCents(expectedReprogramadoCents))
	}

	for status, want := range expectedRowsByStatus {
		if got := rowsByStatus[status]; got != want {
			return 0, 0, nil, nil, nil, fmt.Errorf("linhas %s = %d, esperado %d", status, got, want)
		}
	}
	for status := range rowsByStatus {
		if _, ok := expectedRowsByStatus[status]; !ok {
			return 0, 0, nil, nil, nil, fmt.Errorf("match_status inesperado: %q", status)
		}
	}
	for status, want := range expectedINEPsByStatus {
		if got := len(inepsByStatus[status]); got != want {
			return 0, 0, nil, nil, nil, fmt.Errorf("INEPs %s = %d, esperado %d", status, got, want)
		}
	}

	return recCents, reprCents, inepSet, rowsByStatus, inepsByStatus, nil
}

// precheckForeignKeys garante que todo school_id e school_id_sede não-nulo
// existe em schools(id). Aborta listando os ids ausentes, sem gravar nada.
func precheckForeignKeys(db *sql.DB, rows []repasse) error {
	existing := make(map[int64]bool)
	r, err := db.Query(`SELECT id FROM schools`)
	if err != nil {
		return fmt.Errorf("pré-checagem FK: lendo schools: %w", err)
	}
	defer r.Close()
	for r.Next() {
		var id int64
		if err := r.Scan(&id); err != nil {
			return fmt.Errorf("pré-checagem FK: scan schools: %w", err)
		}
		existing[id] = true
	}
	if err := r.Err(); err != nil {
		return fmt.Errorf("pré-checagem FK: iterando schools: %w", err)
	}

	orphans := make(map[int64]bool)
	for _, row := range rows {
		if row.schoolID.Valid && !existing[row.schoolID.Int64] {
			orphans[row.schoolID.Int64] = true
		}
		if row.schoolIDSede.Valid && !existing[row.schoolIDSede.Int64] {
			orphans[row.schoolIDSede.Int64] = true
		}
	}
	if len(orphans) > 0 {
		ids := make([]int, 0, len(orphans))
		for id := range orphans {
			ids = append(ids, int(id))
		}
		sort.Ints(ids)
		return fmt.Errorf("pré-checagem FK falhou: %d school_id ausente(s) em schools: %v — nada foi gravado", len(ids), ids)
	}
	return nil
}

// importRows grava o batch e faz upsert idempotente em uma única transação.
func importRows(db *sql.DB, rows []repasse, sourceFile, sourceHash string, recCents, reprCents int64) (int64, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, fmt.Errorf("iniciando transação: %w", err)
	}
	defer tx.Rollback() //nolint — no-op após Commit

	var batchID int64
	err = tx.QueryRow(
		`INSERT INTO prodep_import_batches
		   (source_file, source_hash, rows_imported, total_valor_recebido, total_valor_reprogramado, notes)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		sourceFile, sourceHash, len(rows),
		centsToNumeric(recCents), centsToNumeric(reprCents),
		"Carga PRODEP via cmd/import-prodep",
	).Scan(&batchID)
	if err != nil {
		return 0, fmt.Errorf("inserindo batch: %w", err)
	}

	stmt, err := tx.Prepare(`
		INSERT INTO prodep_repasses (
			codigo_inep_prodep, escola_nome_prodep, dre_prodep, ri_prodep,
			municipio_prodep, municipio_resolvido, ano, categoria,
			valor_recebido, valor_reprogramado, status_prestacao_contas,
			match_status, usar_na_carga, school_id, codigo_inep_sede,
			school_id_sede, fonte_match, observacao_match, import_batch_id, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now()
		)
		ON CONFLICT (codigo_inep_prodep, ano, categoria) DO UPDATE SET
			escola_nome_prodep      = EXCLUDED.escola_nome_prodep,
			dre_prodep              = EXCLUDED.dre_prodep,
			ri_prodep               = EXCLUDED.ri_prodep,
			municipio_prodep        = EXCLUDED.municipio_prodep,
			municipio_resolvido     = EXCLUDED.municipio_resolvido,
			valor_recebido          = EXCLUDED.valor_recebido,
			valor_reprogramado      = EXCLUDED.valor_reprogramado,
			status_prestacao_contas = EXCLUDED.status_prestacao_contas,
			match_status            = EXCLUDED.match_status,
			usar_na_carga           = EXCLUDED.usar_na_carga,
			school_id               = EXCLUDED.school_id,
			codigo_inep_sede        = EXCLUDED.codigo_inep_sede,
			school_id_sede          = EXCLUDED.school_id_sede,
			fonte_match             = EXCLUDED.fonte_match,
			observacao_match        = EXCLUDED.observacao_match,
			import_batch_id         = EXCLUDED.import_batch_id,
			updated_at              = now()
	`)
	if err != nil {
		return 0, fmt.Errorf("preparando upsert: %w", err)
	}
	defer stmt.Close()

	for i, row := range rows {
		_, err := stmt.Exec(
			row.codigoInepProdep, row.escolaNomeProdep, row.dreProdep, row.riProdep,
			row.municipioProdep, row.municipioResolvido, row.ano, row.categoria,
			centsToNumeric(toCents(row.valorRecebido)), centsToNumeric(toCents(row.valorReprogramado)),
			row.statusPrestacao, row.matchStatus, row.usarNaCarga, row.schoolID,
			row.codigoInepSede, row.schoolIDSede, row.fonteMatch, row.observacaoMatch, batchID,
		)
		if err != nil {
			return 0, fmt.Errorf("upsert linha %d (INEP %s, %d, %s): %w",
				i+2, row.codigoInepProdep, row.ano, row.categoria, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return batchID, nil
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

type summary struct {
	file          string
	rows          int
	ineps         int
	recCents      int64
	reprCents     int64
	rowsByStatus  map[string]int
	inepsByStatus map[string]map[string]bool
	dryRun        bool
	fkValidated   bool
	imported      bool
	batchID       int64
}

func printSummary(s summary) {
	order := []string{
		"matched_by_inep_schools",
		"matched_by_base_dige",
		"prodep_only_validado",
		"anexo_vinculado_sede",
	}
	fmt.Println("Arquivo:", s.file)
	fmt.Println("Linhas:", s.rows)
	fmt.Println("INEPs:", s.ineps)
	fmt.Println("Valor recebido:", formatCents(s.recCents))
	fmt.Println("Valor reprogramado:", formatCents(s.reprCents))
	fmt.Println("Status:")
	for _, st := range order {
		fmt.Printf("  %s: %d linhas / %d INEPs\n", st, s.rowsByStatus[st], len(s.inepsByStatus[st]))
	}
	fmt.Println("FK validada:", yesNo(s.fkValidated))
	fmt.Println("Dry-run:", yesNo(s.dryRun))
	fmt.Println("Importação concluída:", yesNo(s.imported))
	if s.imported {
		fmt.Println("Batch ID:", s.batchID)
	} else {
		fmt.Println("Batch ID: -")
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func parseValor(s string) (float64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	return strconv.ParseFloat(s, 64)
}

func parseBoolSim(s string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "sim", "true", "t", "1":
		return true, nil
	case "nao", "não", "false", "f", "0":
		return false, nil
	default:
		return false, fmt.Errorf("valor %q não reconhecido", s)
	}
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func nullInt(s string) sql.NullInt64 {
	if s == "" {
		return sql.NullInt64{}
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: n, Valid: true}
}

// toCents converte valor monetário em centavos inteiros, evitando drift de
// ponto flutuante na soma de validação.
func toCents(v float64) int64 {
	return int64(math.Round(v * 100))
}

// centsToNumeric devolve a string decimal (ex.: "72850.50") para gravar em
// NUMERIC(14,2) sem reintroduzir imprecisão de float.
func centsToNumeric(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	out := fmt.Sprintf("%d.%02d", cents/100, cents%100)
	if neg {
		out = "-" + out
	}
	return out
}

func formatCents(cents int64) string { return centsToNumeric(cents) }

func yesNo(b bool) string {
	if b {
		return "sim"
	}
	return "não"
}

// resolveDSN replica a resolução de DSN do servidor (cmd/api/main.go):
// --dsn > DATABASE_URL > DB_DSN > componentes DB_HOST/PORT/USER/...
func resolveDSN(dsnFlag string) string {
	loadEnv()
	if dsnFlag != "" {
		return dsnFlag
	}
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	if v := os.Getenv("DB_DSN"); v != "" {
		return v
	}
	if host := os.Getenv("DB_HOST"); host != "" {
		sslmode := os.Getenv("DB_SSLMODE")
		if sslmode == "" {
			sslmode = "disable"
		}
		return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s connect_timeout=5",
			os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"),
			os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"), sslmode)
	}
	return ""
}

// loadEnv procura um .env nos mesmos lugares que o servidor, de forma best-effort.
func loadEnv() {
	cwd, _ := os.Getwd()
	for _, p := range []string{
		".env",
		filepath.Join(cwd, ".env"),
		filepath.Join(cwd, "..", ".env"),
		filepath.Join(cwd, "..", "infra", ".env"),
	} {
		if err := godotenv.Load(p); err == nil {
			return
		}
	}
}

func openDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
