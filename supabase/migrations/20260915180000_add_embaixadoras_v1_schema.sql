-- EMBAIXADORAS TANIA JOIAS V1 — E1-A: modelo de dados mínimo.
--
-- Cria 3 tabelas novas (embaixadoras, indicacoes_embaixadoras,
-- recompensas_embaixadoras). NÃO altera nenhuma tabela existente
-- (leads, leads_ficha, conversations, answers, profiles, settings,
-- campaigns permanecem intocadas).
--
-- Nada aqui está conectado a nenhum fluxo de produção ainda: a futura
-- coluna de referral na tabela de conversas do Sofia, a normalização
-- real de telefone (já existe em packages/shared/src/phone.ts, ver
-- IMPLEMENTATION-EMBAIXADORAS-E0) e qualquer Edge Function pertencem a
-- etapas futuras (E2/E3+).
--
-- ACESSO — Edge Function only, por design (ver auditoria da E0):
-- este projeto concede GRANT total de tabela para `anon`/`authenticated`
-- por padrão em toda tabela nova (confirmado via pg_default_acl), então
-- RLS é a única barreira real hoje. As 3 tabelas abaixo ficam com RLS
-- habilitada e ZERO policies (mesmo padrão já usado em
-- `whatsapp_contacts`, que o próprio advisor do Supabase relata como
-- "rls_enabled_no_policy" — isso já nega 100% do acesso de anon/
-- authenticated por padrão do Postgres) e, como camada adicional
-- explícita, REVOKE de todo privilégio de tabela desses dois roles.
-- `service_role` nunca é tocado: ele já tem BYPASSRLS e continua com o
-- GRANT padrão, então a futura Edge Function do painel da Embaixadora
-- funciona normalmente. Nenhuma Embaixadora ou candidata deve um dia
-- acessar estas tabelas via cliente Supabase direto — sempre por Edge
-- Function que valida `auth.uid()` e devolve uma resposta projetada.
--
-- FORMATO DE TELEFONE — `telefone_normalizado` e
-- `candidata_telefone_normalizado` esperam o formato canônico da E0
-- (`normalizeBrazilianPhone(...).e164`): só dígitos, "55" + DDD + número
-- local (8 ou 9 dígitos) = 12 ou 13 dígitos no total. O CHECK abaixo é
-- deliberadamente uma proteção estrutural simples (formato/tamanho), NÃO
-- uma réplica da validação completa (lista de DDDs, regra do nono
-- dígito) — essa lógica fica só em packages/shared/src/phone.ts. Nenhum
-- trigger de normalização é criado aqui: a normalização é
-- responsabilidade da camada de aplicação (E3).

create type embaixadora_status_enum as enum ('convidada', 'ativa', 'inativa', 'rejeitada');

create type indicacao_embaixadora_status_enum as enum ('atribuida', 'invalidada');

create type recompensa_embaixadora_status_enum as enum ('disponivel', 'pago', 'cancelada');

-- =========================================================================
-- embaixadoras
-- =========================================================================

