package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

// =====================================================================
// Relatório gerencial — Índice de Saúde Operacional por escola
// =====================================================================
// Exporta, sem paginação, todas as escolas do recorte com o Índice de
// Saúde Operacional, criticidade, status e notas por dimensão. Reaproveita
// integralmente a metodologia da aba "Saúde Operacional" via
// buildSaudeOperacionalDataset — a regra de cálculo das dimensões NÃO é
// duplicada aqui.
//
// Diferenças em relação ao relatório piloto (censo-preenchimento):
//   - depende de um ano de censo específico (não existe "todos os anos");
//   - a ordenação padrão é por criticidade decrescente (mais críticas
//     primeiro), mantendo as escolas "sem_dados" ao final.
// =====================================================================

// saudeOperacionalReportColumns são os cabeçalhos do relatório, na ordem
// exigida pela especificação: colunas territoriais, identificação, métricas
// operacionais, índice/criticidade/status e, por fim, as notas por dimensão.
var saudeOperacionalReportColumns = []string{
	"Região de Integração",
	"DRE",
	"Município",
	"Zona",
	"Código INEP",
	"Escola",
	"Alunos",
	"Salas",
	"Alunos por sala",
	"Índice de Saúde",
	"Criticidade",
	"Status",
	"Infraestrutura",
	"Energia",
	"Merenda",
	"Segurança",
	"Pessoal",
	"Tecnologia",
	"Pedagógico",
	"Governança",
}

// resolveSaudeOperacionalReportYear decide o ano de censo do relatório. Ao
// contrário do relatório de preenchimento (Year = 0 ⇒ todos os anos), a Saúde
// Operacional depende de um ano específico: quando o filtro de ano está ausente
// ou inválido (Year = 0), usa o ano padrão do endpoint analítico (ano corrente),
// preservando o comportamento da aba "Saúde Operacional".
func resolveSaudeOperacionalReportYear(f reportFilters, now time.Time) int {
	if f.Year > 0 {
		return f.Year
	}
	return now.Year()
}

// saudeOperacionalStatusLabel traduz o status técnico do payload analítico
// ("saudavel", "atencao", "critica", "sem_dados") para um rótulo legível na
// coluna Status do XLSX. Não altera o payload público — é apresentação.
func saudeOperacionalStatusLabel(status string) string {
	switch status {
	case "saudavel":
		return "Saudável"
	case "atencao":
		return "Atenção"
	case "critica":
		return "Crítica"
	default:
		return "Sem dados"
	}
}

// reportRegiaoSQL carrega o mapa município → Região de Integração a partir de
// reg_integracao. A chave usa UPPER(TRIM(municipio)) para casar com schools.
// municipio do mesmo jeito que os demais endpoints (sem unaccent nesta etapa).
const reportRegiaoSQL = `
	SELECT UPPER(TRIM(municipio)) AS municipio, COALESCE(regiao_de_integracao, '') AS regiao
	FROM reg_integracao
`

// loadRegiaoPorMunicipio devolve o mapa município (normalizado) → Região de
// Integração, usado para preencher a coluna territorial do relatório sem alterar
// o payload da Saúde Operacional (que não expõe a região).
func (app *application) loadRegiaoPorMunicipio(ctx context.Context) (map[string]string, error) {
	rows, err := app.models.Schools.DB.QueryContext(ctx, reportRegiaoSQL)
	if err != nil {
		return nil, fmt.Errorf("consultar regiões de integração: %w", err)
	}
	defer rows.Close()

	out := make(map[string]string)
	for rows.Next() {
		var municipio, regiao string
		if err := rows.Scan(&municipio, &regiao); err != nil {
			return nil, fmt.Errorf("ler região de integração: %w", err)
		}
		if _, ok := out[municipio]; !ok {
			out[municipio] = regiao
		}
	}
	return out, rows.Err()
}

// normalizeReportMunicipio normaliza o município para casar com a chave de
// reportRegiaoSQL (UPPER(TRIM(...))).
func normalizeReportMunicipio(municipio string) string {
	return strings.ToUpper(strings.TrimSpace(municipio))
}

// reportCriticidadeValue extrai a criticidade comparável de uma escola. Escolas
// pontuadas sempre possuem criticidade; o valor sentinela negativo só protege
// contra um nil inesperado, jogando-o para o fim do grupo de pontuadas.
func reportCriticidadeValue(e SaudeOperacionalEscola) float64 {
	if e.Criticidade == nil {
		return -1
	}
	return *e.Criticidade
}

// reportINEPValue devolve o código INEP da escola (vazio quando ausente), usado
// como critério final e estável de desempate.
func reportINEPValue(e SaudeOperacionalEscola) string {
	if e.CodigoINEP == nil {
		return ""
	}
	return *e.CodigoINEP
}

