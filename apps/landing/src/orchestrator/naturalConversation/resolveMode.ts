/**
 * FEATURE-005, Parte 5, Objetivo 5 — resolve o `modo` bruto vindo de
 * `sofia-config` (já validado pelo Zod em `lib/api.ts`, mas possivelmente
 * "ACTIVE") pro modo que o `shadowObserver` de fato sabe executar hoje
 * (`"OFF" | "SHADOW"`).
 *
 * `ACTIVE` é um valor reconhecido no contrato (Objetivo 5), mas não tem
 * comportamento implementado nesta fase — é tratado como `SHADOW` (mesma
 * observação silenciosa, nada visível pra candidata), nunca como um
 * comportamento novo não testado. `sourceTag` existe só pra log/diagnóstico
 * (Objetivo 9) — nunca muda o que o Engine faz de verdade.
 */
import type { NaturalConversationModeValue } from "@tania-joias/shared"

export type EffectiveNaturalConversationMode = "OFF" | "SHADOW"

export type NaturalConversationModeSourceTag = "OFF" | "SHADOW" | "ACTIVE_AS_SHADOW" | "DEFAULT_OFF"

export interface ResolvedNaturalConversationMode {
  effectiveMode: EffectiveNaturalConversationMode
  sourceTag: NaturalConversationModeSourceTag
}

export function resolveNaturalConversationMode(
  rawModo: NaturalConversationModeValue | undefined | null,
): ResolvedNaturalConversationMode {
  if (rawModo === "OFF") return { effectiveMode: "OFF", sourceTag: "OFF" }
  if (rawModo === "SHADOW") return { effectiveMode: "SHADOW", sourceTag: "SHADOW" }
  if (rawModo === "ACTIVE") return { effectiveMode: "SHADOW", sourceTag: "ACTIVE_AS_SHADOW" }
  // undefined/null/qualquer outra coisa — nunca deveria acontecer (o Zod em
  // lib/api.ts já garante `"OFF" | "SHADOW" | "ACTIVE"` ou o fallback
  // "OFF" antes mesmo de chegar aqui), mas o fallback fica aqui também
  // como segunda rede de segurança.
  return { effectiveMode: "OFF", sourceTag: "DEFAULT_OFF" }
}
