# Recuperação de migrations administrativas DRE

As migrations `0018`–`0021` são tratadas como críticas pelo runtime. Se uma delas falhar, a API não deve iniciar como se o schema estivesse saudável.

## Antes de corrigir

1. Faça backup/snapshot do PostgreSQL.
2. Preserve a mensagem completa de erro da migration.
3. Não remova constraints, FKs ou índices apenas para forçar o startup.

## Colisões de username

A identidade normalizada é `LOWER(BTRIM(username))`.

```sql
SELECT LOWER(BTRIM(username)) AS chave, COUNT(*) AS total,
       ARRAY_AGG(id ORDER BY id) AS ids,
       ARRAY_AGG(username ORDER BY id) AS usernames
FROM admin_users
GROUP BY LOWER(BTRIM(username))
HAVING COUNT(*) > 1;
```

Renomeie explicitamente o registro correto conforme a regra operacional. A migration nunca escolhe automaticamente qual usuário manter.

## Colisões de nome de DRE

A identidade normalizada é `LOWER(BTRIM(nome))`.

```sql
SELECT LOWER(BTRIM(nome)) AS chave, COUNT(*) AS total,
       ARRAY_AGG(id ORDER BY id) AS ids,
       ARRAY_AGG(nome ORDER BY id) AS nomes
FROM dres
GROUP BY LOWER(BTRIM(nome))
HAVING COUNT(*) > 1;
```

Antes de consolidar DREs duplicadas, confira `schools.dre_id` e `admin_users.dre_id`. Não exclua uma DRE que ainda possua vínculos.

## Verificação do schema canônico

```sql
SELECT conname
FROM pg_constraint
WHERE conname IN ('fk_schools_dre_id', 'fk_admin_users_dre_id');

SELECT indexname
FROM pg_indexes
WHERE indexname IN (
  'uq_admin_users_username_normalized',
  'uq_dres_nome_normalized'
);
```

Os dois FKs e os dois índices normalizados devem existir após a recuperação.

## Reaplicação

Depois de corrigir os dados legados, reinicie a API. `applyMigrations` reaplica as migrations idempotentes na ordem e interrompe novamente o startup se o problema persistir.

Para validação manual em ambiente controlado, as cópias operacionais ficam em `infra/migrations/`; os arquivos de runtime embutidos ficam em `api/cmd/api/migrations/` e devem permanecer idênticos.

## Rollback de emergência da 0021

Somente se for necessário voltar o binário para uma versão anterior, e após snapshot:

```sql
DROP INDEX IF EXISTS uq_admin_users_username_normalized;
DROP INDEX IF EXISTS uq_dres_nome_normalized;
```

Esse rollback remove apenas a proteção nova de unicidade normalizada. Ele não desfaz os vínculos canônicos `dre_id` da migration `0020`.
