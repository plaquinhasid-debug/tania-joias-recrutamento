# Diagnóstico Técnico Profundo — Projeto Captação de Leads (Tania Joias)
### Preparação para futura camada "Cérebro Tania Joias" — comparação posterior com ConsigGold

**Data do diagnóstico:** 2026-08-15
**Modo:** somente leitura. Nenhum código, migration, banco, Supabase, Landing, Admin, Sofia, IPR, Meta Pixel/CAPI ou prompt foi alterado. Nenhuma dependência instalada, nenhum deploy, nenhum commit. A única escrita realizada é este arquivo.

**Metodologia:** quatro investigações paralelas somente-leitura (código local + consultas MCP read-only ao Supabase remoto — `list_tables`, `list_migrations`, `list_edge_functions`, `get_edge_function`, `get_advisors`, `execute_sql` apenas com `SELECT`) cobrindo (1) arquitetura da Sofia/orquestrador, (2) CRM/Admin, (3) backend Supabase (schema, RLS, Edge Functions, secrets, flags reais), (4) Meta Pixel/CAPI, WhatsApp Cloud API e documentação (RFCs/playbooks/knowledge). Cada achado abaixo é marcado **[CONFIRMADO]** (visto diretamente no código, banco ou deploy real), **[INFERIDO]** (dedução razoável, sem prova 100% direta) ou **[NÃO CONFIRMADO]** (documentação/memória afirma algo que o código/banco não sustenta, ou o inverso).

---

## ⚠️ ACHADO MAIS IMPORTANTE DO DIAGNÓSTICO — leia antes do resto

O `PROJECT_STATUS.md` (datado de 2026-08-04) e a memória de sessões anteriores **estão desatualizados em pontos materiais**. A consulta direta ao banco de produção (`tania-joias-crm`, ref `iaqzbernshmhkqznleye`) em 2026-08-15 mostra:

```sql
-- SELECT chave, valor FROM settings — estado real em produção, 2026-08-15
sofia_conducao_natural                    = {"modo":"ACTIVE"}      -- doc dizia "shadow, nada publicado"
whatsapp_aprovacao_automatica_ativa       = {"ativa":true}          -- memória dizia "rejeitada, complicada demais"
whatsapp_ficha_automatica_ativa           = {"ativa":true}          -- doc dizia default false, "só liga depois de testar"
whatsapp_lembrete_ficha_automatico_ativa  = {"ativa":true}          -- idem
whatsapp_notificacao_tania_ativa          = {"ativa":true}          -- nem documentada em migration local
```

**[CONFIRMADO]** Isso significa que, hoje, em produção, para candidatas reais:
1. A Sofia já exibe reconhecimentos curtos determinísticos ("Prazer em conhecer você.", "Obrigada.", "Certo.", "Ótimo.") antes de 6 das 9 perguntas do roteiro (FEATURE-005 Parte 5, modo `ACTIVE` real, não shadow) — `apps/landing/src/hooks/useSofiaFlow.ts:552-567, 270-280`.
2. O sistema envia automaticamente, via WhatsApp Cloud API: mensagem de aprovação, link da Ficha de Aprovação, lembrete diário (cron, 10h BRT) para quem não preencheu a Ficha, e notificação à Tania quando a Ficha chega — **se** as credenciais (`WHATSAPP_CLOUD_API_TOKEN` etc.) estiverem de fato configuradas nos Secrets do Supabase (não verificado — só os nomes das variáveis, nunca valores).

Isso indica que houve trabalho/decisões tomadas diretamente em produção (Supabase Studio / toggles do Admin) **depois** da última atualização da documentação e da memória, sem que os arquivos locais tenham sido atualizados. **Recomenda-se tratar este relatório, e não o `PROJECT_STATUS.md`, como a fonte de verdade do estado atual**, e reconciliar a documentação separadamente (fora do escopo desta etapa, que é só diagnóstico).

Além disso, existe uma camada inteira **não documentada em nenhum lugar** ("Parte 7" da FEATURE-005): todo texto livre digitado pela candidata passa, sempre, por um classificador de intenção (`classifyCandidateMessageContextual` via `classifyForFeature004.ts`) que decide se o texto serve como resposta ao campo atual — se não servir, intercepta a mensagem **antes de qualquer gravação**, inclusive com um fluxo real de abandono de conversa que nunca chama `finalize-candidate`. Ver Seção 4.

E existe um webhook de recebimento de WhatsApp completo e funcional **dentro deste workspace** (`apps/admin/api/webhooks/whatsapp.mjs`), incluindo uma lógica pela qual a Tania pode aprovar/recusar uma candidata só respondendo "sim"/"não" no WhatsApp — sem flag, sem tela no Admin, não documentado no `PROJECT_STATUS.md`. Ver Seção 9.6.

---

## 1. Mapa completo do projeto

**[CONFIRMADO]** Monorepo `npm workspaces` (`package.json` raiz: `workspaces: ["apps/*", "packages/*"]`).

```
├── apps/
│   ├── landing/          → Landing Page + assistente "Sofia" (captação)
│   │   ├── src/orchestrator/   → arquitetura de agente completa (maioria shadow, ver Seção 4)
│   │   ├── src/hooks/          → useSofiaFlow.ts (motor real do wizard), useLandingTracking, useUtmParams
│   │   ├── src/data/           → sofia-script.ts (roteiro determinístico)
│   │   └── src/lib/            → tracking.ts (UTM/fbclid/fbp/fbc), api.ts
│   ├── admin/            → Painel administrativo (CRM, Kanban, Settings, Radar, Reports)
│   │   ├── src/pages, components, hooks, context, lib, routes, types
│   │   └── api/webhooks/whatsapp.mjs  → Vercel Serverless Function (webhook WhatsApp inbound — fora do Supabase)
├── packages/
│   └── shared/src/       → tipos gerados do Supabase, constantes (pipeline/Kanban, IPR), schemas Zod
├── supabase/
│   ├── functions/        → 12 Edge Functions do domínio + `_shared/` + 1 função órfã (`swift-action`)
│   └── migrations/       → 11 arquivos locais (histórico real no banco tem 19 — ver Seção 10)
├── docs/
│   ├── rfc/               → RFC-012, RFC-013, RFC-013.1 (CRM)
│   ├── playbooks/          → PLAYBOOK-001-sofia.md
│   ├── knowledge/          → COM-001 a COM-004 (base de conhecimento oficial)
│   └── qualificacao/       → QUALIFICACAO-002-estabilidade-trabalho.md
├── landing/               → [ÓRFÃO] scaffold antigo fora de apps/, fora do workspace npm, não usado por nada
├── criativos para campanha/  → assets de marketing, não código
├── PROJECT_STATUS.md      → estado do projeto (desatualizado, ver alerta acima)
└── demo-feature-003.ts    → script de demonstração avulso na raiz
```

**Sem testes automatizados** — **[CONFIRMADO]**: nenhum `vitest`/`jest` em nenhum `package.json` do monorepo; scripts de cada app são só `dev/build/lint/preview`.

**Dois deploys Vercel independentes** (`tania-joias-landing`, `tania-joias-recrutamento`) sobre o **mesmo** projeto Supabase (`tania-joias-crm`) — **[CONFIRMADO]** pelo `README.md` e pela seção de deploy do `PROJECT_STATUS.md`.

---

## 2. Stack real

