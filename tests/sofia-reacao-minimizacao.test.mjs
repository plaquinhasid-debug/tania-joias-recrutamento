import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildUserPrompt } from "../supabase/functions/_shared/sofia-reacao.ts"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")

// -----------------------------------------------------------------------
// Comportamento real do prompt (buildUserPrompt) — prova direta de que
// nada além de campo/valor/próxima pergunta chega à Anthropic por este
// caminho, mesmo que um chamador antigo ainda tentasse passar mais dados.
// -----------------------------------------------------------------------

test("prompt contém só campo, valor e próxima pergunta — nunca telefone/Instagram/nome", () => {
  const prompt = buildUserPrompt({
    apiKey: "x",
    intent: "perguntar_proximo",
    campo: "profissao",
    valor: "Cabeleireira",
    proximaPerguntaBase: "Me conta rapidinho sobre seu trabalho hoje.",
  })
  assert.match(prompt, /Campo que a candidata acabou de responder: profissao/)
  assert.match(prompt, /Resposta: "Cabeleireira"/)
  assert.match(prompt, /Próxima informação que ainda precisa ser coletada/)
  assert.doesNotMatch(prompt, /telefone/i)
  assert.doesNotMatch(prompt, /instagram/i)
  assert.doesNotMatch(prompt, /Respostas já dadas/i)
})

test("intent fechar não inclui próxima pergunta, e continua sem histórico", () => {
  const prompt = buildUserPrompt({ apiKey: "x", intent: "fechar", campo: "objetivo", valor: "Quero renda extra" })
  assert.match(prompt, /Campo que a candidata acabou de responder: objetivo/)
  assert.doesNotMatch(prompt, /Próxima informação/)
  assert.doesNotMatch(prompt, /Respostas já dadas/i)
})

test("mesmo passando campos extras não previstos no tipo, buildUserPrompt ignora tudo que não seja campo/valor/proximaPerguntaBase", () => {
  // Simula um chamador desatualizado tentando reintroduzir dado — objeto
  // literal (não passa pelo TypeScript), prova que a função em si nunca lê
  // nenhuma outra chave do input.
  const prompt = buildUserPrompt({
    apiKey: "x",
    intent: "perguntar_proximo",
    campo: "profissao",
    valor: "Enfermeira",
    proximaPerguntaBase: "próxima",
    respostasAnteriores: { telefone: "11999999999", instagram: "@candidata_real", nome: "Maria da Silva" },
  })
  assert.doesNotMatch(prompt, /11999999999/)
  assert.doesNotMatch(prompt, /@candidata_real/)
  assert.doesNotMatch(prompt, /Maria da Silva/)
})

// -----------------------------------------------------------------------
// Contratos (código-fonte) — prova de que `respostasAnteriores` foi
// removido de toda a cadeia, não só de `buildUserPrompt`.
// -----------------------------------------------------------------------

// Regex casa só a DECLARAÇÃO de campo (ex.: `respostasAnteriores: Record<...>`),
// nunca a menção em comentário explicando a remoção (ex.: "`respostasAnteriores`
// removido deliberadamente"), que continua existindo de propósito como
// documentação de por que o campo nunca deve voltar.
const CAMPO_DECLARADO = /respostasAnteriores\s*\??\s*:\s*\S/

test("SofiaReacaoInput (sofia-reacao.ts) não declara respostasAnteriores como campo", () => {
  const source = read("../supabase/functions/_shared/sofia-reacao.ts")
  assert.doesNotMatch(source, CAMPO_DECLARADO)
})

test("Payload do sofia-reagir/index.ts não aceita respostasAnteriores como campo", () => {
  const source = read("../supabase/functions/sofia-reagir/index.ts")
  assert.doesNotMatch(source, CAMPO_DECLARADO)
})

test("api.ts (Landing) não envia respostasAnteriores em SofiaReacaoParams", () => {
  const source = read("../apps/landing/src/lib/api.ts")
  assert.doesNotMatch(source, /respostasAnteriores/)
})

test("useSofiaFlow.ts não passa respostasAnteriores em nenhuma das 2 chamadas a fetchSofiaReacao", () => {
  const source = read("../apps/landing/src/hooks/useSofiaFlow.ts")
  assert.doesNotMatch(source, /respostasAnteriores/)
  // Confirma que as 2 chamadas continuam existindo (a reação em si não foi removida, só minimizada).
  assert.equal((source.match(/fetchSofiaReacao\(/g) ?? []).length, 2)
})

test("os outros 2 caminhos de IA (finalize-candidate/ai-analysis e answerCandidateQuestion) não foram tocados", () => {
  const aiAnalysis = read("../supabase/functions/_shared/ai-analysis.ts")
  const answerCandidateQuestion = read("../apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts")
  // ai-analysis.ts continua enviando telefone como ausente e Instagram só como booleano — nenhuma mudança esperada aqui.
  assert.doesNotMatch(aiAnalysis, /input\.telefone/)
  assert.match(aiAnalysis, /possuiInstagram: boolean/)
  // answerCandidateQuestion.ts continua enviando só pergunta + documentos do Knowledge Service.
  assert.doesNotMatch(answerCandidateQuestion, /respostasAnteriores/)
})
