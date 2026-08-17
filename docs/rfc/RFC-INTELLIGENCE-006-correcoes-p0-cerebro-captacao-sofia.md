# RFC-INTELLIGENCE-006 — Correções P0 Cérebro × Captação/Sofia

**Status:** ESPECIFICAÇÃO IMPLEMENTADA E DEPLOYADA EM PRODUÇÃO — ver `IMPLEMENTATION-INTELLIGENCE-003` (commit `fe78e571487dcb9339de56918cac7fddff464dab`, Edge Function `finalize-candidate` v26)
**Data:** 2026-08-16
**Baseada em:** `RFC-INTELLIGENCE-005 — Reconciliação Cérebro × Captação/Sofia — Projeto Real` (revisada por Antonio Carlos)
**Repositório:** `PROJETO CAPTURA DE LEADS 02` (`tania-joias-recrutamento`), branch `main`, commit `c8046cc`
**Modo:** 100% especificação. Nenhum código, schema, `settings`, Edge Function, Landing, Admin, migration, deploy ou commit foi alterado nesta sessão. Toda consulta ao Supabase real foi `SELECT` read-only.

---

## 0. Numeração

Este é o próximo documento da série `RFC-INTELLIGENCE-XXX` (cross-project, do programa "Cérebro Tania Joias" — ver nota de numeração da RFC-005). `docs/rfc/` já contém `RFC-012`, `RFC-013`, `RFC-013.1` e `RFC-INTELLIGENCE-005`; nenhum arquivo `RFC-INTELLIGENCE-006` existia. Salvo em:

```
docs/rfc/RFC-INTELLIGENCE-006-correcoes-p0-cerebro-captacao-sofia.md
```

---

## 1. Sumário executivo

As quatro verdades empresariais (idade ≥18, atividade profissional ampla, WhatsApp obrigatório, Instagram opcional) já estão decididas — esta RFC não reabre nenhuma delas. O que falta é puramente técnico: **um arquivo de código** (`supabase/functions/finalize-candidate/index.ts`), **um arquivo de schema** (`packages/shared/src/schemas.ts`), **três textos** (`SOFIA_REJECTION_LINES` em `sofia-script.ts`, `com-002-elegibilidade` em `seedDocuments.ts`, `docs/knowledge/COM-002-recrutamento.md`) e **um placeholder** (`empresa_atual`). Nenhuma migration, nenhuma mudança em `settings`, nenhuma mudança de arquitetura.

O ponto de maior risco técnico é o WhatsApp: transformar `whatsapp=false` num critério eliminatório real, sem recalibrar sem querer o resto do IPR. A Seção 5 mostra, com uma tabela exaustiva de combinações, que a menor mudança segura é **adicionar um gate fora da soma de pontos, no mesmo padrão que `trabalha` já usa hoje** — isso zera exatamente as combinações que hoje aprovam ou colocam em análise uma candidata sem WhatsApp, e **não altera em nenhum bit** o resultado de nenhuma candidata que já tem WhatsApp confirmado. Nenhuma recalibração de `settings.ipr_thresholds`/`ipr_pesos` é necessária.

Já existe, hoje, em produção, **1 lead real (`Paulicéia do nascimento`, IPR=80, `status=aprovada`, `whatsapp=false`)** que ficaria fora da regra se ela se candidatasse hoje — ver Seção 9. Não deve ser alterada retroativamente sem decisão explícita.

---

## 2. Arquivos que precisarão ser alterados (visão geral)

| Arquivo | Tipo de mudança | Relacionado a |
|---|---|---|
| `packages/shared/src/schemas.ts` | Alterar `.min(16, ...)` → `.min(18, ...)` em `identificacaoSchema.idade` | Idade (client) |
| `supabase/functions/finalize-candidate/index.ts` | Adicionar gate de idade e de WhatsApp; ajustar `decidirStatus`/`classificarPerfil`/`calcularIpr`/`gerarResumo` | Idade (server) + WhatsApp (server) |
| `apps/landing/src/data/sofia-script.ts` | Reescrever `SOFIA_REJECTION_LINES` (texto de atividade profissional) | Atividade profissional |
| `apps/landing/src/orchestrator/knowledge/seedDocuments.ts` | Reescrever `com-002-elegibilidade` (idade, WhatsApp/Instagram, atividade profissional) | Idade + WhatsApp/Instagram + Atividade profissional |
| `docs/knowledge/COM-002-recrutamento.md` | Nova versão (v1.2) com o mesmo conteúdo corrigido, para manter `seedDocuments.ts` rastreável à sua fonte | Idade + WhatsApp/Instagram + Atividade profissional |
| `apps/landing/src/data/sofia-script.ts` (mesmo arquivo, campo diferente) | Ajustar `question`/`placeholder` de `empresa_atual` (opcional, ver Seção 4) | Atividade profissional (UX) |

Nenhuma migration. Nenhuma alteração em `settings`. Nenhuma alteração em `Objectives.ts`, no Agent Core, no `KnowledgeEngine.ts` (engine em si — só o conteúdo de um documento), no Admin, no `submit-ficha`, no WhatsApp Cloud API, no Meta/CAPI.

---

## 3. Idade — desenho completo

### 3.1 Estado atual (confirmado no código)

- **Client:** `packages/shared/src/schemas.ts:6-10` — `identificacaoSchema.idade = z.coerce.number().int().min(16, "Idade mínima de 16 anos").max(99, ...)`. Aceita 16 e 17.
- **Contrato da Edge Function:** `finalizeCandidatePayloadSchema.idade` (`schemas.ts:44`) = `z.number().int().optional()` — sem `min`/`max`. **Este schema nunca é executado dentro da própria Edge Function** (Deno não importa `@tania-joias/shared`; `finalize-candidate/index.ts` só faz `payload = await req.json()`, sem `.parse()` de nada). Confirmado também que `apps/landing/src/lib/api.ts` só valida a **resposta** (`finalizeCandidateResponseSchema.parse(data)`), nunca a requisição antes de enviar. Ou seja: hoje, **a única validação de idade que existe de fato é a do navegador**, inteiramente contornável por uma chamada HTTP direta à Edge Function.
- **IPR:** `idade` não é lida em nenhum ponto de `calcularIpr`/`decidirStatus`/`classificarPerfil` (`finalize-candidate/index.ts:88-132`). Zero efeito.
- **KnowledgeEngine:** `com-002-elegibilidade` (`seedDocuments.ts:87`) diz "acima de 21 anos" — servido ao vivo pela IA quando `sofia_perguntas_ia_ativa=true` (confirmado ligado em produção).

