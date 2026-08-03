# PROJECT_STATUS.md — Tania Joias / Sofia

> Atualizado em 2026-08-03 (rodada: FEATURE-004 — a Sofia agora consegue responder perguntas de negócio reais no meio da conversa, atrás de uma flag nova desligada por padrão; primeira conexão real do pipeline QUESTION → KnowledgeEngine → AIGateway → ResponseComposer ao chat de verdade). Mantido a cada mudança importante para não perder histórico entre sessões. Este arquivo descreve o estado real do código e da infraestrutura — não é um roadmap nem uma proposta.

---

## 1. O que existe e funciona (produção real)

### Landing Page + wizard Sofia
- `apps/landing` (Vite + React 19 + TypeScript), deploy Vercel (`tania-joias-landing`).
- Sofia é um **wizard determinístico**, não um agente de IA em tempo real: `apps/landing/src/data/sofia-script.ts` define cada pergunta/validação (Zod) como dado; `useSofiaFlow.ts` percorre o array e decide a próxima etapa.
- Coleta: nome, cidade, idade, telefone, "trabalha atualmente?" (regra hardcoded, nunca gerada por IA), profissão, empresa atual, experiência com vendas, WhatsApp, Instagram, tempo disponível, objetivo.
- Grava em tempo real (fire-and-forget) em `conversations`/`answers`; finaliza via Edge Function `finalize-candidate`.

### Motor de decisão (100% determinístico, produção)
- `finalize-candidate` é o único ponto de escrita de `leads`. Calcula IPR (soma ponderada: trabalha/experiência/whatsapp/instagram/cidade atendida, pesos em `settings.ipr_pesos`), decide `status` (aprovada/em_analise/reprovada) e `perfil_comercial` (baixo/medio/alto) contra `settings.ipr_thresholds`. **Nunca a IA decide isso.**
- Dispara evento `Lead` ao Meta Conversions API quando aprovada (`send-meta-lead-event`).

### Enriquecimento por IA (produção, ATIVO hoje — `settings.sofia_ia_ativa = {ativa: true}`)
- `finalize-candidate` chama `_shared/ai-analysis.ts` (Claude Haiku, tool-use forçado) para gerar resumo executivo/comercial/comportamental/motivacional, ICP score, sentimento etc. — grava em `ai_analysis`. **Consultivo, nunca influencia `status`/`perfil_comercial`.** Se falhar ou a flag estiver off, cai no texto determinístico.
- `sofia-reagir` gera reações contextuais em só 2 pontos da conversa (depois de "profissão" e de "objetivo") para a Sofia soar menos formulário. Sempre `{mensagem: string | null}`; `null` cai no texto estático do roteiro.

### Perguntas de negócio por IA na conversa (produção, INATIVO hoje — `settings.sofia_perguntas_ia_ativa = {ativa: false}`)
- FEATURE-004: quando a candidata digita uma pergunta de negócio real (ex.: "quanto eu ganho de comissão?") num campo de texto livre do roteiro em vez de responder, a Sofia busca a resposta na base de conhecimento oficial (`KnowledgeEngine.searchByQuestion()`), responde via `agent-ai-gateway` (documentos como base exclusiva, `ResponseComposer` valida a mensagem) e retoma a MESMA pergunta numa bolha separada — nunca grava a pergunta como resposta, nunca pula a etapa.
- Trava dupla: o cliente busca a flag uma vez por conversa (`sofia-config`, `useSofiaFlow.ts`/`beginIntro`) e só tenta o pipeline se ela estiver ligada; o próprio `agent-ai-gateway` confere a mesma flag de novo no servidor antes de gastar uma chamada de IA (defesa em profundidade — nunca confia só no cliente).
- Toggle em Admin → Configurações → "Sofia — Responder perguntas por IA" (`useSofiaPerguntasIaAtiva`/`useSaveSofiaPerguntasIaAtiva`, mesmo padrão do `sofia_ia_ativa`).
- Testado ao vivo, fluxo completo no navegador: com a flag ligada, pergunta real respondida corretamente (fiel ao documento oficial) e a mesma pergunta do roteiro retomada em seguida; com a flag desligada, o texto digitado é tratado como resposta normal — comportamento idêntico ao que existia antes da FEATURE-004.
- **Bug corrigido no teste ao vivo**: a primeira versão anexava a pergunta do roteiro na MESMA mensagem da IA (via `currentQuestion`) — como a IA quase sempre fecha a própria resposta com uma pergunta de engajamento (parte do PLAYBOOK-001), isso colidia com a política "nunca duas perguntas na mesma mensagem" (FEATURE-002.1) e descartava a resposta boa pro fallback quase sempre. Corrigido separando em duas bolhas.

