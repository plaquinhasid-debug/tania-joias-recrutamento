import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/functions-js"

import {
  INVITE_TOKEN_GLOBAL_KEY,
  SANITIZED_INVITE_PATH,
  clearInviteTokenFromGlobal,
  createSubmissionGuard,
  extractInviteTokenFromPathname,
  parseRedeemBody,
  parseValidateBody,
  readInviteTokenFromGlobal,
  redeemInvite,
  validateInvite,
  validatePasswordFields,
} from "../apps/landing/src/lib/ambassadorInvite.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.5-E1. Testes da página pública de
// resgate do convite, todos com doubles/mocks — NENHUMA chamada real às
// Edge Functions, NENHUM convite/Embaixadora/Auth user real. Prioriza
// lógica pura real sobre regex de source, exceto onde o próprio pedido
// exige prova arquitetural (ordem sanitização -> tracking em index.html,
// que só existe como texto estático — não há motor de parsing de HTML/JS
// disponível aqui).
// -----------------------------------------------------------------------

const REAL_TOKEN = "a".repeat(43)

// =========================================================================
// TOKEN / URL — extração e contrato de sanitização
// =========================================================================

test("extractInviteTokenFromPathname: extrai o token de /embaixadoras/convite/<TOKEN>", () => {
  assert.equal(extractInviteTokenFromPathname(`/embaixadoras/convite/${REAL_TOKEN}`), REAL_TOKEN)
})

test("extractInviteTokenFromPathname: aceita barra final", () => {
  assert.equal(extractInviteTokenFromPathname(`/embaixadoras/convite/${REAL_TOKEN}/`), REAL_TOKEN)
})

test("extractInviteTokenFromPathname: rota sem token -> null (não lança, não reconstrói segredo)", () => {
  assert.equal(extractInviteTokenFromPathname(SANITIZED_INVITE_PATH), null)
  assert.equal(extractInviteTokenFromPathname("/embaixadoras/convite/"), null)
  assert.equal(extractInviteTokenFromPathname("/embaixadoras/convite"), null)
})

test("extractInviteTokenFromPathname: rota completamente diferente -> null", () => {
  assert.equal(extractInviteTokenFromPathname("/"), null)
  assert.equal(extractInviteTokenFromPathname("/ficha/abc123"), null)
})

test("extractInviteTokenFromPathname: caracteres fora do alfabeto base64url no segmento -> null", () => {
  assert.equal(extractInviteTokenFromPathname("/embaixadoras/convite/token com espaço"), null)
  assert.equal(extractInviteTokenFromPathname("/embaixadoras/convite/token/extra/segmento"), null)
})

// =========================================================================
// TOKEN GLOBAL — leitura/limpeza (nunca localStorage/sessionStorage)
// =========================================================================

test("readInviteTokenFromGlobal: lê o valor colocado pelo bootstrap script", () => {
  const fakeWindow = { [INVITE_TOKEN_GLOBAL_KEY]: REAL_TOKEN }
  assert.equal(readInviteTokenFromGlobal(fakeWindow), REAL_TOKEN)
})

test("readInviteTokenFromGlobal: ausente/vazio/não-string -> null", () => {
  assert.equal(readInviteTokenFromGlobal({}), null)
  assert.equal(readInviteTokenFromGlobal({ [INVITE_TOKEN_GLOBAL_KEY]: "" }), null)
  assert.equal(readInviteTokenFromGlobal({ [INVITE_TOKEN_GLOBAL_KEY]: 123 }), null)
  assert.equal(readInviteTokenFromGlobal({ [INVITE_TOKEN_GLOBAL_KEY]: null }), null)
})

test("readInviteTokenFromGlobal: chamar 2x (StrictMode dev double-invoke do inicializador de useState) não perde o valor — a leitura por si só não tem efeito colateral", () => {
  const fakeWindow = { [INVITE_TOKEN_GLOBAL_KEY]: REAL_TOKEN }
  const first = readInviteTokenFromGlobal(fakeWindow)
  const second = readInviteTokenFromGlobal(fakeWindow)
  assert.equal(first, REAL_TOKEN)
  assert.equal(second, REAL_TOKEN, "uma segunda leitura não deveria ver o valor sumido")
})

