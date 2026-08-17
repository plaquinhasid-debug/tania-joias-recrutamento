# IMPLEMENTATION-INTELLIGENCE-012B — Corrigir descarte intermitente de respostas livres da Sofia

## Contexto

A IMPLEMENTATION-INTELLIGENCE-012A corrigiu o CORS de `agent-ai-gateway` para a Landing V2
(`AGENT_ALLOWED_ORIGINS`). Depois da correção, o smoke test manual em SHADOW ainda mostrou o
fallback "Prefiro não passar uma informação imprecisa neste momento." para a pergunta "quanto
você vai ganhar de comissão?", mesmo com a chamada real ao `agent-ai-gateway` retornando
`success:true` (confirmado nos logs reais da função, `messageLength: 470`, `outputTokens: 200`,
no exato horário do teste). Ou seja: a IA respondeu de verdade, mas a resposta foi descartada
**depois**, no lado do cliente.

## Causa raiz

`handleCandidateQuestion` ([useSofiaFlow.ts:359-382](../../apps/landing/src/hooks/useSofiaFlow.ts))
chama `answerCandidateQuestion` sem passar `currentQuestion` — por desenho: a pergunta do roteiro
é reapresentada como uma **segunda bolha separada** depois da resposta da IA (FEATURE-004,
correção documentada em `lamin_agent_core_shadow` — passar `currentQuestion` fazia
`checkNoQuestionWhenScriptQuestionExists` descartar a resposta da IA quase sempre, porque o
playbook da Sofia a incentiva a terminar respostas com uma pergunta de engajamento própria).

Isso faz `hasScriptQuestion = false` sempre, dentro de
[`composeResponse`](../../apps/landing/src/orchestrator/composer/ResponseComposer.ts), o que por
sua vez faz `pickTransition({ requireDeclarative: hasScriptQuestion })` receber sempre `false` —
ou seja, a transição sorteada **podia** ser uma das 2 interrogativas da biblioteca de 6
([TransitionLibrary.ts](../../apps/landing/src/orchestrator/composer/TransitionLibrary.ts):
"Posso te fazer mais uma pergunta?" / "Me ajuda com mais uma informação?").

Quando isso coincidia com uma resposta da IA que **já** termina com pergunta própria (comum —
confirmado que ~1/3 das respostas reais da IA termina assim, por instrução do próprio playbook em
`_shared/agent-prompts.ts`), a mensagem final somava 2 pontos de interrogação, reprovando
`checkAtMostOneQuestion` dentro de `runFinalPolicies` com `MULTIPLE_QUESTIONS`. O
`ResponseComposer` então descartava a resposta real da IA e recompunha com
`FALLBACK_BODY_BY_KIND["QUESTION"]` — exatamente a mensagem "Prefiro não passar uma informação
imprecisa neste momento." vista no teste manual.

**Este bug é independente de LOCAL/SHADOW/PILOT** — vive inteiramente em
`ResponseComposer.ts`/`ResponsePolicies.ts`/`TransitionLibrary.ts`, downstream de qualquer fonte
de conhecimento. Afeta qualquer modo, sempre que a candidata faz uma pergunta livre.

## Reprodução (antes da correção)

Criado [`tests/response-composer-questions.test.mjs`](../../tests/response-composer-questions.test.mjs),
usando `composeResponse`/`answerCandidateQuestion` reais (sem mock de lógica de negócio) e
`Math.random()` real (não determinística) para reproduzir o sorteio de transição exatamente como
em produção.

Rodado contra o código **antes** da correção (via `git stash` temporário dos dois arquivos
alterados, restaurado em seguida): **7 de 19 testes falharam**, incluindo:
- `resposta da IA com pergunta própria nunca é descartada por MULTIPLE_QUESTIONS (200 tentativas, aleatoriedade real)`
- `pipeline real (LOCAL) — pergunta de comissão nunca cai no fallback de informação imprecisa`
- `pipeline real (SHADOW) — pergunta de garantia/30 dias/fora da allowlist ...`

Isso confirma tanto a causa raiz quanto que ela reproduz de forma real e intermitente (não
100% das vezes — daí o comportamento observado como "às vezes funciona, às vezes não").

Também reproduzido manualmente contra o `agent-ai-gateway` real (fora deste diff, sessão de
diagnóstico): 5 chamadas reais consecutivas, todas terminando a resposta com pergunta própria.

## Alternativas consideradas

**A. Passar `currentQuestion`/informação equivalente para `composeResponse`.**
Rejeitada — reintroduziria exatamente o bug que motivou o desenho de 2 bolhas
(`checkNoQuestionWhenScriptQuestionExists` descartaria a resposta da IA quase sempre, já
confirmado ao vivo antes). Também exigiria remover o `pushBotLine(step.question, 450)` separado
em `useSofiaFlow.ts`, uma mudança de UX/wizard fora do escopo autorizado desta tarefa.

