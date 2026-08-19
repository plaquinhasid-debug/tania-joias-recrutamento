// IMPLEMENTATION-CRM-004B — fonte única do número de WhatsApp da Tania para
// Edge Functions (Deno), substituindo os hardcodes antigos e desatualizados
// espalhados em `submit-ficha/index.ts` e (via sua própria cópia Node, ver
// `apps/admin/api/webhooks/whatsapp.mjs`) no webhook da Vercel.
//
// `settings.tania_whatsapp_numero` é a fonte de verdade operacional
// (decisão de negócio, ver migration `20260818181000_add_setting_tania_
// whatsapp_numero.sql`) — trocar o número ali não exige deploy. O env var
// `TANIA_WHATSAPP_NOTIFICATION_NUMBER` é só um fallback pra indisponibilidade
// pontual da tabela `settings`, nunca a fonte principal.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2"

/**
 * Lê `settings.tania_whatsapp_numero`; se a linha não existir ou a tabela
 * estiver indisponível, cai pro env var `TANIA_WHATSAPP_NOTIFICATION_NUMBER`.
 * Devolve `null` (nunca lança) se nenhuma das duas fontes tiver o número —
 * o chamador decide como degradar (best-effort, nunca deve travar a lead).
 */
export async function getTaniaWhatsappNumero(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("settings")
      .select("valor")
      .eq("chave", "tania_whatsapp_numero")
      .maybeSingle()
    const numero = (data?.valor as { numero?: unknown } | undefined)?.numero
    if (typeof numero === "string" && numero.trim()) return numero.trim()
  } catch (err) {
    console.error("[tania-whatsapp-numero] falha ao ler settings, tentando fallback", err)
  }

  const fallback = Deno.env.get("TANIA_WHATSAPP_NOTIFICATION_NUMBER")
  return fallback && fallback.trim() ? fallback.trim() : null
}
