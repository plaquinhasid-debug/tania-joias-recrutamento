-- WhatsApp automático na aprovação — mensagem instantânea via WhatsApp Cloud
-- API (API oficial da Meta) assim que uma candidata é aprovada, seja pela
-- IPR (`finalize-candidate`) seja manualmente pela equipe no Admin
-- (`useLeadDetail.ts`). Espelha exatamente o padrão já usado pro Meta Pixel
-- (`meta_lead_sent_at` / `sofia_ia_ativa`).
--
-- Default da flag é `false` — a equipe só liga depois de concluir o
-- cadastro na Meta (Business Manager + Cloud API + modelo de mensagem
-- aprovado) e testar com um número de teste.

alter table leads
  add column whatsapp_automatico_enviado_em timestamptz null;

comment on column leads.whatsapp_automatico_enviado_em is
  'Timestamp de quando a mensagem automática de aprovação foi enviada via WhatsApp Cloud API. NULL = ainda não enviada. Garante idempotência (nunca reenvia pra mesma lead), espelha meta_lead_sent_at.';

insert into settings (chave, valor, descricao)
values (
  'whatsapp_aprovacao_automatica_ativa',
  '{"ativa": false}'::jsonb,
  'Controla se a mensagem de aprovação é enviada automaticamente via WhatsApp Cloud API (API oficial da Meta) assim que uma candidata é aprovada (pela IPR ou manualmente pela equipe). Default false — só liga depois do cadastro na Meta (Business Manager + Cloud API + modelo de mensagem aprovado) estar concluído e testado.'
)
on conflict (chave) do nothing;
