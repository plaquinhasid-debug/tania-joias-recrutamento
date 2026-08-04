-- FEATURE-005 Parte 5: setting real que controla o modo da "condução
-- natural" da Sofia (classificação contextual + NaturalConversationEngine,
-- construídos em modo shadow/local nas Partes 1-4).
--
-- Primeira migration versionada localmente neste projeto — até agora toda
-- mudança de schema foi aplicada direto no projeto remoto via
-- `apply_migration` (MCP), sem arquivo local (ver PROJECT_STATUS.md §3).
--
-- NÃO aplicada ao banco remoto nesta rodada — só o arquivo foi criado,
-- aguardando autorização explícita pra rodar (`supabase db push` ou
-- `apply_migration`).

insert into settings (chave, valor, descricao)
values (
  'sofia_conducao_natural',
  '{"modo": "OFF"}'::jsonb,
  'Controla o modo da "condução natural" da Sofia (FEATURE-005): OFF = comportamento atual, sem nenhuma mudança visível; SHADOW = classifica cada resposta e monta uma possível reação em segundo plano, só para observação/log, nunca exibida para a candidata; ACTIVE = reconhecido mas ainda não implementado — tratado como SHADOW até uma fase futura validar e ligar o modo de verdade. Default OFF.'
)
on conflict (chave) do nothing;

-- Trava a nível de banco (além da validação Zod no client e da checagem
-- manual na Edge Function `sofia-config`) — só afeta a linha
-- `sofia_conducao_natural`, não interfere em nenhum outro setting.
alter table settings
  add constraint sofia_conducao_natural_modo_check
  check (chave <> 'sofia_conducao_natural' or valor ->> 'modo' in ('OFF', 'SHADOW', 'ACTIVE'));