create table embaixadoras (
  id uuid primary key default gen_random_uuid(),

  -- NULL até o convite ser resgatado e a conta Supabase Auth ser criada.
  -- UNIQUE (quando preenchido) impede uma mesma conta ligada a duas
  -- Embaixadoras — NULL não conflita com NULL em UNIQUE no Postgres, então
  -- múltiplos convites ainda não resgatados convivem sem problema.
  user_id uuid unique references auth.users(id) on delete set null,

  nome text not null,

  telefone_normalizado text not null unique
    check (telefone_normalizado ~ '^55[0-9]{10,11}$'),

  email text,
  instagram text,

  -- Código público de indicação (ex.: "MARIA482"). Identifica a indicação,
  -- NÃO autentica, NÃO é senha, NÃO é o invite_token. Formato controlado
  -- (maiúsculas/dígitos, 6-12 caracteres) pra evitar que diferenças de
  -- caixa colidam por acidente com o UNIQUE, e pra manter o espaço de
  -- códigos grande o bastante pra não ser trivialmente sequencial — a
  -- regra de GERAÇÃO (evitar previsibilidade) é responsabilidade da
  -- camada de aplicação que ainda vai criar isso (E2), não desta
  -- migration, que só define o formato aceitável.
  codigo_referral text not null unique
    check (codigo_referral ~ '^[A-Z0-9]{6,12}$'),

  -- Uso único: credencial de setup de senha, nunca reaproveitada como
  -- login. Mesmo padrão de leads_ficha.token (uuid, não expira por tempo,
  -- só fica "gasto" quando invite_token_usado_em é preenchido).
  invite_token uuid not null unique default gen_random_uuid(),
  invite_token_usado_em timestamptz,

  -- Sem estado "aguardando_aprovacao": no piloto por convite, o ato de
  -- convidar (Tania cria a linha) JÁ É a aprovação — aprovada_em/
  -- aprovada_por são preenchidos no mesmo passo que cria o convite. Um
  -- futuro formulário público de "quero ser Embaixadora" (fora do escopo
  -- desta E1-A) precisaria de um estado pré-convite distinto — não
  -- inventado aqui.
  status embaixadora_status_enum not null default 'convidada',

  aprovada_em timestamptz,
  -- Aponta para `profiles` (não auth.users direto): é assim que a equipe
  -- interna já é modelada no projeto (profiles.papel = 'equipe').
  -- ON DELETE SET NULL: se o profile de quem aprovou for removido um dia,
  -- o registro da Embaixadora e o timestamp aprovada_em não somem — só
  -- perde-se a referência ao autor específico.
  aprovada_por uuid references profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table embaixadoras is
  'Cadastro + convite das Embaixadoras (programa de indicação de novas revendedoras). Acesso só via service role (Edge Function dedicada) — RLS habilitada sem nenhuma policy para anon/authenticated, ver comentário no topo do arquivo de migration. Ainda não conectada a nenhum fluxo (E1-A).';
comment on column embaixadoras.codigo_referral is
  'Código público de indicação (ex.: "MARIA482"). Identifica a indicação, NUNCA autentica — não é senha nem invite_token.';
comment on column embaixadoras.invite_token is
  'Credencial de uso único para o setup de senha da Embaixadora. Distinto do codigo_referral (público) e da sessão Supabase Auth (login recorrente).';

create index embaixadoras_status_idx on embaixadoras(status);

alter table embaixadoras enable row level security;
revoke all on embaixadoras from anon, authenticated;

-- Trigger de updated_at — reaproveita a função já existente no projeto
-- (public.set_updated_at), sem criar uma segunda equivalente.
create trigger embaixadoras_set_updated_at
  before update on embaixadoras
  for each row execute function set_updated_at();

-- =========================================================================
-- indicacoes_embaixadoras
-- =========================================================================

create table indicacoes_embaixadoras (
  id uuid primary key default gen_random_uuid(),

  -- ON DELETE RESTRICT: uma Embaixadora nunca deve poder ser apagada
  -- enquanto tiver indicações vinculadas (o programa já prevê inativação
  -- via `embaixadoras.status`, não DELETE — ver seção de histórico no
  -- relatório da E1-A).
  embaixadora_id uuid not null references embaixadoras(id) on delete restrict,

  -- Nullable + ON DELETE SET NULL: leads de teste já foram apagados
  -- manualmente neste projeto no passado (ver memória de deployment). Se
  -- isso acontecer com um lead que tenha indicação/recompensa vinculada,
  -- a indicação (e a recompensa, se houver) precisa sobreviver — perde-se
  -- só o vínculo direto com a linha de `leads`, nunca o histórico
  -- financeiro. UNIQUE (quando preenchido) garante no máximo 1 indicação
  -- por lead.
  lead_id uuid unique references leads(id) on delete set null,

  -- Garantia central de "PRIMEIRA INDICAÇÃO VÁLIDA VENCE": UNIQUE aqui
  -- impede uma segunda linha de indicação pro mesmo telefone de candidata,
  -- de forma atômica no banco (INSERT ... ON CONFLICT DO NOTHING na E3).
  candidata_telefone_normalizado text not null unique
    check (candidata_telefone_normalizado ~ '^55[0-9]{10,11}$'),

  -- Cópia histórica: preserva qual código foi usado mesmo se
  -- embaixadoras.codigo_referral mudar depois.
  codigo_referral_usado text not null,

  -- Só 2 estados: uma indicação é um vínculo válido ou foi invalidada.
  -- NÃO duplica os estados do recrutamento (em_analise/aprovada/
  -- reprovada/ficha preenchida) — esses continuam vivendo em `leads`. Não
  -- existe um terceiro estado "convertida": a conversão (recebeu o
  -- primeiro mostruário) é sinalizada pela PRESENÇA de uma linha em
  -- `recompensas_embaixadoras` vinculada a esta indicação — duplicar essa
  -- informação aqui seria redundância sem necessidade.
  status indicacao_embaixadora_status_enum not null default 'atribuida',

  primeira_atribuicao_em timestamptz not null default now(),

  invalidada_em timestamptz,
  invalidada_por uuid references profiles(id) on delete set null,
  invalidada_motivo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    (status = 'invalidada' and invalidada_em is not null)
    or (status = 'atribuida' and invalidada_em is null)
  )
);

comment on table indicacoes_embaixadoras is
  'Atribuição permanente Embaixadora -> candidata, por telefone normalizado (E0). "Primeira indicação válida vence" é garantido pelo UNIQUE em candidata_telefone_normalizado. Acesso só via service role. Ainda não conectada a nenhum fluxo (E1-A).';
