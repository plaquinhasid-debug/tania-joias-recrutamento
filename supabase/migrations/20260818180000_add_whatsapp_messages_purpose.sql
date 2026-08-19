-- IMPLEMENTATION-CRM-004B — separa explicitamente POR QUE uma mensagem
-- outbound foi enviada, independente de qual template/texto foi usado.
-- Sem isso, o selo de status de entrega da Ficha no Kanban
-- (deriveWhatsappDeliveryStatus) e um futuro selo da notificação da Tania
-- competiriam pela mesma linha "mais recente" em whatsapp_messages para o
-- mesmo lead_id, misturando o status de mensagens com propósitos diferentes.
--
-- Aditiva, sem backfill: linhas antigas (todas hoje são do template
-- ficha_aprovacao_link, enviado antes desta coluna existir) ficam com
-- message_purpose NULL. O código de leitura trata NULL como legado
-- equivalente a FICHA_CANDIDATA/LEMBRETE_FICHA (só esses dois propósitos
-- existiam antes desta migration) — nunca equivalente a NOTIFICACAO_TANIA,
-- que é sempre gravado explicitamente a partir de agora.
alter table whatsapp_messages
  add column if not exists message_purpose text null;

alter table whatsapp_messages
  add constraint whatsapp_messages_message_purpose_check
  check (
    message_purpose is null
    or message_purpose in (
      'FICHA_CANDIDATA',
      'LEMBRETE_FICHA',
      'NOTIFICACAO_TANIA',
      'TEXTO_LIVRE',
      'INBOUND'
    )
  );

comment on column whatsapp_messages.message_purpose is
  'Classificação explícita do motivo do envio/recebimento, independente do template usado. NULL = enviado antes desta coluna existir (sempre Ficha, nunca Notificação Tania — essa é sempre explícita). Nunca misturar FICHA_CANDIDATA/LEMBRETE_FICHA com NOTIFICACAO_TANIA na mesma consulta de status.';
