package services

import (
	"context"
	"fmt"
	"io"
	"os"

	"google.golang.org/api/drive/v3"
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
		fileCreds, err := os.ReadFile("credentials.json")
		if err != nil {
			return nil, fmt.Errorf("erro ao ler credenciais: %v", err)
		}
		creds = fileCreds
	}

	srv, err := drive.NewService(ctx, option.WithCredentialsJSON(creds))
	if err != nil {
		return nil, fmt.Errorf("erro ao criar cliente Drive: %v", err)
	}

	return &DriveService{srv: srv}, nil
}

// UploadSchoolPhoto gerencia a criação da pasta e o upload
func (s *DriveService) UploadSchoolPhoto(folderName string, fileName string, fileContent io.Reader) (string, error) {
	rootFolderID := os.Getenv("DRIVE_ROOT_FOLDER_ID")
	if rootFolderID == "" {
		return "", fmt.Errorf("DRIVE_ROOT_FOLDER_ID não configurado")
	}

	// 1. Verificar se a pasta da escola já existe dentro da Raiz
	query := fmt.Sprintf("name = '%s' and '%s' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false", folderName, rootFolderID)
	list, err := s.srv.Files.List().Q(query).Fields("files(id)").Do()
	if err != nil {
		return "", fmt.Errorf("erro ao buscar pasta: %v", err)
	}

	var schoolFolderID string

	if len(list.Files) > 0 {
		schoolFolderID = list.Files[0].Id
	} else {
		// 2. Criar a pasta se não existir
		folderMetadata := &drive.File{
			Name:     folderName,
			Parents:  []string{rootFolderID},
			MimeType: "application/vnd.google-apps.folder",
		}
		folder, err := s.srv.Files.Create(folderMetadata).Fields("id").Do()
		if err != nil {
			return "", fmt.Errorf("erro ao criar pasta: %v", err)
		}
		schoolFolderID = folder.Id
	}

	// 3. Fazer Upload do Arquivo
	fileMetadata := &drive.File{
		Name:    fileName,
		Parents: []string{schoolFolderID},
	}

	uploadedFile, err := s.srv.Files.Create(fileMetadata).Media(fileContent).Fields("id, webViewLink").Do()
	if err != nil {
		return "", fmt.Errorf("erro ao fazer upload do arquivo: %v", err)
	}

	return uploadedFile.WebViewLink, nil
}