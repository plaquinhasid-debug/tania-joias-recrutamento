// Edge Function: sofia-config (FEATURE-004 + FEATURE-005 Parte 5)
//
// Devolve, pra Landing, quais flags de comportamento da Sofia estão
// ativas: `perguntas_ia_ativa` (FEATURE-004) e, desde a Parte 5,
// `conducao_natural_modo` (FEATURE-005 — "OFF" | "SHADOW" | "ACTIVE").
// Chamada UMA VEZ por conversa (`useSofiaFlow.ts`, em `beginIntro`), o
// resultado fica em cache no cliente pelo resto da sessão.
//
// Por quê uma Edge Function e não o cliente lendo `settings` direto: a
// tabela `settings` só tem política de RLS para o papel `authenticated`
// (usado pelo Admin) — a Landing usa o papel `anon`, que não tem acesso.
// Em vez de abrir uma política nova de RLS pra `anon`, o flag é checado
// aqui, com a service role — mesmo padrão já usado em `sofia-reagir`.
//
// Sempre responde 200. Em qualquer falha (settings ausente, JSON inválido,
// valor desconhecido, erro de leitura), cada campo cai no próprio
// fail-safe — nunca um erro que impeça a Landing de iniciar:
//   perguntas_ia_ativa    -> false
//   conducao_natural_modo -> "OFF"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

type SofiaPerguntasIaAtiva = { ativa: boolean }

// Duplicação deliberada de `naturalConversationModeSchema`
// (`packages/shared/src/schemas.ts`) — Edge Functions (Deno) não importam
// `@tania-joias/shared`, mesmo padrão já documentado ali pra
// `agentAiGatewayResponseSchema`. Mudanças nos valores aceitos precisam ser
// replicadas nos dois lados.
const NATURAL_CONVERSATION_MODES = ["OFF", "SHADOW", "ACTIVE"] as const
type NaturalConversationMode = (typeof NATURAL_CONVERSATION_MODES)[number]

/** Nunca lança — qualquer formato inesperado cai em `"OFF"` (fail-safe). */
function resolveConducaoNaturalModo(valor: unknown): NaturalConversationMode {
  if (typeof valor !== "object" || valor === null) return "OFF"
  const modo = (valor as { modo?: unknown }).modo
  if (typeof modo === "string" && (NATURAL_CONVERSATION_MODES as readonly string[]).includes(modo)) {
    return modo as NaturalConversationMode
  }
  return "OFF"
}

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

    const { data: settingRows } = await supabase
      .from("settings")
      .select("chave, valor")
      .in("chave", ["sofia_perguntas_ia_ativa", "sofia_conducao_natural"])

    const perguntasRow = settingRows?.find((r) => r.chave === "sofia_perguntas_ia_ativa")
    const conducaoRow = settingRows?.find((r) => r.chave === "sofia_conducao_natural")

    const perguntasIaAtiva = Boolean((perguntasRow?.valor as SofiaPerguntasIaAtiva | undefined)?.ativa)
    const conducaoNaturalModo = resolveConducaoNaturalModo(conducaoRow?.valor)

    return jsonResponse({
      perguntas_ia_ativa: perguntasIaAtiva,
      conducao_natural_modo: conducaoNaturalModo,
    })
  } catch (err) {
    console.error("[sofia-config] falha ao ler configuração, caindo em desativado", err)
    return jsonResponse({ perguntas_ia_ativa: false, conducao_natural_modo: "OFF" })
  }
})