test("clearInviteTokenFromGlobal: remove a referência; chamar 2x (StrictMode) é seguro (idempotente)", () => {
  const fakeWindow = { [INVITE_TOKEN_GLOBAL_KEY]: REAL_TOKEN }
  clearInviteTokenFromGlobal(fakeWindow)
  assert.equal(readInviteTokenFromGlobal(fakeWindow), null)
  assert.doesNotThrow(() => clearInviteTokenFromGlobal(fakeWindow))
})

test("REFRESH: depois de limpo, uma nova leitura no mesmo objeto global não reconstrói o token — nenhum fallback de storage", () => {
  const fakeWindow = { [INVITE_TOKEN_GLOBAL_KEY]: REAL_TOKEN }
  const token = readInviteTokenFromGlobal(fakeWindow)
  clearInviteTokenFromGlobal(fakeWindow)
  assert.equal(token, REAL_TOKEN)
  assert.equal(readInviteTokenFromGlobal(fakeWindow), null, "F5 depois da sanitização não deveria conseguir recuperar o token")
  assert.equal(Object.prototype.hasOwnProperty.call(fakeWindow, "localStorage"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(fakeWindow, "sessionStorage"), false)
})

// =========================================================================
// PROVA ARQUITETURAL — index.html: ordem sanitização -> tracking
// =========================================================================

test("index.html: script de sanitização do token aparece ANTES do script do Meta Pixel", () => {
  const html = fs.readFileSync(new URL("../apps/landing/index.html", import.meta.url), "utf8")
  const sanitizeIndex = html.indexOf(INVITE_TOKEN_GLOBAL_KEY)
  const pixelIndex = html.indexOf("fbq('init'")
  assert.ok(sanitizeIndex >= 0, "script de sanitização não encontrado em index.html")
  assert.ok(pixelIndex >= 0, "script do Meta Pixel não encontrado em index.html")
  assert.ok(
    sanitizeIndex < pixelIndex,
    "o script de sanitização precisa vir ANTES do Meta Pixel no documento — scripts <script> clássicos inline executam sincronamente, na ordem em que o parser os encontra",
  )
})

test("index.html: o script de sanitização é <script> inline síncrono — sem type=module (seria adiado) e sem src (precisa rodar no lugar)", () => {
  const html = fs.readFileSync(new URL("../apps/landing/index.html", import.meta.url), "utf8")
  const sanitizeIndex = html.indexOf(INVITE_TOKEN_GLOBAL_KEY)
  const scriptOpenStart = html.lastIndexOf("<script", sanitizeIndex)
  const scriptOpenEnd = html.indexOf(">", scriptOpenStart)
  const openTag = html.slice(scriptOpenStart, scriptOpenEnd + 1)
  assert.ok(!/type\s*=\s*["']module["']/.test(openTag), "não pode ser type=module — módulos só rodam depois do parsing do documento inteiro")
  assert.ok(!/\bsrc\s*=/.test(openTag), "precisa ser inline, não carregado de um arquivo externo")
})

test("index.html: a regex de extração do token é textualmente idêntica à de lib/ambassadorInvite.ts (evita divergência entre as duas cópias)", () => {
  const html = fs.readFileSync(new URL("../apps/landing/index.html", import.meta.url), "utf8")
  const libSource = fs.readFileSync(new URL("../apps/landing/src/lib/ambassadorInvite.ts", import.meta.url), "utf8")
  const regexLiteral = "/^\\/embaixadoras\\/convite\\/([A-Za-z0-9_-]+)\\/?$/"
  assert.ok(html.includes(regexLiteral), "index.html deveria conter a mesma regex literal")
  assert.ok(libSource.includes(regexLiteral), "lib/ambassadorInvite.ts deveria conter a mesma regex literal")
})

test("index.html: a sanitização usa history.replaceState (nunca pushState, que deixaria a URL com token no histórico)", () => {
  const html = fs.readFileSync(new URL("../apps/landing/index.html", import.meta.url), "utf8")
  assert.match(html, /window\.history\.replaceState\(/)
  assert.ok(!/window\.history\.pushState\(/.test(html))
})

// =========================================================================
// REFERRER-POLICY — E2.5-E2.1 (achado BAIXO 1 da auditoria E2.5-E2)
// =========================================================================

test("index.html: meta referrer existe com content=strict-origin-when-cross-origin", () => {
  const html = fs.readFileSync(new URL("../apps/landing/index.html", import.meta.url), "utf8")
  assert.match(html, /<meta\s+name="referrer"\s+content="strict-origin-when-cross-origin"\s*\/?>/)
})

test("index.html: meta referrer NÃO usa unsafe-url/origin-when-cross-origin/no-referrer-when-downgrade (só a política explicitamente pedida)", () => {
  const html = fs.readFileSync(new URL("../apps/landing/index.html", import.meta.url), "utf8")
  const referrerTags = html.match(/<meta\s+name="referrer"[^>]*>/g) ?? []
  assert.equal(referrerTags.length, 1, "deveria existir exatamente uma meta referrer")

  // Compara o valor EXATO do atributo content — nunca substring — porque
  // "origin-when-cross-origin" é uma substring literal (sufixo) do valor
  // CORRETO "strict-origin-when-cross-origin"; uma checagem de substring
  // classificaria o próprio valor certo como proibido (falso positivo
  // encontrado e corrigido nesta rodada, E2.5-E2.1).
  const contentMatch = /content="([^"]*)"/.exec(referrerTags[0])
  assert.ok(contentMatch, "atributo content não encontrado na meta referrer")
  const contentValue = contentMatch[1]

  const FORBIDDEN_EXACT_VALUES = ["unsafe-url", "origin-when-cross-origin", "no-referrer-when-downgrade"]
  assert.ok(
    !FORBIDDEN_EXACT_VALUES.includes(contentValue),
    `content="${contentValue}" não deveria ser um dos valores proibidos: ${FORBIDDEN_EXACT_VALUES.join(", ")}`,
  )
  assert.equal(contentValue, "strict-origin-when-cross-origin")
})

test("index.html: meta referrer aparece ANTES do favicon, do Google Fonts, do bootstrap do convite e do Meta Pixel", () => {
  const html = fs.readFileSync(new URL("../apps/landing/index.html", import.meta.url), "utf8")
  const referrerIndex = html.indexOf('name="referrer"')
  const faviconIndex = html.indexOf('rel="icon"')
  const fontsIndex = html.indexOf("fonts.googleapis.com")
  const bootstrapIndex = html.indexOf(INVITE_TOKEN_GLOBAL_KEY)
  const pixelIndex = html.indexOf("fbq('init'")
  assert.ok(referrerIndex >= 0, "meta referrer não encontrada")
  assert.ok(referrerIndex < faviconIndex, "meta referrer deveria vir antes do favicon")
  assert.ok(referrerIndex < fontsIndex, "meta referrer deveria vir antes do link do Google Fonts")
  assert.ok(referrerIndex < bootstrapIndex, "meta referrer deveria vir antes do bootstrap do convite")
  assert.ok(referrerIndex < pixelIndex, "meta referrer deveria vir antes do Meta Pixel")
})

// =========================================================================
// SEGURANÇA ESTÁTICA — nunca storage/cookie/IndexedDB pro token
// =========================================================================

test("segurança estática: arquivos novos da página de convite nunca CHAMAM localStorage/sessionStorage/cookie/IndexedDB (podem mencionar em comentário explicando que não usam)", () => {
  for (const path of [
    "../apps/landing/src/lib/ambassadorInvite.ts",
    "../apps/landing/src/hooks/useAmbassadorInviteToken.ts",
    "../apps/landing/src/pages/EmbaixadoraConvitePage.tsx",
  ]) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8")
    // Remove comentários de bloco e de linha antes de checar — os arquivos
    // MENCIONAM esses termos em comentários explicando a decisão de não
    // usá-los, o que é documentação legítima, não uma chamada real (mesmo
    // padrão de create-ambassador-invite.test.mjs, teste do Math.random).
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    assert.doesNotMatch(codeOnly, /localStorage|sessionStorage|indexedDB|document\.cookie/i)
  }
})

test("segurança estática: o token nunca é passado como query string/URL para as Edge Functions — só no corpo POST", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/lib/ambassadorInvite.ts", import.meta.url), "utf8")
  assert.doesNotMatch(source, /[?&]token=/)
  assert.match(source, /body:\s*\{\s*token\s*\}/)
  assert.match(source, /body:\s*\{\s*token,\s*password\s*\}/)
})

// =========================================================================
// SENHA
// =========================================================================

test("validatePasswordFields: vazia -> mensagem", () => {
  assert.match(validatePasswordFields("", ""), /preencha/i)
})

test("validatePasswordFields: curta demais (<6) -> mensagem", () => {
  assert.match(validatePasswordFields("12345", "12345"), /pelo menos 6/i)
})

test("validatePasswordFields: no limite mínimo exato (6) -> válida", () => {
  assert.equal(validatePasswordFields("123456", "123456"), null)
})

test("validatePasswordFields: longa demais (>128) -> mensagem", () => {
  const longa = "x".repeat(129)
  assert.match(validatePasswordFields(longa, longa), /longa demais/i)
})

test("validatePasswordFields: no limite máximo exato (128) -> válida", () => {
  const noLimite = "x".repeat(128)
  assert.equal(validatePasswordFields(noLimite, noLimite), null)
})

test("validatePasswordFields: confirmação diferente -> mensagem", () => {
  assert.match(validatePasswordFields("senha123", "outraSenha"), /não coincidem/i)
})

test("validatePasswordFields: válida -> null (sem erro)", () => {
  assert.equal(validatePasswordFields("senha-boa-123", "senha-boa-123"), null)
})

// =========================================================================
// DOUBLE SUBMIT
// =========================================================================

test("createSubmissionGuard: duas chamadas simultâneas executam a tarefa só uma vez", async () => {
  const guard = createSubmissionGuard()
  let calls = 0
  let release
  const blocked = new Promise((resolve) => {
    release = resolve
  })
  const task = async () => {
    calls++
    await blocked
  }
  const first = guard.run(task)
  assert.equal(guard.isPending(), true)
  await guard.run(task) // segunda chamada enquanto a primeira ainda está pendente -> no-op
  assert.equal(calls, 1)
  release()
  await first
  assert.equal(guard.isPending(), false)
})

test("createSubmissionGuard: depois de concluída, uma nova chamada explícita executa de novo", async () => {
  const guard = createSubmissionGuard()
  let calls = 0
  await guard.run(async () => {
    calls++
  })
  await guard.run(async () => {
    calls++
  })
  assert.equal(calls, 2)
})

// =========================================================================
// VALIDATE — respostas
// =========================================================================

test("parseValidateBody: valido com nome/email -> kind valido", () => {
  assert.deepEqual(parseValidateBody({ status: "valido", nome: "Maria", email: "maria@email.com" }), {
    kind: "valido",
    nome: "Maria",
    email: "maria@email.com",
  })
})

test("parseValidateBody: invalido, malformado ou nulo -> kind invalido", () => {
  for (const body of [{ status: "invalido" }, {}, null, { status: "valido" }, { status: "valido", nome: 123, email: "x@x.com" }]) {
    assert.deepEqual(parseValidateBody(body), { kind: "invalido" })
  }
})

test("validateInvite: resposta valido -> kind valido com nome/email", async () => {
  const invoke = async () => ({ data: { status: "valido", nome: "Maria", email: "maria@email.com" }, error: null })
  const result = await validateInvite(REAL_TOKEN, invoke)
  assert.deepEqual(result, { kind: "valido", nome: "Maria", email: "maria@email.com" })
})

test("validateInvite: resposta invalido -> kind invalido", async () => {
  const invoke = async () => ({ data: { status: "invalido" }, error: null })
  assert.deepEqual(await validateInvite(REAL_TOKEN, invoke), { kind: "invalido" })
})

test("validateInvite: erro de rede (FunctionsFetchError) -> kind erro (recuperável, nunca invalido)", async () => {
  const invoke = async () => ({ data: null, error: new FunctionsFetchError(new Error("network down")) })
  assert.deepEqual(await validateInvite(REAL_TOKEN, invoke), { kind: "erro" })
})

test("validateInvite: 500 interno (FunctionsHttpError) -> kind erro", async () => {
  const invoke = async () => ({
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error: "internal_error" }), { status: 500 })),
  })
  assert.deepEqual(await validateInvite(REAL_TOKEN, invoke), { kind: "erro" })
})

