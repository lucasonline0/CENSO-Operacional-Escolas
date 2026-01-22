# Censo Operacional e Estrutural das Escolas (SEDUC)

Este repositório contém o código-fonte do sistema de levantamento estrutural, recursos humanos e perfil escolar da Secretaria de Estado de Educação. O sistema foi projetado para garantir alta disponibilidade, integridade de dados e segurança da informação, utilizando uma arquitetura moderna e escalável.

## Visão Geral do Projeto

O objetivo principal deste software é prover uma interface segura e robusta para que diretores e gestores escolares submetam dados detalhados sobre suas unidades. O sistema utiliza um padrão de formulário multi-etapas ("Wizard") com validação estrita de dados no lado do cliente e do servidor, assegurando a consistência das informações armazenadas.

### Principais Funcionalidades

* **Coleta de Dados em Etapas:** Segmentação do censo em 14 seções lógicas para redução de carga cognitiva e melhoria da experiência do usuário.
* **Salvamento de Rascunho:** Capacidade de persistência parcial de dados, permitindo preenchimento assíncrono.
* **Validação Robusta:** Verificação de integridade de dados (CPF, CNPJ, INEP) em múltiplas camadas.
* **Segurança:** Proteção nativa contra SQL Injection, XSS e CSRF. Autenticação via JWT (JSON Web Tokens).

## Arquitetura Técnica

O projeto segue a estrutura de **Monorepo**, consolidando frontend, backend e infraestrutura em um único repositório versionado.

### Tecnologias Utilizadas

* **Backend:** Go (Golang)
    * *Framework:* Fiber ou Gin (Alta performance HTTP)
    * *ORM:* GORM (Prevenção de SQL Injection e mapeamento objeto-relacional)
    * *Autenticação:* JWT Standard
* **Frontend:** React com Next.js (App Router)
    * *Linguagem:* TypeScript (Tipagem estática estrita)
    * *Estilização:* Tailwind CSS
    * *Gerenciamento de Formulários:* React Hook Form + Zod (Schema Validation)
* **Banco de Dados:** PostgreSQL
* **Infraestrutura:** Docker & Docker Compose

### Estrutura de Diretórios

A organização do código segue a separação de responsabilidades:

* `/api`: Contém todo o código-fonte do servidor Backend em Go, seguindo princípios de Clean Architecture.
* `/web`: Contém a aplicação Frontend em Next.js.
* `/infra`: Arquivos de configuração de infraestrutura, orquestração de containers e definições de banco de dados.

---

#### Desenvolvido para Secretaria de Estado de Educação

- Desenvolvido por: lucasonline0 