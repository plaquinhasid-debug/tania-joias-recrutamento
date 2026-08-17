import { createClient } from "npm:@supabase/supabase-js@2"
import { createKnowledgeServiceHandler } from "./handler.ts"

function allowedOrigins(): string[] {
  return (Deno.env.get("KNOWLEDGE_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? "")
    .split(",").map((origin) => origin.trim()).filter(Boolean)
}

Deno.serve(createKnowledgeServiceHandler({
  allowedOrigins: allowedOrigins(),
  readPublicKnowledge: async () => {
    const url = Deno.env.get("CONSIGGOLD_SUPABASE_URL")
    const anonKey = Deno.env.get("CONSIGGOLD_SUPABASE_ANON_KEY")
    if (!url || !anonKey) throw new Error("remote_configuration_missing")

    // A credencial é deliberadamente anon/publishable. Nunca adicionar service_role aqui.
    const consigGold = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await consigGold.rpc("listar_conhecimento_publico_vigente")
    if (error) throw new Error("remote_rpc_failed")
    return data
  },
  logError: (code) => console.error("[knowledge-service] fail-closed", code),
}))
