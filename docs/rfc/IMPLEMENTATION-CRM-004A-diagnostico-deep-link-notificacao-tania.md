# IMPLEMENTATION-CRM-004A — Diagnóstico: deep link + notificação WhatsApp pra Tania

Fase 1 (diagnóstico + especificação). **Nada foi implementado, alterado no
banco, ou enviado por WhatsApp nesta tarefa.** Auditoria feita lendo o código
real do Admin (`apps/admin`), das Edge Functions (`supabase/functions`) e das
migrations (`supabase/migrations`).

## Resumo pra Tania (sem termos técnicos)

Boa notícia: **grande parte do que você pediu já existe e já funciona.**

- A tela de análise da candidata (nome, cidade, WhatsApp, Etapa 1, Etapa 2
  com endereço/referências/mapa) já existe pronta — é o mesmo painel lateral
  que abre hoje quando você clica num card do Kanban.
- Os botões "Tania aprovou" / "Tania recusou" já existem dentro dessa tela.
- A coluna "Aguardando aprovação da Tania" já existe no Kanban.
- Já existe até uma notificação automática por WhatsApp pra você quando a
  Ficha é preenchida — mas ela usa **mensagem de texto livre**, que só
  funciona se você tiver mandado mensagem pro número oficial nas últimas 24h.
  Trocar isso por um "modelo aprovado pela Meta" (o Utility Template que você
  pediu) resolve esse problema e é o que falta pra sua ideia funcionar de
  verdade a qualquer hora.
- O que **não existe ainda**: o link direto (clicar na notificação e cair
  named naquela candidata). Hoje você sempre cai na tela genérica e precisa
  procurar o card.
- Encontrei um número de WhatsApp seu **desatualizado, hardcoded em 3 lugares
  do código** (`11967660123`) — meu diagnóstico item 11 detalha isso. Precisa
  ser trocado pelo certo (`5511946370390`) e, de preferência, parar de ficar
  "grudado" no código.

Segue o relatório técnico completo, respondendo às 26 perguntas pedidas.

---

## 1. Deep link é possível hoje?

**Não, hoje não existe.** Auditei `apps/admin/src/App.tsx` — as únicas rotas
são `/login`, `/` (Dashboard), `/leads`, `/crm`, `/relatorios`, `/radar`,
`/abandonos`, `/configuracoes`. Não há `/leads/:id` nem `?lead=`.

`CrmPage.tsx` e `LeadsPage.tsx` guardam qual candidata está aberta num
`useState<string | null>(null)` local (`selectedLeadId`), nunca sincronizado
com a URL. Ou seja: hoje é fisicamente impossível abrir o Admin numa URL e já
cair com o Drawer de uma candidata específica aberto — sempre cai na lista/Kanban
e exige clique manual.

## 2. URL recomendada

`https://tania-joias-admin.vercel.app/crm?lead={lead_id}`

Query param, não path param. Reaproveita a `CrmPage` (que já tem Kanban de
fundo + `LeadDetailDrawer`) em vez de criar uma rota/tela nova só pra isso.

## 3. Precisa alterar roteamento?

Mudança pequena, não uma rota nova: `CrmPage.tsx` passa a ler
`useSearchParams()` do `react-router-dom` (já é dependência do projeto) e usa
o valor de `lead` pra inicializar `selectedLeadId` num `useEffect` no mount.
Não precisa de `<Route path="leads/:id">` nem duplicar tela.

## 4. Login preserva o destino?

**Parcialmente — tem um bug real que quebra exatamente o deep link.**

- `ProtectedRoute.tsx` já faz o redirect certo: `<Navigate to="/login" state={{ from: location }} />` — `location` aqui é o objeto completo do react-router (inclui `pathname` **e** `search`, ou seja, `?lead=xxx` está preservado nesse ponto).
- Mas `LoginPage.tsx:21` faz:
  ```ts
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/"
  return <Navigate to={from} replace />
  ```
  Ele pega **só `.pathname`**, descarta `.search`. Resultado: hoje, se a Tania
  não estiver logada e abrir `/crm?lead=abc123`, o login funciona mas ela cai
  em `/crm` puro (sem `?lead=`) — exatamente o comportamento que o RFC pediu
  pra evitar ("não pode fazer login e depois jogar a Tania na home genérica").

