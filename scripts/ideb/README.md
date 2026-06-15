# Importador IDEB 2023 — `scripts/ideb/`

Importador **versionado** da base oficial **IDEB 2023** (INEP) para a tabela
`ideb_resultados` do dashboard próprio do Censo Operacional e Estrutural das
Escolas da Rede Estadual da SEDUC/PA.

Este utilitário cobre os incrementos **IDEB-03A — Importador e dry-run** e
**IDEB-03B — apply controlado**. O modo padrão continua sendo o **dry-run**
(não escreve no banco); a carga real (`--apply`) só roda com as três travas
combinadas `--apply --confirm-apply --batch-id <id>`.

> Referência metodológica:
> [`docs/dashboard/perfil-alunos-resultados-ideb-2023.md`](../../docs/dashboard/perfil-alunos-resultados-ideb-2023.md)
> e a migration [`infra/migrations/0017_create_ideb_resultados.sql`](../../infra/migrations/0017_create_ideb_resultados.sql).

## O que o importador faz

1. lê a planilha oficial do IDEB 2023 (aba `IDEB 2023`);
2. valida as colunas esperadas (falha clara se faltar coluna);
3. normaliza etapa, INEP e campos numéricos;
4. classifica `status_ideb` e `detalhe_status_ideb`;
5. resolve o vínculo com `schools` por `codigo_inep`;
6. em dry-run, gera um relatório local (Markdown + JSON);
7. em apply (IDEB-03B), carrega os dados via `INSERT ... ON CONFLICT DO UPDATE`.

## Dados brutos ficam em `_local/` (NÃO versionado)

A planilha de origem é um **insumo local** e **não deve ser versionada**. O
diretório `_local/` está no `.gitignore`. O caminho padrão esperado é:

```txt
_local/ideb/fontes/ideb_2023_iniciais_finais_medio.xlsx
```

Os relatórios gerados também ficam em `_local/` e **não devem ser versionados**:

```txt
_local/ideb/relatorios/import_dry_run_ideb_2023.md
_local/ideb/relatorios/import_dry_run_ideb_2023.json
```

Nunca versione a planilha, CSVs ou relatórios com dados reais.

## Instalação de dependências

```bash
pip install -r scripts/ideb/requirements.txt
```

- `openpyxl` — leitura da planilha (preserva INEP como texto).
- `psycopg[binary]` — conexão PostgreSQL. **Opcional** no dry-run (só para
  simular o match com `schools`); **obrigatória** para a carga real (`--apply`).

Estas dependências são exclusivas deste utilitário Python — não são adicionadas
ao backend Go nem ao frontend.

## Como executar o dry-run

```bash
python scripts/ideb/import_ideb_resultados.py \
  --source _local/ideb/fontes/ideb_2023_iniciais_finais_medio.xlsx \
  --ano 2023 \
  --dry-run
```

O modo padrão é seguro: se nenhum modo for informado, o script assume
`--dry-run` automaticamente. Nenhuma escrita é feita no banco.

Para garantir que nenhuma conexão de banco seja tentada (nem para simular o
match), use `--no-db`:

```bash
python scripts/ideb/import_ideb_resultados.py --source <planilha> --ano 2023 --no-db
```

## Variáveis de ambiente de banco aceitas

A conexão (opcional no dry-run) é resolvida nesta ordem, espelhando o backend
(`api/cmd/import-prodep/main.go`):

```txt
--dsn  >  DATABASE_URL  >  DB_DSN  >  DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (+DB_SSLMODE)
```

Um `.env` na raiz ou em `infra/.env` é carregado em best-effort. O script
**nunca** imprime senha, token ou DSN completo — qualquer DSN aparece
**mascarado** no log e no relatório.

Comportamento conforme a disponibilidade de banco:

- **dry-run sem banco** → segue sem erro; `school_id = NULL` e
  `status_vinculo = pendente_validacao` (match real não executado);
- **dry-run com banco** → consulta `schools` (somente `SELECT`) para simular o
  match por `codigo_inep`, sem escrever nada;
- **apply sem banco** → falha com mensagem clara.

## Carga real (IDEB-03B) — habilitada, sob travas

A carga real está habilitada, mas protegida por **três travas combinadas**. O
fluxo é:

```bash
python scripts/ideb/import_ideb_resultados.py \
  --source _local/ideb/fontes/ideb_2023_iniciais_finais_medio.xlsx \
  --ano 2023 \
  --apply --confirm-apply \
  --batch-id ideb_2023_YYYYMMDD_HHMMSS
```

Regras de segurança da carga:

- `--apply` exige confirmação explícita `--confirm-apply`;
- `--apply` exige `--batch-id` explícito (rastreabilidade/auditoria);
- `--apply` é incompatível com `--no-db` e exige conexão bem-sucedida (o vínculo
  com `schools` é resolvido antes de qualquer escrita);
- a carga usa `INSERT ... ON CONFLICT (ano, codigo_inep, etapa) DO UPDATE`;
- **nunca** usa `TRUNCATE` nem `DELETE` amplo;
- `created_at` não é alterado em update; apenas `updated_at` é atualizado;
- **não rode `--apply` contra o banco compartilhado (Railway) sem autorização
  humana explícita.**

## Garantias metodológicas

- O importador preserva IDEB ausente (`-`, `ND`, vazio) como **`NULL`, nunca
  `0`** — ausência é cobertura/elegibilidade, não desempenho ruim.
- `codigo_inep` é preservado como **texto** (zeros à esquerda mantidos; sufixo
  `.0` do Excel removido).
- `percentual_avaliado > 100` é preservado como **alerta de qualidade**, não
  corrigido silenciosamente.
- Agregações por DRE/município calculadas a partir desta base **não** são IDEB
  oficial agregado do INEP — são cálculo do dashboard.
- Divergência de nome com o mesmo INEP é apenas **alerta de conferência**, nunca
  bloqueio automático.
