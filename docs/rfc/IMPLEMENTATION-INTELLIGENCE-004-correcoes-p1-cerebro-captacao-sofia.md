# IMPLEMENTATION-INTELLIGENCE-004 — Correções P1 Cérebro × Captação/Sofia

**Baseado em:** `RFC-INTELLIGENCE-007 — Correções P1 Cérebro × Captação/Sofia` (decisões aprovadas por Antonio Carlos)
**Repositório:** `PROJETO CAPTURA DE LEADS 02` (`tania-joias-recrutamento`)
**Branch/commit inicial:** `main`, `fe78e571487dcb9339de56918cac7fddff464dab` (topo do P0, já em produção)
**Commit desta implementação:** `a721f75b80f823d39a8b60dc12f780f7d95ff008` — "fix(sofia): alinha cidades e comunicacao ao Knowledge Layer"
**Status:** COMMITADO E DEPLOYADO EM PRODUÇÃO (Edge Function `finalize-candidate` v27, Landing) — ver Seção 13

---

## 1. Decisões aprovadas (não reabertas)

- **Cidades continuam SCORE** — não viraram hard gate, não reprovam ninguém automaticamente, peso (10 pts) e thresholds inalterados. Corrigida só a fragilidade de comparação (normalização conservadora).
- **Landing** — Footer/QuemSomos corrigidos para as 5 cidades reais, sem prometer expansão.
- **~30 dias** — corrigido como referência flexível, sem nenhuma lógica de prazo/timer/gate.
- **Faixas de ganho em R$** — Antonio confirmou que representam razoavelmente a experiência real da operação. As 3 faixas foram preservadas exatamente; só o texto de isenção foi ajustado para deixar inequívoco que são referência, não garantia.
- **Duplicação `IPR_PESOS`/`IPR_THRESHOLDS`** (`packages/shared/src/constants.ts`) — **não corrigida nesta implementação**, registrada como dívida técnica (Seção 8).

---

## 2. Implementação da normalização de cidade

**Causa da regressão original:** `isCidadeAtendida()` comparava `cidade.trim().toLowerCase()` por igualdade exata contra a lista — sem remover acento, sem separar UF, sem tolerar pontuação. Caso real: a lead `Paulicéia do nascimento` tem `cidade = "Santo André São Paulo"` no banco, que nunca bateu com `"Santo André"`.

**Único ponto executável de comparação de cidade no sistema** (confirmado por grep exaustivo antes de implementar, conforme pedido): `isCidadeAtendida()` em `supabase/functions/finalize-candidate/logic.ts`. Nenhum outro lugar do código (Landing, Admin, `packages/shared`) compara nome de cidade — `SettingsPage.tsx`/`useSettings.ts` só fazem CRUD da lista (sem comparação), `LeadFilters.tsx` só lista cidades distintas já existentes em leads (filtro de busca, não regra de elegibilidade), e `orchestrator/tools/types.ts` é só uma interface de tipo do Agent Core shadow, sem lógica.

**Nova função pura `normalizarCidade(bruto: string): string`** (`logic.ts`, exportada para ser testável diretamente):

```ts
function normalizarCidade(bruto) {
  // 1. trim + lowercase + remove acento (NFD + strip diacríticos)
  // 2. vírgula e hífen (separadores cidade/UF) viram espaço; espaços repetidos colapsam
  // 3. remove sufixo de UF inequívoco ("sp" / "sao paulo"), só se for a ÚLTIMA
  //    palavra da string, precedida por espaço — nunca no meio do nome
}
```

`isCidadeAtendida()` passou a normalizar **os dois lados** da comparação (cidade digitada e cada item de `config.lista`) antes de comparar — a comparação continua sendo **igualdade exata de string** depois da normalização, nunca aproximação/similaridade. É isso que garante, por construção, que duas cidades diferentes nunca colidem entre si (ver Seção 3).

**Nenhuma mudança em peso, threshold, ou no fato de cidade nunca bloquear** — `isCidadeAtendida()` continua devolvendo só `true`/`false`, usado exatamente como antes dentro de `calcularIpr()`.

---

