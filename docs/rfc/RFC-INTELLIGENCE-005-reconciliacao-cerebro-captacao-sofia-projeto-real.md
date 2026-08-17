# RFC-INTELLIGENCE-005 — Reconciliação Cérebro × Captação/Sofia — Projeto Real

**Status:** INVESTIGAÇÃO CONCLUÍDA — DECISÕES TOMADAS E IMPLEMENTADAS (P0 via `IMPLEMENTATION-INTELLIGENCE-003`, commit `fe78e57`, deployado; P1 via `IMPLEMENTATION-INTELLIGENCE-004`, commit `a721f75`, deployado)
**Data:** 2026-08-16
**Repositório investigado:** `PROJETO CAPTURA DE LEADS 02` (remote `https://github.com/plaquinhasid-debug/tania-joias-recrutamento.git`, branch `main`, commit `c8046cc`)
**Supabase investigado:** `tania-joias-crm` (ref `iaqzbernshmhkqznleye`, `ACTIVE_HEALTHY`)
**Knowledge Layer investigado:** `consiggold-v2` (ref `shvqtmjmquclxwqqfnbh`, `ACTIVE_HEALTHY`)
**Modo:** 100% leitura. Nenhum código, migration, banco, Supabase, Landing, Admin, Sofia, IPR, Edge Function, WhatsApp/Meta foi alterado. Nenhum projeto foi pausado ou reativado — ambos os dois Supabase relevantes já estavam `ACTIVE_HEALTHY`.

---

## 0. Nota sobre numeração deste documento

Este repositório tem sua própria sequência de engenharia (`docs/rfc/RFC-012`, `RFC-013`, `RFC-013.1`), e a própria RFC-012 já reserva os números **014 a 017** para trabalhos futuros não relacionados a este (idempotência de `startConversation`, eventos de etapa, transcript, WhatsApp/consentimento — ver `docs/rfc/RFC-012-sofia-recruitment-crm.md:307-313`). Usar "014" aqui colidiria conceitualmente com esse roteiro já planejado.

Ao consultar o Knowledge Layer (`consiggold-v2`), os próprios registros de `knowledge_versions` citam sua origem como **"RFC-INTELLIGENCE-003 (docs/consiggold-v2/177)"**, e o pedido desta investigação menciona um documento **"181-rfc-intelligence-004-primeira-publicacao-conhecimento.md"**. Isso confirma que `RFC-INTELLIGENCE-XXX` é uma série própria, **cross-project**, do programa "Cérebro Tania Joias" — não a sequência de engenharia deste repositório específico. Portanto este documento foi salvo como:

```
docs/rfc/RFC-INTELLIGENCE-005-reconciliacao-cerebro-captacao-sofia-projeto-real.md
```

— dentro da pasta `docs/rfc/` real deste repositório (mesma convenção de local), mas com o prefixo `RFC-INTELLIGENCE-` para não colidir com `RFC-014` (já reservado) nem com nenhum documento existente. Nenhum arquivo foi sobrescrito.

---

## 1. Fontes obrigatórias — o que foi lido e validado

Lidos **integralmente**: `PROJECT_STATUS.md`, `DIAGNOSTICO-CAPTURA-LEADS-CEREBRO-TANIA.md` (cabeçalho e achado principal), `INVENTARIO-INTELLIGENCE-002-CONHECIMENTO-CAPTACAO-SOFIA.md` (79KB — lido por completo, seções 1 a 13), `docs/playbooks/PLAYBOOK-001-sofia.md`, `docs/knowledge/COM-001-comissao-consignacao-garantia.md`, `docs/knowledge/COM-002-recrutamento.md`, `docs/rfc/RFC-012-sofia-recruitment-crm.md` (seções centrais lidas integralmente, especialmente §6 "IPR, aprovação e Meta"). RFC-013/RFC-013.1 foram validadas via citação cruzada confirmada independentemente (enum `etapa_pos_aprovacao` real no banco bate com o que o `INVENTARIO` já havia documentado como divergência CAP-CON-007 — verificado por mim diretamente no schema real do Supabase, não apenas copiado do inventário).

**Toda afirmação relevante desses documentos foi validada contra o código executável e, quando aplicável, contra consulta `SELECT` direta ao Supabase real** — nunca aceita apenas por estar escrita. Especificamente, esta RFC confirmou **de forma independente** (lendo o código-fonte e consultando o banco diretamente, sem depender do `INVENTARIO`):

- `supabase/functions/finalize-candidate/index.ts` (arquivo completo, 476 linhas) — motor do IPR.
- `packages/shared/src/schemas.ts` (arquivo completo) — validação client-side.
- `apps/landing/src/data/sofia-script.ts` (arquivo completo) — roteiro real da Sofia.
- `apps/landing/src/orchestrator/knowledge/{KnowledgeEngine,seedDocuments}.ts` (arquivos completos).
- `apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts` e `apps/landing/src/hooks/useSofiaFlow.ts` (confirmação de que o pipeline está de fato conectado em produção, não "shadow" como um comentário desatualizado no próprio código afirma).
- `apps/landing/src/orchestrator/Objectives.ts` (Agent Core paralelo).
- `public.settings` real, via `SELECT chave, valor FROM settings` no Supabase `tania-joias-crm`.