### 3.2 Correção client-side

`packages/shared/src/schemas.ts:6-10`:

```ts
idade: z.coerce
  .number({ invalid_type_error: "Informe uma idade válida" })
  .int()
  .min(18, "Idade mínima de 18 anos")
  .max(99, "Informe uma idade válida"),
```

Só a mensagem e o número mudam. Nenhuma outra propriedade do schema muda. Isso corrige o formulário da Landing (`sofia-script.ts`, etapa `idade`, usa exatamente `identificacaoSchema.shape.idade`) sem tocar em nenhum outro arquivo.

**Efeito colateral a confirmar com o time:** uma candidata de 16-17 anos que hoje passaria dessa etapa do wizard vai ver o erro de validação **na própria pergunta da idade**, antes mesmo de chegar em "telefone"/"trabalha". Ela nunca chega a `finalize-candidate`, e nenhum lead é criado para ela. Isso é diferente do comportamento de `trabalha=false` (que sempre cria um lead com `status=reprovada`, para registro). Ver Seção 3.4 sobre por que o gate real (que decide se um lead pode ficar `aprovada`) precisa estar no servidor de qualquer forma — o client-side sozinho nunca é suficiente.

### 3.3 Correção server-side — o ponto certo no contrato

Não existe hoje nenhum ponto do lado do servidor que valide qualquer campo do payload contra um schema Zod — todo o arquivo `finalize-candidate/index.ts` usa apenas checagens manuais (`if (!payload?.session_id || ...)`). O padrão já estabelecido neste repositório para regras eliminatórias é o de `trabalha`: uma função pura, chamada dentro de `decidirStatus`/`classificarPerfil`, **antes** de aplicar os thresholds do IPR — não uma validação de schema com erro HTTP 400.

**Decisão de design (consistente com como `trabalha=false` já funciona hoje):** idade abaixo de 18 **não deve ser um erro HTTP** — deve gerar um lead real, com `status="reprovada"`, para registro/histórico (mesmo tratamento que uma candidata que não trabalha já recebe hoje). Rejeitar a requisição inteira (400) esconderia a tentativa de cadastro do time, e mudaria o formato de retorno que o frontend já trata (`FinalizeCandidateResponse`, sempre um lead criado com `status`).

Especificação da função nova, ao lado das existentes (`finalize-candidate/index.ts`, próximo a `calcularIpr`):

```ts
const IDADE_MINIMA = 18

/**
 * Elegibilidade de idade — igual em espírito ao gate de `trabalha`: nunca
 * participa da soma de pontos do IPR, só decide se a candidata pode
 * prosseguir. `idade` ausente ou inválida é tratado como NÃO elegível
 * (fail-closed) — o mesmo raciocínio de segurança que já existe pra
 * `whatsapp`/`instagram` ausentes contarem como 0 pontos, mas aqui aplicado
 * a um gate, não a pontuação.
 */
function isIdadeElegivel(idade: number | undefined): boolean {
  if (idade === undefined || idade === null) return false
  if (!Number.isInteger(idade)) return false
  return idade >= IDADE_MINIMA
}
```

Uso: computar uma única vez, junto com `cidadeAtendida`, antes de chamar `calcularIpr`:

```ts
const idadeElegivel = isIdadeElegivel(payload.idade)
```

— e propagar para `decidirStatus`/`classificarPerfil`/`calcularIpr` como parte de um booleano `elegivel` combinado (ver Seção 5.4, que já cobre `trabalha` + `idade` + `whatsapp` juntos numa única mudança de assinatura, para não editar as mesmas três funções duas vezes).

### 3.4 Comportamento por cenário (idade)

| Cenário | `idade` recebida | Resultado |
|---|---|---|
| 17 anos | `17` | `isIdadeElegivel` → `false` → `elegivel=false` → `status="reprovada"`, `perfil=null`, IPR mostrado como 0 (ver Seção 5.5 sobre zerar o breakdown) |
| 18 anos | `18` | `isIdadeElegivel` → `true` → segue fluxo normal (IPR calculado, thresholds aplicados normalmente) |
| Ausente | `undefined`/`null` | Tratada como **não elegível** (fail-closed) — nunca aprova por falta de informação |
| Inválida (ex.: `-5`, `"abc"` coagido a `NaN`, `2.5`) | qualquer valor não inteiro ou fora de faixa | Tratada como **não elegível** |
| Payload direto para a Edge Function, `idade: 16`, ignorando o frontend | `16` | Bloqueado no servidor (`isIdadeElegivel` roda sempre, independentemente de quem chamou) — **Cenário C do pedido, resolvido** |

**Confirmação explícita pedida:** idade continua **fora da soma de pontos do IPR** (`settings.ipr_pesos` não ganha uma chave `idade`). É elegibilidade, não score — exatamente como especificado.

### 3.5 Comunicação — KnowledgeEngine

`com-002-elegibilidade` (`seedDocuments.ts:87`) e `docs/knowledge/COM-002-recrutamento.md:15` trocam "acima de 21 anos" por "18 anos completos" — ver Seção 6.

---

## 4. Atividade profissional

### 4.1 O que NÃO muda (confirmado)

O gate real já é `trabalha: boolean`, autodeclarado, sem nenhuma lista fechada de profissões, sem exigir CLT, sem exigir `empresa_atual` preenchido com um nome de empresa real (`qualificacaoSchema.empresa_atual = z.string().trim().min(1, ...)` — aceita qualquer texto não vazio, inclusive "Trabalho por conta própria"). **Nenhuma mudança de código é necessária aqui** — o comportamento executável já está certo. O problema é 100% de comunicação.

### 4.2 `SOFIA_REJECTION_LINES` — `apps/landing/src/data/sofia-script.ts:28-31`

Texto atual (verbatim, definido por Antonio, citando `COM-002-recrutamento.md` v1.1):

```
"No momento, um dos requisitos para ser revendedora é estar trabalhando (empresa, escola, hospital) ou atuar como cabeleireira em salão de beleza."
"Por esse motivo, não conseguimos seguir com sua candidatura agora — mas você pode se candidatar novamente assim que essa situação mudar."
```

Proposta de novo texto (mantendo o mesmo tom, a mesma estrutura de 2 linhas, e **sem revelar o racional interno de risco/segurança da consignação**, conforme exigido):

