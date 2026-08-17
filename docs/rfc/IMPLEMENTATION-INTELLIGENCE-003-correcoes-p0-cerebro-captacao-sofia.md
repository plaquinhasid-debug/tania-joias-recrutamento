# IMPLEMENTATION-INTELLIGENCE-003 — Correções P0 Cérebro × Captação/Sofia

**Baseado em:** `RFC-INTELLIGENCE-006 — Correções P0 Cérebro × Captação/Sofia` (aprovada por Antonio Carlos)
**Repositório:** `PROJETO CAPTURA DE LEADS 02` (`tania-joias-recrutamento`)
**Branch inicial:** `main`, commit `c8046ccaa9938c21f5d88222bff6c114e47283a8`
**Status:** IMPLEMENTADO, COMMITADO E DEPLOYADO EM PRODUÇÃO — aprovado por Antonio Carlos em duas etapas (revisão de diff + autorização de execução)

---

## 1. Escopo implementado

Exatamente o escopo da RFC-006 + bloqueio manual no Admin (seção 2 do pedido de implementação). Nenhuma das áreas listadas como fora de escopo (cidades, Footer, "todo o Brasil"/"ABCD", prazo de 30 dias, faixas de ganho, comissão, `PROFISSOES_PREFERIDAS`, `estabilidade_profissional`, Agent Core shadow, Knowledge Service, ConsigGold, peça faltante, `settings.ipr_pesos`/`ipr_thresholds`, migrations) foi tocada.

---

## 2. Arquivos alterados

**Modificados (9):**

| Arquivo | O que mudou |
|---|---|
| `packages/shared/src/schemas.ts` | `identificacaoSchema.idade`: `.min(16, "Idade mínima de 16 anos")` → `.min(18, "Idade mínima de 18 anos")` |
| `supabase/functions/finalize-candidate/index.ts` | Lógica pura extraída para `logic.ts`; `Deno.serve` agora chama `calcularElegibilidade`/`calcularIpr`/`decidirStatus`/`classificarPerfil`/`gerarResumo` com o novo gate combinado |
| `apps/landing/src/data/sofia-script.ts` | `SOFIA_REJECTION_LINES` reescrito (atividade profissional ampla); pergunta/placeholder de `empresa_atual` ajustados |
| `apps/landing/src/orchestrator/knowledge/seedDocuments.ts` | `com-002-elegibilidade` corrigido (versão 2→3: 18 anos, WhatsApp obrigatório/Instagram opcional, atividade profissional ampla, "ser mulher" removido) |
| `apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.examples.ts` | Adicionados os cenários H/I/J (checks automatizados contra o `com-002-elegibilidade` corrigido) |
| `docs/knowledge/COM-002-recrutamento.md` | Nova versão v1.2, mesmo conteúdo corrigido do `seedDocuments.ts`, com nota de manutenção explicando a origem da correção |
| `apps/admin/src/hooks/useLeadDetail.ts` | Nova função exportada `podeAprovarManualmente(patchStatus, previousStatus, leadWhatsapp)`; `UpdateLeadInput` ganha `leadWhatsapp`; `mutationFn` bloqueia `patch.status="aprovada"` só quando `previousStatus !== "aprovada"` e `leadWhatsapp !== true` (ajustado após revisão de diff — ver seção 15.1); `patch` agora aceita `whatsapp` |
| `apps/admin/src/components/crm/KanbanBoard.tsx` | Passa `leadWhatsapp: lead.whatsapp` na chamada de `updateLead.mutate`; `onError` agora mostra a mensagem específica do erro |
| `apps/admin/src/components/leads/LeadDetailDrawer.tsx` | Nova seção "WhatsApp" (badge + botão "Confirmar WhatsApp"); botão "Aprovar" desabilitado quando `whatsapp !== true`; `handleStatusChange` passa `leadWhatsapp` e mostra a mensagem específica do erro |

**Criados (4):**