Em um ponto, esta investigação **encontrou algo que nem o `INVENTARIO` nem o `PROJECT_STATUS.md` haviam registrado**: a validação client-side de idade (`packages/shared/src/schemas.ts:6-10`) exige mínimo de **16 anos**, não "nenhuma validação" como o `INVENTARIO` (CAP-KNOW-008) afirma — ver Seção 6.

**Documento não prevalece sobre código:** em pelo menos um ponto confirmado (comentário de `answerCandidateQuestion.ts` afirmando "shadow, ninguém chama isto ainda"), o código real (`useSofiaFlow.ts:364`, `handleCandidateQuestion`) contradiz o próprio comentário — confirmado ativo em produção pela flag real `sofia_perguntas_ia_ativa = {"ativa": true}` no banco. Tratado aqui como comportamento real ativo, não como o comentário sugere.

---

## 2. Knowledge Layer — fonte usada

**Consulta direta, read-only, bem-sucedida.** Não foi necessário usar o fallback documental (`181-rfc-intelligence-004...`) — ambos os projetos Supabase relevantes (`tania-joias-crm` e `consiggold-v2`) já estavam `ACTIVE_HEALTHY`, sem necessidade de pausar/reativar nada.

Consulta executada em `consiggold-v2`:

```sql
select ki.id, ki.slug, ki.categoria, ki.audiencia, kv.titulo, kv.conteudo,
       kv.fonte_executavel_tipo, kv.fonte_executavel_referencia, kv.fonte_executavel_descricao
from knowledge_items ki
join knowledge_versions kv on kv.id = ki.current_version_id
order by ki.categoria, ki.slug;
```

Confirmados **12 de 12** `knowledge_items` com `current_version` em status `PUBLICADO`, todos aprovados em 2026-08-16 (mesmo dia desta investigação). Cada versão publicada já traz um campo estruturado `fonte_executavel_*` — aparentemente preenchido numa passada de reconciliação anterior contra o **ConsigGold**, não contra este repositório de Captação. Esta RFC usa o conteúdo desses 12 itens como a verdade empresarial oficial, mas **verifica de forma independente** (não copia) qualquer nota de `fonte_executavel_*` que mencione este repositório.

---

## 3–11. Matriz dos 12 conhecimentos × sistema real

| # | Conhecimento publicado | Conteúdo oficial (resumo) | Estado no sistema real |
|---|---|---|---|
| 1 | Comissão por faixa de valor vendido | ≤R$299,00→30%; R$299,01–399,99→35%; ≥R$400,00→40% | **ALINHADO** |
| 2 | Ciclo de consignação ~30 dias | Referência, não prazo rígido; pode ser reagendado se avisado | **PARCIALMENTE-ALINHADO** |
| 3 | Garantia por tipo de peça | Anéis 3 meses; demais peças 6 meses; exclui mau uso/oxidação | **ALINHADO** |
| 4 | Cidades atualmente atendidas | Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo, São Caetano do Sul | **PARCIALMENTE-ALINHADO** |
| 5 | Regra de atividade profissional exigida | Ampla: autônoma, comerciante, dona de loja, profissional liberal etc. — não é lista fechada | **DIVERGENTE** |
| 6 | Racional interno do critério profissional | Segurança da consignação, estabilidade, contato com clientes — uso interno | **ALINHADO** |
| 7 | Idade mínima para candidatura | 18 anos completos; explicitamente "não existe requisito de 21 anos" | **DIVERGENTE** |
| 8 | Contato digital: WhatsApp obrigatório, Instagram não | — | **DIVERGENTE** |
| 9 | Experiência em vendas não é requisito obrigatório | — | **ALINHADO** |
| 10 | Primeiro mostruário sem taxa/caução | — | **ALINHADO** |
| 11 | Confiança construída pelo histórico real | Sobre revendedoras já ativas, uso interno | **NÃO-APLICÁVEL** (fora do funil de Captação/Sofia) |
| 12 | Estratégia de crescimento (mostruários vs. concentração) | Nível estratégico/gestão | **NÃO-APLICÁVEL** (fora da qualificação individual) |

**Contagem:** ALINHADO = 5 · PARCIALMENTE-ALINHADO = 2 · DIVERGENTE = 3 · NÃO-IMPLEMENTADO = 0 · NÃO-APLICÁVEL = 2.

Detalhamento de cada linha abaixo.

### 3. Comissão — ALINHADO

`docs/knowledge/COM-001-comissao-consignacao-garantia.md` e `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:52-66` (`com-001-comissao`) reproduzem a tabela 30/35/40% **palavra por palavra compatível** com o KI oficial. Este documento é um dos 8 que a Sofia usa hoje, em produção, para responder perguntas de negócio (`sofia_perguntas_ia_ativa=true`, confirmado no banco). A Landing simplifica para "Ganhe até 40% de comissão!" (`Hero.tsx`, `QuemSomos.tsx`) — não é errado, só incompleto (mostra o teto, omite a estrutura de faixas). O **cálculo executável** da comissão vive no ConsigGold (`finalizar_acerto`), fora do escopo deste repositório — aqui a comissão é só conhecimento explicativo, exatamente como o próprio KI já registra em sua nota de fonte executável.

### 4. Ciclo de ~30 dias — PARCIALMENTE-ALINHADO

`com-001-consignacao` (`seedDocuments.ts:38-51`) diz "tem 30 dias para revender... ao final dos 30 dias, faz o acerto" — correto no fato central, mas **omite a nuance central do KI publicado**: que o prazo pode ser reagendado sem quebra de confiança, desde que avisado. O texto atual soa mais rígido do que a regra real. Nenhuma fonte executável neste repositório trata prazo como bloqueio (não há checagem de "dias desde a entrega" em nenhuma Edge Function encontrada) — a rigidez é só de comunicação, não de sistema.