### Admin
- `apps/admin` (Vite + React + TanStack Query/Table), deploy Vercel (`tania-joias-recrutamento`). Auth via Supabase Auth (email/senha, sem cadastro público).
- Páginas: Dashboard, Leads, CRM (kanban dnd-kit), Radar (eventos de funil), Reports, Settings (inclui os toggles `sofia_ia_ativa` e `sofia_perguntas_ia_ativa`).
- `SofiaAnalysisCard` exibe a análise de IA no drawer de detalhe do lead.

### Relatório diário
- `daily-leads-report` (Resend + pg_cron) envia resumo diário de leads por e-mail.

### Ponte segura com a Anthropic
- `agent-ai-gateway`: Edge Function, contrato fechado (só aceita `GENERATE_CONVERSATIONAL_RESPONSE`, allowlist de origem, limites de tamanho, tool-use forçado, sem proxy genérico de prompt) + trava da flag `sofia_perguntas_ia_ativa`. Chamada de verdade pela Landing (via FEATURE-004) — enquanto a flag estiver desligada (padrão hoje), a trava do servidor barra antes de qualquer chamada de IA acontecer.
- `sofia-config`: Edge Function nova (FEATURE-004), só devolve `{ perguntas_ia_ativa: boolean }` — existe porque `settings` não tem RLS para o papel `anon` da Landing (mesmo motivo do `sofia-reagir` checar a flag `sofia_ia_ativa` no servidor).

---

## 2. O que existe mas é "shadow" — construído, testado isoladamente, NUNCA visto pela candidata

**Atualização FEATURE-004**: `KnowledgeEngine`, `AIGateway`/`SupabaseAIProvider`, `ResponseComposer` e o pipeline `answerCandidateQuestion()` **deixaram de ser shadow** — desde a FEATURE-004 eles são código real, alcançável em produção (confirmado pelo aumento do bundle e grep dos símbolos), só que **condicionados à flag `sofia_perguntas_ia_ativa`** (ver seção 1). Continuam listados abaixo pelo histórico de como foram construídos/testados isoladamente antes de serem conectados; o restante da árvore (pipeline determinístico, AgentProfile, Simulator) continua 100% shadow de verdade — nunca chamado nem alcançável pelo fluxo real, com ou sem flag.

Essa árvore vive em `apps/landing/src/orchestrator/`; as partes ainda-shadow são 100% tree-shaken do bundle de produção (confirmado por grep no JS final a cada mudança) — a única conexão real delas com `useSofiaFlow.ts` é o `SofiaOrchestrator`, que roda em paralelo ao roteiro só OBSERVANDO (seu retorno nunca é usado para decidir nada visível):