| Arquivo | Conteúdo |
|---|---|
| `supabase/functions/finalize-candidate/logic.ts` | Lógica pura do IPR/elegibilidade, extraída de `index.ts` — necessário pra tornar as funções testáveis sem subir `Deno.serve` como efeito colateral de importar o módulo (ver seção 8) |
| `supabase/functions/finalize-candidate/finalize-candidate.examples.ts` | Cenários A-G + regressão de `trabalha=false` + idade ausente/inválida + zeragem de IPR |
| `packages/shared/src/schemas.examples.ts` | Cenários de `identificacaoSchema.idade` (17/18/16/"abc"/200/"18") |
| `apps/admin/src/hooks/useLeadDetail.examples.ts` | Cenários de `podeAprovarManualmente` — 9 asserts: não aprovada + whatsapp false/null/true (1-3), já aprovada + whatsapp false/null/true (4-6, cobrem a correção da seção 15.1), + 3 regressões (patch "reprovada", patch sem status, confirmar WhatsApp) |

Nenhum outro arquivo foi tocado. Nenhuma migration criada. `settings` não foi alterado (nenhuma escrita — só `SELECT`s read-only, já documentados na RFC-005/006).

---

## 3. Testes/cenários criados — resultado

Todos executados localmente via `npx tsx` (sem test runner instalado — convenção `check(nome, esperado, obtido)` já usada em `classifyForFeature004.examples.ts`), com um script temporário de execução criado e removido logo em seguida para cada arquivo (nenhum arquivo temporário ficou no repositório — confirmado pelo `git status` final, seção 10).

| Suíte | Cenários | Resultado |
|---|---|---|
| `finalize-candidate.examples.ts` (`runFinalizeCandidateLogicExamples`) | 20 asserts — A, B, C, D, E, F (com verificação de IPR=0 e breakdown zerado), G, regressão de `trabalha=false`, idade ausente/inválida/negativa/exata, inelegibilidade genérica zera IPR | **20/20 PASS** |
| `schemas.examples.ts` (`runSchemasExamples`) | 6 asserts — 17/18/16/"abc"/200/"18" (coagido) | **6/6 PASS** |
| `answerCandidateQuestion.examples.ts` (`runComElegibilidadeCorrectionChecks`) | 8 asserts — H, I, J (documento encontrado + conteúdo correto) | **8/8 PASS** — executado via `vite-node` (resolve `import.meta.env` corretamente; ver nota na seção 8), função real, sem workaround |
| `useLeadDetail.examples.ts` (`runUseLeadDetailExamples`)| 9 asserts — não aprovada + whatsapp false/null/true (1-3), já aprovada + whatsapp false/null/true (4-6, cenários da correção da seção 15.1), + 3 regressões | **9/9 PASS** — executado via `vite-node`, função real `podeAprovarManualmente` |
| Regressão: `classifyForFeature004.examples.ts` (pré-existente, não alterado) | 49 asserts | **49/49 PASS** (nenhum efeito colateral) |
| `npm run build` (`apps/landing`) | `tsc -b && vite build` | **Sucesso**, 0 erros de tipo |
| `npm run build` (`apps/admin`) | `tsc -b && vite build` | **Sucesso**, 0 erros de tipo |

**Total (após a correção da seção 15.1): 43/43 cenários executados com sucesso (20 + 6 + 8 + 9, todos via `vite-node`/`tsx`, nenhum por inspeção — ver seção 23) + 49/49 regressão pré-existente intacta, 2 builds completos sem erro.**

Antes da implementação, os cenários A, C e F falhavam com o código antigo (idade 17/16 e WhatsApp ausente chegavam a "aprovada"/"em_analise") — confirmado manualmente contra a RFC-006 (seção 5.2, tabela de combinações) antes de escrever o código novo; não foi gravado um "before" automatizado porque `logic.ts` não existia ainda como módulo isolado antes desta implementação (a lógica antiga vivia inline em `index.ts`, sem exports).

---

## 4. Implementação de idade — client