### 5. Garantia — ALINHADO

`com-001-garantia` e `com-003-nao-coberto-garantia` (`seedDocuments.ts:67-81,127-140`) reproduzem exatamente: anéis 3 meses, demais peças 6 meses, exclusão de mau uso/oxidação por mau uso. Sem divergência de conteúdo.

### 6. Cidades atendidas — PARCIALMENTE-ALINHADO

A **lista em si** está perfeita em 2 fontes: `settings.cidades_atendidas` no Supabase real (`{"lista":["Mauá","Ribeirão Pires","Santo André","São Bernardo do Campo","São Caetano do Sul"],"restringir":true}`, confirmado por `SELECT` direto) e `com-002-elegibilidade` no `seedDocuments.ts` — nenhuma cidade errada, nenhuma faltando.

O problema é o **tratamento**: `isCidadeAtendida()` em `finalize-candidate/index.ts:81-86` só concede ou não **10 pontos de 100** no IPR — nunca bloqueia sozinha. Uma candidata de fora das 5 cidades pode ser aprovada normalmente (ex.: trabalha 50 + experiência 20 + WhatsApp 10 + Instagram 10 = 90 ≥ 80, sem nenhum ponto de cidade). Isso contradiz a redação de `COM-002-recrutamento.md:16` ("é necessário... morar em uma destas cidades") e, mais grave, o rodapé da Landing (`Footer.tsx:11-13`) declara **"Semijoias premium para revendedoras em todo o Brasil"**, e `QuemSomos.tsx:43` diz "Atendimento em todo o ABCD" — contradições ativas e sempre visíveis a qualquer visitante, nunca corrigidas por nenhuma lógica condicional.

### 7. Atividade profissional — DIVERGENTE

Este é o achado de comunicação mais sério da RFC. A **regra executável real é correta e ampla**: o único gate é a pergunta autodeclarada "Você trabalha atualmente?" (`sofia-script.ts:120-126`, `trabalha: boolean`) — o sistema **não** interpreta "sem empresa/empregador" como "não trabalha"; uma autônoma que responde "Sim, trabalho" passa exatamente como qualquer outra. `empresa_atual` é texto livre (`qualificacaoSchema.empresa_atual: min(1)`), aceita qualquer conteúdo, inclusive "sou autônoma" ou "trabalho por conta própria".

Porém, **os dois textos que o sistema efetivamente diz à candidata** são muito mais estreitos que a regra publicada:

1. `SOFIA_REJECTION_LINES` (`sofia-script.ts:28-31`), mostrado a quem responde "Não trabalho": *"um dos requisitos... é estar trabalhando (**empresa, escola, hospital**) ou atuar como **cabeleireira em salão de beleza**"* — verbatim, definido pelo próprio Antonio, citando `COM-002-recrutamento.md v1.1`.
2. `com-002-elegibilidade` no `KnowledgeEngine` (`seedDocuments.ts:83-95`), servido **ao vivo por IA** (`sofia_perguntas_ia_ativa=true`) a qualquer candidata que pergunte "quais os requisitos?": mesmo texto restrito.

Nenhum dos dois menciona autônoma, comerciante, dona de loja, manicure ou profissional liberal — os exemplos explícitos do KI publicado. O placeholder do campo `empresa_atual` ("Nome da empresa") reforça essa leitura estreita. Uma candidata autônoma real, ao ler a mensagem de reprovação ou a resposta da Sofia, pode legitimamente concluir que não se qualifica — mesmo que o motor de decisão a aceitasse se ela respondesse "Sim, trabalho".

### 8. Racional interno da atividade profissional — ALINHADO

Verificado ponto a ponto: o texto sobre "segurança da consignação"/"estabilidade" **nunca aparece** em `SOFIA_REJECTION_LINES`, em `com-002-elegibilidade`, nem em nenhum dos 8 documentos do `KnowledgeEngine`. O próprio `COM-002-recrutamento.md` já registra essa seção como "uso interno — não expor diretamente à candidata", e a nota do Claude Code de 2026-08-02 dentro de `seedDocuments.ts` confirma que essa seção foi **deliberadamente mantida fora** do que alimenta a IA. Nenhuma exposição indevida encontrada.

### 9. Idade mínima — DIVERGENTE

O achado mais grave da RFC, com **três números diferentes em três lugares**, nenhum deles 18:

1. **`packages/shared/src/schemas.ts:6-10`** — validação Zod client-side: `idade.min(16, "Idade mínima de 16 anos")`. Uma candidata de 16 ou 17 anos passa por essa validação sem erro.
2. **`supabase/functions/finalize-candidate/index.ts`** — a função inteira do IPR (linhas 88-132) **não faz nenhuma referência a `idade`** em `calcularIpr`/`decidirStatus`/`classificarPerfil`; o campo é só armazenado (`idade: payload.idade ?? null`). O tipo do payload da própria Edge Function (`finalizeCandidatePayloadSchema`, `schemas.ts:44`) também não tem `min`/`max` algum — uma chamada direta à API (fora do navegador) pode enviar qualquer idade, inclusive nenhuma.
3. **`com-002-elegibilidade`** (`seedDocuments.ts:87`) — texto servido **ao vivo por IA** a candidatas reais: *"ser mulher, **acima de 21 anos**"*. Esta é exatamente a suspeita histórica de "21 anos" mencionada na investigação anterior (RFC-005 no projeto errado) — **encontrada aqui, no projeto certo, ativa em produção**, com origem rastreável em `docs/knowledge/COM-002-recrutamento.md:15` ("Revisado por Antonio, Status: Oficial").

