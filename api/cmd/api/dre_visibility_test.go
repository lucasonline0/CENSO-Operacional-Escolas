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
		// Exact match
		{"exact match", "02 URE - Cametá", true},
		{"lowercase exact", "02 ure - cametá", true},
		{"uppercase exact", "02 URE - CAMETÁ", true},

		// Extra whitespace
		{"extra space after 02", "02  URE - Cametá", true},
		{"extra space before dash", "02 URE  - Cametá", true},
		{"extra space after dash", "02 URE -  Cametá", true},
		{"leading whitespace", "  02 URE - Cametá", true},
		{"trailing whitespace", "02 URE - Cametá  ", true},
		{"multiple spaces collapsed", "02   URE   -   Cametá", true},

		// CAMETA spelling variant
		{"cameta without accent", "02 URE - Cameta", true},
		{"CAMETA uppercase", "02 URE - CAMETA", true},
		{"cameta lowercase", "02 ure - cameta", true},

		// En-dash (–) and em-dash (—)
		{"en-dash", "02 URE – Cametá", true},
		{"em-dash", "02 URE — Cametá", true},
		{"en-dash with cameta", "02 URE – Cameta", true},
		{"em-dash with cameta", "02 URE — Cameta", true},

		// Combined variations
		{"en-dash, extra spaces, cameta", "02  URE  –  Cameta", true},
		{"em-dash, extra spaces, cametá", "02  URE  —  Cametá", true},

		// Should NOT match
		{"different number", "01 URE - Cametá", false},
		{"different city", "02 URE - Belém", false},
		{"missing URE", "02 - Cametá", false},
		{"only city name", "Cametá", false},
		{"empty string", "", false},
		{"completely different", "Diretoria Regional de Educação Sul", false},
		{"similar but not same", "02 URE Cametá", false},
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
	tests := []struct {
		name     string
		input    []string
		expected []string
	}{
		{
			"filter out single invalid",
			[]string{"02 URE - Cametá", "DRE Centro", "DRE Norte"},
			[]string{"DRE Centro", "DRE Norte"},
		},
		{
			"filter out multiple variations",
			[]string{"02 URE - Cametá", "02 URE - Cameta", "02 URE – Cametá", "DRE Centro"},
			[]string{"DRE Centro"},
		},
		{
			"no invalid entries",
			[]string{"DRE Centro", "DRE Norte", "DRE Sul"},
			[]string{"DRE Centro", "DRE Norte", "DRE Sul"},
		},
		{
			"empty list",
			[]string{},
			[]string{},
		},
		{
			"only invalid",
			[]string{"02 URE - Cametá"},
			[]string{},
		},
		{
			"with extra whitespace",
			[]string{"02  URE  -  Cametá", "DRE Centro"},
			[]string{"DRE Centro"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := filterOutInvalidDREs(tt.input)
			if len(result) != len(tt.expected) {
				t.Errorf("filterOutInvalidDREs(%v) returned %d items, expected %d", tt.input, len(result), len(tt.expected))
			}
			for i, v := range result {
				if i >= len(tt.expected) || v != tt.expected[i] {
					t.Errorf("filterOutInvalidDREs(%v) = %v, expected %v", tt.input, result, tt.expected)
					break
				}
			}
		})
	}
}