`packages/shared/src/schemas.ts`, `identificacaoSchema.idade`: `.min(16, ...)` → `.min(18, "Idade mínima de 18 anos")`. Usado por `sofia-script.ts` (etapa `idade` do wizard, `identificacaoSchema.shape.idade`) — nenhuma outra mudança necessária nesse arquivo.

## 5. Implementação de idade — server

`supabase/functions/finalize-candidate/logic.ts`: nova função `isIdadeElegivel(idade)` — `undefined`/`null`/não-inteiro/`<18` → `false` (fail-closed). Nunca participa de `IprPesos`/`settings.ipr_pesos`. Composta, junto com `trabalha` e `whatsapp`, em `calcularElegibilidade(payload)`, chamada no início do `Deno.serve` de `index.ts`, antes de qualquer cálculo de IPR ou threshold.

## 6. Implementação do gate WhatsApp

Mesma função `calcularElegibilidade`: `elegivel = payload.trabalha === true && idadeElegivel && payload.whatsapp === true`. `decidirStatus`/`classificarPerfil` passaram a receber `elegivel: boolean` (antes recebiam só `trabalha: boolean`) — `!elegivel` reprova incondicionalmente, exatamente como `!trabalha` já fazia. Abordagem A da RFC-006 aplicada ao pé da letra.

## 7. Confirmação dos 10 pontos do WhatsApp preservados

`calcularIpr` continua somando `pesos.whatsapp` (10 pts) exatamente como antes, para toda candidata `elegivel=true` — o peso não foi removido nem alterado. A única mudança é que agora, para chegar a `elegivel=true`, `payload.whatsapp` já precisa ser `true` — então, na prática, os 10 pontos de WhatsApp são somados **sempre** que uma candidata chega a ter IPR calculado de verdade (porque sem eles ela nem chega lá). Confirmado nos 20 cenários de `finalize-candidate.examples.ts`: nenhum caso com `whatsapp=true` mudou de resultado.

## 8. Confirmação de thresholds preservados

`settings.ipr_thresholds` (`{"aprovar":80,"analise_min":60}`) nunca foi lido nem escrito por esta implementação — a Edge Function continua buscando o mesmo valor real de `settings` a cada requisição, sem nenhuma mudança de código nessa parte. Nenhuma recalibração foi feita ou proposta.

## 9. Comportamento do Instagram

Nenhuma mudança de código — `instagram` continua somando 10/100 pontos sem nunca bloquear (confirmado no cenário G: `whatsapp=true`, sem Instagram, `experiência+cidade` = 80 = aprovada). Só a comunicação mudou (`com-002-elegibilidade`/`COM-002.md`): "Instagram é bem-vindo, mas não obrigatório."

## 10. Atividade profissional

Nenhuma mudança no gate (`trabalha`, autodeclarado, continua sem exigir CLT/empresa/lista fechada — confirmado nos cenários D e E: `empresa_atual` livre e `profissao="Manicure"` não bloqueiam). Mudanças só de comunicação: `SOFIA_REJECTION_LINES`, `com-002-elegibilidade`, `COM-002-recrutamento.md`, e a pergunta/placeholder de `empresa_atual` no wizard.

## 11. Novo texto da Sofia

`SOFIA_REJECTION_LINES` (mostrado quando `trabalha=false`):
> "No momento, um dos requisitos para ser revendedora é estar trabalhando ou exercer alguma atividade profissional ativa — seja como funcionária, autônoma, comerciante ou em qualquer outra ocupação real."
> "Por esse motivo, não conseguimos seguir com sua candidatura agora — mas você pode se candidatar novamente assim que essa situação mudar."

Pergunta de `empresa_atual`: "Me conta rapidinho sobre seu trabalho hoje — pode ser empresa, seu próprio negócio, ou atividade autônoma." (placeholder: "Ex.: nome da empresa, ou 'trabalho por conta própria'").

## 12. Alteração do KnowledgeEngine

