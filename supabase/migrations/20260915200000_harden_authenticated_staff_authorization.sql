-- EMBAIXADORAS TANIA JOIAS V1 — E2.1-bis-B: autorização de equipe.
--
-- Migration NOVA, isolada — não altera nem mistura com a E1
-- (20260915180000) nem com a E2.1 de convite (20260915190000). Corrige um
-- risco PRÉ-EXISTENTE do projeto (não introduzido pelas Embaixadoras):
-- `authenticated` tinha acesso amplo demais a tabelas internas, e a
-- distinção "isto é a equipe" nunca foi tecnicamente confiável. Nenhuma
-- tabela de Embaixadoras (`embaixadoras`, `indicacoes_embaixadoras`,
-- `recompensas_embaixadoras`) é tocada aqui — elas já ficaram bloqueadas
-- desde a E1 (RLS sem policy + REVOKE).
--
-- Investigação somente-leitura feita antes desta migration (ver
-- relatório da E2.1-bis-B): `swift-action` (Edge Function já implantada)
-- é o boilerplate padrão do Supabase, não toca nenhuma tabela do
-- projeto — sem dependência das policies alteradas aqui. `logs` foi
-- auditada e incluída (anon_insert_logs usada pelo tracking da Landing,
-- authenticated_select_logs lida só pelo Radar da Sofia no Admin).

-- =========================================================================
-- 1. profiles.papel — o novo default nunca deve ser 'equipe'
-- =========================================================================
--
-- Só muda o DEFAULT — a linha real de equipe (papel='equipe' explícito)
-- NÃO é tocada por este ALTER (DEFAULT só se aplica a INSERTs futuros sem
-- valor explícito, ex.: o INSERT dentro de handle_new_user()). Nenhum
-- UPDATE de dados é feito nesta migration.
alter table profiles alter column papel set default 'sem_papel';

-- CHECK opcional pedido na E2.1-bis-A: adicionado porque confirmei antes
-- (SELECT DISTINCT papel FROM profiles) que só existe hoje o valor
-- 'equipe' (1 linha) — compatível tanto com o valor existente quanto com
-- o novo default 'sem_papel'. Nenhum outro valor de papel é conhecido em
-- lugar nenhum do código ou da documentação (auditoria E2.1-bis-A, seção C).
alter table profiles
  add constraint profiles_papel_check
  check (papel in ('equipe', 'sem_papel'));

comment on column profiles.papel is
  'Papel interno do usuário: "equipe" (única autorização real de staff) ou "sem_papel" (default para qualquer conta nova, inclusive uma futura Embaixadora — profiles NUNCA é a identidade da Embaixadora, que vive em public.embaixadoras). Fonte de verdade de autorização é sempre public.is_equipe(), nunca ler esta coluna direto no cliente.';

-- =========================================================================
-- 2. public.is_equipe() — fonte central de autorização
-- =========================================================================

create or replace function public.is_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and papel = 'equipe'
  )
$$;

comment on function public.is_equipe() is
  'Fonte central de autorização de equipe. SECURITY DEFINER (dono postgres, que tem BYPASSRLS) evita recursão de RLS ao consultar profiles internamente — não é suposição, foi confirmado via pg_roles.rolbypassrls antes desta migration. Nunca aceita parâmetro nem confia em metadata do JWT — só auth.uid() contra a coluna profiles.papel, controlada só pelo servidor (ver GRANT de coluna restrito na seção 5 deste arquivo).';

-- Toda função nova recebe EXECUTE para PUBLIC por padrão no Postgres — o
-- REVOKE explícito é obrigatório, senão `anon` também conseguiria chamar
-- (inofensivo, já que auth.uid() é nulo pra ele, mas sem necessidade).
revoke all on function public.is_equipe() from public;
grant execute on function public.is_equipe() to authenticated;
-- anon: sem GRANT explícito, de propósito.
-- service_role: não precisa — BYPASSRLS, nunca avalia nenhuma policy.

-- =========================================================================
-- 3. Tabelas internas — troca de `true` por `is_equipe()`
-- =========================================================================
-- Regra geral: só policies de `authenticated` são substituídas. Nenhuma
-- policy de `anon` é tocada nesta seção.

-- --- leads ---------------------------------------------------------------
drop policy authenticated_select_leads on leads;
create policy authenticated_select_leads on leads
  for select to authenticated using (is_equipe());

drop policy authenticated_insert_leads on leads;
create policy authenticated_insert_leads on leads
  for insert to authenticated with check (is_equipe());

drop policy authenticated_update_leads on leads;
create policy authenticated_update_leads on leads
  for update to authenticated using (is_equipe()) with check (is_equipe());

drop policy authenticated_delete_leads on leads;
create policy authenticated_delete_leads on leads
  for delete to authenticated using (is_equipe());

