-- IMPLEMENTATION-INTELLIGENCE-015B — torna observável o status real de
-- entrega de mensagens outbound do WhatsApp (Cloud API).
--
-- A 015A comprovou que `leads_ficha.whatsapp_enviado_em` (e o equivalente em
-- `leads`) significa só "a Graph API aceitou a requisição" — nunca
-- "entregue ao celular", "lida" ou "falhou". A Meta manda esses eventos via
-- webhook (`value.statuses`), mas o código de hoje só loga e descarta.
--
-- Estágios independentes (não um único campo `status` sobrescrito): cada
-- `*_at` só é preenchido uma vez (a aplicação usa um filtro
-- `<coluna>=is.null` no PATCH, não uma trava aqui no schema) — assim um
-- webhook duplicado nunca sobrescreve um timestamp já registrado, e a
-- ordem de chegada dos eventos não importa (cada estágio é uma coluna
-- própria, não depende dos outros terem chegado antes).

alter table whatsapp_messages
  add column if not exists sent_at timestamptz null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists read_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists error_code text null,
  add column if not exists error_title text null,
  add column if not exists error_message text null,
  add column if not exists lead_id uuid null references leads(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

comment on column whatsapp_messages.sent_at is
  'Timestamp do evento de status "sent" recebido via webhook (mensagem saiu dos servidores da Meta rumo ao aparelho). NULL = ainda não confirmado.';
comment on column whatsapp_messages.delivered_at is
  'Timestamp do evento de status "delivered" via webhook. NULL = ainda não confirmado.';
comment on column whatsapp_messages.read_at is
  'Timestamp do evento de status "read" via webhook. NULL = ainda não confirmado.';
comment on column whatsapp_messages.failed_at is
  'Timestamp do evento de status "failed" via webhook. NULL = não falhou (ou ainda não sabemos).';
comment on column whatsapp_messages.error_code is
  'Código de erro da Meta (status.errors[0].code) — só presente quando failed_at está preenchido.';
comment on column whatsapp_messages.error_title is
  'Título do erro da Meta (status.errors[0].title).';
comment on column whatsapp_messages.error_message is
  'Detalhe do erro da Meta (status.errors[0].message/error_data.details) — nunca contém token/secret, só o texto que a própria Meta devolve sobre a falha.';
comment on column whatsapp_messages.lead_id is
  'Lead relacionado, quando o envio outbound foi disparado por uma automação (ficha/lembrete). NULL para mensagens sem lead associado (ex.: resposta automática a mensagem inbound).';
comment on column whatsapp_messages.updated_at is
  'Última vez que este registro foi tocado por um evento de status — nunca reescreve created_at (momento do envio/aceite original).';

create index if not exists whatsapp_messages_lead_id_idx
  on whatsapp_messages (lead_id)
  where lead_id is not null;