Só o conteúdo de `com-002-elegibilidade` (`seedDocuments.ts`, versão 2→3): idade 21→18; "ter WhatsApp e Instagram"→"ter WhatsApp (Instagram é bem-vindo, mas não obrigatório)"; atividade profissional restrita→ampla; "ser mulher" removido. Nenhuma mudança em `KnowledgeEngine.ts`, `KnowledgeRepository.ts`, `extractKeywords.ts`, nem nos outros 7 documentos. Confirmado (cenários H/I/J) que `searchByQuestion` continua encontrando o documento certo pras mesmas perguntas de sempre, agora com o conteúdo corrigido.

## 13. Remoção de "ser mulher" da comunicação

Removido do texto de `com-002-elegibilidade`/`COM-002-recrutamento.md`. Nenhum gate de gênero foi criado ou removido em código (nunca existiu um, confirmado na RFC-005) — só o texto que citava esse critério deixou de existir.

## 14. Comportamento de IPR zerado

`calcularIpr(payload, pesos, cidadeAtendida, elegivel)` — quando `elegivel=false`, devolve `{ total: 0, breakdown: { trabalha: 0, experiencia_vendas: 0, whatsapp: 0, instagram: 0, cidade_atendida: 0 } }` incondicionalmente, para qualquer um dos 3 motivos de inelegibilidade (não só `trabalha=false` como antes). Confirmado nos cenários F ("IPR total zerado", "breakdown inteiro zerado") e no cenário de idade inelegível.

## 15. Proteção da aprovação manual no Admin — onde exatamente

**Ponto único, real, no caminho executável:** `apps/admin/src/hooks/useLeadDetail.ts`, dentro de `mutationFn` de `useUpdateLead()` — a única função que escreve `leads.status` no Admin. Investigação prévia confirmou que **dois** caminhos diferentes chamam essa mesma função com `patch.status="aprovada"`: (1) `KanbanBoard.tsx`, arrastar um card pra qualquer uma das 5 colunas que produzem `status="aprovada"` via `patchForPipelineColumn` (Aprovada, Contatada, Confirmada/Aguardando Tania, Ativa); (2) `LeadDetailDrawer.tsx`, botão "Aprovar". Proteger só um dos dois teria deixado o outro aberto — por isso a proteção foi colocada dentro de `useUpdateLead`, não em cada call site.

Nova função pura exportada `podeAprovarManualmente(patchStatus, leadWhatsapp)`: `true` se `patchStatus !== "aprovada"` (qualquer outra mudança passa livre), senão `leadWhatsapp === true`. `mutationFn` lança `new Error("Confirme que a candidata possui WhatsApp antes de aprová-la.")` **antes** de qualquer chamada ao Supabase quando a condição falha — nenhuma escrita parcial acontece.

Mensagem chega ao operador via `toast.error(error.message)`, atualizado nos dois `onError`/`catch` (Kanban e Drawer). O card no Kanban volta pra coluna de origem (`setGrouped(groupByColumn(leads))`, comportamento já existente reaproveitado).

**Correção/confirmação do WhatsApp:** como não existia nenhum campo visível ou editável de `lead.whatsapp` no Admin antes desta implementação, foi adicionada uma seção "WhatsApp" no `LeadDetailDrawer.tsx` (badge "Confirmado"/"Não confirmado" + botão "Confirmar WhatsApp" quando `!== true`), usando a mesma `useUpdateLead()` com `patch: { whatsapp: true }` — esse patch não passa por `patch.status`, então nunca é bloqueado pelo próprio gate. Depois de confirmado, o botão "Aprovar" (antes desabilitado com tooltip explicativo) libera normalmente e segue o fluxo já existente.

**Nenhum `CHECK` no banco foi criado.** A proteção é 100% no caminho executável do cliente (Admin), exatamente como pedido.

## 15.1 Regressão encontrada na revisão de diff — corrigida antes do deploy