- **Pipeline determinístico** *(shadow de verdade)*: WorkingMemory → Context → ConversationState → Objectives → Planner → IntentClassifier → DecisionEngine → ActionEngine. Classifica intenção (pergunta/dúvida/objeção/resposta/etc.) e "decidiria" o que fazer — mas ninguém age sobre essa decisão hoje (a FEATURE-004 reage à Ação `ANSWER_WITH_TOOL` em `useSofiaFlow.ts`, fora do Orchestrator).
- **AgentProfile / AgentRegistry / AgentFactory / AgentRuntime** *(shadow de verdade)*: identidade formal da Sofia (missão, tom, princípios, capabilities/limitations estruturadas), injetada de verdade no `SofiaOrchestrator` via `createSofiaRuntime()` — mas só usada para os logs de observação, não para gerar nada visível.
- **KnowledgeEngine / KnowledgeTool** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: **8 documentos OFICIAIS** revisados por Antonio (proprietário) — comissão (30-40% por faixa de venda), consignação (ciclo de 30 dias), garantia (3 meses anéis / 6 meses demais peças + exclusões), troca por defeito (1ª grátis, 2ª com frete), elegibilidade (idade/cidade/WhatsApp+Instagram/trabalha — 5 cidades, já batendo com produção), processo de candidatura, primeiro mostruário. Fonte arquivada em `docs/knowledge/COM-001` a `COM-004` (COM-002 na v1.1). `searchByQuestion()` extrai palavras-chave + stemming leve + desempate por título/id — 6/6 perguntas de teste corretas em 1º lugar. `KnowledgeDocument.visibility: "public" | "internal"` com trava default-deny em todo método de leitura — testado ao vivo simulando vazamento, zero vazamento confirmado. Todos os 8 documentos oficiais hoje são `visibility: "public"`. `KnowledgeTool` (bridge pro `ToolEngine`) continua não registrada em nada — só o `KnowledgeEngine` direto é usado pela FEATURE-004.
- **AIGateway / AIProvider / AnthropicProvider (stub) / SupabaseAIProvider** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: `createDefaultAIGateway()` (stub que lança erro) continua sem uso; `useSofiaFlow.ts` monta um `AIGateway` real com `SupabaseAIProvider` na hora, com timeout de 6s.
- **ResponseComposer / AcknowledgmentLibrary / TransitionLibrary / ResponsePolicies** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: monta a mensagem final (reconhecimento + conteúdo validado + transição) seguindo o `PLAYBOOK-001`, com políticas anti-promessa/anti-duas-perguntas e fallback seguro.
- **Agent Simulator** *(shadow de verdade, dev-only)*: laboratório que roda o `SofiaOrchestrator` real turno a turno contra 6 cenários (incluindo `PERGUNTAS_CONHECIMENTO`, FEATURE-003), fora do bundle.
- **Pipeline FEATURE-003 (`orchestrator/pipeline/answerCandidateQuestion.ts`)** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: liga as 4 peças acima — `KnowledgeEngine.searchByQuestion()` → `AIGateway.request()` (documentos como base exclusiva) → `ResponseComposer.composeResponse()`. Sem documento relevante, a IA nunca é chamada; erro/timeout cai no mesmo fallback seguro do Composer. Testado em 3 camadas (exemplos locais, cenário no Simulator, 6/6 perguntas ao vivo contra a Anthropic real) antes de ser conectado — ver seção 1 pra como a conexão em si (FEATURE-004) foi testada.

**Em resumo**: a arquitetura de agente (perfil, memória, classificação de intenção, decisão) continua rodando em paralelo sem nenhum fio ligado à experiência real — mas a partir da FEATURE-004, o caminho específico "candidata pergunta algo → Sofia responde com IA" deixou de ser shadow e passou a ser **produção real atrás de uma flag desligada por padrão**, exatamente como o `sofia_ia_ativa` já funcionava.

## 3. O que está incompleto, quebrado ou é só placeholder

- **Pasta `landing/` na raiz do repo** (fora de `apps/`) — um scaffold antigo, órfão, de um único commit ("Add landing page project", 29/07), fora do workspace npm (`package.json` raiz só inclui `apps/*` e `packages/*`). Não é usado por nada, mas está versionado — vale decidir se remove.
- **`supabase/vercel.json.txt`** — arquivo solto na raiz de `supabase/`, extensão `.txt` (não `.json`), conteúdo de configuração de build Vercel. Parece um rascunho esquecido, não tracked ainda.
- **Busca do `KnowledgeEngine` por palavra-chave (v1, sem busca semântica)** — `searchByQuestion()` agora usa stemming leve + desempate por título/id (corrigido nesta rodada); 6/6 perguntas de teste retornam o documento certo em 1º lugar. Ainda não é busca semântica de verdade — limitação aceita para esta fase.
- **Base de conhecimento oficial** — as duas divergências da v1.0 do COM-002 (filhos/estado civil e 4 vs. 5 cidades) foram resolvidas pelo Antonio na v1.1; a mensagem exata de reprovação por "desempregada" foi definida e já está em produção em `SOFIA_REJECTION_LINES` (`sofia-script.ts`); e o `KnowledgeDocument` já tem o campo `visibility` como trava estrutural (ver seção 2). Nenhuma pendência conhecida restante nesta frente.
- **Sem migrations locais versionadas** (`supabase/migrations/` está vazio) — toda alteração de schema feita nesta sessão foi via `apply_migration` direto no projeto remoto; não há histórico de schema em arquivo no git.
- **Nenhum test runner** (Vitest/Jest) instalado no monorepo — toda a verificação de RFC-007 em diante foi feita com "cenários executáveis" rodados manualmente via browser, não testes automatizados de verdade.
- **Analytics/métricas de conversas reais** (taxa de abandono, perguntas mais frequentes sem resposta) não existe nenhuma automação — só o que dá pra ver manualmente via `logs`/`conversations`/`answers` no Supabase Studio ou no Radar do Admin.

