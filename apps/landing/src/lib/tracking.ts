/**
 * Helpers de sessão/UTM/deduplicação de eventos, baseados em sessionStorage.
 * Tudo aqui é "best effort": se sessionStorage não estiver disponível
 * (SSR, modo privado restritivo, etc.) as funções degradam graciosamente.
 */

const SESSION_ID_KEY = "tj_session_id"
const UTM_KEY = "tj_utm_params"
const FBCLID_KEY = "tj_fbclid"
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

/**
 * Captura o `fbclid` da URL (clique vindo de um anúncio do Meta) e persiste
 * em sessionStorage para sobreviver a navegações dentro da SPA. Se a URL não
 * tiver, retorna o que já estava salvo (se houver).
 */
export function getOrCaptureFbclid(): string | undefined {
  const storage = getStorage()

  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("fbclid")
    if (fromUrl) {
      storage?.setItem(FBCLID_KEY, fromUrl)
      return fromUrl
    }
  }

  return storage?.getItem(FBCLID_KEY) ?? undefined
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

/** Cookie `_fbp` gravado pelo Pixel do Meta no navegador (identifica o dispositivo/sessão). */
export function getFbp(): string | undefined {
  return readCookie("_fbp")
}

/**
 * Cookie `_fbc` gravado pelo Pixel do Meta quando o clique veio de um
 * anúncio. Se o Pixel ainda não tiver criado o cookie (ex.: bloqueador de
 * rastreamento) mas a URL trouxer `fbclid`, construímos o valor equivalente
 * no formato que o Meta espera.
 */
export function getOrBuildFbc(fbclid: string | undefined): string | undefined {
  const existing = readCookie("_fbc")
  if (existing) return existing
  if (!fbclid) return undefined
  return `fb.1.${Date.now()}.${fbclid}`
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
