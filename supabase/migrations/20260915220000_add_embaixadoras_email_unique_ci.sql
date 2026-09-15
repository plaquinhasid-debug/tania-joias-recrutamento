-- EMBAIXADORAS TANIA JOIAS V1 — E2.2-B: unicidade case-insensitive de
-- email. Migration NOVA e isolada — nenhuma outra migration já aplicada
-- é tocada aqui.
--
-- Achado da auditoria E2.2-A: embaixadoras.email é NOT NULL mas não
-- tinha nenhuma garantia de unicidade — "CLIENTE@EMAIL.COM",
-- "cliente@email.com" e "Cliente@Email.Com" seriam hoje 3 linhas
-- diferentes. Como email também será o identificador de login do
-- Supabase Auth da Embaixadora (E2.1, comentário em
-- embaixadoras.email), isso precisa ser garantido pelo banco, não só
-- pela normalização (trim+lowercase) que a futura Edge Function fará
-- antes do INSERT — a normalização na aplicação é a primeira linha de
-- defesa, o índice abaixo é a garantia final.
--
-- UNIQUE INDEX funcional sobre lower(email), não citext: não instala
-- extensão nova, não altera o tipo da coluna (continua text), não cria
-- coluna adicional — é a abordagem mínima e reversível.
create unique index embaixadoras_email_lower_unique_idx
  on public.embaixadoras (lower(email));

comment on index public.embaixadoras_email_lower_unique_idx is
  'Garante que dois e-mails que só diferem em maiúsculas/minúsculas nunca coexistem em embaixadoras — complementa (não substitui) a normalização trim+lowercase que a Edge Function de convite faz antes do INSERT. Ver auditoria E2.2-A, item I.';
