# Censo Operacional e Estrutural das Escolas (SEDUC-PA)

Este repositório contém o código-fonte do sistema de levantamento estrutural, recursos humanos e perfil escolar da Secretaria de Estado de Educação do Pará (SEDUC-PA). O sistema foi projetado para garantir alta disponibilidade, integridade de dados e segurança da informação, utilizando uma arquitetura moderna e escalável.

## Visão Geral do Projeto

O objetivo principal deste software é prover uma interface segura e robusta para que diretores e gestores escolares submetam dados detalhados sobre suas unidades de ensino. O sistema utiliza um padrão de formulário multi-etapas ("Wizard") com validação estrita de dados no lado do cliente e do servidor, assegurando a consistência das informações armazenadas.

### Principais Funcionalidades

* **Coleta de Dados em Etapas:** Segmentação do censo em 14 seções lógicas para redução de carga cognitiva e melhoria da experiência do usuário.
* **Salvamento de Rascunho:** Capacidade de persistência parcial de dados, permitindo o preenchimento assíncrono.
* **Validação Robusta:** Verificação de integridade de dados em múltiplas camadas utilizando Zod.
* **Integração com Ecossistema Google:** Sincronização e exportação de dados automatizada utilizando as APIs do Google Drive e Google Sheets.
* **Geração de Relatórios:** Suporte para exportação de dados do censo para formato PDF (via jsPDF).
* **Segurança:** Autenticação robusta, proteção contra ataques comuns da web e validação de requisições com CORS configurado.

## Arquitetura Técnica

O projeto segue a estrutura de **Monorepo**, consolidando frontend, backend e infraestrutura em um único repositório versionado.

### Tecnologias Utilizadas

**Backend (Go 1.24)**
* *Roteamento:* Chi (Múltiplas rotas, middlewares customizados e alta performance)
* *Banco de Dados:* Driver PGX estrito com `database/sql` (sem ORM, garantindo performance bruta e controle sobre as queries)
* *Integrações:* APIs do Google Drive/Sheets e manipulação nativa de Excel (`excelize`)

**Frontend (React 19 & Next.js 16)**
* *Framework:* Next.js (App Router)
* *Linguagem:* TypeScript (Tipagem estática estrita)
* *Estilização & UI:* Tailwind CSS v3, Radix UI Primitives e Lucide Icons
* *Gerenciamento de Formulários:* React Hook Form + Zod (Schema Validation)

**Banco de Dados & Infraestrutura**
* *SGBD:* PostgreSQL 16
* *Gerenciamento de Banco Visual:* Adminer
* *Orquestração:* Docker & Docker Compose

### Estrutura de Diretórios

A organização do código segue a separação de responsabilidades e princípios de Clean Architecture:

* `/api`: Contém todo o código-fonte do servidor Backend em Go (`cmd`, `internal/models`, `internal/services`, etc.).
* `/web`: Contém a aplicação web Frontend em Next.js.
* `/infra`: Arquivos de configuração de infraestrutura (`docker-compose.yml`, `init.sql` e variáveis de ambiente).

## Como Executar Localmente

### Pré-requisitos

Antes de iniciar, certifique-se de ter instalado:

