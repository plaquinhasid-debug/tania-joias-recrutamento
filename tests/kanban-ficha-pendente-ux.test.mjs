import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { PIPELINE_COLUMNS, ETAPA_POS_APROVACAO_LABEL } from "../packages/shared/src/constants.ts"
import { WHATSAPP_DELIVERY_STATUS_LABEL } from "../apps/admin/src/lib/whatsappStatus.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-005B — proposta UX da coluna "Ficha pendente" aprovada
// e implementada. Sem harness de render de componente neste repo (mesma
// limitação já documentada em `send-ficha-whatsapp.test.mjs`) — dados
// puros (constants.ts) são testados de verdade; o texto/estrutura do
// componente é verificado por leitura do source, mesmo padrão já usado.
// -----------------------------------------------------------------------

const KANBAN_CARD_PATH = fileURLToPath(
  new URL("../apps/admin/src/components/crm/KanbanCard.tsx", import.meta.url),
)
const kanbanCardSource = readFileSync(KANBAN_CARD_PATH, "utf8")

test("A. label da coluna 'contatada' no Kanban é 'Ficha pendente'", () => {
  const coluna = PIPELINE_COLUMNS.find((col) => col.key === "contatada")
  assert.ok(coluna, "coluna 'contatada' precisa existir em PIPELINE_COLUMNS")
  assert.equal(coluna.label, "Ficha pendente")
})

test("B. ETAPA_POS_APROVACAO_LABEL.contatada (usado no Drawer) NÃO mudou", () => {
  // Continua "Contato manual / Ficha pendente" — só o rótulo da COLUNA do
  // Kanban mudou (item A), o label da etapa em si (lido em
  // LeadDetailDrawer.tsx) fica intacto, por decisão explícita da tarefa.
  assert.equal(ETAPA_POS_APROVACAO_LABEL.contatada, "Contato manual / Ficha pendente")
})

test("C. WHATSAPP_DELIVERY_STATUS_LABEL (compartilhado com o Drawer) NÃO mudou", () => {
  assert.deepEqual(WHATSAPP_DELIVERY_STATUS_LABEL, {
    failed: "Falhou no WhatsApp",
    read: "Lida",
    delivered: "Entregue",
    sent: "Enviada pela Meta",
    accepted: "Aceita pela Meta / entrega não confirmada",
    no_confirmation: "Sem confirmação de contato",
  })
})

test("D. KanbanCard define um mapa de texto PRÓPRIO (não reaproveita WHATSAPP_DELIVERY_STATUS_LABEL na coluna Ficha pendente)", () => {
  assert.equal(kanbanCardSource.includes("KANBAN_FICHA_PENDENTE_STATUS_LABEL"), true)
  assert.equal(kanbanCardSource.includes("WHATSAPP_DELIVERY_STATUS_LABEL"), false)
})

test("E. textos exatos aprovados presentes no source (um por estado)", () => {
  assert.match(kanbanCardSource, /no_confirmation:\s*"Ficha ainda não enviada"/)
  assert.match(kanbanCardSource, /accepted:\s*"Ficha enviada — aguardando entrega"/)
  assert.match(kanbanCardSource, /sent:\s*"Ficha enviada — aguardando entrega"/)
  assert.match(kanbanCardSource, /delivered:\s*"Ficha entregue — aguardando preenchimento"/)
  assert.match(kanbanCardSource, /read:\s*"Ficha lida — aguardando preenchimento"/)
  assert.match(kanbanCardSource, /failed:\s*"Falha no envio da ficha"/)
})

test("F. ação 'Enviar ficha pelo WhatsApp' existe, aparece só 1 vez e logo após o check de no_confirmation", () => {
  const ocorrencias = (kanbanCardSource.match(/Enviar ficha pelo WhatsApp/g) ?? []).length
  assert.equal(ocorrencias, 1, "o texto do botão não deve se repetir pra outros estados")
  assert.match(kanbanCardSource, /deliveryStatus\.kind === "no_confirmation" &&[\s\S]{0,400}Enviar ficha pelo WhatsApp/)
})

test("G. botão de envio reaproveita useSendFichaWhatsapp, nenhuma lógica de envio nova", () => {
  assert.equal(kanbanCardSource.includes("useSendFichaWhatsapp"), true)
  assert.equal(kanbanCardSource.includes("sendFicha.mutateAsync(lead.id)"), true)
})

test("H. nenhum botão de reenvio criado para o estado failed (backend não permite)", () => {
  // A única ação condicionada a 'failed' explicitamente é a linha de erro,
  // nunca um botão de reenvio — a única ação de envio no arquivo é a de F,
  // condicionada só a 'no_confirmation'.
  const acoesDeEnvio = (kanbanCardSource.match(/sendFicha\.mutateAsync/g) ?? []).length
  assert.equal(acoesDeEnvio, 1)
  assert.equal(kanbanCardSource.includes('"failed" &&') && kanbanCardSource.includes("Código Meta"), true)
})

test("I. 'Abrir WhatsApp' (ação manual de contingência) continua existindo", () => {
  assert.equal(kanbanCardSource.includes("Abrir WhatsApp"), true)
  assert.equal(kanbanCardSource.includes("handleAbrirWhatsapp"), true)
})
