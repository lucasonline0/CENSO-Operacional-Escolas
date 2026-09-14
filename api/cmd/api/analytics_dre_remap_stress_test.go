package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"testing"
)

func seedRemapStressSchools(t *testing.T, db *sql.DB, total int) []int {
	t.Helper()
	dreID := seedIntegrationDRE(t, db, "DRE REMAP LEGADA")
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin seed remap: %v", err)
	}
	stmt, err := tx.Prepare(`
		INSERT INTO schools (nome_escola, codigo_inep, municipio, dre_id, zona)
		VALUES ($1, $2, 'BELEM', $3, 'Urbana') RETURNING id
	`)
	if err != nil {
		_ = tx.Rollback()
		t.Fatalf("prepare escolas remap: %v", err)
	}
	ids := make([]int, 0, total)
	for i := 0; i < total; i++ {
		var id int
		if err := stmt.QueryRow(
			fmt.Sprintf("Escola Remap %04d", i),
			fmt.Sprintf("157%05d", i),
			dreID,
		).Scan(&id); err != nil {
			_ = stmt.Close()
			_ = tx.Rollback()
			t.Fatalf("seed escola remap %d: %v", i, err)
		}
		ids = append(ids, id)
	}
	_ = stmt.Close()
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit escolas remap: %v", err)
	}
	return ids
}

func seedRemapStressCensuses(t *testing.T, db *sql.DB, ids []int) float64 {
	t.Helper()
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin censos remap: %v", err)
	}
	stmt, err := tx.Prepare(`
		INSERT INTO census_responses (school_id, year, status, data, created_at, updated_at)
		VALUES ($1, $2, $3, jsonb_build_object('total_alunos', $4::int), NOW(), NOW())
	`)
	if err != nil {
		_ = tx.Rollback()
		t.Fatalf("prepare censos remap: %v", err)
	}

	var totalStudents float64
	for i, id := range ids {
		status := ""
		students := 0
		switch {
		case i < 500:
			status = "completed"
			students = 100 + (i % 31)
			totalStudents += float64(students)
		case i < 750:
			status = "draft"
			students = 9999
		default:
			continue
		}
		if _, err := stmt.Exec(id, dreIntegrationYear, status, students); err != nil {
			_ = stmt.Close()
			_ = tx.Rollback()
			t.Fatalf("seed censo remap %d: %v", i, err)
		}
	}
	_ = stmt.Close()
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit censos remap: %v", err)
	}
	return totalStudents
}

func assignRemapStressBatch(t *testing.T, handler http.Handler, token string, dreID int, ids []int) {
	t.Helper()
	rr := requestDREIntegration(t, handler, token, http.MethodPost,
		fmt.Sprintf("/v1/admin/dres/%d/schools", dreID),
		map[string]any{"school_ids": ids})
	if rr.Code != http.StatusOK {
		t.Fatalf("remanejamento em lote para DRE %d: status=%d body=%s", dreID, rr.Code, rr.Body.String())
	}
}

