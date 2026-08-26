package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"censo-api/internal/models"
)

const dreIntegrationYear = 2026

type dreIntegrationEnvelope[T any] struct {
	Error   bool   `json:"error"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

func openDREIntegrationDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL não configurada; integração PostgreSQL roda no CI")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("abrir PostgreSQL de integração: %v", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatalf("ping PostgreSQL de integração: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func newDREIntegrationApp(t *testing.T, db *sql.DB) (*application, http.Handler, string) {
	t.Helper()
	t.Setenv("ADMIN_JWT_SECRET", "dre-integration-secret-0123456789-abcdefghijklmnopqrstuvwxyz")
	app := &application{
		models: models.NewModels(db),
		logger: log.New(io.Discard, "", 0),
	}
	return app, app.routes(), createTestJWT("integration-admin", RoleAdmin, "")
}

func resetDREIntegrationData(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`TRUNCATE TABLE census_responses, schools, dres RESTART IDENTITY CASCADE`); err != nil {
		t.Fatalf("limpar dados de integração: %v", err)
	}
}

func requestDREIntegration(t *testing.T, handler http.Handler, token, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("serializar request %s %s: %v", method, path, err)
		}
		reader = strings.NewReader(string(encoded))
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

func decodeDREIntegrationData[T any](t *testing.T, rr *httptest.ResponseRecorder, wantStatus int) T {
	t.Helper()
	if rr.Code != wantStatus {
		t.Fatalf("status=%d; want %d; body=%s", rr.Code, wantStatus, rr.Body.String())
	}
	var envelope dreIntegrationEnvelope[T]
	if err := json.Unmarshal(rr.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("decodificar resposta JSON: %v; body=%s", err, rr.Body.String())
	}
	if envelope.Error {
		t.Fatalf("API retornou error=true: %s", envelope.Message)
	}
	return envelope.Data
}

func createDREThroughAPI(t *testing.T, handler http.Handler, token, name string) models.DRE {
	t.Helper()
	rr := requestDREIntegration(t, handler, token, http.MethodPost, "/v1/admin/dres", map[string]any{
		"nome":           name,
		"sigla":          "INT",
		"municipio_sede": "BELEM",
		"polo":           "POLO TESTE",
		"gestor_nome":    "Gestor Integração",
		"email":          "integracao@example.test",
		"telefone":       "91999999999",
	})
	return decodeDREIntegrationData[models.DRE](t, rr, http.StatusCreated)
}

func seedIntegrationSchool(t *testing.T, db *sql.DB, inep, name, dre string) int {
	t.Helper()
	var id int
	err := db.QueryRow(`
		INSERT INTO schools (nome_escola, codigo_inep, municipio, dre, zona)
		VALUES ($1, $2, 'BELEM', $3, 'Urbana')
		RETURNING id
	`, name, inep, dre).Scan(&id)
	if err != nil {
		t.Fatalf("inserir escola %s: %v", inep, err)
	}
	return id
}

func seedIntegrationCensus(t *testing.T, db *sql.DB, schoolID int, status string, totalStudents int) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO census_responses (school_id, year, status, data, created_at, updated_at)
		VALUES ($1, $2, $3, jsonb_build_object('total_alunos', $4), NOW(), NOW())
	`, schoolID, dreIntegrationYear, status, totalStudents)
	if err != nil {
		t.Fatalf("inserir censo da escola %d: %v", schoolID, err)
	}
}

func findIntegrationPreenchimentoRow(t *testing.T, payload PreenchimentoDrePayload, dre string) PreenchimentoDreRow {
	t.Helper()
	for _, row := range payload.DREs {
		if strings.EqualFold(strings.TrimSpace(row.DRE), strings.TrimSpace(dre)) {
			return row
		}
	}
	t.Fatalf("DRE %q não encontrada em preenchimento: %+v", dre, payload.DREs)
	return PreenchimentoDreRow{}
}

func containsIntegrationString(items []string, want string) bool {
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item), strings.TrimSpace(want)) {
			return true
		}
	}
	return false
}

