# IMPLEMENTATION-INTELLIGENCE-006B — Knowledge Service em shadow mode

**Data:** 2026-08-17
**Repositório:** `tania-joias-recrutamento`
**Branch/HEAD de pré-flight:** `main` / `ac787b952626217f9aba5499fc9fd75ad483523b`
**Estado:** implementação somente local; sem commit, push ou deploy

## Pré-flight e arquitetura encontrada

O diretório e o remote foram confirmados como `PROJETO CAPTURA DE LEADS 02` e
`https://github.com/plaquinhasid-debug/tania-joias-recrutamento.git`. Já existiam dois arquivos locais não
rastreados (`IMPLEMENTATION-INTELLIGENCE-005...` e `RFC-INTELLIGENCE-008...`); eles foram preservados.

O `KnowledgeRepository` real expõe `getAll()` e `getById()`. O engine padrão criava diretamente um
`InMemoryKnowledgeRepository(SEED_KNOWLEDGE_DOCUMENTS)`. `answerCandidateQuestion` cria esse engine, busca no
local e faz no máximo uma chamada ao `AIGateway`. `useSofiaFlow` chama esse pipeline quando intercepta uma
pergunta; IPR/finalização e o wizard são caminhos independentes.

As Edge Functions usam `Deno.env`, Supabase JS e respostas JSON. O padrão mais endurecido de origem/CORS é o
de `agent-ai-gateway`, com allowlist e falha fechada; ele foi adotado aqui. `sofia-config` lê settings com
service role do próprio CRM. A chave `sofia_knowledge_source` não existe no código/configuração atual.

## Diferenças entre RFC-008/005 e a realidade atual

Os RFCs são arquivos locais ainda não rastreados e registram a investigação anterior à 006A, inclusive a
ausência da RPC naquele momento. A 006B parte da premissa posterior fornecida: a RPC
`listar_conhecimento_publico_vigente()` já existe no ConsigGold. Comentários antigos ainda dizem que partes do
pipeline não são usadas, mas o caminho de pergunta livre está ativo. Nenhuma dessas diferenças exigiu mudar o
escopo.

## Implementação

- `knowledge-service` é uma Edge Function dedicada no CRM.
- Aceita `GET` sem query string ou `POST` vazio/`{}`; qualquer parâmetro é rejeitado.
- Valida origem por `KNOWLEDGE_ALLOWED_ORIGINS`, com fallback para `AGENT_ALLOWED_ORIGINS`.
- Usa somente `CONSIGGOLD_SUPABASE_URL` e `CONSIGGOLD_SUPABASE_ANON_KEY`.
- Chama exclusivamente a RPC zero-argumentos `listar_conhecimento_publico_vigente()`.
- Valida estritamente os seis campos PT-BR e os mapeia para o contrato:
  `knowledge_id`, `slug`, `category`, `title`, `content`, `version`.
- Campo extra, formato inválido, falha de configuração ou falha da RPC resulta em resposta fail-closed.

Na Landing, `ShadowKnowledgeRepository` compõe o repositório local e o remoto. `getAll/getById` sempre retornam
o local. Após o engine concluir a busca local, um hook opcional dispara a consulta remota fire-and-forget, com
timeout de 2,5 segundos. O ranking e os documentos enviados ao Claude já estão definidos antes dessa consulta;
o remoto nunca entra no contexto da IA e nunca altera a resposta.

## Allowlist do piloto

Somente estes slugs são comparados:

- `comissao-por-faixa-de-valor-vendido`
- `garantia-por-tipo-de-peca`
- `prazo-referencia-consignacao-30-dias`
- `primeiro-mostruario-sem-caucao`

Os demais documentos públicos podem atravessar o serviço, mas são ignorados pela comparação. O vínculo com o
local é explícito por ID; nenhum slug arbitrário é aceito do cliente.

## Segurança, fallback e observabilidade