```
"No momento, um dos requisitos para ser revendedora é estar trabalhando ou exercer alguma atividade profissional ativa — seja como funcionária, autônoma, comerciante ou em qualquer outra ocupação real."
"Por esse motivo, não conseguimos seguir com sua candidatura agora — mas você pode se candidatar novamente assim que essa situação mudar."
```

A segunda linha não muda. A primeira substitui a lista fechada de exemplos por uma descrição aberta ("funcionária, autônoma, comerciante ou em qualquer outra ocupação real"), sem citar risco/consignação/segurança. **Esta é uma proposta de texto — a redação final continua sendo decisão do Antonio, dono do texto original.**

### 4.3 `empresa_atual` — placeholder/label (opcional)

`sofia-script.ts:135-145`: pergunta atual é `"Onde você trabalha?"`, placeholder `"Nome da empresa"`. Como o campo aceita qualquer texto, isso é só uma questão de comunicação, não de validação. Proposta (opcional, menor risco, pode ser adiada sem prejuízo do P0 se preferirem mexer no mínimo possível):

```ts
question: "Me conta rapidinho sobre seu trabalho hoje — pode ser empresa, seu próprio negócio, ou atividade autônoma.",
placeholder: "Ex.: nome da empresa, ou 'trabalho por conta própria'",
```

Marcado como **opcional** porque não corrige nenhum comportamento incorreto (o campo já aceita qualquer resposta) — só reduz a chance de uma autônoma hesitar ao ver "Nome da empresa". Se o Antonio preferir não mexer no texto deste passo específico agora, o P0 continua completo sem essa mudança.

---

## 5. WhatsApp obrigatório — análise completa antes da proposta

### 5.1 Mapeamento pedido

| Peça | Papel hoje | Precisa mudar? |
|---|---|---|
| `calcularIpr` (`finalize-candidate/index.ts:88-102`) | Soma `pesos.whatsapp` (10 pts) só se `payload.whatsapp` for truthy; nunca bloqueia | Sim — ver 5.4 |
| `decidirStatus` (`finalize-candidate/index.ts:104-109`) | Só bloqueia por `!trabalha`; thresholds sobre o IPR | Sim — ver 5.4 |
| `classificarPerfil` (`finalize-candidate/index.ts:111-132`) | Mesmo padrão de `decidirStatus` | Sim — ver 5.4 |
| `finalize-candidate` (arquivo completo) | Orquestra tudo acima; dispara Ficha/Meta/WhatsApp automático só se `status==="aprovada"` | Indiretamente — nenhuma lógica nova, só reage a `status` que já vem correto |
| Schema do payload (`schemas.ts`) | `whatsapp: z.boolean().optional()` no contrato da Edge Function; `whatsapp: z.boolean()` (obrigatório) no `qualificacaoSchema` do wizard | Nenhuma mudança de schema necessária — `whatsapp` já é coletado como boolean obrigatório no wizard; o gate é de negócio, não de formato |
| Automações posteriores (Ficha, WhatsApp Cloud API, notificação à Tania) | Só disparam dentro do bloco `if (status === "aprovada")`; o envio de WhatsApp automático já checa `payload.whatsapp === true` (`finalize-candidate/index.ts:394,444`) | **Nenhuma mudança** — essas checagens já existem e ficam redundantes-mas-inofensivas depois do gate (nunca serão falsas dentro desse bloco, porque `status` só chega a "aprovada" com `whatsapp=true`). Não remover o código redundante — ver Seção 8 (não fazer limpeza fora do escopo) |
| Admin (Kanban, aprovação manual) | Move `leads.status` diretamente, fora do IPR | **Fora do escopo desta mudança** — ver 5.6 |
| Ficha de Aprovação | Só é gerada dentro do bloco `status === "aprovada"` | Nenhuma mudança — deixa de ser gerada automaticamente para quem não tinha WhatsApp, porque essas leads não chegam mais a "aprovada" |
| Meta/CAPI | Evento `Lead` só dispara dentro do bloco `status === "aprovada"` | Nenhuma mudança — mesmo raciocínio |
| Testes existentes | Nenhum test runner instalado; convenção é `*.examples.ts` (RFC-007 em diante) — não existe nenhum arquivo de exemplo para `finalize-candidate` hoje (é Deno/Edge Function, fora do padrão de `.examples.ts` do lado do `apps/landing`) | Ver Seção 10 |

### 5.2 Análise matemática — estado atual (sem gate)

Pesos reais (`settings.ipr_pesos`, confirmado via `SELECT` no banco): `trabalha=50, experiencia_vendas=20, whatsapp=10, instagram=10, cidade_atendida=10`. Thresholds (`settings.ipr_thresholds`): `aprovar=80, analise_min=60`.

Com `trabalha=true` (baseline 50 pts), todas as 8 combinações de `{experiência, WhatsApp, Instagram, cidade}` × resultado hoje:

| Experiência (20) | WhatsApp (10) | Instagram (10) | Cidade (10) | IPR hoje | Status hoje |
|---|---|---|---|---|---|
| — | — | — | — | 50 | reprovada |
| ✓ | — | — | — | 70 | em_analise |
| — | ✓ | — | — | 60 | em_analise |
| — | — | ✓ | — | 60 | em_analise |
| — | — | — | ✓ | 60 | em_analise |
| ✓ | ✓ | — | — | 80 | **aprovada** |
| ✓ | — | ✓ | — | 80 | **aprovada** (sem WhatsApp!) |
| ✓ | — | — | ✓ | 80 | **aprovada** (sem WhatsApp!) |
| ✓ | ✓ | ✓ | — | 90 | aprovada |
| — | ✓ | ✓ | — | 70 | em_analise |
| — | — | ✓ | ✓ | 70 | em_analise |
| ✓ | ✓ | — | ✓ | 90 | aprovada |
| ✓ | — | ✓ | ✓ | 90 | aprovada (sem WhatsApp!) |
| — | ✓ | ✓ | ✓ | 80 | aprovada |
| ✓ | ✓ | ✓ | ✓ | 100 | aprovada |

As linhas marcadas "(sem WhatsApp!)" são exatamente o problema: **experiência + qualquer outro item de 10 pontos (Instagram OU cidade) já é suficiente para chegar a 80 e ser aprovada automaticamente sem WhatsApp confirmado**. O lead real encontrado em produção (Seção 9) é precisamente o caso "experiência + Instagram, sem WhatsApp, cidade não bateu" = 80 = aprovada.

### 5.3 Duas abordagens possíveis (apresentadas, não decididas arbitrariamente)

