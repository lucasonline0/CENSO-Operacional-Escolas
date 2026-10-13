# Provisioning de usuário DRE por `dre_id`

## Contrato canônico

Novos clientes devem criar contas regionais com `POST /v1/admin/users` enviando `dre_id` como identidade da DRE:

```json
{
  "username": "usuario.dre",
  "email": "usuario.dre@exemplo.org",
  "password": "senha-com-12-ou-mais",
  "role": "dre",
  "dre_id": 123
}
```

O backend usa `dre_id` como única autoridade para estabelecer o vínculo `admin_users.dre_id -> dres.id`. O nome da DRE é dado de apresentação e é resolvido a partir da entidade mestre atual.

`email` é obrigatório para novos perfis e deve ser um endereço válido. O backend normaliza o valor com trim e caixa minúscula e aceita domínios válidos arbitrários. Essa exigência existe para garantir o destinatário da comunicação automática de acesso.

A resposta de sucesso continua expondo os dois campos para consumo do cliente:

```json
{
  "error": false,
  "message": "Usuário criado com sucesso",
  "data": {
    "id": 456,
    "username": "usuario.dre",
    "email": "usuario.dre@exemplo.org",
    "role": "dre",
    "dre": "DRE atual",
    "dre_id": 123,
    "active": true
  }
}
```

## Compatibilidade temporária do campo `dre`

O campo textual `dre` permanece aceito quando `dre_id` não é enviado para preservar clientes legados durante a migração do frontend da task #244. Nesse caminho legado, o backend resolve primeiro a DRE na entidade mestre e persiste a relação canônica por ID.

Quando `dre_id` está presente, o backend nunca usa `dre` como fallback de identidade. Se ambos forem enviados, `dre` funciona somente como uma asserção de consistência contra o nome atual da DRE identificada por `dre_id`:

- `dre_id` válido + `dre` compatível (ignorando caixa e espaços externos): criação permitida;
- `dre_id` válido + `dre` de outra DRE/nome stale: `400 Bad Request`;
- `dre_id` inexistente, inválido ou de DRE inativa: `400 Bad Request`;
- `dre_id` sem `dre`: caminho preferencial e canônico.

O campo `email` não pode ser omitido, vazio ou inválido em nenhum caminho de criação de perfil, incluindo provisionamento em massa e CLI. O cadastro mestre da DRE continua podendo existir sem e-mail quando não houver criação de perfil.

Após a migração do frontend em #244, o caminho textual poderá ser descontinuado em task específica, sem alterar a identidade persistida.

## Invariantes

- rename da DRE não muda `dres.id` nem `admin_users.dre_id`;
- carregar a lista de DREs, renomear a regional e depois submeter o mesmo `dre_id` continua vinculando à mesma entidade;
- nomes longos não participam da decisão de identidade no caminho canônico;
- DRE inativa ou inexistente não aceita novo usuário;
- contas legadas já existentes sem e-mail continuam podendo autenticar;
- payload contraditório não é aceito silenciosamente;
- a relação persistida e a resposta de criação carregam o `dre_id` solicitado e o nome atual resolvido pela entidade mestre.