## 3. Exemplos aceitos e rejeitados

**Aceitos (reconhecidos corretamente como a cidade correspondente da lista):**
`Santo André` · `santo andre` · `SANTO ANDRÉ` · `  Santo   André  ` (espaços extras) · `Santo André SP` · `Santo André - SP` · `Santo André, SP` · `Santo André São Paulo` (caso real da Paulicéia) · `São Bernardo do Campo` · `Sao Bernardo do Campo SP`.

**Rejeitados (corretamente NÃO reconhecidos — sem falso positivo):**
`Guarulhos` (cidade real, fora da lista) · `""` (string vazia) · `undefined` (ausente) · `São Bernardo` (nome incompleto — não é igual a "São Bernardo do Campo") · `São Paulo` (capital, não é uma das 5 cidades, mesmo contendo a palavra "paulo").

**Garantia de não-colisão entre cidades da própria lista:** `normalizarCidade("São Bernardo do Campo") !== normalizarCidade("São Caetano do Sul")` — verificado explicitamente nos testes. Como a normalização só faz transformações determinísticas de formatação (não aproximação), duas cidades com nomes realmente diferentes permanecem diferentes depois de normalizadas.

---

## 4. Confirmações explícitas

- **Cidade continua SCORE:** `isCidadeAtendida()` é chamada exatamente onde já era, dentro de `calcularIpr()` — nunca dentro de `calcularElegibilidade()`. Uma candidata fora da área continua podendo ser `aprovada` (perde só os 10 pontos), exatamente como antes — testado explicitamente (Seção 6).
- **Pesos e thresholds inalterados:** `settings.ipr_pesos`/`ipr_thresholds` não foram lidos nem escritos nesta implementação; `PESOS`/`THRESHOLDS` usados nos testes são os mesmos valores reais já documentados nas RFCs anteriores, sem nenhuma mudança.

---

## 5. Textos finais

**`Footer.tsx`:**
> "© {ano} Tania Joias. Todos os direitos reservados. Atendemos atualmente Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo e São Caetano do Sul."

**`QuemSomos.tsx`** — novo parágrafo na introdução:
> "Atendemos atualmente Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo e São Caetano do Sul. Nossa área de atendimento pode ser ampliada conforme a logística da empresa."

E o indicador (badge) que antes dizia "Atendimento em todo o ABCD" agora diz **"Atendimento local personalizado"** — evita reintroduzir uma nomenclatura de região imprecisa ("ABCD" tradicionalmente inclui Diadema, que não é uma das 5 cidades, e exclui Mauá/Ribeirão Pires) num espaço de badge curto demais para listar as 5 cidades por extenso; a lista explícita já está no parágrafo acima, no mesmo componente.

**`docs/knowledge/COM-001-comissao-consignacao-garantia.md`** (v1.1) e **`seedDocuments.ts`** (`com-001-consignacao`, versão 2 — textos sincronizados entre si):
> "A revendedora recebe um mostruário de peças sem pagar nada adiantado. O acerto costuma acontecer em torno de 30 dias — esse período é uma referência, não um prazo rígido: pode ser antecipado, adiado ou reagendado, desde que combinado com a equipe. No acerto, ela paga à Tania Joias apenas as peças que vendeu (já com a comissão descontada) e devolve as peças que não vendeu. Em seguida recebe um novo mostruário e o ciclo recomeça."

**`QuantoPossoGanhar.tsx`** — texto de isenção abaixo dos 3 cards (cards e valores **não alterados**):
> "Valores de referência, baseados na experiência da operação da Tania Joias. O ganho real depende do volume vendido e da comissão aplicável, e não constitui garantia de renda."

**As três faixas preservadas exatamente:** "Começando" (1h/dia, R$ 300 – R$ 600/mês) · "Consistente" (2-3h/dia, R$ 800 – R$ 1.800/mês, "Mais comum") · "Dedicada" (4h+/dia, R$ 2.000+/mês) — confirmado, nenhum valor foi tocado.

---

## 6. Testes

