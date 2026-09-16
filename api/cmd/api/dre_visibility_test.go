package main

import (
	"testing"
)

func TestIsInvalidLegacyDRE(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"exact legacy", "02 URE - Cametá", true},
		{"screenshot variant", "02A URE - CAMETA", true},
		{"ordinal variant", "02ª URE - Cametá", true},
		{"single digit variant", "2A URE - Cameta", true},
		{"lowercase", "02a ure - cameta", true},
		{"extra whitespace", "  02A   URE   -   CAMETA  ", true},
		{"en dash", "02A URE – Cametá", true},
		{"em dash", "02A URE — Cameta", true},

		{"different number", "01A URE - CAMETA", false},
		{"different city", "02A URE - Belém", false},
		{"missing URE", "02A - CAMETA", false},
		{"only city", "CAMETA", false},
		{"empty", "", false},
		{"real DRE", "DRE Centro", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isInvalidLegacyDRE(tt.input)
			if result != tt.expected {
				t.Errorf("isInvalidLegacyDRE(%q) = %v, expected %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestFilterOutInvalidDREs(t *testing.T) {
	input := []string{
		"02 URE - Cametá",
		"02A URE - CAMETA",
		"02ª URE – Cametá",
		"DRE Centro",
		"DRE Norte",
	}
	expected := []string{"DRE Centro", "DRE Norte"}

	result := filterOutInvalidDREs(input)
	if len(result) != len(expected) {
		t.Fatalf("filterOutInvalidDREs(%v) returned %d items, expected %d: %v", input, len(result), len(expected), result)
	}
	for i, value := range result {
		if value != expected[i] {
			t.Fatalf("filterOutInvalidDREs(%v) = %v, expected %v", input, result, expected)
		}
	}
}