**Abordagem A — gate fora da soma, mesmo padrão de `trabalha` (recomendada).** WhatsApp continua valendo 10 pontos dentro de `calcularIpr` exatamente como hoje — mas agora, como só pode contribuir esses 10 pontos quando `whatsapp=true`, e `whatsapp=true` passa a ser exigido por um gate **antes** de qualquer verificação de threshold, o resultado é: toda candidata que hoje tem `whatsapp=true` continua com **exatamente o mesmo IPR, o mesmo status, o mesmo perfil** que tem hoje — zero mudança matemática pra quem já tem WhatsApp confirmado. Toda candidata com `whatsapp=false` ou ausente passa a ser `"reprovada"` incondicionalmente, **não importa o que mais ela tenha** — igual ao que já acontece com `trabalha=false`. **Nenhuma alteração em `settings.ipr_pesos`/`ipr_thresholds` é necessária.**

**Abordagem B — remover os 10 pontos de WhatsApp da soma (já que agora são garantidos) e não redistribuir.** Isso reduziria o teto real de pontuação de 100 para 90 pontos para toda candidata elegível — o que **muda silenciosamente o significado relativo** de `aprovar>=80`/`analise_min>=60`. Por exemplo, uma candidata com `trabalha+experiência` apenas (hoje 70 pontos com WhatsApp=true incluso, ficando em `em_analise`) passaria a ter só 70 pontos possíveis vindo de (trabalha 50 + experiência 20), sem diferença nesse caso específico — mas uma candidata com `trabalha+experiência+WhatsApp` hoje soma 80 (aprovada); removendo os 10 pontos de WhatsApp do cálculo, ela cairia para 70 (em_analise), **mesmo tendo WhatsApp confirmado** — uma mudança de resultado para quem já está em conformidade, só porque a fórmula mudou de tamanho. Corrigir isso exigiria recalibrar `ipr_thresholds` (ex.: baixar `aprovar` para 70) — uma decisão de negócio nova, fora do escopo desta RFC.

**Conclusão técnica: Abordagem A é a menor mudança segura, matematicamente comprovada acima como neutra para quem já tem WhatsApp, e não exige nenhuma recalibração de `settings`.** Abordagem B é registrada aqui só porque foi pedida explicitamente a análise — **não deve ser implementada sem uma nova decisão de negócio sobre os thresholds**, exatamente como instruído.

### 5.4 Especificação de código — Abordagem A

Consolidando idade (Seção 3) e WhatsApp num único gate combinado, para não editar `decidirStatus`/`classificarPerfil` duas vezes:

```ts
// Substitui o parâmetro `trabalha: boolean` das duas funções abaixo por um
// único booleano `elegivel`, computado uma vez por requisição. Mantém o
// mesmo espírito de "trabalha" — nunca participa da soma de pontos, só
// decide se a candidata pode prosseguir.
const elegivel = payload.trabalha === true && idadeElegivel && payload.whatsapp === true

function decidirStatus(elegivel: boolean, ipr: number, thresholds: IprThresholds) {
  if (!elegivel) return "reprovada" as const
  if (ipr >= thresholds.aprovar) return "aprovada" as const
  if (ipr >= thresholds.analise_min) return "em_analise" as const
  return "reprovada" as const
}

function classificarPerfil(elegivel: boolean, ipr: number, thresholds: IprThresholds) {
  if (!elegivel) return { perfil: null as null, motivo: "" }
  // ...corpo existente inalterado (thresholds aprovar/analise_min)...
}
```

Chamadas (`Deno.serve`, por volta da linha 231-234 hoje):

```ts
const cidadeAtendida = isCidadeAtendida(payload.cidade, cidadesConfig)
const idadeElegivel = isIdadeElegivel(payload.idade)
const elegivel = payload.trabalha === true && idadeElegivel && payload.whatsapp === true
const { total: ipr, breakdown } = calcularIpr(payload, pesos, cidadeAtendida, elegivel)
const status = decidirStatus(elegivel, ipr, thresholds)
const { perfil, motivo } = classificarPerfil(elegivel, ipr, thresholds)
```

### 5.5 `calcularIpr` — zerar o breakdown também para os novos gates (recomendado)

Hoje `calcularIpr` zera tudo só quando `!payload.trabalha` (`finalize-candidate/index.ts:89-92`). Achado importante ao inspecionar a tela de resultado: `ResultScreen.tsx` anima visualmente o número de `result.ipr` (`IprCounter target={result.ipr}`) **antes** de mostrar a mensagem final — inclusive para quem será reprovada. Se o IPR continuar sendo calculado "cheio" (até 100) para uma candidata de 17 anos ou sem WhatsApp que seria reprovada, ela veria o contador animar até um número alto e só depois receber a notícia de reprovação — uma experiência confusa e desnecessária. Por isso, a recomendação é estender a mesma lógica de zerar que já existe para `trabalha`:

```ts
function calcularIpr(payload: Payload, pesos: IprPesos, cidadeAtendida: boolean, elegivel: boolean) {
  if (!elegivel) {
    const zerado = { trabalha: 0, experiencia_vendas: 0, whatsapp: 0, instagram: 0, cidade_atendida: 0 }
    return { total: 0, breakdown: zerado }
  }
  // ...corpo existente inalterado...
}
```

**Isto é uma escolha de design menor, não uma regra de negócio** — a alternativa (manter o IPR "cheio" como valor consultivo/diagnóstico para a equipe, mesmo em candidatas reprovadas por idade/WhatsApp) também é tecnicamente válida e pode ser preferida se o time quiser ver "quanto ela teria pontuado". Recomendação: zerar (consistência com `trabalha` + evita a UX estranha do contador). **Confirmar com Antonio antes de implementar.**

### 5.6 O que este gate NÃO cobre (limite de escopo, para confirmação)

O gate acima é aplicado só dentro de `finalize-candidate` — ou seja, só afeta a **decisão automática do IPR** no momento da candidatura. Ele **não** impede um humano no Admin de mover manualmente uma lead `em_analise`/`reprovada` para `aprovada` via Kanban (drag-and-drop já altera `leads.status` diretamente, fora do IPR, conforme RFC-012 §7) — nem adiciona nenhuma constraint no banco (`CHECK`) que impeça isso a nível de dado. O KI publicado diz "não deve poder chegar ao estado de pré-aprovada/aprovada **pelo IPR**" — interpretado aqui como cobrindo só o caminho automático. **Pergunta em aberto para Antonio:** a equipe deveria continuar podendo aprovar manualmente uma candidata sem WhatsApp confirmado (ex.: ela forneceu outro contato depois), ou isso também deveria ser bloqueado a nível de banco? Esta RFC não assume uma resposta — fica registrada como decisão pendente, fora do menor-fix proposto.

