import type { EmbaixadoraStatus } from "../hooks/useEmbaixadoras"

export interface AmbassadorInviteInput {
  nome: string
  telefone: string
  email: string
  instagram?: string
}

export interface AmbassadorInviteResult {
  embaixadora: { id: string; nome: string; status: EmbaixadoraStatus; codigo_referral: string }
  invite_url: string
}

export const INVITE_UNEXPECTED_ERROR = "Não foi possível confirmar a criação do convite. Confira a listagem antes de tentar novamente."

export class InviteRequestError extends Error {}

const INVALID_MESSAGES = new Map([
  ["invalid_json", "Não foi possível enviar os dados. Confira o formulário."],
  ["nome_obrigatorio", "Informe o nome."],
  ["nome_muito_longo", "O nome deve ter no máximo 120 caracteres."],
  ["telefone_invalido", "Informe um telefone brasileiro válido com DDD."],
  ["email_obrigatorio", "Informe o e-mail."],
  ["email_invalido", "Informe um e-mail válido."],
  ["email_muito_longo", "O e-mail deve ter no máximo 254 caracteres."],
  ["instagram_invalido", "Confira o Instagram informado."],
  ["instagram_muito_longo", "O Instagram deve ter no máximo 60 caracteres."],
])

const CONFLICT_MESSAGES = new Map([
  ["convite_ja_existe", "Já existe um convite pendente para esta pessoa."],
  ["embaixadora_ja_ativa", "Esta pessoa já é uma Embaixadora ativa."],
  ["embaixadora_inativa", "Já existe um cadastro inativo para esta pessoa."],
  ["embaixadora_rejeitada", "Já existe um cadastro rejeitado para esta pessoa."],
  ["telefone_ja_existe", "Este telefone já está cadastrado."],
  ["email_ja_existe", "Este e-mail já está cadastrado."],
])

export function inviteHttpErrorMessage(status: number, code?: string): string {
  switch (status) {
    case 400: return INVALID_MESSAGES.get(code ?? "") ?? "Confira os dados informados e tente novamente."
    case 401: return "Sua sessão expirou ou é inválida. Entre novamente para continuar."
    case 403: return "Você não tem autorização para criar convites neste acesso."
    case 409: return CONFLICT_MESSAGES.get(code ?? "") ?? "Já existe um cadastro conflitante. Confira a listagem."
    case 500: return "Não foi possível criar o convite por um erro interno. Confira a listagem antes de tentar novamente."
    default: return INVITE_UNEXPECTED_ERROR
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Projeta somente o contrato necessário, sem reter a resposta HTTP. */
export function parseInviteResult(value: unknown): AmbassadorInviteResult {
  if (!isRecord(value) || !isRecord(value.embaixadora)) throw new InviteRequestError(INVITE_UNEXPECTED_ERROR)
  const row = value.embaixadora
  if (
    typeof value.invite_url !== "string" || !value.invite_url.trim() ||
    typeof row.id !== "string" || !row.id ||
    typeof row.nome !== "string" || !row.nome ||
    typeof row.codigo_referral !== "string" || !row.codigo_referral ||
    (row.status !== "convidada" && row.status !== "ativa" && row.status !== "inativa" && row.status !== "rejeitada")
  ) throw new InviteRequestError(INVITE_UNEXPECTED_ERROR)
  return {
    embaixadora: { id: row.id, nome: row.nome, status: row.status, codigo_referral: row.codigo_referral },
    invite_url: value.invite_url,
  }
}

export type InviteFields = Required<AmbassadorInviteInput>
export interface InviteDialogState {
  fields: InviteFields
  error: string | null
  result: AmbassadorInviteResult | null
}

export function initialInviteDialogState(): InviteDialogState {
  return { fields: { nome: "", telefone: "", email: "", instagram: "" }, error: null, result: null }
}

type InviteDialogAction =
  | { type: "field"; field: keyof InviteFields; value: string }
  | { type: "error"; message: string | null }
  | { type: "success"; result: AmbassadorInviteResult }
  | { type: "reset" }

export function inviteDialogReducer(state: InviteDialogState, action: InviteDialogAction): InviteDialogState {
  switch (action.type) {
    case "field": return { ...state, fields: { ...state.fields, [action.field]: action.value }, error: null }
    case "error": return { ...state, error: action.message }
    case "success": return { ...initialInviteDialogState(), result: action.result }
    case "reset": return initialInviteDialogState()
  }
}

export function validateInviteFields(fields: InviteFields): string | null {
  if (!fields.nome.trim()) return "Informe o nome."
  if (!fields.telefone.trim()) return "Informe o telefone."
  if (!fields.email.trim()) return "Informe o e-mail."
  return null
}

/** Trava síncrona: protege também dois eventos antes do próximo render. */
export function createInviteSubmissionGuard() {
  let pending = false
  return {
    isPending: () => pending,
    async run(task: () => Promise<void>): Promise<void> {
      if (pending) return
      pending = true
      try { await task() } finally { pending = false }
    },
  }
}

export async function copyInviteLink(url: string, writeText: (text: string) => Promise<void>): Promise<boolean> {
  try {
    await writeText(url)
    return true
  } catch {
    return false
  }
}