// lessSaudeOperacionalReport ordena as escolas do relatório: escolas "sem_dados"
// vão para o final; entre as pontuadas, criticidade decrescente (mais críticas
// primeiro); empates por DRE, Município, Escola e Código INEP (texto case/acento
// insensível). A ordenação é determinística.
func lessSaudeOperacionalReport(a, b SaudeOperacionalEscola) bool {
	aSemDados := a.Status == "sem_dados"
	bSemDados := b.Status == "sem_dados"
	if aSemDados != bSemDados {
		// não-sem_dados vem antes.
		return !aSemDados
	}

	if !aSemDados {
		ac := reportCriticidadeValue(a)
		bc := reportCriticidadeValue(b)
		if ac != bc {
			return ac > bc
		}
	}

	if c := strings.Compare(normalizeSaudeSearch(a.DRE), normalizeSaudeSearch(b.DRE)); c != 0 {
		return c < 0
	}
	if c := strings.Compare(normalizeSaudeSearch(a.Municipio), normalizeSaudeSearch(b.Municipio)); c != 0 {
		return c < 0
	}
	if c := strings.Compare(normalizeSaudeSearch(a.Escola), normalizeSaudeSearch(b.Escola)); c != 0 {
		return c < 0
	}
	return reportINEPValue(a) < reportINEPValue(b)
}

// sortSaudeOperacionalReport ordena uma cópia das escolas pela ordem do
// relatório (ver lessSaudeOperacionalReport), sem alterar o slice de origem.
func sortSaudeOperacionalReport(escolas []SaudeOperacionalEscola) []SaudeOperacionalEscola {
	sorted := append([]SaudeOperacionalEscola(nil), escolas...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return lessSaudeOperacionalReport(sorted[i], sorted[j])
	})
	return sorted
}

// optFloatCell devolve a célula de um número opcional: célula vazia quando nil,
// caso contrário o próprio valor (já arredondado pela metodologia).
func optFloatCell(v *float64) any {
	if v == nil {
		return ""
	}
	return *v
}

// optIntCell devolve a célula de um inteiro opcional: vazia quando nil.
func optIntCell(v *int) any {
	if v == nil {
		return ""
	}
	return *v
}

// optStringCell devolve a célula de uma string opcional: vazia quando nil.
func optStringCell(v *string) any {
	if v == nil {
		return ""
	}
	return *v
}

// buildSaudeOperacionalReportData monta o reportData do relatório de Saúde
// Operacional: carrega o dataset base (todas as escolas do recorte, no ano
// resolvido), resolve a Região de Integração por município, ordena por
// criticidade decrescente e projeta as colunas do XLSX. Não pagina.
func (app *application) buildSaudeOperacionalReportData(ctx context.Context, def ReportDefinition, f reportFilters) (reportData, error) {
	soFilters := saudeOperacionalFilters{
		DRE:              f.DRE,
		Municipio:        f.Municipio,
		Zona:             f.Zona,
		RegiaoIntegracao: f.RegiaoIntegracao,
	}

	escolas, _, err := app.buildSaudeOperacionalDataset(ctx, f.Year, soFilters)
	if err != nil {
		return reportData{}, err
	}

	regiaoPorMunicipio, err := app.loadRegiaoPorMunicipio(ctx)
	if err != nil {
		return reportData{}, err
	}

	sorted := sortSaudeOperacionalReport(escolas)

	rows := make([][]any, 0, len(sorted))
	for _, e := range sorted {
		regiao := regiaoPorMunicipio[normalizeReportMunicipio(e.Municipio)]
		rows = append(rows, []any{
			regiao,
			e.DRE,
			e.Municipio,
			optStringCell(e.Zona),
			optStringCell(e.CodigoINEP),
			e.Escola,
			optIntCell(e.TotalAlunos),
			optIntCell(e.SalasAula),
			optFloatCell(e.AlunosPorSala),
			optFloatCell(e.Saude),
			optFloatCell(e.Criticidade),
			saudeOperacionalStatusLabel(e.Status),
			optFloatCell(e.Dimensoes.Infraestrutura),
			optFloatCell(e.Dimensoes.Energia),
			optFloatCell(e.Dimensoes.Merenda),
			optFloatCell(e.Dimensoes.Seguranca),
			optFloatCell(e.Dimensoes.Pessoal),
			optFloatCell(e.Dimensoes.Tecnologia),
			optFloatCell(e.Dimensoes.Pedagogico),
			optFloatCell(e.Dimensoes.Governanca),
		})
	}

	return reportData{
		Title:       def.Title,
		SheetName:   def.SheetName,
		FiltersLine: f.describe(),
		Headers:     saudeOperacionalReportColumns,
		Rows:        rows,
	}, nil
}