test("validateInvite: chama a function com o token só no body, nunca em query/headers customizados", async () => {
  const calls = []
  const invoke = async (name, options) => {
    calls.push({ name, options })
    return { data: { status: "invalido" }, error: null }
  }
  await validateInvite(REAL_TOKEN, invoke)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, "validate-ambassador-invite")
  assert.deepEqual(calls[0].options, { body: { token: REAL_TOKEN } })
})

// =========================================================================
// REDEEM — respostas
// =========================================================================

test("parseRedeemBody: sucesso/invalido/qualquer outra coisa", () => {
  assert.deepEqual(parseRedeemBody({ status: "sucesso" }), { kind: "sucesso" })
  assert.deepEqual(parseRedeemBody({ status: "invalido" }), { kind: "invalido" })
  assert.deepEqual(parseRedeemBody({}), { kind: "erro" })
  assert.deepEqual(parseRedeemBody(null), { kind: "erro" })
})

test("redeemInvite: sucesso", async () => {
  const invoke = async () => ({ data: { status: "sucesso" }, error: null })
  assert.deepEqual(await redeemInvite(REAL_TOKEN, "senha123", invoke), { kind: "sucesso" })
})

test("redeemInvite: invalido (200, claim não adquirido)", async () => {
  const invoke = async () => ({ data: { status: "invalido" }, error: null })
  assert.deepEqual(await redeemInvite(REAL_TOKEN, "senha123", invoke), { kind: "invalido" })
})

