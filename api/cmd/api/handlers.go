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
		app.logger.Printf("GetLocations: %v", err)
		app.errorJSON(w, fmt.Errorf("erro ao buscar locais"), http.StatusInternalServerError)
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
	if !censusWriteRL.allow(clientIP(r), maxCensusWrites, censusWindow) {
		w.Header().Set("Retry-After", "600")
		app.errorJSON(w, fmt.Errorf("muitas requisições. Aguarde alguns minutos"), http.StatusTooManyRequests)
		return
	}

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
		app.errorJSON(w, fmt.Errorf("school_id é obrigatório"), http.StatusBadRequest)
		return
	}

	schoolID, err := strconv.Atoi(schoolIDStr)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("school_id inválido"), http.StatusBadRequest)
		return
	}

	yearStr := r.URL.Query().Get("year")
	year, err := strconv.Atoi(yearStr)
	if err != nil || year == 0 {
		year = time.Now().Year()
	}

	censo, err := app.models.Census.GetBySchoolID(schoolID, year)

	if err != nil || censo == nil {
		payload := jsonResponse{Error: false, Data: nil}
		app.writeJSON(w, http.StatusOK, payload)
		return
	}

	payload := jsonResponse{Error: false, Data: censo.Data}
	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) CreateOrUpdateCenso(w http.ResponseWriter, r *http.Request) {
	if !censusWriteRL.allow(clientIP(r), maxCensusWrites, censusWindow) {
		w.Header().Set("Retry-After", "600")
		app.errorJSON(w, fmt.Errorf("muitas requisições. Aguarde alguns minutos"), http.StatusTooManyRequests)
		return
	}

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

	year := req.Year
	if year == 0 {
		year = time.Now().Year()
	}

	existingCenso, err := app.models.Census.GetBySchoolID(req.SchoolID, year)
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
		Year:      year,
		Status:    req.Status,
		Data:      finalData,
		UpdatedAt: time.Now(),
	}

	err = app.models.Census.Upsert(&censo)
	if err != nil {
		app.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	uploadMsg := ""

	// LÓGICA DE FINALIZAÇÃO: Planilha e Google Drive
	if req.Status == "completed" {
		// 1. Enviar para Planilha — sempre que status for completed.
		if app.sheets != nil {
			// Busca a escola aqui (request context, conexão saudável) para não
			// depender de DB dentro da goroutine onde a conexão pode estar stale.
			school, err := app.models.Schools.Get(censo.SchoolID)
			if err != nil {
				app.logger.Println("Erro ao buscar escola para planilha:", err)
			} else {
				censoCopy := censo
				go func(c models.CensusResponse, s models.School) {
					// Usa variável local (não a 'err' da função externa) para
					// evitar data race com o handler que segue executando.
					if e := app.sheets.AppendCenso(c, s); e != nil {
						app.logger.Println("Erro ao salvar na planilha:", e)
						return
					}
					if e := app.models.Census.MarkSheetSynced(c.ID); e != nil {
						app.logger.Println("Erro ao marcar sheet_synced_at:", e)
					}
				}(censoCopy, *school)
			}
		}

		// 2. Processar Upload da Foto
		tempDir := "./tmp"
		pattern := fmt.Sprintf("%d_*", req.SchoolID)
		matches, _ := filepath.Glob(filepath.Join(tempDir, pattern))

		if len(matches) > 0 {
			tempFilePath := matches[0]
			
			school, err := app.models.Schools.Get(req.SchoolID)
			if err == nil && app.drive != nil {
				// Função anônima para garantir fechamento do arquivo
				errUpload := func() error {
					file, err := os.Open(tempFilePath)
					if err != nil {
						return err
					}
					defer file.Close()

					// Verifica se o arquivo tem conteúdo
					stat, err := file.Stat()
					if err != nil {
						return fmt.Errorf("erro ao verificar arquivo: %v", err)
					}
					if stat.Size() == 0 {
						return fmt.Errorf("arquivo vazio")
					}

					// Sanitização
					sanitize := func(s string) string {
						return strings.Map(func(r rune) rune {
							if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' {
								return r
							}
							return '-'
						}, s)
					}
					folderName := fmt.Sprintf("%s - %s - %s", sanitize(school.Nome), sanitize(school.Dre), sanitize(school.NomeDiretor))
					
					// Detecta Content-Type e reseta ponteiro
					buffer := make([]byte, 512)
					n, _ := file.Read(buffer)
					contentType := http.DetectContentType(buffer[:n])
					
					// RESET CRÍTICO: Garante que o arquivo seja lido do início no upload
					if _, err := file.Seek(0, 0); err != nil {
						return fmt.Errorf("falha ao resetar arquivo: %v", err)
					}

					_, filename := filepath.Split(tempFilePath)
					originalName := strings.TrimPrefix(filename, fmt.Sprintf("%d_", req.SchoolID))

					// Upload
					link, err := app.drive.UploadSchoolPhoto(folderName, originalName, contentType, file)
					if err != nil {
						return err
					}
					app.logger.Printf("Sucesso upload Drive: %s", link)
					return nil
				}()

				if errUpload != nil {
					app.logger.Println("ERRO CRÍTICO DRIVE:", errUpload)
					uploadMsg = fmt.Sprintf(" (Erro ao salvar foto: %v)", errUpload)
				} else {
					os.Remove(tempFilePath) // Remove apenas se sucesso
				}
			}
		}
	}

	payload := jsonResponse{
		Error:   false,
		Message: "Censo salvo com sucesso" + uploadMsg,
		Data:    censo,
	}

	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) uploadPhoto(w http.ResponseWriter, r *http.Request) {
	if !uploadRL.allow(clientIP(r), maxUploads, uploadWindow) {
		w.Header().Set("Retry-After", "600")
		app.errorJSON(w, fmt.Errorf("muitos uploads. Aguarde alguns minutos"), http.StatusTooManyRequests)
		return
	}

	// Limite total do corpo da requisição a 10MB (defesa contra DoS por disco).
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		app.errorJSON(w, fmt.Errorf("arquivo muito grande ou inválido (máx. 10MB)"), http.StatusBadRequest)
		return
	}

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
	if _, err := strconv.Atoi(schoolIDStr); err != nil {
		app.errorJSON(w, fmt.Errorf("school_id inválido"), http.StatusBadRequest)
		return
	}

	// Valida extensão (apenas imagens)
	safeBase := filepath.Base(handler.Filename)
	ext := strings.ToLower(filepath.Ext(safeBase))
	allowedExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowedExts[ext] {
		app.errorJSON(w, fmt.Errorf("tipo de arquivo não permitido. Use: jpg, jpeg, png, webp ou gif"), http.StatusBadRequest)
		return
	}

	// Valida o CONTEÚDO real (magic bytes), não só a extensão do nome — impede
	// que um arquivo arbitrário seja salvo apenas renomeado com extensão de imagem.
	sniff := make([]byte, 512)
	n, _ := file.Read(sniff)
	detected := http.DetectContentType(sniff[:n])
	allowedTypes := map[string]bool{
		"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true,
	}
	if !allowedTypes[detected] {
		app.errorJSON(w, fmt.Errorf("conteúdo do arquivo não é uma imagem válida"), http.StatusBadRequest)
		return
	}
	// Rebobina para que o io.Copy abaixo grave o arquivo inteiro.
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao processar arquivo"), http.StatusInternalServerError)
		return
	}

	// Sanitiza o nome: mantém apenas caracteres seguros
	safeBase = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			return r
		}
		return '_'
	}, safeBase)

	// Garante diretório temporário
	tempDir := "./tmp"
	if _, err := os.Stat(tempDir); os.IsNotExist(err) {
		os.Mkdir(tempDir, 0700)
	}

	// Formato: ID_NomeOriginal
	tempFilename := fmt.Sprintf("%s_%s", schoolIDStr, safeBase)
	dstPath := filepath.Join(tempDir, tempFilename)

	dst, err := os.Create(dstPath)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro interno ao salvar temp: %v", err), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao escrever arquivo: %v", err), http.StatusInternalServerError)
		return
	}

	payload := jsonResponse{
		Error:   false,
		Message: "Upload recebido (será processado ao finalizar)",
		Data:    "temp_ok",
	}
	app.writeJSON(w, http.StatusCreated, payload)
}

