# Importação PRODEP — banco e comando de carga

Este documento descreve o **PR técnico 1** da frente PRODEP: a estrutura de
banco (`prodep_repasses`, `prodep_import_batches`) e o comando de importação
`cmd/import-prodep`, que carrega os repasses financeiros do PRODEP a partir do
artefato final aprovado na frente de saneamento PRODEP/base_dige.

## Objetivo

Trazer os dados **financeiros** do PRODEP (Programa Dinheiro Direto na Escola,
esfera estadual) para o PostgreSQL da aplicação, mantendo a identidade por
`codigo_inep_prodep` e **sem alterar** o cadastro operacional (`schools`).

A carga é o insumo para futuras frentes da aba "Gestão Financeira e
Governança" — **fora do escopo deste PR**, que entrega apenas tabela + importador.

## Arquivos esperados (entrada)

Os artefatos finais aprovados ficam em (não versionados — ver abaixo):

```txt
_local/prodep_base_dige_final/
  prodep_long_final.csv            ← entrada do importador
  prodep_repasses_final.xlsx
  prodep_school_overrides_final.csv
  prodep_pendencias_residuais_final.xlsx
  relatorio_qualidade_prodep_final.md
```

A entrada do importador é **`prodep_long_final.csv`** (formato long: 1 linha por
`codigo_inep_prodep` + `ano` + `categoria`).

### Por que o CSV não é versionado

`_local/` está no `.gitignore`. Os dados financeiros e cadastrais brutos do
PRODEP **não entram no repositório**: o git versiona o *código* de importação e
o *schema*, não os dados. A reprodutibilidade é garantida pelas invariantes
validadas (abaixo) e pelo `source_hash` (SHA-256) gravado em
`prodep_import_batches`.

## Tabelas criadas

Migration idempotente `0015_prodep_repasses.sql`, espelhada em:

- `api/cmd/api/migrations/0015_prodep_repasses.sql` (embarcada no binário via
  `go:embed`, aplicada no startup por `applyMigrations`);
- `infra/migrations/0015_prodep_repasses.sql` (cópia idêntica de referência);
- `infra/init.sql` (mesmo DDL, **sem dados**, para fresh boot de ambientes novos).

### `prodep_repasses`

Uma linha por `(codigo_inep_prodep, ano, categoria)`. Principais campos:

- `codigo_inep_prodep` (**TEXT, NOT NULL**) — chave de identidade financeira;
- `ano` (INTEGER) — `CHECK ano IN (2023, 2024, 2025)`;
- `categoria` (TEXT) — `CHECK categoria IN ('geral', 'alimentacao')`;
- `valor_recebido`, `valor_reprogramado` (NUMERIC(14,2));
- `status_prestacao_contas` — `CHECK IN ('ok','sem_recurso','nao_prestou_contas') OR NULL`;
- `match_status` — `CHECK IN ('matched_by_inep_schools','matched_by_base_dige','prodep_only_validado','anexo_vinculado_sede')`
  (mapeado de `match_status_final` do CSV);
- `usar_na_carga` (BOOLEAN);
- `school_id` (INTEGER, NULL) — FK opcional para `schools(id)`;
- `codigo_inep_sede` (TEXT, NULL), `school_id_sede` (INTEGER, NULL) — sede do anexo;
- `import_batch_id` (BIGINT, NULL) — FK para `prodep_import_batches(id)`.

Constraints: `UNIQUE (codigo_inep_prodep, ano, categoria)`, os `CHECK` acima e as
FKs `school_id`/`school_id_sede`/`import_batch_id` (`ON DELETE SET NULL`).
Índices por `ano`, `dre_prodep`, `municipio_resolvido`, `school_id`,
`match_status`, `codigo_inep_prodep` e `import_batch_id`.

### `prodep_import_batches`

Auditoria de cada execução de carga: `source_file`, `source_hash` (SHA-256 do
CSV), `rows_imported`, `total_valor_recebido`, `total_valor_reprogramado`,
`created_at`, `notes`.

## Comando de importação

Rode a partir da pasta `api/`:

