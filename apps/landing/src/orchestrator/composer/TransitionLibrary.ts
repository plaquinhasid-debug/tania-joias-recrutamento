/**
 * TransitionLibrary (FEATURE-001 / FEATURE-002.1).
 *
 * Frases de transição do PLAYBOOK-001 (`docs/playbooks/PLAYBOOK-001-sofia.md`,
 * seção "TRANSIÇÕES") — usadas pelo `ResponseComposer` para nunca repetir
 * sempre a mesma frase entre a resposta da IA e a próxima pergunta do
 * roteiro.
 *
 * FEATURE-002.1: cada transição é classificada como `DECLARATIVE` ou
 * `INTERROGATIVE` (ver `TransitionKind` em `types.ts`) — isso corrige o bug
 * em que uma transição como "Posso te fazer mais uma pergunta?" podia
 * aparecer junto da pergunta real do roteiro, produzindo duas perguntas
 * visíveis na mesma mensagem.
 *
 * Ajuste de texto: "Me ajuda com mais uma informação..." (reticências, do
 * PLAYBOOK-001) virou "Me ajuda com mais uma informação?" (com
 * interrogação) — a FEATURE-002.1 deu esse exato texto como exemplo de
 * transição interrogativa, e a versão com reticências era ambígua (não
 * tinha "?", mas soa como um pedido/pergunta). Alinhei ao texto explícito
 * da RFC pra eliminar a ambiguidade.
 */
import type { TransitionKind } from "./types"

export interface Transition {
  text: string
  kind: TransitionKind
}

export const TRANSITIONS: readonly Transition[] = [
  { text: "Agora vamos continuar...", kind: "DECLARATIVE" },
  { text: "Me ajuda com mais uma informação?", kind: "INTERROGATIVE" },
  { text: "Posso te fazer mais uma pergunta?", kind: "INTERROGATIVE" },
  { text: "Seguindo nossa conversa...", kind: "DECLARATIVE" },
  { text: "Obrigada pela sua pergunta.", kind: "DECLARATIVE" },
  { text: "Espero ter esclarecido.", kind: "DECLARATIVE" },
]

export interface PickTransitionOptions {
  /** Última transição usada — evitada na escolha, quando possível (PLAYBOOK-001: "variar naturalmente"). */
  avoid?: string
  /** Fonte de aleatoriedade injetável — `Math.random` em produção, uma função determinística em testes. */
  random?: () => number
  /**
   * Quando `true`, restringe a escolha a transições `DECLARATIVE` — usar
   * sempre que uma `currentQuestion` for anexada depois da transição
   * (FEATURE-002.1, Objetivo 1). Padrão `false` (sem restrição).
   */
  requireDeclarative?: boolean
}

/**
 * Escolhe uma transição da biblioteca, evitando repetir `avoid` quando
 * possível e respeitando `requireDeclarative`. Nunca lança nem devolve
 * string vazia.
 */
export function pickTransition(options: PickTransitionOptions = {}): string {
  const { avoid, random = Math.random, requireDeclarative = false } = options
  const base = requireDeclarative ? TRANSITIONS.filter((t) => t.kind === "DECLARATIVE") : TRANSITIONS
  const candidatas = avoid ? base.filter((t) => t.text !== avoid) : base
  const pool = candidatas.length > 0 ? candidatas : base
  const index = Math.floor(random() * pool.length)
  return pool[Math.min(index, pool.length - 1)].text
}

/** Classificação de uma transição pelo texto exato — usado por testes/exemplos pra conferir qual tipo foi escolhido. */
export function findTransitionKind(text: string): TransitionKind | undefined {
  return TRANSITIONS.find((t) => t.text === text)?.kind
}
