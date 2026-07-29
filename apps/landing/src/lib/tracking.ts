/**
 * Helpers de sessão/UTM/deduplicação de eventos, baseados em sessionStorage.
 * Tudo aqui é "best effort": se sessionStorage não estiver disponível
 * (SSR, modo privado restritivo, etc.) as funções degradam graciosamente.
 */

const SESSION_ID_KEY = "tj_session_id"
const UTM_KEY = "tj_utm_params"
const LOGGED_PREFIX = "tj_logged__"

export interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Gera (ou recupera) um session_id estável durante a sessão do navegador. */
export function getOrCreateSessionId(): string {
  const storage = getStorage()
  if (!storage) return crypto.randomUUID()

  const existing = storage.getItem(SESSION_ID_KEY)
  if (existing) return existing

  const created = crypto.randomUUID()
  storage.setItem(SESSION_ID_KEY, created)
  return created
}

/**
 * Captura os UTM params da URL atual (se presentes) e persiste em
 * sessionStorage para que sobrevivam a navegações dentro da SPA.
 * Se a URL não tiver UTM, retorna o que já estava salvo (se houver).
 */
export function getOrCaptureUtmParams(): UtmParams {
  const storage = getStorage()

  const fromUrl: UtmParams = {}
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search)
    const source = params.get("utm_source")
    const medium = params.get("utm_medium")
    const campaign = params.get("utm_campaign")
    const content = params.get("utm_content")
    if (source) fromUrl.utm_source = source
    if (medium) fromUrl.utm_medium = medium
    if (campaign) fromUrl.utm_campaign = campaign
    if (content) fromUrl.utm_content = content
  }

  const hasUrlUtm = Object.keys(fromUrl).length > 0

  if (!storage) return fromUrl

  if (hasUrlUtm) {
    storage.setItem(UTM_KEY, JSON.stringify(fromUrl))
    return fromUrl
  }

  const stored = storage.getItem(UTM_KEY)
  if (!stored) return {}

  try {
    return JSON.parse(stored) as UtmParams
  } catch {
    return {}
  }
}

/** Verifica se um evento (identificado por uma chave livre) já foi registrado nesta sessão. */
export function hasLoggedOnce(key: string): boolean {
  const storage = getStorage()
  if (!storage) return false
  return storage.getItem(`${LOGGED_PREFIX}${key}`) === "1"
}

/** Marca um evento (identificado por uma chave livre) como já registrado nesta sessão. */
export function markLoggedOnce(key: string): void {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(`${LOGGED_PREFIX}${key}`, "1")
}
