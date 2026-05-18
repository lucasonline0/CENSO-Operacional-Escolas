// genpasswd gera o hash bcrypt da senha do admin para uso na variável ADMIN_PASSWORD_HASH.
// Uso: go run ./cmd/genpasswd <senha>
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Uso: go run ./cmd/genpasswd <senha>")
		os.Exit(1)
	}

	password := os.Args[1]
	if len(password) < 12 {
		fmt.Fprintln(os.Stderr, "ERRO: senha deve ter ao menos 12 caracteres")
		os.Exit(1)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Erro ao gerar hash:", err)
		os.Exit(1)
	}

	fmt.Println("Cole no seu .env:")
	fmt.Printf("ADMIN_PASSWORD_HASH=%s\n", hash)
}
