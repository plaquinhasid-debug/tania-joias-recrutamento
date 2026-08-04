/**
 * FEATURE-005, Parte 3, Objetivo 4 — reconhecimentos curtos e fixos, sem IA,
 * pros campos configurados como `"DETERMINISTIC"`. Textos propositalmente
 * curtos (nunca uma frase longa) — são um reconhecimento, não uma resposta.
 */
const DETERMINISTIC_ACKNOWLEDGMENTS: Record<string, string> = {
  nome: "Prazer em conhecer você.",
  cidade: "Obrigada pela informação.",
  idade: "Obrigada.",
  telefone: "Perfeito.",
  whatsapp: "Certo.",
  possui_instagram: "Ótimo.",
  instagram: "Ótimo.",
}

/** Devolve `null` se não houver reconhecimento fixo cadastrado pro campo. */
export function getDeterministicAcknowledgment(fieldKey: string): string | null {
  return DETERMINISTIC_ACKNOWLEDGMENTS[fieldKey] ?? null
}
