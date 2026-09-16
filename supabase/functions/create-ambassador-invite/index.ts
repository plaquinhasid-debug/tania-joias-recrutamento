// Edge Function: create-ambassador-invite (E2.2-C1)
//
// Primeira função sensível/administrativa das Embaixadoras: cria um
// convite (linha em public.embaixadoras, status='convidada') a partir do
// Admin, chamada só por equipe autenticada. Único ponto de I/O real
// (Supabase Auth + banco) — toda a lógica de validação/geração/decisão
// vive em logic.ts/handler.ts, testável sem rede.
//
// AUTORIZAÇÃO — nunca confia no frontend:
//   1. extrai o JWT do header Authorization;
//   2. valida-o com supabase.auth.getUser(jwt) (client service-role,
//      passando o JWT explicitamente — isso VALIDA a assinatura, não é
//      "confiar" num UID vindo do body);
//   3. usa um segundo client, com a ANON key + o Authorization original
//      repassado, pra chamar a RPC public.is_equipe() — assim
//      auth.uid() dentro da function SQL resolve pro usuário real da
//      requisição (chamar is_equipe() pelo client service-role sempre
//      devolveria false, já que service-role não carrega JWT de usuário).
// Nunca lê papel/email/user_id do corpo da requisição.
//
// CORS — allowlist de origem (não "*"), mesmo padrão de
// get-ficha/knowledge-service: o convite carrega e-mail/telefone da
// cliente, dado sensível o bastante pra justificar a restrição.
//
// Import de packages/shared/src/phone.ts feito em logic.ts, por caminho
// relativo — ver comentário detalhado lá. Não comprovado com Deno real
// nesta etapa (E2.2-C1); precisa validação na E2.2-C2 antes do deploy.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createCreateAmbassadorInviteHandler, type AuthorizeResult } from "./handler.ts"

function allowedOrigins(): string[] {
  return (Deno.env.get("EMBAIXADORAS_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

// `!` (non-null assertion) é só um artefato de tipos do TypeScript — some na
// compilação, não gera nenhuma checagem em runtime. Uma env var ausente OU
// setada como string vazia passaria por `!` sem erro, deixando
// SUPABASE_URL/keys/EMBAIXADORAS_INVITE_BASE_URL como `undefined`/`""` em
// runtime (achado na auditoria E2.2-C1.1). `requireEnv` fecha esse buraco de
// verdade: falha alto no boot do módulo (antes de `Deno.serve`, logo antes de
// qualquer request/INSERT) se a env var estiver ausente ou vazia.
function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value || value.trim().length === 0) {
    throw new Error(`missing_required_env:${name}`)
  }
  return value
}

const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
// Sem fallback hardcoded pra domínio de produção, de propósito — se não
// configurado, a function deve falhar alto (erro no boot), nunca adivinhar
// um domínio. A normalização de barra final (pra nunca produzir
// "...//TOKEN") vive em handler.ts — não aqui — porque handler.ts é a
// camada pura testável sem Deno; ver comentário em handler.ts junto de
// `inviteUrl` (achado na auditoria E2.2-C1.1).
const EMBAIXADORAS_INVITE_BASE_URL = requireEnv("EMBAIXADORAS_INVITE_BASE_URL")

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function authorize(authorizationHeader: string | null): Promise<AuthorizeResult> {
  if (!authorizationHeader?.startsWith("Bearer ")) return { authorized: false, status: 401 }
  const jwt = authorizationHeader.slice("Bearer ".length).trim()
  if (!jwt) return { authorized: false, status: 401 }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(jwt)
  if (userError || !userData.user) return { authorized: false, status: 401 }

  // Client escopado à requisição (ANON key + o Authorization original) —
  // é isso que faz auth.uid() resolver corretamente dentro de
  // public.is_equipe() no lado do Postgres/PostgREST.
  const requestScopedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorizationHeader } },
  })
  const { data: isEquipeData, error: isEquipeError } = await requestScopedClient.rpc("is_equipe")
  if (isEquipeError || isEquipeData !== true) return { authorized: false, status: 403 }

  return { authorized: true, uid: userData.user.id }
}