test("redeemInvite: senha_invalida (400, resposta HTTP real) -> kind senha_invalida", async () => {
  const invoke = async () => ({
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error: "senha_invalida" }), { status: 400 })),
  })
  assert.deepEqual(await redeemInvite(REAL_TOKEN, "123", invoke), { kind: "senha_invalida" })
})

test("redeemInvite: erro operacional conhecido (500, resposta HTTP real) -> kind erro (nunca incerto — sabemos que falhou)", async () => {
  const invoke = async () => ({
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error: "nao_foi_possivel_criar_acesso" }), { status: 500 })),
  })
  assert.deepEqual(await redeemInvite(REAL_TOKEN, "senha123", invoke), { kind: "erro" })
})

test("redeemInvite: falha de rede (FunctionsFetchError, nenhuma resposta chegou) -> kind incerto — NUNCA erro comum", async () => {
  const invoke = async () => ({ data: null, error: new FunctionsFetchError(new Error("network down")) })
  assert.deepEqual(await redeemInvite(REAL_TOKEN, "senha123", invoke), { kind: "incerto" })
})

test("redeemInvite: falha de relay (FunctionsRelayError) -> kind incerto — ambíguo se o servidor processou", async () => {
  const invoke = async () => ({ data: null, error: new FunctionsRelayError(new Response(null, { status: 502 })) })
  assert.deepEqual(await redeemInvite(REAL_TOKEN, "senha123", invoke), { kind: "incerto" })
})

