# Especificação de Entrega de Dados por Gráfico — Dashboard Admin

## 1. Objetivo

Detalhar, para cada gráfico pendente ou parcial identificado na auditoria do Dashboard Admin, o caminho técnico necessário para entregar o dado ao frontend.

Este documento é complementar a `docs/dashboard/lacunas-backend-frontend-por-bloco.md`. A auditoria identifica a lacuna por aba/bloco; esta especificação transforma cada lacuna em uma unidade técnica de implementação, registrando origem provável do dado, tratamento, view/query, endpoint, payload esperado, frontend, dependências e próxima ação.

Esta especificação é somente documental. Não cria endpoints, views, migrations, componentes ou alterações de código.

## 2. Relação entre abas auxiliares da planilha e views SQL

No painel original baseado em planilhas, vários gráficos dependiam de abas auxiliares. Essas abas auxiliares não eram apenas armazenamento: elas transformavam campos brutos em dimensões analíticas.

No PostgreSQL, o equivalente técnico dessas abas auxiliares deve ser:

1. view SQL normalizada ou query analítica;
2. endpoint analítico com payload estável;
3. componente frontend consumindo esse payload.

Portanto, uma view só "substitui" uma aba auxiliar se entregar o mesmo tratamento: normalização de campo multivalorado, agregação por dimensão, cálculo de percentual, ordenação e critério de recorte.

| Planilha/Looker | PostgreSQL/API |
|---|---|
| Aba auxiliar de etapas | View/query que explode etapas por escola |
| Aba auxiliar de modalidades | View/query que normaliza modalidades por escola |
| Aba auxiliar de turnos | View/query que calcula turnos por escola e por porte |
| Aba auxiliar de ambientes | `vw_censo_ambientes` ou view derivada com essencialidade |
| Aba auxiliar de equipamentos | View de equipamentos por tipo/quantidade |
| Aba auxiliar de RH | View de RH por vínculo/tipo |
| Gráfico no Looker | Componente React consumindo endpoint analítico |

## 3. Como usar este documento

Use cada item como base para abrir uma task pequena e verificável. A ordem recomendada está no final do documento, mas cada gráfico pode ser convertido em uma tarefa independente quando suas dependências estiverem resolvidas.

Antes de implementar, validar se a lacuna continua verdadeira na branch base e registrar a comparação numérica contra a fonte atual quando houver equivalência em planilha/Looker Studio.

## 4. Convenções

- **Origem provável** indica a fonte mais provável pela leitura estática de código, migrations e documentação. Quando houver dúvida, o item fica marcado como "a confirmar".
- **View ou transformação necessária** pode ser uma view nova, uma view existente, uma query no endpoint ou uma decisão de produto antes de qualquer SQL.
- **Payload esperado** descreve o contrato lógico para o frontend. Endpoints existentes usam alguns tipos com `valor`; novos contratos podem mapear esse campo para `label` no frontend ou padronizar a resposta nova.
- **Percentual** deve ser calculado sobre escolas distintas elegíveis no recorte, respeitando `status = 'completed'`, ano de referência e filtros globais quando aplicável.
- **Porte** deve usar o critério de `vw_censo_enriquecida.porte_escola_nome`, salvo decisão posterior documentada.
- **Campos multivalorados** devem ser normalizados em formato long antes da agregação sempre que o gráfico contar escolas por valor da lista.

## 5. Gráficos pendentes ou parciais — Alta prioridade

### 5.1 Caracterização da Rede — Organização da Oferta e Funcionamento

#### 5.1.1 Etapas ofertadas

**O que o gráfico deve mostrar**  
Distribuição de escolas por etapa ofertada, com quantidade de escolas e percentual sobre o total de escolas do recorte.

**Como era tratado na planilha/painel original**  
Dependia de campo multivalorado tratado em aba auxiliar. Cada escola podia contribuir para mais de uma etapa, portanto a lista precisava virar linhas antes de contar escolas por etapa.

**Origem provável do dado no banco**  
`schools.etapas_ofertadas`, armazenado como texto com JSON/lista serializada. Confirmar se há divergência com `census_responses.data.etapas_ofertadas` em registros legados.

**View ou transformação necessária**  
Criar view/query que normalize o campo para `school_id + etapa`, por exemplo `vw_censo_etapas_ofertadas`. A view deve tratar JSON/lista com segurança e ignorar valores vazios.

**Endpoint necessário**  
Novo endpoint recomendado: `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento`.

