# Relações canônicas de DRE por ID (#204)

## Fonte de verdade

A partir da migration `0020_dre_canonical_relations.sql`, `dres.id` é a identidade canônica de uma DRE.

- `schools.dre_id -> dres.id`
- `admin_users.dre_id -> dres.id`

As colunas textuais `schools.dre` e `admin_users.dre` permanecem temporariamente para compatibilidade com handlers, analytics e relatórios que ainda não foram migrados. Elas não devem ser usadas para criar novas relações lógicas.

## Backfill

A migration resolve registros legados comparando `TRIM` + caixa ignorada, mas somente quando existe uma correspondência única na tabela mestre `dres`.

A migration falha explicitamente quando:

- existem duas DREs equivalentes após normalização de caixa/espaços;
- existe `dre_id` preenchido apontando para DRE inexistente;
- uma escola possui DRE textual não reconciliável;
- um usuário `role=dre` não pode ser associado a uma DRE mestre.

Nenhum registro é associado arbitrariamente.

## Compatibilidade transitória

Triggers `BEFORE INSERT/UPDATE` mantêm os dois formatos sincronizados durante a transição:

- write legado com `dre` textual resolve `dre_id` e normaliza o nome;
- write novo com `dre_id` resolve o nome textual canônico;
- referência inválida é rejeitada pelo trigger/FK.

Essa bridge existe para permitir que #204 seja integrada sem exigir que #205/#207 alterem todos os consumidores no mesmo PR.

## Rename

O relacionamento não quebra quando `dres.nome` muda porque o vínculo persistente é `dre_id`. A migration é idempotente e, quando reexecutada, realinha o texto legado a partir do ID canônico.

A atualização transacional do texto legado no momento do rename pertence à #205. A remoção das dependências textuais de filtros/analytics pertence à #207.

## Limites desta task

#204 não:

- remove o fallback legado de `ValidateDRE` — #205;
- implementa revogação runtime de JWT — #206;
- migra filtros/analytics para `dre_id` — #207;
- cria unicidade case-insensitive permanente — #208.

## Rollback

Enquanto consumidores legados ainda dependerem das colunas textuais, um rollback deve ocorrer em ordem inversa:

1. interromper writes que usem apenas `dre_id`;
2. garantir que `dre` textual esteja preenchido a partir de `dres.nome`;
3. remover triggers de compatibilidade;
4. remover constraints/FKs e índices de `dre_id`;
5. remover `dre_id` somente após confirmar que nenhum consumidor depende dele.

Não remover `dre_id` após #205/#207 sem uma migration de rollback específica.
