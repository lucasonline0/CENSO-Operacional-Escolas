package main

// =====================================================================
// Catálogo de relatórios gerenciais por aba
// =====================================================================
// Camada extensível: cada relatório exportável é descrito por uma
// ReportDefinition e registrado em reportsCatalog. A rota
// GET /v1/admin/reports/{report_id} resolve o report_id contra este
// catálogo (404 quando não existe) e o handler dispara o builder
// específico do relatório.
//
// Nesta primeira fase só existe o relatório piloto
// "censo-preenchimento-escolas". Novos relatórios (saúde operacional,
// infraestrutura, merenda, tecnologia, ...) devem ser adicionados aqui
// com seu próprio builder no handler, sem alterar a rota nem o gerador
// XLSX genérico.
// =====================================================================

// reportCensoPreenchimentoID é o identificador do relatório piloto de
// acompanhamento do preenchimento do censo.
const reportCensoPreenchimentoID = "censo-preenchimento-escolas"

// reportSaudeOperacionalID é o identificador do relatório de Índice de Saúde
// Operacional por escola, que exporta todas as escolas do recorte com índice,
// criticidade, status e notas por dimensão, reaproveitando a metodologia da
// aba "Saúde Operacional".
const reportSaudeOperacionalID = "saude-operacional-escolas"

// ReportDefinition descreve os metadados de um relatório gerencial. Os
// campos são suficientes para montar o cabeçalho do XLSX (Title), nomear
// a aba (SheetName) e derivar o nome do arquivo (FileBase). A consulta e
// a montagem das linhas ficam no builder específico de cada relatório,
// mantendo o catálogo livre de dependências de banco e de excelize.
type ReportDefinition struct {
	ID          string
	Title       string
	Description string
	SheetName   string
	FileBase    string
}

// reportsCatalog é o registro de relatórios disponíveis, indexado por ID.
var reportsCatalog = map[string]ReportDefinition{
	reportCensoPreenchimentoID: {
		ID:          reportCensoPreenchimentoID,
		Title:       "Relatório de Acompanhamento do Preenchimento do Censo",
		Description: "Acompanhamento nominal do preenchimento do censo por escola, incluindo escolas ainda pendentes.",
		SheetName:   "Preenchimento Censo",
		FileBase:    "relatorio_censo_preenchimento_escolas",
	},
	reportSaudeOperacionalID: {
		ID:          reportSaudeOperacionalID,
		Title:       "Relatório de Índice de Saúde Operacional por Escola",
		Description: "Índice de Saúde Operacional por escola, com criticidade, status e notas por dimensão, para todas as escolas do recorte.",
		SheetName:   "Saude Operacional",
		FileBase:    "relatorio_saude_operacional_escolas",
	},
}

// lookupReport devolve a definição do relatório e um booleano indicando
// se ela existe no catálogo.
func lookupReport(id string) (ReportDefinition, bool) {
	def, ok := reportsCatalog[id]
	return def, ok
}