**Payload esperado**  
```ts
{
  etapas_ofertadas: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar em `web/src/components/admin/AbaCaracterizacao.tsx`, anchor `sec-perfil-oferta`, com `HBarChart` ou `Donut`, mantendo a tabela de DRE no bloco de dimensão.

**Dependências de produto/dados**  
Confirmar vocabulário oficial das etapas e se etapas sem censo concluído devem aparecer quando constam apenas em `schools`.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Criar task backend para normalizar etapas e expor `etapas_ofertadas`; depois criar task frontend para renderizar o gráfico no bloco de oferta.

#### 5.1.2 Modalidades ofertadas

**O que o gráfico deve mostrar**  
Distribuição de escolas por modalidade ofertada, com contagem e percentual.

**Como era tratado na planilha/painel original**  
Dependia de aba auxiliar para transformar campo multivalorado em linhas por escola/modalidade antes da agregação.

**Origem provável do dado no banco**  
`schools.modalidades_ofertadas`, armazenado como texto com JSON/lista serializada. Confirmar eventual cópia em `census_responses.data`.

**View ou transformação necessária**  
Criar view/query normalizada `school_id + modalidade`, por exemplo `vw_censo_modalidades_ofertadas`, com parse seguro e remoção de vazios.

**Endpoint necessário**  
Mesmo endpoint recomendado de oferta: `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento`.

**Payload esperado**  
```ts
{
  modalidades_ofertadas: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar em `AbaCaracterizacao.tsx`, anchor `sec-perfil-oferta`, preferencialmente próximo ao gráfico de etapas.

**Dependências de produto/dados**  
Confirmar lista oficial de modalidades e tratamento de variações textuais.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Incluir normalização de modalidades na mesma task do endpoint de oferta/funcionamento.

#### 5.1.3 Distribuição por turnos

**O que o gráfico deve mostrar**  
Distribuição de escolas por turno de funcionamento: Manhã, Tarde, Noite e Integral, com quantidade e percentual.

**Como era tratado na planilha/painel original**  
Dependia de aba auxiliar para abrir o campo multivalorado de turnos. O gráfico conta escolas por turno declarado, não quantidade de turmas por turno.

**Origem provável do dado no banco**  
`schools.turnos`, armazenado como texto com JSON/lista serializada. A estrutura precisa ser confirmada, pois não é equivalente aos campos numéricos `turmas_manha`, `turmas_tarde`, `turmas_noite` e `turmas_integral` em `vw_censo_base`.

**View ou transformação necessária**  
Criar view/query normalizada `school_id + turno`, por exemplo `vw_censo_turnos_ofertados`. Caso o campo institucional esteja inconsistente, documentar regra de fallback antes de usar os campos de turmas.

**Endpoint necessário**  
`GET /v1/admin/analytics/caracterizacao/oferta-funcionamento`.

**Payload esperado**  
```ts
{
  turnos: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar em `AbaCaracterizacao.tsx`, anchor `sec-perfil-oferta`, como donut ou barra horizontal.

**Dependências de produto/dados**  
Confirmar se o turno oficial vem de `schools.turnos` ou se deve ser derivado de turmas com quantidade maior que zero. A segunda opção muda a semântica.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Abrir task de diagnóstico do campo `turnos` e só então implementar a agregação.

#### 5.1.4 Média de turnos por porte

**O que o gráfico deve mostrar**  
Média de turnos distintos ofertados por escola, agrupada por porte da escola.

**Como era tratado na planilha/painel original**  
Dependia de uma etapa intermediária por escola: primeiro contar `qtd_turnos_distintos_por_escola`, depois agrupar por porte.

**Origem provável do dado no banco**  
`schools.turnos` para calcular a quantidade de turnos por escola; `vw_censo_enriquecida.porte_escola_nome` para agrupar por porte.

**View ou transformação necessária**  
Após normalizar turnos, calcular `qtd_turnos_distintos_por_escola` e agregar com `AVG(qtd_turnos_distintos_por_escola) GROUP BY porte_escola_nome`. Pode ser query no endpoint ou view derivada se for reutilizado.

**Endpoint necessário**  
`GET /v1/admin/analytics/caracterizacao/oferta-funcionamento`.

**Payload esperado**  
```ts
{
  media_turnos_por_porte: Array<{
    porte: string;
    media_turnos: number;
  }>;
}
```

**Frontend necessário**  
Renderizar tabela compacta ou barra em `AbaCaracterizacao.tsx`, anchor `sec-perfil-oferta`.

**Dependências de produto/dados**  
Confirmar critério oficial de turno e se escolas com `turnos` vazio entram como zero ou "Não informado".

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Implementar junto com a normalização de turnos, mantendo teste de contagem por escola.

### 5.2 Caracterização da Rede — Infraestrutura Educacional

> **Status (CAR-INFRA-01 — entregue 1ª versão):** o endpoint `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional` foi implementado e o bloco renderizado em `AbaCaracterizacao.tsx` (anchor `sec-perfil-infra`). A lista oficial inicial de ambientes essenciais usada no cálculo é: **Biblioteca, Laboratório de Ciências, Laboratório de Informática, Quadra Esportiva, Refeitório, Cozinha, Sala dos Professores, SAEE** — devolvida no payload em `ambientes_essenciais` para exibição na janela informativa. Denominador de todos os percentuais: total de escolas concluídas no ano corrente (não apenas as que declararam ambientes).

#### 5.2.1 Presença de ambientes — **entregue**

**O que o gráfico deve mostrar**  
Ranking ou distribuição de ambientes existentes, com escolas e percentual por ambiente.

**Como era tratado na planilha/painel original**  
Dependia de aba auxiliar que expandia a lista de ambientes declarados por escola.

**Origem provável do dado no banco**  
`vw_censo_ambientes`, criada pela migration `0007_vw_censo_ambientes.sql`, com uma linha por `school_id + year + ambiente`.

**View ou transformação necessária**  
A view existente já é suficiente. O endpoint sintético dentro de Caracterização foi implementado (CAR-INFRA-01), usando `COUNT(DISTINCT school_id) GROUP BY ambiente` e percentual sobre o total do recorte.

**Endpoint necessário**  
Entregue: `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`.

**Payload esperado**  
```ts
{
  ambientes: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Entregue: renderizado em `AbaCaracterizacao.tsx`, anchor `sec-perfil-infra`, como bloco sintético sem duplicar a profundidade da aba Infraestrutura e Segurança.

**Dependências de produto/dados**  
Refino futuro: confirmar com produto se o gráfico deve exibir todos os ambientes ou apenas Top N.

**Tipo de lacuna**  
Entregue (CAR-INFRA-01).

**Próxima ação recomendada**  
Nenhuma ação obrigatória. Refino futuro de apresentação (Top N vs. todos os ambientes) com a área de produto.

#### 5.2.2 Cobertura de ambientes essenciais — **entregue com lista oficial inicial**

**O que o gráfico deve mostrar**  
Indicadores de cobertura dos ambientes considerados essenciais: média de essenciais presentes, percentual de escolas com cobertura plena e distribuição por faixa.

**Como era tratado na planilha/painel original**  
Dependia de aba auxiliar com marcação de essencialidade ou cálculo equivalente por escola.

**Origem provável do dado no banco**  
`vw_censo_ambientes` para presença; `vw_censo_enriquecida.porte_escola_nome` para recorte por porte. A lista oficial inicial de ambientes essenciais já foi definida e entregue (ver Status acima).

**View ou transformação necessária**  
Entregue: o endpoint marca `is_essencial` com base na lista oficial inicial e calcula, por escola, `qtd_ambientes_essenciais_presentes`, `percentual_cobertura_essenciais` e `faixa_cobertura`.

**Endpoint necessário**  
Entregue: `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`.

**Payload esperado**  
```ts
{
  cobertura_essenciais: {
    media_ambientes_essenciais: number;
    pct_cobertura_plena: number;
    por_faixa: Array<{
      label: string;
      escolas: number;
      percentual: number;
    }>;
  };
}
```

**Frontend necessário**  
Entregue: KPIs + donut de faixas + modal informativo em `AbaCaracterizacao.tsx`, anchor `sec-perfil-infra`.

**Dependências de produto/dados**  
Refino futuro: revisar a lista oficial de ambientes essenciais com a área de produto. A lista inicial já está em produção.

**Tipo de lacuna**  
Entregue (CAR-INFRA-01).

**Próxima ação recomendada**  
Nenhuma ação obrigatória. Refino futuro da lista de essenciais com produto.

#### 5.2.3 Média de ambientes essenciais por porte — **entregue com lista oficial inicial**

**O que o gráfico deve mostrar**  
Média de ambientes essenciais presentes por escola em cada faixa de porte.

**Como era tratado na planilha/painel original**  
Dependia do mesmo cálculo intermediário de essencialidade por escola, depois agrupado por porte.

**Origem provável do dado no banco**  
`vw_censo_ambientes` + `vw_censo_enriquecida.porte_escola_nome`, com a regra oficial inicial de ambientes essenciais já aplicada.

**View ou transformação necessária**  
Entregue: contagem de essenciais presentes por escola e agregação `AVG(qtd_essenciais_presentes) GROUP BY porte_escola_nome`.

**Endpoint necessário**  
Entregue: `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`.

**Payload esperado**  
```ts
{
  media_essenciais_por_porte: Array<{
    porte: string;
    media: number;
  }>;
}
```

**Frontend necessário**  
Entregue: barra por porte em `AbaCaracterizacao.tsx`, anchor `sec-perfil-infra`.

**Dependências de produto/dados**  
Refino futuro: mesma revisão da lista oficial de essenciais do item anterior.

**Tipo de lacuna**  
Entregue (CAR-INFRA-01).

**Próxima ação recomendada**  
Nenhuma ação obrigatória. Eventual refino acompanha a revisão da lista de essenciais.

### 5.3 Infraestrutura e Segurança — Energia, Climatização e Capacidade Elétrica

#### 5.3.1 Rede elétrica atende demanda

**O que o gráfico deve mostrar**  
Percentual de escolas em que a rede elétrica atende à demanda atual.

**Como era tratado na planilha/painel original**  
Campo categórico/booleano agregado em KPI ou distribuição Sim/Não.

**Origem provável do dado no banco**  
`vw_censo_infraestrutura_seguranca.rede_eletrica_atende`, derivado de `census_responses.data.rede_eletrica_atende`.

**View ou transformação necessária**  
A view atual já expõe o campo. Falta expor no endpoint do bloco de energia/climatização.

**Endpoint necessário**  
Preferência técnica: `GET /v1/admin/analytics/infraestrutura/energia-climatizacao`. Alternativa: expansão controlada de `GET /v1/admin/analytics/infraestrutura/condicoes`.

Endpoint dedicado alinha melhor o payload ao bloco e evita misturar condições estruturais com energia. Expandir `/condicoes` cria menos rota, mas aumenta acoplamento.

**Payload esperado**  
```ts
{
  pct_rede_eletrica_atende: number;
}
```

**Frontend necessário**  
Substituir o empty state em `AbaInfraestruturaSeguranca.tsx`, anchor `sec-infra-energia`, por KPI.

**Dependências de produto/dados**  
Confirmar a semântica do campo e quais respostas equivalem a "Sim".

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Criar endpoint dedicado de energia/climatização e validar percentuais contra amostra.

#### 5.3.2 Estrutura permite climatização

**O que o gráfico deve mostrar**  
Percentual de escolas cuja estrutura permite climatização.

**Como era tratado na planilha/painel original**  
Campo categórico/booleano agregado como KPI ou distribuição.

**Origem provável do dado no banco**  
`vw_censo_infraestrutura_seguranca.estrutura_climatizacao`.

**View ou transformação necessária**  
A view atual já expõe o campo. Falta agregação no endpoint.

**Endpoint necessário**  
`GET /v1/admin/analytics/infraestrutura/energia-climatizacao` ou expansão controlada de `/infraestrutura/condicoes`.

**Payload esperado**  
```ts
{
  pct_estrutura_climatizacao: number;
}
```

**Frontend necessário**  
Renderizar KPI em `AbaInfraestruturaSeguranca.tsx`, anchor `sec-infra-energia`.

**Dependências de produto/dados**  
Confirmar tratamento de respostas textuais, "parcial" ou não informado.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Adicionar a métrica ao mesmo payload de energia/climatização.

#### 5.3.3 Climatização das salas

**O que o gráfico deve mostrar**  
Distribuição das escolas por situação de climatização das salas e total de salas climatizadas.

**Como era tratado na planilha/painel original**  
Dependia de cálculo derivado entre quantidade de salas de aula e salas climatizadas.

**Origem provável do dado no banco**  
`vw_censo_enriquecida.situacao_climatizacao_salas` e `vw_censo_base.salas_climatizadas`.

**View ou transformação necessária**  
`vw_censo_enriquecida` já calcula a categoria. Falta endpoint que agregue a distribuição e some `salas_climatizadas`.

**Endpoint necessário**  
`GET /v1/admin/analytics/infraestrutura/energia-climatizacao`.

**Payload esperado**  
```ts
{
  dist_climatizacao_salas: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
  total_salas_climatizadas: number;
}
```

**Frontend necessário**  
Renderizar donut/barra e KPI em `AbaInfraestruturaSeguranca.tsx`, anchor `sec-infra-energia`.

**Dependências de produto/dados**  
Confirmar se escolas sem `qtd_salas_aula` entram como "Não informado" e se devem compor o denominador.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Implementar no mesmo endpoint dedicado de energia/climatização.

### 5.4 Serviços Terceirizados — Governança / Supervisão

#### 5.4.1 Supervisor por serviço

**O que o gráfico deve mostrar**  
Percentual ou contagem de escolas com supervisor declarado para Merenda, Serviços Gerais e Portaria.

**Como era tratado na planilha/painel original**  
Dependia de agrupar campos de supervisão por tipo de serviço, criando uma dimensão `servico`.

**Origem provável do dado no banco**  
`vw_censo_rh_merendeiras.possui_supervisor_merenda`, `vw_censo_rh_servicos_gerais.possui_supervisor_sg` e `vw_censo_servicos_terceirizados.possui_supervisor_portaria`.

**View ou transformação necessária**  
Pode ser query no endpoint com `UNION ALL` por serviço. Se houver reuso, criar view derivada long `school_id + servico + possui_supervisor`.

**Endpoint necessário**  
Novo endpoint recomendado: `GET /v1/admin/analytics/servicos-terceirizados/governanca`.

**Payload esperado**  
```ts
{
  supervisao_por_servico: Array<{
    servico: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Substituir o empty state em `AbaServicosTerceirizados.tsx`, anchor `sec-servicos-governanca`, por barra ou cards compactos.

**Dependências de produto/dados**  
Confirmar se o denominador é todas as escolas concluídas ou apenas escolas com o serviço terceirizado/empresa informada.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Definir denominador e criar endpoint de governança.

#### 5.4.2 Avaliação da supervisão

**O que o gráfico deve mostrar**  
Distribuição das avaliações da supervisão dos serviços terceirizados.

**Como era tratado na planilha/painel original**  
Dependia de campo categórico textual, possivelmente normalizado para uma escala padrão.

**Origem provável do dado no banco**  
`vw_censo_servicos_terceirizados.avaliacao_supervisao`.

**View ou transformação necessária**  
A view já expõe o campo. Falta normalização da escala e agregação.

**Endpoint necessário**  
`GET /v1/admin/analytics/servicos-terceirizados/governanca`.

**Payload esperado**  
```ts
{
  avaliacao_supervisao: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut ou barra em `AbaServicosTerceirizados.tsx`, anchor `sec-servicos-governanca`.

**Dependências de produto/dados**  
Confirmar escala oficial das avaliações e tratamento de respostas textuais.

**Tipo de lacuna**  
Produto, depois Backend + Frontend.

**Próxima ação recomendada**  
Validar escala oficial antes de agregar.

#### 5.4.3 Avaliação dos serviços

**O que o gráfico deve mostrar**  
Distribuição das avaliações por tipo de serviço: Merendeiras, Portaria, Limpeza/Serviços Gerais e Comunicação, conforme campos disponíveis.

**Como era tratado na planilha/painel original**  
Dependia de transformar múltiplos campos de avaliação em uma dimensão `servico + avaliacao`.

**Origem provável do dado no banco**  
`vw_censo_servicos_terceirizados.avaliacao_merendeiras`, `avaliacao_portaria`, `avaliacao_limpeza` e `avaliacao_comunicacao`.

**View ou transformação necessária**  
Query no endpoint com `UNION ALL` por serviço, ou view long `school_id + servico + avaliacao`.

**Endpoint necessário**  
`GET /v1/admin/analytics/servicos-terceirizados/governanca`.

**Payload esperado**  
```ts
{
  avaliacao_servicos: Array<{
    servico: string;
    avaliacao: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar tabela compacta, barras agrupadas ou lista por serviço em `AbaServicosTerceirizados.tsx`, anchor `sec-servicos-governanca`.

**Dependências de produto/dados**  
Confirmar escala oficial e se `avaliacao_comunicacao` pertence ao mesmo bloco semântico dos serviços terceirizados.

**Tipo de lacuna**  
Produto, depois Backend + Frontend.

**Próxima ação recomendada**  
Validar escala e semântica dos campos antes da implementação.

## 6. Gráficos pendentes ou parciais — Média prioridade

### 6.1 Merenda Escolar — Estrutura Física

#### 6.1.1 Tamanho da cozinha

> **Status: ✅ ENTREGUE (MER-01A).** Mesmo gráfico de §6.6.3 — `dist_tamanho_cozinha` exposto em `/merenda/oferta` e renderizado em `sec-merenda-estrutura`.

**O que o gráfico deve mostrar**  
Distribuição de escolas por tamanho declarado da cozinha.

**Como era tratado na planilha/painel original**  
Campo categórico agregado em distribuição.

**Origem provável do dado no banco**  
`vw_censo_equipamentos_merenda.tamanho_cozinha`.

**View ou transformação necessária**  
A view atual já expõe o campo. Falta incluir a distribuição no payload do endpoint.

**Endpoint necessário**  
Opção simples: expandir `GET /v1/admin/analytics/merenda/oferta`. Opção mais limpa se o bloco Estrutura Física crescer: criar `GET /v1/admin/analytics/merenda/estrutura-fisica`.

Se for apenas `tamanho_cozinha`, a expansão de `/merenda/oferta` é suficiente. Se novos indicadores de estrutura física entrarem, endpoint dedicado reduz acoplamento.

**Payload esperado**  
```ts
{
  dist_tamanho_cozinha: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar em `AbaMerenda.tsx`, anchor `sec-merenda-estrutura`, junto de condições da cozinha e refeitório.

**Dependências de produto/dados**  
Confirmar categorias válidas do campo e tratamento de texto livre, se existir.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor `dist_tamanho_cozinha` e renderizar distribuição no bloco de Estrutura Física.

### 6.2 Caracterização da Rede — Dimensão e Perfil da Rede

#### 6.2.1 Reposicionamento do Detalhamento por DRE

**O que o gráfico deve mostrar**  
Tabela Detalhamento por DRE semanticamente dentro do bloco Dimensão e Perfil da Rede.

**Como era tratado na planilha/painel original**  
Não é lacuna de dado. É organização visual/semântica do dashboard.

**Origem provável do dado no banco**  
Endpoint existente `GET /v1/admin/analytics/caracterizacao/dre`, campo `detalhamento`.

**View ou transformação necessária**  
Nenhuma. O backend existente é suficiente.

**Endpoint necessário**  
Nenhum endpoint novo.

**Payload esperado**  
Usar payload já existente:

```ts
{
  detalhamento: Array<{
    dre: string;
    escolas: number;
    total_alunos: number;
    media_alunos_por_escola: number;
    salas_aula: number;
  }>;
}
```

**Frontend necessário**  
Mover visualmente a tabela em `web/src/components/admin/AbaCaracterizacao.tsx`, mantendo anchor/bloco `sec-perfil-dimensao`.

**Dependências de produto/dados**  
Nenhuma dependência de dados. Pode depender de validação visual da organização dos blocos.

**Tipo de lacuna**  
Frontend.

**Próxima ação recomendada**  
Abrir task frontend isolada para reposicionar a tabela, sem tocar backend.

### 6.3 Pessoal e Gestão Escolar — Coordenação Pedagógica

#### 6.3.1 Tabela complementar de áreas declaradas

**O que o gráfico deve mostrar**  
Leitura tabular complementar das áreas de coordenação declaradas por escola ou por agregação de área, caso a equipe considere que o gráfico atual não basta.

**Como era tratado na planilha/painel original**  
Poderia aparecer como tabela auxiliar/lista além do gráfico percentual.

**Origem provável do dado no banco**  
Endpoint existente `GET /v1/admin/analytics/pessoal-gestao/coordenacao`, campo `por_area`; view `vw_censo_coordenacao_area`.

**View ou transformação necessária**  
Nenhuma obrigatória. A view e o payload atuais suportam a leitura agregada por área.

**Endpoint necessário**  
Nenhum endpoint novo se a tabela for agregada. Endpoint adicional só seria necessário para lista escola-a-escola, que não está definida como requisito mínimo.

**Payload esperado**  
Usar payload atual:

```ts
{
  por_area: Array<{
    valor: string;
    escolas: number;
    percentual: number;
  }>;
  cobertura_media: number;
}
```

**Frontend necessário**  
Opcional em `AbaPessoalGestao.tsx`, anchor `sec-pessoal-coordenacao`: renderizar tabela compacta baseada em `por_area` se o gráfico atual não for suficiente.

**Dependências de produto/dados**  
Decidir se a tabela é necessária. Se o gráfico atual for aceito, não há ação.

**Tipo de lacuna**  
Frontend opcional.

**Próxima ação recomendada**  
Validar com produto se a tabela complementar entra ou se o gráfico atual substitui a necessidade.

### 6.4 Tecnologia e Equipamentos — Parque Tecnológico

#### 6.4.1 Percentual de computadores inoperantes

**O que o gráfico deve mostrar**  
Percentual de equipamentos computacionais inoperantes no parque tecnológico, além do total absoluto já renderizado.

**Como era tratado na planilha/painel original**  
Depende de numerador e denominador explícitos. O numerador é computadores inoperantes; o denominador precisa ser definido.

**Origem provável do dado no banco**  
Numerador: `vw_censo_equipamentos_tecnologia.qtd_computadores_inoperantes`. Possíveis denominadores: `qtd_desktop_adm`, `qtd_desktop_alunos`, `qtd_notebooks`, `qtd_chromebooks`.

**View ou transformação necessária**  
Não implementar antes de decisão de produto. Após decisão, pode ser query no endpoint existente `GET /v1/admin/analytics/tecnologia/infraestrutura`.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/tecnologia/infraestrutura` com um campo percentual, se aprovado.

**Payload esperado**  
```ts
{
  percentual_computadores_inoperantes: number;
}
```

**Frontend necessário**  
Renderizar KPI percentual em `AbaTecnologia.tsx`, anchor `sec-tecnologia-parque`, sem remover o total atual.

**Dependências de produto/dados**  
Definir denominador oficial. Opções possíveis:

- total de computadores administrativos + alunos + notebooks + chromebooks;
- somente computadores de uso dos alunos;
- somente equipamentos considerados parque computacional.

**Tipo de lacuna**  
Produto.

**Próxima ação recomendada**  
Abrir decisão de produto sobre denominador antes de qualquer alteração backend/frontend.

### 6.5 Tecnologia e Equipamentos — Gráficos mínimos do Data Studio

> **Contexto.** O painel original (Data Studio/Looker Studio) organizava o tema em dois blocos visuais — "Infraestrutura Digital e Capacidade Instalada" e "Uso Pedagógico e Adequação Tecnológica". A aplicação desdobrou o primeiro em **Infraestrutura Digital** + **Parque Tecnológico** e manteve **Uso Pedagógico**. Esta seção detalha tecnicamente os gráficos mínimos do painel original que hoje estão **parciais** (existem como KPI, mas não como distribuição) ou **ausentes**. Vários indicadores já existem como percentual/KPI; a referência mínima do Data Studio exige a distribuição completa, por isso ficam classificados como pendentes. Esta seção é **somente documental** — não implementa endpoints, views nem frontend.
>
> Os endpoints existentes (`/v1/admin/analytics/tecnologia/{infraestrutura,uso-pedagogico}`) usam `CategoricStat` com o campo `valor`; novos contratos podem mapear `valor`→`label` no frontend ou padronizar o payload novo. As assinaturas de payload abaixo descrevem o contrato lógico desejado, não o formato atual.
>
> **Status de entrega (`feat/tecnologia-graficos-minimos-datastudio`).** Os gráficos §6.5.1 a §6.5.7 foram **implementados** por expansão dos dois endpoints existentes e renderização em `AbaTecnologia.tsx` (sem novo endpoint, view ou migration). Campos entregues: `disponibilidade_internet`, `media_equipamentos_por_escola` (substituiu a mediana — ver §6.5.2), distribuição do parque (% calculada no frontend), `computadores_atendem_demanda`, `possui_projetor_dist`, `possui_lousa_digital_dist`, `media_projetores_por_escola` e `total_computadores_inoperantes`. Permanece **pendente de produto** apenas o **percentual** de computadores inoperantes (§6.4.1 e §6.5.8), por falta de denominador oficial.

#### 6.5.1 Disponibilidade de internet

**O que o gráfico deve mostrar**  
Distribuição de escolas com e sem internet (Sim/Não), com contagem e percentual sobre o total de escolas do recorte.

**Como era tratado na planilha/painel original**  
Exibido como distribuição Sim/Não no bloco "Infraestrutura Digital e Capacidade Instalada", não apenas como KPI percentual.

**Origem provável do dado no banco**  
`vw_censo_equipamentos_tecnologia.internet_disponivel` (boolean), derivado de `census_responses.data`.

**View ou transformação necessária**  
A view já expõe o campo booleano. Falta agregar a distribuição Sim/Não no endpoint (hoje só há `percentual_internet` e `escolas_com_internet`).

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/tecnologia/infraestrutura`.

**Payload esperado**  
```ts
{
  disponibilidade_internet: Array<{
    label: "Sim" | "Não";
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut/barra Sim/Não em `web/src/components/admin/AbaTecnologia.tsx`, anchor `sec-tecnologia-digital`, sem remover o KPI "Escolas com Internet".

**Dependências de produto/dados**  
Confirmar tratamento de respostas vazias/não informadas (entram como "Não" ou categoria própria).

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor a distribuição Sim/Não no payload de infraestrutura e renderizar o donut.

#### 6.5.2 Quantidade média de equipamentos por escola

> **Histórico.** Este item foi originalmente especificado e entregue como **mediana** por escola. Após checagem dos dados de produção (ver abaixo), foi substituído pela **média** por escola, por decisão de produto.

**O que o gráfico deve mostrar**  
Média por escola para Chromebook, Desktop uso de alunos, Desktop administrativo e Notebook.

**Como era tratado na planilha/painel original**  
Estatística de capacidade instalada por escola e por tipo de equipamento, no bloco de capacidade instalada.

**Origem provável do dado no banco**  
`vw_censo_equipamentos_tecnologia.qtd_chromebooks`, `qtd_desktop_alunos`, `qtd_desktop_adm`, `qtd_notebooks`.

**View ou transformação necessária**  
A view já expõe as quantidades por escola. Cálculo da média por tipo (total declarado ÷ nº de escolas do recorte):

```sql
AVG(COALESCE(campo, 0))
```

por tipo de equipamento, sobre escolas concluídas no recorte.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/tecnologia/infraestrutura`.

**Payload esperado**  
```ts
{
  media_equipamentos_por_escola: Array<{
    valor: string;   // ex.: "Chromebooks", "Desktops de alunos", "Desktops administrativos", "Notebooks"
    media: number;
  }>;
}
```

**Frontend necessário**  
Renderizar barra/tabela em `AbaTecnologia.tsx`, anchor `sec-tecnologia-parque`.

**Dependências de produto/dados**  
Decidido após entrega: usar **média**, não mediana. A checagem em produção (822 escolas concluídas, 2026) mostrou que **70% declararam 0 desktops de alunos** (sem nenhum `NULL`), tornando a mediana legitimamente 0, mas pouco informativa — o total de 4.381 está concentrado em 30% das escolas. A média `AVG(COALESCE(campo,0))` (= total ÷ nº de escolas) é coerente com os cards de total e com a média de projetores por escola.

**Tipo de lacuna**  
Entregue.

**Próxima ação recomendada**  
Manter a média por tipo; nenhuma ação pendente.

#### 6.5.3 Distribuição do parque tecnológico (%)

**O que o gráfico deve mostrar**  
Participação percentual de cada tipo de equipamento no total do parque tecnológico declarado.

**Como era tratado na planilha/painel original**  
Distribuição percentual (%) do parque por tipo de equipamento.

**Origem provável do dado no banco**  
Totais de desktops administrativos, desktops de alunos, notebooks e chromebooks, já entregues como `SUM` no endpoint atual.

**View ou transformação necessária**  
Nenhuma view nova obrigatória. O percentual pode ser calculado a partir dos totais já existentes (no frontend ou no servidor): `quantidade_tipo / soma_total_parque`.

**Endpoint necessário**  
Pode ser derivado no frontend a partir do payload atual de `GET /v1/admin/analytics/tecnologia/infraestrutura`; alternativamente, expor o percentual já calculado no servidor.

**Payload esperado**  
```ts
{
  distribuicao_parque_tecnologico: Array<{
    label: string;
    quantidade: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut/barra de participação % em `AbaTecnologia.tsx`, anchor `sec-tecnologia-parque`.

**Dependências de produto/dados**  
Confirmar quais tipos compõem o "total do parque" (mesma decisão que afeta o denominador de computadores inoperantes).

**Tipo de lacuna**  
Frontend (e Backend se o percentual for calculado no servidor).

**Próxima ação recomendada**  
Decidir onde calcular o percentual e renderizar o gráfico de participação.

#### 6.5.4 Equipamentos atendem à demanda

**O que o gráfico deve mostrar**  
Distribuição Sim / Parcialmente / Não sobre a resposta das escolas.

**Como era tratado na planilha/painel original**  
Distribuição categórica com três respostas, no bloco "Uso Pedagógico e Adequação Tecnológica".

**Origem provável do dado no banco**  
`vw_censo_equipamentos_tecnologia.computadores_atendem`.

**View ou transformação necessária**  
A view já expõe o campo categórico. Hoje o endpoint só calcula `percentual_computadores_atendem` (% de "Sim"). Falta agregar a distribuição completa.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/tecnologia/infraestrutura`.

**Payload esperado**  
```ts
{
  computadores_atendem_demanda: Array<{
    label: string;   // "Sim" | "Parcialmente" | "Não" (conforme normalização)
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut/barra em `AbaTecnologia.tsx`, anchor `sec-tecnologia-pedagogico`, sem remover o KPI atual de "Computadores Atendem".

**Dependências de produto/dados**  
Confirmar as categorias oficiais e a normalização de variações textuais ("Parcialmente", "Em parte", etc.).

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor a distribuição Sim/Parcialmente/Não e renderizar.

#### 6.5.5 Projetor multimídia

**O que o gráfico deve mostrar**  
Distribuição Sim / Não sobre escolas que possuem projetor multimídia.

**Como era tratado na planilha/painel original**  
Distribuição Sim/Não no bloco de uso pedagógico.

**Origem provável do dado no banco**  
`vw_censo_equipamentos_tecnologia.possui_projetor` (boolean).

**View ou transformação necessária**  
A view já expõe o campo. Hoje o endpoint só calcula `percentual_com_projetor`. Falta agregar a distribuição Sim/Não.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/tecnologia/uso-pedagogico`.

**Payload esperado**  
```ts
{
  possui_projetor: Array<{
    label: "Sim" | "Não";
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut Sim/Não em `AbaTecnologia.tsx`, anchor `sec-tecnologia-pedagogico`, sem remover o KPI atual.

**Dependências de produto/dados**  
Confirmar tratamento de não informado.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor a distribuição Sim/Não e renderizar o donut.

#### 6.5.6 Lousa digital

**O que o gráfico deve mostrar**  
Distribuição Sim / Não sobre escolas que possuem lousa digital.

**Como era tratado na planilha/painel original**  
Distribuição Sim/Não no bloco de uso pedagógico.

**Origem provável do dado no banco**  
`vw_censo_equipamentos_tecnologia.possui_lousa_digital` (boolean).

**View ou transformação necessária**  
A view já expõe o campo. Hoje o endpoint só calcula `percentual_com_lousa_digital`. Falta agregar a distribuição Sim/Não.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/tecnologia/uso-pedagogico`.

**Payload esperado**  
```ts
{
  possui_lousa_digital: Array<{
    label: "Sim" | "Não";
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut Sim/Não em `AbaTecnologia.tsx`, anchor `sec-tecnologia-pedagogico`, sem remover o KPI atual.

**Dependências de produto/dados**  
Confirmar tratamento de não informado.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor a distribuição Sim/Não e renderizar o donut.

#### 6.5.7 Quantidade média de projetores por escola

**O que o gráfico deve mostrar**  
Média de projetores por escola no recorte.

**Como era tratado na planilha/painel original**  
Média por escola exibida como indicador no bloco de uso pedagógico.

**Origem provável do dado no banco**  
`vw_censo_equipamentos_tecnologia.qtd_projetores`.

**View ou transformação necessária**  
A view já expõe a quantidade por escola. Hoje o endpoint entrega `total_projetores` e `percentual_com_projetor`, mas não a média. Cálculo sugerido:

```sql
AVG(qtd_projetores)
```

sobre escolas concluídas no recorte (denominador — total de escolas — já disponível no backend).

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/tecnologia/uso-pedagogico`.

**Payload esperado**  
```ts
{
  media_projetores_por_escola: number;
}
```

**Frontend necessário**  
Renderizar KPI em `AbaTecnologia.tsx`, anchor `sec-tecnologia-pedagogico`, ao lado de "Total de Projetores".

**Dependências de produto/dados**  
Confirmar se a média considera todas as escolas concluídas ou apenas escolas que possuem projetor.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor `media_projetores_por_escola` no payload e renderizar KPI.

#### 6.5.8 Computadores inoperantes

**O que o gráfico deve mostrar**  
Número de escolas com computadores inoperantes e, se aprovado, percentual correspondente.

**Como era tratado na planilha/painel original**  
Indicador de escolas com computadores inoperantes no bloco de uso pedagógico/adequação tecnológica.

**Origem provável do dado no banco**  
`vw_censo_equipamentos_tecnologia.qtd_computadores_inoperantes`.

**View ou transformação necessária**  
O número de escolas (`escolas_com_computadores_inoperantes`) e o **total absoluto** de computadores inoperantes (`total_computadores_inoperantes`, via `SUM(qtd_computadores_inoperantes)`) já são entregues. O percentual depende de decisão de produto sobre o denominador. Ver também §6.4.1, que trata do percentual de computadores inoperantes sobre o parque.

**Endpoint necessário**  
Nº de escolas e total absoluto já entregues por `GET /v1/admin/analytics/tecnologia/infraestrutura`; percentual exigiria expansão após decisão de produto.

**Payload esperado**  
```ts
{
  escolas_com_computadores_inoperantes: number;
  total_computadores_inoperantes: number;          // entregue
  percentual_computadores_inoperantes?: number;    // pendente — decisão de produto
}
```

**Dependências de produto/dados**  
Definir se o percentual deve usar como denominador todas as escolas ou apenas escolas com algum computador declarado.

**Tipo de lacuna**  
Entregue (nº de escolas + total absoluto) / Produto (percentual).

**Próxima ação recomendada**  
Manter nº de escolas e total absoluto; decidir o denominador antes de expor o percentual.

### 6.6 Merenda Escolar — Gráficos mínimos do Data Studio

> **Contexto.** O painel original (Data Studio/Looker Studio) organizava Merenda em cinco blocos: **Oferta e Adequação**, **Estrutura Física**, **Equipamentos**, **Condições Sanitárias e Segurança** e **Recursos Humanos**. A aplicação preserva os quatro primeiros como blocos finalísticos e **reencaminhou o quinto (RH) para o menu Serviços Terceirizados** (bloco "Manipulador de Alimentos") em MER-RH-01 — ver §6.6.14 e `matriz-abas-e-graficos.md` §2.8/§5.5. Nenhuma migration/view nova foi criada.
>
> **Dados disponíveis na view.** A view `vw_censo_equipamentos_merenda` (migration `0009`) já contém: `condicoes_cozinha`, `tamanho_cozinha`, `possui_refeitorio`, `refeitorio_adequado`, `possui_balanca`, `bancadas_inox`, `sistema_exaustao`, `despensa_exclusiva`, `deposito_conserva`, `estoque_epi_extintor`, `manutencao_extintores`, `qtd_freezers`, `qtd_geladeiras`, `qtd_fogoes`, `qtd_fornos`, `qtd_bebedouros`, `estado_freezers`, `estado_geladeiras`, `estado_fogoes`, `estado_fornos`, `estado_bebedouros`. A view `vw_censo_rh_merendeiras` (migration `0010`) contém `oferta_regular`, `qualidade_merenda`, `atende_necessidades` e os campos de RH. **Isto não significa que tudo esteja implementado**: vários campos existem na view mas **não são expostos** em endpoint nem renderizados — cada item abaixo indica o que falta. Endpoints/frontend precisam ser diagnosticados antes de implementar (próxima etapa).
>
> Endpoints atuais de Merenda: `GET /v1/admin/analytics/merenda/{oferta,equipamentos,recursos-humanos}`. O endpoint `/oferta` (payload `MerendaOferta`) entrega `dist_oferta_regular`, `dist_qualidade`, `pct_atende_necessidades`, `dist_condicoes_cozinha`, `pct_possui_refeitorio` e — **após MER-01A** — `dist_atende_necessidades`, `dist_possui_refeitorio`, `dist_tamanho_cozinha`, `dist_refeitorio_adequado`. As distribuições usam `CategoricStat` (`{valor, escolas, percentual}`); novos contratos podem mapear `valor`→`label` no frontend.

#### 6.6.1 Merenda atende necessidades — distribuição

> **Status: ✅ ENTREGUE (MER-01A).** `dist_atende_necessidades` exposto em `/merenda/oferta` (helper `distQ`, view `vw_censo_rh_merendeiras.atende_necessidades`) e renderizado como `Donut` em `sec-merenda-oferta`. KPI `pct_atende_necessidades` mantido no resumo executivo.

**O que o gráfico deve mostrar**  
Distribuição de escolas por resposta (Sim / Parcialmente / Não) sobre se a merenda atende às necessidades dos alunos, com contagem e percentual.

**Como era tratado no Data Studio**  
Distribuição categórica de três respostas no bloco de oferta/adequação, não apenas como KPI percentual.

**Origem provável no banco**  
`vw_censo_rh_merendeiras.atende_necessidades` (categórico, `NULLIF('','')`).

**View ou transformação necessária**  
A view já expõe o campo. Hoje o endpoint só calcula `pct_atende_necessidades` (% "Sim"). Falta agregar a distribuição completa (helper `distQ` já usado no handler).

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/merenda/oferta`.

**Payload esperado**  
```ts
{
  dist_atende_necessidades: Array<{
    label: string;   // "Sim" | "Parcialmente" | "Não" (conforme normalização)
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut/barra em `web/src/components/admin/AbaMerenda.tsx`, anchor `sec-merenda-oferta`, sem remover o KPI atual no resumo executivo.

**Dependências de produto/dados**  
Confirmar categorias oficiais e normalização de variações textuais ("Parcialmente", "Em parte", etc.).

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor `dist_atende_necessidades` e renderizar a distribuição.

#### 6.6.2 Possui refeitório — distribuição Sim/Não

> **Status: ✅ ENTREGUE (MER-01A).** `dist_possui_refeitorio` exposto em `/merenda/oferta` (helper `distQ`, view `vw_censo_equipamentos_merenda.possui_refeitorio`) e renderizado como `Donut` em `sec-merenda-estrutura`. KPI `pct_possui_refeitorio` mantido. Nuance: "não informado" (`NULL` via `NULLIF('','')`) fica fora da distribuição — observação para fase futura.

**O que o gráfico deve mostrar**  
Distribuição Sim/Não de escolas que possuem refeitório, com contagem e percentual.

**Como era tratado no Data Studio**  
Distribuição Sim/Não no bloco de estrutura física.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.possui_refeitorio` (categórico/texto).

**View ou transformação necessária**  
A view já expõe o campo. Hoje o endpoint só entrega `pct_possui_refeitorio`. Falta agregar a distribuição Sim/Não.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/merenda/oferta` (ou um futuro `/merenda/estrutura-fisica`).

**Payload esperado**  
```ts
{
  dist_possui_refeitorio: Array<{
    label: "Sim" | "Não";
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut Sim/Não em `AbaMerenda.tsx`, anchor `sec-merenda-estrutura`, mantendo o KPI atual.

**Dependências de produto/dados**  
Confirmar tratamento de respostas vazias/não informadas.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor a distribuição Sim/Não e renderizar o donut.

#### 6.6.3 Tamanho da cozinha

> **Status: ✅ ENTREGUE (MER-01A).** `dist_tamanho_cozinha` exposto em `/merenda/oferta` (helper `distQ`, view `vw_censo_equipamentos_merenda.tamanho_cozinha`) e renderizado como `HBarChart` em `sec-merenda-estrutura`.

**O que o gráfico deve mostrar**  
Distribuição de escolas por tamanho declarado da cozinha.

**Como era tratado no Data Studio**  
Campo categórico agregado em distribuição no bloco de estrutura física.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.tamanho_cozinha`.

**View ou transformação necessária**  
A view já expõe o campo. Falta incluir a distribuição no payload (ver também §6.1.1).

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/merenda/oferta` ou criar `GET /v1/admin/analytics/merenda/estrutura-fisica`.

**Payload esperado**  
```ts
{
  dist_tamanho_cozinha: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar em `AbaMerenda.tsx`, anchor `sec-merenda-estrutura`, junto de condições da cozinha e refeitório.

**Dependências de produto/dados**  
Confirmar categorias válidas e tratamento de texto livre, se existir.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor `dist_tamanho_cozinha` e renderizar (consolidar com §6.1.1, que trata o mesmo gráfico).

#### 6.6.4 Refeitório adequado

> **Status: ✅ ENTREGUE (MER-01A).** `dist_refeitorio_adequado` exposto em `/merenda/oferta` (helper `distQ`, view `vw_censo_equipamentos_merenda.refeitorio_adequado`) e renderizado como `HBarChart` em `sec-merenda-estrutura`. Denominador atual: escolas com o campo informado (padrão do `distQ`); decisão "apenas quem possui refeitório" fica como observação futura.

**O que o gráfico deve mostrar**  
Distribuição de escolas conforme o refeitório atende adequadamente à necessidade da escola.

**Como era tratado no Data Studio**  
Campo categórico/booleano agregado em distribuição no bloco de estrutura física.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.refeitorio_adequado`.

**View ou transformação necessária**  
A view já expõe o campo. Falta agregação no endpoint.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/merenda/oferta` ou `/merenda/estrutura-fisica`.

**Payload esperado**  
```ts
{
  dist_refeitorio_adequado: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut/barra em `AbaMerenda.tsx`, anchor `sec-merenda-estrutura`.

**Dependências de produto/dados**  
Confirmar se o denominador inclui apenas escolas que possuem refeitório ou todas as concluídas.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor `dist_refeitorio_adequado` e renderizar.

#### 6.6.5 Presença de equipamentos por tipo

> **Status: ✅ ENTREGUE (MER-01B).** `presenca_por_tipo` exposto em `/merenda/equipamentos` (`COUNT(DISTINCT school_id) FILTER (qtd_* > 0)`, denominador = escolas concluídas no recorte) e renderizado como HBar em `sec-merenda-equipamentos`. Critério "possui = qtd > 0" confirmado. O `label` no payload final é o slug do equipamento (`freezers`/`geladeiras`/…); o frontend mapeia para o nome amigável.

**O que o gráfico deve mostrar**  
Percentual de escolas que possuem cada tipo de equipamento (freezer, geladeira, fogão, forno, bebedouro), isto é, escolas com `qtd_* > 0`.

**Como era tratado no Data Studio**  
Indicador de presença por tipo de equipamento, distinto da contagem total/média.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.qtd_freezers`, `qtd_geladeiras`, `qtd_fogoes`, `qtd_fornos`, `qtd_bebedouros`.

**View ou transformação necessária**  
A view já expõe as quantidades. Falta `COUNT(DISTINCT school_id) FILTER (WHERE qtd_tipo > 0)` por tipo, sobre escolas concluídas no recorte.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/merenda/equipamentos`.

**Payload esperado**  
```ts
{
  presenca_por_tipo: Array<{
    label: string;     // "Freezers" | "Geladeiras" | ...
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar barra horizontal em `AbaMerenda.tsx`, anchor `sec-merenda-equipamentos`, ao lado dos KPIs de total/média.

**Dependências de produto/dados**  
Confirmar se "presença" considera `qtd > 0` ou um campo booleano específico, caso exista.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Expor `presenca_por_tipo` e renderizar a barra.

#### 6.6.6 Quantidade de equipamentos por escola

> **Status: ✅ ENTREGUE (MER-01B).** Implementado como **`faixas_qtd_tipos`** — faixas **cumulativas por nº de tipos** de equipamento presentes na escola (Interpretação A do diagnóstico): "1 ou mais tipos", "2 ou mais tipos", "3 ou mais tipos". Rótulos escolhidos de forma explícita (em vez de "Até 1/Até 2/3+") para deixar claro que os percentuais são decrescentes. Exposto em `/merenda/equipamentos` e renderizado como HBar. O nome de campo `dist_qtd_por_escola` abaixo era a sugestão original; o campo entregue chama-se `faixas_qtd_tipos`.

**O que o gráfico deve mostrar**  
Distribuição de escolas por faixa de quantidade de equipamentos (ex.: escolas com 1, 2 ou 3+ equipamentos), por tipo ou consolidado.

**Como era tratado no Data Studio**  
Distribuição de escolas por faixa de quantidade de equipamentos.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.qtd_*` por tipo.

**View ou transformação necessária**  
Bucketizar a quantidade por escola em faixas (`CASE` por faixa) e contar escolas por faixa. Depende da definição de faixas oficiais.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/merenda/equipamentos`.

**Payload esperado**  
```ts
{
  dist_qtd_por_escola: Array<{
    label: string;     // "1" | "2" | "3+" (faixas a confirmar)
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut/barra em `AbaMerenda.tsx`, anchor `sec-merenda-equipamentos`.

**Dependências de produto/dados**  
Definir faixas oficiais (1, 2, 3+?) e se o gráfico é por tipo ou consolidado.

**Tipo de lacuna**  
Produto, depois Backend + Frontend.

**Próxima ação recomendada**  
Validar faixas com produto; então bucketizar e renderizar.

#### 6.6.7 Estado de conservação consolidado

> **Status: ✅ ENTREGUE (MER-01B; refinamento visual MER-EQP-REFINE-01).** Consolidado **no backend** (em vez de derivado no frontend) para padronizar os agrupamentos: `estado_consolidado` agrupa os estados em **Bom** (`lower(estado) LIKE 'bom%'`), **Regular** (`LIKE 'regular%'`) e **Ruim/Inoperante** (`LIKE 'ruim%' OR LIKE 'inoperante%'`), **por equipamento**, com denominador = escolas com estado informado para aquele equipamento. Renderizado em `sec-merenda-equipamentos`, acima da tabela detalhada (`dist_estados` mantida). O payload entregue traz `{ equipamento, estado, escolas, percentual }` por linha (3 linhas por equipamento), e não o formato `{ label, … }` sugerido abaixo. **Refinamento MER-EQP-REFINE-01 (frontend puro):** a tabela compacta foi substituída por um **gráfico de barras empilhadas horizontais** (uma barra 100% por equipamento, segmentos Bom=verde / Regular=âmbar / Ruim-Inoperante=rose), via o componente local `StackedConservationBar` em `AbaMerenda.tsx`, reaproveitando o pivô `consolidadoPorEquip`. Sem alteração de backend, endpoint, view ou tipos compartilhados.

**O que o gráfico deve mostrar**  
Visão consolidada do estado de conservação dos equipamentos da merenda (ex.: distribuição global Bom/Regular/Ruim somando todos os tipos), além da tabela atual por equipamento×estado.

**Como era tratado no Data Studio**  
Visão consolidada do estado de conservação dos equipamentos.

**Origem provável no banco**  
`estado_freezers`, `estado_geladeiras`, `estado_fogoes`, `estado_fornos`, `estado_bebedouros` (normalizados com `lower()` na view).

**View ou transformação necessária**  
A distribuição por equipamento já é entregue em `dist_estados`. Para a visão consolidada, agregar por `estado` somando os cinco tipos (pode ser cálculo no frontend a partir de `dist_estados`, ou um `UNION ALL` agregado no backend).

**Endpoint necessário**  
Derivável no frontend a partir de `dist_estados` (já no payload de `/merenda/equipamentos`); alternativamente, expor consolidado no servidor.

**Payload esperado**  
```ts
{
  estado_consolidado: Array<{
    label: string;   // "Bom" | "Regular" | "Ruim" | ...
    escolas: number; // ou contagem de equipamentos, conforme definição
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar donut consolidado em `AbaMerenda.tsx`, anchor `sec-merenda-equipamentos`, mantendo a tabela por equipamento.

**Dependências de produto/dados**  
Definir se a consolidação conta escolas ou equipamentos e a normalização das categorias de estado.

**Tipo de lacuna**  
Frontend (e Backend se consolidado no servidor).

**Próxima ação recomendada**  
Decidir onde consolidar e renderizar a visão consolidada.

#### 6.6.8 Criticidade por equipamento

> **Status: ✅ ENTREGUE (MER-01B).** Definição de criticidade fixada: **% de escolas com estado ruim ou inoperante** por equipamento. Numerador = escolas cujo estado casa `lower(estado) LIKE 'ruim%' OR LIKE 'inoperante%'`; denominador = escolas com estado informado para aquele equipamento. Exposto em `/merenda/equipamentos` como `criticidade_por_equipamento` (`{ equipamento, escolas_criticas, percentual }`) e renderizado como HBar com destaque (cor rosa) em `sec-merenda-equipamentos`.

**O que o gráfico deve mostrar**  
Indicador de criticidade por tipo de equipamento (ex.: % de escolas/equipamentos em estado ruim ou inservível), destacando os equipamentos mais críticos.

**Como era tratado no Data Studio**  
Destaque de criticidade por equipamento, derivado do estado de conservação.

**Origem provável no banco**  
`estado_*` por tipo em `vw_censo_equipamentos_merenda`.

**View ou transformação necessária**  
Após definição de "criticidade", calcular por tipo a proporção em estado(s) crítico(s). Não implementar antes da decisão de produto.

**Endpoint necessário**  
Expandir `GET /v1/admin/analytics/merenda/equipamentos` após decisão.

**Payload esperado**  
```ts
{
  criticidade_por_equipamento: Array<{
    label: string;       // tipo de equipamento
    percentual: number;  // % em estado crítico
  }>;
}
```

**Frontend necessário**  
Renderizar barra em `AbaMerenda.tsx`, anchor `sec-merenda-equipamentos`.

**Dependências de produto/dados**  
Definir quais estados contam como "crítico" e o denominador (escolas com o equipamento vs. todas).

**Tipo de lacuna**  
Produto, depois Backend + Frontend.

**Próxima ação recomendada**  
Validar a definição de criticidade antes de qualquer SQL.

> ✅ **MER-01C entregue (6.6.9–6.6.13).** O bloco **Condições Sanitárias e Segurança** foi implementado via endpoint dedicado `GET /v1/admin/analytics/merenda/condicoes-sanitarias` (payload `MerendaCondicoesSanitarias`), sobre `vw_censo_equipamentos_merenda`, sem nova view/migration. Campos entregues: `dist_despensa_exclusiva`, `dist_deposito_conserva`, `presenca_itens_basicos` (despensa exclusiva, sistema de exaustão, bancadas de inox), `dist_estoque_epi_extintor`, `dist_manutencao_extintores`. Bloco renderizado em `AbaMerenda.tsx` sob o anchor `sec-merenda-sanitarias`, com item de menu em `page.tsx`. **Denominadores:** distribuições categóricas sobre escolas com valor informado; `presenca_itens_basicos` sobre o total de escolas concluídas no recorte. As subseções abaixo preservam a especificação original (pré-entrega); onde indicarem "bloco ausente" ou anchor `sec-merenda-sanitario`, considerar superado por esta nota.

#### 6.6.9 Despensa exclusiva para gêneros alimentícios

**O que o gráfico deve mostrar**  
Percentual/distribuição de escolas com despensa exclusiva para gêneros alimentícios. Pertence ao **bloco Condições Sanitárias e Segurança — ausente hoje**.

**Como era tratado no Data Studio**  
Campo categórico/booleano agregado como KPI ou distribuição no bloco de condições sanitárias e segurança.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.despensa_exclusiva`.

**View ou transformação necessária**  
A view já expõe o campo. Não há endpoint nem frontend para este bloco — é preciso criá-los.

**Endpoint necessário**  
Endpoint dedicado recomendado: `GET /v1/admin/analytics/merenda/condicoes-sanitarias`. Alternativa: expansão controlada de `/merenda/oferta`.

**Payload esperado**  
```ts
{
  pct_despensa_exclusiva: number;
  // ou dist_despensa_exclusiva: Array<{ label; escolas; percentual }>
}
```

**Frontend necessário**  
Criar bloco "Condições Sanitárias e Segurança" em `AbaMerenda.tsx` (novo anchor, ex.: `sec-merenda-sanitario`) e renderizar KPI/distribuição.

**Dependências de produto/dados**  
Confirmar semântica do campo e respostas que equivalem a "Sim".

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Diagnosticar o conjunto do bloco e criar endpoint + bloco frontend.

#### 6.6.10 Depósito conserva adequadamente os alimentos

**O que o gráfico deve mostrar**  
Percentual/distribuição de escolas cujo depósito conserva adequadamente os alimentos. Bloco Condições Sanitárias e Segurança.

**Como era tratado no Data Studio**  
Campo categórico/booleano agregado no bloco de condições sanitárias e segurança.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.deposito_conserva`.

**View ou transformação necessária**  
A view já expõe o campo. Falta endpoint e frontend (mesmo bloco de §6.6.9).

**Endpoint necessário**  
`GET /v1/admin/analytics/merenda/condicoes-sanitarias` (mesmo endpoint do bloco).

**Payload esperado**  
```ts
{
  pct_deposito_conserva: number;
  // ou dist_deposito_conserva: Array<{ label; escolas; percentual }>
}
```

**Frontend necessário**  
Renderizar no novo bloco de Condições Sanitárias e Segurança em `AbaMerenda.tsx`.

**Dependências de produto/dados**  
Confirmar semântica e normalização de respostas.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Incluir no mesmo endpoint/bloco do item anterior.

#### 6.6.11 Presença de itens básicos

**O que o gráfico deve mostrar**  
Presença de itens básicos da estrutura sanitária/operacional: balança, bancadas inox e sistema de exaustão (% de escolas que possuem cada item). Bloco Condições Sanitárias e Segurança.

**Como era tratado no Data Studio**  
Conjunto de indicadores de presença de itens básicos no bloco de condições sanitárias e segurança.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.possui_balanca`, `bancadas_inox`, `sistema_exaustao`.

**View ou transformação necessária**  
A view já expõe os campos. Falta agregação por item no endpoint do bloco.

**Endpoint necessário**  
`GET /v1/admin/analytics/merenda/condicoes-sanitarias`.

**Payload esperado**  
```ts
{
  itens_basicos: Array<{
    label: string;     // "Balança" | "Bancadas inox" | "Sistema de exaustão"
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar barra horizontal no novo bloco de Condições Sanitárias e Segurança em `AbaMerenda.tsx`.

**Dependências de produto/dados**  
Confirmar a lista oficial de "itens básicos" e a semântica de cada campo.

> **Observação (MER-01C entregue):** o campo `possui_balanca` existe na view `vw_censo_equipamentos_merenda`, mas **não compõe** `presenca_itens_basicos` nesta entrega. A composição adotada segue o escopo da MER-01C: **despensa exclusiva, sistema de exaustão e bancadas de inox**. A inclusão de balança pode ser avaliada futuramente se a área finalística considerar o item essencial para o indicador.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Agregar presença por item e renderizar.

#### 6.6.12 Estoque de EPIs e extintor de incêndio

**O que o gráfico deve mostrar**  
Percentual/distribuição de escolas com estoque de EPIs e extintor de incêndio. Bloco Condições Sanitárias e Segurança.

**Como era tratado no Data Studio**  
Indicador de presença de EPIs/extintor no bloco de condições sanitárias e segurança.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.estoque_epi_extintor`.

**View ou transformação necessária**  
A view já expõe o campo. Falta endpoint/frontend do bloco.

**Endpoint necessário**  
`GET /v1/admin/analytics/merenda/condicoes-sanitarias`.

**Payload esperado**  
```ts
{
  pct_estoque_epi_extintor: number;
  // ou dist_estoque_epi_extintor: Array<{ label; escolas; percentual }>
}
```

**Frontend necessário**  
Renderizar no novo bloco de Condições Sanitárias e Segurança em `AbaMerenda.tsx`.

**Dependências de produto/dados**  
Confirmar se o campo agrega EPI e extintor numa só resposta ou se há campos distintos.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Incluir no endpoint/bloco de condições sanitárias.

#### 6.6.13 Manutenção dos extintores

**O que o gráfico deve mostrar**  
Percentual/distribuição de escolas com recarga/manutenção dos extintores em dia. Bloco Condições Sanitárias e Segurança.

**Como era tratado no Data Studio**  
Indicador de recarga/manutenção dos extintores no bloco de condições sanitárias e segurança.

**Origem provável no banco**  
`vw_censo_equipamentos_merenda.manutencao_extintores`.

**View ou transformação necessária**  
A view já expõe o campo. Falta endpoint/frontend do bloco.

**Endpoint necessário**  
`GET /v1/admin/analytics/merenda/condicoes-sanitarias`.

**Payload esperado**  
```ts
{
  dist_manutencao_extintores: Array<{
    label: string;
    escolas: number;
    percentual: number;
  }>;
}
```

**Frontend necessário**  
Renderizar no novo bloco de Condições Sanitárias e Segurança em `AbaMerenda.tsx`.

**Dependências de produto/dados**  
Confirmar categorias (em dia / vencida / não informado) e normalização.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Incluir no endpoint/bloco de condições sanitárias.

#### 6.6.14 Migração de Recursos Humanos para Serviços Terceirizados

> **Status: MER-RH-01 entregue.** Recursos Humanos foi removido da aba Merenda, o bloco **Manipulador de Alimentos** foi adicionado em Serviços Terceirizados, o endpoint novo `/v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` foi criado e `/v1/admin/analytics/merenda/recursos-humanos` foi mantido como legado.

**O que o gráfico deve mostrar**  
Os indicadores de RH de merendeiras — total por vínculo (estatutária/terceirizada/temporária), adequação do quantitativo, média de merendeiras por escola, empresas terceirizadas e supervisão — compõem o bloco **"Manipulador de Alimentos"** no menu **Serviços Terceirizados**, ao lado de Serviços Gerais e Portaria. **Não é** lacuna técnica de dado: é **reorganização conceitual** decidida pelo produto. A avaliação do serviço das merendeiras permanece fora do escopo enquanto a fonte/escala não estiver consolidada.

**Como era tratado no Data Studio**  
Subaba "Recursos Humanos" dentro de Merenda, com total de merendeiras por vínculo, adequação do quantitativo, avaliação do serviço, média por escola, empresas e abrangência, e supervisão do serviço pelas empresas.

**Origem provável no banco**  
`vw_censo_rh_merendeiras` (já existente): `qtd_merendeiras_estatutaria`, `qtd_merendeiras_terceirizada`, `qtd_merendeiras_temporaria`, `atende_necessidades`, `empresa_terceirizada_merenda`, `possui_supervisor_merenda`. Avaliação do serviço pode vir de campos de avaliação em `vw_censo_servicos_terceirizados` ou outra fonte a confirmar em rodada futura.

**View ou transformação necessária**  
Nenhuma nova. A view já alimentava o endpoint legado `/merenda/recursos-humanos` e agora alimenta o endpoint próprio sob `/servicos-terceirizados/*`.

**Endpoint necessário**  
Novo endpoint entregue:

```txt
GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos
```

Endpoint legado mantido:

```txt
GET /v1/admin/analytics/merenda/recursos-humanos
```

**Payload esperado**  
Payload novo:

```ts
{
  total_estatutaria: number;
  total_terceirizada: number;
  total_temporaria: number;
  total_geral: number;
  media_por_escola: number;
  pct_com_supervisor: number;
  dist_vinculo: Array<{ valor: string; escolas: number; percentual: number }>;
  dist_atende_necessidade: Array<{ valor: string; escolas: number; percentual: number }>;
  top_empresas: Array<{ empresa: string; escolas: number }>;
}
```

`dist_vinculo` representa composição percentual dos quantitativos somados por vínculo; `dist_atende_necessidade` representa escolas por resposta informada em `atende_necessidades`.

**Frontend necessário**  
`sec-merenda-rh` foi removido de `AbaMerenda.tsx`. `sec-servicos-manipuladores` foi adicionado em `AbaServicosTerceirizados.tsx`, com KPIs de vínculos/total/média/supervisor, Donut de distribuição por vínculo, Donut de atendimento à necessidade e `HBarChart` de top empresas terceirizadas.

**Dependências de produto/dados**  
Decisão de produto já executada (`matriz-abas-e-graficos.md` §2.8). Resta apenas definir fonte/escala oficial para eventual avaliação do serviço das merendeiras.

**Tipo de lacuna**  
Reorganização conceitual / Produto (não é lacuna de dado).

**Próxima ação recomendada**  
Não remover o endpoint legado `/merenda/recursos-humanos` sem fase de depreciação. Não tratar avaliação do serviço das merendeiras sem fonte/escala consolidada.

## 7. Itens fora da rodada PostgreSQL atual

### 7.1 Perfil dos Alunos e Resultados

A aba permanece na implementação atual/legada via `GET /v1/admin/indicadores-metrics`, alimentada por Google Sheets. Não deve ser remodelada para consumir o PostgreSQL do formulário nesta rodada.

Qualquer nova especificação para esta aba deve partir de fonte externa/planilha própria validada pela coordenação responsável, com contrato e critérios próprios.

### 7.2 Gestão Financeira e Governança

A aba é placeholder institucional, sem fetch, endpoint, view SQL ou dado fake. Não deve consumir o PostgreSQL do censo operacional nesta rodada.

A fonte futura deve vir de bases próprias validadas pelas coordenações responsáveis. Não criar migrations, endpoints ou componentes de dados para essa aba sem decisão explícita de produto.

## 8. Resumo de endpoints recomendados

| Endpoint | Finalidade | Status | Dependência |
|---|---|---|---|
| `/v1/admin/analytics/caracterizacao/oferta-funcionamento` | Etapas, modalidades, turnos, média de turnos por porte | Recomendado | Confirmar estrutura dos campos multivalorados |
| `/v1/admin/analytics/caracterizacao/infraestrutura-educacional` | Ambientes e essenciais | **Entregue (CAR-INFRA-01)** | Lista oficial inicial definida; refino futuro com produto |
| `/v1/admin/analytics/infraestrutura/energia-climatizacao` | Energia e climatização | Recomendado ou expansão de `/condicoes` | Confirmar semântica dos campos |
| `/v1/admin/analytics/merenda/estrutura-fisica` | Tamanho da cozinha, refeitório adequado, distribuição Sim/Não de refeitório | **Entregue como expansão de `/merenda/oferta` (MER-01A)** | Não criado endpoint próprio; `dist_tamanho_cozinha`, `dist_refeitorio_adequado`, `dist_possui_refeitorio` em `/merenda/oferta` |
| `/v1/admin/analytics/merenda/condicoes-sanitarias` | Despensa, depósito, itens básicos, EPIs/extintor, manutenção de extintores | **Entregue (MER-01C)** | `dist_*` + `presenca_itens_basicos` sobre `vw_censo_equipamentos_merenda`; renderizado em `sec-merenda-sanitarias` |
| `/v1/admin/analytics/servicos-terceirizados/governanca` | Supervisão e avaliações | Recomendado | Escala oficial das avaliações |
| `/v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` | RH de merendeiras migrado de Merenda | **Entregue (MER-RH-01)** | Reaproveita `vw_censo_rh_merendeiras`; `/merenda/recursos-humanos` legado mantido |

## 9. Resumo de views/transformações recomendadas

| Transformação | Necessidade | Pode usar view existente? | Observação |
|---|---|---|---|
| Normalizar etapas | Campo multivalorado para dimensão | A confirmar | Pode exigir nova view |
| Normalizar modalidades | Campo multivalorado para dimensão | A confirmar | Pode exigir nova view |
| Normalizar turnos | Campo multivalorado para dimensão | A confirmar | Diferenciar turno de turma |
| Ambientes por escola | Presença de ambientes | Sim, `vw_censo_ambientes` | Entregue (CAR-INFRA-01) |
| Ambientes essenciais | Cobertura e média por porte | Sim, lista oficial inicial | Entregue (CAR-INFRA-01); refino futuro da lista |
| Energia/climatização | KPIs e distribuição | Parcial | Campos existem, não expostos |
| Tamanho da cozinha / refeitório adequado | Distribuição categórica | Sim, `vw_censo_equipamentos_merenda` | **Entregue (MER-01A)** — `dist_tamanho_cozinha`, `dist_refeitorio_adequado` em `/merenda/oferta` |
| Atende necessidades (Merenda) | Distribuição Sim/Parc./Não | Sim, `vw_censo_rh_merendeiras` | **Entregue (MER-01A)** — `dist_atende_necessidades` (KPI `pct_atende_necessidades` mantido) |
| Presença/quantidade/criticidade de equipamentos (Merenda) | Presença, faixas, estado consolidado | Sim, `vw_censo_equipamentos_merenda` | Faltam payload e definições de produto (faixas/criticidade) |
| Condições sanitárias (Merenda) | Distribuições + presença de itens básicos | Sim, `vw_censo_equipamentos_merenda` | **Entregue (MER-01C)** — `/merenda/condicoes-sanitarias`, renderizado em `sec-merenda-sanitarias` |
| RH merendeiras → Serviços Terceirizados | Reorganização conceitual | Sim, `vw_censo_rh_merendeiras` | **MER-RH-01 entregue**; avaliação do serviço segue pendente |
| Governança serviços | Supervisão e avaliação | Parcial | Campos existem, escala a validar |

## 10. Ordem técnica recomendada

> Caracterização / Infraestrutura Educacional já foi entregue (CAR-INFRA-01), incluindo a lista oficial inicial de ambientes essenciais. Não consta mais como decisão de produto bloqueante nem como tarefa de implementação futura — apenas refino opcional da lista com produto.

1. Validar decisões de produto bloqueantes:
   - denominador de computadores inoperantes (Tecnologia);
   - escala de avaliação dos serviços (Serviços Terceirizados).

2. Implementar backend de Caracterização / Oferta e Funcionamento.

3. Implementar frontend de Caracterização / Oferta e reposicionar Detalhamento por DRE.

4. **Entregue** — Tecnologia conforme Data Studio (§6.5): distribuições Sim/Não (internet, projetor, lousa) e Sim/Parcialmente/Não (atendem à demanda), média de equipamentos por escola e distribuição do parque tecnológico (%), média de projetores por escola.

5. Implementar backend/frontend de Energia e Climatização.

6. Implementar Merenda conforme Data Studio (§6.6): (a) **entregue (MER-01A)** distribuições de Oferta/Estrutura (atende necessidades, possui refeitório Sim/Não, tamanho da cozinha, refeitório adequado); (b) **entregue (MER-01B)** Equipamentos (presença por tipo, faixas de quantidade, estado consolidado, criticidade); (c) **entregue (MER-01C)** bloco **Condições Sanitárias e Segurança** (endpoint `/merenda/condicoes-sanitarias` + bloco frontend `sec-merenda-sanitarias`); (d) **entregue (MER-RH-01)** migração de RH para Serviços Terceirizados, mantendo `/merenda/recursos-humanos` como legado.

7. Implementar Serviços Terceirizados / Governança e Supervisão após validação da escala. O bloco **Manipulador de Alimentos** já recebeu o RH migrado de Merenda em MER-RH-01 (§6.6.14); eventual avaliação do serviço das merendeiras depende de fonte/escala consolidada.
