# Censo Operacional e Estrutural das Escolas (SEDUC-PA)

Sistema da Secretaria de Estado de Educação do Pará (SEDUC-PA) para consolidação, análise e acompanhamento dos dados do Censo Operacional das escolas.

O projeto é um monorepo com frontend em Next.js, backend em Go e PostgreSQL. O fluxo administrativo atual usa o PostgreSQL hospedado no Railway como fonte principal dos dados e indicadores do painel `/admin`.

> **Estado atual do projeto:** o período de preenchimento público do formulário está encerrado por padrão. O desenvolvimento corrente está concentrado no painel administrativo e nas consultas analíticas sobre PostgreSQL.

## Arquitetura atual

```text
┌──────────────────────────────┐
│ Next.js                      │
│ Frontend / Painel Admin      │
└──────────────┬───────────────┘
               │ HTTP / JSON
               ▼
┌──────────────────────────────┐
│ API Go                       │
│ Chi + database/sql + pgx     │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ PostgreSQL                   │
│ Railway                      │
└──────────────────────────────┘
```

### Desenvolvimento local

No setup padrão de desenvolvimento, frontend e backend rodam localmente e a API acessa o PostgreSQL do Railway:

```text
http://localhost:3000
          │
          ▼
http://localhost:8000
          │
          │ conexão externa PostgreSQL
          ▼
     Railway Postgres
```

A integração antiga com Google Sheets/Drive ainda possui código legado no repositório, mas **não é necessária para iniciar a API nem para usar o fluxo principal do painel administrativo**. Não configure Google Cloud, Service Account, planilha ou Drive para o setup local padrão.

## Stack

### Backend

- Go 1.24+
- Chi
- `database/sql`
- `pgx/v5`
- PostgreSQL
- JWT para autenticação administrativa
- bcrypt para senha do administrador

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Radix UI
- Zod
- React Hook Form

### Infraestrutura

- Railway para API e PostgreSQL em produção
- PostgreSQL 16
- Docker Compose disponível apenas como alternativa para banco local

## Estrutura do repositório

```text
CENSO-Operacional-Escolas/
├── api/                      # API Go
│   ├── cmd/api/              # entrada da API e handlers
│   ├── cmd/genpasswd/        # gerador de hash bcrypt
│   └── internal/             # models e services
├── web/                      # aplicação Next.js
│   └── src/
├── infra/
│   ├── .env.example          # exemplo de configuração
│   ├── docker-compose.yml    # PostgreSQL local opcional
│   ├── init.sql
│   └── migrations/
└── docs/                     # documentação técnica adicional
```

# Executar localmente

## Pré-requisitos

Instale:

- Git
- Go 1.24 ou superior
- Node.js 20 ou superior
- npm

Docker não é necessário para o fluxo padrão quando o banco do Railway é utilizado.

## 1. Clonar o repositório

```bash
git clone https://github.com/lucasonline0/CENSO-Operacional-Escolas.git
cd CENSO-Operacional-Escolas
git checkout develop
```

## 2. Criar o arquivo de ambiente

```bash
cd infra
cp .env.example .env
```

O backend procura `.env` em mais de um local e reconhece `infra/.env` quando executado a partir de `api/`.

## 3. Configurar o banco Railway

No serviço **Postgres** do Railway existem duas URLs com finalidades diferentes:

- `DATABASE_URL`: conexão privada entre serviços dentro do projeto Railway.
- `DATABASE_PUBLIC_URL`: conexão externa via TCP Proxy, usada quando a aplicação está rodando fora do Railway, como no computador do desenvolvedor.

Para desenvolvimento local, copie o valor de `DATABASE_PUBLIC_URL` do serviço Postgres e use-o em `DB_DSN`:

```env
DB_DSN="postgresql://usuario:senha@host-publico:porta/railway"
```

> Nunca faça commit da URL real do banco ou de qualquer segredo.

O backend resolve a conexão nesta ordem:

1. `DATABASE_URL`
2. `DB_DSN`
3. `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`

Por isso, no setup padrão local basta fornecer `DB_DSN`.

### Produção no Railway

No serviço `CENSO-Operacional-Escolas`, prefira uma variável de referência apontando para a URL privada do serviço Postgres, por exemplo:

```text
DB_DSN=${{Postgres.DATABASE_URL}}
```

