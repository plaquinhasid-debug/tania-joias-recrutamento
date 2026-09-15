-- EMBAIXADORAS TANIA JOIAS V1 — E2.1: endurecimento do convite.
--
-- Migration NOVA, separada da E1 já aplicada (20260915180000). Só altera
-- public.embaixadoras — nenhuma outra tabela é tocada aqui.
--
-- Pré-condição verificada por SELECT somente-leitura antes de escrever
-- este arquivo: `select count(*) from embaixadoras` = 0. Por isso é seguro
-- trocar `invite_token` por `invite_token_hash` e tornar `email` NOT NULL
-- sem nenhum backfill — não existe nenhum convite real ainda.

-- =========================================================================
-- PARTE 1 — decisões já aprovadas (seção 2 do pedido da E2.1)
-- =========================================================================

-- 1a. invite_token (uuid bruto) -> invite_token_hash (hash SHA-256 hex).
-- O token bruto nunca é persistido: é gerado uma única vez pela futura
-- Edge Function de criação de convite, devolvido na resposta (e no link
-- que a Tania copia), e só o hash SHA-256 hex dele fica no banco. Reduz o
-- risco de um vazamento de leitura do banco (SELECT amplo demais liberado
-- por engano, export, backup) permitir resgatar convites pendentes —
-- mesmo com o hash exposto, o token bruto não é recuperável dele.
alter table embaixadoras drop column invite_token;

alter table embaixadoras
  add column invite_token_hash text not null;

alter table embaixadoras
  add constraint embaixadoras_invite_token_hash_key unique (invite_token_hash);

-- SHA-256 em hexadecimal: exatamente 64 caracteres, só dígitos e a-f
-- minúsculo — mesmo formato produzido pelo helper `sha256Hex` já existente
-- em supabase/functions/_shared/meta-conversions.ts
-- (`.map(b => b.toString(16).padStart(2,"0"))`, sempre minúsculo). Esta
-- CHECK é uma proteção estrutural de formato, não uma prova de que o hash
-- foi calculado corretamente — isso continua sendo responsabilidade da
-- Edge Function que gerar/validar o convite (E2.4).
alter table embaixadoras
  add constraint embaixadoras_invite_token_hash_check
  check (invite_token_hash ~ '^[0-9a-f]{64}$');

comment on column embaixadoras.invite_token_hash is
  'Hash SHA-256 (hex, 64 chars) do token bruto de convite. O token bruto NUNCA é persistido — só existe na resposta da Edge Function de criação e no link enviado à cliente. Substitui invite_token (uuid bruto) da E1, ver auditoria E2-A item G.';

-- 1b. Expiração do convite — 7 dias, default seguro no próprio banco (não
-- depende da Edge Function lembrar de calcular isso).
alter table embaixadoras
  add column invite_expira_em timestamptz not null default (now() + interval '7 days');

comment on column embaixadoras.invite_expira_em is
  'Convite deixa de poder ser resgatado depois deste momento (7 dias após a criação, por padrão). "Expirado" é um estado DERIVADO na leitura (invite_expira_em < now() AND invite_token_usado_em IS NULL) — não vira um novo valor de embaixadora_status_enum, ver auditoria E2-A item Q.';

-- 1c. email obrigatório — é o identificador de login do Supabase Auth
-- (E2-A item K: telefone continua sendo a chave de negócio/dedup, nunca
-- vira credencial). Seguro trocar para NOT NULL porque a tabela está
-- vazia (verificado por SELECT antes desta migration).
alter table embaixadoras
  alter column email set not null;

comment on column embaixadoras.email is
  'Obrigatório: é o identificador de login do Supabase Auth (signInWithPassword) da Embaixadora, não apenas um dado de contato. telefone_normalizado continua sendo a chave de negócio/dedup, nunca a credencial de login.';

