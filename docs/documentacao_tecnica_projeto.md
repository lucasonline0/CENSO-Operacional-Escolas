# Documentação Técnica do Projeto: Censo Operacional e Estrutural das Escolas (SEDUC-PA)

## 1. Visão Geral do Projeto

O sistema "Censo Operacional e Estrutural das Escolas" é uma plataforma desenvolvida para a Secretaria de Estado de Educação do Pará (SEDUC-PA) com o intuito de realizar levantamentos estruturais, de recursos humanos e de perfil escolar. O sistema foi projetado para capturar dados detalhados de mais de 800 escolas, provendo uma interface segura e robusta para os diretores e gestores escolares.

As principais funcionalidades incluem:

- Formulário multi-etapas ("Wizard") com validação robusta no lado do cliente e do servidor.
- Salvamento de rascunhos para preenchimento assíncrono.
- Dashboard analítico e gerencial para administradores e analistas de dados.
- Sincronização automatizada e em background (job assíncrono) com o ecossistema Google (Google Sheets).
- Suporte para exportação de dados do censo para formato PDF (jsPDF).

## 2. Arquitetura e Tecnologias

O projeto adota uma estrutura de **Monorepo**, onde o código do frontend, do backend e as configurações de infraestrutura coexistem em um único repositório, garantindo facilidade no deployment e orquestração.

### Stack Tecnológica

- **Backend**: Go (1.24+), utilizando roteamento via `go-chi` (Chi), `database/sql` nativo, e driver `pgx/v5` para conexão com PostgreSQL. A arquitetura preza por alta performance e **não utiliza ORMs**, operando diretamente com consultas e transações SQL seguras.
- **Frontend**: Framework Next.js 16 (App Router) sobre React 19. Totalmente tipado em TypeScript. Interface baseada em Tailwind CSS v3 e componentes Radix UI. Formulários são gerenciados com React Hook Form e validados estritamente pelo ecossistema Zod.
- **Banco de Dados**: PostgreSQL 16, conteinerizado com Docker.
- **Integração Externa**: APIs nativas de Google Sheets e Google Drive.

## 3. Estrutura do Código-Fonte

O repositório é segmentado em 3 diretórios essenciais:

### 3.1 Backend (`/api`)

Contém o servidor e lógica de integração desenvolvidos em Go.

- **`/cmd/api`**: O ponto de entrada principal (`main.go`). Ele centraliza a conexão ao banco de dados, incializa o job periódico para sincronização no Google Sheets e registra os mapeamentos de rotas com middlewares (`chi.Router`). Também inclui todos os endpoints expostos, como dados de censo e administração analítica protegida.
- **`/cmd/genpasswd`**: Utilitário em CLI desenvolvido para gerar hashes `bcrypt` seguros a partir de uma senha crua, para uso seguro no arquivo de variáveis de ambiente.
- **`/internal/models`**: Definições nativas de structs Go representando as entidades do domínio (ex: `School`, `CensusResponse`).
- **`/internal/services`**: Alojamento dos adapters e integrações, como `sheets.go` e `drive.go`, que operam com as APIs do ecossistema Google.
- **Autenticação**: Rotas administrativas localizadas em `/v1/admin/*` validam os Bearer Tokens usando JWT, controlam limitação de acesso de origens com CORS, protegendo contra requisições indesejadas.

### 3.2 Frontend (`/web`)

A interface do usuário cliente e de administração, escrita em Next.js.

- **`/src/app/page.tsx`**: Raiz do sistema de censo ("Wizard"), orquestrando os passos que o diretor escolar percorre.
- **`/src/app/admin/page.tsx`**: Interface do Dashboard do administrador que apresenta tabelas dinâmicas, views e métricas de preenchimento do formulário.
- **`/src/components/forms/`**: Alojamento da camada de apresentação de interface para os 11 ou mais formulários parciais lógicos do censo (desde identificação até observações gerais).
- **`/src/schemas/`**: Arquivos TypeScript de validação utilizando **Zod**, alinhados em paridade com as validações restritas existentes na API Go em backend.
- **`/src/config/steps.ts`**: Array de definição listando os passos do Censo que norteiam a renderização da IU de steps.
- **Draft Persistence**: Uma rotina no cliente que captura dados temporários parciais através de `localStorage`, prevendo reconexão e reinício em etapas específicas.

### 3.3 Infraestrutura (`/infra`)

Toda a parte de base de dados e de contêineres está versionada.

- **`docker-compose.yml`**: Serviço PostgreSQL principal (`postgres`) e o cliente gráfico `Adminer` para o banco de dados.
- **`/infra/migrations/` e `init.sql`**: Declaram a base do sistema relacional. As principais tabelas são:
  - `schools`: Cadastro com o perfil e características base das escolas referenciadas pelo código INEP (8 dígitos).
  - `census_responses`: Respostas consolidadas. Dados do complexo formulário frontend Next.js são armazenados ativamente num modelo flexível utilizando um campo nativo `JSONB`.

## 4. Fluxo de Operação e Dados (Data Flow)

A topologia principal ocorre de forma linear e otimizada:

1. **Submissão do Usuário**: O Gestor da escola avança nos formulários (Next.js) em `/web`. O andamento é salvo em cache de navegador do cliente e persistido. Ao concluir as etapas ("completed"), os dados disparam uma requisição em método POST para `/v1/census`.
2. **Recepção no Backend Go**: A API recebe, executa validação das structs, extrai as informações da escola e injeta um dump de todo o contexto num campo nativo flexível do Postgres (`census_responses.data` formatado como `JSONB`).
3. **Sincronização Back-Office**: Para suporte as planilhas da Secretaria da Educação, o backend não bloqueia a chamada ao usuário final; ao contrário, ele agenda a importação. Um worker job em segundo plano processa as linhas da tabela em background (a cada 10 mins) sincronizando registros não enviados com o **Google Sheets**.
4. **Leitura e Dashboards Analíticos**: O dashboard da administração realiza o consumo das informações a partir de requisições às views do banco de dados expostas pelo backend Go (nos endpoints `/v1/admin/analytics/*`).

## 5. Diretrizes de Engenharia e Clean Architecture (Padrões do Repositório)

Com a robustez do projeto, algumas decisões são adotadas e estritamente encorajadas:

- **Ausência de ORM**: Views analíticas robustas são modeladas e geridas diretamente com SQL (`CREATE OR REPLACE VIEW`). Evitando mapeamentos objetos-relacionais limitantes que sobrecarregam dados complexos e dinâmicos armazenados em `JSONB`.
- **Casts Seguros em JSONB**: Views e buscas no backend utilizam conversão rigorosa via regex SQL para contornar keys de JSON inexistentes, limitando exceções de leitura, exemplo: `CASE WHEN data->>'campo' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ... END`.
- **Refatoração Incremental**: Devido a base unificada de clientes que lêem a partir dos dados persistidos ou gerados de views, a migração do Dashboard e do formulário atua por "frentes temáticas" e com a adição de testes e checklists incrementais. Modificações na API nunca quebram as rotas pré-existentes.
