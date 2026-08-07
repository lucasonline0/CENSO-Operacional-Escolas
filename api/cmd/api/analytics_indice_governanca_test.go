package main

import (
	"strings"
	"testing"
)

func TestIndiceGovernancaSelectSQLCoalesceNullableIndicators(t *testing.T) {
	t.Parallel()

	indicators := []string{
		"conselho_escolar",
		"conselho_ativo",
		"regularizada_cee",
		"gremio_estudantil",
	}

	for _, indicator := range indicators {
		want := "COALESCE(cr.data->>'" + indicator + "' = 'Sim', false) AS " + indicator
		if !strings.Contains(indiceGovernancaSelectSQL, want) {
			t.Errorf("indiceGovernancaSelectSQL deve proteger %s contra NULL com %q", indicator, want)
		}
	}
}
