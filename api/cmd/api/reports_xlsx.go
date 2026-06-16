package main

import (
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

// =====================================================================
// Gerador XLSX genérico de relatórios
// =====================================================================
// Recebe um reportData (título, filtros, cabeçalhos e linhas já prontos
// pelo builder do relatório) e produz um *excelize.File com o layout
// padrão da primeira fase:
//
//   Linha 1: título do relatório (negrito, mesclado sobre as colunas)
//   Linha 2: filtros aplicados
//   Linha 3: em branco
//   Linha 4: cabeçalhos (negrito, painel congelado abaixo)
//   Linha 5+: dados
//
// Sem design avançado: negrito no cabeçalho, freeze pane, largura básica
// das colunas e nome de aba amigável. Reaproveita a dependência já
// existente github.com/xuri/excelize/v2 (nenhuma dependência nova).
// =====================================================================

// reportData é o contrato neutro entre os builders de relatório e o
// gerador XLSX. As células de Rows podem ser string, int, float64 ou
// já-formatadas (datas chegam como string no padrão pt-BR).
type reportData struct {
	Title       string
	SheetName   string
	FiltersLine string
	Headers     []string
	Rows        [][]any
}

// dataInicialRow é a primeira linha de dados (linha 5; cabeçalho na 4).
const (
	reportHeaderRow = 4
	reportDataRow   = 5
)

// writeReportXLSX monta o arquivo XLSX a partir do reportData. Nunca
// pagina: escreve todas as linhas recebidas.
func writeReportXLSX(rd reportData) (*excelize.File, error) {
	f := excelize.NewFile()

	sheet := strings.TrimSpace(rd.SheetName)
	if sheet == "" {
		sheet = "Relatório"
	}
	// excelize cria "Sheet1" por padrão; renomeia para o nome amigável.
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("nomear aba: %w", err)
	}

	numCols := len(rd.Headers)
	if numCols == 0 {
		numCols = 1
	}
	lastColName, err := excelize.ColumnNumberToName(numCols)
	if err != nil {
		return nil, fmt.Errorf("calcular última coluna: %w", err)
	}

	// Título (linha 1) e filtros (linha 2).
	if err := f.SetCellValue(sheet, "A1", rd.Title); err != nil {
		return nil, err
	}
	if err := f.SetCellValue(sheet, "A2", rd.FiltersLine); err != nil {
		return nil, err
	}
	// Mescla o título sobre as colunas do relatório para ficar legível.
	if numCols > 1 {
		if err := f.MergeCell(sheet, "A1", lastColName+"1"); err != nil {
			return nil, err
		}
	}

	// Estilos: título em negrito maior, cabeçalho em negrito.
	titleStyle, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 14},
	})
	if err != nil {
		return nil, err
	}
	headerStyle, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
	})
	if err != nil {
		return nil, err
	}
	if err := f.SetCellStyle(sheet, "A1", "A1", titleStyle); err != nil {
		return nil, err
	}

	// Cabeçalhos (linha 4).
	for i, h := range rd.Headers {
		cell, err := excelize.CoordinatesToCellName(i+1, reportHeaderRow)
		if err != nil {
			return nil, err
		}
		if err := f.SetCellValue(sheet, cell, h); err != nil {
			return nil, err
		}
	}
	if len(rd.Headers) > 0 {
		headerLast, _ := excelize.CoordinatesToCellName(numCols, reportHeaderRow)
		if err := f.SetCellStyle(sheet, "A4", headerLast, headerStyle); err != nil {
			return nil, err
		}
	}

	// Dados (linha 5 em diante).
	for r, row := range rd.Rows {
		for c, val := range row {
			cell, err := excelize.CoordinatesToCellName(c+1, reportDataRow+r)
			if err != nil {
				return nil, err
			}
			if err := f.SetCellValue(sheet, cell, val); err != nil {
				return nil, err
			}
		}
	}

	// Largura básica das colunas; nada sofisticado.
	if err := f.SetColWidth(sheet, "A", lastColName, 20); err != nil {
		return nil, err
	}

	// Congela o painel abaixo do cabeçalho, mantendo-o visível na rolagem.
	if err := f.SetPanes(sheet, &excelize.Panes{
		Freeze:      true,
		YSplit:      reportHeaderRow,
		TopLeftCell: "A" + fmt.Sprint(reportDataRow),
		ActivePane:  "bottomLeft",
	}); err != nil {
		return nil, err
	}

	if idx, err := f.GetSheetIndex(sheet); err == nil {
		f.SetActiveSheet(idx)
	}

	return f, nil
}

// buildReportFileName deriva um nome de arquivo seguro (sem acentos, sem
// espaços) a partir do FileBase do relatório e dos filtros aplicados.
// Sempre inclui o recorte de ano (ano específico ou "todos_anos") e, em
// seguida, os filtros territoriais presentes. Exemplos:
//
//	relatorio_censo_preenchimento_escolas_2026.xlsx
//	relatorio_censo_preenchimento_escolas_todos_anos.xlsx
//	relatorio_censo_preenchimento_escolas_2026_dre_belem.xlsx
func buildReportFileName(fileBase string, f reportFilters) string {
	parts := []string{sanitizeFileNamePart(fileBase)}

	if f.Year > 0 {
		parts = append(parts, fmt.Sprintf("%d", f.Year))
	} else {
		parts = append(parts, "todos_anos")
	}

	if f.RegiaoIntegracao != "" {
		parts = append(parts, "regiao", sanitizeFileNamePart(f.RegiaoIntegracao))
	}
	if f.DRE != "" {
		parts = append(parts, "dre", sanitizeFileNamePart(f.DRE))
	}
	if f.Municipio != "" {
		parts = append(parts, "municipio", sanitizeFileNamePart(f.Municipio))
	}
	if f.Zona != "" {
		parts = append(parts, "zona", sanitizeFileNamePart(f.Zona))
	}

	name := strings.Join(parts, "_")
	name = strings.Trim(name, "_")
	if name == "" {
		name = "relatorio"
	}
	return name + ".xlsx"
}

// accentReplacer mapeia os caracteres acentuados comuns do português para
// seus equivalentes ASCII, evitando depender de golang.org/x/text só para
// normalizar nomes de arquivo.
var accentReplacer = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c", "ñ", "n",
	"Á", "A", "À", "A", "Â", "A", "Ã", "A", "Ä", "A",
	"É", "E", "È", "E", "Ê", "E", "Ë", "E",
	"Í", "I", "Ì", "I", "Î", "I", "Ï", "I",
	"Ó", "O", "Ò", "O", "Ô", "O", "Õ", "O", "Ö", "O",
	"Ú", "U", "Ù", "U", "Û", "U", "Ü", "U",
	"Ç", "C", "Ñ", "N",
)

// sanitizeFileNamePart normaliza um trecho para uso em nome de arquivo:
// minúsculas, sem acentos, e qualquer caractere não alfanumérico vira um
// único underscore. Garante um nome seguro para o header Content-Disposition.
func sanitizeFileNamePart(s string) string {
	s = accentReplacer.Replace(strings.TrimSpace(s))
	s = strings.ToLower(s)

	var b strings.Builder
	lastUnderscore := false
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastUnderscore = false
		default:
			if !lastUnderscore {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}
	return strings.Trim(b.String(), "_")
}