Nenhuma das três fontes diz 18. Ao vivo hoje, o sistema é simultaneamente **permissivo demais** (aceita 16-17 anos no formulário) e **comunica um requisito restritivo demais e incorreto** (21 anos, via IA) — nas duas direções erradas ao mesmo tempo, e sem nenhuma verificação real de idade em qualquer decisão automática.

### 10. Contato digital — WhatsApp/Instagram — DIVERGENTE

**WhatsApp** (pergunta real: "O telefone informado possui WhatsApp?", `sofia-script.ts:169-176`, campo boolean `whatsapp`): vale 10 de 100 pontos no IPR (`finalize-candidate/index.ts:96`), **nunca é um critério eliminatório**. Matematicamente demonstrável: trabalha 50 + experiência 20 + Instagram 10 + cidade 10 = 90 ≥ 80 — **uma candidata pode ser automaticamente aprovada sem WhatsApp**, contradizendo diretamente "WhatsApp é obrigatório". Isso é agravado pelo fato de que, hoje em produção, **todas** as automações pós-aprovação dependem de WhatsApp real (`whatsapp_ficha_automatica_ativa`, `whatsapp_aprovacao_automatica_ativa`, `whatsapp_notificacao_tania_ativa` — todas `{"ativa":true}`, confirmado no banco) — uma candidata aprovada sem WhatsApp confirmado fica com o fluxo automático de Ficha/notificação quebrado, mesmo estando "aprovada".

**Instagram** (pergunta real, com etapa condicional: "Você possui Instagram?" → se sim, "@usuário"): também vale 10/100, também nunca bloqueia — isso está **corretamente alinhado** ao "Instagram não obrigatório" do KI. O problema é que `com-002-elegibilidade`, servido ao vivo por IA, diz o oposto: *"ter WhatsApp **e Instagram**"* — comunicando Instagram como obrigatório quando nem o KI nem o próprio motor de decisão o tratam assim. Por isso a classificação geral do item é DIVERGENTE: WhatsApp deveria ser obrigatório e não é (nem no código, nem de fato garantido); Instagram não deveria ser obrigatório e o comportamento do motor está certo, mas o texto que a IA realmente diz para a candidata está errado.

### 11. Experiência em vendas — ALINHADO

`experiencia_vendas: boolean`, pulável se `trabalha=false`, vale 20/100 no IPR (`finalize-candidate/index.ts:95`) — nunca eliminatória. Uma candidata sem experiência pode chegar a 80 pontos normalmente (trabalha 50 + WhatsApp 10 + Instagram 10 + cidade 10 = 80). A Sofia nunca trata a ausência de experiência como motivo de reprovação em nenhum texto (`SOFIA_REJECTION_LINES` só existe para `trabalha=false`). Comportamento 100% compatível com o KI.

### 12. Primeiro mostruário sem taxa/caução — ALINHADO

`com-004-primeiro-mostruario` (`seedDocuments.ts:142-155`) reproduz "Não é necessário nenhum depósito ou caução", com detalhes adicionais (composição, prazo de 1-3 dias, motoboy grátis na primeira entrega) que são aditivos, não contraditórios ao KI.

### 13. Confiança pelo histórico / Estratégia de crescimento — NÃO-APLICÁVEIS

Ambos são conhecimento de **audiência INTERNO**, sobre revendedoras já ativas (item 11) ou sobre gestão estratégica de portfólio (item 12) — nenhum dos dois pertence à decisão de qualificar uma candidata na Captação/Sofia. Não encontrada nenhuma tentativa de forçá-los para dentro do IPR ou do roteiro da Sofia — corretamente fora do escopo deste sistema.

---

## 12. IPR real — tabela completa

Fonte primária: `supabase/functions/finalize-candidate/index.ts` (única função que escreve `leads`), confirmada linha a linha e cruzada com `SELECT chave, valor FROM settings` no banco real.

| Pergunta | Campo | Peso no IPR | Fonte do peso | Efeito quando ausente/false |
|---|---|---|---|---|
| Você trabalha atualmente? | `trabalha` | **Gate — 50 pts se true, reprova incondicionalmente se false** | `settings.ipr_pesos.trabalha` | `false` → IPR=0, status="reprovada", perfil=null, sem exceção, sem revisão manual |
| Você já trabalhou com vendas? | `experiencia_vendas` | 20 pts se true | `settings.ipr_pesos.experiencia_vendas` | ausente/false → 0 pts, sem outro efeito |
| O telefone possui WhatsApp? | `whatsapp` | 10 pts se true | `settings.ipr_pesos.whatsapp` | ausente/false → 0 pts, **nunca bloqueia** |
| Instagram informado? | `instagram` (string) | 10 pts se preenchido | `settings.ipr_pesos.instagram` | ausente → 0 pts, **nunca bloqueia** |
| Cidade bate na lista? | `cidade` × `settings.cidades_atendidas` | 10 pts se bater (case-insensitive) | `settings.ipr_pesos.cidade_atendida` | fora da lista/ausente → 0 pts, **nunca bloqueia** |
| Idade | `idade` | **0 — não participa do cálculo** | — | nenhum efeito no IPR em qualquer valor |
| Profissão / Empresa atual / Estabilidade profissional / Tempo disponível / Objetivo | vários | **0 — não participam do cálculo** | — | armazenados, nunca decidem nada |