func assertRemapStressAnalytics(
	t *testing.T,
	handler http.Handler,
	token string,
	dreID int,
	dreName string,
	wantTotal, wantCompleted, wantDraft, wantPending, wantPct int,
	wantStudents float64,
	checkFilters bool,
) {
	t.Helper()

	prePath := "/v1/admin/analytics/preenchimento/dre?year=2026&dre=" + url.QueryEscape(dreName)
	preRR := requestDREIntegration(t, handler, token, http.MethodGet, prePath, nil)
	pre := decodeDREIntegrationData[PreenchimentoDrePayload](t, preRR, http.StatusOK)
	row := findIntegrationPreenchimentoRow(t, pre, dreName)
	if row.Total != wantTotal || row.Completed != wantCompleted || row.Draft != wantDraft ||
		row.Pending != wantPending || row.CompletionPercentage != wantPct {
		t.Fatalf("preenchimento %s inconsistente: got=%+v want total=%d completed=%d draft=%d pending=%d pct=%d",
			dreName, row, wantTotal, wantCompleted, wantDraft, wantPending, wantPct)
	}

	summaryRR := requestDREIntegration(t, handler, token, http.MethodGet,
		fmt.Sprintf("/v1/admin/dres/%d/resumo?year=%d", dreID, dreIntegrationYear), nil)
	summary := decodeDREIntegrationData[DRESummaryPayload](t, summaryRR, http.StatusOK)
	if summary.TotalEscolas != wantTotal || summary.TotalAlunos != wantStudents ||
		summary.CensusAdherencePercentage != wantPct {
		t.Fatalf("resumo %s inconsistente: got=%+v want total=%d alunos=%v pct=%d",
			dreName, summary, wantTotal, wantStudents, wantPct)
	}

	if checkFilters {
		filtersPath := "/v1/admin/analytics/filtros/opcoes?year=2026&dre=" + url.QueryEscape(dreName)
		filtersRR := requestDREIntegration(t, handler, token, http.MethodGet, filtersPath, nil)
		filters := decodeDREIntegrationData[FiltrosOpcoes](t, filtersRR, http.StatusOK)
		if len(filters.Escolas) != wantTotal {
			t.Fatalf("filtros %s retornaram %d escolas; want %d", dreName, len(filters.Escolas), wantTotal)
		}
	}
}

// TestDREMasterIntegrationRemap1000Schools5Cycles executa remanejamento REAL no
// PostgreSQL por meio do endpoint de associação. São 1.000 escolas movidas de
// A -> B e B -> A em cinco ciclos, totalizando 10.000 remanejamentos efetivos
// por execução, e os analytics são consultados após cada movimento.
func TestDREMasterIntegrationRemap1000Schools5Cycles(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	_, handler, adminToken := newDREIntegrationApp(t, db)

	dreA := createDREThroughAPI(t, handler, adminToken, "DRE REMAP A")
	dreB := createDREThroughAPI(t, handler, adminToken, "DRE REMAP B")
	ids := seedRemapStressSchools(t, db, 1000)
	wantStudents := seedRemapStressCensuses(t, db, ids)

	// Estado inicial canônico em A.
	assignRemapStressBatch(t, handler, adminToken, dreA.ID, ids)
	assertRemapStressAnalytics(t, handler, adminToken, dreA.ID, dreA.Nome,
		1000, 500, 250, 250, 50, wantStudents, true)
	assertRemapStressAnalytics(t, handler, adminToken, dreB.ID, dreB.Nome,
		0, 0, 0, 0, 0, 0, false)

	for cycle := 1; cycle <= 5; cycle++ {
		assignRemapStressBatch(t, handler, adminToken, dreB.ID, ids)
		assertRemapStressAnalytics(t, handler, adminToken, dreA.ID, dreA.Nome,
			0, 0, 0, 0, 0, 0, false)
		assertRemapStressAnalytics(t, handler, adminToken, dreB.ID, dreB.Nome,
			1000, 500, 250, 250, 50, wantStudents, true)

		assignRemapStressBatch(t, handler, adminToken, dreA.ID, ids)
		assertRemapStressAnalytics(t, handler, adminToken, dreB.ID, dreB.Nome,
			0, 0, 0, 0, 0, 0, false)
		assertRemapStressAnalytics(t, handler, adminToken, dreA.ID, dreA.Nome,
			1000, 500, 250, 250, 50, wantStudents, true)

		var inA, inB int
		if err := db.QueryRow(`SELECT COUNT(*) FROM schools WHERE dre = $1`, dreA.Nome).Scan(&inA); err != nil {
			t.Fatalf("ciclo %d contar DRE A: %v", cycle, err)
		}
		if err := db.QueryRow(`SELECT COUNT(*) FROM schools WHERE dre = $1`, dreB.Nome).Scan(&inB); err != nil {
			t.Fatalf("ciclo %d contar DRE B: %v", cycle, err)
		}
		if inA != 1000 || inB != 0 {
			t.Fatalf("ciclo %d terminou inconsistente: A=%d B=%d", cycle, inA, inB)
		}
	}
}