Uma revisão crítica independente do diff (antes de qualquer commit/deploy) encontrou uma regressão real na proteção da Seção 15: como `patchForPipelineColumn` (`packages/shared/src/constants.ts`, não alterado por esta implementação) reenvia `status: "aprovada"` para **5 das 9 colunas do Kanban** (Aprovada, Contatada, Confirmada/Aguardando Tania, Ativa — todo o pipeline pós-aprovação é modelado como `status="aprovada"` + `etapa_pos_aprovacao` variável), o gate original de `podeAprovarManualmente(patchStatus, leadWhatsapp)` disparava não só na primeira aprovação, mas em **qualquer** movimentação subsequente de uma lead já aprovada entre essas colunas. Isso travaria no Kanban, sem nenhum caminho de saída simples, qualquer lead já aprovada com `whatsapp` não confirmado — inclusive `Paulicéia do nascimento`.

**Decisão do Antonio (pós-revisão):** o gate deve proteger só a **primeira** transição para `status="aprovada"`; movimentações de uma lead **já** aprovada entre etapas pós-aprovação nunca devem ser bloqueadas por esse gate, mesmo sem WhatsApp confirmado.

**Correção aplicada** (único arquivo tocado: `apps/admin/src/hooks/useLeadDetail.ts`): `podeAprovarManualmente` passou a receber também `previousStatus`, com a mesma regra que `onSuccess` já usava para decidir se dispara os efeitos colaterais de aprovação (Meta/WhatsApp/Ficha) — `if (previousStatus === "aprovada") return true`. `mutationFn` passou a repassar `previousStatus` (que os dois call sites, `KanbanBoard.tsx` e `LeadDetailDrawer.tsx`, já enviavam desde a implementação original — nenhuma mudança necessária neles).

Lógica final:
- `patchStatus !== "aprovada"` → sempre permitido (reprovar, observações, confirmar WhatsApp).
- `patchStatus === "aprovada" && previousStatus === "aprovada"` → sempre permitido (movimentação interna do pipeline pós-aprovação, já aprovada antes).
- `patchStatus === "aprovada" && previousStatus !== "aprovada"` → só permitido se `leadWhatsapp === true` (primeira aprovação).

**Confirmado:** leads historicamente já aprovadas (hoje, só `Paulicéia do nascimento`) não ficam mais bloqueadas em nenhuma movimentação pós-aprovação por este gate — verificado nos cenários 4-6 de `useLeadDetail.examples.ts`. Novas aprovações sem WhatsApp continuam bloqueadas — verificado nos cenários 1-3. Nenhum `UPDATE` foi executado em `Paulicéia` durante esta correção — reconfirmado por `SELECT` direto (`updated_at` inalterado desde 2026-08-02).

---

## 16. Confirmação de que Paulicéia não foi alterada

Nenhum `UPDATE` foi executado em nenhuma tabela do Supabase `tania-joias-crm` nesta sessão de implementação — todas as interações com o banco nesta etapa foram leituras já feitas nas RFCs anteriores (não repetidas aqui). A lead `Paulicéia do nascimento` (id `292e4b30-fb0f-432a-8739-5bd208f0f11a`) permanece exatamente como estava (`status="aprovada"`, `whatsapp=false`, `ipr=80`) — a nova regra só vale para candidaturas novas, submetidas depois do deploy (que ainda não ocorreu).

## 17. Resultado de typecheck/build

`npm run build` (`tsc -b && vite build`) rodado em `apps/landing` e `apps/admin` — **ambos concluíram sem nenhum erro de tipo ou de build**. Saída completa na seção 3.

## 18. Regressões

`classifyForFeature004.examples.ts` (pré-existente, não alterado por esta implementação): 49/49 continuam passando — confirma que as mudanças em `sofia-script.ts` (só texto de 2 campos) e `seedDocuments.ts` (só conteúdo de 1 documento) não quebraram nenhuma classificação de intenção existente. Nenhuma outra suíte pré-existente foi identificada como relevante para este escopo (`composer.examples.ts`, `NaturalConversationEngine.examples.ts` etc. testam camadas do Agent Core shadow, fora de escopo — não rodadas, por não terem nenhuma dependência do que mudou).

## 19. Deploy da Edge Function

