package models

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var (
	ErrSchoolNotFound      = errors.New("escola não encontrada")
	ErrSchoolIDsRequired   = errors.New("ao menos uma escola deve ser informada")
	ErrSchoolInvalidID     = errors.New("ID de escola inválido")
	ErrSchoolBatchTooLarge = errors.New("lote de escolas excede o limite permitido")
)

const maxSchoolDREBatchSize = 1000

func normalizeSchoolIDs(ids []int) ([]int, error) {
	if len(ids) == 0 {
		return nil, ErrSchoolIDsRequired
	}
	if len(ids) > maxSchoolDREBatchSize {
		return nil, ErrSchoolBatchTooLarge
	}

	seen := make(map[int]struct{}, len(ids))
	normalized := make([]int, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return nil, fmt.Errorf("%w: %d", ErrSchoolInvalidID, id)
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, id)
	}

	if len(normalized) == 0 {
		return nil, ErrSchoolIDsRequired
	}
	return normalized, nil
}

// AssignToDRE associates one or more schools with a master DRE atomically.
// The canonical DRE name is read and locked inside the same transaction used
// to update schools, preventing stale or differently formatted DRE values from
// being persisted. If any school does not exist, the whole batch is rolled back.
func (m *SchoolModel) AssignToDRE(ctx context.Context, dreID int, schoolIDs []int) (string, int, error) {
	if dreID <= 0 {
		return "", 0, ErrDREInvalidID
	}

	ids, err := normalizeSchoolIDs(schoolIDs)
	if err != nil {
		return "", 0, err
	}
	// Acquire school row locks in a deterministic order. Concurrent admins may
	// submit the same schools in different request orders; sorting minimizes the
	// classic 1->2 / 2->1 lock inversion that can otherwise deadlock PostgreSQL.
	sort.Ints(ids)

	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", 0, err
	}
	defer func() { _ = tx.Rollback() }()

	var dreName string
	var active bool
	err = tx.QueryRowContext(ctx, `
		SELECT TRIM(nome), ativa
		FROM dres
		WHERE id = $1
		FOR SHARE`, dreID).Scan(&dreName, &active)
	if err == sql.ErrNoRows {
		return "", 0, ErrDRENotFound
	}
	if err != nil {
		return "", 0, err
	}
	if !active {
		return "", 0, ErrDREInactive
	}

	dreName = strings.TrimSpace(dreName)
	if dreName == "" {
		return "", 0, ErrDRENameRequired
	}

	stmt, err := tx.PrepareContext(ctx, `UPDATE schools SET dre = $1 WHERE id = $2`)
	if err != nil {
		return "", 0, err
	}
	defer stmt.Close()

	for _, schoolID := range ids {
		result, err := stmt.ExecContext(ctx, dreName, schoolID)
		if err != nil {
			return "", 0, err
		}
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return "", 0, err
		}
		if rowsAffected != 1 {
			return "", 0, fmt.Errorf("%w: %d", ErrSchoolNotFound, schoolID)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", 0, err
	}
	return dreName, len(ids), nil
}
