package main

// A revogação definitiva de sessões é requisito de segurança do Perfil DRE.
// Registrá-la como migration administrativa crítica faz o startup falhar
// fechado caso o SQL esteja ausente ou não possa ser aplicado.
func init() {
	criticalAdministrativeMigrations["0025_dre_session_revocation.sql"] = struct{}{}
}
