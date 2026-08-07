# Task — Ed — Autenticação e perfis por DRE

**Branch sugerida:** `feat/admin-perfis-dre-auth`  
**Dependência:** nenhuma  
**Não alterar:** questionário, endpoints públicos de gravação, componentes analíticos do frontend.

## 1. Objetivo

Criar a fundação de identidade e autorização que permita manter o admin atual com acesso amplo e adicionar usuários vinculados a uma única DRE.

A restrição precisa existir no backend e ser reutilizável pelos demais handlers.

## 2. Estado atual

Hoje existe apenas um usuário administrativo vindo de:

- `ADMIN_USERNAME`;
- `ADMIN_PASSWORD_HASH`;
- JWT HS256 com `username`.

O middleware atual coloca apenas o username no `context.Context`.

Isso não é suficiente para perfis DRE porque o servidor não conhece role nem escopo territorial do usuário.

## 3. Entregáveis

### ED-01 — migration de usuários administrativos

Criar a próxima migration disponível, mantendo o espelho em:

- `api/cmd/api/migrations/`;
- `infra/migrations/`.

Tabela sugerida: `admin_users`.

Campos mínimos:

```text
id
username UNIQUE NOT NULL
password_hash NOT NULL
role NOT NULL
 dre
active NOT NULL DEFAULT true
created_at
updated_at
```

Regras:

- nesta rodada a role persistida necessária é `dre`;
- `dre` é obrigatória para role `dre`;
- password_hash sempre bcrypt;
- nunca guardar plaintext;
- não migrar o admin atual para o banco nesta rodada;
- admin atual via env continua funcionando e recebe role lógica `admin`.

### ED-02 — modelo/repositório para usuário DRE

Criar código próprio para:

- localizar usuário ativo por username;
- validar password hash;
- validar DRE cadastrada;
- criar/atualizar/desativar conta por ferramenta administrativa.

Evitar colocar SQL de gerenciamento de usuário espalhado dentro do handler de login.

### ED-03 — login híbrido e claims

Evoluir `adminClaims` para carregar:

```go
Username string
Role     string
DRE      string
```

Fluxo de login:

1. se username corresponde ao admin configurado por env, validar como hoje e emitir `role=admin`, sem DRE;
2. caso contrário, procurar `admin_users` ativo;
3. validar bcrypt;
4. emitir `role=dre` + DRE cadastrada;
5. usar a mesma mensagem de erro para usuário inexistente/inativo/senha errada;
6. manter rate limit atual.

Não reduzir as proteções atuais do JWT.

### ED-04 — `AdminAccessScope` no context

Criar tipo/helper compartilhado:

```go
type AdminAccessScope struct {
    Username string
    Role     string
    DRE      string
}
```

`requireAdminAuth` deve validar claims e colocar o escopo no context.

Criar helper para handlers recuperarem o escopo sem parsear JWT de novo.

Regras:

- token `role=dre` sem DRE válida → rejeitar;
- role desconhecida → rejeitar;
- admin via env → `role=admin`;
- não confiar em role/DRE enviados em body ou query string.

### ED-05 — endpoint `/v1/admin/me`

Registrar rota protegida:

```text
GET /v1/admin/me
```

Retornar somente identidade necessária ao frontend:

```json
{
  "username": "...",
  "role": "admin|dre",
  "dre": "... ou null"
}
```

### ED-06 — autorização dos endpoints administrativos legados

Auditar endpoints que não pertencem à nova camada `analytics/*`.

Obrigatórios:

- `/admin/dashboard` deve respeitar DRE;
- `/admin/census` deve listar e resumir somente a DRE autorizada;
- `/admin/census/{id}` precisa fazer autorização objeto-a-objeto: usuário DRE não pode abrir Censo de outra DRE mesmo conhecendo o ID;
- `/admin/sync-sheets` deve ser `admin`-only;
- endpoints legados de Sheets que não conseguirem garantir escopo devem ser `admin`-only para evitar vazamento.

Não resolver isso escondendo botões no frontend; Pedro fará a UX, mas o backend deve responder corretamente sozinho.

### ED-07 — ferramenta de provisionamento

Criar CLI administrativa em `api/cmd/` para gerenciar usuários DRE.

Deve permitir no mínimo:

- criar usuário;
- associar a uma DRE válida existente em `schools`;
- atualizar senha;
- desativar conta;
- listar contas sem expor hash;
- detectar DRE inválida.

Senhas reais não entram em migration, fixture ou documentação.

Se o CLI receber senha, preferir entrada que não deixe plaintext salvo no repositório. Nunca logar password/hash desnecessariamente.

## 4. Arquivos que Ed pode alterar

Principalmente:

```text
api/cmd/api/admin.go
api/cmd/api/main.go
api/cmd/api/admin_scope.go             (novo, sugerido)
api/cmd/api/admin_users.go             (novo, sugerido)
api/cmd/api/*_test.go                  (testes relacionados)
api/cmd/api/migrations/0018_*.sql
infra/migrations/0018_*.sql
api/cmd/admin-user/*                   (novo, nome livre)
```

Pode alterar models/helpers se necessário, mas evitar arquivos analíticos que pertencem ao Lucas.

## 5. Arquivos que Ed não deve alterar

```text
web/src/components/admin/*
web/src/app/admin/page.tsx
api/cmd/api/analytics*.go
api/cmd/api/reports*.go
web/src/components/forms/*
web/src/schemas/steps/*
```

Exceção: se um ajuste mínimo de compilação compartilhada for inevitável, registrar no PR antes do merge para evitar conflito.

## 6. Testes obrigatórios

Criar testes cobrindo:

1. login admin legado continua válido;
2. login DRE válido emite role e DRE corretas;
3. senha errada não autentica;
4. conta inativa não autentica;
5. token DRE sem DRE é inválido;
6. token expirado continua inválido;
7. algoritmo JWT inválido continua rejeitado;
8. `/admin/me` retorna o perfil correto;
9. DRE_A não abre `/admin/census/{id}` pertencente a DRE_B;
10. DRE não executa `/admin/sync-sheets`;
11. admin continua conseguindo usar as ações já existentes.

## 7. Critérios de aceite

- nenhuma credencial real versionada;
- admin atual não perde acesso;
- existe forma controlada de provisionar perfis para todas as DREs;
- DRE faz parte do JWT/context e não da confiança no frontend;
- BOLA em `/admin/census/{id}` está bloqueado;
- operações globais ficam `admin`-only;
- helper `AdminAccessScope` fica pronto para Lucas usar;
- `go test ./...` passa.

## 8. Handoff para Lucas e Pedro

Ao concluir, informar no PR:

- nome final do tipo/helper de escopo;
- como obter `Role` e `DRE` do context;
- payload final de `/admin/me`;
- códigos HTTP usados para acesso fora do escopo (`403` ou `404`).

Lucas não deve duplicar parsing de JWT. Pedro não deve usar dados persistidos no navegador como fonte de autorização; `/admin/me` é a referência para UX.
