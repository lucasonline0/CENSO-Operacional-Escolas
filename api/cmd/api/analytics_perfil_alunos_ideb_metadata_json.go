package main

import (
	"encoding/json"
	"strings"
)

// MarshalJSON normaliza observações legadas do metadata IDEB antes de expor o
// payload. A implementação original nasceu com a série 2023 e uma observação
// ainda carregava o ano fixo; em consultas 2025 isso produziria metadata
// contraditório mesmo com fonte/arquivo já dinâmicos.
func (m IdebMetadados) MarshalJSON() ([]byte, error) {
	type alias IdebMetadados

	out := alias(m)
	out.Observacoes = append([]string(nil), m.Observacoes...)
	for i, observacao := range out.Observacoes {
		out.Observacoes[i] = strings.ReplaceAll(
			observacao,
			"A base não contém metas IDEB 2023",
			"A base consultada não contém metas IDEB",
		)
	}

	return json.Marshal(out)
}
