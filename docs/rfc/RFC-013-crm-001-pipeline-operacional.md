# RFC-013 — CRM-001: pipeline operacional

**Status:** especificação pronta para revisão; implementação bloqueada até a inspeção final do catálogo de produção  
**Escopo desta RFC:** investigação e documentação somente  
**Data:** 2026-08-11  
**Não realizado:** código de produto, migration, alteração de banco/Supabase/Admin/Landing/Sofia/IPR/Meta, deploy ou commit

## 1. Resumo executivo

CRM-001 deve adicionar a `leads` uma dimensão operacional independente da qualificação. `leads.status` permanece exclusivamente `novo | em_analise | aprovada | reprovada`; o pipeline usa `crm_stage` e inclui próxima ação desde a primeira versão.

A menor modelagem segura é manter o estado atual em `leads`. Não há necessidade de uma tabela de CRM nem de histórico append-only no CRM-001. São recomendadas sete colunas: `crm_stage`, `crm_stage_updated_at`, `next_action_at`, `contacted_at`, `converted_at`, `discard_reason` e `discard_note`. Os dois campos de descarte são necessários porque uma categoria fechada não deve carregar observação livre.

Leads aprovadas após a implantação entram em `AGUARDANDO_CONTATO`. Leads antigas permanecem com `crm_stage = null` e aparecem numa fila explícita “A classificar”; isso evita declarar, sem evidência, que nunca foram contatadas. O repositório não registra envio/conversa de WhatsApp nem conversão no ConsigGold, portanto não há base confiável para inferir esses estados.

Esta especificação não autoriza implementação. Há um bloqueio objetivo: o repositório não contém o DDL inicial e a consulta direta ao catálogo de produção não pôde ser autenticada nesta investigação. Os tipos gerados confirmam tabelas, colunas, enums e FKs conhecidas, mas não confirmam integralmente índices, checks, grants, RLS, policies, triggers, funções ou defaults. Antes de escrever a migration, o checklist SQL somente leitura da seção 2.4 deve ser executado por uma conexão de produção autorizada.

## 2. Schema real encontrado

### 2.1 Fontes examinadas

- `packages/shared/src/database.types.ts`, tipos gerados do Supabase/PostgREST 14.5;
- migrations incrementais versionadas;
- Edge Functions e código da Landing/Admin;
- RFC-012, documentação de qualificação e histórico Git local;
- build local existente, que identifica o projeto Supabase de produção;
- tentativas read-only à API da Vercel, ao endpoint REST de produção e à sessão do Admin.

Limitação comprovada: o token OIDC local foi recusado pela API da Vercel; o endpoint de schema do Supabase respondeu que somente uma chave `service_role` poderia acessá-lo; a sessão do navegador não ficou disponível. Nenhum dado de candidata foi lido e nenhuma escrita foi feita.

### 2.2 Estrutura confirmada de `public.leads`

