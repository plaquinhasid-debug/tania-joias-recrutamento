-- Ficha de Aprovação — formulário público de uso único que a candidata
-- aprovada preenche sozinha (endereço, pai/mãe, cônjuge, 3 referências
-- familiares, referência comercial). Pensado desde já pra automação futura:
-- gerar o `token` é um insert simples com RLS de `authenticated`, então tanto
-- o Admin (clique manual) quanto uma automação futura (gatilho na aprovação)
-- podem criar a linha do mesmo jeito. A candidata (anônima) só enxerga isso
-- através das Edge Functions `get-ficha`/`submit-ficha`, nunca lê a tabela
-- direto — o `token` é a única credencial dela.

create table leads_ficha (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),

  endereco_rua text,
  endereco_numero text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_cep text,

  nome_pai text,
  nome_mae text,

  tem_conjuge boolean,
  conjuge_nome text,
  conjuge_telefone text,

  ref1_nome text,
  ref1_telefone text,
  ref2_nome text,
  ref2_telefone text,
  ref3_nome text,
  ref3_telefone text,

  ref_comercial_o_que_vende text,
  ref_comercial_nome text,
  ref_comercial_telefone text,

  criado_em timestamptz not null default now(),
  preenchido_em timestamptz null
);

comment on table leads_ficha is
  'Ficha de Aprovação preenchida pela própria candidata via link único (token), depois de aprovada. preenchido_em NULL = link ainda pendente/aguardando; setado = já enviou e o link não deve mais aceitar submissões.';

comment on column leads_ficha.token is
  'Credencial única da candidata pro link público (/ficha/:token na Landing). Não é um JWT nem expira por tempo — só fica inválido depois que preenchido_em é setado (uso único).';

create index leads_ficha_lead_id_idx on leads_ficha(lead_id);

alter table leads_ficha enable row level security;

-- Mesmo padrão de `leads`: equipe autenticada no Admin tem acesso total.
-- Não existe policy pra `anon` de propósito — a candidata só acessa via
-- Edge Functions com service role, que validam o token manualmente.
create policy "authenticated_select_leads_ficha" on leads_ficha
  for select to authenticated using (true);

create policy "authenticated_insert_leads_ficha" on leads_ficha
  for insert to authenticated with check (true);

create policy "authenticated_update_leads_ficha" on leads_ficha
  for update to authenticated using (true) with check (true);

create policy "authenticated_delete_leads_ficha" on leads_ficha
  for delete to authenticated using (true);