| Camada | Tecnologia | Status |
|---|---|---|
| Monorepo | npm workspaces | **[CONFIRMADO]** `package.json` raiz |
| Landing | Vite + React 19 + TypeScript, Tailwind, Radix UI, React Hook Form + Zod | **[CONFIRMADO]** por `apps/landing/package.json` e uso no código |
| Admin | Vite + React + TanStack Query/Table, React Router, dnd-kit (Kanban), Recharts | **[CONFIRMADO]** |
| Shared | `packages/shared` — tipos gerados do Supabase (`database.types.ts`), constantes de pipeline/IPR, schemas Zod | **[CONFIRMADO]** — mas Edge Functions Deno **não conseguem importar** este pacote, gerando lógica duplicada (normalização de telefone, validação da Ficha) em pelo menos 3 lugares independentes |
| Backend | Supabase Postgres 17.6, projeto `tania-joias-crm`, ref `iaqzbernshmhkqznleye`, `sa-east-1`, status `ACTIVE_HEALTHY` | **[CONFIRMADO]** via MCP `list_projects`/`get_project` |
| Edge Functions | Deno, 12 funções do domínio + 1 órfã (`swift-action`, boilerplate "Hello World" nunca usado) | **[CONFIRMADO]** via `list_edge_functions` |
| IA | Anthropic Claude (`claude-haiku-4-5-20251001`), sempre server-side, sempre tool-use forçado | **[CONFIRMADO]** — 3 Edge Functions distintas chamam a Anthropic, cada uma com seu próprio system prompt (ver Seção 6) |
| Hospedagem | Vercel, 2 projetos (`tania-joias-landing`, `tania-joias-recrutamento`) | **[CONFIRMADO]** |
| E-mail | Resend, via `pg_cron` (`daily-leads-report`) | **[CONFIRMADO]**, job `daily-leads-report` ativo (11:00 UTC = 08:00 BRT) |
| Mensageria | WhatsApp Cloud API (Meta oficial) — **real**, não simulada | **[CONFIRMADO]** — helper `_shared/whatsapp-cloud-api.ts`, webhook `apps/admin/api/webhooks/whatsapp.mjs` |
| Rastreamento | Meta Pixel (client) + Conversions API (server), dedup por `event_id` | **[CONFIRMADO]** |
| Autenticação | Supabase Auth (email/senha), sem cadastro público | **[CONFIRMADO]** — `handle_new_user()` trigger + `profiles` (1 conta hoje) |
| CI/CD | **Nenhum** — deploy 100% manual (`vercel --prod`, paste manual no Supabase Studio) | **[CONFIRMADO]** pelo `PROJECT_STATUS.md §8`, sem motivo para achar que mudou |

---

## 3. Fluxo completo da captação (reconstruído do código real)

```
Meta Ads (campanha/anúncio, utm_*, fbclid)
  → Landing (/): Pixel dispara PageView, captura UTM+fbclid+fbp+fbc em sessionStorage
    → logs: landing_view (sempre) / ad_click (se utm_source presente)   [useLandingTracking.ts]
  → Início da conversa com "Sofia" (widget de chat embutido, wizard determinístico client-side)
    → beginIntro(): busca flags via Edge Function sofia-config (1x por conversa)
  → Coleta de dados (SOFIA_STEPS, sofia-script.ts): nome, cidade, idade, telefone, "trabalha atualmente?"
    (regra hardcoded, nunca por IA), profissão, empresa, experiência com vendas, WhatsApp, Instagram,
    estabilidade profissional, tempo disponível, objetivo
    → CADA resposta de texto livre passa por classifyCandidateMessageContextual() [SEMPRE ATIVO, sem flag]:
        - ANSWER compatível → grava normalmente
        - QUESTION (com flag sofia_perguntas_ia_ativa) → resposta via IA (FEATURE-004, ver Seção 4)
        - DOUBT/OBJECTION/SMALL_TALK/AMBIGUOUS → mensagem estática, repete a pergunta, NUNCA grava
        - END_CONVERSATION → despedida fixa, fase "abandoned", NUNCA chama finalize-candidate
    → reação contextual por IA em 2 pontos (profissão, objetivo) via sofia-reagir, se sofia_ia_ativa
    → reconhecimento determinístico antes de 6 campos, se sofia_conducao_natural = ACTIVE (hoje é o caso)
  → Ao concluir (ou trabalha=false) → finalize-candidate (Edge Function, ÚNICO ponto de escrita de leads)
    → calcularIpr / decidirStatus / classificarPerfil — 100% DETERMINÍSTICO, sem IA
    → status: novo → em_analise | aprovada | reprovada
    → se sofia_ia_ativa: chama ai-analysis.ts (Claude Haiku) — SÓ enriquece texto consultivo, nunca decide
  → Persistência: INSERT leads (+ ai_analysis, conversations.completed_at, answers.lead_id)
  → Se aprovada:
      - gera leads_ficha (Ficha de Aprovação) automaticamente, etapa_pos_aprovacao='contatada'
      - dispara Meta CAPI "Lead" (event_id=lead_id, dedup com Pixel client-side)
      - (se flags ligadas — hoje ligadas) WhatsApp automático: aprovação + link da Ficha
  → CRM (Admin): Kanban por lead_status + etapa_pos_aprovacao
      novo/em_analise → aprovada → contatada → confirmada → aguardando_tania → ativa | desistiu
  → Candidata preenche Ficha pública (/ficha/:token) → submit-ficha
      → avança contatada→confirmada; se whatsapp_notificacao_tania_ativa, notifica Tania por WhatsApp
      → avança →aguardando_tania SÓ se a notificação realmente saiu
  → Decisão final da Tania: manual no Admin (botões "aprovou"/"recusou")
      OU automática por resposta "sim"/"não" dela no WhatsApp (webhook, só se houver 1 pendente)
  → Contato humano/follow-up: 100% manual daqui em diante (botões que abrem wa.me com rascunho),
      exceto o lembrete diário automático de Ficha pendente (cron)
```

Nenhum trecho deste fluxo ficou sem confirmação no código — **[CONFIRMADO]** ponta a ponta.

---

## 4. SOFIA — arquitetura atual (seção prioritária)

### 4.1 Pipeline REAL (o que a candidata efetivamente vive hoje)

Ponto de entrada único: `apps/landing/src/hooks/useSofiaFlow.ts`.

1. **Abertura** — `beginIntro()`: busca `sofia-config` (flags) uma vez por conversa, com fail-safe (erro → tudo desligado).
2. **Cada resposta de texto livre** passa por `classifyMessageForFeature004()` → `classifyCandidateMessageContextual()` — determinístico, considera o campo atual. Só se classificado `ANSWER` compatível o fluxo segue normal; senão, é interceptado (ver alerta no topo).
3. **Reações por IA reais** (3 pontos, todos server-side, tool-use forçado, atrás de flag):
   - `sofia-reagir` — reação contextual pós-`profissão` e pós-`objetivo` (`sofia_ia_ativa`).
   - `agent-ai-gateway` — resposta a pergunta de negócio real da candidata (FEATURE-004, `sofia_perguntas_ia_ativa`, trava dupla cliente+servidor).
   - `ai-analysis.ts` (dentro de `finalize-candidate`) — análise consultiva pós-cadastro, **nunca vista pela candidata**.
4. **Reconhecimento determinístico** (FEATURE-005 Parte 5, `sofia_conducao_natural = ACTIVE` — real hoje) antes de 6 campos.
5. **Decisão de aprovação** — 100% determinística (`finalize-candidate`), nunca influenciada por IA.

### 4.2 Pipeline "shadow" — real, mas sem efeito visível

Vive em `apps/landing/src/orchestrator/` (60+ arquivos). **[CONFIRMADO]** roda em paralelo, observando, mas nunca decide nada visível:

- **Agent Core clássico**: `WorkingMemory` → `Context`/`ConversationState` → `Objectives`/`Planner` → `IntentClassifier` (raiz, diferente do usado em produção) → `DecisionEngine` → `ActionEngine`, orquestrado por `SofiaOrchestrator.processTurn()`, chamado a cada evento via `orchestratorRef.current?.processTurn(...)` em 7 pontos de `useSofiaFlow.ts` — **o valor de retorno nunca é lido em nenhum deles**. Só grava logs de dev.
- **`AgentProfile`/`AgentRegistry`/`AgentFactory`/`AgentRuntime`**: identidade formal (`SOFIA_PROFILE`) injetada de verdade no Orchestrator, mas só alimenta logs — nunca o texto exibido nem o system prompt real da IA (que é um objeto **separado e duplicado**, `SOFIA_PLAYBOOK` em `agent-prompts.ts`).
- **`ToolEngine`**: existe, mas **nenhuma Tool está registrada** em produção. `KnowledgeTool` (bridge para `ToolEngine`) existe como classe pronta, nunca instanciada.
- **`NaturalConversationEngine`, estratégia "AI"**: nunca invoca `AIReactionProvider` (stub que sempre lança "Not implemented") — mesmo com `sofia_conducao_natural = ACTIVE`, os campos gated como "AI" (`profissao`, `empresa_atual`, `experiencia_vendas`, `tempo_disponivel`, `objetivo`) não recebem nenhuma reação nova desta camada.
- **`shadowObserver`/`observeShadowTurn`**: `resolveNaturalConversationMode()` **força `ACTIVE → SHADOW`** especificamente para este observador — roda sempre em modo puramente observacional (`console.debug`, dev only), mesmo com o setting em `ACTIVE`.
- **`createDefaultAIGateway()`/`AnthropicProvider` stub client-side**: nunca chamado — `useSofiaFlow.ts` sempre monta seu próprio `AIGateway` com `SupabaseAIProvider` real.
- **Agent Simulator** (`orchestrator/simulator/`): dev-only, **[CONFIRMADO]** por grep completo — nenhuma referência fora da própria pasta.

### 4.3 Tabela de componentes (responsabilidade → entrada → saída → dependências → persistência → uso real)

| Componente | Arquivo | Responsabilidade | Entrada | Saída | Persistência | Status real |
|---|---|---|---|---|---|---|
| `SofiaOrchestrator` | `orchestrator/SofiaOrchestrator.ts` | Coordena ciclo Memory→Context→Objectives→Plan→Intent→Decision→Action | `ConversationEvent`+`TurnInput` | `Action` (nunca lido) | Nenhuma | **Shadow real** |
| `WorkingMemory` | `orchestrator/WorkingMemory.ts` | Histórico da conversa atual | `ConversationEvent` | `MemoryEntry[]` | Array em RAM do browser, morre no refresh | **Shadow real** |
| `Context`/`ConversationState` | `Context.ts`/`ConversationState.ts` | Reconstrói "o que a Sofia sabe" | `SofiaAnswers` | Snapshots | Nenhuma | Shadow real |
| `Objectives`/`Planner` | `Objectives.ts`/`Planner.ts` | Avalia 9 objetivos, prioriza próximo passo | `SofiaContext` | `Plan` | Nenhuma | Shadow real |
| `IntentClassifier` (raiz) | `orchestrator/IntentClassifier.ts` | Classifica intenção por keyword (10 tipos) | `ConversationEvent` | `Intent` | — | Shadow (substituído em produção por `classifyCandidateMessageContextual`) |
| `DecisionEngine`/`ActionEngine` | `DecisionEngine.ts`/`ActionEngine.ts` | Decide/executa ação a partir da intenção | `Intent`+`Plan` | `Decision`/`Action` | — | Shadow real |
| `AgentProfile` (`SOFIA_PROFILE`) | `agent/profiles/sofia.ts` | Identidade formal (missão, tom, capabilities) | — | Dado estático | — | Só logs, nunca vira prompt real |
| `AgentRegistry`/`AgentFactory`/`AgentRuntime` | `agent/*.ts` | Compõe perfil + Orchestrator | id | `AgentRuntime` | — | Shadow real |
| `KnowledgeEngine` | `orchestrator/knowledge/KnowledgeEngine.ts` | Busca documentos por keyword/stemming leve | Pergunta | `KnowledgeDocument[]` | Array em memória (bundle) | **Em produção**, atrás de `sofia_perguntas_ia_ativa` |
| `KnowledgeTool`/`ToolEngine` | `tools/*.ts` | Bridge Tool↔Knowledge / registro de tools | — | — | — | Shadow real — nunca registrada em produção |
| `AIGateway`/`AIProvider` | `ai/AIGateway.ts`/`AIProvider.ts` | Porta única para IA | `AIRequest` | `AIResponse` | — | Usado só quando `useSofiaFlow.ts` monta explicitamente com `SupabaseAIProvider` |
| `AnthropicProvider` (stub client-side) | `ai/AnthropicProvider.ts` | Provider Anthropic no browser | — | Sempre lança erro | — | Stub deliberado (RFC-004), nunca deve ativar |
| `SupabaseAIProvider` | `ai/SupabaseAIProvider.ts` | Provider real via Edge Function | `AIRequest` | `AIResponse` | — | **Em produção**, único provider real |
| `ResponseComposer`/`ResponsePolicies` | `composer/*.ts` | Monta/valida mensagem final da IA (anti-promessa, anti-2-perguntas) | Resposta IA + contexto | `ComposedResponse` | — | **Em produção**, atrás de flag |
| `answerCandidateQuestion` | `pipeline/answerCandidateQuestion.ts` | Liga KnowledgeEngine→AIGateway→ResponseComposer | Pergunta+sessionId | Resultado | — | **Em produção** |
| `NaturalConversationEngine` | `naturalConversation/*.ts` | Decide estratégia por campo (NONE/DETERMINISTIC/AI) | `ReactionRequest` | `ReactionResponse` | — | DETERMINISTIC em produção (via caminho próprio); AI shadow/stub |
| `shadowObserver` | `naturalConversation/shadowObserver.ts` | Observa divergência classificador novo × fluxo real | Turno | Log dev-only | Nenhuma | Shadow real |
| `classifyCandidateMessageContextual`/`classifyForFeature004` | arquivos homônimos | Classifica mensagem considerando campo atual | Texto+campo | Classificação | — | **Em produção, sempre ativo** para campos de texto livre |
| Agent Simulator | `simulator/*.ts` | Roda Orchestrator real contra 6 cenários fixos | Cenário | `SimulationResult` | — | Dev-only, inalcançável em produção |

### 4.4 Onde fica a fronteira entre determinístico e IA — ver Seção 5 (tabela dedicada).

### 4.5 System prompts — inventário completo (Seção 6 e 11 detalham o conteúdo)

Três prompts **fisicamente distintos**, cada um hardcoded numa Edge Function Deno diferente, nunca compartilhados entre si nem com o `AgentProfile` do frontend (duplicação documentada como deliberada — Deno não importa o bundle Vite/React):
1. `_shared/agent-prompts.ts` (`agent-ai-gateway`) — deriva manualmente de `docs/playbooks/PLAYBOOK-001-sofia.md`.
2. `_shared/sofia-reacao.ts` (`sofia-reagir`) — hardcoded direto, não deriva de nenhum `.md`.
3. `_shared/ai-analysis.ts` (`finalize-candidate`) — hardcoded, foco em avaliação de perfil.

---

## 5. O que é determinístico e o que é IA — fronteira exata

### Determinístico (zero chamada a modelo de IA)

| Componente | Arquivo | Função |
|---|---|---|
| Roteiro/wizard | `apps/landing/src/data/sofia-script.ts` | Array de perguntas + validação Zod |
| Classificação de mensagem (produção) | `classifyForFeature004.ts` + `classifyCandidateMessageContextual.ts` | Keyword-matching, decide ANSWER/QUESTION/DOUBT/OBJECTION/SMALL_TALK/END_CONVERSATION/AMBIGUOUS |
| Decisão de aprovação | `finalize-candidate/index.ts` (`calcularIpr`/`decidirStatus`/`classificarPerfil`) | IPR ponderado — **a IA nunca participa, em nenhuma hipótese** |
| Busca de conhecimento | `KnowledgeEngine.ts` | Keyword + stemming leve (não é busca semântica) |
| Reconhecimento "condução natural" | `DeterministicReactionProvider.ts` | Dicionário fixo de frases |
| Validação da resposta da IA | `ResponsePolicies.ts` | Regras de tamanho/parágrafos/perguntas/frases proibidas — decide se o texto da IA é usado |
| Kanban / transições de estado | `packages/shared/src/constants.ts` (`patchForPipelineColumn`) | Regras fixas de transição |