| Coluna | Tipo lógico confirmado | Nulabilidade/default inferível pelos tipos |
|---|---|---|
| `id` | `uuid` | obrigatório na linha; default no insert |
| `nome` | `text` | not null |
| `telefone` | `text` | not null |
| `idade` | número inteiro | null |
| `cidade` | `text` | null |
| `instagram` | `text` | null |
| `whatsapp` | `boolean` | null |
| `trabalha` | `boolean` | null |
| `profissao` | `text` | null |
| `empresa_atual` | `text` | null |
| `estabilidade_profissional` | `estabilidade_profissional_enum` | null |
| `experiencia_vendas` | `boolean` | null |
| `tempo_disponivel` | `text` | null |
| `objetivo` | `text` | null |
| `ipr` | número | not null; default no insert |
| `perfil_comercial` | `perfil_comercial_enum` | null |
| `status` | `lead_status` | not null; default no insert |
| `observacoes` | `text` | null |
| `resumo_ia` | `text` | null |
| `origem`, `campanha` | `text` | null |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` | `text` | null |
| `fbp`, `fbc`, `fbclid`, `client_ip`, `client_user_agent` | `text` | null |
| `meta_lead_sent_at` | timestamp serializado | null |
| `conversation_id` | `uuid` | null |
| `created_at`, `updated_at` | timestamp serializado | not null; default no insert |

FK confirmada: `leads.conversation_id -> conversations.id`. Também existem referências inversas `conversations.lead_id`, `answers.lead_id`, `ai_analysis.lead_id` e `logs.lead_id` para `leads.id`.

Enums confirmados:

- `lead_status`: `novo`, `em_analise`, `aprovada`, `reprovada`;
- `perfil_comercial_enum`: `baixo`, `medio`, `alto`;
- `estabilidade_profissional_enum`: `ALTA`, `MEDIA`, `BAIXA`;
- `recomendacao_enum`: `aprovar`, `reprovar`, `analise_manual`;
- `evento_funil`: nove eventos, inclusive `aprovada`, `reprovada` e `analise_manual`.

Os tipos confirmam que `status` é um enum e, portanto, já existe uma trava estrutural aos quatro valores. Não foi possível confirmar checks adicionais, nome/owner/default exato do enum ou casts.

### 2.3 Dependências de `status` encontradas no código

- `finalize-candidate`: `decidirStatus` produz os três resultados finais; insere `leads`; cria log; quando `status === "aprovada"`, envia CAPI e grava `meta_lead_sent_at`.
- Landing: após finalizar, Pixel `Lead` roda somente quando a resposta é `aprovada`, com `eventID = lead_id`.
- Admin: `useUpdateLead` envia `send-meta-lead-event` após qualquer update cujo resultado tenha `status === "aprovada"`; a Edge Function é idempotente por `meta_lead_sent_at`.
- Kanban atual: agrupa pelas quatro colunas de `KANBAN_COLUMNS` e drag-and-drop atualiza diretamente `lead.status`.
- Dashboard, relatórios e relatório diário: contam/filtram explicitamente `status === "aprovada"`, `em_analise` e `reprovada`.
- Schemas/tipos/constants/shared e badges presumem exatamente os quatro valores.

Não foi encontrada função de aplicação que trate `crm_stage`, porque ele ainda não existe. Não foi possível confirmar funções ou triggers dentro do Postgres que dependam de `status`. O envio Meta encontrado é de aplicação/Edge Function, não evidência de trigger de banco.

### 2.4 Gate obrigatório de catálogo antes da implementação

Executar, em transação read-only ou usuário com privilégio somente leitura, e anexar o resultado à revisão da migration:

```sql
begin transaction read only;

-- colunas, tipos, defaults e nulabilidade
select * from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
order by ordinal_position;

-- enums
select n.nspname, t.typname, e.enumsortorder, e.enumlabel
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
order by t.typname, e.enumsortorder;

-- constraints e FKs
select conname, contype, pg_get_constraintdef(oid, true)
from pg_constraint
where conrelid = 'public.leads'::regclass
   or confrelid = 'public.leads'::regclass;

-- índices
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'leads';

-- RLS e policies
select relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.leads'::regclass;
select * from pg_policies
where schemaname = 'public' and tablename = 'leads';

-- grants de tabela/coluna
select * from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'leads';
select * from information_schema.column_privileges
where table_schema = 'public' and table_name = 'leads';

-- triggers e funções vinculadas
select tg.tgname, pg_get_triggerdef(tg.oid, true),
       pn.nspname as function_schema, p.proname,
       pg_get_functiondef(p.oid) as function_definition
from pg_trigger tg
join pg_proc p on p.oid = tg.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where tg.tgrelid = 'public.leads'::regclass and not tg.tgisinternal;

-- views e funções de usuário que mencionam leads/status
select schemaname, viewname, definition from pg_views
where definition ilike '%leads%' or definition ilike '%status%';
select n.nspname, p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and (pg_get_functiondef(p.oid) ilike '%leads%'
       or pg_get_functiondef(p.oid) ilike '%status%');

