// Edge Function: get-ficha
//
// Primeira chamada da página pública `/ficha/:token` (Landing) — devolve se
// o link é válido, já foi preenchido, ou está pendente (junto do primeiro
// nome da candidata, só pra saudação). Chamada com o papel `anon`, por isso
// usa service role pra ler `leads_ficha`/`leads` (que só têm política de
// RLS para `authenticated`, mesmo motivo documentado em `sofia-config`).
//
// O token é a ÚNICA credencial da candidata — nunca expõe o `lead_id` nem
// qualquer outro dado da lead além do primeiro nome.
//
// IMPLEMENTATION-LGPD-001A — CORS restrito por allowlist de origem (a Ficha
// pode conter endereço/dados familiares/referências, então "*" era largo
// demais). Reaproveita `AGENT_ALLOWED_ORIGINS` (já configurado em produção
// pro `agent-ai-gateway`) como fallback, com uma variável dedicada
// opcional caso a lista precise divergir no futuro.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createGetFichaHandler, type FichaLookupResult } from "./handler.ts"

function allowedOrigins(): string[] {
  return (Deno.env.get("GET_FICHA_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

Deno.serve(createGetFichaHandler({
  allowedOrigins: allowedOrigins(),
  lookupFicha: async (token): Promise<FichaLookupResult | null> => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: ficha, error } = await supabase
      .from("leads_ficha")
      .select("preenchido_em, leads(nome)")
      .eq("token", token)
      .maybeSingle()

    if (error || !ficha) return null

    const nomeCompleto = (ficha.leads as { nome?: string } | null)?.nome ?? ""
    const primeiroNome = nomeCompleto.trim().split(/\s+/)[0] ?? ""

    return { preenchidoEm: ficha.preenchido_em, primeiroNome }
  },
}))
