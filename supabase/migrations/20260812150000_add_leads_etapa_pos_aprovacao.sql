-- Etapas pós-aprovação no Kanban do Admin — acompanhar o que acontece com
-- uma candidata DEPOIS de aprovada (contatada, confirmada, virou revendedora
-- ativa, ou desistiu no meio do caminho).
--
-- Só tem sentido quando leads.status = 'aprovada'. NÃO participa de
-- calcularIpr()/decidirStatus()/classificarPerfil() nem do evento Meta Lead
-- (ver supabase/functions/finalize-candidate/index.ts e
-- apps/admin/src/hooks/useLeadDetail.ts) — é só um controle manual da
-- equipe no Kanban, adicional ao `status` que já existia.
--
-- Nullable de propósito: leads aprovadas antes desta migration ficam com
-- etapa_pos_aprovacao = null (aparecem na coluna "Aprovada" do Kanban, sem
-- backfill inventando em que etapa elas estariam).

create type etapa_pos_aprovacao_enum as enum ('contatada', 'confirmada', 'ativa', 'desistiu');

alter table leads
  add column etapa_pos_aprovacao etapa_pos_aprovacao_enum null;

comment on column leads.etapa_pos_aprovacao is
  'Etapa do funil pós-aprovação no Kanban do Admin. Só relevante quando status = aprovada. NULL = ainda não avançou (fica na coluna "Aprovada"). Não participa de calcularIpr/decidirStatus/classificarPerfil nem do evento Meta Lead — é controle manual da equipe.';