rollback;
```

Critério de liberação: não iniciar CRM-001 até conhecer os defaults exatos, todas as policies/grants e qualquer trigger/função sobre `leads`.

## 3. Modelo de dados recomendado

Adicionar diretamente a `public.leads`:

| Coluna | Tipo | Regra |
|---|---|---|
| `crm_stage` | `crm_stage_enum` | null para não aprovadas e legado não classificado |
| `crm_stage_updated_at` | `timestamptz` | null sem estágio; atualizado em toda mudança real de estágio |
| `next_action_at` | `timestamptz` | null permitido |
| `contacted_at` | `timestamptz` | instante do primeiro contato humano confirmado |
| `converted_at` | `timestamptz` | instante da primeira confirmação real como revendedora |
| `discard_reason` | `crm_discard_reason_enum` | obrigatório somente em `DESCARTADA` |
| `discard_note` | `text` | observação opcional, com limite recomendado de 500 caracteres na aplicação |

Enums exatos:

```text
crm_stage_enum =
  AGUARDANDO_CONTATO
  EM_CONTATO
  ENTREVISTA
  REVENDEDORA
  DESCARTADA

crm_discard_reason_enum =
  SEM_INTERESSE
  SEM_RETORNO
  INCOMPATIBILIDADE_OPERACIONAL
  IMPEDIMENTO_LOGISTICO
  VALIDACAO_PENDENTE
  OUTRO