func schoolIDsFromOptions(items []FiltrosEscolaItem) map[int]bool {
	out := make(map[int]bool, len(items))
	for _, item := range items {
		out[item.SchoolID] = true
	}
	return out
}

// TestDREMasterIntegrationFlow reproduz o fluxo de aceite da #190 usando
// PostgreSQL real e o roteador HTTP completo, incluindo autenticação JWT.
func TestDREMasterIntegrationFlow(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	_, handler, adminToken := newDREIntegrationApp(t, db)

	dreA := createDREThroughAPI(t, handler, adminToken, "DRE INTEGRACAO A")
	if dreA.ID <= 0 || dreA.Nome != "DRE INTEGRACAO A" || !dreA.Ativa {
		t.Fatalf("DRE criada inválida: %+v", dreA)
	}

	// A DRE mestre precisa aparecer imediatamente nos filtros, mesmo sem escolas.
	filtersRR := requestDREIntegration(t, handler, adminToken, http.MethodGet,
		"/v1/admin/analytics/filtros/opcoes?year=2026", nil)
	filters := decodeDREIntegrationData[FiltrosOpcoes](t, filtersRR, http.StatusOK)
	if !containsIntegrationString(filters.DREs, dreA.Nome) {
		t.Fatalf("DRE ativa recém-criada não apareceu nos filtros: %+v", filters.DREs)
	}

	emptyPath := "/v1/admin/analytics/preenchimento/dre?year=2026&dre=" + url.QueryEscape(dreA.Nome)
	emptyRR := requestDREIntegration(t, handler, adminToken, http.MethodGet, emptyPath, nil)
	emptyPayload := decodeDREIntegrationData[PreenchimentoDrePayload](t, emptyRR, http.StatusOK)
	emptyRow := findIntegrationPreenchimentoRow(t, emptyPayload, dreA.Nome)
	if emptyRow.Total != 0 || emptyRow.Completed != 0 || emptyRow.Draft != 0 || emptyRow.Pending != 0 || emptyRow.CompletionPercentage != 0 {
		t.Fatalf("DRE sem escolas deve estar zerada: %+v", emptyRow)
	}

	school1 := seedIntegrationSchool(t, db, "15900001", "Escola Integração 1", "DRE LEGADA")
	school2 := seedIntegrationSchool(t, db, "15900002", "Escola Integração 2", "DRE LEGADA")
	controlSchool := seedIntegrationSchool(t, db, "15900003", "Escola Controle", "DRE CONTROLE")

	assignRR := requestDREIntegration(t, handler, adminToken, http.MethodPost,
		fmt.Sprintf("/v1/admin/dres/%d/schools", dreA.ID),
		map[string]any{"school_ids": []int{school2, school1}})
	if assignRR.Code != http.StatusOK {
		t.Fatalf("associação em lote status=%d; body=%s", assignRR.Code, assignRR.Body.String())
	}

	var assignedCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schools WHERE UPPER(TRIM(dre)) = UPPER(TRIM($1))`, dreA.Nome).Scan(&assignedCount); err != nil {
		t.Fatalf("contar escolas associadas: %v", err)
	}
	if assignedCount != 2 {
		t.Fatalf("associação persistida=%d escolas; want 2", assignedCount)
	}

	seedIntegrationCensus(t, db, school1, "completed", 321)
	seedIntegrationCensus(t, db, school2, "draft", 999)
	seedIntegrationCensus(t, db, controlSchool, "completed", 777)

	// O filtro pela DRE nova deve restringir escolas e não vazar a escola controle.
	filteredPath := "/v1/admin/analytics/filtros/opcoes?year=2026&dre=" + url.QueryEscape(dreA.Nome)
	filteredRR := requestDREIntegration(t, handler, adminToken, http.MethodGet, filteredPath, nil)
	filtered := decodeDREIntegrationData[FiltrosOpcoes](t, filteredRR, http.StatusOK)
	filteredIDs := schoolIDsFromOptions(filtered.Escolas)
	if len(filteredIDs) != 2 || !filteredIDs[school1] || !filteredIDs[school2] || filteredIDs[controlSchool] {
		t.Fatalf("filtro DRE retornou escolas incorretas: %+v", filtered.Escolas)
	}

	preRR := requestDREIntegration(t, handler, adminToken, http.MethodGet, emptyPath, nil)
	pre := decodeDREIntegrationData[PreenchimentoDrePayload](t, preRR, http.StatusOK)
	row := findIntegrationPreenchimentoRow(t, pre, dreA.Nome)
	if row.Total != 2 || row.Completed != 1 || row.Draft != 1 || row.Pending != 0 || row.CompletionPercentage != 50 {
		t.Fatalf("preenchimento após associação inconsistente: %+v", row)
	}

	summaryRR := requestDREIntegration(t, handler, adminToken, http.MethodGet,
		fmt.Sprintf("/v1/admin/dres/%d/resumo?year=%d", dreA.ID, dreIntegrationYear), nil)
	summary := decodeDREIntegrationData[DRESummaryPayload](t, summaryRR, http.StatusOK)
	if summary.TotalEscolas != 2 || summary.TotalAlunos != 321 || summary.CensusAdherencePercentage != 50 {
		t.Fatalf("resumo após associação inconsistente: %+v", summary)
	}

	// O escopo role=dre precisa impor a DRE do token mesmo sem query param.
	dreToken := createTestJWT("integration-dre", RoleDRE, dreA.Nome)
	scopedRR := requestDREIntegration(t, handler, dreToken, http.MethodGet,
		"/v1/admin/analytics/preenchimento/dre?year=2026", nil)
	scoped := decodeDREIntegrationData[PreenchimentoDrePayload](t, scopedRR, http.StatusOK)
	if len(scoped.DREs) != 1 || !strings.EqualFold(scoped.DREs[0].DRE, dreA.Nome) {
		t.Fatalf("escopo DRE vazou dados de outra DRE: %+v", scoped.DREs)
	}

	scopedFiltersRR := requestDREIntegration(t, handler, dreToken, http.MethodGet,
		"/v1/admin/analytics/filtros/opcoes?year=2026", nil)
	scopedFilters := decodeDREIntegrationData[FiltrosOpcoes](t, scopedFiltersRR, http.StatusOK)
	if len(scopedFilters.DREs) != 1 || !strings.EqualFold(scopedFilters.DREs[0], dreA.Nome) {
		t.Fatalf("opções de DRE não respeitaram autorização: %+v", scopedFilters.DREs)
	}

	// Remanejamento deve refletir imediatamente nos dois lados dos analytics.
	dreB := createDREThroughAPI(t, handler, adminToken, "DRE INTEGRACAO B")
	moveRR := requestDREIntegration(t, handler, adminToken, http.MethodPatch,
		fmt.Sprintf("/v1/admin/schools/%d/dre", school2), map[string]any{"dre_id": dreB.ID})
	if moveRR.Code != http.StatusOK {
		t.Fatalf("remanejamento status=%d; body=%s", moveRR.Code, moveRR.Body.String())
	}

	summaryARR := requestDREIntegration(t, handler, adminToken, http.MethodGet,
		fmt.Sprintf("/v1/admin/dres/%d/resumo?year=%d", dreA.ID, dreIntegrationYear), nil)
	summaryA := decodeDREIntegrationData[DRESummaryPayload](t, summaryARR, http.StatusOK)
	if summaryA.TotalEscolas != 1 || summaryA.TotalAlunos != 321 || summaryA.CensusAdherencePercentage != 100 {
		t.Fatalf("resumo origem após remanejamento inconsistente: %+v", summaryA)
	}

	summaryBRR := requestDREIntegration(t, handler, adminToken, http.MethodGet,
		fmt.Sprintf("/v1/admin/dres/%d/resumo?year=%d", dreB.ID, dreIntegrationYear), nil)
	summaryB := decodeDREIntegrationData[DRESummaryPayload](t, summaryBRR, http.StatusOK)
	if summaryB.TotalEscolas != 1 || summaryB.TotalAlunos != 0 || summaryB.CensusAdherencePercentage != 0 {
		t.Fatalf("resumo destino após remanejamento inconsistente: %+v", summaryB)
	}

	filteredAfterRR := requestDREIntegration(t, handler, adminToken, http.MethodGet, filteredPath, nil)
	filteredAfter := decodeDREIntegrationData[FiltrosOpcoes](t, filteredAfterRR, http.StatusOK)
	idsAfter := schoolIDsFromOptions(filteredAfter.Escolas)
	if len(idsAfter) != 1 || !idsAfter[school1] || idsAfter[school2] {
		t.Fatalf("filtros não refletiram remanejamento: %+v", filteredAfter.Escolas)
	}
}

// TestDREMasterIntegrationBatch1000Schools cobre o limite máximo permitido pelo
// endpoint de associação em lote usando uma transação real e analytics reais.
func TestDREMasterIntegrationBatch1000Schools(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	_, handler, adminToken := newDREIntegrationApp(t, db)
	dre := createDREThroughAPI(t, handler, adminToken, "DRE STRESS 1000")

	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin seed stress: %v", err)
	}
	stmt, err := tx.Prepare(`
		INSERT INTO schools (nome_escola, codigo_inep, municipio, dre, zona)
		VALUES ($1, $2, 'BELEM', 'DRE LEGADA STRESS', 'Urbana') RETURNING id
	`)
	if err != nil {
		_ = tx.Rollback()
		t.Fatalf("prepare escolas stress: %v", err)
	}
	ids := make([]int, 0, 1000)
	for i := 0; i < 1000; i++ {
		var id int
		if err := stmt.QueryRow(fmt.Sprintf("Escola Stress %04d", i), fmt.Sprintf("158%05d", i)).Scan(&id); err != nil {
			_ = stmt.Close()
			_ = tx.Rollback()
			t.Fatalf("seed escola stress %d: %v", i, err)
		}
		ids = append(ids, id)
	}
	_ = stmt.Close()
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit escolas stress: %v", err)
	}

	assignRR := requestDREIntegration(t, handler, adminToken, http.MethodPost,
		fmt.Sprintf("/v1/admin/dres/%d/schools", dre.ID), map[string]any{"school_ids": ids})
	if assignRR.Code != http.StatusOK {
		t.Fatalf("associação de 1000 escolas status=%d; body=%s", assignRR.Code, assignRR.Body.String())
	}

	censusTx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin censos stress: %v", err)
	}
	censusStmt, err := censusTx.Prepare(`
		INSERT INTO census_responses (school_id, year, status, data, created_at, updated_at)
		VALUES ($1, $2, $3, jsonb_build_object('total_alunos', $4), NOW(), NOW())
	`)
	if err != nil {
		_ = censusTx.Rollback()
		t.Fatalf("prepare censos stress: %v", err)
	}
	wantStudents := 0
	for i, id := range ids {
		status := ""
		students := 0
		switch {
		case i < 400:
			status = "completed"
			students = i + 1
			wantStudents += students
		case i < 700:
			status = "draft"
			students = 9999
		default:
			continue
		}
		if _, err := censusStmt.Exec(id, dreIntegrationYear, status, students); err != nil {
			_ = censusStmt.Close()
			_ = censusTx.Rollback()
			t.Fatalf("seed censo stress %d: %v", i, err)
		}
	}
	_ = censusStmt.Close()
	if err := censusTx.Commit(); err != nil {
		t.Fatalf("commit censos stress: %v", err)
	}

	prePath := "/v1/admin/analytics/preenchimento/dre?year=2026&dre=" + url.QueryEscape(dre.Nome)
	preRR := requestDREIntegration(t, handler, adminToken, http.MethodGet, prePath, nil)
	pre := decodeDREIntegrationData[PreenchimentoDrePayload](t, preRR, http.StatusOK)
	row := findIntegrationPreenchimentoRow(t, pre, dre.Nome)
	if row.Total != 1000 || row.Completed != 400 || row.Draft != 300 || row.Pending != 300 || row.CompletionPercentage != 40 {
		t.Fatalf("analytics do lote de 1000 inconsistente: %+v", row)
	}

	summaryRR := requestDREIntegration(t, handler, adminToken, http.MethodGet,
		fmt.Sprintf("/v1/admin/dres/%d/resumo?year=%d", dre.ID, dreIntegrationYear), nil)
	summary := decodeDREIntegrationData[DRESummaryPayload](t, summaryRR, http.StatusOK)
	if summary.TotalEscolas != 1000 || summary.TotalAlunos != float64(wantStudents) || summary.CensusAdherencePercentage != 40 {
		t.Fatalf("resumo do lote de 1000 inconsistente: %+v; want alunos=%d", summary, wantStudents)
	}

	var canonicalized int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schools WHERE dre = $1`, dre.Nome).Scan(&canonicalized); err != nil {
		t.Fatalf("contar canonicalização stress: %v", err)
	}
	if canonicalized != 1000 {
		t.Fatalf("canonicalização persistida em %d/1000 escolas", canonicalized)
	}
}