```bash
# Dry-run: lê, valida o arquivo, valida FKs (se houver conexão) e NÃO grava nada
go run ./cmd/import-prodep --file ../_local/prodep_base_dige_final/prodep_long_final.csv --dry-run

# Carga real (idempotente): grava o batch e faz upsert
go run ./cmd/import-prodep --file ../_local/prodep_base_dige_final/prodep_long_final.csv
```

Flags:

- `--file` (obrigatório) — caminho do CSV;
- `--dry-run` — valida tudo, mas não grava;
- `--dsn` (opcional) — DSN PostgreSQL; por padrão usa as variáveis de ambiente
  do projeto (`DATABASE_URL` → `DB_DSN` → `DB_HOST/PORT/USER/PASSWORD/NAME`),
  carregadas de um `.env` nos mesmos locais que o servidor.

No **dry-run sem conexão/DSN**, o comando valida apenas o arquivo e avisa que as
FKs não foram validadas. Para validar FKs no dry-run, basta ter `DATABASE_URL`
(ou equivalente) disponível.

### Leitura do CSV

- `encoding/csv` da stdlib (sem dependências externas além das já presentes no
  `go.mod`: driver `pgx/v5/stdlib` e `joho/godotenv`);
- trata o **BOM UTF-8** na primeira coluna;
- valida o cabeçalho contra as 18 colunas obrigatórias (a ordem não importa).

## Invariantes validadas

Antes de gravar (e também no dry-run), o importador aborta se qualquer trava
falhar:

| Invariante | Valor esperado |
|---|---|
| Linhas | 5046 |
| INEPs distintos | 841 |
| `valor_recebido` total | 235.711.510,78 |
| `valor_reprogramado` total | 88.991.707,61 |
| `usar_na_carga` | `sim` em todas as linhas |
| Duplicatas `(codigo_inep_prodep, ano, categoria)` | 0 |

Distribuição por `match_status` (linhas / INEPs):

| match_status | linhas | INEPs |
|---|---|---|
| matched_by_inep_schools | 4476 | 746 |
| matched_by_base_dige | 540 | 90 |
| prodep_only_validado | 24 | 4 |
| anexo_vinculado_sede | 6 | 1 |

Os totais financeiros são conferidos **exatamente em centavos** (soma em inteiro,
sem drift de ponto flutuante). Não há `pendente_match` nem `nao_usar`.

## Pré-checagem de FKs

Antes do upsert, o comando confere que **todo** `school_id` e `school_id_sede`
não-nulo existe em `schools(id)`. Havendo órfãos, ele **aborta listando os ids
ausentes e não grava nada**.

## Regras metodológicas preservadas

- **`codigo_inep_prodep` é a chave de identidade e nunca é substituído** pelo
  `codigo_inep_sede`. O INEP original do PRODEP é preservado; a sede é registrada
  em colunas separadas (`codigo_inep_sede`, `school_id_sede`).
  - Caso especial validado: `codigo_inep_prodep = 15169480`
    (`EE REMIGIO FERNANDEZ ANEXO I`), `match_status = anexo_vinculado_sede`,
    `codigo_inep_sede = 15051552`, `school_id_sede = 173`, `usar_na_carga = sim`.
- **Separação financeira × cadastral.** PRODEP é fonte **financeira**; `schools`
  é o cadastro operacional. base_dige é fonte auxiliar de saneamento e **não
  substitui** `schools` automaticamente.
- **`schools` não é alterada** por esta carga — o importador apenas a referencia
  (e aborta em órfão de FK). Nenhuma escola é criada ou atualizada.
- **`matched_by_base_dige` e `prodep_only_validado` entram no financeiro**
  (têm repasses), **mas não vinculam automaticamente uma escola operacional**
  (`school_id` pode ser NULL) e, portanto, **não entram automaticamente no
  Índice de Saúde Operacional**, que se baseia em `schools`/censo.

## Idempotência

- A migration usa `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` e
  blocos `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` para as
  constraints — pode ser reaplicada a cada startup sem efeito colateral.
- A carga usa `INSERT ... ON CONFLICT (codigo_inep_prodep, ano, categoria) DO
  UPDATE` — reexecutar atualiza os campos financeiros/cadastrais e o
  `import_batch_id`/`updated_at`, **preservando `created_at`**. Cada execução
  registra um novo batch em `prodep_import_batches`.
