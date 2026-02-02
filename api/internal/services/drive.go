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

	srv, err := drive.NewService(ctx, option.WithCredentialsJSON(creds), option.WithScopes(drive.DriveScope))
	if err != nil {
		return nil, fmt.Errorf("erro criar cliente drive: %v", err)
	}

	return &DriveService{srv: srv}, nil
}

func (s *DriveService) UploadSchoolPhoto(folderName string, fileName string, fileContent io.Reader) (string, error) {
	rootFolderID := os.Getenv("DRIVER_ROOT_FOLDER_ID")
	if rootFolderID == "" {
		return "", fmt.Errorf("DRIVER_ROOT_FOLDER_ID não configurado")
	}

	// 1. Busca a pasta da escola
	query := fmt.Sprintf("name = '%s' and '%s' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false", folderName, rootFolderID)
	
	list, err := s.srv.Files.List().
		Q(query).
		Fields("files(id)").
		SupportsAllDrives(true).
		IncludeItemsFromAllDrives(true).
		Do()

	if err != nil {
		return "", fmt.Errorf("erro buscar pasta: %v", err)
	}

	var schoolFolderID string

	if len(list.Files) > 0 {
		schoolFolderID = list.Files[0].Id
	} else {
		// 2. Cria a pasta se não existir
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
	}

	// 3. Faz o upload do arquivo
	fileMetadata := &drive.File{
		Name:    fileName,
		Parents: []string{schoolFolderID},
	}

	uploadedFile, err := s.srv.Files.Create(fileMetadata).
		Media(fileContent).
		Fields("id, webViewLink").
		SupportsAllDrives(true).
		Do()

	if err != nil {
		return "", fmt.Errorf("erro upload arquivo: %v", err)
	}

	return uploadedFile.WebViewLink, nil
}