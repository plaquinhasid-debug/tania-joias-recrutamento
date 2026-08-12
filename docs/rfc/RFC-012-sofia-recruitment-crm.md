# RFC-012 — Sofia Recruitment CRM

**Status:** proposta para aprovação  
**Escopo executado:** investigação e documentação; nenhuma mudança de comportamento  
**Data:** 2026-08-11

## 1. Resumo executivo

O sistema atual já cobre bem aquisição, entrevista guiada, qualificação determinística, análise auxiliar, aprovação/reprovação, visualização no Admin e envio do evento `Lead` ao Meta. Ele também já possui um Kanban, mas esse Kanban é uma representação visual dos quatro estados de qualificação existentes (`novo`, `em_analise`, `aprovada`, `reprovada`), não um CRM operacional de recrutamento.

Há três conclusões centrais:

1. **Sofia, IPR e Meta podem ser preservados.** A futura camada de CRM pode ser construída no Admin e no banco ao redor do fluxo atual, sem reconstruir a Sofia nem alterar `calcularIpr`, `decidirStatus`, `classificarPerfil`, Pixel ou CAPI.
2. **O histórico completo de conversa não existe no banco.** `conversations` guarda metadados da sessão; `answers` guarda entradas associadas às perguntas. As mensagens da Sofia e as intervenções de pergunta/dúvida da candidata vivem apenas no estado React/WorkingMemory do navegador e desaparecem em refresh.
3. **O menor primeiro valor real é operacional, não conversacional:** registrar separadamente o andamento humano pós-qualificação (aguardando contato, em contato, entrevista e convertida), com timestamps e notas, sem sobrecarregar o enum de qualificação e sem tocar no funil Meta.

## 2. Fontes e limites da investigação

Fontes verificadas:

- tipos gerados do Supabase em `packages/shared/src/database.types.ts`;
- migrations versionadas disponíveis;
- Landing, Sofia/orquestrador e bibliotecas de persistência;
- Edge Functions `finalize-candidate`, `send-meta-lead-event`, `sofia-reagir`, `sofia-config` e helpers;
- Admin, hooks, Kanban, Radar, relatórios e detalhes da candidata;
- documentação existente de QUALIFICAÇÃO-002 e histórico Git local.

Limites:

- o repositório não contém as migrations de criação das tabelas; contém apenas duas migrations incrementais recentes;
- não havia conexão read-only com o catálogo do Postgres/Supabase nesta tarefa;
- por isso, índices, constraints não refletidas nos tipos, configuração exata de `ON DELETE`, RLS e policies não podem ser afirmados integralmente pelo repositório;
- os tipos gerados confirmam colunas, enums e foreign keys conhecidas, mas não substituem uma inspeção de `pg_catalog`/`information_schema` para fechar o DDL real;
- não foi lido nem alterado nenhum dado real de candidata.

## 3. Arquitetura atual

Fluxo efetivo:

```text
Meta/UTM/fbclid
  -> Landing
  -> abertura da Sofia
  -> conversations + logs(chat_iniciado)
  -> roteiro estruturado + respostas em answers
  -> finalize-candidate
  -> IPR/status/perfil determinísticos
  -> leads + ai_analysis
  -> vínculo posterior de conversations/answers ao lead
  -> logs de resultado
  -> Pixel + CAPI somente quando aprovada
  -> Admin (lista, Kanban, detalhe, aprovação manual, WhatsApp externo)
```

O Agent Core da Sofia existe, mas majoritariamente observa o roteiro. O comentário e o uso em `useSofiaFlow` confirmam que o roteiro fixo continua decidindo perguntas e avanço. WorkingMemory, Context, ConversationState, Objectives, Planner, Intent, Decision e Action são processados por turno; o valor do pipeline shadow não controla o fluxo principal. A FEATURE-004 pode responder perguntas de negócio, e a condução natural permanece protegida por configuração/fallback.

## 4. Modelo de dados atual

### 4.1 `leads`

Finalidade: registro consolidado da candidata depois da conclusão bem-sucedida de `finalize-candidate`.

Campos confirmados:

- identificação: `id`, `nome`, `telefone`, `idade`;
- localização e contato: `cidade`, `instagram`, `whatsapp`;
- trabalho: `trabalha`, `profissao`, `empresa_atual`, `estabilidade_profissional`;
- qualificação: `experiencia_vendas`, `tempo_disponivel`, `objetivo`, `ipr`, `perfil_comercial`, `status`;
- operação/análise: `observacoes`, `resumo_ia`;
- aquisição: `origem`, `campanha`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`;
- Meta/atribuição: `fbp`, `fbc`, `fbclid`, `client_ip`, `client_user_agent`, `meta_lead_sent_at`;
- vínculo: `conversation_id`;
- tempo: `created_at`, `updated_at`.

Não existe `session_id` em `leads`. O vínculo operacional primário durante o fluxo é feito por `session_id` nas tabelas auxiliares; depois da inserção do lead, a Edge Function associa `conversations.lead_id` e `answers.lead_id`.

Foreign key confirmada pelos tipos: `leads.conversation_id -> conversations.id`. O código de finalização não preenche `leads.conversation_id`; portanto esse campo pode permanecer nulo mesmo quando existe uma conversa vinculada no sentido inverso.

Enums confirmados:

- `lead_status`: `novo | em_analise | aprovada | reprovada`;
- `perfil_comercial_enum`: `baixo | medio | alto`;
- `estabilidade_profissional_enum`: `ALTA | MEDIA | BAIXA` (nullable por projeto, sem backfill e sem participação no IPR/status/perfil).

### 4.2 `conversations`

Finalidade real: envelope/metadado de uma sessão de entrevista, não tabela de mensagens.

Campos: `id`, `session_id`, `lead_id`, `status`, `current_step`, `started_at`, `completed_at`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`.

Foreign key confirmada: `conversations.lead_id -> leads.id`.

Nascimento: ao abrir a Sofia pela primeira vez no componente montado, `SofiaAssistant` registra `chat_iniciado` e chama `startConversation` em modo fire-and-forget.

Conclusão: `finalize-candidate` atualiza todas as linhas com o mesmo `session_id` para `status = concluida`, define `completed_at` e `lead_id`.

Lacunas:

- `current_step` não é atualizado por nenhum código encontrado;
- abandono passivo só gera `logs.chat_abandonado`; a linha de `conversations` não é marcada como abandonada;
- abandono explícito (`END_CONVERSATION`) termina a UI e não chama `finalize-candidate`, mas também não atualiza `conversations` nem cria lead;
- não existem campos de mensagem, role, conteúdo ou timestamp por fala.

### 4.3 Erro 409 em `startConversation`

Causa mais provável: duas inserções concorrentes com o mesmo `session_id` atingem uma constraint unique no banco. O comportamento observado anteriormente — clique/abertura concorrente e `duplicate key` — é compatível com isso. A proteção `conversationStarted.current` reduz duplicações por instância, mas não garante idempotência entre montagens concorrentes, StrictMode, abas/restauração ou requests simultâneas.

A constraint exata não está versionada no repositório; deve ser confirmada no catálogo antes de uma correção. A hipótese forte é unicidade de `conversations.session_id`.

Impacto atual: a falha é engolida e registrada como warning; a conversa visível segue e a candidata ainda pode ser finalizada. O risco de produção é perda/inconsistência de metadados da conversa e ruído operacional, não necessariamente perda do lead final. Há ainda um risco inverso: se a unicidade não existir no ambiente real, duplicatas seriam atualizadas em lote por `finalize-candidate`.

Solução futura segura: tornar o início idempotente no servidor/banco (`upsert`/RPC com `ON CONFLICT` na chave confirmada), retornando a conversa canônica. Não corrigir sem antes confirmar a constraint e a semântica desejada para reutilização de `session_id`.

### 4.4 `answers`

Finalidade: registrar cada entrada submetida na etapa corrente.

Campos: `id`, `session_id`, `lead_id`, `question_key`, `question_label`, `answer_value`, `created_at`.

Foreign key confirmada: `answers.lead_id -> leads.id`.

Comportamento:

- cada submit faz `insert`, sem `update` ou `upsert`;
- não há `conversation_id`;
- a associação inicial é por `session_id`; ao finalizar, linhas ainda sem lead recebem `lead_id`;
- o Admin recupera por `lead_id` e ordena por `created_at ASC`;
- o modelo permite duplicatas e múltiplas tentativas para a mesma `question_key`, salvo constraint não visível no repositório;
- não há `updated_at`, versionamento ou marca de resposta substituída.

Diferença para mensagens: `answers` contém pergunta estruturada e valor submetido, não um transcript. Além disso, o código atual chama `insertAnswer` antes de classificar textos livres. Assim, perguntas, small talk, objeções ou pedidos de encerramento que são corretamente impedidos de preencher `SofiaAnswers` podem mesmo assim ser inseridos em `answers` com a `question_key` da etapa. Isso reduz a confiabilidade de `answers` como fonte semântica do valor final.

### 4.5 `ai_analysis`

Finalidade: snapshot analítico produzido após o lead ser criado. Contém IPR/breakdown, perfil e motivo determinísticos, recomendação e enriquecimentos opcionais da IA (`resumo_*`, ICP, perfil sugerido, potencial, probabilidade, confiança, próxima ação, sentimento, motivação, pontos fortes/atenção e modelo).

Campos temporais: `created_at`; não há `updated_at`.

Foreign key confirmada: `ai_analysis.lead_id -> leads.id`. O Admin busca a análise mais recente, o que admite mais de uma linha por lead. O código atual insere uma análise na finalização.

Importante: a IA é consultiva. Falha de análise cai em fallback determinístico e não altera o motor de decisão.

### 4.6 Outras tabelas relacionadas

- `logs`: eventos de funil por `session_id` e, após finalização, por `lead_id`; contém origem/campanha, metadata e `created_at`.
- `campaigns`: cadastro de campanha (`nome`, `origem`, `utm_campaign`, `ativa`, `created_at`). Não foi encontrado vínculo FK com leads/logs.
- `settings`: configurações operacionais/flags, inclusive cidades e modos da Sofia.
- `profiles`: perfis do Admin/autenticação.

Eventos de funil confirmados: `landing_view`, `ad_click`, `chat_iniciado`, `chat_abandonado`, `respondeu_trabalha_sim`, `respondeu_trabalha_nao`, `aprovada`, `reprovada`, `analise_manual`.

## 5. Sofia e persistência

Componentes realmente existentes:

```text
WorkingMemory (browser, volátil)
  -> Context (reconstruído de SofiaAnswers)
  -> ConversationState (estado técnico, volátil)
  -> Objectives
  -> Planner
  -> IntentClassifier
  -> DecisionEngine
  -> ActionEngine
```

O `ResponseComposer` existe e participa de respostas de perguntas de negócio, não da totalidade do roteiro. A resposta visual do roteiro é criada por `useSofiaFlow` usando `sofia-script.ts`, reações contextuais opcionais e estado React `messages`.

Pontos do fluxo:

- montagem: `SofiaAssistant`;
- começo: abertura do drawer -> `startConversation` + `beginIntro`;
- recepção de resposta: `submitAnswer` em `useSofiaFlow`;
- decisão visível do próximo passo: `SOFIA_STEPS`, `findNextStepIndex` e classificação contextual no hook;
- resposta: `pushBotLine`, roteiro/`sofia-reagir`, ou pipeline de pergunta de negócio;
- persistência durante entrevista: `answers`, `logs`, `conversations`;
- finalização: `runSubmission` -> `finalize-candidate`;
- memória completa visível: somente estado React/WorkingMemory, sem persistência.

Conclusão: a arquitetura modular não equivale a um transcript persistido. Refresh perde mensagens e WorkingMemory; o `session_id` permanece na sessão do navegador, mas não reconstitui a UI.

## 6. IPR, aprovação e Meta — invariantes protegidos

Fluxo confirmado:

```text
SofiaAnswers
  -> payload de finalize-candidate
  -> calcularIpr
  -> decidirStatus
  -> classificarPerfil
  -> insert leads
  -> insert ai_analysis
  -> vincular conversations/answers
  -> logs de resultado
```