**Novos (39 asserts em `finalize-candidate.examples.ts`, dos quais 24 são novos de cidade nesta implementação; 12 em `answerCandidateQuestion.examples.ts`, 1 novo cenário "K" de 4 asserts):**
- Todas as variações de escrita pedidas (Seção 3 acima) — 10 casos "atendida", 5 casos "não atendida"/edge case.
- Regra "cidade nunca reprova sozinha": candidata com `trabalha+idade+whatsapp+experiência+instagram` completos, dentro da área → IPR 100/aprovada; a MESMA candidata fora da área → IPR 90/**continua aprovada**, só perde os 10 pontos — comportamento do IPR preservado.
- Cenário K (`answerCandidateQuestion.examples.ts`): pergunta sobre prazo encontra `com-001-consignacao` e o conteúdo menciona "referência", "não é um prazo rígido" e "reagendar".

**Não escritos (não pedidos, não introduzidos):** nenhum teste de renderização de JSX (Footer/QuemSomos/QuantoPossoGanhar) — não existe test runner nem React Testing Library instalados no monorepo, e instalar um seria "framework grande de testes" fora do pedido. Verificação de conteúdo desses componentes foi feita por grep direto no bundle buildado localmente (Seção 7) — suficiente para confirmar que o texto certo foi para o build, sem introduzir dependência nova.

---

## 7. Verificação local

| Suíte | Resultado |
|---|---|
| `finalize-candidate.examples.ts` (`runFinalizeCandidateLogicExamples`) — 39 asserts (15 já existentes do P0 + 24 novos de cidade) | **39/39 PASS** |
| `answerCandidateQuestion.examples.ts` (`runComElegibilidadeCorrectionChecks`) — 12 asserts (8 do P0 + 4 do cenário K) | **12/12 PASS** |
| Regressão P0 — `schemas.examples.ts` | **6/6 PASS** |
| Regressão P0 — `useLeadDetail.examples.ts` (gate manual do Admin) | **9/9 PASS** |
| Regressão geral — `classifyForFeature004.examples.ts` (pré-existente) | **49/49 PASS** |
| `npm run build` (`apps/landing`) | Limpo, 0 erros de tipo |
| `npm run build` (`apps/admin`) | Limpo, 0 erros de tipo (nenhum arquivo do Admin foi tocado nesta implementação) |
| Conteúdo do bundle local (`dist/assets/index-*.js` da Landing, gerado por este build, nunca deployado) | Confirmado via `grep`: ausência de "todo o Brasil" e "todo o ABCD"; presença das 5 cidades (Footer + QuemSomos), da frase de ampliação futura, do novo badge, do disclaimer de ganhos corrigido, e das 3 faixas de R$ intactas (300/600/800/1.800/2.000) |
| Preview visual ao vivo (dev server) | **Não realizado** — a ferramenta de preview deste ambiente está vinculada ao diretório de trabalho primário da sessão (um projeto paralelo, `PROJETO CAPTURA DE REVNDEDORAS`), não a este repositório; tentativas de apontar explicitamente para `apps/landing` deste projeto continuaram abrindo o app errado. Contornado com verificação direta do bundle buildado localmente (linha acima), que confirma o mesmo resultado sem depender do preview |

**Nenhuma regressão encontrada** — não foi necessário parar/reportar falha.

---

## 8. Dívida técnica registrada (não corrigida)

`packages/shared/src/constants.ts:235-241` — `IPR_PESOS`/`IPR_THRESHOLDS` hardcoded, usados só por `apps/admin/src/components/leads/IprBreakdown.tsx` para desenhar a barra/label do detalhe do IPR no Admin. Hoje batem com `settings.ipr_pesos`/`ipr_thresholds` reais por sincronização manual, não por design — se algum peso for alterado em produção no futuro (hoje não há UI para isso, só `cidades_atendidas` é editável em `SettingsPage.tsx`), o Admin exibiria um valor desatualizado sem ninguém perceber. Identificado na RFC-007, mantido como está por instrução explícita do escopo desta implementação — não ampliar.

---

## 9. Comportamento prospectivo — Paulicéia

Nenhum `UPDATE` foi executado em nenhuma tabela do Supabase nesta implementação (nenhuma consulta de escrita foi feita nesta sessão). A lead `Paulicéia do nascimento` permanece exatamente como estava (`status="aprovada"`, `whatsapp=false`, `ipr=80`, cidade sem os 10 pontos) — a correção de normalização só passa a valer para candidaturas **novas**, a partir do momento em que a Edge Function corrigida for deployada (ainda não foi, nesta etapa). O caso dela serviu como evidência/caso de teste (Seção 3), nunca como gatilho de alteração de dado real.

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Normalização remover acidentalmente parte válida de um nome de cidade fora da lista | Mitigado — a remoção de sufixo só afeta "sp"/"sao paulo" como última palavra isolada, testado explicitamente contra "São Paulo" sozinho (não removido, permanece "não atendida") |
| Duas cidades da lista colidirem por engano | Mitigado por construção — normalização é só formatação (acento/caixa/espaço/UF), nunca aproximação; testado explicitamente que "São Bernardo do Campo" ≠ "São Caetano do Sul" depois de normalizadas |
| Texto novo da Landing (parágrafo extra em `QuemSomos.tsx`) alterar layout de forma inesperada | Baixo — é só mais um parágrafo de texto no mesmo padrão dos existentes (`<p className="mx-auto mt-4 max-w-2xl text-muted-foreground">`), sem novo componente/estilo; build limpo confirma que não quebrou a árvore JSX |
| Badge "Atendimento local personalizado" ser percebido como vago demais | Aceitável — a lista explícita de cidades já aparece no parágrafo logo acima, no mesmo componente; o badge não precisa repetir a lista |
| Dívida técnica da Seção 8 (pesos duplicados) permanecer sem correção | Aceito conscientemente — fora do escopo autorizado desta implementação |

---

## 11. Rollback futuro

- **Normalização de cidade:** mudança concentrada em uma função pura nova (`normalizarCidade`) + duas linhas alteradas em `isCidadeAtendida` dentro de `logic.ts` — reverter é restaurar a versão anterior do arquivo e reimplantar a Edge Function. Nenhum dado foi migrado, nenhuma mudança de schema.
- **Textos (Landing + `COM-001`/`seedDocuments`):** strings estáticas sem persistência em banco — reverter é trocar o texto de volta e rebuildar/reimplantar.
- Nenhum dos dois rollbacks depende de reverter dado — nenhum dado foi alterado nesta implementação.

---

## 12. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/finalize-candidate/logic.ts` | Nova função `normalizarCidade`; `isCidadeAtendida` normaliza os dois lados da comparação |
| `supabase/functions/finalize-candidate/finalize-candidate.examples.ts` | +24 asserts de normalização de cidade + regra "nunca reprova sozinha" |
| `apps/landing/src/orchestrator/knowledge/seedDocuments.ts` | `com-001-consignacao` corrigido (versão 1→2); comentário de cabeçalho atualizado |
| `apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.examples.ts` | +4 asserts (cenário K, prazo de 30 dias) |
| `docs/knowledge/COM-001-comissao-consignacao-garantia.md` | v1.0→1.1, texto do ciclo de consignação corrigido, nota de manutenção |
| `apps/landing/src/components/sections/Footer.tsx` | Texto de região corrigido |
| `apps/landing/src/components/sections/QuemSomos.tsx` | Novo parágrafo de região + badge ajustado |
| `apps/landing/src/components/sections/QuantoPossoGanhar.tsx` | Texto de isenção corrigido (faixas preservadas) |

Nenhum arquivo do Admin, nenhuma migration, nenhuma mudança em `settings`, nenhum arquivo fora desta lista.

---

## 13. Deploy e produção (execução controlada autorizada por Antonio Carlos)

**Commit:** `a721f75b80f823d39a8b60dc12f780f7d95ff008` na branch `main`, contendo exatamente os 8 arquivos de código/conteúdo da Seção 12 + este documento. `IMPLEMENTATION-INTELLIGENCE-003.md` (diff pré-existente não relacionado) e os documentos RFC/DIAGNOSTICO/INVENTARIO permaneceram fora do commit, como já estavam antes desta implementação.

**Edge Function `finalize-candidate`:**
- Deploy via `deploy_edge_function`, payload com `source/index.ts` (inalterado desde o P0), `source/logic.ts` (com `normalizarCidade`), e os três `_shared/*.ts` (inalterados desde o P0).
- `entrypoint_path: "source/index.ts"`, `verify_jwt: false` (preservado, nenhuma mudança de configuração).
- Versão anterior: **26** → versão nova: **27**, status **ACTIVE**.
- Saúde confirmada via requisição `OPTIONS` (preflight CORS) — resposta `HTTP 200`, sem criar nenhuma candidatura/lead real.

**Landing (Vercel, projeto `tania-joias-landing`):**
- Build de produção limpo (`tsc -b && vite build`), gerando `dist/assets/index-BHIkYm3F.js` / `index-BYV549AI.css`.
- Deploy via `vercel deploy --prod --yes` a partir da raiz do repositório (mesmo contorno do path-nesting já documentado no P0 — link em `apps/landing/.vercel/project.json` copiado temporariamente para a raiz e removido logo após o deploy).
- URL de produção: `https://tania-joias-landing.vercel.app` (alias), deployment `dpl_H43TeQmgAwkBX7P4kZGB8Qc3x8P8`, `readyState: READY`.
- Bundle de produção verificado por download direto (`curl`) e busca de texto (`node`, para contornar o problema de encoding de acentos do `grep` já registrado no P0): confirmada a presença de "referência", "não um prazo rígido", "reagendar", "não constitui garantia de renda", as 5 cidades (Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo, São Caetano do Sul) no Footer e no QuemSomos, e as 3 faixas de R$ (300–600 / 800–1.800 / 2.000+) intactas; confirmada a ausência de "todo o Brasil" e "todo o ABCD".

**Admin:** **NÃO deployado nesta rodada** — nenhum arquivo de `apps/admin/` foi alterado nesta implementação (confirmado por `git status`/diff vazio antes do commit e novamente após), então não havia razão técnica para reimplantar. O deploy do Admin em produção continua sendo o mesmo da execução do P0 — nenhuma ação foi necessária ou tomada.

**Smoke tests (não destrutivos, sem criar lead real):**
- Edge Function: `OPTIONS` → `200 OK`.
- Landing: página inicial carrega, bundle JS/CSS servido, conteúdo do bundle conferido via download+busca de texto (acima) — sem submissão de formulário, sem disparo de Meta CAPI/WhatsApp/Ficha.
- Normalização de cidade: confirmada via código deployado (versão 27, `logic.ts` idêntico ao testado localmente com 39/39 PASS) e não via lead real — nenhuma candidatura de teste foi criada.

**Verificação pós-deploy (somente leitura, via `execute_sql`):**
- `settings.ipr_pesos` = `{trabalha:50, experiencia_vendas:20, whatsapp:10, instagram:10, cidade_atendida:10}` — inalterado.
- `settings.ipr_thresholds` = `{aprovar:80, analise_min:60}` — inalterado.
- `settings.cidades_atendidas` = `{restringir:true, lista:[Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo, São Caetano do Sul]}` — inalterado.
- Lead `Paulicéia do nascimento` (`292e4b30-fb0f-432a-8739-5bd208f0f11a`): `idade=54, trabalha=true, whatsapp=false, cidade="Santo André São Paulo", ipr=80, status="aprovada", etapa_pos_aprovacao=null, updated_at="2026-08-02 14:57:44.067232+00"` — **byte-idêntico** ao estado registrado antes do deploy; nenhum `UPDATE` foi executado.
- `list_migrations`: 19 migrations, todas anteriores a esta implementação (mais recente: `20260815125035`) — **0 migrations novas**.

**Estado final de produção:** Edge Function `finalize-candidate` v27 (ACTIVE) e Landing (`tania-joias-landing.vercel.app`) refletem o P1; Admin permanece na versão do P0 (sem mudança de código, sem necessidade de redeploy); nenhuma migration, nenhuma mudança de `settings`, nenhum dado histórico alterado; ConsigGold/Knowledge Layer (projeto `consiggold-v2`) não tocado.
