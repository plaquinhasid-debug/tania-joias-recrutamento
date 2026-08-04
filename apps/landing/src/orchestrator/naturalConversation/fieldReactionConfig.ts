/**
 * FEATURE-005, Parte 3, Objetivo 2 — configuração de estratégia por campo,
 * isolada do Engine (nada hardcoded dentro do `NaturalConversationEngine`).
 *
 * `trabalha` é fixado em `"NONE"` de propósito e não deve ser mudado: a
 * pergunta "Você trabalha atualmente?" e a mensagem de reprovação são
 * hardcoded desde o início do projeto e nunca devem passar por IA nem por
 * reação — essa é uma regra de negócio da Tania, não um detalhe técnico.
 */
import type { SofiaAnswerKey } from "@/types/sofia"
import type { ReactionStrategy } from "./types"

export const FIELD_REACTION_CONFIG: Partial<Record<SofiaAnswerKey, ReactionStrategy>> = {
  nome: "DETERMINISTIC",
  cidade: "DETERMINISTIC",
  idade: "DETERMINISTIC",
  telefone: "NONE",
  trabalha: "NONE",
  profissao: "AI",
  empresa_atual: "AI",
  experiencia_vendas: "AI",
  whatsapp: "DETERMINISTIC",
  possui_instagram: "DETERMINISTIC",
  instagram: "DETERMINISTIC",
  tempo_disponivel: "AI",
  objetivo: "AI",
}
