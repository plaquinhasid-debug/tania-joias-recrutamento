// EMBAIXADORAS TANIA JOIAS V1 — E2.5-E1. Lógica pura da página pública de
// resgate do convite (`/embaixadoras/convite`). Nenhuma função aqui toca
// `window`/DOM diretamente (exceto onde explicitamente documentado, e
// sempre recebendo o objeto global como parâmetro, nunca lendo `window`
// global por conta própria) — testável direto via node:test, mesmo padrão
// de apps/admin/src/lib/ambassadorInvite.ts.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js"

// Import pelo alias `@/lib/supabase` (não `./supabase` relativo), de
// propósito: o loader de testes (`tests/ts-extension-loader.mjs`) só
// intercepta e troca por um stub seguro (sem `import.meta.env`, inválido
// fora do Vite) quando o specifier é exatamente esse alias — mesma razão
// pela qual `apps/landing/src/lib/api.ts` já importa assim.
import { supabase } from "@/lib/supabase"

// =========================================================================
// TOKEN NA URL
// =========================================================================

// REGEX IDÊNTICA à do script de bootstrap em apps/landing/index.html — as
// duas cópias precisam ficar em sincronia (o bootstrap não pode importar
// este módulo: precisa ser JS clássico síncrono, executado ANTES do script
// do Meta Pixel, enquanto um <script type="module"> só roda depois do
// parsing do documento inteiro). tests/embaixadora-convite.test.mjs compara
// as duas copias textualmente pra travar contra divergência futura.
export const INVITE_TOKEN_PATH_REGEX = /^\/embaixadoras\/convite\/([A-Za-z0-9_-]+)\/?$/
export const SANITIZED_INVITE_PATH = "/embaixadoras/convite"
export const INVITE_TOKEN_GLOBAL_KEY = "__EMBAIXADORA_INVITE_TOKEN__"

/** Mesma lógica do bootstrap script — usada só em teste, nunca em produção (lá o token já chega sanitizado da URL, ver index.html). */
export function extractInviteTokenFromPathname(pathname: string): string | null {
  const match = INVITE_TOKEN_PATH_REGEX.exec(pathname)
  return match ? match[1] : null
}

/**
 * Lê o token colocado pelo bootstrap script em `window.__EMBAIXADORA_INVITE_
 * TOKEN__` — pura, sem efeito colateral, segura pra rodar 2x (o inicializador
 * de `useState` no React StrictMode/dev roda o inicializador duas vezes,
 * usando o resultado da segunda chamada; se essa função também limpasse a
 * variável global, a segunda chamada veria `undefined` e o token seria
 * perdido). A limpeza fica em `clearInviteTokenFromGlobal`, chamada à parte
 * (via `useEffect`, nunca dentro do inicializador de `useState`).
 */
export function readInviteTokenFromGlobal(globalObject: Record<string, unknown>): string | null {
  const value = globalObject[INVITE_TOKEN_GLOBAL_KEY]
  return typeof value === "string" && value.length > 0 ? value : null
}

