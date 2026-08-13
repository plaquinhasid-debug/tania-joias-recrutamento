-- Mesma lógica do trabalho do companheiro: se a própria candidata trabalha
-- atualmente, guarda endereço e telefone do trabalho — mais um jeito de
-- localizá-la caso ela suma.
alter table leads_ficha
  add column trabalha_atualmente boolean null,
  add column trabalho_endereco text null,
  add column trabalho_telefone text null;

comment on column leads_ficha.trabalha_atualmente is
  'Se a própria candidata trabalha atualmente (fora da revenda). NULL até a ficha ser preenchida.';
comment on column leads_ficha.trabalho_endereco is
  'Endereço do trabalho da candidata — contato extra pra localizá-la se ela sumir.';
comment on column leads_ficha.trabalho_telefone is
  'Telefone do trabalho da candidata — mesmo motivo do campo acima.';