-- =========================================================================
-- PARTE 2 — colunas de claim/reserva (propostas na seção 7 do pedido,
-- justificadas em detalhe no relatório da E2.1 — revisar antes de
-- aprovar; nenhuma lógica de resgate é implementada ainda, isso é E2.4).
-- =========================================================================
--
-- Por que estas 3 colunas são necessárias: a arquitetura aprovada na E2-A
-- (seção 6 deste pedido) proíbe usar `invite_token_usado_em` como marcador
-- de "reserva em processamento" — ele só pode ser preenchido no sucesso
-- final (usuário Auth criado E vinculado). Mas criar o usuário no
-- Supabase Auth é uma chamada HTTP externa (Admin API), não uma operação
-- SQL — não dá pra segurar um lock de linha (`SELECT ... FOR UPDATE`)
-- durante essa chamada sem arriscar prender a linha por um tempo
-- indefinido se a chamada externa travar. A solução mínima e robusta é
-- separar "reservado" de "concluído" em campos distintos, seguindo o
-- padrão de saga (reserva -> trabalho externo -> confirma OU libera):
--
--   1. CLAIM (atômico, só Postgres):
--      UPDATE embaixadoras
--      SET invite_claim_id = gen_random_uuid(),
--          invite_claimed_em = now(),
--          invite_claim_expira_em = now() + interval '3 minutes'
--      WHERE invite_token_hash = $1
--        AND invite_token_usado_em IS NULL
--        AND invite_expira_em > now()
--        AND status = 'convidada'
--        AND (invite_claimed_em IS NULL OR invite_claim_expira_em < now())
--      RETURNING id, invite_claim_id, nome, telefone_normalizado, email;
--      -- Duas requisições concorrentes: só uma vê a condição do WHERE
--      -- como verdadeira e recebe a linha de volta — a outra recebe 0
--      -- linhas (convite "em processamento", pode tentar de novo em
--      -- instantes, já que o claim expira sozinho em poucos minutos).
--
--   2. TRABALHO EXTERNO (fora do banco): criar o usuário no Supabase Auth
--      (auth.admin.createUser) usando o claim acima como prova de que
--      esta é a única execução autorizada a prosseguir.
--
--   3a. FINALIZA (sucesso):
--       UPDATE embaixadoras
--       SET user_id = $novoUserId, status = 'ativa',
--           invite_token_usado_em = now(),
--           invite_claim_id = NULL, invite_claimed_em = NULL,
--           invite_claim_expira_em = NULL
--       WHERE id = $id AND invite_claim_id = $meuClaimId
--         AND invite_token_usado_em IS NULL
--       RETURNING id;
--       -- invite_token_usado_em só é gravado AQUI, nunca antes.
--       -- WHERE invite_claim_id = $meuClaimId garante que uma execução
--       -- "atrasada" (cujo claim já expirou e foi substituído por um
--       -- claim mais novo) não consegue finalizar por cima de outra.
--
--   3b. LIBERA (falha na criação do usuário Auth): mesmo UPDATE de 3a,
--       mas só limpando os 3 campos de claim (sem tocar user_id/status/
--       invite_token_usado_em) — o convite volta a ficar resgatável
--       imediatamente, sem esperar o invite_claim_expira_em natural.
--
-- Sem estas colunas, a única alternativa seria reintroduzir
-- invite_token_usado_em como pseudo-lock (rejeitado explicitamente na
-- seção 6) ou seria manter uma transação SQL aberta durante uma chamada
-- de rede externa (anti-padrão, risco de lock preso). CHECK abaixo
-- garante que os 3 campos são preenchidos/limpos sempre juntos, nunca
-- parcialmente.

alter table embaixadoras
  add column invite_claim_id uuid,
  add column invite_claimed_em timestamptz,
  add column invite_claim_expira_em timestamptz;

alter table embaixadoras
  add constraint embaixadoras_invite_claim_consistency_check
  check (
    (invite_claim_id is null and invite_claimed_em is null and invite_claim_expira_em is null)
    or (invite_claim_id is not null and invite_claimed_em is not null and invite_claim_expira_em is not null)
  );

comment on column embaixadoras.invite_claim_id is
  'Identifica a tentativa de resgate em andamento (distinto de invite_token_hash). NULL = nenhuma reserva ativa. Preenchido só durante a janela entre "reservar o convite" e "criar+vincular o usuário Auth" — nunca sobrevive ao sucesso nem precisa sobreviver à falha (é limpo nos dois casos). Ver plano de resgate atômico na auditoria E2-A/E2.1.';
comment on column embaixadoras.invite_claimed_em is
  'Quando a reserva acima foi feita. Junto com invite_claim_expira_em, permite que uma reserva abandonada (ex.: aba fechada no meio do resgate) seja recuperada por uma nova tentativa depois de expirar, sem esperar o invite_expira_em de 7 dias inteiro.';
comment on column embaixadoras.invite_claim_expira_em is
  'TTL curto (minutos, não dias) da reserva acima — decidido pela Edge Function no momento do claim, não tem default fixo no banco porque é um detalhe de implementação da E2.4, não uma política de negócio como invite_expira_em.';
