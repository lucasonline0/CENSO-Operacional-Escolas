package main

// O cofre de credenciais é uma migration administrativa crítica. O startup
// deve falhar fechado caso o schema necessário para armazenar/auditar as
// credenciais não possa ser aplicado.
func init() {
	criticalAdministrativeMigrations["0026_admin_password_vault.sql"] = struct{}{}
}