// AdminSyncSheets força a re-sincronização imediata de todos os censos
// completed que ainda não foram gravados na planilha.
// Protegido por SYNC_SECRET para evitar uso não autorizado.
func (app *application) AdminSyncSheets(w http.ResponseWriter, r *http.Request) {
	secret := os.Getenv("SYNC_SECRET")
	if secret != "" && r.Header.Get("X-Sync-Secret") != secret {
		app.errorJSON(w, fmt.Errorf("não autorizado"), http.StatusUnauthorized)
		return
	}

	pending, err := app.models.Census.GetPendingSheetSync()
	if err != nil {
		app.logger.Printf("AdminSyncSheets: %v", err)
		app.errorJSON(w, fmt.Errorf("erro ao buscar pendentes"), http.StatusInternalServerError)
		return
	}

	synced := 0
	failed := 0
	for _, c := range pending {
		school, err := app.models.Schools.Get(c.SchoolID)
		if err != nil {
			app.logger.Printf("adminSync: erro escola %d: %v", c.SchoolID, err)
			failed++
			continue
		}
		if err = app.sheets.AppendCenso(*c, *school); err != nil {
			app.logger.Printf("adminSync: erro ao enviar escola %d: %v", c.SchoolID, err)
			failed++
			continue
		}
		if err = app.models.Census.MarkSheetSynced(c.ID); err != nil {
			app.logger.Printf("adminSync: erro ao marcar sincronizado %d: %v", c.ID, err)
		}
		synced++
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: fmt.Sprintf("Sync concluído: %d sincronizados, %d falhas", synced, failed),
		Data:    map[string]int{"pending": len(pending), "synced": synced, "failed": failed},
	})
}