Pesos atuais do IPR: trabalha 50, experiência 20, WhatsApp 10, Instagram 10, cidade atendida 10. Thresholds exibidos no shared: aprovar 80; análise manual a partir de 60. `trabalha = false` reprova independentemente do restante. Estabilidade profissional não participa de nenhuma dessas funções.

Meta:

- na Landing, Pixel `Lead` dispara somente se a resposta final for `aprovada`, com `eventID = lead_id`;
- em `finalize-candidate`, CAPI `Lead` dispara somente para `status = aprovada`, usando o mesmo `lead_id` como `event_id`;
- aprovação manual no Admin chama `send-meta-lead-event`;
- a função server-side exige lead aprovado e usa `meta_lead_sent_at` para idempotência;
- estabilidade e dados de CRM não fazem parte do payload Meta.

Qualquer CRM deve manter `lead.status` como resultado de qualificação e evitar reutilizá-lo como andamento operacional. Misturar os dois conceitos faria arrastar um card pós-aprovação potencialmente reclassificar a candidata e acionar CAPI por efeitos laterais.

## 7. Admin, abandono e funil

Admin atual:

- lista/filtros de leads;
- detalhe com análise, IPR, estabilidade, respostas, observações e link externo para WhatsApp;
- botões aprovar/reprovar;
- Kanban drag-and-drop que altera diretamente `leads.status`;
- dashboard, relatórios e Radar por contagem global de eventos.

Limitações:

- não mostra `conversations`;
- não mostra transcript;
- não registra contato humano, entrevista ou conversão;
- não registra responsável, próxima ação operacional ou vencimento;
- o WhatsApp só abre um link; não registra automaticamente que houve contato;
- o Radar conta eventos globais sem janela de data e sem deduplicação por sessão/lead; `ad_click` antes de `landing_view` pode produzir relações não monotônicas;
- abandono existe como evento, mas não como candidata/lead operacional recuperável quando a entrevista não termina;
- `current_step` não permite medir abandono por etapa porque nunca é atualizado.

Portanto, hoje é possível medir eventos agregados básicos, mas não reconstruir com precisão um funil por coorte nem operar follow-up de abandonos.

## 8. O que pode ser reconstruído hoje

Para candidatura concluída:

```text
Lead -> respostas estruturadas/tentativas -> resultado -> análise
```

Isso é possível por `lead_id`, com ressalvas de qualidade em `answers`.

Para conversa completa:

```text
Lead -> conversa -> mensagens Sofia/candidata -> resposta final
```

Isso **não** é possível. Faltam mensagens persistidas e, em muitos casos, `leads.conversation_id` não é preenchido. É possível encontrar `conversations` pelo `lead_id`, mas ela só fornece metadados.

Para abandono antes da conclusão: há `logs`/`conversations` por sessão e respostas parciais sem lead, porém normalmente não há telefone/nome consolidado nem entidade operacional. Não é seguro chamar tudo isso de lead recuperável.

## 9. Proposta de menor primeira implementação

### 9.1 Objetivo

Dar à equipe uma fila real de pós-qualificação, permitindo saber quem precisa de contato, quem já foi contatada, quem está em entrevista e quem virou revendedora, sem tocar na entrevista, no IPR ou no Meta.

### 9.2 Recorte recomendado — CRM-001

Adicionar uma dimensão operacional separada do `lead.status`:

- `crm_stage`: `aguardando_contato | em_contato | entrevista | revendedora | descartada`;
- `crm_stage_updated_at`;
- `next_action_at` nullable;
- `contacted_at` nullable;
- `converted_at` nullable.

Aplicação:

- popular `crm_stage = aguardando_contato` apenas para leads aprovadas existentes/novas, com regra de compatibilidade explicitada na migration;
- manter `lead.status` intacto e visível como qualificação;
- criar no Admin um Kanban operacional separado ou substituir a página `/crm` para agrupar somente por `crm_stage`;
- mover card altera apenas `crm_stage` e timestamps operacionais;
- mostrar status de qualificação, IPR, estabilidade, data de entrada e próxima ação no card;
- manter botões de aprovação/reprovação fora do movimento operacional;
- registrar a ação humana explicitamente; abrir WhatsApp não deve ser considerado contato confirmado sem clique/ação própria;
- incluir filtros simples: etapa, vencidas/hoje e busca.

