# PROJECT_STATUS.md — Tania Joias / Sofia

> Atualizado em 2026-08-02. Mantido a cada mudança importante para não perder histórico entre sessões. Este arquivo descreve o estado real do código e da infraestrutura — não é um roadmap nem uma proposta.

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

### Admin
- `apps/admin` (Vite + React + TanStack Query/Table), deploy Vercel (`tania-joias-recrutamento`). Auth via Supabase Auth (email/senha, sem cadastro público).
- Páginas: Dashboard, Leads, CRM (kanban dnd-kit), Radar (eventos de funil), Reports, Settings (inclui o toggle `sofia_ia_ativa`).
- `SofiaAnalysisCard` exibe a análise de IA no drawer de detalhe do lead.

### Relatório diário
- `daily-leads-report` (Resend + pg_cron) envia resumo diário de leads por e-mail.

### Ponte segura com a Anthropic (deployada, mas DESCONECTADA do fluxo real)
- `agent-ai-gateway`: Edge Function nova, contrato fechado (só aceita `GENERATE_CONVERSATIONAL_RESPONSE`, allowlist de origem, limites de tamanho, tool-use forçado, sem proxy genérico de prompt). Testada ao vivo via curl. **Nada na Landing a chama.**

---

## 2. O que existe mas é "shadow" — construído, testado isoladamente, NUNCA visto pela candidata

Toda essa árvore vive em `apps/landing/src/orchestrator/` e é 100% tree-shaken do bundle de produção (confirmado por grep no JS final a cada mudança) — a única conexão real com `useSofiaFlow.ts` é o `SofiaOrchestrator`, que roda em paralelo ao roteiro só OBSERVANDO (seu retorno nunca é usado para decidir nada visível):

- **Pipeline determinístico**: WorkingMemory → Context → ConversationState → Objectives → Planner → IntentClassifier → DecisionEngine → ActionEngine. Classifica intenção (pergunta/dúvida/objeção/resposta/etc.) e "decidiria" o que fazer — mas ninguém age sobre essa decisão hoje.
- **AgentProfile / AgentRegistry / AgentFactory / AgentRuntime**: identidade formal da Sofia (missão, tom, princípios, capabilities/limitations estruturadas), injetada de verdade no `SofiaOrchestrator` via `createSofiaRuntime()` — mas só usada para os logs de observação, não para gerar nada visível.
- **KnowledgeEngine / KnowledgeTool**: agora com **8 documentos OFICIAIS** revisados por Antonio (proprietário) — comissão (30-40% por faixa de venda), consignação (ciclo de 30 dias), garantia (3 meses anéis / 6 meses demais peças + exclusões), troca por defeito (1ª grátis, 2ª com frete), elegibilidade (idade/cidade/WhatsApp+Instagram/trabalha), processo de candidatura, primeiro mostruário. Fonte arquivada em `docs/knowledge/COM-001` a `COM-004`. **Busca só funciona por palavra-chave isolada — frases naturais completas não retornam nada** (testado ao vivo: `"comissao"` acha; `"Quanto eu ganho de comissão?"` não acha nada). Isso bloqueia a FEATURE-003 até ser resolvido. Ainda nunca chamado pelo fluxo real.
- **AIGateway / AIProvider / AnthropicProvider (stub) / SupabaseAIProvider**: camada de abstração pronta para chamar `agent-ai-gateway` com segurança — nunca instanciada em produção.
- **ResponseComposer / AcknowledgmentLibrary / TransitionLibrary / ResponsePolicies**: monta uma mensagem final (reconhecimento + conteúdo validado + transição + próxima pergunta) seguindo o `PLAYBOOK-001`, com políticas anti-promessa/anti-duas-perguntas e fallback seguro. Só testado via exemplos executáveis manualmente.
- **Agent Simulator**: laboratório dev-only que roda o `SofiaOrchestrator` real turno a turno contra 5 cenários fictícios, fora do bundle.

**Em resumo**: existe uma arquitetura de agente completa e testada (perfil, memória, classificação de intenção, decisão, composição de resposta, ponte segura de IA) rodando **em paralelo, sem nenhum fio ligado à experiência real da candidata**. É exatamente um "shadow mode" — a FEATURE-003 (integrar só o caminho QUESTION → conhecimento → IA → resposta composta) é o primeiro passo planejado pra começar a conectar isso, e foi pausada por especificação incompleta.

## 3. O que está incompleto, quebrado ou é só placeholder

