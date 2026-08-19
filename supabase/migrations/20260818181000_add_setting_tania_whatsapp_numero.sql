-- IMPLEMENTATION-CRM-004B — fonte de verdade operacional do número da Tania,
-- decisão de negócio aprovada nesta tarefa (substitui os 3 hardcodes
-- antigos e desatualizados em TaniaAprovacaoSection.tsx, submit-ficha/
-- index.ts e apps/admin/api/webhooks/whatsapp.mjs).
--
-- Formato fechado: {"numero": "<DDI+DDD+numero, só dígitos>"}. Leitura
-- server-side (Edge Functions / webhook, via service role) é a via
-- principal; TaniaAprovacaoSection.tsx (browser) também lê esta mesma
-- linha diretamente via RLS "authenticated" — mesmo padrão já usado por
-- todas as outras settings hoje (sofia_ia_ativa, whatsapp_*_ativa etc.),
-- não é um dado secreto (é só o destino de um link wa.me).
insert into settings (chave, valor, descricao)
values (
  'tania_whatsapp_numero',
  '{"numero":"5511946370390"}'::jsonb,
  'Número de WhatsApp oficial da Tania (formato: DDI+DDD+número, só dígitos, ex.: 5511946370390) — fonte de verdade única, usado para notificá-la sobre novas candidatas e para autenticar suas respostas "sim"/"não" via webhook. Trocar aqui em vez de editar código.'
)
on conflict (chave) do nothing;