// TestDREMasterIntegrationProperties50000Scenarios estressa invariantes de
// associação/remanejamento em 50 mil cenários determinísticos. O teste modela
// a transferência de escolas completed/draft/pending entre duas DREs e garante
// conservação das contagens e percentuais válidos nos dois lados.
func TestDREMasterIntegrationProperties50000Scenarios(t *testing.T) {
	rng := rand.New(rand.NewSource(190))
	for scenario := 0; scenario < 50000; scenario++ {
		total := rng.Intn(5001)
		completed := 0
		draft := 0
		if total > 0 {
			completed = rng.Intn(total + 1)
			draft = rng.Intn(total - completed + 1)
		}
		pending := total - completed - draft

		moveCompleted := 0
		moveDraft := 0
		movePending := 0
		if completed > 0 {
			moveCompleted = rng.Intn(completed + 1)
		}
		if draft > 0 {
			moveDraft = rng.Intn(draft + 1)
		}
		if pending > 0 {
			movePending = rng.Intn(pending + 1)
		}
		moved := moveCompleted + moveDraft + movePending

		before := buildPreenchimentoDreRow("A", total, completed, draft)
		afterA := buildPreenchimentoDreRow("A", total-moved, completed-moveCompleted, draft-moveDraft)
		afterB := buildPreenchimentoDreRow("B", moved, moveCompleted, moveDraft)

		if before.Completed+before.Draft+before.Pending != total {
			t.Fatalf("scenario %d: estado inicial não particiona total: %+v", scenario, before)
		}
		if afterA.Total+afterB.Total != before.Total ||
			afterA.Completed+afterB.Completed != before.Completed ||
			afterA.Draft+afterB.Draft != before.Draft ||
			afterA.Pending+afterB.Pending != before.Pending {
			t.Fatalf("scenario %d: remanejamento perdeu/duplicou contagens: before=%+v A=%+v B=%+v", scenario, before, afterA, afterB)
		}
		for _, row := range []PreenchimentoDreRow{before, afterA, afterB} {
			if row.Total < 0 || row.Completed < 0 || row.Draft < 0 || row.Pending < 0 {
				t.Fatalf("scenario %d: contagem negativa: %+v", scenario, row)
			}
			if row.CompletionPercentage < 0 || row.CompletionPercentage > 100 {
				t.Fatalf("scenario %d: percentual fora de 0..100: %+v", scenario, row)
			}
			want := 0
			if row.Total > 0 {
				want = int(math.Round(float64(row.Completed) / float64(row.Total) * 100))
			}
			if row.CompletionPercentage != want {
				t.Fatalf("scenario %d: percentual=%d; want=%d; row=%+v", scenario, row.CompletionPercentage, want, row)
			}
		}
	}
}
