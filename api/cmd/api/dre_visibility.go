package main

import (
	"strings"
)

// isInvalidLegacyDRE checks if a DRE name matches the exact legacy invalid
// non-DRE entry '02 URE - Cametá', tolerating case-insensitivity, extra
// whitespace, CAMETA spelling variant, and en/em dashes (– / —).
func isInvalidLegacyDRE(name string) bool {
	if name == "" {
		return false
	}

	// Normalize: lowercase, collapse whitespace, replace dashes
	normalized := strings.ToLower(strings.TrimSpace(name))

	// Replace en-dash (–) and em-dash (—) with hyphen-minus (-)
	replacer := strings.NewReplacer("–", "-", "—", "-")
	normalized = replacer.Replace(normalized)

	// Collapse multiple spaces/whitespace into single space
	parts := strings.Fields(normalized)
	normalized = strings.Join(parts, " ")

	// Accept both "cametá" and "cameta" spellings
	return normalized == "02 ure - cametá" || normalized == "02 ure - cameta"
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