### 9.3 Por que esse é o menor valor real

- resolve a perda diária de acompanhamento depois da aprovação;
- usa a entidade `lead` já existente;
- não depende de transcript, WhatsApp API, automação ou IA;
- não interfere no `status = aprovada` que governa Pixel/CAPI;
- permite medir conversão final em revendedora e tempo entre etapas;
- é reversível e testável de forma isolada.

### 9.4 O que fica explicitamente fora de CRM-001

- persistência/visualização de transcript;
- correção do 409;
- abandono por etapa e recuperação automática;
- follow-up automático;
- handoff em tempo real Sofia-humano;
- retomada da Sofia;
- integração WhatsApp;
- mudança no IPR, thresholds, estabilidade, perfil ou aprovação;
- novos eventos Pixel/CAPI ou mudança no evento `Lead`;
- IA decidindo etapa de CRM;
- responsáveis, permissões avançadas e auditoria completa (podem ser CRM-002 após uso real).

### 9.5 Alternativa ainda menor, não recomendada

Reutilizar `lead.status` para acrescentar estados de CRM parece barato, mas mistura qualificação com operação, quebra relatórios/filtros e aumenta o risco de disparos Meta indevidos quando cards mudam. Não deve ser feito.

## 10. RFCs seguintes sugeridas

1. **RFC-013 / CRM-001:** pipeline operacional separado.
2. **RFC-014:** idempotência de `startConversation` após confirmar o DDL real.
3. **RFC-015:** eventos de etapa e abandono confiáveis (`current_step`/eventos deduplicados).
4. **RFC-016:** transcript append-only com message id, role, content, timestamp e origem, incluindo política de retenção/privacidade.
5. **RFC-017:** follow-up e WhatsApp com consentimento, templates e regras de opt-out.

## 11. Riscos e decisões pendentes

Riscos atuais:

- schema de produção não é integralmente reproduzível pelas migrations versionadas;
- histórico completo não existe;
- `answers` pode conter entradas interceptadas que não viraram resposta aceita;
- abandono explícito/passivo não fecha `conversations` consistentemente;
- provável corrida em `startConversation`;
- ciclo FK bidirecional lógico (`leads.conversation_id` e `conversations.lead_id`) é parcialmente usado e pode confundir queries;
- Kanban atual muda status de qualificação e aciona efeitos Meta na aprovação;
- bundles grandes: Landing ~758 kB e Admin ~1,283 kB minificados, com warning acima de 500 kB;
- cinco warnings de lint antigos relacionados a Fast Refresh.

Antes de implementar CRM-001, aprovar:

1. nomes exatos das etapas operacionais;
2. se `descartada` precisa de motivo obrigatório;
3. regra de backfill para aprovadas existentes;
4. se próxima ação/data entra já no primeiro recorte;
5. inspeção read-only do catálogo de produção para documentar índices, constraints, RLS e policies antes da migration.

## 12. Validação executada

- `lint` Landing: passou, 2 warnings antigos de Fast Refresh;
- `lint` Admin: passou, 3 warnings antigos de Fast Refresh;
- typecheck Landing/Admin: passou como parte de `tsc -b`;
- build Landing: passou;
- build Admin: passou, com warning de chunk acima de 500 kB;
- testes automatizados: não há script `test` nem runner configurado nos `package.json`; os cenários `*.examples.ts` não são executados automaticamente por um comando de teste versionado.

Nenhum deploy, commit, alteração de banco, Edge Function, Sofia, IPR, Landing, Admin ou Meta foi realizado por esta RFC.

## 13. Decisão solicitada

Solicita-se aprovação somente do escopo de **CRM-001 — pipeline operacional separado**, condicionado à inspeção read-only final do schema real e à definição dos cinco itens pendentes acima. A implementação não deve começar até essa aprovação.