/** Efeito colateral isolado — nunca chamado de dentro de um inicializador de useState (ver comentário acima). Idempotente: chamar 2x (StrictMode) não tem efeito adicional. */
export function clearInviteTokenFromGlobal(globalObject: Record<string, unknown>): void {
  delete globalObject[INVITE_TOKEN_GLOBAL_KEY]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// =========================================================================
// SENHA
// =========================================================================

// Mesmos limites do backend (redeem-ambassador-invite/logic.ts). Mínimo
// confirmado igual à configuração REAL do Supabase Auth deste projeto
// (Studio → Authentication, 6 caracteres — ver auditoria E2.5-D0/D1), não
// suposto. Sem exigência de composição (maiúscula/número/símbolo): a
// configuração real do projeto não pede isso.
export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 128

export function validatePasswordFields(password: string, confirmPassword: string): string | null {
  if (!password || !confirmPassword) return "Preencha os dois campos de senha."
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`
  if (password.length > PASSWORD_MAX_LENGTH) return "A senha é longa demais."
  if (password !== confirmPassword) return "As senhas digitadas não coincidem."
  return null
}

// =========================================================================
// TRAVA CONTRA DUPLO SUBMIT — mesmo padrão de
// apps/admin/src/lib/ambassadorInvite.ts:createInviteSubmissionGuard
// =========================================================================

export function createSubmissionGuard() {
  let pending = false
  return {
    isPending: () => pending,
    async run(task: () => Promise<void>): Promise<void> {
      if (pending) return
      pending = true
      try {
        await task()
      } finally {
        pending = false
      }
    },
  }
}

// =========================================================================
// VALIDATE
// =========================================================================

type FunctionsInvoke = typeof supabase.functions.invoke

export type ValidateOutcome =
  | { kind: "valido"; nome: string; email: string }
  | { kind: "invalido" }
  | { kind: "erro" }

/** Projeta só o contrato mínimo — nunca repassa campos extras que viessem na resposta. */
export function parseValidateBody(value: unknown): ValidateOutcome {
  if (isRecord(value) && value.status === "valido" && typeof value.nome === "string" && typeof value.email === "string") {
    return { kind: "valido", nome: value.nome, email: value.email }
  }
  return { kind: "invalido" }
}

/**
 * Chama validate-ambassador-invite. Nunca lança — qualquer falha (rede,
 * relay, HTTP não-2xx) vira `{kind:"erro"}`, recuperável com "tentar de
 * novo" (validate não tem efeito colateral, ver auditoria E2.5-A seção I).
 */
export async function validateInvite(
  token: string,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<ValidateOutcome> {
  const { data, error } = await invoke("validate-ambassador-invite", { body: { token } })
  if (error) return { kind: "erro" }
  return parseValidateBody(data)
}

// =========================================================================
// REDEEM
// =========================================================================

export type RedeemOutcome =
  | { kind: "sucesso" }
  | { kind: "invalido" }
  | { kind: "senha_invalida" }
  | { kind: "erro" }
  /** Falha de transporte (fetch/relay) — nunca sabemos se o servidor chegou a processar o redeem. Nunca oferecer retry automático nesse caso (ver pedido E2.5-E1 seção 15). */
  | { kind: "incerto" }

export function parseRedeemBody(value: unknown): RedeemOutcome {
  if (isRecord(value) && value.status === "sucesso") return { kind: "sucesso" }
  if (isRecord(value) && value.status === "invalido") return { kind: "invalido" }
  return { kind: "erro" }
}

async function redeemErrorCode(error: FunctionsHttpError): Promise<string | undefined> {
  if (!(error.context instanceof Response)) return undefined
  try {
    const body: unknown = await error.context.clone().json()
    return isRecord(body) && typeof body.error === "string" ? body.error : undefined
  } catch {
    return undefined
  }
}

/**
 * Chama redeem-ambassador-invite. Distingue explicitamente:
 * - erro === null: o servidor respondeu 2xx, resultado conhecido (sucesso/invalido);
 * - FunctionsHttpError: o servidor respondeu de verdade (4xx/5xx) — resultado
 *   CONHECIDO (falhou), seguro tratar como recuperável (senha_invalida/erro);
 * - FunctionsFetchError/FunctionsRelayError (ou qualquer erro não reconhecido):
 *   a requisição pode nunca ter chegado ao servidor, ou a resposta dele pode
 *   ter se perdido — NUNCA sabemos se um Auth user chegou a ser criado.
 *   Sempre "incerto", nunca "erro" (que sugeriria retry seguro).
 */
export async function redeemInvite(
  token: string,
  password: string,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<RedeemOutcome> {
  const { data, error } = await invoke("redeem-ambassador-invite", { body: { token, password } })
  if (!error) return parseRedeemBody(data)

  if (error instanceof FunctionsHttpError) {
    const code = await redeemErrorCode(error)
    if (code === "senha_invalida") return { kind: "senha_invalida" }
    return { kind: "erro" }
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return { kind: "incerto" }
  }

  // Formato de erro desconhecido: mais seguro subestimar certeza do que
  // superestimar — nunca tratar algo não reconhecido como "erro comum".
  return { kind: "incerto" }
}