**Correção necessária (1 linha, UI_ONLY):** usar `from.pathname + from.search`
(ou navegar com o objeto `from` completo em vez de só a string do pathname).

## 5. Como abrir diretamente o Drawer da candidata?

Em `CrmPage.tsx`: ler `searchParams.get("lead")` e usar pra inicializar (ou
setar via `useEffect`) o `selectedLeadId` que já é passado pro
`LeadDetailDrawer` existente. O Drawer já busca os dados via `useLead(id)` —
nenhuma mudança necessária nele pra "abrir direto".

## 6. Dados da Etapa 1 já disponíveis na tela?

**Sim, tudo já está no `LeadDetailDrawer.tsx`:** nome, telefone/WhatsApp,
cidade, data de cadastro, análise da Sofia, perfil comercial, resumo da IA,
IPR (com breakdown), estabilidade profissional, e o histórico completo de
respostas do formulário.

## 7. Dados da Etapa 2 já disponíveis?

**Sim.** `FichaAprovacaoSection.tsx` já renderiza (lendo `leads_ficha` via
`useLeadFicha`): endereço/número/bairro/cidade/CEP, nome do pai, nome da mãe,
trabalho atual (endereço+telefone), cônjuge (se houver, com trabalho dele),
3 referências familiares, referência comercial, e link pro Google Maps. Só
aparece quando `lead.status === "aprovada"` — que é sempre o caso quando a
Ficha existe.

## 8. O que precisa mudar na UI?

- Ler `?lead=` e pré-abrir o Drawer (novo).
- Corrigir o bug do item 4 no `LoginPage.tsx` (preservar query string).
- **Achado importante de UX**: o Drawer hoje tem **dois pares de botões de
  aprovação diferentes**, que fazem coisas diferentes:
  - Rodapé do Drawer: "Aprovar" / "Reprovar" → mexe em `lead.status`
    (aprovada/reprovada). É a aprovação da **Etapa 1** (antes da Ficha).
  - Dentro de "Aprovação final da Tania" (`TaniaAprovacaoSection`): "Tania
    aprovou" / "Tania recusou" → mexe em `etapa_pos_aprovacao`
    (ativa/desistiu). É a decisão **final**, depois da Ficha — a que este RFC
    descreve.
  Quando a notificação chegar pra Tania, a lead já está em `status=aprovada`
  (Etapa 1 já passou), então os botões do rodapé ficam desabilitados/irrelevantes
  e só os botões de dentro de "Aprovação final da Tania" importam. Isso já
  funciona corretamente hoje, mas pode confundir visualmente — vale considerar
  esconder o rodapé genérico quando a tela é aberta via este deep link
  específico, decisão de UI a validar na implementação.
- Tudo o mais (ordem de seções, tamanho de botão, campos mostrados) já
  atende ao que o RFC pediu.

## 9. Botão "Falar com candidata" pode reutilizar helper atual?

**Sim, sem nenhuma mudança.** `whatsappLinkWithMessage()`
(`apps/admin/src/lib/format.ts:56`) já existe e já é usado em 3 lugares
(`KanbanCard.tsx`, `FichaAprovacaoSection.tsx`, `TaniaAprovacaoSection.tsx`).
Ele monta `https://wa.me/{telefone}?text={mensagem}` e abre em nova aba — é
literalmente o comportamento pedido no item 4 do RFC (ação manual, a Tania
ainda clica "Enviar" dentro do WhatsApp).

## 10. Mensagem sugerida

Não encontrei nenhuma mensagem "Tania fala com a candidata" já aprovada em
uso no código — é nova. A sugerida no RFC:

> "Oi, {primeiro_nome}! Aqui é a Tania, da Tania Joias. Estou analisando seu
> cadastro para revendedora e gostaria de falar rapidinho com você."

pode ser adotada como está.

## 11. Número correto da Tania confirmado

`5511946370390` (definido pela Tania nesta tarefa).

**Achado crítico:** o número **hoje hardcoded no código é outro, antigo**
(`11967660123` / `5511967660123`), presente em **3 lugares diferentes**:

