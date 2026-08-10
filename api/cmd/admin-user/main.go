package main

import (
	"bufio"
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"censo-api/internal/models"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"golang.org/x/term"
)

func main() {
	loadEnv()

	db, err := openDB()
	if err != nil {
		log.Fatalf("Erro ao conectar ao banco de dados: %v", err)
	}
	defer db.Close()

	appModels := models.NewModels(db)
	ctx := context.Background()

	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "create":
		createCmd := flag.NewFlagSet("create", flag.ExitOnError)
		username := createCmd.String("username", "", "Username do usuário")
		password := createCmd.String("password", "", "Senha do usuário (opcional, será solicitada se omitida)")
		dre := createCmd.String("dre", "", "DRE vinculada ao usuário")
		_ = createCmd.Parse(os.Args[2:])

		if *username == "" || *dre == "" {
			fmt.Println("Uso: admin-user create -username <username> -dre <DRE> [-password <senha>]")
			os.Exit(1)
		}

		pwd := *password
		if pwd == "" {
			pwd = readPasswordPrompt("Digite a senha do usuário: ")
		}

		user, err := appModels.AdminUsers.Create(ctx, *username, pwd, "dre", *dre)
		if err != nil {
			log.Fatalf("Erro ao criar usuário: %v", err)
		}

		fmt.Printf("Usuário '%s' (role: %s, DRE: %s) criado com sucesso! ID: %d\n", user.Username, user.Role, user.DRE, user.ID)

	case "update-password":
		updateCmd := flag.NewFlagSet("update-password", flag.ExitOnError)
		username := updateCmd.String("username", "", "Username do usuário")
		password := updateCmd.String("password", "", "Nova senha do usuário (opcional, será solicitada se omitida)")
		_ = updateCmd.Parse(os.Args[2:])

		if *username == "" {
			fmt.Println("Uso: admin-user update-password -username <username> [-password <nova_senha>]")
			os.Exit(1)
		}

		pwd := *password
		if pwd == "" {
			pwd = readPasswordPrompt("Digite a nova senha do usuário: ")
		}

		err := appModels.AdminUsers.UpdatePassword(ctx, *username, pwd)
		if err != nil {
			log.Fatalf("Erro ao atualizar senha: %v", err)
		}

		fmt.Printf("Senha do usuário '%s' atualizada com sucesso!\n", *username)

	case "deactivate":
		deactCmd := flag.NewFlagSet("deactivate", flag.ExitOnError)
		username := deactCmd.String("username", "", "Username do usuário")
		_ = deactCmd.Parse(os.Args[2:])

		if *username == "" {
			fmt.Println("Uso: admin-user deactivate -username <username>")
			os.Exit(1)
		}

		err := appModels.AdminUsers.SetActive(ctx, *username, false)
		if err != nil {
			log.Fatalf("Erro ao desativar usuário: %v", err)
		}

		fmt.Printf("Usuário '%s' desativado com sucesso!\n", *username)

	case "activate":
		actCmd := flag.NewFlagSet("activate", flag.ExitOnError)
		username := actCmd.String("username", "", "Username do usuário")
		_ = actCmd.Parse(os.Args[2:])

		if *username == "" {
			fmt.Println("Uso: admin-user activate -username <username>")
			os.Exit(1)
		}

		err := appModels.AdminUsers.SetActive(ctx, *username, true)
		if err != nil {
			log.Fatalf("Erro ao ativar usuário: %v", err)
		}

		fmt.Printf("Usuário '%s' ativado com sucesso!\n", *username)

	case "list":
		users, err := appModels.AdminUsers.List(ctx)
		if err != nil {
			log.Fatalf("Erro ao listar usuários: %v", err)
		}

		if len(users) == 0 {
			fmt.Println("Nenhum usuário cadastrado.")
			return
		}

		fmt.Printf("%-5s | %-20s | %-10s | %-30s | %-8s | %-20s\n", "ID", "USERNAME", "ROLE", "DRE", "ATIVO", "CRIADO EM")
		fmt.Println(strings.Repeat("-", 105))
		for _, u := range users {
			activeStr := "Sim"
			if !u.Active {
				activeStr = "Não"
			}
			fmt.Printf("%-5d | %-20s | %-10s | %-30s | %-8s | %-20s\n",
				u.ID, u.Username, u.Role, u.DRE, activeStr, u.CreatedAt.Format("02/01/2006 15:04"))
		}

	default:
		printUsage()
		os.Exit(1)
	}
}

func readPasswordPrompt(prompt string) string {
	fmt.Print(prompt)
	if term.IsTerminal(int(syscall.Stdin)) {
		bytePassword, err := term.ReadPassword(int(syscall.Stdin))
		fmt.Println()
		if err != nil {
			log.Fatalf("Erro ao ler senha: %v", err)
		}
		return strings.TrimSpace(string(bytePassword))
	}

	reader := bufio.NewReader(os.Stdin)
	text, err := reader.ReadString('\n')
	if err != nil {
		log.Fatalf("Erro ao ler senha: %v", err)
	}
	return strings.TrimSpace(text)
}

func printUsage() {
	fmt.Println("Ferramenta de Gerenciamento de Usuários Administrativos DRE")
	fmt.Println("Comandos disponíveis:")
	fmt.Println("  create -username <name> -dre <DRE> [-password <pass>]   Cria um novo usuário DRE")
	fmt.Println("  update-password -username <name> [-password <pass>]    Atualiza a senha de um usuário")
	fmt.Println("  deactivate -username <name>                             Desativa uma conta de usuário")
	fmt.Println("  activate -username <name>                               Ativa uma conta de usuário")
	fmt.Println("  list                                                     Lista todos os usuários sem expor hash")
}

func loadEnv() {
	cwd, _ := os.Getwd()
	envPaths := []string{
		".env",
		filepath.Join(cwd, ".env"),
		filepath.Join(cwd, "..", ".env"),
		filepath.Join(cwd, "..", "infra", ".env"),
	}
	for _, p := range envPaths {
		if err := godotenv.Load(p); err == nil {
			break
		}
	}
}

func openDB() (*sql.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DB_DSN")
	}
	if dsn == "" {
		dbHost := os.Getenv("DB_HOST")
		if dbHost != "" {
			sslmode := os.Getenv("DB_SSLMODE")
			if sslmode == "" {
				sslmode = "disable"
			}
			dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s timezone=UTC connect_timeout=5",
				os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"), sslmode)
		}
	}
	if dsn == "" {
		return nil, fmt.Errorf("variáveis de banco não encontradas no ambiente")
	}
	return sql.Open("pgx", dsn)
}