### 5.7 `gerarResumo` — texto interno (Admin)

Hoje só distingue `!payload.trabalha`. Proposta de extensão, mesmo padrão:

```ts
function gerarResumo(payload: Payload, elegivel: boolean, idadeElegivel: boolean, perfil: ...) {
  const primeiroNome = payload.nome.split(" ")[0]
  if (!payload.trabalha) {
    return `${primeiroNome} respondeu que não está trabalhando atualmente. Cadastro salvo para futuras oportunidades da Tania Joias.`
  }
  if (!idadeElegivel) {
    return `${primeiroNome} informou ${payload.idade ?? "idade não informada"} — abaixo da idade mínima de 18 anos. Cadastro salvo para futuras oportunidades.`
  }
  if (!payload.whatsapp) {
    return `${primeiroNome} trabalha, mas informou não ter WhatsApp no telefone cadastrado — canal de contato obrigatório não confirmado. Cadastro salvo para futuras oportunidades.`
  }
  // ...corpo existente inalterado...
}
```

Texto interno (visto só no Admin, `resumo_ia`), não é a mensagem que a candidata vê — pode ser ajustado livremente sem aprovação de redação do Antonio, mas incluído aqui para completude da especificação.

---

## 6. Instagram opcional

**Nenhuma mudança de código.** Confirmado na RFC-005: `instagram` já soma 10/100 pontos sem nunca bloquear — o comportamento executável já está certo. O único problema é comunicação, resolvido junto com idade e atividade profissional na correção do `com-002-elegibilidade` (Seção 7). A pergunta em si (`sofia-script.ts:169-192`, "Você possui Instagram?" → "@usuário" condicional) permanece exatamente como está — não deve ser removida.

---

## 7. KnowledgeEngine — correção de `com-002-elegibilidade`

### 7.1 Texto atual (`seedDocuments.ts:83-95`, `versao: 2`)

```
"Para se tornar revendedora da Tania Joias é necessário: ser mulher, acima de 21 anos; morar em Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo ou São Caetano do Sul; ter WhatsApp e Instagram; e estar trabalhando — em uma empresa, escola ou hospital, ou ser cabeleireira atuando em salão de beleza."
```

### 7.2 Proposta de texto corrigido (`versao: 3`)

```
"Para se tornar revendedora da Tania Joias é necessário: ter 18 anos completos ou mais; morar em Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo ou São Caetano do Sul; ter WhatsApp (Instagram é bem-vindo, mas não obrigatório); e estar trabalhando ou exercer alguma atividade profissional ativa — pode ser como funcionária, autônoma, comerciante ou em qualquer outra ocupação real."
```

Mudanças pontuais: "acima de 21 anos" → "18 anos completos ou mais"; "ter WhatsApp e Instagram" → "ter WhatsApp (Instagram é bem-vindo, mas não obrigatório)"; "empresa, escola ou hospital, ou ser cabeleireira" → "funcionária, autônoma, comerciante ou em qualquer outra ocupação real". **Removido também "ser mulher"** — este critério não está entre os 4 KIs em correção nesta RFC (não foi mencionado no pedido, e o RFC-005 já havia registrado como "nunca verificado pelo sistema, tema sensível, precisa do dono") — **mantido como está por padrão, marcado como fora de escopo desta RFC** (ver observação abaixo). `palavrasChave` (`seedDocuments.ts:89`) não precisa mudar — continuam batendo com as mesmas perguntas.

**Observação sobre "ser mulher":** o KI publicado sobre idade e o pedido desta RFC não mencionam gênero. Esta RFC **não decide** se "ser mulher" deve continuar no texto — não é uma das 4 verdades em correção aqui. Se o texto for atualizado, recomenda-se decidir esse ponto junto (deixá-lo, removê-lo, ou registrar como pendência formal), mas isso é uma decisão do Antonio, não assumida por esta especificação.

### 7.3 `docs/knowledge/COM-002-recrutamento.md` — nova versão v1.2

O arquivo fonte (`.md`) deve ser atualizado em paralelo ao `seedDocuments.ts`, seguindo a própria convenção do documento ("qualquer alteração numérica deve ser... versionada, conforme o padrão de Explainability já seguido no projeto" — nota de manutenção do `COM-001`). Proposta de cabeçalho:

```
Versão: 1.2 (correção: idade mínima 18 anos [não 21]; WhatsApp obrigatório, Instagram opcional [não ambos obrigatórios]; atividade profissional ampliada para autônoma/comerciante/qualquer ocupação real [não restrita a empresa/escola/hospital/cabeleireira] — alinhado ao Knowledge Layer oficial, RFC-INTELLIGENCE-005/006)
Revisado por: Antonio (proprietário) — PENDENTE DE APROVAÇÃO FINAL DO TEXTO
```

A seção "Critério de reprovação (uso interno)" **permanece inalterada** — já está correta (não expõe racional interno) e fora do escopo desta correção.

### 7.4 O que NÃO muda no KnowledgeEngine

Nenhuma mudança em `KnowledgeEngine.ts` (a classe de busca em si), `KnowledgeRepository.ts`, `extractKeywords.ts`, nem nos outros 7 documentos (`com-001-*`, `com-002-processo-candidatura`, `com-003-*`, `com-004-*`) — todos já corretos conforme RFC-005. **Não integrar o Knowledge Layer oficial (`consiggold-v2`) diretamente** — essa substituição fica para o futuro Knowledge Service, fora do escopo desta implementação P0.

---

## 8. Fora de escopo — reafirmado

Nenhuma mudança nesta RFC toca: cidade como score vs. gate; Footer "todo o Brasil"/"todo o ABCD"; prazo de ~30 dias; faixas de ganho em R$ da Landing; `PROFISSOES_PREFERIDAS`; `RFC-013`/`RFC-013.1`; `estabilidade_profissional`; o Agent Core shadow (`IntentClassifier`/`DecisionEngine`/`Objectives`/`Planner`/`ActionEngine`/`SofiaOrchestrator`/`AgentRegistry`/`AgentFactory`/`AgentRuntime`/`KnowledgeTool`/`ToolEngine`); Knowledge Service; ConsigGold; peça faltante. Nenhum desses arquivos aparece em nenhuma das seções 3-7 acima.