comment on column indicacoes_embaixadoras.candidata_telefone_normalizado is
  'Chave de deduplicação: telefone da candidata no formato canônico da E0 (normalizeBrazilianPhone). UNIQUE garante que só a primeira indicação válida para este telefone existe.';

create index indicacoes_embaixadoras_embaixadora_id_idx on indicacoes_embaixadoras(embaixadora_id);
create index indicacoes_embaixadoras_status_idx on indicacoes_embaixadoras(status);

alter table indicacoes_embaixadoras enable row level security;
revoke all on indicacoes_embaixadoras from anon, authenticated;

create trigger indicacoes_embaixadoras_set_updated_at
  before update on indicacoes_embaixadoras
  for each row execute function set_updated_at();

-- =========================================================================
-- recompensas_embaixadoras
-- =========================================================================

create table recompensas_embaixadoras (
  id uuid primary key default gen_random_uuid(),

  -- UNIQUE: uma indicação nunca gera duas recompensas — garantia central
  -- de idempotência (ver seção H do relatório da E1-A).
  -- ON DELETE RESTRICT: uma indicação nunca pode ser apagada enquanto
  -- tiver uma recompensa (possivelmente já PAGA) vinculada.
  --
  -- Deliberadamente SEM embaixadora_id nesta tabela: a Embaixadora dona
  -- da recompensa é obtida exclusivamente via
  -- indicacao_id -> indicacoes_embaixadoras.embaixadora_id. Duplicar essa
  -- referência aqui criaria duas fontes de verdade e um estado
  -- teoricamente inconsistente (indicação da Maria, recompensa apontando
  -- pra Claudia) que só a camada de aplicação impediria — preferimos que
  -- seja estruturalmente impossível. Quem precisar da Embaixadora de uma
  -- recompensa faz JOIN por indicacao_id; não há view/trigger/generated
  -- column substituindo isso nesta V1.
  indicacao_id uuid not null unique references indicacoes_embaixadoras(id) on delete restrict,

  valor_centavos integer not null default 4000 check (valor_centavos > 0),

  -- Sem estado "pendente": esta linha só nasce quando o primeiro
  -- mostruário já é um fato confirmado (ver correção de escopo na seção 4
  -- do pedido) — por isso o default já é 'disponivel', nunca 'pendente'.
  status recompensa_embaixadora_status_enum not null default 'disponivel',

  -- Idempotência contra reprocessamento de um evento externo (ex.: um
  -- futuro webhook do ConsigGold entregue duas vezes). UNIQUE (quando
  -- preenchido) garante que o mesmo evento nunca cria uma segunda
  -- recompensa. Formato do identificador NÃO é suposto aqui — texto
  -- livre, nullable (pode nascer de uma confirmação manual da equipe,
  -- sem evento externo nenhum, no piloto).
  evento_origem_id text unique,

  -- Fato reportado (quando o primeiro mostruário realmente aconteceu) —
  -- sempre exigido explicitamente na criação da linha, sem default
  -- silencioso, pra nunca mascarar a data real do evento com a data de
  -- inserção da linha.
  primeiro_mostruario_em timestamptz not null,

  -- Quando a equipe/o sistema TORNOU a recompensa disponível — aqui sim
  -- faz sentido default now(), já que é o próprio momento de criação da
  -- linha.
  disponivel_em timestamptz not null default now(),

  pago_em timestamptz,
  pago_por uuid references profiles(id) on delete set null,

  cancelada_em timestamptz,
  cancelada_por uuid references profiles(id) on delete set null,
  cancelada_motivo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    (status = 'pago' and pago_em is not null and cancelada_em is null)
    or (status = 'cancelada' and cancelada_em is not null and pago_em is null)
    or (status = 'disponivel' and pago_em is null and cancelada_em is null)
  )
);

comment on table recompensas_embaixadoras is
  'Dinheiro real devido/pago (R$40,00 = 4000 centavos) por indicação convertida (primeiro mostruário confirmado). Nasce direto em "disponivel" — nunca existe uma linha "pendente" pra indicação ainda não convertida (ver correção de escopo da E1-A). Acesso só via service role. Ainda não conectada a nenhum fluxo/ConsigGold (E1-A).';
comment on column recompensas_embaixadoras.valor_centavos is
  'Valor em centavos (inteiro), nunca ponto flutuante. R$40,00 = 4000, valor padrão e esperado para o piloto.';
comment on column recompensas_embaixadoras.evento_origem_id is
  'Chave de idempotência para uma futura integração (ex.: ConsigGold): o mesmo evento de "primeiro mostruário" processado duas vezes nunca cria uma segunda recompensa. Formato não suposto — texto livre, nullable.';

create index recompensas_embaixadoras_status_idx on recompensas_embaixadoras(status);

alter table recompensas_embaixadoras enable row level security;
revoke all on recompensas_embaixadoras from anon, authenticated;

create trigger recompensas_embaixadoras_set_updated_at
  before update on recompensas_embaixadoras
  for each row execute function set_updated_at();