| Arquivo | Linha | Formato usado |
|---|---|---|
| `apps/admin/src/components/leads/TaniaAprovacaoSection.tsx` | 14 | `"11967660123"` (sem DDI, usado no `wa.me`) |
| `supabase/functions/submit-ficha/index.ts` | 21 | `"5511967660123"` (com DDI 55, usado na Cloud API) |
| `apps/admin/api/webhooks/whatsapp.mjs` | 12 | `'5511967660123'` (com DDI 55, usado pra **validar quem está respondendo** no webhook) |

Os 3 comentários no código confirmam explicitamente que se referem ao "mesmo
número" — então é seguro assumir que os 3 precisam do mesmo valor novo.

**Atenção especial ao 3º**: em `whatsapp.mjs`, `TANIA_TELEFONE` não é usado
pra *enviar* mensagem — é usado em `processarDecisaoTania()` pra checar
`message.from !== TANIA_TELEFONE`, isto é, **só aceita decisão por WhatsApp
(responder "sim"/"não" em texto livre) se vier exatamente desse número**. Se
o número for trocado só nos outros 2 lugares e esquecido aqui, a Tania perde
a via de decidir pelo chat de texto (o fluxo por botão no Admin continua
funcionando normalmente, é independente).

## 12. Onde configurar o número

Como pedido, não deve continuar hardcoded em 3 lugares. Menor solução segura,
respeitando que são 2 runtimes diferentes (Supabase Edge Functions em Deno, e
uma função serverless da Vercel em Node) que **não compartilham código**:

- **`submit-ficha` (e qualquer function nova de notificação):** Edge Function
  secret no Supabase, seguindo a convenção já usada no projeto
  (`WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APPROVAL_TEMPLATE_NAME` etc.) →
  **`TANIA_WHATSAPP_NOTIFICATION_NUMBER`**.