### IA real (Anthropic, sempre server-side, sempre tool-use forçado)

| Chamada | Edge Function | Gate | Visível à candidata? |
|---|---|---|---|
| Reação contextual (2 pontos) | `sofia-reagir` | `sofia_ia_ativa` | Sim |
| Resposta a pergunta de negócio | `agent-ai-gateway` | `sofia_perguntas_ia_ativa` (cliente + servidor) | Sim |
| Análise consultiva pós-cadastro | `finalize-candidate`→`ai-analysis.ts` | `sofia_ia_ativa` | **Nunca** (só Admin) |

**A fronteira exata**: nenhuma saída de IA voltada à candidata é exibida crua — sempre passa por `ResponseComposer`/`ResponsePolicies` (FEATURE-004) ou cai em fallback estático (`sofia-reagir`). A decisão de aprovação/reprovação/IPR/perfil é sempre calculada **antes** de qualquer chamada de IA e nunca é sobrescrita por ela — reforçado tanto em código (campos `_ia`/`sugerido` fisicamente separados dos campos oficiais) quanto no próprio system prompt ("VOCÊ NUNCA DECIDE: aprovação, reprovação, pontuação, IPR, regras da empresa").

---

## 6. Conhecimento da Sofia — inventário completo

**[CONFIRMADO]** Não existe nenhuma base de conhecimento centralizada, dinâmica ou com versionamento formal. O conhecimento está hardcoded em **pelo menos 4 lugares fisicamente distintos**:

| Fonte | Localização | Formato | Quem usa | Atualizável sem deploy? | Versionamento/aprovação |
|---|---|---|---|---|---|
| Documentos compilados | `orchestrator/knowledge/seedDocuments.ts` | Array TS hardcoded (8 docs) | `KnowledgeEngine` (FEATURE-004) | **NÃO** — exige rebuild+deploy da Landing | Campo `versao`/`ativo` por doc, sem changelog automático |
| Markdown originais | `docs/knowledge/COM-001..004*.md` | Markdown em git | Ninguém em runtime (só humano) | N/A | Git history; aprovado por "Antonio" |
| Playbook de comportamento | `docs/playbooks/PLAYBOOK-001-sofia.md` | Markdown em git | Ninguém em runtime — fonte de onde `SOFIA_PLAYBOOK` foi derivado manualmente | N/A | Git history; próprio doc avisa que mudanças exigem revisão manual do prompt derivado |
| System prompt FEATURE-004 | `_shared/agent-prompts.ts` | TS hardcoded | `agent-ai-gateway` | **NÃO** — deploy manual da Edge Function | Nenhum processo formal de sincronização com o `.md` |
| System prompt reação curta | `_shared/sofia-reacao.ts` | String hardcoded | `sofia-reagir` | **NÃO** | Nenhum |
| System prompt análise | `_shared/ai-analysis.ts` | String hardcoded | `finalize-candidate` | **NÃO** | Nenhum |
| Regras de negócio dinâmicas | Tabela `settings` (JSONB) | `ipr_pesos`, `ipr_thresholds`, `cidades_atendidas`, flags | 4 Edge Functions | **SIM** — via Admin, sem deploy | Sem changelog, mas é o único dado realmente "ao vivo" |
| Regra de reprovação "desempregada" | `sofia-script.ts` (`SOFIA_REJECTION_LINES`) | Texto verbatim | `useSofiaFlow.ts` | NÃO | Origem documentada em comentário (COM-002 v1.1) |
| Profissões preferidas | `finalize-candidate/index.ts` | Array hardcoded | `ai-analysis.ts` | NÃO | Nenhum |

Documentos oficiais (`COM-001` a `COM-004`): todos revisados/aprovados por **"Antonio" (proprietário)**, nunca por "Tania", em formato consistente (cabeçalho Documento/Versão/Revisado por/Status). COM-002 tem v1.1 (correção de cidade e remoção de critério de filhos/estado civil).

**Risco estrutural**: os documentos compilados (`seedDocuments.ts`) e os markdown originais (`docs/knowledge/`) são **duas fontes de verdade que podem divergir silenciosamente** — nada no código garante sincronização.

---

## 7. Memória — a Sofia realmente aprende? **Não.**

**[CONFIRMADO]**, rigorosamente verificado:

- `WorkingMemory` é um array **em RAM do processo do navegador** — não grava em `localStorage`/`sessionStorage`/IndexedDB/banco. **Morre no refresh.**
- `orchestrator/MemoryTypes.ts` define `ConversationMemory`/`BusinessMemory`/`LongTermMemory` — **três interfaces TypeScript vazias, sem nenhuma implementação, sem nada que as popule ou leia**. O próprio comentário do arquivo admite: "Ainda não implementada — exigiria persistência fora do navegador" / "exigiria identificar a candidata entre sessões".
- As tabelas Postgres que persistem dados de verdade (`conversations`, `answers`, `leads`, `ai_analysis`, `logs`) são **registros para o time humano ler no Admin** — nenhum código faz uma nova instância da Sofia consultar leads/conversas anteriores da mesma pessoa para influenciar a conversa atual.
- Se a mesma candidata abrir a Landing de novo em outra sessão, a Sofia começa **do zero**, sem nenhum reconhecimento de que já conversou com ela.
- Cada chamada à Anthropic é **stateless** — recebe só o contexto daquela conversa específica, montado na hora.

**O que pode parecer aprendizado mas não é**: o "reconhecimento determinístico" da condução natural (frases como "Obrigada pela informação.") é um dicionário fixo por campo, não adaptação — é a mesma frase para todo mundo, sempre. A "análise consultiva" da IA (`ai_analysis`) é uma opinião gerada por chamada isolada, não uma memória acumulada.

---

## 8. Aprendizado — mecanismos existentes: **nenhum**

Verificado item a item, **[CONFIRMADO]**:

| Mecanismo | Existe? |
|---|---|
| Extrair conhecimento de conversas | Não |
| Armazenar novos conhecimentos automaticamente | Não |
| Feedback humano sobre respostas da IA | Não — nenhum botão/campo no Admin para marcar resposta boa/ruim |
| Correção de respostas / fine-tuning | Não — único "ajuste" é editar manualmente o código e redeployar |
| Versionamento formal de conhecimento | Parcial — só campo `versao: number` por documento, sem changelog nem aprovação registrada no sistema |
| Avaliação de qualidade automatizada | Não — nenhuma métrica de satisfação/abandono automatizada (o próprio `PROJECT_STATUS.md` já reconhecia isso) |
| Aprendizado contínuo | Não |

---

## 9. CRM de Recrutamento

### 9.1 Modelo de dados do lead (tabela `leads`, confirmada via MCP)

`id, nome, telefone, cidade, idade, trabalha, empresa_atual, profissao, estabilidade_profissional (enum, informativo, PROIBIDO no IPR), experiencia_vendas, whatsapp, instagram, tempo_disponivel, objetivo, ipr, perfil_comercial (enum), resumo_ia, status (enum lead_status), etapa_pos_aprovacao (enum, nullable), origem, campanha, utm_source/medium/campaign/content, fbp, fbc, fbclid, client_ip, client_user_agent, meta_lead_sent_at, whatsapp_automatico_enviado_em, observacoes, conversation_id (FK), created_at, updated_at`. **38 linhas hoje** em produção.

