// Edge Function: sofia-config (FEATURE-004)
//
// Devolve, pra Landing, quais flags de comportamento da Sofia estão
// ativas — hoje só `perguntas_ia_ativa` (liga a Sofia respondendo
// perguntas de negócio reais via IA + base de conhecimento durante a
// conversa). Chamada UMA VEZ por conversa (`useSofiaFlow.ts`, em
// `beginIntro`), o resultado fica em cache no cliente pelo resto da sessão.
//
// Por quê uma Edge Function e não o cliente lendo `settings` direto: a
// tabela `settings` só tem política de RLS para o papel `authenticated`
// (usado pelo Admin) — a Landing usa o papel `anon`, que não tem acesso.
// Em vez de abrir uma política nova de RLS pra `anon`, o flag é checado
// aqui, com a service role — mesmo padrão já usado em `sofia-reagir`.
//
// Sempre responde 200 com `{ perguntas_ia_ativa: boolean }`. Em qualquer
// falha (settings ausente, erro de leitura), cai em `false` — fail-closed:
// se algo der errado, o comportamento é o mesmo de hoje (sem IA
// respondendo perguntas), nunca o oposto.
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

type SofiaPerguntasIaAtiva = { ativa: boolean }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: settingRow } = await supabase
      .from("settings")
      .select("valor")
      .eq("chave", "sofia_perguntas_ia_ativa")
      .maybeSingle()

    const perguntasIaAtiva = Boolean((settingRow?.valor as SofiaPerguntasIaAtiva | undefined)?.ativa)
    return jsonResponse({ perguntas_ia_ativa: perguntasIaAtiva })
  } catch (err) {
    console.error("[sofia-config] falha ao ler configuração, caindo em desativado", err)
    return jsonResponse({ perguntas_ia_ativa: false })
  }
})