-- --- leads_ficha -----------------------------------------------------------
drop policy authenticated_select_leads_ficha on leads_ficha;
create policy authenticated_select_leads_ficha on leads_ficha
  for select to authenticated using (is_equipe());

drop policy authenticated_insert_leads_ficha on leads_ficha;
create policy authenticated_insert_leads_ficha on leads_ficha
  for insert to authenticated with check (is_equipe());

drop policy authenticated_update_leads_ficha on leads_ficha;
create policy authenticated_update_leads_ficha on leads_ficha
  for update to authenticated using (is_equipe()) with check (is_equipe());

drop policy authenticated_delete_leads_ficha on leads_ficha;
create policy authenticated_delete_leads_ficha on leads_ficha
  for delete to authenticated using (is_equipe());

-- --- conversations ---------------------------------------------------------
-- anon_insert_conversations preservada sem alteração (é a Sofia iniciando
-- a conversa da candidata anônima — não tem nada a ver com equipe).
drop policy authenticated_select_conversations on conversations;
create policy authenticated_select_conversations on conversations
  for select to authenticated using (is_equipe());

drop policy authenticated_update_conversations on conversations;
create policy authenticated_update_conversations on conversations
  for update to authenticated using (is_equipe()) with check (is_equipe());

-- --- answers -----------------------------------------------------------
-- anon_insert_answers preservada sem alteração (mesma razão).
drop policy authenticated_select_answers on answers;
create policy authenticated_select_answers on answers
  for select to authenticated using (is_equipe());

-- --- ai_analysis -----------------------------------------------------------
drop policy authenticated_select_ai_analysis on ai_analysis;
create policy authenticated_select_ai_analysis on ai_analysis
  for select to authenticated using (is_equipe());

-- --- whatsapp_messages -------------------------------------------------
drop policy authenticated_select_whatsapp_messages on whatsapp_messages;
create policy authenticated_select_whatsapp_messages on whatsapp_messages
  for select to authenticated using (is_equipe());

-- --- settings ------------------------------------------------------------
drop policy authenticated_all_settings on settings;
create policy authenticated_all_settings on settings
  for all to authenticated using (is_equipe()) with check (is_equipe());

-- --- campaigns -----------------------------------------------------------
-- public_select_campaigns (anon+authenticated, ativa=true) preservada SEM
-- ALTERAÇÃO — é pública por design, sem relação com autorização de
-- equipe (auditoria E2.1-bis-A, seção L: nenhum código usa esta tabela
-- hoje, mas a policy pública é intencional e não deve ser tocada).
drop policy authenticated_all_campaigns on campaigns;
create policy authenticated_all_campaigns on campaigns
  for all to authenticated using (is_equipe()) with check (is_equipe());

-- --- logs ------------------------------------------------------------------
-- anon_insert_logs preservada sem alteração (tracking da Landing:
-- landing_view/ad_click/chat_iniciado etc., apps/landing/src/lib/api.ts).
drop policy authenticated_select_logs on logs;
create policy authenticated_select_logs on logs
  for select to authenticated using (is_equipe());

-- --- profiles --------------------------------------------------------------
drop policy authenticated_select_profiles on profiles;
create policy authenticated_select_profiles on profiles
  for select to authenticated using (is_equipe() or auth.uid() = id);

-- self_update_profile (USING/WITH CHECK auth.uid()=id) é preservada como
-- POLICY — mas sozinha ela não é suficiente, ver bloco 4 abaixo.

-- =========================================================================
-- 4. BLOQUEADOR CRÍTICO — self_update_profile permitia autopromoção
-- =========================================================================
--
-- Confirmado por catálogo (information_schema.column_privileges), não
-- suposto: `authenticated` tinha GRANT de UPDATE a nível de COLUNA em
-- TODAS as colunas de profiles, incluindo `papel`, `id` e `created_at`.
-- RLS controla LINHA (self_update_profile só garante "é a sua própria
-- linha"), nunca COLUNA — então, sem esta correção, qualquer
-- `authenticated` (inclusive uma futura Embaixadora) conseguiria hoje:
--   UPDATE profiles SET papel = 'equipe' WHERE id = auth.uid();
-- e teria sucesso, escalando pra equipe sozinho. Reescrever a policy não
-- resolveria isso (o problema não é QUAL linha, é QUAL coluna) — a
-- correção certa é reduzir o GRANT de coluna: `authenticated` passa a só
-- poder alterar `nome`/`email` da própria linha, nunca `papel`, `id` ou
-- `created_at`. is_equipe() nunca deve depender de uma coluna que o
-- próprio usuário consiga escrever — com isto, deixa de ser possível.
revoke update on profiles from authenticated;
grant update (nome, email) on profiles to authenticated;

comment on column profiles.email is
  'Editável pela própria conta (self_update_profile + GRANT de coluna restrito). Nunca papel, id ou created_at — ver bloqueio de autopromoção nesta migration.';
