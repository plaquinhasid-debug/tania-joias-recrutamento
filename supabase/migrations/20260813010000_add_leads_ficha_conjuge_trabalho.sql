-- Contato extra pra localizar a revendedora caso ela suma: se o
-- marido/companheiro trabalha, guarda onde e o telefone do trabalho dele —
-- mais um jeito de chegar até ela além do telefone/endereço próprio.
alter table leads_ficha
  add column conjuge_trabalha boolean null,
  add column conjuge_trabalho_local text null,
  add column conjuge_trabalho_telefone text null;

comment on column leads_ficha.conjuge_trabalha is
  'Se o marido/companheiro trabalha atualmente. NULL quando tem_conjuge = false (pergunta não se aplica).';
comment on column leads_ficha.conjuge_trabalho_local is
  'Nome da empresa/local onde o companheiro trabalha — contato extra pra localizar a revendedora se ela sumir.';
comment on column leads_ficha.conjuge_trabalho_telefone is
  'Telefone do trabalho do companheiro — mesmo motivo do campo acima.';