Isso mantém o tráfego entre API e banco na rede privada do Railway.

## 4. Configurar autenticação administrativa

O `.env` local precisa das credenciais administrativas:

```env
ADMIN_USERNAME=admin_local
ADMIN_PASSWORD_HASH=<hash_bcrypt>
ADMIN_JWT_SECRET=<segredo_aleatorio_com_no_minimo_32_caracteres>
```

### Gerar o hash da senha

O gerador recebe a senha como argumento e exige pelo menos 12 caracteres:

```bash
cd api
go run ./cmd/genpasswd 'SuaSenhaForteAqui'
```

Copie somente o hash retornado para `ADMIN_PASSWORD_HASH`.

### Gerar o segredo JWT

Exemplo:

```bash
openssl rand -hex 32
```

A API não inicia se `ADMIN_JWT_SECRET` tiver menos de 32 caracteres.

## 5. Configurar CORS

Para frontend local:

```env
ALLOWED_ORIGINS=http://localhost:3000
```

A variável correta consumida pelo backend é `ALLOWED_ORIGINS`.

## 6. Manter o formulário público encerrado

O envio público do Censo é controlado por:

```env
CENSUS_SUBMISSIONS_ENABLED=false
```

Apenas o valor `true` abre novamente os endpoints públicos de escrita.

Se a variável estiver ausente, o comportamento também é de período encerrado.

Não é necessário preencher o formulário para trabalhar no painel administrativo.

## 7. Arquivo `.env` mínimo para desenvolvimento local

Exemplo:

```env
# API
PORT=8000

# Banco remoto Railway
DB_DSN="postgresql://usuario:senha@host-publico:porta/railway"

# Admin
ADMIN_USERNAME=admin_local
ADMIN_PASSWORD_HASH=$2a$10$SUBSTITUIR_PELO_HASH_REAL
ADMIN_JWT_SECRET=SUBSTITUIR_POR_SEGREDO_ALEATORIO_COM_32_OU_MAIS_CARACTERES

# CORS
ALLOWED_ORIGINS=http://localhost:3000

# Formulário público encerrado
CENSUS_SUBMISSIONS_ENABLED=false
```

## 8. Iniciar o backend

```bash
cd api
go mod download
go run ./cmd/api
```

Verifique:

```bash
curl http://localhost:8000/v1/health
```

## 9. Iniciar o frontend

Em outro terminal:

```bash
cd web
npm install
npm run dev
```

Abra:

- Painel administrativo: `http://localhost:3000/admin`
- API: `http://localhost:8000`
- Health check: `http://localhost:8000/v1/health`

O frontend já usa `http://localhost:8000` como fallback. Portanto, `web/.env.local` não é obrigatório enquanto a API estiver nessa URL.

Se precisar usar outra API:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

# Variáveis de ambiente

## Backend

| Variável | Função | Obrigatória no setup padrão |
| --- | --- | --- |
| `DB_DSN` | DSN PostgreSQL para desenvolvimento local | Sim |
| `DATABASE_URL` | DSN PostgreSQL; tem prioridade sobre `DB_DSN` | Não |
| `PORT` | Porta HTTP da API | Não, padrão `8000` |
| `ADMIN_USERNAME` | Usuário administrativo principal | Sim para login via env |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt da senha admin | Sim para login via env |
| `ADMIN_JWT_SECRET` | Assina os JWTs administrativos | Sim |
| `ALLOWED_ORIGINS` | Whitelist CORS | Recomendado |
| `CENSUS_SUBMISSIONS_ENABLED` | Abre/fecha escrita do formulário público | Não; ausente = fechado |
| `PUBLIC_API_KEY` | Gate opcional dos endpoints públicos | Não |
| `TRUSTED_PROXY_COUNT` | Quantidade de proxies confiáveis para resolução de IP | Não |

### Fallback para PostgreSQL local