- **`apps/admin/api/webhooks/whatsapp.mjs` (Vercel):** env var da Vercel,
  mesmo padrão dos outros usos de `process.env` nesse arquivo
  (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` etc.) →
  **`TANIA_WHATSAPP_NUMBER`**.
- **`TaniaAprovacaoSection.tsx` (frontend/browser):** este número **não é
  secreto** (é só o destino de um link `wa.me`, visível em texto puro na URL
  de qualquer forma) — mas pra não virar uma 4ª fonte de verdade divergente,
  o ideal é buscar da tabela `settings` (mesmo padrão já usado por
  `whatsapp_notificacao_tania_ativa` e as outras flags, lido via
  `useSettings.ts` e editável em `SettingsPage.tsx`). Isso também permite
  trocar o número no futuro sem precisar de deploy.

Resultado: 1 valor lógico, 3 mecanismos de configuração (2 secrets de
servidor + 1 setting de banco), nenhum token/secret exposto no browser.

## 13/14/15/16/17. Template Utility recomendado — texto — variáveis — botão — URL do botão

**Não criado nesta tarefa** (conforme instrução). Proposta pra aprovação
futura, seguindo a convenção de nomes já usada (`WHATSAPP_APPROVAL_TEMPLATE_NAME`,
`WHATSAPP_FICHA_TEMPLATE_NAME`):

- Env var: `WHATSAPP_TANIA_NOTIFICATION_TEMPLATE_NAME`
- Nome sugerido do template: `nova_ficha_tania_utility`
- Categoria: Utility
- Idioma: `pt_BR`
- Corpo (2 variáveis, mesmo padrão de `{{1}}`/`{{2}}` já usado em outros
  templates do projeto):
  ```
  Nova candidata aguardando sua análise.

  Nome: {{1}}
  Cidade: {{2}}

  A ficha foi preenchida e está pronta para análise.
  ```
- Botão: 1 botão do tipo URL dinâmica, texto "Analisar candidata", parte fixa
  `https://tania-joias-admin.vercel.app/crm?lead=` + parâmetro dinâmico
  `{{1}}` = `lead_id` (mesmo padrão já usado no template existente
  `ficha_aprovacao_link`, que manda só o token como parâmetro do botão, nunca
  a URL inteira — ver `sendWhatsappFichaTemplate` em `_shared/whatsapp-cloud-api.ts:92`).
- **Não incluir** endereço, referências, documentos, dados familiares — só
  nome/cidade, exatamente como pedido.

## 18. Como disparar após ficha preenchida

Já existe o ponto certo: `supabase/functions/submit-ficha/index.ts`, bloco
das linhas 235–295. Hoje ele já:

1. Marca a Ficha como preenchida (`preenchido_em`);
2. Avança `etapa_pos_aprovacao` pra `"confirmada"`;
3. Se a flag `whatsapp_notificacao_tania_ativa` estiver ligada, manda uma
   mensagem **de texto livre** (`sendWhatsappFreeText`) pro número da Tania e
   só então avança pra `"aguardando_tania"`.

O que muda na implementação futura: trocar o passo 3 de texto livre pelo
envio do **template** Utility (`sendWhatsappApprovalTemplate`-like, usando o
helper novo com o template do item 13), e — conforme o item 9 do RFC — mover
a lead pra `"aguardando_tania"` **imediatamente após o passo 2**, não
condicionado ao sucesso do envio (ver item 23 abaixo).

## 19. Como garantir idempotência

Duas camadas já existentes no projeto, mesmo padrão a reaproveitar:

- **De borda (já existe, protege tudo):** `submit-ficha` rejeita qualquer
  segunda chamada pro mesmo token com `already_submitted` (409), porque
  verifica `ficha.preenchido_em` antes de fazer qualquer coisa. Um
  refresh/retry da candidata na tela da Ficha nunca chega a re-executar o
  bloco de notificação.
- **Da notificação em si (padrão a copiar):** os outros 2 envios automáticos
  do projeto (`send-whatsapp-ficha`, `send-whatsapp-approval`) usam uma
  coluna dedicada tipo `*_enviado_em` com guarda (`if (ja_tem_valor) return
  skip`) **antes** de chamar a Cloud API — não dependem só da trava de borda.
  Recomendo criar `leads.tania_notificada_em` (ou
  `leads_ficha.tania_notificada_em`) seguindo exatamente esse padrão, em vez
  de confiar só na trava do `submit-ficha` — assim qualquer reenvio futuro
  (ex.: um botão manual "notificar de novo" ou um retry automático) também
  fica protegido, não só o fluxo feliz de hoje.

## 20. `whatsapp_messages` atual é suficiente?

**Estrutura sim, mas tem uma armadilha de correlação a resolver.**

A tabela `whatsapp_messages` (migrations `20260813233000` +
`20260818150000`) já tem tudo que a Meta manda por webhook de status:
`sent_at`/`delivered_at`/`read_at`/`failed_at`/`error_code`/`error_title`,
mais `lead_id` pra correlacionar com a candidata.

**Armadilha:** o comentário em `whatsapp-message-log.ts:7-13` documenta que
hoje `lead_id` só é preenchido pelos 3 caminhos de envio do template da
**Ficha** (`finalize-candidate`, `send-whatsapp-ficha`,
`send-lembretes-ficha`). E a função que deriva o "status de entrega" pro
Kanban (`deriveWhatsappDeliveryStatus` em `lib/whatsappStatus.ts`,
consumida por `KanbanCard.tsx`) pega **a mensagem de template mais recente
daquele `lead_id`**, sem distinguir *qual* template foi enviado.

Se um novo envio de template (a notificação pra Tania) também gravar
`lead_id`, ele passa a competir com a mensagem da Ficha na mesma consulta —
o selo "Ficha entregue/lida/falhou" que já aparece no card do Kanban pode
passar a mostrar, por engano, o status da notificação pra Tania (ou
vice-versa), porque `pickMostRecentWhatsappMessage` só olha
`message_type === "template"` e a data, não o nome do template.

**Isso precisa de ajuste** antes de implementar — duas opções, decisão de
arquitetura pra próxima fase:
- (a) adicionar uma coluna `template_purpose` (ou reaproveitar `body`, que já
  guarda o nome do template) e filtrar por ela nas duas derivações de status
  (Ficha vs. notificação Tania), ou
- (b) não gravar `lead_id` na notificação pra Tania (perde rastreamento de
  entrega dela, mas não quebra o que já existe).

Recomendo (a) — é a mudança mínima e mantém a visibilidade pedida no item 11
do RFC original.

## 21. Precisa migration?

Sim, pequena, no mesmo espírito das já existentes no projeto (ver `20260812200000_add_whatsapp_aprovacao_automatica.sql` como modelo direto):

- `alter table leads add column tania_notificada_em timestamptz null;` (idempotência, item 19)
- `insert into settings (...) values ('tania_whatsapp_numero', ...)` (item 12, se a rota via `settings` for escolhida)
- Ajuste em `whatsapp_messages` pro item 20 (nova coluna ou reaproveito de `body`)

Nenhuma dessas foi aplicada nesta tarefa.

## 22. Como mostrar status no CRM

Já existe o componente e o padrão visual prontos: `KanbanCard.tsx` já
renderiza um badge de status de entrega (`WHATSAPP_DELIVERY_STATUS_LABEL`,
com variantes de cor `failed`/`read`/`delivered`/`sent`/`accepted`/
`no_confirmation`) pra Ficha. O mesmo padrão (badge + `formatRelative`) pode
ser replicado no card, condicionado a `etapa_pos_aprovacao === "aguardando_tania"`,
puxando a mensagem da notificação (uma vez resolvido o item 20). O mapeamento
🟢/🟡/🔴/⚪ pedido no RFC bate 1:1 com os `kind` que já existem
(`delivered`/`read` → 🟢, `sent`/`accepted` → 🟡, `failed` → 🔴,
`no_confirmation` → ⚪).

## 23. Como garantir que falha da notificação não bloqueie a decisão

Já é o comportamento hoje, e já validado por uma decisão de produto anterior
(commit `ac0e8a0`, "desacoplar decisão da Tania do envio de WhatsApp",
`IMPLEMENTATION-CRM-003A`): os botões "Tania aprovou"/"Tania recusou" em
`TaniaAprovacaoSection.tsx` já aparecem em **ambas** as etapas `"confirmada"`
e `"aguardando_tania"` (`decisaoTaniaDisponivel` em `lib/taniaDecisionGate.ts`),
justamente pra decisão nunca depender de entrega de WhatsApp confirmada.

O único ajuste que falta (item 9 do RFC): hoje o **avanço de coluna** pra
`"aguardando_tania"` só acontece **depois** do envio ter sido aceito pela
Meta (`submit-ficha/index.ts:283-290`, dentro do `try`). Se a notificação
falhar, a lead fica presa em `"confirmada"` (não é bloqueio de decisão — os
botões continuam disponíveis — mas o card não reflete "aguardando você").
Corrigir: mover a lead pra `"aguardando_tania"` **assim que a Ficha é salva**
(fora do `try` de WhatsApp), e deixar o envio (sucesso ou falha) só afetar o
badge de status, nunca a coluna.

## 24. Arquivos que precisariam mudar

Frontend (`apps/admin/src`):
- `App.tsx` — nenhuma mudança de rota necessária (ver item 3).
- `pages/CrmPage.tsx` — ler `?lead=` via `useSearchParams`.
- `pages/LoginPage.tsx` — corrigir preservação de `search` no redirect (item 4).
- `components/leads/TaniaAprovacaoSection.tsx` — trocar `TANIA_TELEFONE`
  hardcoded por leitura de `settings` (item 12).
- `components/crm/KanbanCard.tsx` — badge de status da notificação (item 22).
- `hooks/useSettings.ts` — novo hook `useTaniaWhatsappNumero` (se via `settings`).
- `lib/whatsappStatus.ts` / `hooks/useLeads.ts` — resolver a correlação do
  item 20 (filtrar por template).

Backend (`supabase/functions`):
- `submit-ficha/index.ts` — trocar texto livre por template; mover avanço de
  coluna pra fora do `try` (itens 18/23); ler número da Tania de env var em
  vez de hardcoded (item 12).
- `_shared/whatsapp-cloud-api.ts` — novo helper
  `sendWhatsappTaniaNotificationTemplate` (mesmo molde de
  `sendWhatsappFichaTemplate`).
- `_shared/whatsapp-message-log.ts` — se a opção (a) do item 20 for escolhida,
  aceitar/gravar o identificador do template.

Vercel (`apps/admin/api/webhooks`):
- `whatsapp.mjs` — trocar `TANIA_TELEFONE` hardcoded por `process.env.TANIA_WHATSAPP_NUMBER`.

Banco:
- Nova migration (item 21).

## 25. Menor implementação segura

1. Corrigir o bug de `LoginPage.tsx` (preservar `search` no redirect) — trivial, zero risco, libera o deep link pro caso "não logada".
2. Adicionar leitura de `?lead=` em `CrmPage.tsx` — trivial, aditivo, não quebra nada existente.
3. Migration pequena: `leads.tania_notificada_em` + setting do número da Tania.
4. Trocar o número hardcoded nos 3 lugares (item 11/12) pela fonte configurável — sem template ainda, já corrige o dado errado.
5. Resolver a correlação do item 20 antes de qualquer novo envio gravar `lead_id` em `whatsapp_messages`.
6. Só depois: criar o template Utility na Meta (fora do código), configurar os 3 secrets/env vars, e trocar `sendWhatsappFreeText` por `sendWhatsappTaniaNotificationTemplate` em `submit-ficha`.
7. Por último: badge de status no `KanbanCard` (item 22) e botão "Falar com a candidata" na tela (item 9, já é só reuso).

Cada passo é independente e reversível — nenhum depende de aprovar o template Meta pra já corrigir o número errado e o deep link, por exemplo.

## 26. Mock textual da experiência no tablet

```
[WhatsApp da Tania — número oficial]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nova candidata aguardando sua análise.

Nome: Maria Silva
Cidade: Guarulhos

A ficha foi preenchida e está pronta para análise.

        [ Analisar candidata ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ↓ toca no botão

[Admin — abre direto na Maria, tablet]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Maria Silva  [Aprovada]
 (11) 9xxxx-xxxx · Guarulhos
 Cadastrada em 15/08/2026 às 14:32

 [Análise da Sofia]
 [Perfil comercial]  [Resumo da IA]
 [IPR]  [Estabilidade profissional]

 ── Ficha de Aprovação ──
 Endereço, bairro, CEP, pai/mãe,
 trabalho, cônjuge (se houver),
 3 referências, referência comercial,
 [Ver no Google Maps]

 ── Aprovação final da Tania ──
 Ficha preenchida. Aguardando decisão.

   [ 👍 Tania aprovou ]  [ 👎 Tania recusou ]

   [ 💬 Falar com a candidata ]  ← abre WhatsApp
━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ↓ toca "Tania aprovou"

 "Candidata aprovada."
   [ Falar com a candidata ]
   [ Voltar para as pendentes ]
```

---

## Classificação final

- **UI_ONLY_PODE_IMPLEMENTAR**: correção do bug de redirect no `LoginPage.tsx`
  (item 4); leitura de `?lead=` em `CrmPage.tsx` (itens 2/3/5); botão "Falar
  com a candidata" reaproveitando `whatsappLinkWithMessage` (item 9).
- **PRECISA_TEMPLATE_META**: notificação Utility com botão de deep link
  (itens 13–17) — não pode ser criado por mim, precisa ser cadastrado e
  aprovado no Meta Business Manager.
- **PRECISA_CONFIGURACAO**: número certo da Tania em 3 lugares (itens 11/12);
  3 secrets/env vars novos (`TANIA_WHATSAPP_NOTIFICATION_NUMBER`,
  `TANIA_WHATSAPP_NUMBER`, `WHATSAPP_TANIA_NOTIFICATION_TEMPLATE_NAME`).
- **PRECISA_MIGRATION**: `leads.tania_notificada_em` (idempotência, item 19);
  setting do número da Tania (item 12); ajuste de correlação em
  `whatsapp_messages` (item 20).
- **PRECISA_DECISAO_DE_NEGOCIO**: (a) confirmar se o número da Tania deve
  viver em `settings` (editável no Admin, não secreto) ou só como secret de
  servidor duplicado — recomendo `settings` pelo motivo do item 12, mas é
  decisão da Tania; (b) confirmar o texto final do template Utility antes de
  submeter à Meta; (c) confirmar se o rodapé "Aprovar"/"Reprovar" genérico
  deve ficar oculto quando o Drawer abre via este deep link (item 8).

Nada foi implementado, nenhum número foi alterado, nenhum template foi
criado, nenhuma migration foi aplicada, nenhum WhatsApp foi enviado, e nada
foi commitado nesta tarefa — conforme solicitado.
