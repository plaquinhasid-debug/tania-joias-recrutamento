-- WhatsApp automático da Ficha de Aprovação — envia o link da Ficha (modelo
-- `ficha_aprovacao_link`, aprovado pela Meta em 14/08) via WhatsApp Cloud API
-- assim que o link é gerado, no lugar do clique manual em "Mandar pelo
-- WhatsApp" (`FichaAprovacaoSection.tsx`). Espelha exatamente o padrão já
-- usado pra mensagem de aprovação (`whatsapp_automatico_enviado_em` /
-- `whatsapp_aprovacao_automatica_ativa`, ver
-- 20260812200000_add_whatsapp_aprovacao_automatica.sql).
--
-- Default da flag é `false` — só liga depois de testar com um número real.

alter table leads_ficha
  add column whatsapp_enviado_em timestamptz null;

comment on column leads_ficha.whatsapp_enviado_em is
  'Timestamp de quando o link da Ficha foi enviado via WhatsApp Cloud API (modelo ficha_aprovacao_link). NULL = ainda não enviado. Garante idempotência, espelha leads.whatsapp_automatico_enviado_em.';

insert into settings (chave, valor, descricao)
values (
  'whatsapp_ficha_automatica_ativa',
  '{"ativa": false}'::jsonb,
  'Controla se o link da Ficha de Aprovação é enviado automaticamente via WhatsApp Cloud API (modelo ficha_aprovacao_link) assim que é gerado, em vez do clique manual em "Mandar pelo WhatsApp". Default false — só liga depois de testar com um número real.'
)
on conflict (chave) do nothing;