```

Usar enums nativos segue o padrão real de `lead_status` e reduz estados inválidos. Não criar tabela nova: não há atributos próprios, cardinalidade 1:N ou necessidade de consulta histórica que justifique outra entidade.

Checks propostos:

- `crm_stage is null OR status = 'aprovada'`;
- `crm_stage = 'DESCARTADA'` se e somente se `discard_reason is not null`;
- `discard_note is null OR length(trim(discard_note)) between 1 and 500`;
- `crm_stage is null` implica `crm_stage_updated_at is null`;
- `contacted_at is not null` quando a etapa for `EM_CONTATO`, `ENTREVISTA` ou `REVENDEDORA`;
- `converted_at is not null` quando a etapa for `REVENDEDORA`.

As duas últimas regras devem ser aplicadas por uma operação atômica (RPC ou Edge Function) e testadas como constraint apenas se o fluxo de correção manual for definido. O objetivo é não criar uma migration impossível de corrigir operacionalmente.

## 4. Semântica das etapas

### `AGUARDANDO_CONTATO`

- Entrada: lead acaba de se tornar `aprovada`, ou lead legado é classificado manualmente como sem contato confirmado.
- Saída: contato confirmado (`EM_CONTATO`), atividade humana ativa (`ENTREVISTA`), conversão confirmada (`REVENDEDORA`) ou descarte com motivo.
- Timestamps: define `crm_stage_updated_at`; não define `contacted_at` nem `converted_at`.
- Permitido: abrir candidata, abrir WhatsApp, definir/alterar próxima ação, confirmar contato, mover etapa, descartar.
- Proibido: considerar o simples clique no WhatsApp como contato; existir para lead não aprovada.

### `EM_CONTATO`

- Entrada: humano confirma que houve troca real (mensagem efetivamente enviada com interação operacional, ligação atendida ou conversa equivalente).
- Saída: atividade de entrevista, conversão, descarte ou retorno operacional justificado a `AGUARDANDO_CONTATO` por correção.
- Timestamps: atualiza `crm_stage_updated_at`; na primeira entrada, define `contacted_at` se null.
- Permitido: registrar próxima ação, avançar/retroceder, descartar.
- Proibido: sobrescrever `contacted_at` em reentradas; entrar apenas porque o link do WhatsApp abriu.

### `ENTREVISTA`

- Entrada: conversa, agendamento ou avaliação humana está ativa; entrada direta também define `contacted_at` se ainda null.
- Saída: `REVENDEDORA`, `DESCARTADA` ou retorno a `EM_CONTATO`.
- Timestamps: atualiza `crm_stage_updated_at`; preserva o primeiro `contacted_at`.
- Permitido: reagendar, definir próxima ação, voltar a contato, converter ou descartar.
- Proibido: usar como sinônimo de entrevista automática da Sofia.

### `REVENDEDORA`

- Entrada: a operação confirmou que a candidata realmente virou revendedora da Tania Joias, não apenas que foi aprovada.
- Saída: nenhuma no fluxo normal. Correção de erro exige ação explícita no detalhe, com confirmação; drag-and-drop para fora fica proibido.
- Timestamps: atualiza `crm_stage_updated_at`; define `converted_at` se null e `contacted_at` se null.
- Permitido: abrir cadastro e, futuramente, vincular ConsigGold.
- Proibido: integração/criação automática no ConsigGold no CRM-001; apagar automaticamente `converted_at`.

### `DESCARTADA`

- Entrada: operação decide não prosseguir e informa categoria obrigatória.
- Saída: reabertura explícita para uma etapa não terminal; deve limpar `discard_reason` e `discard_note` atomicamente.
- Timestamps: atualiza `crm_stage_updated_at`; preserva `contacted_at`/`converted_at` já existentes.
- Permitido: consultar motivo, editar categoria/nota, reabrir com confirmação.
- Proibido: entrar sem motivo; descartar por drag-and-drop sem modal; alterar `lead.status`.

Em toda transição válida, `crm_stage_updated_at = now()`. Uma gravação que mantenha o mesmo estágio não altera esse timestamp.

## 5. Descarte

Motivos mínimos recomendados:

| Motivo | Por que existe | Informação gerada |
|---|---|---|
| `SEM_INTERESSE` | candidata declarou que não quer seguir | mede perda por decisão da candidata |
| `SEM_RETORNO` | tentativas razoáveis terminaram sem resposta | mede necessidade/eficácia de follow-up |
| `INCOMPATIBILIDADE_OPERACIONAL` | aprovação automática não se sustentou para a operação, sem reescrever qualificação | revela desalinhamento entre filtro e operação |
| `IMPEDIMENTO_LOGISTICO` | distância, rota, atendimento ou entrega inviabiliza continuidade | mede gargalos territoriais/logísticos |
| `VALIDACAO_PENDENTE` | documentação/identidade ou outra validação necessária não foi concluída | separa validação de falta de interesse |
| `OUTRO` | exceções não cobertas | evita inflar categorias; requer nota na UI |

`discard_reason` é obrigatório ao descartar. `discard_note` é opcional em geral e obrigatório na UI quando o motivo for `OUTRO`. Não usar a nota para repetir a categoria. “Fora do perfil” foi renomeado para `INCOMPATIBILIDADE_OPERACIONAL` para não confundir descarte humano pós-aprovação com `lead.status`/IPR.

## 6. Próxima ação

`next_action_at` é um `timestamptz` opcional:

- aceita passado, hoje ou futuro; não bloquear atrasadas;
- “hoje” e “vencida” são calculados no fuso `America/Sao_Paulo` na UI;
- vencida: valor anterior ao instante atual e lead não terminal (`REVENDEDORA`/`DESCARTADA`), com prioridade visual e ordenação primeiro;
- próxima em até 24 horas: segundo nível de prioridade;
- mover entre etapas não limpa a data;
- entrar em `REVENDEDORA` ou `DESCARTADA` limpa `next_action_at` atomicamente, pois são terminais;
- reabrir uma terminal mantém null até o usuário definir nova ação;
- oferecer ações rápidas “hoje”, “amanhã” e data/hora personalizada, sem tornar o campo obrigatório.

`next_action_type` **não entra no CRM-001**. Data/hora resolve a pergunta mais importante; um tipo obrigatório aumentaria cliques e tipos como WhatsApp/ligar/retornar se sobrepõem. Reavaliar após uso real, medindo quantas próximas ações precisam de interpretação externa.

## 7. Backfill

### Evidência disponível

Para leads existentes, o sistema guarda `created_at`, `updated_at`, `observacoes`, respostas estruturadas, análise IA e logs de funil. O campo `ai_analysis.proxima_acao` é recomendação da IA, não ação humana. O botão WhatsApp somente abre `wa.me` e não registra envio nem resposta. Não há timestamp de contato, evento de contato, responsável, conversão ou identificador ConsigGold.

Logo, `updated_at`, observações ou análise IA não são evidência determinística de contato/conversão. Uma análise read-only de conteúdo poderia encontrar pistas textuais, mas não seria segura para backfill automático. A produção não pôde ser lida nesta tarefa; mesmo com acesso, a regra deve permanecer conservadora.

### Regra recomendada

- novas aprovações após o marco de implantação: `AGUARDANDO_CONTATO` e `crm_stage_updated_at = instante da aprovação`;
- leads não aprovadas: todos os campos de CRM null;
- aprovadas anteriores ao marco: `crm_stage = null`, exibidas em “A classificar”, fora das cinco colunas até triagem manual;
- triagem legada permite classificar em qualquer estágio com confirmação; não inventar timestamps passados: usar o instante da classificação e, quando conhecido, permitir informar manualmente a data real de primeiro contato/conversão;
- não criar enum especial de migração: null já representa com precisão “estado operacional desconhecido”.

Essa é a opção B, com fila visual obrigatória para que null não vire dado invisível. Uma consulta read-only pré-migration deve contar aprovadas por data e presença de observações/análises, sem promover automaticamente nenhuma delas.

## 8. Kanban

A página `/crm` passa a mostrar apenas leads com `status = aprovada`, agrupadas por `crm_stage`, mais uma faixa/filtro “A classificar” para legadas null. As cinco colunas oficiais são `AGUARDANDO CONTATO`, `EM CONTATO`, `ENTREVISTA`, `REVENDEDORA` e `DESCARTADA`.

Mínimo do card:

1. nome e cidade;
2. IPR em número compacto e badge separado de qualificação;
3. estabilidade como badge discreto, inclusive “não informada”;
4. tempo desde `created_at` (com data no detalhe/tooltip);
5. próxima ação, ou “Sem próxima ação”, com indicador vencida/hoje;
6. atalho WhatsApp.

Telefone formatado, perfil comercial, observações e análise ficam no detalhe. Isso evita duplicar IPR/perfil e mantém o card orientado à decisão atual.

Ordenação dentro da coluna: vencidas mais antigas, ações de hoje, futuras por data, sem ação por `created_at` mais antigo. Filtros mínimos: busca, vencidas/hoje e etapa.

## 9. Ações

- `Abrir candidata`: drawer/detalhe completo;
- `WhatsApp`: abre link, sem alterar estágio/timestamp;
- `Marcar contato realizado`: transição atômica para `EM_CONTATO` e primeiro `contacted_at`;
- `Definir próxima ação`: data/hora ou limpar;
- `Mover etapa`: altera somente dados CRM;
- `Descartar`: modal obrigatório com motivo e nota condicional;
- `Reabrir`: limpa descarte e escolhe estágio destino;
- `Confirmar revendedora`: confirmação explícita, não simples drop.

Drag-and-drop continua útil para os três estágios não terminais. Para `DESCARTADA`, abrir modal; para `REVENDEDORA`, pedir confirmação. Um card em `REVENDEDORA` não sai por drag. Toda persistência deve ser uma operação atômica e o optimistic update deve reverter em erro.

## 10. Timestamps

- `crm_stage_updated_at`: última transição real; muda em ida/volta.
- `contacted_at`: primeiro contato humano confirmado; write-once por automação, nunca sobrescrito ao voltar/reentrar.
- `converted_at`: primeira conversão real confirmada; write-once no fluxo normal. `REVENDEDORA` é terminal. Correção de erro deve ser excepcional e explícita; sem histórico, a UI deve advertir que limpar esse timestamp perde a evidência.
- `updated_at`: pode continuar refletindo a atualização geral de `leads`, conforme o mecanismo atual confirmado no gate de catálogo; não substitui timestamps CRM.

Exemplo `ENTREVISTA -> EM_CONTATO -> ENTREVISTA`: `contacted_at` permanece, `converted_at` permanece null e `crm_stage_updated_at` registra apenas a transição mais recente. Perde-se a data da primeira entrevista e a sequência intermediária, conscientemente.

## 11. Necessidade ou não de histórico

**NÃO.** CRM-001 não precisa de histórico append-only.

Perdas aceitas: sequência completa de colunas, duração em cada etapa, autor de cada mudança, primeira data de entrevista e auditoria de correções. Ainda será possível operar a fila, priorizar próximas ações, saber primeiro contato, conversão e última mudança. Isso entrega valor sem criar tabela, triggers de auditoria, retenção e UI de timeline antes de existir uso real.

Gatilhos para CRM-002: mais de um operador, disputa sobre alterações, necessidade de SLA por etapa, compliance/auditoria ou automações baseadas em transições passadas.

## 12. Conversão futura em revendedora

No CRM-001, `REVENDEDORA` significa confirmação operacional do recrutamento e não cria nem altera cadastro no ConsigGold.

Integração futura recomendada:

- adicionar `consiggold_reseller_id` nullable e unique somente após conhecer o identificador imutável da API/banco ConsigGold;
- vincular por esse ID externo, nunca por nome;
- telefone/CPF podem ajudar a localizar candidatas, mas não devem ser a FK canônica sem regra de normalização e unicidade confirmada;
- fluxo futuro deve procurar correspondência, apresentar possível duplicata e exigir confirmação antes de criar;
- usar idempotency key baseada no `lead.id` para criação remota;
- manter `converted_at` como data de conversão de negócio e criar, futuramente, `consiggold_linked_at` para data técnica do vínculo.

Riscos: telefone reutilizado/alterado, nomes homônimos, CPF ausente ou sensível, retries criando duplicatas e divergência entre “virou revendedora” e “foi sincronizada”. `converted_at` prepara a mensuração, mas não deve fingir integração.

## 13. RLS e segurança

Política alvo, condicionada ao inventário real:

- `anon`: nenhuma permissão de update nos sete campos CRM;
- Landing: mantém somente as capacidades atuais necessárias e não recebe grant/policy nova;
- usuário autenticado só pode ler/alterar CRM se existir `profiles.id = auth.uid()` com papel administrativo permitido;
- `service_role`: mantém bypass necessário às Edge Functions, sem exposição no cliente;
- leitura segue o padrão atual; não ampliar `SELECT` anônimo;
- preferir RPC/Edge Function administrativa para transições, validando estágio, descarte, timestamps e terminalidade em uma transação;
- se update direto for mantido, usar grants por coluna mais policy administrativa; policy sozinha não distingue com segurança quais colunas foram alteradas;
- `SECURITY DEFINER`, se usado, deve fixar `search_path`, qualificar schemas, validar `auth.uid()`/perfil e revogar execução de `anon/public`.

Testes negativos obrigatórios devem usar a chave anônima real da Landing e um usuário autenticado não administrador. A migration não pode substituir policies existentes “às cegas”; deve ser escrita após o gate da seção 2.4.

## 14. Invariantes IPR/Meta

CRM-001 não altera:

- `calcularIpr`;
- `decidirStatus`;
- `classificarPerfil`;
- `estabilidade_profissional` ou seu significado informativo;
- thresholds/pesos de IPR;
- Pixel;
- CAPI e `send-meta-lead-event`;
- `event_id`/deduplicação;
- `meta_lead_sent_at`;
- regra `status = aprovada -> Lead`.

Pontos de acoplamento acidental a evitar:

1. reutilizar `useUpdateLead` para mover CRM: seu `onSuccess` envia Meta sempre que a linha resultante está aprovada;
2. reutilizar `KANBAN_COLUMNS`/`LeadStatus` no novo board;
3. alterar `status` junto com `crm_stage` no optimistic update ou payload;
4. adicionar etapas CRM ao enum `lead_status`, schemas, filtros ou eventos de funil;
5. disparar Pixel/CAPI ao entrar em `REVENDEDORA`;
6. usar `estabilidade_profissional` para bloquear transições ou conversão;
7. fazer backfill que atualize `status`, `meta_lead_sent_at` ou `updated_at` sem necessidade;
8. compartilhar uma função genérica de “aprovação/conversão” entre qualificação e CRM.

Criar mutation/hook próprios de CRM e invalidar apenas queries necessárias. O teste de Meta deve espionar a invocação da função, não chamar a Meta real.

## 15. Plano de testes

### Banco/RLS

1. nova aprovada recebe `AGUARDANDO_CONTATO` e timestamp correto;
2. `novo`, `em_analise` e `reprovada` ficam fora do pipeline;
3. constraint impede CRM em não aprovada;
4. descarte sem motivo falha; `OUTRO` sem nota falha na camada administrativa;
5. sair de descarte limpa motivo/nota;
6. primeira entrada em contato define `contacted_at`; reentrada preserva;
7. entrevista direta também define `contacted_at`;
8. entrada em revendedora define `converted_at`; regravação preserva;
9. terminal limpa `next_action_at`;
10. anon/Landing não atualiza CRM;
11. autenticado não admin não atualiza CRM;
12. Admin autorizado atualiza apenas pela operação prevista;
13. leitura continua igual ao padrão anterior.

### Aplicação

14. mover card altera `crm_stage`, nunca `status`;
15. mover card não invoca `send-meta-lead-event`, Pixel ou CAPI;
16. próxima ação futura aparece e ordena corretamente;
17. próxima ação vencida/hoje respeita `America/Sao_Paulo` e mudança de dia;
18. WhatsApp não marca contato;
19. descarte por drop abre modal e cancelar não move;
20. `ENTREVISTA -> EM_CONTATO -> ENTREVISTA` preserva coerência;
21. revendedora é terminal no drag e exige confirmação;
22. erro de persistência reverte optimistic update;
23. leads antigas null aparecem em “A classificar”; não somem nem entram automaticamente em aguardando;
24. status de qualificação continua visível em badge separado.

### Regressão e aceite

25. unit/integration tests de transição e ordenação;
26. typecheck shared, Admin, Landing e Edge Functions afetadas;
27. build Admin e Landing;
28. teste real no navegador autenticado: desktop, viewport estreita, teclado, drag, modais, reload e erro de rede;
29. smoke test da Landing: finalizar uma aprovada e uma reprovada;
30. conferir logs: exatamente um evento Meta `Lead` para a nova aprovada e zero eventos adicionais ao operar CRM;
31. executar a migration primeiro em ambiente de homologação com snapshot/rollback ensaiado.

Nenhum desses testes foi executado nesta RFC, pois não houve implementação.

## 16. Migration proposta em pseudodiff

Isto é desenho, não SQL executável nem arquivo de migration:

```diff
+ create type public.crm_stage_enum as enum (
+   'AGUARDANDO_CONTATO', 'EM_CONTATO', 'ENTREVISTA',
+   'REVENDEDORA', 'DESCARTADA'
+ );
+ create type public.crm_discard_reason_enum as enum (
+   'SEM_INTERESSE', 'SEM_RETORNO', 'INCOMPATIBILIDADE_OPERACIONAL',
+   'IMPEDIMENTO_LOGISTICO', 'VALIDACAO_PENDENTE', 'OUTRO'
+ );

  alter table public.leads