---

## 9. Cenários de aceitação

| Cenário | Entrada | Resultado esperado |
|---|---|---|
| **A** | 17 anos, `trabalha=true`, `whatsapp=true`, experiência, Instagram, cidade atendida (tudo "perfeito" exceto idade) | `elegivel=false` (idade) → `status="reprovada"`, `perfil=null`. **Não pode ser aprovada.** |
| **B** | 18 anos, `trabalha=true`, demais critérios suficientes para IPR≥80 (ex.: experiência+WhatsApp+Instagram) | `elegivel=true` → segue fluxo normal → `status="aprovada"` |
| **C** | Payload HTTP direto para `finalize-candidate` (sem passar pelo wizard/client), `idade=16`, resto "perfeito" | `isIdadeElegivel(16)=false` → `elegivel=false` → `status="reprovada"`, independentemente de quem/como chamou a API |
| **D** | `trabalha=true`, `empresa_atual="Trabalho por conta própria"`, resto suficiente | `empresa_atual` nunca participa de `calcularIpr`/gate — não é rejeitada por isso; se demais critérios batem, segue elegível normalmente |
| **E** | `trabalha=true`, `profissao="Manicure"`, `empresa_atual="Autônoma"`, resto suficiente | Mesma lógica de D — `profissao` também nunca participa da decisão; elegível se `elegivel=true` e IPR bate o threshold |
| **F** | `trabalha=true`, `whatsapp=false`, experiência+Instagram+cidade (IPR que hoje chegaria a 90) | `elegivel=false` (whatsapp) → `status="reprovada"` — **não pode ser pré-aprovada**, mesmo com IPR alto nos demais critérios |
| **G** | `trabalha=true`, `whatsapp=true`, sem Instagram, demais suficientes para ≥80 (ex.: experiência+cidade) | `elegivel=true` (Instagram não é gate) → segue elegível normalmente |
| **H** | Candidata pergunta à Sofia "preciso ter Instagram?" | `KnowledgeEngine` encontra `com-002-elegibilidade` (v3) → IA responde com base no texto corrigido → resposta deve comunicar que Instagram não é obrigatório |
| **I** | Candidata pergunta "qual a idade mínima?" | Mesma fonte corrigida → resposta deve dizer 18 anos, nunca 21 |
| **J** | Candidata pergunta "autônoma pode participar?" | Mesma fonte corrigida → resposta deve deixar claro que atividade profissional autônoma conta |

Observação sobre H/I/J: como a resposta final é gerada por IA (Claude Haiku) a partir do documento, e não é um texto fixo, o teste real desses três cenários precisa ser um "cenário executável" (ver Seção 10) que verifica que o **documento correto foi encontrado e passado à IA** — não pode garantir palavra por palavra o que a IA vai responder, só que a base de conhecimento usada está certa. Isso já é o mesmo padrão usado hoje em `answerCandidateQuestion.examples.ts`.

---

## 10. Testes — convenção existente e o que propor

**Levantamento da suíte atual:** confirmado — **não existe test runner instalado** (nem Vitest, nem Jest) em nenhum `package.json` do monorepo. A convenção real (RFC-007 em diante, citada em `PROJECT_STATUS.md:69` e em comentários de `*.examples.ts`) é escrever "cenários executáveis": funções `runXxxExamples()` que chamam a função real com casos concretos e mostram a saída, rodadas manualmente (`npx tsx` ou similar) ou via um dev-only runner no navegador. Não introduzir Vitest/Jest agora seria a menor mudança — mas isso é uma limitação conhecida do projeto, não desta RFC.

**Propostas de cenários (não escritos ainda, só especificados):**

1. **`supabase/functions/finalize-candidate/finalize-candidate.examples.ts`** (arquivo novo, mesmo padrão dos `.examples.ts` já existentes, adaptado pro lado Deno — ou um script standalone tipo `demo-feature-003.ts` se o padrão `.examples.ts` não for diretamente portável pro runtime Deno das Edge Functions): casos A-G da Seção 9, chamando `calcularIpr`/`decidirStatus`/`classificarPerfil`/`isIdadeElegivel` diretamente (funções puras, fáceis de testar isoladamente sem subir a Edge Function inteira).
2. **`packages/shared/src/schemas.test-scenarios.ts`** (ou nome equivalente ao padrão do repo): `identificacaoSchema.idade` aceita 18, rejeita 17, rejeita "abc", rejeita 200.
3. Extensão de `apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.examples.ts`: 3 novos casos (H, I, J da Seção 9) usando o `com-002-elegibilidade` v3 como fixture, confirmando que `KnowledgeEngine.searchByQuestion()` encontra o documento certo e que o texto passado à IA não contém mais "21 anos" nem "Instagram" como obrigatório.
4. **Regressão do funil completo:** re-rodar os cenários já existentes de `answerCandidateQuestion.examples.ts`/`classifyForFeature004.examples.ts`/`composer.examples.ts` sem modificação, pra confirmar que nada nesta mudança quebra o que já passava.

Nenhum desses arquivos foi criado nesta sessão — são a especificação do que criar quando a implementação for autorizada.

---

## 11. Compatibilidade com leads existentes (somente leitura)

Consultas `SELECT` executadas no Supabase real (`tania-joias-crm`) nesta sessão:

```sql
select count(*) filter (where idade is not null and idade < 18) as leads_idade_menor_18,
       count(*) filter (where idade in (16,17)) as leads_idade_16_17,
       count(*) filter (where whatsapp = false) as leads_whatsapp_false,
       count(*) filter (where whatsapp is null) as leads_whatsapp_null,
       count(*) filter (where whatsapp = false and status = 'aprovada') as aprovadas_sem_whatsapp
from leads;
```

**Resultado real (2026-08-16, 46 leads no total):**

- `leads_idade_menor_18 = 0` — **nenhum lead histórico com idade abaixo de 18.** Não há remediação retroativa de idade a decidir.
- `leads_idade_16_17 = 0` — idem.
- `leads_whatsapp_false = 1`.
- `leads_whatsapp_null = 14` — provavelmente leads antigos, anteriores à existência do campo, ou casos de `trabalha=false` (etapa pulada).
- `aprovadas_sem_whatsapp = 1` — **exatamente 1 lead real, já `status="aprovada"`, `IPR=80`, sem WhatsApp confirmado:**

