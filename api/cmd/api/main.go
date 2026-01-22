package main

import (
	"censo-seduc-api/internal/models"
	"censo-seduc-api/pkg/database"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// 1. Carrega variaveis
	err := godotenv.Load("../.env")
	if err != nil {
		log.Println("⚠️  Aviso: .env não encontrado, usando variáveis de sistema.")
	}

	// 2. Conecta ao Banco
	database.ConnectDB()

	// Isso cria a tabela 'schools' baseada na Struct usada
	database.DB.AutoMigrate(
		&models.School{},
		&models.Infrastructure{},
		&models.FoodSecurity{},
		&models.Technology{},
		&models.HumanResources{},
	)

	// 4. Inicializa Servidor
	r := gin.Default()
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	log.Println("🚀 Servidor rodando na porta 8000...")
	r.Run(":8000")
}