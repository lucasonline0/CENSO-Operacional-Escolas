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

#### 5.2.1 Presença de ambientes

**O que o gráfico deve mostrar**  
Ranking ou distribuição de ambientes existentes, com escolas e percentual por ambiente.

**Como era tratado na planilha/painel original**  
Dependia de aba auxiliar que expandia a lista de ambientes declarados por escola.

**Origem provável do dado no banco**  
`vw_censo_ambientes`, criada pela migration `0007_vw_censo_ambientes.sql`, com uma linha por `school_id + year + ambiente`.

**View ou transformação necessária**  
A view existente é suficiente para presença de ambientes. Falta uma query/endpoint sintético dentro de Caracterização, usando `COUNT(DISTINCT school_id) GROUP BY ambiente` e percentual sobre o total do recorte.

**Endpoint necessário**  
Novo endpoint recomendado: `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`.

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
Renderizar em `AbaCaracterizacao.tsx`, anchor `sec-perfil-infra`, como bloco sintético sem duplicar a profundidade da aba Infraestrutura e Segurança.

**Dependências de produto/dados**  
Confirmar se o gráfico deve exibir todos os ambientes ou apenas Top N.

**Tipo de lacuna**  
Backend + Frontend.

**Próxima ação recomendada**  
Criar endpoint de infraestrutura educacional usando `vw_censo_ambientes` e renderizar gráfico sintético na Caracterização.

#### 5.2.2 Cobertura de ambientes essenciais

**O que o gráfico deve mostrar**  
Indicadores de cobertura dos ambientes considerados essenciais: média de essenciais presentes, percentual de escolas com cobertura plena e distribuição por faixa.

**Como era tratado na planilha/painel original**  
Dependia de aba auxiliar com marcação de essencialidade ou cálculo equivalente por escola.

**Origem provável do dado no banco**  
`vw_censo_ambientes` para presença; `vw_censo_enriquecida.porte_escola_nome` se houver recorte por porte. Falta a lista oficial de ambientes essenciais.

**View ou transformação necessária**  
Criar transformação derivada que marque `is_essencial` com base em lista oficial. Depois calcular, por escola: `qtd_ambientes_essenciais_presentes`, `percentual_cobertura_essenciais` e `faixa_cobertura`.

**Endpoint necessário**  
`GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`.

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
Renderizar KPI(s) e distribuição em `AbaCaracterizacao.tsx`, anchor `sec-perfil-infra`.

**Dependências de produto/dados**  
Definir a lista oficial de ambientes essenciais. Sem essa decisão, qualquer cálculo será arbitrário.

**Tipo de lacuna**  
Produto, depois Backend + Frontend.

**Próxima ação recomendada**  
Abrir task de produto para validar a lista de essenciais antes de implementar SQL.

#### 5.2.3 Média de ambientes essenciais por porte

**O que o gráfico deve mostrar**  
Média de ambientes essenciais presentes por escola em cada faixa de porte.

**Como era tratado na planilha/painel original**  
Dependia do mesmo cálculo intermediário de essencialidade por escola, depois agrupado por porte.

**Origem provável do dado no banco**  
`vw_censo_ambientes` + `vw_censo_enriquecida.porte_escola_nome`, após existir regra oficial de ambientes essenciais.

**View ou transformação necessária**  
Transformação por escola com contagem de essenciais presentes e agregação `AVG(qtd_essenciais_presentes) GROUP BY porte_escola_nome`.

**Endpoint necessário**  
`GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`.

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
Renderizar tabela compacta ou barra em `AbaCaracterizacao.tsx`, anchor `sec-perfil-infra`.

**Dependências de produto/dados**  
Mesma lista oficial de ambientes essenciais do item anterior.

**Tipo de lacuna**  
Produto, depois Backend + Frontend.

**Próxima ação recomendada**  
Implementar somente depois da lista de essenciais e do endpoint sintético de infraestrutura educacional.

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
| `/v1/admin/analytics/caracterizacao/infraestrutura-educacional` | Ambientes e essenciais | Recomendado | Lista oficial de ambientes essenciais |
| `/v1/admin/analytics/infraestrutura/energia-climatizacao` | Energia e climatização | Recomendado ou expansão de `/condicoes` | Confirmar semântica dos campos |
| `/v1/admin/analytics/merenda/estrutura-fisica` | Tamanho da cozinha e estrutura | Opcional | Pode ser expansão de `/merenda/oferta` |
| `/v1/admin/analytics/servicos-terceirizados/governanca` | Supervisão e avaliações | Recomendado | Escala oficial das avaliações |

## 9. Resumo de views/transformações recomendadas

| Transformação | Necessidade | Pode usar view existente? | Observação |
|---|---|---|---|
| Normalizar etapas | Campo multivalorado para dimensão | A confirmar | Pode exigir nova view |
| Normalizar modalidades | Campo multivalorado para dimensão | A confirmar | Pode exigir nova view |
| Normalizar turnos | Campo multivalorado para dimensão | A confirmar | Diferenciar turno de turma |
| Ambientes por escola | Presença de ambientes | Sim, `vw_censo_ambientes` | Falta essencialidade |
| Ambientes essenciais | Cobertura e média por porte | Parcial | Depende de lista oficial |
| Energia/climatização | KPIs e distribuição | Parcial | Campos existem, não expostos |
| Tamanho da cozinha | Distribuição categórica | Sim | Falta payload |
| Governança serviços | Supervisão e avaliação | Parcial | Campos existem, escala a validar |

## 10. Ordem técnica recomendada

1. Validar decisões de produto bloqueantes:
   - ambientes essenciais;
   - denominador de computadores inoperantes;
   - escala de avaliação dos serviços.

2. Implementar backend de Caracterização / Oferta e Funcionamento.

3. Implementar frontend de Caracterização / Oferta e reposicionar Detalhamento por DRE.

4. Implementar backend de Caracterização / Infraestrutura Educacional após lista de essenciais.

5. Implementar backend/frontend de Energia e Climatização.

6. Implementar Merenda / tamanho da cozinha.

7. Implementar Serviços Terceirizados / Governança e Supervisão após validação da escala.
