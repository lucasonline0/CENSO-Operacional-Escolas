package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"censo-api/internal/models"
)

func (app *application) GetLocations(w http.ResponseWriter, r *http.Request) {
	if app.sheets == nil {
		app.errorJSON(w, fmt.Errorf("serviço de planilhas indisponível"), http.StatusInternalServerError)
		return
	}

	locations, err := app.sheets.GetLocations()
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao buscar locais: %v", err), http.StatusInternalServerError)
		return
	}

	payload := jsonResponse{
		Error: false,
		Data:  locations,
	}
	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) GetSchools(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")

	if idStr != "" {
		id, err := strconv.Atoi(idStr)
		if err != nil {
			app.errorJSON(w, err)
			return
		}

		school, err := app.models.Schools.Get(id)
		if err != nil {
			app.errorJSON(w, err)
			return
		}

		payload := jsonResponse{Error: false, Data: school}
		app.writeJSON(w, http.StatusOK, payload)
		return
	}

	schools, err := app.models.Schools.GetAll()
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	payload := jsonResponse{Error: false, Data: schools}
	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) CreateSchool(w http.ResponseWriter, r *http.Request) {
	var req models.School

	err := app.readJSON(w, r, &req)
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	id, err := app.models.Schools.Insert(req)
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	req.ID = id
	payload := jsonResponse{
		Error:   false,
		Message: "Escola criada com sucesso",
		Data:    req,
	}

	app.writeJSON(w, http.StatusCreated, payload)
}