Deno.serve(
  createCreateAmbassadorInviteHandler({
    allowedOrigins: allowedOrigins(),
    inviteBaseUrl: EMBAIXADORAS_INVITE_BASE_URL,
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    authorize,
    findExistingEmbaixadora: async ({ telefoneNormalizado, emailNormalizado }) => {
      // Duas queries separadas, cada uma com um único filtro (.eq) — nunca
      // `.or("col.eq.valor,col2.op.valor2")` com valor interpolado cru.
      // `.or()` monta UMA string onde vírgula/parênteses têm significado
      // sintático no parser de filtros do PostgREST; como EMAIL_FORMAT
      // (logic.ts) permite ambos os caracteres no e-mail, um valor
      // adversarial poderia alterar quantas/quais condições o PostgREST
      // entende (achado na auditoria E2.2-C1.1). `.eq()` isolado nunca tem
      // esse problema: cada valor vira um parâmetro de URL individual,
      // sempre url-encoded pela lib — nenhuma vírgula/parêntese no valor
      // jamais é interpretado como sintaxe de filtro.
      //
      // Email: .eq() exato, não .ilike() — decisão da auditoria E2.2-C2.
      // `.ilike()` trata `%`/`_` como wildcards do padrão LIKE; um e-mail
      // legítimo contendo esses caracteres (permitidos por EMAIL_FORMAT)
      // faria a busca casar mais ou menos linhas do que a intenção real de
      // "é este e-mail exato". Comparação exata é correta E suficiente
      // aqui porque: (1) esta função é o ÚNICO ponto de escrita em
      // public.embaixadoras (nenhuma outra function/migration insere
      // nela — confirmado por grep na árvore de supabase/functions e nas
      // migrations); (2) handler.ts SEMPRE normaliza email via
      // `.trim().toLowerCase()` (normalizeAndValidateEmail, logic.ts)
      // antes de chegar aqui e antes do INSERT — logo toda linha em
      // embaixadoras.email é, por construção, sempre lowercase. Não existe
      // (nem pode existir, com o writer atual) uma linha antiga com case
      // misto pra `.ilike()` alcançar e `.eq()` não alcançaria. Se algum
      // dia OUTRO caminho de escrita for adicionado sem essa garantia,
      // revisitar esta decisão — não usar `.ilike()` como salvaguarda
      // preventiva de algo que ainda não existe.
      const byTelefone = await serviceClient
        .from("embaixadoras")
        .select("status")
        .eq("telefone_normalizado", telefoneNormalizado)
        .maybeSingle()
      if (byTelefone.error) throw byTelefone.error
      if (byTelefone.data) return { status: byTelefone.data.status }

      const byEmail = await serviceClient
        .from("embaixadoras")
        .select("status")
        .eq("email", emailNormalizado)
        .maybeSingle()
      if (byEmail.error) throw byEmail.error
      return byEmail.data ? { status: byEmail.data.status } : null
    },
    insertEmbaixadora: async (row) => {
      const { data, error } = await serviceClient
        .from("embaixadoras")
        .insert(row)
        .select("id, nome, status, codigo_referral")
        .single()
      if (error) {
        // supabase-js/PostgREST não expõe `.constraint` direto — só
        // `code`/`message`/`details`. Pra violação de UNIQUE (23505), o
        // Postgres sempre cita o nome da constraint entre aspas na própria
        // mensagem (`duplicate key value violates unique constraint
        // "embaixadoras_telefone_normalizado_key"`) — extrai isso aqui, na
        // borda de I/O, pra handler.ts/logic.ts nunca precisarem conhecer o
        // formato de erro real do Postgrest/Postgres.
        if (error.code === "23505") {
          const constraintMatch = /"([^"]+)"/.exec(error.message ?? "")
          throw { code: "23505" as const, constraint: constraintMatch?.[1] ?? null }
        }
        throw error
      }
      return { id: data.id, nome: data.nome, status: data.status, codigoReferral: data.codigo_referral }
    },
    // Log estruturado e minimizado — nunca grava token, invite_url, e-mail
    // ou telefone (RFC-011-style, mesmo espírito de agent-ai-gateway/logCall).
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "create-ambassador-invite", ts: new Date().toISOString(), ...fields })),
  }),
)