**Thresholds** (`settings.ipr_thresholds`, `{"aprovar":80,"analise_min":60}`): `ipr>=80` → `status="aprovada"`; `60<=ipr<80` → `"em_analise"`; `ipr<60` (só possível com `trabalha=true`, já que `trabalha=false` já reprova antes de chequar threshold) → `"reprovada"`.

**Critério eliminatório:** somente `trabalha=false`. Nenhum outro campo — nem sozinho nem combinado — reprova automaticamente.

**Coletar × decidir:** a Anthropic (Claude Haiku) só é chamada se `trabalha=true && perfil !== null && sofia_ia_ativa && chave configurada` (`finalize-candidate/index.ts:249`) — e mesmo assim **nunca altera `status` nem `perfil_comercial`**, que já foram calculados de forma 100% determinística nas linhas anteriores. A IA só pode reescrever o texto explicativo (`resumo`, `motivoFinal`) e preencher campos consultivos em `ai_analysis` (`perfil_sugerido_ia`, `icp_score` etc.) — o próprio schema do banco rotula `perfil_sugerido_ia` como *"Impressão consultiva e NÃO-VINCULANTE... O perfil oficial permanece em `perfil_comercial`, decidido apenas pelo motor de regras determinístico"*.

**"Revisão manual":** o status `em_analise` (IPR 60-79) aparece no Kanban do Admin para decisão humana, mas **mesmo o status "aprovada" não libera o Mostruário sozinho** — é uma "pré-aprovação" (`SOFIA_APPROVED_LINES`, `sofia-script.ts:36-41`); a candidata ainda precisa preencher a "Ficha de Aprovação" (2ª etapa, dados de endereço/referências) e a Tania precisa confirmar manualmente (`apps/admin/src/components/leads/TaniaAprovacaoSection.tsx`, botões "Tania aprovou"/"Tania recusou", ou respondendo "sim"/"não" no WhatsApp) antes do Mostruário sair de fato.

**Confirmação: IA não decide aprovação/reprovação.** Verdadeiro, com tripla fonte independente: (1) o código (`decidirStatus`/`classificarPerfil` são funções puras, chamadas antes de qualquer chamada à Anthropic, e o resultado delas nunca é sobrescrito); (2) o comentário do schema do banco (`ai_analysis.perfil_sugerido_ia`); (3) a política escrita em `PLAYBOOK-001-sofia.md:173-175`: *"O QUE VOCÊ NUNCA DECIDE: Aprovação. Reprovação. Pontuação. IPR. Regras da empresa."*

---

## 13. Sofia — arquitetura real vs. arquitetura "shadow"

Existem **dois sistemas paralelos** dentro deste repositório com o nome "Sofia":

**(A) O roteiro real, que decide o que a candidata vê hoje** — `apps/landing/src/data/sofia-script.ts` (`SOFIA_STEPS`), percorrido por `useSofiaFlow.ts`. É um wizard determinístico orientado a dados (Zod), não IA.

**(B) O "Agent Core" (`IntentClassifier`, `DecisionEngine`, `WorkingMemory`, `Objectives`, `Planner`, `ActionEngine`, `SofiaOrchestrator`, `AgentProfile`/`AgentRegistry`/`AgentFactory`/`AgentRuntime`, `KnowledgeTool`/`ToolEngine`)** — existe, roda a cada turno da conversa (confirmado: `useSofiaFlow.ts:110-113` instancia `createSofiaOrchestrator` a cada sessão), mas **por desenho explícito da RFC-002** ("o Orquestrador só OBSERVA a conversa por fora — nunca decide nada, nunca pode alterar o que é perguntado ou como", comentário em `useSofiaFlow.ts:105-107`) o valor de retorno desse Agent Core **nunca é lido** por quem decide o que a candidata vê. Ele existe para logging/observação/`Simulator`, não para produção. `SOFIA_PROFILE` (referenciado em `useSofiaFlow.ts:109`, definido em `orchestrator/agent/profiles/sofia.ts`) e `KnowledgeTool`/`ToolEngine` fazem parte dessa mesma camada shadow — `KnowledgeTool` nunca chega a ser registrado em lugar nenhum.

Tabela dos objetivos **reais** (roteiro A, o que de fato roda):

| Objetivo | Coletado sempre? | Pulável | Influencia IPR? | Hard gate? |
|---|---|---|---|---|
| Nome | Sim | Não | Não | Não |
| Cidade | Sim | Não | Sim (10 pts) | Não |
| Idade | Sim | Não | **Não, nunca** | Não (só validação client-side de min. 16 anos) |
| Telefone | Sim | Não | Não | Sim — obrigatório na própria API (`missing_required_fields`) |
| Trabalha atualmente? | Sim | Não | **Sim — é o gate** | **Sim, o único** |
| Profissão | Só se `trabalha=true` | Sim, se `trabalha=false` | Não | Não |
| Empresa atual | Só se `trabalha=true` | Sim, se `trabalha=false` | Não | Não |
| Estabilidade profissional | Só se `trabalha=true` | Sim, se `trabalha=false` | **Não — proibido por design** | Não |
| Já trabalhou com vendas? | Só se `trabalha=true` | Sim, se `trabalha=false` | Sim (20 pts) | Não |
| Telefone tem WhatsApp? | Só se `trabalha=true` | Sim, se `trabalha=false` | Sim (10 pts) | Não |
| Possui Instagram? | Só se `trabalha=true` | Sim, se `trabalha=false` | Indireto (gate do próximo passo) | Não |
| @ do Instagram | Só se `possui_instagram=true` | Sim, se não tem Instagram | Sim (10 pts) | Não |
| Tempo disponível | Só se `trabalha=true` | Sim, se `trabalha=false` | Não | Não |
| Objetivo/motivação | Só se `trabalha=true` | Sim, se `trabalha=false` | Não | Não |

