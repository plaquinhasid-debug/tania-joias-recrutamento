-- QUALIFICACAO-002, Parte 1 — coleta estruturada de "Estabilidade
-- Profissional" (regularidade da atividade profissional AUTODECLARADA pela
-- candidata). NÃO representa risco de inadimplência — é só um dado
-- operacional consultivo, NÃO usada em calcularIpr()/decidirStatus()/
-- classificarPerfil() (ver supabase/functions/finalize-candidate/index.ts).
--
-- Enum nativo (não text+check) para seguir o mesmo padrão já usado por
-- `perfil_comercial_enum`/`lead_status` nesta mesma tabela — arquitetura
-- existente, não uma escolha nova.
--
-- Nullable de propósito: leads criados antes desta migration ficam com
-- estabilidade_profissional = null (não é feito backfill inventando
-- classificação pra leads antigos).

create type estabilidade_profissional_enum as enum ('ALTA', 'MEDIA', 'BAIXA');

alter table leads
  add column estabilidade_profissional estabilidade_profissional_enum null;

comment on column leads.estabilidade_profissional is
  'Regularidade da atividade profissional AUTODECLARADA pela candidata (QUALIFICACAO-002). Não é medida de risco de inadimplência, não participa do IPR/status/perfil_comercial — apenas informação operacional consultiva. NULL para leads anteriores a esta migration ou quando a resposta não corresponde a nenhuma das 3 opções conhecidas.';
