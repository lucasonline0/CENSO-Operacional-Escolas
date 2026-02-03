package services

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
)

type DriveService struct {
	srv *drive.Service
}

func NewDriveService() (*DriveService, error) {
	ctx := context.Background()
	var creds []byte
	
	envCreds := os.Getenv("GOOGLE_CREDENTIALS_JSON")
	if envCreds != "" {
		creds = []byte(envCreds)
	} else {
		paths := []string{"credentials.json", "../credentials.json", "../../credentials.json"}
		for _, path := range paths {
			c, err := os.ReadFile(path)
			if err == nil {
				creds = c
				break
			}
		}
		if len(creds) == 0 {
			return nil, fmt.Errorf("credenciais não encontradas (env ou arquivo)")
		}
	}

	// Tenta ler o email para Impersonation (Solução para Erro 403 Quota)
	// Isso faz o bot agir em nome de um usuário com espaço (Workspace)
	impersonateEmail := os.Getenv("GOOGLE_IMPERSONATE_EMAIL")
	
	var srv *drive.Service
	var err error

	if impersonateEmail != "" {
		// Configura delegação JWT
		config, err := google.JWTConfigFromJSON(creds, drive.DriveScope)
		if err != nil {
			return nil, fmt.Errorf("erro config JWT para delegação: %v", err)
		}
		config.Subject = impersonateEmail
		
		log.Printf("[Drive] Iniciando serviço com delegação (Impersonation) para: %s", impersonateEmail)
		srv, err = drive.NewService(ctx, option.WithTokenSource(config.TokenSource(ctx)))
	} else {
		// Fluxo padrão (Service Account pura)
		srv, err = drive.NewService(ctx, option.WithCredentialsJSON(creds), option.WithScopes(drive.DriveScope))
	}

	if err != nil {
		return nil, fmt.Errorf("erro criar cliente drive: %v", err)
	}

	return &DriveService{srv: srv}, nil
}

func (s *DriveService) UploadSchoolPhoto(folderName string, fileName string, contentType string, fileContent io.Reader) (string, error) {
	rootFolderID := os.Getenv("DRIVER_ROOT_FOLDER_ID")
	if rootFolderID == "" {
		return "", fmt.Errorf("DRIVER_ROOT_FOLDER_ID não configurado")
	}

	// Tenta rebobinar o arquivo se ele for um ReadSeeker (segurança extra)
	if seeker, ok := fileContent.(io.Seeker); ok {
		_, err := seeker.Seek(0, 0)
		if err != nil {
			log.Printf("[Drive] Aviso: Não foi possível fazer seek no arquivo: %v", err)
		}
	}

	// 1. Encontrar ou Criar a Pasta da Escola
	query := fmt.Sprintf("name = '%s' and '%s' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false", folderName, rootFolderID)
	
	list, err := s.srv.Files.List().
		Q(query).
		Fields("files(id, name)").
		SupportsAllDrives(true).
		IncludeItemsFromAllDrives(true).
		Do()

	if err != nil {
		return "", fmt.Errorf("erro buscar pasta: %v", err)
	}

	var schoolFolderID string

	if len(list.Files) > 0 {
		schoolFolderID = list.Files[0].Id
		log.Printf("[Drive] Pasta existente encontrada: %s (%s)", list.Files[0].Name, schoolFolderID)
	} else {
		folderMetadata := &drive.File{
			Name:     folderName,
			Parents:  []string{rootFolderID},
			MimeType: "application/vnd.google-apps.folder",
		}
		folder, err := s.srv.Files.Create(folderMetadata).
			Fields("id").
			SupportsAllDrives(true).
			Do()

		if err != nil {
			return "", fmt.Errorf("erro criar pasta: %v", err)
		}
		schoolFolderID = folder.Id
		log.Printf("[Drive] Nova pasta criada: %s (%s)", folderName, schoolFolderID)
	}

	// 2. Upload do Arquivo
	fileMetadata := &drive.File{
		Name:     fileName,
		Parents:  []string{schoolFolderID},
		MimeType: contentType,
	}

	uploadedFile, err := s.srv.Files.Create(fileMetadata).
		Media(fileContent, googleapi.ContentType(contentType)).
		Fields("id, webViewLink, parents").
		SupportsAllDrives(true).
		Do()

	if err != nil {
		// Loga o erro exato para debug
		return "", fmt.Errorf("erro upload arquivo: %v", err)
	}

	log.Printf("[Drive] Arquivo enviado com sucesso! ID: %s", uploadedFile.Id)

	link := uploadedFile.WebViewLink
	if link == "" {
		link = fmt.Sprintf("https://drive.google.com/file/d/%s/view", uploadedFile.Id)
	}

	return link, nil
}
