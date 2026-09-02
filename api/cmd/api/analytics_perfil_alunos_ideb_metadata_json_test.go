package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestIdebMetadadosMarshalJSON_RemoveAnoLegado2023(t *testing.T) {
	m := IdebMetadados{
		FonteArquivo:      "ideb_2025_iniciais_finais_medio.xlsx",
		FonteMetodologica: "https://download.inep.gov.br/ideb/nota_informativa_ideb_2025.pdf",
		Grao:              "INEP × etapa × ano",
		Observacoes: []string{
			"A base não contém metas IDEB 2023; não há indicador de atingimento de meta.",
		},
	}

	b, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal metadata: %v", err)
	}
	got := string(b)
	if strings.Contains(got, "IDEB 2023") {
		t.Fatalf("metadata multi-ano não pode expor ano legado: %s", got)
	}
	if !strings.Contains(got, "A base consultada não contém metas IDEB") {
		t.Fatalf("observação normalizada ausente: %s", got)
	}
}
