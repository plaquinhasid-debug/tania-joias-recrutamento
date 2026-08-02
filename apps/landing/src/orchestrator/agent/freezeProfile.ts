/**
 * freezeProfile (RFC-010, Objetivo 10).
 *
 * Congelamento raso e controlado — protege contra mutação acidental de um
 * `AgentProfile` depois que ele entra em uso (`AgentRegistry.register()` é
 * o único lugar que chama isto, então todo perfil que sai do registro já
 * está congelado). Não congela profundamente listas dentro de `metadata`
 * (complexidade desnecessária para o que existe hoje — `metadata` é `{}`
 * em todos os perfis atuais).
 */
import type { AgentProfile } from "./types"

export function freezeProfile(profile: AgentProfile): Readonly<AgentProfile> {
  Object.freeze(profile.tone)
  Object.freeze(profile.personality)
  Object.freeze(profile.conversationStyle)
  Object.freeze(profile.principles)
  Object.freeze(profile.capabilities)
  Object.freeze(profile.capabilityIds)
  Object.freeze(profile.limitations)
  Object.freeze(profile.restrictionIds)
  Object.freeze(profile.goals)
  Object.freeze(profile.metadata)
  return Object.freeze(profile)
}
