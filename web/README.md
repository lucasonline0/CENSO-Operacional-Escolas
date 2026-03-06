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

Para subir o ambiente de desenvolvimento completo (Banco de Dados + Adminer), utilize o Docker Compose dentro da pasta `/infra`:

```bash
cd infra
docker-compose up -d