func (app *application) GetCenso(w http.ResponseWriter, r *http.Request) {
	schoolIDStr := r.URL.Query().Get("school_id")
	if schoolIDStr == "" {
		app.errorJSON(w, nil, http.StatusBadRequest)
		return
	}

	schoolID, _ := strconv.Atoi(schoolIDStr)
	censo, err := app.models.Census.GetBySchoolID(schoolID, 2026)
	
	if err != nil || censo == nil {
		payload := jsonResponse{Error: false, Data: nil}
		app.writeJSON(w, http.StatusOK, payload)
		return
	}

	payload := jsonResponse{Error: false, Data: censo.Data}
	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) CreateOrUpdateCenso(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SchoolID int             `json:"school_id"`
		Year     int             `json:"year"`
		Status   string          `json:"status"`
		Data     json.RawMessage `json:"data"`
	}

	err := app.readJSON(w, r, &req)
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	existingCenso, err := app.models.Census.GetBySchoolID(req.SchoolID, 2026)
	var finalData []byte

	if err == nil && existingCenso != nil {
		var oldMap map[string]interface{}
		var newMap map[string]interface{}
		_ = json.Unmarshal(existingCenso.Data, &oldMap)
		_ = json.Unmarshal(req.Data, &newMap)

		if oldMap == nil {
			oldMap = make(map[string]interface{})
		}
		for k, v := range newMap {
			oldMap[k] = v
		}
		finalData, _ = json.Marshal(oldMap)
	} else {
		finalData = req.Data
	}

	censo := models.CensusResponse{
		SchoolID:  req.SchoolID,
		Year:      req.Year,
		Status:    req.Status,
		Data:      finalData,
		UpdatedAt: time.Now(),
	}

	err = app.models.Census.Upsert(censo)
	if err != nil {
		app.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// LÓGICA DE FINALIZAÇÃO: Planilha e Google Drive
	if req.Status == "completed" {
		// 1. Enviar para Planilha (Goroutine)
		go func(c models.CensusResponse) {
			if app.sheets == nil {
				app.logger.Println("Erro: Serviço de Planilhas não inicializado.")
				return
			}
			school, err := app.models.Schools.Get(c.SchoolID)
			if err != nil {
				app.logger.Println("Erro ao buscar escola:", err)
				return
			}
			err = app.sheets.AppendCenso(c, *school)
			if err != nil {
				app.logger.Println("Erro ao salvar na planilha:", err)
			} else {
				app.logger.Println("Sucesso: Dados enviados para a planilha.")
			}
		}(censo)

		// 2. Processar Upload da Foto (Síncrono para garantir envio)
		tempDir := "./tmp"
		pattern := fmt.Sprintf("%d_*", req.SchoolID)
		matches, _ := filepath.Glob(filepath.Join(tempDir, pattern))

		if len(matches) > 0 {
			// Pega o primeiro arquivo encontrado
			tempFilePath := matches[0]
			app.logger.Printf("[Handlers] Arquivo temporário encontrado: %s", tempFilePath)
			
			// Busca dados da escola para nomear pasta
			school, err := app.models.Schools.Get(req.SchoolID)
			if err == nil && app.drive != nil {
				func() { // Função anônima para controlar o defer do arquivo
					file, err := os.Open(tempFilePath)
					if err != nil {
						app.logger.Println("Erro ao abrir arquivo temporário:", err)
						return
					}
					defer file.Close()

					// Verifica tamanho do arquivo para garantir integridade
					stat, _ := file.Stat()
					if stat.Size() == 0 {
						app.logger.Println("AVISO: Arquivo de foto está vazio (0 bytes). Upload cancelado.")
						return
					}
					app.logger.Printf("Arquivo aberto. Tamanho: %d bytes", stat.Size())
					
					// Sanitização de nome da pasta
					sanitize := func(s string) string {
						return strings.Map(func(r rune) rune {
							if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' {
								return r
							}
							return '-'
						}, s)
					}
					folderName := fmt.Sprintf("%s - %s - %s", sanitize(school.Nome), sanitize(school.Dre), sanitize(school.NomeDiretor))
					
					// Detecta Content-Type
					buffer := make([]byte, 512)
					n, _ := file.Read(buffer)
					contentType := http.DetectContentType(buffer[:n])
					
					// Reset do ponteiro do arquivo é CRUCIAL
					_, err = file.Seek(0, 0)
					if err != nil {
						app.logger.Println("ERRO CRÍTICO: Falha ao resetar ponteiro do arquivo:", err)
						return
					}

					// Nome do arquivo original
					_, filename := filepath.Split(tempFilePath)
					originalName := strings.TrimPrefix(filename, fmt.Sprintf("%d_", req.SchoolID))

					app.logger.Printf("Iniciando upload Drive. Folder: %s, File: %s, Type: %s", folderName, originalName, contentType)

					// Envia para o Drive
					link, err := app.drive.UploadSchoolPhoto(folderName, originalName, contentType, file)
					if err != nil {
						app.logger.Println("Erro upload Drive:", err)
					} else {
						app.logger.Printf("Sucesso upload Drive: %s", link)
						// Só remove se deu certo
						file.Close() 
						os.Remove(tempFilePath)
					}
				}()
			} else {
				if app.drive == nil {
					app.logger.Println("AVISO: Serviço Drive não inicializado.")
				}
			}
		} else {
			app.logger.Println("Nenhuma foto temporária encontrada para upload.")
		}
	}

	payload := jsonResponse{
		Error:   false,
		Message: "Censo salvo com sucesso",
		Data:    censo,
	}

	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) uploadPhoto(w http.ResponseWriter, r *http.Request) {
	// Limite 10MB
	r.ParseMultipartForm(10 << 20)

	file, handler, err := r.FormFile("photo")
	if err != nil {
		app.errorJSON(w, fmt.Errorf("arquivo inválido"), http.StatusBadRequest)
		return
	}
	defer file.Close()

	schoolIDStr := r.FormValue("school_id")
	if schoolIDStr == "" {
		app.errorJSON(w, fmt.Errorf("school_id obrigatório"), http.StatusBadRequest)
		return
	}

	tempDir := "./tmp"
	if _, err := os.Stat(tempDir); os.IsNotExist(err) {
		os.Mkdir(tempDir, 0755)
	}

	// Formato: ID_NomeOriginal
	tempFilename := fmt.Sprintf("%s_%s", schoolIDStr, handler.Filename)
	dstPath := filepath.Join(tempDir, tempFilename)

	dst, err := os.Create(dstPath)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro interno ao salvar temp: %v", err), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copia o conteúdo para o disco
	written, err := io.Copy(dst, file)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao escrever arquivo: %v", err), http.StatusInternalServerError)
		return
	}

	app.logger.Printf("Upload recebido: %s (%d bytes)", dstPath, written)

	payload := jsonResponse{
		Error:   false,
		Message: "Upload recebido (será processado ao finalizar)",
		Data:    "temp_ok",
	}
	app.writeJSON(w, http.StatusCreated, payload)
}