- **Pasta `landing/` na raiz do repo** (fora de `apps/`) — um scaffold antigo, órfão, de um único commit ("Add landing page project", 29/07), fora do workspace npm (`package.json` raiz só inclui `apps/*` e `packages/*`). Não é usado por nada, mas está versionado — vale decidir se remove.
- **`supabase/vercel.json.txt`** — arquivo solto na raiz de `supabase/`, extensão `.txt` (não `.json`), conteúdo de configuração de build Vercel. Parece um rascunho esquecido, não tracked ainda.
- **Busca do `KnowledgeEngine` é só substring/palavra-chave** — não entende frase natural. Bloqueia a FEATURE-003 até virar busca por palavra-chave extraída da pergunta (ou algo mais robusto). Ver seção 2.
- **Base de conhecimento oficial tem lacunas conhecidas**: (a) a seção "critérios de reprovação" do COM-002 (solteira/casada com mais de 3 filhos) foi deliberadamente **excluída** do KnowledgeEngine por contradizer uma decisão anterior contra critérios de gênero/filhos — pendente de confirmação com a Tania antes de qualquer uso; (b) COM-002 lista 4 cidades atendidas, mas o setting `cidades_atendidas` em produção tem 5 (inclui Ribeirão Pires) — pendente de decisão sobre qual está correto; (c) ainda falta definir a mensagem exata de reprovação (nota do próprio COM-002); (d) não existe ainda separação entre documento "interno" (nunca deve chegar à IA/candidata) e documento "público" no `KnowledgeDocument` — é um requisito de arquitetura para a FEATURE-003, não só um dado faltando.
- **Sem migrations locais versionadas** (`supabase/migrations/` está vazio) — toda alteração de schema feita nesta sessão foi via `apply_migration` direto no projeto remoto; não há histórico de schema em arquivo no git.
- **FEATURE-003** (integrar QUESTION → KnowledgeEngine → AIGateway → ResponseComposer) foi pedida, mas a especificação chegou cortada (sem objetivos numerados, sem seção de não-implementar/verificação) — nada foi codificado ainda.
- **Nenhum test runner** (Vitest/Jest) instalado no monorepo — toda a verificação de RFC-007 em diante foi feita com "cenários executáveis" rodados manualmente via browser, não testes automatizados de verdade.
- **Analytics/métricas de conversas reais** (taxa de abandono, perguntas mais frequentes sem resposta) não existe nenhuma automação — só o que dá pra ver manualmente via `logs`/`conversations`/`answers` no Supabase Studio ou no Radar do Admin.

## 4. Decisões técnicas já tomadas e por quê

- **IA nunca decide aprovação/reprovação/IPR** — decisão de negócio deliberada da Tania desde o início; reforçada em toda RFC subsequente (inclusive no PLAYBOOK-001 e no system prompt do `agent-ai-gateway`).
- **Chave da Anthropic nunca no browser** — todo acesso à IA passa por Edge Function; o `AnthropicProvider` client-side é um stub que lança erro de propósito (RFC-004), substituído pelo `SupabaseAIProvider` (RFC-011) que fala com `agent-ai-gateway`.
- **Toda integração de IA nova nasce desconectada, atrás de flag/observação, e só é ligada com autorização explícita** — padrão seguido rigorosamente do RFC-002 até a FEATURE-002.1: cada peça nova (Orchestrator, AIGateway, KnowledgeEngine, ResponseComposer) foi construída, testada isoladamente e comprovada com zero footprint no bundle de produção antes de sequer se cogitar conectar.
- **`agent-ai-gateway` usa `verify_jwt: false`**, igual a `finalize-candidate`/`sofia-reagir` — a Landing é pública, sem usuário autenticado; a proteção vem de contrato fechado (uma única operação aceita), allowlist de origem, limites de tamanho e validação estrita, não de autenticação.
- **Nenhuma pergunta do roteiro pode ser removida ou substituída por IA** — coleta de nome/telefone/cidade/"trabalha atualmente" continua 100% determinística; IA só pode, no máximo, responder dúvidas pontuais no meio do caminho (é exatamente o escopo que a FEATURE-003 tentava abrir, com flag desligada por padrão).
- **`git push` não confiável para deploy** — Vercel às vezes não dispara build automático; o fluxo confiável é `vercel --prod` manual (ver histórico de sessões anteriores).

## 5. Stack e ferramentas em uso

| Camada | Tecnologia |
|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |
| Landing | Vite 8 + React 19 + TypeScript 6, Tailwind 4, Radix UI, React Hook Form + Zod |
| Admin | Vite 8 + React 19 + TypeScript, TanStack Query/Table, React Router, dnd-kit, Recharts |
| Shared | `packages/shared` — tipos gerados do Supabase, schemas Zod, constantes |
| Backend | Supabase (Postgres 17, projeto `tania-joias-crm`, ref `iaqzbernshmhkqznleye`, região `sa-east-1`) |
| Edge Functions | Deno, 5 funções ativas: `finalize-candidate`, `sofia-reagir`, `send-meta-lead-event`, `daily-leads-report`, `agent-ai-gateway` (essa última desconectada) |
| IA | Anthropic Claude (`claude-haiku-4-5-20251001`), sempre via tool-use forçado, sempre server-side |
| Hospedagem | Vercel — 2 projetos separados (`tania-joias-landing`, `tania-joias-recrutamento`) |
| E-mail | Resend (relatório diário via pg_cron) |
| Rastreamento | Meta Pixel + Conversions API |

**Como a Sofia recebe/envia mensagens hoje**: não existe canal de mensageria real (nada de WhatsApp/Telegram/webhook) — é inteiramente um widget de chat embutido na Landing Page, com roteiro fixo client-side. As únicas duas exceções pontuais de texto gerado por IA em produção hoje são as reações de `sofia-reagir` (2 pontos da conversa) e o resumo final de `ai-analysis.ts` (visível só no Admin, nunca para a candidata).