O objeto `Objectives.ts` (camada B) espelha 9 desses campos com `required: true`/`priority` — mas esse "required" é só um rótulo interno de "conversa completa" da camada shadow, **não** o mesmo conceito de "obrigatório para aprovação" do IPR real (que só exige `trabalha`). O próprio arquivo documenta essa distinção deliberadamente.

---

## 14. KnowledgeEngine atual — o que está hardcoded

`apps/landing/src/orchestrator/knowledge/seedDocuments.ts` carrega 8 documentos (`visibility: "public"`), compilados a partir de `docs/knowledge/COM-001` a `COM-004`. **Confirmado ativo em produção** (não "shadow" — corrige o comentário desatualizado de `answerCandidateQuestion.ts`): sempre que `sofia_perguntas_ia_ativa=true` (confirmado no banco) e a candidata faz uma pergunta livre reconhecida como `QUESTION`, o `KnowledgeEngine.searchByQuestion()` busca nesses 8 documentos, e os encontrados são anexados ao prompt do `agent-ai-gateway` (Claude Haiku) como base exclusiva de resposta.

| Documento | Corresponde a qual KI | Estado |
|---|---|---|
| `com-001-consignacao` | KI #2 | Correto no fato, falta nuance "não rígido" |
| `com-001-comissao` | KI #1 | Correto |
| `com-001-garantia` | KI #3 | Correto |
| `com-002-elegibilidade` | KI #4, #5, #7, #8 | **Contraditório em 3 pontos** (21 anos, Instagram obrigatório, profissão estreita) |
| `com-002-processo-candidatura` | Nenhum dos 12 diretamente | Sem conflito, informativo |
| `com-003-troca-defeito` | Nenhum dos 12 diretamente | Sem conflito (tema fora dos 12 KIs) |
| `com-003-nao-coberto-garantia` | KI #3 (adjacente) | Correto |
| `com-004-primeiro-mostruario` | KI #10 | Correto, com detalhe adicional válido |

**Conhecimento incompleto/faltando:** "Treinamento completo" é citado 4 vezes na Landing como diferencial, mas não existe em nenhum dos 8 documentos — se perguntada, a busca não encontra nada, a IA nunca é chamada, e a Sofia cai no fallback seguro ("Prefiro não passar uma informação imprecisa neste momento") em vez de inventar. Não é um erro de conteúdo, é uma lacuna.

**Racional interno exposto indevidamente:** **nenhum encontrado** — ver Seção 8 acima.

---

## 15. Verdades paralelas (duplicação)

| Regra | Nº de fontes | Onde |
|---|---|---|
| Idade mínima | **3 fontes, nenhuma diz 18** | `schemas.ts` (16, client), `finalize-candidate` (nenhuma validação), `com-002-elegibilidade`/`COM-002.md` (21, servido por IA) |
| Atividade profissional exigida | **3 fontes divergentes em amplitude** | motor de decisão (`trabalha`, amplo/correto), `SOFIA_REJECTION_LINES` (estreito), `com-002-elegibilidade` (estreito, idêntico ao anterior) |
| WhatsApp/Instagram obrigatórios | **2 fontes contraditórias** | `com-002-elegibilidade`/`COM-002.md` (diz que os dois são obrigatórios) × `calcularIpr` (nenhum dos dois bloqueia) |
| Cidades atendidas | **1 fonte correta + 2 fontes de marketing contraditórias** | `settings.cidades_atendidas`/`com-002-elegibilidade` (5 cidades, corretas) × `Footer.tsx` ("todo o Brasil") × `QuemSomos.tsx` ("todo o ABCD") |
| Comissão | 2 fontes, ambas corretas | `docs/knowledge/COM-001` × `seedDocuments.ts` (idênticos) — Landing simplifica sem contradizer |
| Profissões-sinal-positivo | **2 fontes semelhantes, não idênticas** | `COM-002`/`com-002-elegibilidade` (empresa/escola/hospital/cabeleireira) × `PROFISSOES_PREFERIDAS` hardcoded em `finalize-candidate/index.ts:23` (Cabeleireira/Professora/Enfermeira/Bancária, uso interno só para a IA consultiva) |
| Pipeline pós-aprovação | 2 desenhos diferentes | `RFC-013`/`RFC-013.1` (`crm_stage_enum`, nunca implementado) × `packages/shared/src/constants.ts` (`etapa_pos_aprovacao`, o que roda de fato) |

---

## 16. Confirmação — não repetindo o erro da RFC anterior