+   add column crm_stage public.crm_stage_enum null,
+   add column crm_stage_updated_at timestamptz null,
+   add column next_action_at timestamptz null,
+   add column contacted_at timestamptz null,
+   add column converted_at timestamptz null,
+   add column discard_reason public.crm_discard_reason_enum null,
+   add column discard_note text null,
+   add constraint leads_crm_only_for_approved check (...),
+   add constraint leads_discard_consistency check (...),
+   add constraint leads_discard_note_length check (...);

+ create index leads_crm_pipeline_idx
+   on public.leads (crm_stage, next_action_at)
+   where status = 'aprovada';
+ create index leads_crm_unclassified_idx
+   on public.leads (created_at)
+   where status = 'aprovada' and crm_stage is null;

+ -- ajustar grants/policies somente após comparar o catálogo real;
+ -- criar operação administrativa atômica para transições;
+ -- inicializar apenas aprovações novas a partir do marco de implantação;
+ -- não executar UPDATE de backfill nas aprovadas antigas;
+ -- não alterar lead_status, estabilidade, IPR ou Meta.
```

Índices devem ser validados com volume/plano real. Para poucos registros, apenas o índice parcial `(crm_stage, next_action_at)` pode bastar. A inicialização de novas aprovadas deve ser atômica: preferencialmente na operação server-side que efetiva a aprovação; se o gate revelar múltiplos escritores, avaliar trigger estreito que apenas inicialize CRM quando `status` transicionar para `aprovada` e `crm_stage` estiver null.

## 17. Arquivos que seriam alterados

Escopo provável de uma implementação única:

- nova migration em `supabase/migrations/`;
- `packages/shared/src/database.types.ts` regenerado;
- `packages/shared/src/schemas.ts` e `constants.ts` para tipos/labels CRM;
- `supabase/functions/finalize-candidate/index.ts` para inicialização atômica de aprovação nova, ou RPC dedicado após decisão do gate;
- `apps/admin/src/types/index.ts`;
- novo hook/mutation CRM separado de `useUpdateLead`;
- `apps/admin/src/pages/CrmPage.tsx`;
- `apps/admin/src/components/crm/KanbanBoard.tsx`, `KanbanColumn.tsx`, `KanbanCard.tsx` e modais/controles pequenos;
- testes novos para domínio, RLS e UI;
- documentação de operação/deploy.

Não alterar Landing/Sofia, funções de IPR/classificação, tracking/Pixel, helper CAPI nem `send-meta-lead-event`, salvo teste de regressão sem mudança funcional.

## 18. Riscos

1. **Maior risco técnico:** policies/grants/triggers reais de produção não estão versionados nem foram inspecionados; uma migration baseada só nos tipos pode abrir escrita anônima, bloquear o Admin ou acoplar uma transição CRM à aprovação/Meta.
2. `useUpdateLead` dispara Meta com base no estado final aprovado; reutilizá-lo causaria chamadas Meta em movimentos CRM, ainda que idempotentes.
3. múltiplos escritores de `status` podem deixar novas aprovações sem estágio se a inicialização existir em apenas um caminho.
4. backfill sem evidência criaria métricas falsas e filas enganosas.
5. timezone incorreto gera prioridades erradas perto da meia-noite.
6. drag-and-drop sem modal pode criar descarte/conversão acidental.
7. sem histórico, correções terminais não são auditáveis; aceitar apenas no primeiro recorte e restringir UX.
8. enum nativo exige cuidado em mudanças futuras; a lista curta e estável compensa esse custo.
9. `updated_at` pode ter trigger atual desconhecido e ser alterado pelo CRM; confirmar no catálogo.

## 19. Questões pendentes

Bloqueiam implementação:

1. resultado integral do gate de catálogo da seção 2.4;
2. quais valores de `profiles.papel` representam Admin autorizado;
3. quais caminhos reais podem mudar `status` para `aprovada` além de `finalize-candidate` e Admin;
4. volume e distribuição das aprovadas antigas para dimensionar a triagem, sem mudar a regra conservadora;
5. confirmar o identificador imutável do ConsigGold antes de qualquer RFC de integração.

Não bloqueiam CRM-001:

- responsável por lead;
- `next_action_type`;
- histórico append-only;
- integração WhatsApp;
- integração ConsigGold;
- SLA/automação por etapa.

## Decisão final A–H

**A. Colunas exatas recomendadas:** `crm_stage crm_stage_enum null`, `crm_stage_updated_at timestamptz null`, `next_action_at timestamptz null`, `contacted_at timestamptz null`, `converted_at timestamptz null`, `discard_reason crm_discard_reason_enum null`, `discard_note text null`.

**B. Enum exato de `crm_stage`:** `AGUARDANDO_CONTATO`, `EM_CONTATO`, `ENTREVISTA`, `REVENDEDORA`, `DESCARTADA`.

**C. Motivos de descarte:** `SEM_INTERESSE`, `SEM_RETORNO`, `INCOMPATIBILIDADE_OPERACIONAL`, `IMPEDIMENTO_LOGISTICO`, `VALIDACAO_PENDENTE`, `OUTRO`; motivo obrigatório, nota opcional e nota obrigatória na UI para `OUTRO`.

**D. Backfill:** opção B — aprovadas antigas permanecem `crm_stage = null` numa fila “A classificar”; apenas aprovações posteriores ao marco entram em `AGUARDANDO_CONTATO`.

**E. Histórico no CRM-001?** **NÃO.**

**F. `next_action_type` entra agora?** **NÃO.**

**G. Menor escopo implementável em uma entrega segura:** sete colunas e dois enums em `leads`, constraints/grants/policies confirmados pelo catálogo, inicialização atômica de novas aprovadas, Kanban Admin somente para aprovadas, fila legada null, próxima ação, contato, descarte e conversão, sem histórico nem integrações.

**H. Maior risco técnico:** desconhecimento atual das policies/grants/triggers/funções reais de produção, especialmente pelo acoplamento existente entre update de lead aprovado e envio Meta. A inspeção autenticada do catálogo é condição de início, não detalhe opcional.