### 9.2 Estados do pipeline (fonte real: `packages/shared/src/constants.ts:104-220`)

Dois campos reais combinados por `pipelineColumnKeyForLead()`:
- `lead_status`: `novo` → `em_analise` → `aprovada` | `reprovada`
- `etapa_pos_aprovacao` (só quando `aprovada`): `contatada` → `confirmada` → `aguardando_tania` → `ativa` | `desistiu`

**Kanban visual**: 6 colunas (reduzido de 9 no commit `c288f1e`, 14-15/08, "levantamento em produção mostrou que essas etapas nunca tiveram card algum"). **Bug de build corrigido no mesmo dia** (commit `33e113c`) — o `switch` de transição não cobria mais `aguardando_tania`/`reprovada` após a fusão.

### 9.3 Motor de decisão IPR (`finalize-candidate`) — 100% determinístico

`calcularIpr`: soma pesos configuráveis (`settings.ipr_pesos` hoje: `trabalha:50, whatsapp:10, instagram:10, cidade_atendida:10, experiencia_vendas:20`). `decidirStatus` contra `settings.ipr_thresholds` (hoje: `aprovar:80, analise_min:60`). `classificarPerfil` idem. **A IA nunca participa.**

### 9.4 Fluxo "Ficha de Aprovação" (pós-aprovação, ponta a ponta) — **[CONFIRMADO]**

Formulário público (endereço, pais, cônjuge, 3 referências pessoais + 1 comercial) que a candidata preenche após aprovada, usado pela Tania para decidir se libera o mostruário real.

1. Link gerado automaticamente (`leads_ficha`, token único) na aprovação (auto pela IPR, ou manual pela equipe) — idempotente.
2. Envio do link: manual por padrão (botão abre `wa.me` com rascunho) **ou** automático via WhatsApp Cloud API (flag `whatsapp_ficha_automatica_ativa`, hoje **ligada** em produção).
3. Candidata preenche em `/ficha/:token` → `get-ficha` (nunca expõe `lead_id`) → `submit-ficha` (uso único, 409 se reenviar).
4. `submit-ficha` avança `contatada→confirmada`; se `whatsapp_notificacao_tania_ativa` (hoje **ligada**), notifica a Tania por WhatsApp texto livre (número hardcoded `5511967660123`), avança `→aguardando_tania` **só se a mensagem realmente saiu**.
5. Decisão final da Tania: manual no Admin **ou** automática por resposta "sim"/"não" dela no WhatsApp (webhook — ver 9.6).

### 9.5 Lembretes e follow-up

- **Lembrete manual de 1 clique** (Kanban): abre `wa.me` com rascunho pronto, precisa clicar enviar.
- **Lembrete automático diário** (`send-lembretes-ficha`, cron 10h BRT, flag `whatsapp_lembrete_ficha_automatico_ativa`, hoje **ligada**): varre Fichas pendentes há +2 dias.
- **"Próxima ação"** (`ai_analysis.proxima_acao`): sugestão textual da IA (badge no Kanban), **puramente informativa, não dispara nada sozinha**.
- **Não existe** fila de tarefas/follow-up genérico — só os pontos específicos da Ficha.

### 9.6 Achado não documentado — decisão da Tania por WhatsApp

**[CONFIRMADO]** `apps/admin/api/webhooks/whatsapp.mjs` (Vercel Serverless Function, não Supabase), com validação HMAC-SHA256 da assinatura Meta, persiste todo tráfego inbound/outbound (`whatsapp_contacts`/`whatsapp_messages`), e contém `processarDecisaoTania()`: se a mensagem vier do número fixo da Tania (`5511967660123`) e for reconhecida como "sim"/"não" (com variações), **e houver exatamente 1 lead pendente em `aguardando_tania`**, aplica a decisão diretamente via `PATCH` na REST API do Supabase — sem passar pelo Admin. Se houver 0 ou 2+ pendentes, **ignora silenciosamente, sem avisar ninguém**. Não tem flag em `settings`, não aparece em Configurações, roda sempre que o webhook está publicado. Também tem uma resposta automática genérica opcional (`WHATSAPP_AUTO_REPLY_ENABLED`, env var, não flag do Admin).

### 9.7 Implementado vs. documentado vs. planejado

- **Implementado e ativo**: motor IPR, Kanban, geração de Ficha, RLS, Radar (funil de 5 passos), relatório diário, todas as 4 automações WhatsApp de saída (hoje com flag **ligada** em produção), decisão da Tania via webhook.
- **Documentado mas NÃO implementado como especificado**: RFC-013/013.1 (CRM-001) propunham 7 colunas novas (`crm_stage`, `next_action_at`, `discard_reason` etc.) e um gate formal de catálogo antes de codar — nunca implementado; o time seguiu por um caminho mais simples (`etapa_pos_aprovacao`, 5 valores) sem passar pelo gate.
- **Parcialmente implementado**: QUALIFICACAO-002 — a pergunta de estabilidade profissional existe, mas continua só informativa (Modelo A), não o Modelo C recomendado (estabilidade como critério adicional de pontuação).

---

## 10. Supabase e Segurança

**[CONFIRMADO via MCP, consulta real ao projeto `iaqzbernshmhkqznleye`]**

### 10.1 Migrations — gap de auditoria confirmado
19 migrations aplicadas no banco remoto vs. 11 arquivos locais — confirma que, historicamente, mudanças de schema foram feitas direto via `apply_migration`/`execute_sql` sem versionamento local. A migration local `add_whatsapp_conversations` **não aparece** no histórico remoto de migrations, embora as tabelas `whatsapp_contacts`/`whatsapp_messages` existam de fato (aplicadas por fora do tracking padrão).

### 10.2 Tabelas (11 no domínio) e RLS
Todas as 11 tabelas do domínio têm **RLS habilitado**. `leads`/`leads_ficha`/`settings` não têm nenhuma policy `anon` (por design — escrita só via service role nas Edge Functions). `whatsapp_contacts`/`whatsapp_messages` têm RLS ligado mas **zero policies** — não é vazamento (é excesso de restrição), mas significa que nenhum papel client-side enxerga essas tabelas.

### 10.3 Edge Functions (12 do domínio + 1 órfã)
Tabela completa no relatório-fonte; resumo: `finalize-candidate` (único writer de `leads`), `sofia-reagir`, `agent-ai-gateway` (única com allowlist de origem real via `AGENT_ALLOWED_ORIGINS`), `sofia-config`, `daily-leads-report`, `send-whatsapp-approval`, `get-ficha`, `submit-ficha`, `send-whatsapp-ficha`, `send-meta-lead-event`, `send-lembretes-ficha`. **`swift-action`**: função órfã, boilerplate padrão "Hello World" do Supabase Studio, nunca usada — candidata a limpeza (fora do escopo desta etapa).

**Divergência de config notada**: `sofia-config` e `send-meta-lead-event` estão com `verify_jwt: true` no deploy real, apesar dos comentários no código dizerem "mesmo padrão `verify_jwt: false`" — provavelmente inofensivo (o SDK `supabase-js` anexa a anon key automaticamente), mas é uma divergência entre intenção documentada e configuração real.

### 10.4 RPCs/triggers — só 2 funções customizadas
`handle_new_user()` (cria linha em `profiles` ao criar conta) e `set_updated_at()` (trigger de `leads`). **Nenhuma lógica de IPR em SQL** — todo o cálculo é TypeScript na Edge Function.

### 10.5 pg_cron — 2 jobs ativos
`daily-leads-report` (08h BRT) e `lembrete-ficha-pendente` (10h BRT), ambos `active: true`.

### 10.6 CORS/Allowlist
Maioria das funções usa `Access-Control-Allow-Origin: "*"`. **Única exceção real**: `agent-ai-gateway`, fail-closed via `AGENT_ALLOWED_ORIGINS`.