Não há SQL dinâmico, tabela/audiência/empresa/pergunta informada pelo cliente nem credencial service role do
ConsigGold. O contrato rejeita campos extras, inclusive audiência e metadados de auditoria. Todo documento
remoto mapeado ao repository recebe `visibility: public` somente depois dessa validação estrita.

O log shadow contém apenas execução, disponibilidade, latência, slugs locais/remotos, versões, resultado de
comparação e um código técnico fechado. Os estados são `agreement`, `divergence`, `not_applicable` e
`not_compared`: indisponibilidade, timeout e payload inválido são sempre `not_compared`, nunca divergência.
Os únicos códigos de motivo na Landing são `remote_timeout`, `remote_invalid_payload` e `remote_unavailable`.
Não contém pergunta, conteúdo, sessão, nome, telefone,
WhatsApp, Instagram ou payload da candidata. Falha, timeout ou payload inválido são absorvidos e não bloqueiam
a conversa. A Edge Function também normaliza seu log para `remote_configuration_missing`, `remote_rpc_failed`
ou `remote_invalid_response`; nenhuma `error.message`, resposta arbitrária ou stack trace é registrada.

A garantia de audiência `PUBLICO` é fornecida estruturalmente pela RPC fechada
`listar_conhecimento_publico_vigente`. O repository valida estritamente o shape mínimo, mas não revalida
`audiencia`, porque esse campo deliberadamente não faz parte do contrato público. Por contrato, nenhum conteúdo
`INTERNO` deve chegar à Edge Function pela RPC.

Como `sofia_knowledge_source` não existe, nenhuma migration foi criada. O mecanismo mínimo desta fase é shadow
fixo por composição: local sempre oficial e remoto sempre best-effort. Antes de qualquer cutover deverá existir
uma configuração persistente explícita, com contrato e governança próprios.

## Arquivos alterados/criados

- `apps/landing/src/orchestrator/knowledge/KnowledgeRepository.ts`
- `apps/landing/src/orchestrator/knowledge/KnowledgeEngine.ts`
- `apps/landing/src/orchestrator/knowledge/ShadowKnowledgeCore.ts`
- `apps/landing/src/orchestrator/knowledge/ShadowKnowledgeRepository.ts`
- `apps/landing/src/orchestrator/knowledge/SupabaseRemoteKnowledgeRepository.ts`
- `supabase/functions/knowledge-service/contract.ts`
- `supabase/functions/knowledge-service/handler.ts`
- `supabase/functions/knowledge-service/index.ts`
- `tests/knowledge-shadow.test.mjs`
- `package.json`
- este documento

## Testes e regressões

`npm run test:knowledge-shadow`: 20/20 passaram. São comportamentais os cenários de retorno local exato em erro,
timeout real acima de 2,5 segundos, payload inválido, `getAll/getById`, ausência de conteúdo remoto no retorno,
eventos de concordância/divergência/indisponibilidade, motivos fechados e o handler HTTP (query string,
parâmetros proibidos, GET, POST vazio/`{}` e RPC falhando em 502). Continuam estruturais somente as verificações
de chamada única ao Claude e isolamento de IPR/finalização/wizard: exercê-las ponta a ponta exigiria refactor
amplo do pipeline/hook, desproporcional e fora dos quatro ajustes autorizados.

`npm run build:landing`: passou (`tsc -b` e build Vite). `git diff --check`: passou; somente avisos de conversão
LF/CRLF do ambiente Windows.

Não foi possível executar uma chamada real ao ConsigGold sem deploy e secrets — propositalmente proibidos
nesta etapa. O teste “mapper aceita catálogo válido com 9 itens públicos simulados” prova somente parser e
contrato com fixture local; não prova a contagem nem o conteúdo real remoto. Os 9 KIs reais deverão ser
confirmados em smoke test após autorização de configuração/deploy.

## Riscos e estado final