* **Go 1.24** ou superior ([https://go.dev/dl](https://go.dev/dl))
* **Node.js 20+** com npm ([https://nodejs.org](https://nodejs.org))
* **Docker** e **Docker Compose** ([https://www.docker.com](https://www.docker.com))
* **Git** para clonar o repositório

### Passo 1: Configurar Variáveis de Ambiente

#### 1.1 Copiar arquivo de exemplo
```bash
cd infra
cp .env.example .env
```

#### 1.2 Editar `.env` com as configurações necessárias

Abra o arquivo `/infra/.env` e configure as seguintes variáveis:

```env
# ============================================
# DATABASE CONFIGURATION
# ============================================
DB_HOST=postgres
DB_PORT=5432
DB_USER=censo_user
DB_PASSWORD=senha_segura_123
DB_NAME=censo_operacional

# ============================================
# GO API CONFIGURATION
# ============================================
PORT=8000
ADMIN_PASSWORD_HASH=<use 'go run ./cmd/genpasswd/main.go' para gerar>
ADMIN_JWT_SECRET=sua_chave_secreta_muito_segura_aqui_minimo_32_caracteres

# ============================================
# FRONTEND CONFIGURATION
# ============================================
NEXT_PUBLIC_API_URL=http://localhost:8000

# ============================================
# GOOGLE INTEGRATION (Opcional)
# ============================================
# Deixe vazio para desenvolvimento sem Google Sheets
GOOGLE_CREDENTIALS_JSON={}
SPREADSHEET_ID=
GOOGLE_DRIVE_FOLDER_ID=

# ============================================
# CORS CONFIGURATION
# ============================================
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
```

**Importante:** O `ADMIN_PASSWORD_HASH` deve ser gerado usando bcrypt. Veja [Passo 2.1](#passo-21-gerar-hash-de-senha).

### Passo 2: Iniciar o Banco de Dados

#### 2.1 Gerar Hash da Senha do Admin

Abra um terminal na raiz do projeto e execute:

```bash
cd api
go run ./cmd/genpasswd/main.go
```

Você será solicitado a inserir uma senha. O programa exibirá o hash bcrypt. **Copie este hash e substitua o valor de `ADMIN_PASSWORD_HASH` no arquivo `.env`**.

Exemplo de saída:
```
Enter password: senha123
Password hash: $2a$10$abcdefghijklmnopqrstuvwxyz...
```

#### 2.2 Iniciar PostgreSQL e Adminer via Docker

```bash
cd infra
docker-compose up -d
```

Verifique se os containers estão rodando:
```bash
docker-compose ps
```

Você deve ver dois containers em execução:
- `postgres` (porta 5432)
- `adminer` (porta 8080)

**Acessar Adminer (interface visual do banco):**
- URL: [http://localhost:8080](http://localhost:8080)
- Sistema: PostgreSQL
- Servidor: postgres
- Usuário: censo_user
- Senha: (conforme em `.env`)
- Banco: censo_operacional

### Passo 3: Iniciar o Backend (Go API)

Abra um novo terminal na raiz do projeto:

```bash
cd api
go mod download    # Baixa as dependências
go run ./cmd/api/main.go
```

Você deve ver uma mensagem similar:
```
[INFO] Iniciando sincronização de sheets em segundo plano...
[INFO] Servidor iniciado na porta 8000
```

**Verificar se a API está rodando:**
```bash
curl http://localhost:8000/v1/health
```

Resposta esperada:
```json
{"status":"ok"}
```

### Passo 4: Iniciar o Frontend (Next.js)

Abra um novo terminal na raiz do projeto:

```bash
cd web
npm install        # Instala dependências
npm run dev        # Inicia servidor de desenvolvimento
```

A aplicação estará disponível em: [http://localhost:3000](http://localhost:3000)

Você deve ver uma mensagem similar:
```
▲ Next.js 16.0.0
  - Local:        http://localhost:3000
  - Environments: .env.local
```

### Passo 5: Verificar Instalação Completa

Quando todos os serviços estiverem rodando:

1. **Frontend:** Acesse [http://localhost:3000](http://localhost:3000) e você deve ver a página inicial do formulário de censo
2. **Admin Dashboard:** Acesse [http://localhost:3000/admin](http://localhost:3000/admin) (requer autenticação)
3. **API Health Check:** Acesse [http://localhost:8000/v1/health](http://localhost:8000/v1/health)
4. **Adminer:** Acesse [http://localhost:8080](http://localhost:8080) para gerenciar o banco de dados

---

## Configuração Detalhada de Variáveis de Ambiente

### Variáveis de Banco de Dados

| Variável | Descrição | Padrão | Exemplo |
|----------|-----------|--------|---------|
| `DB_HOST` | Host do PostgreSQL | localhost | postgres |
| `DB_PORT` | Porta do PostgreSQL | 5432 | 5432 |
| `DB_USER` | Usuário do banco | - | censo_user |
| `DB_PASSWORD` | Senha do banco | - | senha_segura_123 |
| `DB_NAME` | Nome do banco | - | censo_operacional |

### Variáveis da API Go

| Variável | Descrição | Padrão | Obrigatória |
|----------|-----------|--------|-----------|
| `PORT` | Porta da API | 8000 | Não |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt da senha admin | - | Sim |
| `ADMIN_JWT_SECRET` | Chave para assinar JWTs | - | Sim |
| `CORS_ALLOWED_ORIGINS` | Origins permitidas (comma-separated) | - | Não |

### Variáveis do Frontend

| Variável | Descrição | Padrão | Obrigatória |
|----------|-----------|--------|-----------|
| `NEXT_PUBLIC_API_URL` | URL base da API | http://localhost:8000 | Não |

### Integração Google (Opcional)

Para utilizar integração com Google Sheets e Google Drive:

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com)
2. Habilite as APIs: **Google Sheets API** e **Google Drive API**
3. Crie uma Service Account e baixe o JSON de credenciais
4. Configure as variáveis no `.env`:

```env
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"seu-projeto",...}
SPREADSHEET_ID=seu_id_planilha_aqui
GOOGLE_DRIVE_FOLDER_ID=seu_id_pasta_aqui
```

**Nota:** Sem essas variáveis, a aplicação funciona normalmente, mas o export automático para Google Sheets será desabilitado.

---

## Comandos de Desenvolvimento

### Backend (Go)

```bash
cd api

# Executar servidor de desenvolvimento
go run ./cmd/api/main.go

# Build para produção
go build -o bin/census ./cmd/api

# Gerar hash de senha
go run ./cmd/genpasswd/main.go

# Baixar dependências
go mod download

# Atualizar dependências
go mod tidy
```

### Frontend (Next.js)

```bash
cd web

# Instalar dependências
npm install

# Servidor de desenvolvimento (com hot reload)
npm run dev

# Build para produção
npm run build

# Executar produção localmente
npm run start

# Linting (ESLint)
npm run lint

# Formatação de código
npm run format
```

### Infraestrutura (Docker)

```bash
cd infra

# Iniciar PostgreSQL + Adminer
docker-compose up -d

# Parar containers
docker-compose down

# Ver logs em tempo real
docker-compose logs -f

# Remover volumes (limpa dados do banco)
docker-compose down -v
```

---

## Estrutura de Diretórios

```
CENSO-Operacional-Escolas/
├── api/                          # Backend Go
│   ├── cmd/
│   │   ├── api/main.go          # Ponto de entrada da API
│   │   └── genpasswd/main.go    # Gerador de hash bcrypt
│   ├── internal/
│   │   ├── models/              # Modelos de dados
│   │   └── services/            # Serviços (Google, Banco, etc)
│   ├── go.mod
│   └── go.sum
├── web/                          # Frontend Next.js
│   ├── src/
│   │   ├── app/                 # Rotas Next.js
│   │   ├── components/          # Componentes React
│   │   ├── schemas/             # Validações Zod
│   │   └── config/              # Configurações
│   ├── package.json
│   └── tsconfig.json
├── infra/                        # Infraestrutura
│   ├── docker-compose.yml       # Orquestração Docker
│   ├── init.sql                 # Script de inicialização BD
│   ├── .env.example             # Variáveis de ambiente (modelo)
│   └── migrations/              # Migrações SQL
├── docs/                         # Documentação adicional
└── README.md                     # Este arquivo
```

---

## Fluxo de Dados

```
┌─────────────────────────────────────┐
│  Diretores Escolares                │
│  (Interface Next.js - Port 3000)    │
└──────────┬──────────────────────────┘
           │
           │ POST /v1/census
           │ (Dados do Formulário)
           ▼
┌─────────────────────────────────────┐
│  API Go Backend (Port 8000)         │
│  - Validação                        │
│  - Autenticação (JWT)               │
│  - Lógica de Negócio                │
└──────────┬──────────────────────────┘
           │
           │ INSERT/UPDATE
           ▼
┌─────────────────────────────────────┐
│  PostgreSQL Database                │
│  - census_responses                 │
│  - schools                          │
│  - Dados estruturados               │
└──────────┬──────────────────────────┘
           │
           │ Background Job (10 min)
           │ Sincronização automática
           ▼
┌─────────────────────────────────────┐
│  Google Sheets (Opcional)           │
│  - Dados consolidados               │
│  - Relatórios automáticos           │
└─────────────────────────────────────┘
```

---

## Dicas de Desenvolvimento

### Hot Reload

- **Frontend:** Automático ao editar arquivos em `/web/src`
- **Backend:** Recomenda-se usar `air` ou reiniciar manualmente:
  ```bash
  go install github.com/cosmtrek/air@latest
  cd api && air
  ```

### Debug de Requisições

Use o Adminer para inspecionar dados:
- [http://localhost:8080](http://localhost:8080)

Ou use ferramentas como:
- **cURL**: `curl http://localhost:8000/v1/health`
- **Postman**: [https://www.postman.com](https://www.postman.com)
- **VS Code REST Client**: Extensão REST Client

### Limpar Dados

Para resetar o banco de dados:

```bash
cd infra
docker-compose down -v
docker-compose up -d
```

**Aviso:** Isso apaga todos os dados armazenados.

---

## Troubleshooting

### Erro: "connection refused" na porta 8000

- Verifique se a API está rodando: `go run ./cmd/api/main.go`
- Confirme que nenhuma outra aplicação está usando a porta 8000
- Reinicie a API

### Erro: "EADDRINUSE: address already in use :::3000"

- A porta 3000 está ocupada. Identifique qual processo está usando:
  ```bash
  # No Windows
  netstat -ano | findstr :3000
  ```
- Encerre o processo ou rode em outra porta: `PORT=3001 npm run dev`

### Erro: "database connection failed"

- Verifique se PostgreSQL está rodando:
  ```bash
  docker-compose ps
  ```
- Confirme as credenciais no `.env`
- Tente reconectar:
  ```bash
  docker-compose down
  docker-compose up -d
  ```

### Erro: "ADMIN_PASSWORD_HASH not set"

- Execute: `go run ./cmd/genpasswd/main.go`
- Copie o hash para `ADMIN_PASSWORD_HASH` no `.env`
- Reinicie a API

---

## Deploy em Produção

Para informações sobre deploy em produção, veja:
- Documentação de CI/CD (se disponível)
- Configurações de Railway ou outro serviço de hospedagem
- Variáveis de ambiente sensíveis devem usar um gerenciador de secrets

---

## Suporte e Contribuição

Para reportar problemas ou contribuir:

1. Abra uma **Issue** descrevendo o problema
2. Ou crie um **Pull Request** com a solução

Certifique-se de seguir os padrões de código existentes.