**Nota (registro histórico — estado no momento da preparação, antes da autorização de deploy):** não executado nesta etapa. Comando preparado, não rodado: `supabase functions deploy finalize-candidate --project-ref iaqzbernshmhkqznleye`. Deploy em produção era uma ação de alto impacto (afeta candidatas reais) mantida pendente de confirmação explícita antes de ser executada, separadamente da autorização de commit. **Estado final real: executado e confirmado — ver seção 32 ("Deploy").**

## 20. Deploy Landing

**Nota (registro histórico, mesmo motivo da seção 19):** não executado nesta etapa. **Estado final real: executado e confirmado — ver seção 32 ("Deploy").**

## 21. Deploy Admin

**Nota (registro histórico, mesmo motivo da seção 19):** não executado nesta etapa. (A proteção do Admin só existe no bundle do frontend — precisa de rebuild+deploy do Vercel do `apps/admin` pra valer para os operadores reais.) **Estado final real: executado e confirmado — ver seção 32 ("Deploy").**

## 22. Smoke tests

**Nota (registro histórico, mesmo motivo da seção 19):** não executados em produção nesta etapa. Os 34 cenários automatizados (seção 3) cobrem a lógica de decisão isoladamente, sem tocar o banco real nem disparar WhatsApp/Meta — nenhuma candidatura falsa foi criada em nenhum ambiente. Um smoke test pós-deploy ficava proposto para depois da autorização de deploy — não decidido nem executado neste ponto do documento. **Estado final real: executados (não destrutivos) — ver seção 33 ("Smoke tests executados").**

## 23. Falhas/divergências encontradas durante a implementação

Na primeira rodada de verificação, os arquivos `.examples.ts` de `apps/landing` e `apps/admin` que transitivamente importam `@/lib/supabase.ts` não puderam ser executados via `npx tsx` fora do Vite, porque esse arquivo lê `import.meta.env.VITE_SUPABASE_URL` sem guarda — `import.meta.env` simplesmente não existe fora do bundler Vite, então a importação lançava antes mesmo de qualquer teste rodar. **Resolvido durante a correção desta regressão**: `npx vite-node` (já presente como dependência transitiva do monorepo, nenhuma dependência nova instalada) roda o arquivo através do pipeline real do Vite, que resolve `import.meta.env` corretamente — usado a partir daqui para `answerCandidateQuestion.examples.ts` e `useLeadDetail.examples.ts`, rodando as funções reais do repositório (sem workaround nem duplicação de lógica). Nenhuma outra divergência ou falha ocorreu — todos os cenários (43 novos + 49 de regressão) passaram de primeira depois da correção, sem retrabalho adicional.

## 24. Migrations criadas

**0** (zero), como esperado.

## 25. Alterações em `settings`

**0** (zero), como esperado. Nenhum `UPDATE`/`INSERT` em `settings` foi executado.

## 26. Alterações de dados de produção

**0** (zero), como esperado. Nenhum `INSERT`/`UPDATE`/`DELETE` em `leads`, `answers`, `ai_analysis`, `conversations`, ou qualquer outra tabela foi executado nesta sessão.

## 27. Git diff final

Ver `git diff --stat` na seção 2 (233 inserções, 183 remoções, 9 arquivos modificados) — a maior parte das "remoções" em `finalize-candidate/index.ts` é a extração de funções para `logic.ts` (código movido, não removido). Diff completo disponível via `git diff` no repositório local; não reproduzido por extenso aqui por tamanho, mas cada mudança está documentada arquivo a arquivo nas seções 4-15 acima.

## 28. Commit realizado

**Nota (registro histórico — estado no momento da preparação):** não, nenhum commit havia sido feito neste ponto do documento; aguardando autorização explícita de Antonio Carlos, conforme instruído. **Estado final real: commit realizado — ver seção 31 ("Commit").**

## 29. Rollback (preparado, não executado)

