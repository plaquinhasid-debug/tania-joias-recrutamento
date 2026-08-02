/**
 * TransitionLibrary (FEATURE-001).
 *
 * Frases de transição do PLAYBOOK-001 (`docs/playbooks/PLAYBOOK-001-sofia.md`,
 * seção "TRANSIÇÕES") — usadas pelo `ResponseComposer` para nunca repetir
 * sempre a mesma frase entre a resposta da IA e a próxima pergunta do
 * roteiro.
 */

export const TRANSITIONS: readonly string[] = [
  "Agora vamos continuar...",
  "Me ajuda com mais uma informação...",
  "Posso te fazer mais uma pergunta?",
  "Seguindo nossa conversa...",
  "Obrigada pela sua pergunta.",
  "Espero ter esclarecido.",
]

export interface PickTransitionOptions {
  /** Última transição usada — evitada na escolha, quando possível (PLAYBOOK-001: "variar naturalmente"). */
  avoid?: string
  /** Fonte de aleatoriedade injetável — `Math.random` em produção, uma função determinística em testes. */
  random?: () => number
}

/**
 * Escolhe uma transição da biblioteca, evitando repetir `avoid` quando
 * possível. Se `avoid` for a única opção disponível (biblioteca com um só
 * item), ela é reaproveitada — nunca lança nem devolve string vazia.
 */
export function pickTransition(options: PickTransitionOptions = {}): string {
  const { avoid, random = Math.random } = options
  const candidatas = avoid ? TRANSITIONS.filter((t) => t !== avoid) : TRANSITIONS
  const pool = candidatas.length > 0 ? candidatas : TRANSITIONS
  const index = Math.floor(random() * pool.length)
  return pool[Math.min(index, pool.length - 1)]
}