### 10.7 Secrets (só nomes, sem valores)
Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`, `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APPROVAL_TEMPLATE_NAME`, `WHATSAPP_FICHA_TEMPLATE_NAME`, `RESEND_API_KEY`, `AGENT_ALLOWED_ORIGINS`. Vercel/Admin (webhook): `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`. **Nomes de token de WhatsApp divergem** entre os dois ambientes (`WHATSAPP_CLOUD_API_TOKEN` vs `WHATSAPP_ACCESS_TOKEN`) — mesmo valor sob nomes diferentes, ou tokens realmente diferentes, não verificável a partir do código.

### 10.8 Advisors (`get_advisors`, sem `ERROR`, só `INFO`/`WARN`)
Segurança: extensão `pg_net` fora de schema dedicado (WARN); proteção de senha vazada (HaveIBeenPwned) desabilitada no Auth (WARN). Performance: 3 FKs sem índice de cobertura; `profiles.self_update_profile` reavalia `auth.uid()` por linha; `campaigns` com 2 policies permissivas redundantes; índices nunca usados (mas volume de dados ainda baixo).

### 10.9 Autenticação
Supabase Auth email/senha, sem cadastro público. `profiles.papel` é texto livre com default `'equipe'`, **sem enum/CHECK** — não há RBAC granular. **Só 1 conta de equipe existe hoje.**

---

## 11. Integração com IA

- **Provider**: Anthropic Claude, modelo `claude-haiku-4-5-20251001`, sempre via `Deno.env.get("ANTHROPIC_API_KEY")` — nunca no browser.
- **Gateway**: `agent-ai-gateway` é a única "ponte" com contrato fechado (só aceita `GENERATE_CONVERSATIONAL_RESPONSE`); as outras 2 chamadas (`sofia-reagir`, `ai-analysis.ts`) chamam a Anthropic diretamente dentro da própria função, sem passar por um gateway comum.
- **3 chamadas, 3 system prompts diferentes, nunca compartilhados** (ver Seção 6).
- **Contexto enviado**: varia por chamada — objetivo atual do roteiro, intenção já classificada client-side, decisão do motor determinístico client-side, `knownContext` (passthrough limitado), até 3 documentos oficiais (`agent-ai-gateway`); respostas anteriores da conversa (`sofia-reagir`); todos os dados coletados + IPR já calculado (`ai-analysis.ts`).
- **Tratamento de erro/fallback**: sempre best-effort — erro ou timeout cai em `null`/fallback estático, nunca derruba o fluxo principal para a candidata.
- **Timeout**: 6s confirmado em `useSofiaFlow.ts` para o `AIGateway`.
- **Custos/tokens**: **[NÃO CONFIRMADO]** nenhum controle de custo/orçamento encontrado no código (sem limite de tokens por requisição além do rate limiter de 20 req/60s por origem em `agent-ai-gateway`, que é anti-abuso, não controle de custo).
- **Segurança da chave**: `AnthropicProvider` client-side é um stub que **deliberadamente lança erro** (RFC-004) — decisão de segurança documentada explicitamente no código.
- **Resposta forçada via tool-use** em todas as 3 chamadas — nunca texto livre não estruturado.

---

## 12. Meta / Aquisição

**[CONFIRMADO]**

- **Pixel** (client): `apps/landing/index.html` — `PageView` sempre; `Lead` só quando a aprovação é imediata pela IPR (`useSofiaFlow.ts:225`, `eventID=lead_id`).
- **CAPI** (server, `_shared/meta-conversions.ts`): espelha o evento `Lead` com o **mesmo `event_id`** (dedup confirmado), disparado em 2 pontos (`finalize-candidate` para aprovação imediata; `send-meta-lead-event` para aprovação manual posterior). `user_data` enviado: telefone normalizado e **hasheado SHA-256**, `fbp`, `fbc`, `client_ip`, `client_user_agent` — nenhum outro dado pessoal (nome/cidade/e-mail) vai para a Meta.
- **UTM**: `utm_source/medium/campaign/content` capturados via `URLSearchParams`, persistidos em `sessionStorage`, gravados em `leads.*`.
- **fbclid/fbp/fbc**: capturados em `tracking.ts`, inclusive **reconstrução manual do `_fbc`** quando o cookie do Pixel falha (bloqueadores de rastreamento).
- **Rastreamento de anúncio/criativo individual**: **[NÃO CONFIRMADO]** — só existe rastreamento por campanha via UTM; não há campo dedicado a `ad_id`/`creative_id`/`adset_id`. A tabela `campaigns` não tem FK para `leads`/`logs`.
- **Outros eventos Pixel** (ViewContent, CompleteRegistration etc.): **[NÃO CONFIRMADO]** — não existem.

---

## 13. Identidade entre sistemas (documentação, sem proposta de solução)

### 13.1 Identificadores existentes

| Identificador | Onde vive | Normalizado? |
|---|---|---|
| `leads.telefone` | `leads` | **NÃO** na gravação — só no envio (WhatsApp/Meta) |
| `whatsapp_contacts.telefone` (PK) | `whatsapp_contacts`/`whatsapp_messages` | Vem pré-normalizado da própria Meta |
| `leads.id` (uuid) | `leads` | N/A, PK interna |
| `conversations.session_id` | `conversations`/`answers`/`logs` | UUID gerado client-side, persistido em `sessionStorage` — **não existe em `leads`** |
| `leads_ficha.token` | `leads_ficha` | UUID de uso único ("magic link"), não é identificador de pessoa reaproveitável |
| `fbp`/`fbc`/`fbclid` | `leads` | Identificador do lado Meta, não reaproveitável por outro sistema nosso |
| E-mail da candidata | **Não existe em nenhuma tabela** | — |
| CPF/documento | **Não existe em nenhuma tabela**, nem na Ficha (que pede pais/cônjuge/referências mas não documento) | — |

### 13.2 Riscos de identidade/duplicidade — **[INFERIDO com alta confiança, não confirmável 100% sem acesso ao catálogo Postgres bruto]**

- **Sem proteção de duplicidade**: `finalize-candidate` faz `INSERT` puro em `leads`, sem consulta prévia por telefone, sem `ON CONFLICT`. Nenhum `UNIQUE` em `leads.telefone` encontrado nas migrations versionadas.
- **Sem normalização na gravação**: o telefone é gravado exatamente como a candidata digitou — a mesma pessoa digitando `"11 96766-0123"` e `"11966660123"` geraria 2 leads diferentes, sem alerta.
- **3 implementações independentes** da mesma função de normalização de telefone (Deno/`_shared`, Vercel `.mjs`, browser `format.ts`) — sem util compartilhado (Edge Functions Deno não importam `packages/shared`).
- **`leads` e `whatsapp_contacts`/`whatsapp_messages` são sistemas de identidade desconectados** — sem FK, sem join no código, sem reconciliação por telefone normalizado. Não é possível hoje, a partir de uma linha em `leads`, encontrar automaticamente o histórico de WhatsApp da mesma pessoa.

**Conclusão desta seção**: o identificador mais forte e mais universal para uma futura identidade unificada é o **telefone**, mas hoje é o campo menos confiável tecnicamente (sem normalização consistente, sem dedup, fragmentado entre 2+ tabelas). Não há CPF nem e-mail de candidata em lugar nenhum do sistema.

---

## 14. Componentes potencialmente reutilizáveis (sem redesenhar nada)

| Componente | Classificação | Justificativa |
|---|---|---|
| `AIGateway`/`AIProvider` (interface) | **REUTILIZÁVEL COM ADAPTAÇÃO** | Já é uma abstração de porta única para IA, desenhada para múltiplos providers; hoje só tem `SupabaseAIProvider` real e um stub. A interface é genérica o bastante para servir de ponto de partida, mas está fisicamente presa ao bundle da Landing (Vite/React), precisaria virar pacote isolado |
| `SupabaseAIProvider` / padrão "Edge Function como ponte segura" | **REUTILIZÁVEL COMO ESTÁ (padrão), NÃO COMO CÓDIGO** | O padrão arquitetural (chave nunca no client, contrato fechado, tool-use forçado, allowlist de origem) é sólido e replicável; o código em si é específico do contrato da Sofia |
| `KnowledgeEngine` (busca por keyword/stemming) | **REUTILIZÁVEL COM ADAPTAÇÃO** | Interface (`searchByQuestion`, `visibility: public/internal`) é genérica; a implementação (stemming leve, sem embeddings) é limitada — serviria de esqueleto, não de motor de busca definitivo |
| `ResponseComposer`/`ResponsePolicies` | **REUTILIZÁVEL COM ADAPTAÇÃO** | Padrão de validação pós-IA (anti-promessa, anti-2-perguntas, tamanho) é um conceito valioso e portável; as regras específicas são do domínio Sofia |
| `AgentProfile`/`AgentRegistry`/`AgentFactory`/`AgentRuntime` | **REUTILIZÁVEL COM ADAPTAÇÃO (mas nunca provado em produção)** | É infraestrutura de composição de agente pronta, mas 100% shadow — nunca rodou de verdade influenciando uma resposta real. Adotar como base para um "Cérebro" central significaria confiar em código nunca validado end-to-end |
| Pipeline determinístico (WorkingMemory→...→ActionEngine) | **NÃO RECOMENDADO REUTILIZAR como está** | Nunca teve seu output consumido por nada em produção — é uma hipótese arquitetural não testada no mundo real, apesar de bem estruturada no papel |
| `finalize-candidate` (motor IPR) | **ESPECÍFICO DA SOFIA** | Regras de negócio de recrutamento da Tania Joias, não generalizável |
| Roteiro/wizard (`sofia-script.ts`) | **ESPECÍFICO DA SOFIA** | Perguntas e validações do domínio |
| `whatsapp-cloud-api.ts` (helper de envio) | **REUTILIZÁVEL COMO ESTÁ** | Funções puras de integração com a Graph API da Meta, pouco acopladas ao domínio (recebe telefone/template/variáveis) |
| Webhook `whatsapp.mjs` (recepção + validação HMAC) | **REUTILIZÁVEL COM ADAPTAÇÃO** | A validação de assinatura e persistência de mensagens é genérica; a lógica de negócio embutida (`processarDecisaoTania`) é específica |
| `_shared/meta-conversions.ts` | **REUTILIZÁVEL COMO ESTÁ** | Função pura de envio ao CAPI, pouco acoplada |
| Tipos/schemas Zod (`packages/shared`) | **ESPECÍFICO DA SOFIA** (schema em si) mas **padrão reutilizável** | Os tipos são do domínio; o padrão "tipos gerados do Supabase + Zod compartilhado" é uma prática replicável |

---

## 15. Acoplamentos

**[CONFIRMADO]**

- **Sofia ↔ Landing**: fortemente acoplada — o pipeline real (Seção 4.1) só existe dentro de `useSofiaFlow.ts`, que é o hook central da Landing; não há separação de camada que permita rodar a Sofia fora do contexto do wizard React.
- **Sofia ↔ Supabase**: acoplada via 3 Edge Functions específicas (`sofia-reagir`, `agent-ai-gateway`, `sofia-config`), cada uma com seu próprio contrato — não há abstração de "mensageria de agente" desacoplada do Supabase.
- **Sofia ↔ browser**: `WorkingMemory` e todo o estado do Agent Core shadow vivem exclusivamente na memória do processo do navegador — sem essa camada de runtime, o pipeline shadow simplesmente não existiria.
- **Sofia ↔ CRM/recrutamento**: acoplada por regra de negócio (IPR, cidades atendidas, profissões preferidas) — os system prompts fazem referência direta a essas regras.
- **Sofia ↔ tipos específicos**: os contratos de `agent-ai-gateway` (`AgentId: "sofia"`, `Operation: "GENERATE_CONVERSATIONAL_RESPONSE"`) são deliberadamente fechados a um único agente — não foi desenhado para múltiplos agentes.
- **Sofia ↔ regras/prompts específicos**: os 3 system prompts são hardcoded e específicos do domínio Tania Joias (comissão, consignação, cidades atendidas) — nada é parametrizável por "negócio" sem editar código.
- **CRM ↔ WhatsApp**: fortemente acoplado — `finalize-candidate`, `useUpdateLead`, `submit-ficha` e o webhook Vercel disparam ações de WhatsApp inline, best-effort, sem uma camada de "eventos de domínio" desacoplada.

---

## 16. Riscos

| Risco | Categoria | Severidade | Evidência |
|---|---|---|---|
| Documentação/memória local materialmente desatualizada frente à produção real (flags WhatsApp e `sofia_conducao_natural` ligadas sem registro) | Processo/Governança | **CRÍTICO** | Seção "Achado mais importante" — decisões de negócio podem estar sendo tomadas sobre uma visão incorreta do que está ativo |
| Nenhuma proteção contra lead duplicado (sem normalização de telefone na gravação, sem `UNIQUE`, sem dedup) | Dados/Duplicação | **ALTO** | Seção 13.2 |
| Decisão automática da Tania por WhatsApp sem log de auditoria dedicado e com falha silenciosa em caso de ambiguidade (2+ pendentes) | Segurança operacional/Confiabilidade | **ALTO** | Seção 9.6 — ela pode achar que decidiu quando na verdade nada mudou, sem nenhum aviso |
| Conhecimento da Sofia duplicado em 4+ lugares fisicamente distintos, sem sincronização garantida por código | Consistência de conhecimento/IA | **ALTO** | Seção 6 — divergência entre `seedDocuments.ts` e `docs/knowledge/*.md` é silenciosa |
| Ausência total de memória/aprendizado real — qualquer expectativa de que a Sofia "evolui sozinha" é falsa | Expectativa de produto | **MÉDIO** (alto se não comunicado corretamente aos stakeholders) | Seção 7 |
| Nomes de variáveis de ambiente de WhatsApp divergentes entre Vercel (`WHATSAPP_ACCESS_TOKEN`) e Supabase (`WHATSAPP_CLOUD_API_TOKEN`) | Configuração/Operação | **MÉDIO** | Seção 10.7 — risco de configurar um lado e esquecer o outro |
| `sofia-config`/`send-meta-lead-event` com `verify_jwt: true` divergindo do comentário no código (`false` esperado) | Configuração/Segurança | **BAIXO-MÉDIO** | Seção 10.3 — provavelmente inofensivo dado o uso do SDK, mas não verificado a fundo |
| Gap de auditoria nas migrations (`add_whatsapp_conversations` fora do tracking; 19 remotas vs. 11 locais) | Rastreabilidade de schema | **MÉDIO** | Seção 10.1 |
| RFC-013/013.1 nunca implementadas como especificado, sem que o gate de bloqueio que a própria RFC exigia tenha sido resolvido antes do caminho alternativo ser codado | Processo/Governança | **MÉDIO** | Seção 9.7 |
| Função órfã (`swift-action`) deployada em produção sem uso | Superfície desnecessária | **BAIXO** | Seção 10.3 |
| Nenhum controle de custo/orçamento de tokens de IA além de rate limit anti-abuso | Custo | **BAIXO** (hoje — pode crescer com escala) | Seção 11 |
| Pipeline shadow (Agent Core clássico) nunca validado em produção — se um dia for "ligado" para um Cérebro central, não há prova de que funciona com dados reais | Arquitetura/Confiabilidade | **MÉDIO** | Seção 4.2, 14 |
| Nenhum test runner automatizado no monorepo | Manutenção/Qualidade | **MÉDIO** | Seção 1, verificado consistentemente por todos os 4 agentes |

---

## 17. Sobre desenhar o "Cérebro" — não realizado, por instrução explícita

Conforme solicitado, este relatório **não propõe** nova arquitetura central, novas tabelas, RAG, embeddings, vector database, sincronização com ConsigGold, migrations, novos agentes ou novos prompts. A Seção 14 apenas classifica o que já existe pela sua reutilizabilidade técnica, sem desenhar como essas peças se encaixariam numa camada compartilhada — essa decisão cabe ao arquiteto, na etapa seguinte, comparando este diagnóstico com o do ConsigGold.

---

## RESUMO PARA O ARQUITETO

**1. Como funciona o sistema hoje.** Duas aplicações web (Landing pública + Admin autenticado) sobre um único backend Supabase. A Landing capta candidatas via um wizard de chat ("Sofia"); a decisão de aprovação é 100% determinística (motor IPR); leads aprovadas entram num CRM Kanban simples que rastreia um fluxo pós-aprovação real (Ficha de Aprovação → notificação → decisão da Tania), com múltiplas automações de WhatsApp real (Cloud API oficial da Meta) e rastreamento Meta Pixel/CAPI. Não há CI/CD — todo deploy é manual.

**2. Como funciona a Sofia hoje.** Um wizard determinístico (perguntas fixas + validação Zod) com três pontos pontuais e sempre server-side de enriquecimento por IA (Claude Haiku), todos atrás de flags hoje **ligadas** em produção, mais uma camada de classificação de intenção sempre ativa (sem flag) que protege os campos contra texto incompatível. Em paralelo, existe uma arquitetura de agente completa (perfil, memória, planejador, motor de decisão) que roda a cada turno mas **nunca influencia o que a candidata vê** — é shadow real, não uma "IA de verdade" nos bastidores.

**3. Qual é o pipeline real da Sofia.** Ver Seção 4.1 — wizard → classificador de intenção sempre ativo → (opcional) reação/resposta de IA validada por camada determinística → reconhecimento determinístico opcional → decisão IPR determinística → gravação.

**4. O que ela sabe sobre a Tania Joias.** 8 documentos oficiais de comissão/consignação/garantia/elegibilidade, aprovados por Antonio (proprietário), mais regras de negócio (cidades atendidas, pesos do IPR) na tabela `settings`. Nada além disso é "sabido" dinamicamente.

**5. Onde esse conhecimento está armazenado.** Hardcoded em pelo menos 4 lugares fisicamente distintos (bundle da Landing + 3 Edge Functions), cada um exigindo deploy manual próprio; só `settings` é editável sem deploy, e só guarda parâmetros/flags, nunca texto de conhecimento.

**6. Que tipos de memória existem.** Só memória de uma única conversa, em RAM do navegador, que morre no refresh. Não há memória do lead entre sessões, não há memória de longo prazo, não há aprendizado entre conversas — as interfaces para isso existem no código mas estão vazias, sem implementação.

**7. Se ela realmente aprende ou não.** **Não aprende**, em nenhum sentido técnico. Cada chamada de IA é stateless; nada que aconteça numa conversa influencia a próxima, para a mesma pessoa ou qualquer outra.

**8. Como funciona a fronteira IA × regras determinísticas.** A decisão de negócio (aprovação/reprovação/IPR/perfil) é sempre calculada antes de qualquer chamada de IA e nunca é sobrescrita — reforçado em código e em prompt. Toda saída de IA voltada à candidata passa por validação determinística antes de aparecer.

**9. Como funciona o CRM.** Kanban de 6 colunas visuais sobre 2 campos reais do banco (`lead_status`+`etapa_pos_aprovacao`), cobrindo desde a captação até a ativação como revendedora, com um fluxo pós-aprovação (Ficha de Aprovação) bem definido e parcialmente automatizado via WhatsApp — incluindo um caminho de decisão da Tania por resposta conversacional no WhatsApp, não documentado anteriormente.

**10. Quais dados de aquisição/Meta são preservados.** UTM completo (source/medium/campaign/content), `fbclid`, `fbp`, `fbc`, IP e user-agent do cliente — tudo gravado por lead. Não há rastreamento de anúncio/criativo individual, só campanha.

**11. Quais componentes parecem reutilizáveis.** O padrão arquitetural de "Edge Function como ponte segura para IA" (chave nunca no client, contrato fechado, tool-use forçado), os helpers de integração Meta/WhatsApp (funções relativamente puras), e a interface `AIGateway`/`AIProvider` como ponto de partida conceitual — com ressalva de que boa parte da infraestrutura de "agente" mais sofisticada (Agent Core, AgentProfile/Registry/Factory/Runtime) nunca foi validada rodando de verdade.

**12. Quais componentes são específicos do recrutamento.** O motor IPR, o roteiro/wizard, os 3 system prompts, a base de conhecimento (comissão/consignação/garantia), e todo o modelo de dados de `leads`/`leads_ficha`.

**13. O que não pôde ser confirmado.** Valores reais de secrets (por design, não deveriam ser lidos); se as credenciais WhatsApp Cloud API estão de fato configuradas nos Secrets do Supabase Studio (só os nomes das variáveis foram confirmados); existência ou não de constraint `UNIQUE(telefone)` aplicada fora do controle de versão; conteúdo exato do `email` de contas em `auth.users` (bloqueado por classificador de permissão da sessão de diagnóstico, tratado como dado sensível); se a pasta externa mencionada em memória (`...\ChatGPT\whats automatico\production-app`) ainda está em uso paralelo ao webhook encontrado neste workspace.

**14. Os 10 maiores riscos/pontos de atenção.** Ver tabela da Seção 16 — os mais críticos são: (a) documentação/memória desatualizada frente à produção real; (b) zero proteção contra lead duplicado; (c) decisão automática da Tania por WhatsApp sem auditoria e com falha silenciosa em ambiguidade; (d) conhecimento da Sofia duplicado sem sincronização garantida.

**15. Perguntas que precisam ser respondidas antes de qualquer arquitetura compartilhada.**
   - As 4 flags de WhatsApp e o modo `ACTIVE` de `sofia_conducao_natural`, hoje ligados em produção, foram uma decisão consciente e testada com número/candidatas reais, ou precisam de revisão urgente?
   - As credenciais WhatsApp Cloud API estão de fato configuradas e funcionando em produção hoje?
   - A pasta externa de WhatsApp mencionada em memórias anteriores ainda está em uso, foi abandonada, ou é redundante com o webhook encontrado neste workspace?
   - Qual identificador de pessoa (telefone normalizado? um novo UUID de "pessoa" cross-sistema?) o futuro Cérebro deveria adotar como chave de reconciliação com o ConsigGold, dado que hoje não existe e-mail nem CPF de candidata em lugar nenhum?
   - A arquitetura de "Agent Core" shadow (WorkingMemory→Objectives→Planner→DecisionEngine) deve ser descartada, retrabalhada, ou é candidata séria a virar a base do Cérebro central — dado que nunca rodou de verdade?
   - Como a organização quer lidar com o fato de que "memória"/"aprendizado" hoje é zero — isso é aceitável para o escopo atual, ou é um requisito não-negociável do futuro Cérebro?
   - Quem deveria ser o dono/aprovador formal do conhecimento compartilhado entre sistemas (hoje é só "Antonio" para a Sofia) quando o Cérebro also servir o ConsigGold?
   - Como reconciliar RFC-013 (nunca implementada como especificada) — o modelo simples que está em produção deve virar a base "oficial", ou a RFC original ainda é a intenção de longo prazo?

---

*Fim do diagnóstico. Nenhuma alteração foi feita ao código, banco, configuração, prompts ou infraestrutura do projeto — conforme instruído.*