test("redeemInvite: erro sem corpo JSON parseável -> kind erro (não senha_invalida), nunca lança", async () => {
  const invoke = async () => ({
    data: null,
    error: new FunctionsHttpError(new Response("<html>erro</html>", { status: 500 })),
  })
  assert.deepEqual(await redeemInvite(REAL_TOKEN, "senha123", invoke), { kind: "erro" })
})

test("redeemInvite: chama a function com token+password só no body, nunca email/nome/papel — mesmo se alguém tentasse injetar via chamador", async () => {
  const calls = []
  const invoke = async (name, options) => {
    calls.push({ name, options })
    return { data: { status: "sucesso" }, error: null }
  }
  await redeemInvite(REAL_TOKEN, "senha123", invoke)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, "redeem-ambassador-invite")
  assert.deepEqual(calls[0].options, { body: { token: REAL_TOKEN, password: "senha123" } })
})

// =========================================================================
// App.tsx — asserções de código-fonte (roteamento manual, sem router)
// =========================================================================

test("App.tsx: rota /embaixadoras/convite é tratada ANTES do fallback LandingPage, e nenhum hook de tracking roda fora de LandingPage", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/App.tsx", import.meta.url), "utf8")
  assert.match(source, /SANITIZED_INVITE_PATH/)
  assert.match(source, /<EmbaixadoraConvitePage/)
  const embaixadoraIndex = source.indexOf("EmbaixadoraConvitePage />")
  const landingFallbackIndex = source.lastIndexOf("<LandingPage />")
  assert.ok(embaixadoraIndex < landingFallbackIndex, "a rota da Embaixadora precisa ser verificada antes do fallback <LandingPage/>")
})

