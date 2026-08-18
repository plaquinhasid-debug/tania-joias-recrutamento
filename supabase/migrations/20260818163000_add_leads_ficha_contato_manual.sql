-- IMPLEMENTATION-CRM-002A — registra o momento em que um OPERADOR HUMANO
-- confirma ter feito contato manual com a candidata (fila operacional
-- enquanto o template WhatsApp Utility não é aprovado pela Meta, ver
-- IMPLEMENTATION-INTELLIGENCE-015D/CRM-002).
--
-- Deliberadamente separado de `whatsapp_enviado_em`/`lembrete_enviado_em`
-- (que só significam "a Graph API aceitou a requisição", nunca contato real
-- confirmado) e de `whatsapp_messages` (sinais automáticos da Cloud API).
-- Só é preenchido por uma ação explícita do operador no Admin — nunca por
-- efeito colateral de abrir o WhatsApp, gerar a ficha ou qualquer automação.

alter table leads_ficha
  add column if not exists contato_manual_em timestamptz null;

comment on column leads_ficha.contato_manual_em is
  'Momento em que um operador confirmou ter realizado contato manual com a candidata. Não representa envio, entrega ou leitura pela WhatsApp Cloud API.';