```
nome: Paulicéia do nascimento | idade: 54 | trabalha: true | whatsapp: false
instagram: pauliceian583@gmail.com | cidade: "Santo André São Paulo" | ipr: 80
status: aprovada | etapa_pos_aprovacao: null | criada em: 2026-08-02
```

Esta lead é a prova viva do gap matemático da Seção 5.2 (experiência + Instagram = 80, sem WhatsApp). `etapa_pos_aprovacao: null` indica que ela ainda não avançou no funil pós-aprovação.

**Recomendação (não executada):** esta RFC **não altera nenhum lead retroativamente**. A nova regra de `finalize-candidate` só vale para candidaturas novas a partir do deploy. Recomenda-se que Antonio/Tania decidam explicitamente o que fazer com esta 1 lead específica: (a) deixá-la como está (ela já foi aprovada sob a regra antiga, tratada como exceção histórica); (b) reclassificá-la manualmente para revisão, dado que WhatsApp é o canal usado por toda a automação pós-aprovação (ela pode estar com o fluxo de Ficha/notificação quebrado agora mesmo, independente desta RFC). Nenhuma ação sobre este lead deve ser tomada sem essa decisão.

Nenhum outro lead (`em_analise`, ou ainda no funil) tem `idade<18` ou `whatsapp=false` além do caso acima.

---

## 12. Necessidade de migration / `settings`

**Nenhuma.** Nenhuma coluna nova é necessária (`idade` e `whatsapp` já existem na tabela `leads`). Nenhuma chave nova em `settings` (os gates de idade e WhatsApp são hardcoded no código, no mesmo padrão que o gate de `trabalha` já é hoje — não configurável via `settings`, por consistência arquitetural com o que já existe, evitando criar um precedente de "alguns gates são configuráveis, outros não" sem necessidade). `settings.ipr_pesos`/`ipr_thresholds` **não mudam** (Abordagem A, Seção 5.3).

---

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Uma candidata de 16-17 anos que hoje conseguia terminar o cadastro passa a ser barrada já na 3ª pergunta (client-side) — sem nem gerar um lead de registro | Aceitável e intencional (mesma proteção de qualquer formulário com idade mínima); o servidor cobre quem contornar o client de qualquer forma |
| A lead histórica sem WhatsApp (Seção 11) já está `aprovada` — a mudança de código não a afeta retroativamente, mas o time pode presumir erroneamente que ela "não deveria mais existir" | Documentado explicitamente na Seção 11; decisão de negócio, não técnica |
| Zerar o IPR (Seção 5.5) para candidatas inelegíveis por idade/WhatsApp muda o que aparece no Admin (`ipr_breakdown`) comparado a hoje | Escolha reversível e isolada — se o time preferir manter o IPR "cheio" como diagnóstico, é só não aplicar essa parte específica (Seção 5.5 é marcada como recomendação, não obrigatória) |
| Qualquer erro na condição combinada `elegivel = trabalha && idade && whatsapp` (ex.: trocar `&&` por `||` por engano) reprovaria/aprovaria em massa de forma errada | Mitigado pelos cenários de teste da Seção 9 (A-G cobrem todas as combinações de gate) antes de qualquer deploy |
| Textos novos (`SOFIA_REJECTION_LINES`, `com-002-elegibilidade`) ainda não têm aprovação final de redação do Antonio | Marcados explicitamente como "proposta" nesta RFC — não implementar a redação até aprovação |
| `com-002-elegibilidade` remove "ser mulher" do texto sem uma decisão explícita sobre esse ponto | Sinalizado como fora de escopo na Seção 7.2 — decisão separada do Antonio antes de aplicar |

---

## 14. Rollback

- **Validação server-side de idade:** reverter para a versão anterior de `decidirStatus`/`classificarPerfil`/`calcularIpr` (sem os parâmetros de `elegivel`/`idadeElegivel`) — mudança isolada em um único arquivo (`finalize-candidate/index.ts`), sem dependência de dado (nenhum dado foi migrado). Reverter = redeploy da versão anterior da Edge Function.
- **Hard gate de WhatsApp:** mesma observação — está na mesma função/arquivo, mesmo redeploy reverte os dois juntos ou separadamente (são a mesma mudança de assinatura, ver Seção 5.4). Se quiser reverter só o WhatsApp e manter idade (ou vice-versa), basta remover um dos termos do `&&` em `elegivel` antes de redeployar.
- **Textos do KnowledgeEngine:** `seedDocuments.ts` é um array estático em memória, sem persistência em banco — reverter é trocar a string de volta e re-buildar/redeployar a Landing. Nenhum dado histórico é afetado (o `KnowledgeEngine` não grava nada, só responde perguntas em tempo real).
- Em nenhum dos três casos há necessidade de rollback de migration (porque nenhuma migration é criada) nem de dado (porque nenhum lead é alterado retroativamente).

---

## 15. Ordem de implementação — validada contra o código real

A ordem sugerida no pedido original é boa em espírito, mas a ordem tecnicamente mais segura, dado que idade e WhatsApp acabam sendo a mesma mudança de assinatura de função (`elegivel`), é fazer as duas juntas em vez de em dois passes separados:

1. **Escrever os cenários de teste (Seção 9/10) primeiro**, contra o comportamento atual — eles devem falhar antes da mudança (comprovando que o gap existe) e passar depois.
2. **Corrigir os textos/conhecimento primeiro** (`SOFIA_REJECTION_LINES`, `com-002-elegibilidade`, `COM-002-recrutamento.md`) — não depende de nenhuma mudança de código/servidor, é seguro isoladamente, e já resolve sozinho a comunicação incorreta (Seções 4, 6, 7) enquanto o resto é implementado.
3. **Corrigir idade client-side** (`schemas.ts`, `.min(16)→.min(18)`) — mudança isolada, sem dependência do servidor.
4. **Adicionar `isIdadeElegivel` + gate de WhatsApp juntos em `finalize-candidate`** (Seções 3.3, 5.4, 5.5, 5.7) — é a mesma mudança de assinatura (`elegivel`), faz sentido implementar e testar como uma unidade, não em dois deploys separados da mesma função.
5. **Rodar os cenários da Seção 9 (A-J) contra a implementação** — confirmar que nenhum caso hoje aprovado com WhatsApp muda de resultado (a prova matemática da Seção 5.2/5.3 deve bater 1:1 com o comportamento observado).
6. **Regressão completa** dos `.examples.ts` já existentes (`answerCandidateQuestion`, `classifyForFeature004`, `composer`) — confirmar zero efeito colateral fora do escopo.
7. **Deploy controlado** — primeiro a Edge Function (`finalize-candidate`), depois a Landing (textos + client-schema) — nessa ordem, porque uma Edge Function mais rígida com uma Landing ainda não atualizada é seguro (só rejeita menos 16/17 anos e sem-WhatsApp um pouco antes do esperado no client, sem quebrar nada); a ordem inversa (Landing nova apontando pra Edge Function antiga) deixaria a validação de 18 anos existir só no client, recriando o gap client-only durante a janela do deploy.