Idêntico ao desenhado na RFC-006 §14 — reforçado aqui porque a implementação real confirma que é tecnicamente simples: as mudanças de `finalize-candidate` estão concentradas em `logic.ts` + 3 pontos de `index.ts` (import, chamada de `calcularElegibilidade`, chamada de `gerarResumo`) — reverter é restaurar as duas versões anteriores desses arquivos e reimplantar. As mudanças de texto (`seedDocuments.ts`, `COM-002-recrutamento.md`, `sofia-script.ts`) são strings estáticas sem persistência em banco — reverter é trocar o texto de volta. As mudanças do Admin (`useLeadDetail.ts`, `KanbanBoard.tsx`, `LeadDetailDrawer.tsx`) não têm nenhuma dependência de dado novo (`leadWhatsapp` é só um parâmetro passado, `whatsapp` já existe como coluna) — reverter é restaurar as 3 versões anteriores desses arquivos. Nenhum dos 4 rollbacks depende de reverter dado nenhum, porque nenhum dado foi alterado.

## 30. Próximo passo recomendado (registro histórico — já executado)

1. Antonio Carlos revisar o diff (`git diff`) e os textos finais (`SOFIA_REJECTION_LINES`, `com-002-elegibilidade`, `COM-002-recrutamento.md` — seções 11-13) — são os únicos pontos desta implementação que envolvem redação, não só lógica.
2. Com o diff aprovado: autorizar o commit (`git add` dos 13 arquivos listados na seção 2 + este documento; **não** incluir `DIAGNOSTICO-*.md`/`INVENTARIO-*.md`/os dois `RFC-INTELLIGENCE-00{5,6}.md` se eles pertencerem a um commit separado anterior — a critério de Antonio).
3. Com o commit feito: autorizar o deploy, na ordem já validada (Edge Function `finalize-candidate` → Landing → Admin, se necessário), seguido de 1-2 smoke tests não destrutivos (proposta na seção 22) antes de considerar a correção P0 finalizada em produção.

**Estes 3 passos foram executados** — ver seções 31-33 abaixo (diff revisado e aprovado em duas rodadas, commit `fe78e571487dcb9339de56918cac7fddff464dab`, deploy dos 3 componentes, smoke tests não destrutivos confirmados).

---

## 31. Commit

Autorizado por Antonio Carlos após duas rodadas de revisão de diff (a segunda já cobrindo a correção da regressão do Kanban, seção 15.1). Único commit, contendo exatamente os 14 arquivos desta implementação P0 (9 modificados + 4 novos de teste/lógica + este relatório) — os documentos de sessões anteriores (`DIAGNOSTICO-...md`, `INVENTARIO-...md`, `RFC-INTELLIGENCE-005...md`, `RFC-INTELLIGENCE-006...md`) foram deliberadamente deixados fora deste commit, por não pertencerem literalmente ao código desta implementação (podem ser commitados separadamente, a critério do Antonio).

```
commit fe78e571487dcb9339de56918cac7fddff464dab
branch: main
fix(sofia): alinha elegibilidade ao Knowledge Layer (idade 18, WhatsApp obrigatorio)
14 files changed, 950 insertions(+), 183 deletions(-)
```

## 32. Deploy

**A. Edge Function `finalize-candidate`** — via MCP do Supabase (`deploy_edge_function`), projeto `iaqzbernshmhkqznleye`. Versão 25 → **26**, status `ACTIVE`, `verify_jwt: false` preservado (idêntico ao original — endpoint público, sem alteração de segurança). Arquivos enviados: `source/index.ts`, `source/logic.ts` (novo), `_shared/meta-conversions.ts`, `_shared/whatsapp-cloud-api.ts`, `_shared/ai-analysis.ts` (estes 3 últimos sem nenhuma alteração de conteúdo, reenviados porque fazem parte do bundle da função). Saúde confirmada por requisição `OPTIONS` real (HTTP 200 — só responde assim se o Deno subiu sem erro de import/sintaxe); consulta de logs (`query_logs`) retornou erro transitório de backend do lado do Supabase, não relacionado ao deploy, e não foi possível usá-la para confirmar ausência de exceções na inicialização — mitigado pelo teste funcional ao vivo do item B.

