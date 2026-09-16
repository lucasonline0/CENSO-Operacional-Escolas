package models

import (
	"context"
	"database/sql"
	"sync"
)

type rowQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type schemaCapabilityKey struct {
	db         *sql.DB
	tableName  string
	columnName string
}

// schemaCapabilityCache evita round-trips repetidos ao information_schema nos
// caminhos quentes. Só respostas positivas são memorizadas: durante testes ou
// rollouts legados uma coluna ausente pode ser criada depois por migration, e
// nesse caso a próxima chamada precisa conseguir enxergar o novo schema.
var schemaCapabilityCache sync.Map

// hasColumn is used only during the rollout window between the legacy schema
// and migration 0020. Runtime identity never falls back to schools: this helper
// merely selects the write shape supported by the physical schema.
func hasColumn(ctx context.Context, q rowQuerier, tableName, columnName string) (bool, error) {
	if db, ok := q.(*sql.DB); ok {
		key := schemaCapabilityKey{db: db, tableName: tableName, columnName: columnName}
		if cached, found := schemaCapabilityCache.Load(key); found {
			return cached.(bool), nil
		}

		exists, err := queryHasColumn(ctx, q, tableName, columnName)
		if err == nil && exists {
			schemaCapabilityCache.Store(key, true)
		}
		return exists, err
	}

	// Transações são deliberadamente consultadas sem cache: elas podem estar
	// executando no meio de uma migration e precisam observar o schema da própria
	// transação.
	return queryHasColumn(ctx, q, tableName, columnName)
}

func queryHasColumn(ctx context.Context, q rowQuerier, tableName, columnName string) (bool, error) {
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