Esta é uma pequena correção sobre a ordem original proposta (juntar os passos 3 e 4 do pedido em um só passo 4 aqui) — sinalizada porque idade e WhatsApp compartilham a mesma função/assinatura no código real, e separá-los em dois deploys geraria um estado intermediário estranho (`elegivel` parcialmente implementado) sem benefício real.

---

## 16. Relatório final

1. **Caminho da RFC criada:** [docs/rfc/RFC-INTELLIGENCE-006-correcoes-p0-cerebro-captacao-sofia.md](docs/rfc/RFC-INTELLIGENCE-006-correcoes-p0-cerebro-captacao-sofia.md)
2. **Arquivos que precisarão ser alterados:** `packages/shared/src/schemas.ts`; `supabase/functions/finalize-candidate/index.ts`; `apps/landing/src/data/sofia-script.ts` (`SOFIA_REJECTION_LINES` e, opcionalmente, `empresa_atual`); `apps/landing/src/orchestrator/knowledge/seedDocuments.ts` (`com-002-elegibilidade`); `docs/knowledge/COM-002-recrutamento.md` (nova versão v1.2) — ver Seção 2.
3. **Solução proposta para idade:** `identificacaoSchema.idade` passa a exigir mínimo 18 (Seção 3.2).
4. **Solução server-side para idade:** nova função `isIdadeElegivel()` dentro de `finalize-candidate/index.ts`, usada como gate (não como pontuação) em `decidirStatus`/`classificarPerfil`; idade ausente/inválida tratada como não elegível, fail-closed (Seção 3.3/3.4).
5. **Solução para atividade profissional:** nenhuma mudança de código (gate `trabalha` já é correto e amplo); só reescrita de `SOFIA_REJECTION_LINES` e `com-002-elegibilidade` (Seção 4).
6. **Solução para WhatsApp obrigatório:** gate combinado `elegivel = trabalha && idadeElegivel && whatsapp`, mesmo padrão que `trabalha` já usa hoje; os 10 pontos de WhatsApp permanecem no IPR sem mudança (Abordagem A) — nenhuma recalibração de `settings` necessária (Seção 5).
7. **Análise matemática do IPR após WhatsApp virar gate:** tabela completa das 8 combinações de {experiência, WhatsApp, Instagram, cidade} na Seção 5.2; prova de que a Abordagem A não altera o resultado de nenhuma candidata que já tem WhatsApp confirmado, e reprova todas as que hoje seriam aprovadas/em análise sem ele (Seção 5.3).
8. **Solução para Instagram:** nenhuma mudança de código; já está correto — só corrigir a comunicação junto com idade/atividade profissional no `com-002-elegibilidade` (Seção 6/7).
9. **Alterações propostas no KnowledgeEngine:** só o conteúdo de `com-002-elegibilidade` (versão 2 → 3) e seu `.md` fonte — nenhuma mudança na classe `KnowledgeEngine` nem nos outros 7 documentos (Seção 7).
10. **Cenários de teste:** 10 cenários (A-J) especificados na Seção 9, mapeados para arquivos `.examples.ts` a criar/estender na Seção 10 — nenhum escrito ainda.
11. **Impacto em leads existentes:** 0 leads com idade <18; exatamente 1 lead real já `aprovada` sem WhatsApp confirmado (`Paulicéia do nascimento`, IPR=80) — decisão sobre esse caso específico fica pendente com Antonio/Tania; nenhuma alteração retroativa proposta (Seção 11).
12. **Necessidade de migration:** nenhuma.
13. **Necessidade de alterar `settings`:** nenhuma.
14. **Riscos:** ver tabela completa na Seção 13 — o mais relevante é a lead histórica sem WhatsApp já aprovada, e a escolha de design (não obrigatória) de zerar o IPR para inelegíveis.
15. **Rollback:** mudanças concentradas em funções puras de um único arquivo (`finalize-candidate/index.ts`) e em constantes de texto sem persistência (`seedDocuments.ts`) — reversível por redeploy simples, sem dado a reverter (Seção 14).
16. **Ordem de implementação:** 7 passos, com uma correção pontual sobre a ordem sugerida no pedido (unificar as correções de idade e WhatsApp server-side num único passo, porque compartilham a mesma assinatura de função) — Seção 15.
17. **Arquivos realmente alterados nesta tarefa:** um único arquivo criado — este documento (`RFC-INTELLIGENCE-006-correcoes-p0-cerebro-captacao-sofia.md`). Nenhum arquivo de código, schema, configuração ou documentação existente foi modificado.
18. **Confirmação de nenhuma implementação:** confirmado — nenhuma das mudanças especificadas nas Seções 3-7 foi aplicada a nenhum arquivo real. Todas as consultas ao Supabase (`tania-joias-crm`) foram `SELECT` read-only.
19. **Bloqueadores/decisões ainda necessárias de Antonio Carlos:** (a) aprovar a redação final de `SOFIA_REJECTION_LINES` e `com-002-elegibilidade` (Seções 4.2, 7.2); (b) decidir se "ser mulher" deve continuar ou sair do texto de elegibilidade (Seção 7.2, fora do escopo original das 4 verdades); (c) decidir o que fazer com a lead histórica sem WhatsApp já aprovada (Seção 11); (d) confirmar se o gate de WhatsApp/idade deve valer só para a decisão automática do IPR ou também impedir aprovação manual no Admin (Seção 5.6); (e) confirmar se o IPR deve ser zerado (0) ou mantido "cheio" como diagnóstico para candidatas inelegíveis por idade/WhatsApp (Seção 5.5).
20. **Próximo passo recomendado (não executado):** com as 5 decisões pendentes do item 19 resolvidas por Antonio, implementar na ordem da Seção 15 — começando pelos cenários de teste (passo 1) e pela correção de textos (passo 2), que são as duas partes desta especificação com menor risco e nenhuma dependência entre si, antes de tocar em `finalize-candidate`.