Se `DATABASE_URL` e `DB_DSN` não estiverem definidos, a API aceita:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=censo_user
DB_PASSWORD=sua_senha
DB_NAME=censo_db
DB_SSLMODE=disable
```

Esse modo é alternativo ao fluxo padrão com Railway.

## Frontend

| Variável | Função | Obrigatória |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | URL da API | Não em localhost:8000 |
| `NEXT_PUBLIC_API_KEY` | Envia `X-API-Key` quando o gate público é usado | Não |

`NEXT_PUBLIC_*` é exposto ao navegador. Portanto, `NEXT_PUBLIC_API_KEY` não deve ser tratado como segredo de autenticação.

# Google Sheets e Drive

Google Sheets e Google Drive são integrações **legadas** no estado atual do projeto.

Ainda existem services, endpoints e alguns fallbacks antigos relacionados a Sheets/Drive, mas eles não fazem parte do setup local padrão do painel administrativo.

Não é necessário configurar:

```text
GOOGLE_CREDENTIALS_JSON
SPREADSHEET_ID
DRIVE_ROOT_FOLDER_ID
GOOGLE_IMPERSONATE_EMAIL
```

para iniciar o backend e trabalhar no fluxo principal do `/admin`.

Novas funcionalidades do painel não devem criar dependência de Google Sheets quando os dados já estão disponíveis no PostgreSQL.

# Banco local via Docker — opcional

O repositório ainda contém `infra/docker-compose.yml` para quem precisa de um PostgreSQL isolado localmente.

```bash
cd infra
docker compose up -d
```

Esse fluxo sobe PostgreSQL e Adminer e **não é necessário** quando `DB_DSN` aponta para Railway.

Para desligar:

```bash
docker compose down
```

Para apagar também o volume local:

```bash
docker compose down -v
```

O comando acima afeta apenas o banco Docker local, não o banco Railway.

# Fluxo de dados administrativo

```text
Usuário administrativo
        │
        ▼
Next.js /admin
        │ Bearer JWT
        ▼
Go API /v1/admin/*
        │
        ▼
PostgreSQL
        │
        ├── schools
        ├── census_responses
        ├── views analíticas
        └── tabelas auxiliares
```

Os endpoints analíticos ficam sob `/v1/admin/analytics/*` e são protegidos por JWT.

# Formulário público

O código do formulário continua no projeto, porém o período de preenchimento pode ser encerrado sem desligar o painel administrativo.

Estado recomendado enquanto o formulário estiver fora de uso:

```env
CENSUS_SUBMISSIONS_ENABLED=false
```

As rotas públicas de leitura continuam disponíveis conforme a configuração da API, mas as escritas de escola, censo e upload são bloqueadas pelo middleware de período.

# Comandos úteis

## Backend

```bash
cd api

go run ./cmd/api
go build ./cmd/api/...
go test ./...
go mod download
go mod tidy
```

## Frontend

```bash
cd web

npm install
npm run dev
npm run build
npm run start
npm run lint
```

# Segurança operacional

- Nunca versione `.env`, URLs reais do Railway, hashes/segredos administrativos ou credenciais Google.
- Não exponha `ADMIN_JWT_SECRET` no frontend.
- Use `ALLOWED_ORIGINS` para limitar as origens permitidas.
- Acesso local ao banco remoto pode alterar dados reais. Antes de executar migrations, `UPDATE`, `DELETE` ou scripts de importação, confirme qual ambiente Railway está sendo utilizado.
- Para trabalho frequente de desenvolvimento, prefira um banco/ambiente de staging quando disponível.
- Em produção no Railway, prefira `DATABASE_URL` privada/referenciada entre os serviços, em vez da URL pública do TCP Proxy.

# Troubleshooting

## `ERRO FATAL: Variáveis de banco ... não foram encontradas`

Confirme se `infra/.env` existe e contém `DB_DSN` ou `DATABASE_URL` válido.

## `ERRO FATAL SEGURANÇA: ADMIN_JWT_SECRET ...`

Gere um novo segredo:

```bash
openssl rand -hex 32
```

## Frontend não acessa a API

Confirme:

```env
ALLOWED_ORIGINS=http://localhost:3000
```

E teste:

```bash
curl http://localhost:8000/v1/health
```

## Formulário mostra "Período de preenchimento encerrado"

Esse é o comportamento esperado quando:

```env
CENSUS_SUBMISSIONS_ENABLED=false
```

ou quando a variável não existe.

## Avisos sobre Sheets/Drive no boot

No setup sem Google, services legados podem registrar avisos de credenciais ausentes. Esses avisos não impedem a inicialização da API nem o uso do fluxo principal do painel administrativo.

---

Documentação adicional de dashboard, views analíticas, validações e diagnósticos está disponível em [`docs/`](./docs/).
