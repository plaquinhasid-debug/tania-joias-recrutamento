/**
 * Helper de log compartilhado (RFC-004) — evita duplicar o guard de "só em
 * desenvolvimento" em cada módulo novo. Não usado pelos módulos da
 * RFC-002/003 de propósito (evitar tocar em código já testado sem motivo).
 */
const isDev = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV)

export function createLogger(prefix: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    if (isDev) console.log(prefix, ...args)
  }
}
