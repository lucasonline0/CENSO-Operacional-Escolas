from pathlib import Path


def rep(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {n}: {old!r}")
    p.write_text(s.replace(old, new))


p = "api/cmd/api/advanced_dre_scope_test.go"
rep(p,
    '\t\tRole:     RoleDRE,\n\t\tDRE:      "DRE_A",',
    '\t\tRole:     RoleDRE,\n\t\tDRE:      "DRE_A",\n\t\tDREID:    77,')
rep(p,
    '\t\t"$8 = false OR ($3 <> \'\' AND EXISTS",',
    '\t\t"$8 = false OR ($11 > 0 AND EXISTS",')
rep(p,
    '\t\t"scope_s.id = prodep_repasses.school_id_sede",\n\t\t"$9 = 0 OR prodep_repasses.school_id = $9",',
    '\t\t"scope_s.id = prodep_repasses.school_id_sede",\n\t\t"dre_id",\n\t\t"$9 = 0 OR prodep_repasses.school_id = $9",')
rep(p,
    'if len(args) != 7 || args[1] != "DRE_A" || args[5] != 99 || args[6] != "X" {',
    'if len(args) != 8 || args[1] != "DRE_A" || args[5] != 99 || args[6] != "X" || args[7] != 77 {')

p = "api/cmd/api/analytics_filtros_test.go"
rep(p,
    '\t\tCodigoINEP:       "15000001",\n\t}',
    '\t\tCodigoINEP:       "15000001",\n\t\tDREID:            77,\n\t}',
    expected=1)
rep(p,
    'if len(args) != 7 {\n\t\tt.Fatalf("expected 7 args, got %d", len(args))\n\t}',
    'if len(args) != 8 {\n\t\tt.Fatalf("expected 8 args, got %d", len(args))\n\t}')
rep(p,
    'want := []any{2024, "d", "m", "z", "r", 99, "15000001"}',
    'want := []any{2024, "d", "m", "z", "r", 99, "15000001", 77}')

p = "api/cmd/api/analytics_perfil_alunos_ideb_test.go"
rep(p,
    '\t\tSchoolID: 42, CodigoINEP: "15000123", RequireLinkedSchool: true,',
    '\t\tSchoolID: 42, CodigoINEP: "15000123", RequireLinkedSchool: true, DREID: 77,')
rep(p,
    'if len(args) != 13 {\n\t\tt.Fatalf("esperava 13 args, obtive %d", len(args))\n\t}',
    'if len(args) != 14 {\n\t\tt.Fatalf("esperava 14 args, obtive %d", len(args))\n\t}')
rep(p,
    'if args[0] != 2023 || args[1] != "anos_finais" || args[9] != true || args[10] != 42 || args[11] != "15000123" || args[12] != true {',
    'if args[0] != 2023 || args[1] != "anos_finais" || args[9] != true || args[10] != 42 || args[11] != "15000123" || args[12] != true || args[13] != 77 {')

p = "api/cmd/api/analytics_saude_operacional_test.go"
for old, new in {
    'want: []any{2026, "", "", "", "", 0, ""},': 'want: []any{2026, "", "", "", "", 0, "", 0},',
    'filters: saudeOperacionalFilters{DRE: "CASTANHAL"},': 'filters: saudeOperacionalFilters{DRE: "CASTANHAL", DREID: 77},',
    'want:    []any{2026, "CASTANHAL", "", "", "", 0, ""},': 'want:    []any{2026, "CASTANHAL", "", "", "", 0, "", 77},',
    'want:    []any{2026, "", "BELEM", "", "", 0, ""},': 'want:    []any{2026, "", "BELEM", "", "", 0, "", 0},',
    'want:    []any{2026, "", "", "Urbana", "", 0, ""},': 'want:    []any{2026, "", "", "Urbana", "", 0, "", 0},',
    'want:    []any{2026, "", "", "", "GUAJARA", 0, ""},': 'want:    []any{2026, "", "", "", "GUAJARA", 0, "", 0},',
    'want: []any{2025, "BELEM", "BELEM", "Urbana", "GUAJARA", 0, ""},': 'want: []any{2025, "BELEM", "BELEM", "Urbana", "GUAJARA", 0, "", 0},',
}.items():
    rep(p, old, new)
rep(p,
    '\t\t"($2 = \'\' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",',
    '\t\t"dre_id",\n\t\t"$8",')

for p in [
    "api/cmd/api/reports_infraestrutura_test.go",
    "api/cmd/api/reports_test.go",
]:
    rep(p,
        '\t\t"($2 = \'\' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",',
        '\t\t"dre_id",\n\t\t"$8",')
