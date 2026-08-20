import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  sendFichaWhatsapp,
  sendFichaWhatsappSkipMessage,
} from "../apps/admin/src/hooks/useLeadFicha.ts"

const FICHA_SECTION_PATH = fileURLToPath(
  new URL("../apps/admin/src/components/leads/FichaAprovacaoSection.tsx", import.meta.url),
)

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-005A — botão "Enviar ficha pelo WhatsApp" troca o
// antigo `window.open(wa.me/...)` por um envio rastreado via
// `send-whatsapp-ficha`. Estes testes cobrem a lógica de decisão real
// (sent / skipped / erro), não a Edge Function em si (já coberta por
// `whatsapp-tania-notification-template.test.mjs` e testada em produção).
// Nenhuma chamada real à Meta ou ao Supabase — `invoke` é sempre um mock.
// -----------------------------------------------------------------------

test("A. sucesso: invoke devolve { sent: true } -> sendFichaWhatsapp devolve o mesmo, sem lançar", async () => {
  let capturedName
  let capturedOptions
  const invoke = async (name, options) => {
    capturedName = name
    capturedOptions = options
    return { data: { sent: true }, error: null }
  }

  const result = await sendFichaWhatsapp("lead-123", invoke)

  assert.equal(capturedName, "send-whatsapp-ficha")
  assert.deepEqual(capturedOptions, { body: { lead_id: "lead-123" } })
  assert.deepEqual(result, { sent: true })
})

test("B. already_sent: invoke devolve skipped -> sendFichaWhatsapp repassa sem lançar (não é erro)", async () => {
  const invoke = async () => ({
    data: { skipped: true, reason: "already_sent" },
    error: null,
  })

  const result = await sendFichaWhatsapp("lead-123", invoke)

  assert.equal(result.skipped, true)
  assert.equal(result.reason, "already_sent")
})

test("C. no_whatsapp: skipped com o motivo certo", async () => {
  const invoke = async () => ({ data: { skipped: true, reason: "no_whatsapp" }, error: null })
  const result = await sendFichaWhatsapp("lead-123", invoke)
  assert.equal(result.reason, "no_whatsapp")
})

test("D. flag_off: skipped com o motivo certo", async () => {
  const invoke = async () => ({ data: { skipped: true, reason: "flag_off" }, error: null })
  const result = await sendFichaWhatsapp("lead-123", invoke)
  assert.equal(result.reason, "flag_off")
})

test("E. erro real (Meta recusou / lead_not_found / etc.) -> sendFichaWhatsapp lança, nunca engole", async () => {
  const invoke = async () => ({ data: null, error: new Error("whatsapp_send_failed") })

  await assert.rejects(() => sendFichaWhatsapp("lead-123", invoke), /whatsapp_send_failed/)
})

test("F. resposta sem body (data null, sem erro) -> devolve objeto vazio, nunca lança", async () => {
  const invoke = async () => ({ data: null, error: null })
  const result = await sendFichaWhatsapp("lead-123", invoke)
  assert.deepEqual(result, {})
})

// -----------------------------------------------------------------------
// sendFichaWhatsappSkipMessage — mensagem exibida pro operador, nunca um
// erro técnico genérico pros 3 motivos de `skipped`.
// -----------------------------------------------------------------------

test("G. already_sent -> mensagem específica de já enviada", () => {
  assert.equal(sendFichaWhatsappSkipMessage("already_sent"), "Essa ficha já foi enviada pelo WhatsApp.")
})

test("H. no_whatsapp -> mensagem específica de sem WhatsApp confirmado", () => {
  assert.equal(
    sendFichaWhatsappSkipMessage("no_whatsapp"),
    "Esta candidata não tem WhatsApp confirmado.",
  )
})

test("I. flag_off -> mensagem específica de envio desativado", () => {
  assert.equal(
    sendFichaWhatsappSkipMessage("flag_off"),
    "O envio de fichas pelo WhatsApp está desativado nas configurações.",
  )
})

test("J. motivo desconhecido/ausente -> mensagem genérica, nunca lança", () => {
  assert.equal(sendFichaWhatsappSkipMessage(undefined), "O envio não foi realizado.")
})

// -----------------------------------------------------------------------
// Sem harness de render de componente React neste repo (nenhum outro teste
// existente monta JSX) — verificação textual do arquivo-fonte é o
// equivalente mínimo confiável pra confirmar que o `wa.me` foi realmente
// removido e o botão novo está no lugar certo.
// -----------------------------------------------------------------------

test("K. FichaAprovacaoSection não abre mais wa.me nem usa window.open", () => {
  const source = readFileSync(FICHA_SECTION_PATH, "utf8")
  // Só o comentário histórico da migração pode citar "wa.me" — nenhum
  // `window.open`/link `wa.me` de verdade, e nenhum uso do helper antigo.
  assert.equal(source.includes("window.open"), false)
  assert.equal(source.includes("whatsappLinkWithMessage"), false)
})

test("L. FichaAprovacaoSection chama send-whatsapp-ficha através do hook rastreado", () => {
  const source = readFileSync(FICHA_SECTION_PATH, "utf8")
  assert.equal(source.includes("useSendFichaWhatsapp"), true)
  assert.equal(source.includes("sendFicha.mutateAsync(leadId)"), true)
})

test("M. botão mostra o novo rótulo, não o antigo", () => {
  const source = readFileSync(FICHA_SECTION_PATH, "utf8")
  assert.equal(source.includes("Enviar ficha pelo WhatsApp"), true)
  assert.equal(source.includes("Mandar pelo WhatsApp"), false)
})

test("N. botão fica desabilitado durante o envio (isPending)", () => {
  const source = readFileSync(FICHA_SECTION_PATH, "utf8")
  assert.match(source, /disabled=\{!leadWhatsapp \|\| sendFicha\.isPending\}/)
})

test("O. ficha já enviada não mostra o botão de envio ativo (fica condicionado a whatsapp_enviado_em)", () => {
  const source = readFileSync(FICHA_SECTION_PATH, "utf8")
  assert.match(source, /ficha\.whatsapp_enviado_em \?/)
})
