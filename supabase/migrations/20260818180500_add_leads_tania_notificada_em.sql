-- IMPLEMENTATION-CRM-004B — coluna de idempotência para a FUTURA notificação
-- automática da Tania via template Utility (ainda não implementada: o
-- template `nova_ficha_tania_utility` ainda não existe/não foi aprovado pela
-- Meta nesta tarefa). Espelha exatamente o padrão já usado por
-- leads.whatsapp_automatico_enviado_em e leads_ficha.whatsapp_enviado_em.
--
-- Significado: "momento em que uma notificação automática para análise foi
-- ACEITA pela Meta" — nunca delivered/read (isso vem de whatsapp_messages).
-- Sem backfill: candidatas antigas ficam com NULL.
alter table leads
  add column if not exists tania_notificada_em timestamptz null;

comment on column leads.tania_notificada_em is
  'Timestamp de quando a notificação automática (template Utility) para a Tania analisar esta candidata foi aceita pela Meta. NULL = ainda não enviada. Garante idempotência: antes de tentar notificar automaticamente, checar se já está preenchido. Não implementado ainda (template Meta pendente de aprovação) — só a coluna existe por enquanto.';