## 4. Decisões técnicas já tomadas e por quê

- **IA nunca decide aprovação/reprovação/IPR** — decisão de negócio deliberada da Tania desde o início; reforçada em toda RFC subsequente (inclusive no PLAYBOOK-001 e no system prompt do `agent-ai-gateway`).
- **Chave da Anthropic nunca no browser** — todo acesso à IA passa por Edge Function; o `AnthropicProvider` client-side é um stub que lança erro de propósito (RFC-004), substituído pelo `SupabaseAIProvider` (RFC-011) que fala com `agent-ai-gateway`.
- **Toda integração de IA nova nasce desconectada, atrás de flag/observação, e só é ligada com autorização explícita** — padrão seguido rigorosamente do RFC-002 até a FEATURE-002.1: cada peça nova (Orchestrator, AIGateway, KnowledgeEngine, ResponseComposer) foi construída, testada isoladamente e comprovada com zero footprint no bundle de produção antes de sequer se cogitar conectar.
- **`agent-ai-gateway` usa `verify_jwt: false`**, igual a `finalize-candidate`/`sofia-reagir` — a Landing é pública, sem usuário autenticado; a proteção vem de contrato fechado (uma única operação aceita), allowlist de origem, limites de tamanho e validação estrita, não de autenticação.
- **Nenhuma pergunta do roteiro pode ser removida ou substituída por IA** — coleta de nome/telefone/cidade/"trabalha atualmente" continua 100% determinística; a FEATURE-004 só deixa a IA responder dúvidas pontuais no meio do caminho, sempre retomando a mesma etapa depois — nunca decide o que é perguntado nem pula nada.
- **`git push` não confiável para deploy** — Vercel às vezes não dispara build automático; o fluxo confiável é `vercel --prod` manual (ver histórico de sessões anteriores).

## 5. Stack e ferramentas em uso

| Camada | Tecnologia |
|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |
| Landing | Vite 8 + React 19 + TypeScript 6, Tailwind 4, Radix UI, React Hook Form + Zod |
| Admin | Vite 8 + React 19 + TypeScript, TanStack Query/Table, React Router, dnd-kit, Recharts |
| Shared | `packages/shared` — tipos gerados do Supabase, schemas Zod, constantes |
| Backend | Supabase (Postgres 17, projeto `tania-joias-crm`, ref `iaqzbernshmhkqznleye`, região `sa-east-1`) |
| Edge Functions | Deno, 6 funções ativas: `finalize-candidate`, `sofia-reagir`, `send-meta-lead-event`, `daily-leads-report`, `agent-ai-gateway`, `sofia-config` (as duas últimas, FEATURE-004, atrás da flag `sofia_perguntas_ia_ativa`, desligada por padrão) |
| IA | Anthropic Claude (`claude-haiku-4-5-20251001`), sempre via tool-use forçado, sempre server-side |
| Hospedagem | Vercel — 2 projetos separados (`tania-joias-landing`, `tania-joias-recrutamento`) |
| E-mail | Resend (relatório diário via pg_cron) |
| Rastreamento | Meta Pixel + Conversions API |

**Como a Sofia recebe/envia mensagens hoje**: não existe canal de mensageria real (nada de WhatsApp/Telegram/webhook) — é inteiramente um widget de chat embutido na Landing Page, com roteiro fixo client-side. As exceções de texto gerado por IA em produção hoje são as reações de `sofia-reagir` (2 pontos da conversa), o resumo final de `ai-analysis.ts` (visível só no Admin, nunca para a candidata), e — desde a FEATURE-004, hoje desligada — as respostas a perguntas de negócio via `agent-ai-gateway`.