- O rate limit continua sendo o mesmo risco operacional já documentado para endpoints públicos; a função usa
  allowlist de origem, mas não adiciona persistência de rate limit.
- Timeout no browser não cancela fisicamente a requisição já enviada; ele apenas garante que o resultado tardio
  não afete a conversa.
- Comparação é textual normalizada (espaços/caixa), portanto paráfrases semanticamente equivalentes aparecem
  como divergência — adequado para observabilidade conservadora do piloto.
- Para ativação futura são necessários os secrets de URL/chave anon do ConsigGold e a allowlist de origens.

Estado final: shadow implementado localmente, fonte candidata-visível permanece local, uma única chamada ao
Claude, sem alterações em IPR, `finalize-candidate`, Admin, Landing textual ou progressão do wizard. Nenhum
commit, push ou deploy foi realizado.

## Commit e deploy controlado — 2026-08-17

- Commit da implementação: `9337427d6e799763ac3c90b4c6d57a03838667d1`.
- Mensagem: `feat(sofia): add Knowledge Service shadow mode`.
- Push: não realizado.
- Secrets configurados no `tania-joias-crm`, somente pelos nomes:
  `CONSIGGOLD_SUPABASE_URL`, `CONSIGGOLD_SUPABASE_ANON_KEY` e `KNOWLEDGE_ALLOWED_ORIGINS`.
- A chave do ConsigGold foi confirmada visualmente como `sb_publishable_…`; nenhuma `service_role`, senha de
  banco ou chave administrativa foi usada.
- Edge Function `knowledge-service`: deploy realizado exclusivamente no projeto `tania-joias-crm`. O endpoint
  respondeu com sucesso após o deploy; o dashboard não apresentou um número de versão legível.
- Landing: deploy não realizado. A integração Vercel identificou corretamente o projeto
  `tania-joias-recrutamento`, mas recusou o deploy sem um pacote completo e verificável de arquivos. Não houve
  contorno, deploy vazio, deploy do Admin nem push para acionar Git integration.

### Smoke real do catálogo

A chamada real, não destrutiva, retornou 9 documentos e somente os campos `knowledge_id`, `slug`, `category`,
`title`, `content` e `version`. Todos estão na versão 1:

- `comissao-por-faixa-de-valor-vendido`
- `prazo-referencia-consignacao-30-dias`
- `garantia-por-tipo-de-peca`
- `cidades-atendidas`
- `regra-atividade-profissional-candidata`
- `idade-minima-candidata`
- `criterios-contato-digital-candidata`
- `experiencia-em-vendas-nao-obrigatoria`
- `primeiro-mostruario-sem-caucao`

Os três slugs internos (`racional-interno-criterio-profissional`, `construcao-de-confianca-historico` e
`estrategia-giro-confiabilidade-financeira`) não apareceram. Também não apareceram `audiencia`, `company_id`,
aprovações, autoria, origem, fonte ou campos de auditoria.

### Segurança ao vivo

- `GET ?audience=INTERNO`: HTTP 400 / `parameters_not_allowed`.
- POST com `company_id`, `question`, `slug`, `status` ou `version`: HTTP 400 / `parameters_not_allowed`.
- Método `PUT`: HTTP 405 / `method_not_allowed`.

Essas rejeições acontecem no handler antes da chamada fixa à RPC; nenhum valor vira filtro do ConsigGold.

### Estado final após deploy parcial

O serviço remoto está ativo e validado, mas o bundle da Landing com a composição shadow ainda não foi
deployado. Portanto, a candidata em produção continua no comportamento anterior/local, e a observabilidade
shadow real da Landing ainda não executa em produção. A evidência de `remoteAvailable`, latência, slugs, versões
e comparação permanece nos testes comportamentais locais até que um deploy verificável da Landing seja
autorizado e concluído. Não houve candidatura real, `finalize-candidate`, Meta CAPI, WhatsApp ou ficha.