**B. Landing** — via Vercel CLI (`vercel deploy --prod --yes`), projeto `tania-joias-landing`. Build limpo (mesmo `tsc -b && vite build` já validado), deployment `dpl_FQ6CV1aXEgpySk9mpxRbX6ZFD2H7`, `readyState: READY`, aliased em `https://tania-joias-landing.vercel.app`.

**C. Admin** — via Vercel CLI, projeto `tania-joias-recrutamento`. O app não tinha link local (`.vercel/project.json`) nesta cópia do repositório; `vercel link --project tania-joias-recrutamento` criou um link a nível de repositório (`.vercel/repo.json`, mapeando `apps/admin` ao projeto — mecanismo de monorepo do próprio Vercel CLI, não uma escolha deste trabalho). Build limpo, deployment `dpl_FSUUmvx9xwQwGMPeHLQ3FL5LQyib`, `readyState: READY`, aliased em `https://tania-joias-recrutamento.vercel.app`. **Nota de transparência:** para viabilizar o deploy a partir da raiz do monorepo, foi necessário criar/remover um `.vercel/project.json` temporário na raiz e, ao final, restou um `.vercel/repo.json` na raiz — tudo dentro de `.vercel/`, que é ignorado pelo Git (`.gitignore:12`); nenhum arquivo versionado foi tocado por essa mecânica. Um `.vercel/project.json.bak` pré-existente (de 04/08, antes desta sessão) foi removido nesse processo — arquivo de tooling do Vercel, não código-fonte, sem efeito em produção.

## 33. Smoke tests executados (não destrutivos)

- `Edge Function`: `OPTIONS` real → HTTP 200.
- `Landing`: `GET /` → HTTP 200; console do navegador sem erros; conteúdo da home renderizado corretamente.
- `Admin`: `GET /` → HTTP 200; console sem erros; tela de login renderizada ("Contas são criadas manualmente pela equipe. Sem cadastro público.") — **login não foi tentado**, sem credenciais inseridas.
- **Bundle da Landing** (`grep` no JS publicado): confirma presença de `"de 18 anos"` (schemas.ts), `"ou em qualquer outra ocupa[ção]"` (SOFIA_REJECTION_LINES **e** com-002-elegibilidade — a mesma frase deliberadamente usada nos dois textos), `"trabalho por conta pr[ópria]"` (placeholder de `empresa_atual`), `"18 anos completos ou mais"` (com-002-elegibilidade); confirma **ausência** de `"de 16 anos"` e de `"acima de 21 anos"`.
- **Bundle do Admin**: confirma presença de `"Confirme que a candidata possui WhatsApp antes de aprov[á-la]"` e `"Confirmar WhatsApp"`.
- **Teste funcional ao vivo na Landing (não destrutivo):** abri o widget da Sofia, respondi nome ("Teste Smoke Deploy") e cidade ("Santo André"), e testei a etapa de idade digitando **16** — a Sofia recusou o valor com a mensagem **"Idade mínima de 18 anos"** e não avançou para a próxima etapa. Fechei o widget manualmente logo em seguida, **sem preencher telefone/trabalha/whatsapp e sem enviar o formulário** — nenhum lead real foi criado, nenhum evento Meta/WhatsApp foi disparado (confirmado depois via `SELECT` — nenhuma lead nova com esse nome existe na tabela).
- **Verificação pós-deploy no banco** (read-only): `settings.ipr_pesos`, `ipr_thresholds` e `cidades_atendidas` idênticos aos valores de antes do deploy; lead `Paulicéia do nascimento` com `updated_at` inalterado (`2026-08-02 14:57:44`) — nenhuma escrita ocorreu nela em nenhum momento desta sessão.

## Bloqueadores

Nenhum bloqueador impediu a conclusão — só um obstáculo de tooling contornado: o link local do Admin ao projeto Vercel não existia nesta cópia do repositório e precisou ser recriado (`vercel link`), o que o próprio Vercel CLI resolveu via o mecanismo de link a nível de repositório (`.vercel/repo.json`) em vez de um `.vercel/project.json` dentro de `apps/admin` — puramente tooling local, gitignored, sem efeito em produção ou no código-fonte.