Nenhuma conclusão desta RFC foi copiada da RFC-005 anterior (feita no `RevendaFlow AI`). Todas as descobertas acima vêm de leitura direta do código deste repositório (`tania-joias-recrutamento`) e de consulta `SELECT` direta ao Supabase real (`tania-joias-crm` e `consiggold-v2`) executadas nesta sessão. Onde o achado coincide por acaso com a RFC anterior (ex.: a suspeita histórica de "21 anos"), isso foi **re-confirmado aqui, de forma independente, no sistema certo** — não presumido.

---

## 17. Peça faltante

Requer reconciliação própria no ConsigGold. Fora do escopo desta RFC.

---

## 18. Priorização

### P0 — pode produzir aprovação/reprovação/comunicação empresarial incorreta com risco sério

1. **Idade sem verificação real** — validação client-side com número errado (16, não 18); zero validação server-side; e o `KnowledgeEngine` comunica ativamente "acima de 21 anos" a candidatas reais via IA. Risco duplo: permite candidatas de 16-17 anos, e afasta/confunde candidatas de 18-20 anos com informação errada.
2. **Regra de atividade profissional comunicada de forma muito mais estreita que a real** — `SOFIA_REJECTION_LINES` e `com-002-elegibilidade` (ambos ativos em produção) dizem "empresa, escola, hospital ou cabeleireira", omitindo autônoma/comerciante/dona de loja/profissional liberal, mesmo o motor de decisão sendo corretamente amplo.
3. **WhatsApp não é de fato obrigatório** — uma candidata pode ser aprovada automaticamente sem WhatsApp confirmado, quebrando os fluxos automáticos pós-aprovação (Ficha, notificação, aprovação) que hoje dependem 100% dele e estão todos ativos em produção.
4. **KnowledgeEngine ativo comunicando 2 regras erradas simultaneamente** (idade 21, Instagram obrigatório) a candidatas reais, hoje, via `sofia_perguntas_ia_ativa=true` — não é risco teórico, é comportamento confirmado ativo.

### P1 — comunica regra errada ou causa fricção operacional relevante

5. Landing declara área de atuação nacional ("todo o Brasil"/"todo o ABCD") contradizendo as 5 cidades reais — atrai candidatas fora da área, gera trabalho de triagem e frustração.
6. Cidade tratada como requisito na comunicação (`COM-002`) mas só pontua 10/100 no motor real — mesma classe de risco do item 3, em menor escala.
7. Ciclo de "30 dias" comunicado como mais rígido do que o KI define — risco de atrito no momento do acerto se um reagendamento for necessário.
8. Faixas de ganho em R$ concretos na Landing (`QuantoPossoGanhar.tsx`) sem lastro documental encontrado, contradizendo a regra explícita do Playbook de nunca prometer ganhos (regra que vale só para a Sofia via IA, não para a Landing estática).

### P2 — inconsistência sem decisão crítica imediata

9. Pergunta "Onde você trabalha?" com placeholder "Nome da empresa" pode induzir uma autônoma a hesitar, mesmo a validação aceitando qualquer texto.
10. `PROFISSOES_PREFERIDAS` hardcoded (uso interno/consultivo) parcialmente divergente tanto de `COM-002` quanto do novo KI — mais uma fonte paralela de "que profissão conta".
11. `RFC-013`/`RFC-013.1` (pipeline pós-aprovação com `crm_stage_enum`) nunca implementadas como especificado; o sistema real usa `etapa_pos_aprovacao`, um desenho diferente — dívida de arquitetura, não afeta qualificação.
12. `estabilidade_profissional` coletado mas nunca usado na aprovação — decisão de negócio pendente (o próprio `QUALIFICACAO-002` recomendava usá-lo, isso nunca foi adotado).

### P3 — dívida técnica/documental

13. Comentário desatualizado em `answerCandidateQuestion.ts` afirmando que o pipeline de IA ainda é "shadow" quando já está ativo em produção.
14. Agent Core inteiro (`IntentClassifier`/`DecisionEngine`/`WorkingMemory`/`Objectives`/`Planner`/`ActionEngine`/`SofiaOrchestrator`/`AgentRegistry`/`AgentFactory`/`AgentRuntime`/`KnowledgeTool`/`ToolEngine`) roda a cada turno só para observação, por desenho (RFC-002) — não é um bug, mas é complexidade em produção sem efeito hoje, vale documentar claramente para quem chegar depois perguntando "por que isso existe".
15. `docs/knowledge/COM-003-troca-defeito.md` ainda traz nota de "pendência de revisão" resolvida há muito tempo em `COM-004` — só o `.md` original não foi atualizado.

---

## 19. Relatório final

