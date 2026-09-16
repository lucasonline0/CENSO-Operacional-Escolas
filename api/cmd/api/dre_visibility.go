package main

import (
	"regexp"
	"strings"
)

var invalidLegacyURECametaPattern = regexp.MustCompile(`^0?2(?:a|ª)?\s+ure\s*-\s*cameta$`)

// isInvalidLegacyDRE identifica o registro legado de URE que foi promovido
// incorretamente para a entidade mestre de DREs. O dado existe em formatos
// históricos diferentes (02, 02A/02ª, Cameta/Cametá, tipos de hífen e caixa).
func isInvalidLegacyDRE(name string) bool {
	if strings.TrimSpace(name) == "" {
		return false
	}

	normalized := strings.ToLower(strings.TrimSpace(name))
	normalized = strings.NewReplacer(
		"–", "-",
		"—", "-",
		"á", "a",
	).Replace(normalized)
	normalized = strings.Join(strings.Fields(normalized), " ")

	return invalidLegacyURECametaPattern.MatchString(normalized)
}

// filterOutInvalidDREs removes DRE entries that match the legacy invalid
// non-DRE pattern.
func filterOutInvalidDREs(dres []string) []string {
	if len(dres) == 0 {
		return dres
	}
	result := make([]string, 0, len(dres))
	for _, dre := range dres {
		if !isInvalidLegacyDRE(dre) {
			result = append(result, dre)
		}
	}
	return result
}
