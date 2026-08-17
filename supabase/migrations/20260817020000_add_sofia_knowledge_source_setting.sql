-- IMPLEMENTATION-INTELLIGENCE-010A: controle persistente da fonte de
-- conhecimento da Sofia. Esta migration cria apenas a configuração; ela não
-- implementa nem ativa o comportamento PILOT.

insert into public.settings (chave, valor, descricao)
values (
  'sofia_knowledge_source',
  '{"modo": "SHADOW"}'::jsonb,
  'Controla a fonte de conhecimento da Sofia: LOCAL = somente conhecimento local; SHADOW = resposta local com comparação remota sem efeito visível; PILOT = valor reservado para ativação controlada futura. Default SHADOW.'
)
on conflict (chave) do nothing;

-- Contrato fechado: para esta chave, o JSON deve conter somente `modo` e um
-- dos três valores autorizados. Não altera a validação de outros settings.
alter table public.settings
  add constraint sofia_knowledge_source_modo_check
  check (
    chave <> 'sofia_knowledge_source'
    or (
      jsonb_typeof(valor) = 'object'
      and valor ? 'modo'
      and valor ->> 'modo' in ('LOCAL', 'SHADOW', 'PILOT')
      and valor = jsonb_build_object('modo', valor -> 'modo')
    )
  );