1. **Documento criado:** [docs/rfc/RFC-INTELLIGENCE-005-reconciliacao-cerebro-captacao-sofia-projeto-real.md](docs/rfc/RFC-INTELLIGENCE-005-reconciliacao-cerebro-captacao-sofia-projeto-real.md), dentro de `PROJETO CAPTURA DE LEADS 02` (repositório real `tania-joias-recrutamento`).
2. **Fonte usada para os 12 KIs:** leitura direta e bem-sucedida de `knowledge_items`/`knowledge_versions` no Supabase `consiggold-v2` (ref `shvqtmjmquclxwqqfnbh`, `ACTIVE_HEALTHY`) — não foi necessário usar o documento de fallback.
3. **Estado dos 12 KIs × sistema real:** ver matriz completa na Seção 3–11.
4. **Contagem:** ALINHADO = 5 · PARCIALMENTE-ALINHADO = 2 · DIVERGENTE = 3 · NÃO-IMPLEMENTADO = 0 · NÃO-APLICÁVEL = 2.
5. **Regras reais do IPR:** motor aditivo de 100 pontos (trabalha 50, experiência 20, WhatsApp 10, Instagram 10, cidade 10), pesos e thresholds (`aprovar>=80`, `análise 60-79`) vindos de `settings` (editável sem deploy); único critério eliminatório é `trabalha=false`; ver tabela completa na Seção 12.
6. **Regra real de atividade profissional:** motor de decisão é amplo e correto (autodeclarado, sem exigir empresa/CLT); a comunicação (rejeição + resposta da IA) é incorretamente estreita — DIVERGENTE.
7. **Regra real de idade:** nenhuma verificação server-side; validação client-side com mínimo errado (16); KnowledgeEngine comunica 21 (errado) a candidatas reais — DIVERGENTE, o achado de maior risco desta RFC.
8. **Regra real de cidades:** lista correta (5 cidades) em `settings` e no `KnowledgeEngine`; nunca é um bloqueio, só soma 10/100 pontos; Landing contradiz com "todo o Brasil" — PARCIALMENTE-ALINHADO.
9. **Comportamento real do WhatsApp:** coletado como boolean ("possui WhatsApp?"), soma 10/100 pontos, nunca bloqueia — pode ser aprovada sem ele, apesar de todas as automações pós-aprovação dependerem dele — DIVERGENTE.
10. **Comportamento real do Instagram:** coletado opcionalmente (com etapa condicional), soma 10/100 pontos, nunca bloqueia — comportamento correto; só o texto comunicado por IA está errado (diz que é obrigatório).
11. **Comportamento real da experiência:** soma 20/100 pontos, nunca eliminatória — ALINHADO, sem candidata sem experiência sendo automaticamente reprovada por isso.
12. **Comissão real comunicada/executada:** 30/35/40% por faixa, correta e consistente entre `docs/knowledge` e `seedDocuments.ts`; cálculo executável fica no ConsigGold, fora deste repositório.
13. **Conhecimentos hardcoded no KnowledgeEngine:** 8 documentos ativos (`seedDocuments.ts`), servidos ao vivo por IA hoje; `com-002-elegibilidade` é o único com conteúdo diretamente contraditório aos KIs publicados (idade, Instagram, atividade profissional).
14. **Objetivos reais da Sofia:** 14 passos do roteiro real (`sofia-script.ts`), com `trabalha` como único hard gate; existe um "Agent Core" paralelo (`Objectives.ts` e todo o resto citado na pergunta original do usuário) que roda a cada turno, mas nunca influencia o que a candidata vê — confirmado por desenho explícito (RFC-002), não é bug.
15. **Verdades duplicadas:** idade (3 fontes), atividade profissional (3 fontes), WhatsApp/Instagram (2 fontes contraditórias), cidades (1 correta + 2 contraditórias de marketing), profissões-sinal (2 fontes semelhantes) — ver Seção 15.
16. **Divergências P0/P1/P2/P3:** P0 = 4 · P1 = 4 · P2 = 4 · P3 = 3.
17. **Exposição de conhecimento INTERNO:** nenhuma encontrada — o racional de risco da atividade profissional está corretamente mantido fora do que a IA pode dizer à candidata.
18. **Lista ordenada de correções futuras:** (1) corrigir idade em `schemas.ts` (16→18) e adicionar validação server-side em `finalize-candidate`; (2) atualizar `com-002-elegibilidade`/`COM-002.md` e `SOFIA_REJECTION_LINES` para refletir a definição ampla de atividade profissional e remover "21 anos"/"Instagram obrigatório"; (3) decidir com o dono se WhatsApp deve virar critério eliminatório real, dado que os fluxos automáticos já dependem dele; (4) corrigir o Footer/QuemSomos da Landing para não contradizer as 5 cidades reais; (5) decidir se cidade deve virar bloqueio automático ou permanecer só pontuação (Seção 6 do CAP-CON-001 do `INVENTARIO`); (6) suavizar a comunicação do prazo de 30 dias para refletir a flexibilidade real; (7) validar/documentar a origem das faixas de ganho em R$ da Landing; (8) consolidar `PROFISSOES_PREFERIDAS` numa única fonte com `COM-002`; (9) arquivar formalmente `RFC-013`/`RFC-013.1` como superadas pelo `etapa_pos_aprovacao` real.
19. **Confirmação de nenhuma implementação:** confirmado — nenhum código, schema, configuração, Supabase, Landing, Admin, Sofia, IPR, Edge Function ou WhatsApp/Meta foi alterado nesta sessão.
20. **Arquivos alterados:** um único arquivo criado — este documento. Nenhum arquivo existente foi modificado.
21. **Bloqueadores:** nenhum. Ambos os projetos Supabase necessários (`tania-joias-crm` e `consiggold-v2`) já estavam ativos; não foi preciso pausar/reativar nada, nem usar o documento de fallback.
22. **Próximo passo recomendado (não executado):** com o dono (Antonio/Tania), validar as 9 correções da lista do item 18 acima — em especial priorizar idade e a comunicação de atividade profissional (P0s 1 e 2), por serem simultaneamente os de maior risco e os de correção mais simples (edição de texto/validação, sem mudança de arquitetura) — antes de decidir se algum dos P1 (WhatsApp obrigatório, cidade como bloqueio) deve virar regra eliminatória nova no IPR.