test("App.tsx: useSessionId/useUtmParams/useLandingTracking continuam só dentro de LandingPage — não foram movidos pro nível de App()", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/App.tsx", import.meta.url), "utf8")
  const landingFnIndex = source.indexOf("function LandingPage()")
  const appFnIndex = source.indexOf("function App()")
  assert.ok(landingFnIndex >= 0 && appFnIndex > landingFnIndex, "esperava LandingPage() definida antes de App() no arquivo")
  const landingBody = source.slice(landingFnIndex, appFnIndex)
  const appBody = source.slice(appFnIndex)
  assert.match(landingBody, /useSessionId\(\)/)
  assert.match(landingBody, /useUtmParams\(\)/)
  assert.match(landingBody, /useLandingTracking\(/)
  assert.ok(
    !/useSessionId\(\)|useUtmParams\(\)|useLandingTracking\(/.test(appBody),
    "App() não deveria chamar nenhum desses hooks diretamente — só LandingPage() deve",
  )
})

// =========================================================================
// EmbaixadoraConvitePage.tsx — E2.5-E2.1 (achados BAIXO 2 e 3 da auditoria
// E2.5-E2). Este repo não tem infraestrutura de teste de componente React
// (sem @testing-library/react/jsdom) e a correção não extraiu a lógica de
// limpeza/cancelled para um helper puro (fora de escopo desta
// microcorreção) — por isso estes são testes ESTÁTICOS DE SOURCE
// deliberados, não testes de lógica real. Documentado explicitamente como
// limitação no relatório, não apresentado como prova mais forte do que é.
// =========================================================================

test("EmbaixadoraConvitePage.tsx: sucesso e incerto limpam password e confirmPassword (setPassword/setConfirmPassword) — verificação estática de source", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/pages/EmbaixadoraConvitePage.tsx", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

  const successBlock = /if \(result\.kind === "sucesso"\) \{([\s\S]*?)\n {6}\}/.exec(codeOnly)
  const uncertainBlock = /if \(result\.kind === "incerto"\) \{([\s\S]*?)\n {6}\}/.exec(codeOnly)
  assert.ok(successBlock, "bloco do resultado 'sucesso' não encontrado em handleSubmit")
  assert.ok(uncertainBlock, "bloco do resultado 'incerto' não encontrado em handleSubmit")

  assert.match(successBlock[1], /setPassword\(""\)/, "sucesso deveria limpar password")
  assert.match(successBlock[1], /setConfirmPassword\(""\)/, "sucesso deveria limpar confirmPassword")
  assert.match(uncertainBlock[1], /setPassword\(""\)/, "incerto deveria limpar password")
  assert.match(uncertainBlock[1], /setConfirmPassword\(""\)/, "incerto deveria limpar confirmPassword")
})

test("EmbaixadoraConvitePage.tsx: resultados com retry (senha_invalida/invalido/erro) NÃO limpam a senha — preservada de propósito pra reenvio", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/pages/EmbaixadoraConvitePage.tsx", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  // O bloco que monta `mensagem` (senha_invalida/invalido/erro) e finaliza
  // com setState({kind:"formulario",...}) não deveria conter setPassword.
  const retryBlockStart = codeOnly.indexOf("const mensagem =")
  const retryBlockEnd = codeOnly.indexOf("setState({ kind: \"formulario\", nome, email, erro: mensagem })")
  assert.ok(retryBlockStart >= 0 && retryBlockEnd > retryBlockStart)
  const retryBlock = codeOnly.slice(retryBlockStart, retryBlockEnd)
  assert.ok(!/setPassword\(""\)/.test(retryBlock), "resultado com retry não deveria limpar a senha")
})

test("EmbaixadoraConvitePage.tsx: efeito inicial de validate usa flag cancelled (mesmo padrão de FichaPage.tsx) — verificação estática de source", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/pages/EmbaixadoraConvitePage.tsx", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /let cancelled = false/)
  assert.match(codeOnly, /if \(cancelled \|\| !mounted\.current\) return/)
  assert.match(codeOnly, /return \(\) => \{\s*cancelled = true\s*\}/)
})

test("FichaPage.tsx: confirma o precedente real (mesmo padrão cancelled) que EmbaixadoraConvitePage.tsx replica — não presumido", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/pages/FichaPage.tsx", import.meta.url), "utf8")
  assert.match(source, /let cancelled = false/)
  assert.match(source, /return \(\) => \{\s*cancelled = true\s*\}/)
})
