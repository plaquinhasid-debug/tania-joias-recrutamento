-- EMBAIXADORAS TANIA JOIAS V1 — E2.5-B: RPCs de resgate atômico do convite.
--
-- Migration LOCAL desta rodada (E2.5-B) — implementa exatamente o desenho
-- já documentado em 20260915190000 (PARTE 2: CLAIM / TRABALHO EXTERNO /
-- FINALIZA / LIBERA). NÃO foi aplicada em produção nesta rodada — sem
-- db push, sem apply_migration via MCP, sem supabase link. Fica pronta
-- para auditoria (E2.5-C) e só deve ser aplicada remotamente numa etapa
-- posterior explícita.
--
-- Por que RPC (SECURITY DEFINER) em vez de um UPDATE direto via PostgREST
-- disparado pela Edge Function: a comparação de expiração/claim usa o
-- now() do próprio Postgres dentro da MESMA instrução SQL do UPDATE — o
-- desenho da E2.1 já pressupõe isso (WHERE ... invite_expira_em > now()),
-- e uma instrução UPDATE...WHERE...RETURNING é atomicamente segura contra
-- corrida de qualquer forma (RPC ou PostgREST direto); a RPC não adiciona
-- atomicidade que já não existisse, só evita depender do relógio da Edge
-- Function para "agora" e documenta o contrato num único lugar auditável.
--
-- SUPERFÍCIE — mesmo achado já documentado em
-- 20260915210000_revoke_is_equipe_anon_execute.sql: este projeto concede
-- EXECUTE em toda função nova diretamente a anon/authenticated/service_role
-- via ALTER DEFAULT PRIVILEGES (não via PUBLIC) — sem o REVOKE explícito
-- abaixo, qualquer cliente anônimo poderia chamar estas RPCs direto via
-- PostgREST (/rest/v1/rpc/...), pulando inteiramente CORS/validação da
-- Edge Function. Só service_role executa.

-- =========================================================================
-- 1. claim_ambassador_invite — reserva atômica (CLAIM)
-- =========================================================================

create or replace function public.claim_ambassador_invite(
  p_token_hash text,
  p_ttl_seconds integer
)
returns table (
  embaixadora_id uuid,
  claim_id uuid,
  embaixadora_nome text,
  embaixadora_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nomes de coluna de saída (embaixadora_nome/embaixadora_email, não
  -- nome/email) de propósito: RETURNS TABLE cria parâmetros OUT visíveis
  -- como variáveis dentro do corpo da função — se tivessem o mesmo nome
  -- das colunas reais de public.embaixadoras (nome/email), a cláusula
  -- RETURNING abaixo ficaria ambígua entre "a variável OUT" e "a coluna da
  -- tabela". Nomes distintos eliminam a ambiguidade por construção.
  return query
    update public.embaixadoras
    set invite_claim_id = gen_random_uuid(),
        invite_claimed_em = now(),
        invite_claim_expira_em = now() + make_interval(secs => p_ttl_seconds)
    where invite_token_hash = p_token_hash
      and invite_token_usado_em is null
      and invite_expira_em > now()
      and status = 'convidada'
      and (invite_claimed_em is null or invite_claim_expira_em < now())
    returning id, invite_claim_id, nome, email;
end;
$$;

comment on function public.claim_ambassador_invite(text, integer) is
  'Reserva atômica (uma única instrução UPDATE...WHERE...RETURNING) de um convite de Embaixadora para resgate. Devolve 0 linhas se o token não existir, já tiver sido usado, estiver expirado, o status não for mais "convidada", ou já houver uma reserva ativa e não expirada de outra tentativa concorrente — nesses casos o chamador deve tratar como "convite inválido" (resposta minimizada, nunca diferenciar o motivo publicamente, ver E2.5-A seção I). Nunca insere linha nova, nunca apaga nada. Desenho completo comentado em supabase/migrations/20260915190000_add_embaixadoras_invite_hardening.sql (PARTE 2).';

revoke all on function public.claim_ambassador_invite(text, integer) from public, anon, authenticated;
grant execute on function public.claim_ambassador_invite(text, integer) to service_role;

-- =========================================================================
-- 2. finalize_ambassador_invite — confirma o resgate (FINALIZA)
-- =========================================================================

create or replace function public.finalize_ambassador_invite(
  p_embaixadora_id uuid,
  p_claim_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  update public.embaixadoras
  set user_id = p_user_id,
      status = 'ativa',
      invite_token_usado_em = now(),
      invite_claim_id = null,
      invite_claimed_em = null,
      invite_claim_expira_em = null
  where id = p_embaixadora_id
    and invite_claim_id = p_claim_id
    and invite_token_usado_em is null
    and status = 'convidada';

  v_updated := found;
  return v_updated;
end;
$$;

comment on function public.finalize_ambassador_invite(uuid, uuid, uuid) is
  'Confirma o resgate: só grava (user_id, status=ativa, invite_token_usado_em=now()) se invite_claim_id ainda for exatamente o desta tentativa — uma reserva mais nova de outra tentativa concorrente (claim expirado e substituído) faz este UPDATE não casar nenhuma linha, devolvendo false, nunca finalizando por cima de outra execução. Chamar só depois de auth.admin.createUser já ter tido sucesso, nunca antes. Devolve false sem lançar erro — quem chama decide o tratamento (ver redeem-ambassador-invite/handler.ts, cenário de rollback via deleteUser).';

revoke all on function public.finalize_ambassador_invite(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_ambassador_invite(uuid, uuid, uuid) to service_role;

-- =========================================================================
-- 3. release_ambassador_invite_claim — libera antecipadamente (LIBERA)
-- =========================================================================

create or replace function public.release_ambassador_invite_claim(
  p_embaixadora_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released boolean;
begin
  update public.embaixadoras
  set invite_claim_id = null,
      invite_claimed_em = null,
      invite_claim_expira_em = null
  where id = p_embaixadora_id
    and invite_claim_id = p_claim_id;

  v_released := found;
  return v_released;
end;
$$;

comment on function public.release_ambassador_invite_claim(uuid, uuid) is
  'Libera antecipadamente a reserva desta tentativa (falha ao criar o usuário Auth, ou falha na finalização) sem esperar o TTL natural expirar. Mesma proteção de finalize_ambassador_invite: só limpa se invite_claim_id ainda for exatamente o desta tentativa — nunca libera a reserva de uma tentativa mais nova que já substituiu a original por expiração natural.';

revoke all on function public.release_ambassador_invite_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_ambassador_invite_claim(uuid, uuid) to service_role;