**B. Forçar transição declarativa quando o conteúdo da IA já contém uma pergunta própria.**
**Escolhida.** Muda apenas a decisão de qual transição sortear, dentro de `composeResponse` —
não toca no conteúdo da IA, no wizard, no `currentQuestion`, no fluxo de 2 bolhas, no
`KnowledgeEngine` ou em qualquer regra de negócio.

**C. Outras alternativas menores.** Nenhuma encontrada que resolvesse a causa raiz com um diff
menor — a colisão acontece especificamente na escolha da transição, então corrigir ali é o ponto
mínimo de intervenção.

## Correção aplicada

Dois arquivos, 18 linhas no total:

1. [`ResponsePolicies.ts`](../../apps/landing/src/orchestrator/composer/ResponsePolicies.ts) —
   `countQuestions` (já existia, privada) agora é `export`ada, para reaproveitar a mesma lógica de
   contagem de "?" em vez de duplicá-la.
2. [`ResponseComposer.ts`](../../apps/landing/src/orchestrator/composer/ResponseComposer.ts) —
   `pickTransition` passa a receber `requireDeclarative: hasScriptQuestion || aiResponseHasQuestion`,
   onde `aiResponseHasQuestion = countQuestions(input.aiResponse) > 0`.

Nenhum novo campo em `ComposeResponseInput` (confirmado por teste — a interface continua com os
mesmos 7 campos). Nenhuma mudança em `useSofiaFlow.ts`, `KnowledgeEngine`, `PilotKnowledgeRepository`,
`ShadowKnowledgeRepository`, IPR, `finalize-candidate`, wizard ou Admin.

## Por que é a menor correção segura

- Não duplica pergunta: quando o conteúdo da IA já tem 1 pergunta, a transição vira
  obrigatoriamente declarativa (0 perguntas extra) — total permanece 1.
- Não perde a resposta útil da IA: elimina a ÚNICA causa espúria de descarte (colisão de
  contagem), sem afetar nenhuma outra política (tamanho, parágrafos, frases/promessas proibidas).
- Mantém a retomada natural do wizard: `useSofiaFlow.ts` continua exatamente igual — o desenho de
  2 bolhas (resposta da IA + pergunta do roteiro reapresentada) é preservado sem alteração.
- Não altera regra de negócio, Knowledge Layer, PILOT, IPR ou aprovação — o diff inteiro vive
  dentro do módulo de composição de texto.
- Quando o conteúdo da IA NÃO tem pergunta própria, a biblioteca completa de 6 transições
  continua acessível (confirmado por teste — nenhuma perda de variedade/naturalidade fora do
  cenário de colisão).

## Testes

`tests/response-composer-questions.test.mjs` — 19 testes, cobrindo:
- resposta sem pergunta / com pergunta;
- transição declarativa / interrogativa (real e forçada deterministicamente via mock de
  `Math.random`);
- resultado final sempre ≤ 1 pergunta (200 tentativas com aleatoriedade real);
- resposta válida da IA nunca descartada por `MULTIPLE_QUESTIONS` nesse fluxo;
- comportamento pré-existente preservado quando `hasScriptQuestion=true` (continua descartando
  corretamente, sem regressão);
- pipeline completo (`answerCandidateQuestion`) para comissão, garantia, 30 dias, primeiro
  mostruário e um tópico fora da allowlist PILOT (idade), em LOCAL e SHADOW;
- exatamente uma chamada de IA por pergunta (sem duplicar resposta);
- `useSofiaFlow.ts` continua retomando a pergunta do roteiro como segunda bolha, sem passar
  `currentQuestion` ao composer;
- `ComposeResponseInput` sem novos campos.

Infraestrutura de teste nova (não é código de produção):
`tests/ts-extension-loader.mjs` + `tests/register-ts-loader.mjs` — loader ESM necessário porque
`orchestrator/composer/` e `orchestrator/pipeline/` usam imports relativos sem extensão (padrão
já usado no restante do projeto), que o `node --test` puro não resolve sem um hook de resolução.
Também stuba `@/lib/supabase` (client Vite-only) para permitir testar `answerCandidateQuestion`
de verdade sem depender de `import.meta.env`.

## Regressões

- `test:knowledge-pilot`: 22/22 (inalterado).
- `test:knowledge-shadow`: 25/25 (inalterado).
- `test:knowledge-source-setting`: 18/18 (inalterado).
- `test:response-composer-questions` (novo): 19/19.
- **Total: 84/84.**
- `build:landing` (`tsc -b && vite build`): PASS.
- `lint` (`oxlint`): PASS — só os 2 warnings pré-existentes de Fast Refresh.
- `git diff --check`: PASS.

## Estado final

- Código corrigido localmente, **não commitado, não enviado ao GitHub, sem deploy**.
- `sofia_knowledge_source` = `{"modo":"SHADOW"}` (inalterado).
- PILOT **não** foi ativado nesta tarefa.
- Nenhum secret, migration, tabela, ConsigGold, KI, IPR, `finalize-candidate`, wizard ou Admin
  alterado.
