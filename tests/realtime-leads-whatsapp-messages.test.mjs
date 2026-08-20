import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-005C — `useRealtimeLeads` passa a escutar também
// `whatsapp_messages`, não só `leads`, pra que o Kanban se atualize sozinho
// quando o webhook de status grava `delivered`/`read` (causa raiz do bug
// real da Rafaela Alves Viana, 20/08/2026). Sem harness de render de hook
// React neste repo (mesma limitação já documentada nas entregas anteriores
// — o stub de `@/lib/supabase` usado pela suíte Node nem define `.channel`)
// — verificação por leitura estrutural do source, mesmo padrão já usado.
// -----------------------------------------------------------------------

const REALTIME_HOOK_PATH = fileURLToPath(
  new URL("../apps/admin/src/hooks/useRealtimeLeads.ts", import.meta.url),
)
const source = readFileSync(REALTIME_HOOK_PATH, "utf8")

test("A. listener de 'leads' continua existindo", () => {
  assert.match(source, /table:\s*"leads"/)
})

test("B. listener de 'whatsapp_messages' foi adicionado", () => {
  assert.match(source, /table:\s*"whatsapp_messages"/)
})

test("C. ambos os listeners estão no MESMO canal (um só .channel(), duas chamadas .on() encadeadas antes de .subscribe())", () => {
  const canais = (source.match(/\.channel\(/g) ?? []).length
  const listeners = (source.match(/\.on\(\s*\n?\s*"postgres_changes"/g) ?? []).length
  assert.equal(canais, 1, "não deve criar um segundo canal")
  assert.equal(listeners, 2, "precisa dos 2 listeners (leads + whatsapp_messages)")
})

test("D. o listener de leads continua invalidando leads/dashboard-stats/reports (comportamento preservado)", () => {
  assert.match(source, /queryKey:\s*\[\s*"leads"\s*\]/)
  assert.match(source, /queryKey:\s*\[\s*"dashboard-stats"\s*\]/)
  assert.match(source, /queryKey:\s*\[\s*"reports"\s*\]/)
})

test("E. o listener novo (whatsapp_messages) invalida exatamente ['leads']", () => {
  // bloco do handler de whatsapp_messages: da declaração do table até o
  // próximo fechamento de .on(...) ou .subscribe()
  const idx = source.indexOf('table: "whatsapp_messages"')
  assert.ok(idx > -1)
  const bloco = source.slice(idx, idx + 300)
  assert.match(bloco, /invalidateQueries\(\{\s*queryKey:\s*\[\s*"leads"\s*\]\s*\}\)/)
})

test("F. nenhum polling foi criado (sem refetchInterval/setInterval)", () => {
  assert.equal(source.includes("refetchInterval"), false)
  assert.equal(source.includes("setInterval"), false)
})

test("G. cleanup/unsubscribe do canal continua correto (removeChannel no cleanup do useEffect)", () => {
  assert.match(source, /return\s*\(\)\s*=>\s*\{\s*void supabase\.removeChannel\(channel\)/)
})
