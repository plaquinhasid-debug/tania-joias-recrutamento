/**
 * Cenários executáveis de `identificacaoSchema.idade` (RFC-INTELLIGENCE-006).
 * Mesmo padrão já usado em `classifyForFeature004.examples.ts`
 * (`check(nome, esperado, obtido)`), aplicado aqui pela primeira vez em
 * `packages/shared` — sem test runner instalado neste monorepo.
 */
import { identificacaoSchema } from "./schemas"

export interface SchemasExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

export function runSchemasExamples(): SchemasExampleResult[] {
  const resultados: SchemasExampleResult[] = []

  function check(name: string, esperado: unknown, obtido: unknown) {
    const passou = JSON.stringify(esperado) === JSON.stringify(obtido)
    resultados.push({ name, passou, detalhe: `esperado=${JSON.stringify(esperado)} obtido=${JSON.stringify(obtido)}` })
  }

  const idadeSchema = identificacaoSchema.shape.idade

  check("idade=17 -> rejeitada (abaixo do mínimo de 18)", false, idadeSchema.safeParse(17).success)
  check("idade=18 -> aceita", true, idadeSchema.safeParse(18).success)
  check("idade=16 -> rejeitada", false, idadeSchema.safeParse(16).success)
  check("idade='abc' -> rejeitada (não numérica)", false, idadeSchema.safeParse("abc").success)
  check("idade=200 -> rejeitada (acima do máximo)", false, idadeSchema.safeParse(200).success)
  check("idade='18' (string coagida) -> aceita", true, idadeSchema.safeParse("18").success)

  return resultados
}
