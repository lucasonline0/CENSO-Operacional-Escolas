package models

import (
	"context"
	"database/sql"
)

type rowQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// hasColumn is used only during the rollout window between the legacy schema
// and migration 0020. Runtime identity never falls back to schools: this helper
// merely selects the write shape supported by the physical schema.
func hasColumn(ctx context.Context, q rowQuerier, tableName, columnName string) (bool, error) {
	var exists bool
	err := q.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = CURRENT_SCHEMA()
			  AND table_name = $1
			  AND column_name = $2
		)`, tableName, columnName).Scan(&exists)
	return exists, err
}
