-- EMBAIXADORAS TANIA JOIAS V1 — E2.6-A: RPC de reenvio de convite.
--
-- Migration LOCAL desta rodada (E2.6-A) — NÃO foi aplicada em produção
-- nesta rodada: sem db push, sem apply_migration via MCP, sem supabase
-- link. Fica pronta para auditoria/aprovação; só deve ser aplicada
-- remotamente numa etapa posterior explícita.
--
-- ORIGEM — achado operacional real (não hipotético) da E2.5-F2-C: o
-- `invite_url` só existe no estado React efêmero do diálogo "Convidar
-- Embaixadora" (ver apps/admin/src/hooks/useCreateAmbassadorInvite.ts,
-- comentário "o resultado secreto vai direto ao estado local do Dialog").
-- Fechar o modal sem copiar o link, ou recarregar a página, destrói o
-- único lugar onde o token bruto existia — e como só o SHA-256 (unidirecional)
-- é persistido, não existe NENHUM caminho para recuperá-lo depois. Esta RPC
-- resolve isso pela via correta: gerar um convite NOVO para a MESMA linha,
-- invalidando o anterior automaticamente pela substituição do hash — nunca
-- tentando "recuperar" o token antigo (impossível por design, de propósito).
--
-- ESCOPO — só a coluna invite_token_hash (+ invite_expira_em) da linha já
-- existente é tocada. Nunca altera nome/telefone_normalizado/email/
-- instagram/codigo_referral/status/user_id/aprovada_em/aprovada_por —
-- identidade e histórico da Embaixadora são preservados integralmente.
--
-- CONCORRÊNCIA — duas tentativas de reenvio simultâneas (dois cliques, duas
-- abas, dois membros de equipe) NUNCA podem ambas parecer bem-sucedidas com
-- links diferentes (isso seria um "estado ambíguo": um dos dois links
-- pareceria válido pra quem o recebeu, mas seria silenciosamente
-- substituído pelo outro). Solução: bloqueio otimista via `updated_at`
-- (coluna já existente, já mantida por `embaixadoras_set_updated_at` em
-- TODA UPDATE da linha, sem migration nova pra isso) — o chamador precisa
-- provar que viu o estado mais recente da linha (`p_expected_updated_at`,
-- lido de `list-ambassadors-admin` antes de clicar), e o UPDATE só
-- confirma se `updated_at` ainda for exatamente esse valor no momento da
-- escrita. Se outra tentativa (de reenvio, de resgate/claim, ou qualquer
-- outra alteração da linha) já tiver rodado entre a leitura e a escrita,
-- `updated_at` mudou e o UPDATE não casa nenhuma linha — resposta
-- determinística de "conflito", nunca um segundo link fantasma.
--
-- CLAIM EM ANDAMENTO — mesma condição já usada em claim_ambassador_invite
-- para "nenhuma reserva ativa" (invite_claimed_em is null or
-- invite_claim_expira_em < now()): um reenvio nunca deve invalidar o hash
-- ENQUANTO uma candidata está no meio de um resgate em progresso (janela
-- curta, poucos minutos) — evita cortar o tapete de uma tentativa de
-- resgate legítima já em andamento.
--
-- STATUS — só `status = 'convidada'` é elegível. Uma Embaixadora `ativa`
-- (já resgatou) nunca pode ter o convite "reenviado" — não faria sentido
-- (ela já tem conta) e reabriria uma superfície de ataque (um novo hash
-- válido pra uma conta que já deveria estar fechada). Reforçado no WHERE da
-- RPC (autoridade real) e, em camada adicional, no handler da Edge Function.

create or replace function public.resend_ambassador_invite(
  p_embaixadora_id uuid,
  p_expected_updated_at timestamptz,
  p_new_token_hash text,
  p_new_expira_em timestamptz
)
returns table (
  id uuid,
  invite_expira_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.embaixadoras
    set invite_token_hash = p_new_token_hash,
        invite_expira_em = p_new_expira_em
    where embaixadoras.id = p_embaixadora_id
      and status = 'convidada'
      and invite_token_usado_em is null
      and updated_at = p_expected_updated_at
      and (invite_claimed_em is null or invite_claim_expira_em < now())
    returning embaixadoras.id, embaixadoras.invite_expira_em;
end;
$$;

comment on function public.resend_ambassador_invite(uuid, timestamptz, text, timestamptz) is
  'Gera um novo convite (novo hash + nova expiração de 7 dias) para uma Embaixadora já existente, invalidando automaticamente o hash anterior pela substituição. Só age em status=convidada, invite_token_usado_em IS NULL, sem reserva de resgate ativa, e só se updated_at ainda bater com o valor visto pelo chamador (bloqueio otimista contra dois reenvios concorrentes). Devolve 0 linhas em qualquer uma dessas condições não bater — o chamador (Edge Function resend-ambassador-invite) decide a mensagem, nunca esta RPC. Nunca insere linha nova, nunca apaga nada, nunca toca nome/telefone_normalizado/email/instagram/codigo_referral/status/user_id. Ver E2.6-A.';

revoke all on function public.resend_ambassador_invite(uuid, timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function public.resend_ambassador_invite(uuid, timestamptz, text, timestamptz) to service_role;
