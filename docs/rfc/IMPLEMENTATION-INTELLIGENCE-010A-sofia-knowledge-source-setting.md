# IMPLEMENTATION-INTELLIGENCE-010A — `sofia_knowledge_source`

**Status:** IMPLEMENTAÇÃO LOCAL — NÃO APLICADA EM PRODUÇÃO
**Data:** 2026-08-17
**Estado final pretendido:** SHADOW; PILOT não iniciado

## Schema e mecanismo reais

No projeto `tania-joias-crm`, `public.settings` possui `id uuid` (PK), `chave text`
(UNIQUE/NOT NULL), `valor jsonb` (NOT NULL), `descricao text` (nullable) e
`updated_at timestamptz` (NOT NULL). A tabela tem RLS ativa. A policy real
`authenticated_all_settings` concede `ALL` somente ao papel `authenticated`;
o browser anônimo da candidata não possui escrita administrativa.

A implementação reutiliza essa tabela e o mesmo padrão de
`sofia_conducao_natural`: uma linha JSONB identificada por chave e uma `CHECK`
constraint específica, sem tabela, enum ou arquitetura paralela.

## Migration local

`20260817020000_add_sofia_knowledge_source_setting.sql` insere, apenas quando a
chave ainda não existe:

```json
{ "modo": "SHADOW" }
```

A constraint aceita exatamente um objeto com somente a propriedade `modo` e
um dos valores `LOCAL`, `SHADOW` ou `PILOT`. Ela não afeta outras chaves.
A migration não foi aplicada. Operacionalmente, rollback do comportamento
futuro será trocar o valor para `SHADOW` ou `LOCAL`; remover a infraestrutura
exigiria migration posterior explícita para remover constraint e linha.

## Leitura e fallback

`sofia-config` lê a nova chave com service role apenas no servidor e devolve
`knowledge_source_mode`. O contrato compartilhado aceita o campo como opcional
para compatibilidade durante deploys separados. Ausência, formato inválido,
valor desconhecido ou falha de leitura resultam em `SHADOW`, nunca `PILOT`.

A Landing apenas valida e recebe o modo nesta fase. O valor não é ligado ao
`KnowledgeEngine`; portanto, nem mesmo um valor `PILOT` já existente poderia
alterar a fonte candidata-visível com este diff isolado. A resposta continua
local e o Shadow da 006B permanece intacto.

## Segurança

Nenhuma policy, grant, secret ou credencial foi criada ou alterada. A Landing
não lê `settings` diretamente e não recebe service role. A escrita continua
restrita pelo RLS existente aos usuários autenticados; a candidata anônima não
pode alterar o modo.

## Testes e validação

A suíte `knowledge-source-setting.test.mjs` cobre os três valores, rejeição de
valor arbitrário/shape ampliado, seed SHADOW, fallbacks de ausência/valor
inválido/falha, ausência de grants ao browser, não conexão ao PILOT e isolamento
de IPR/finalização/wizard/Admin. Também devem permanecer verdes os testes Shadow
e o build da Landing.

## Estado final

Infraestrutura criada somente localmente. Migration não aplicada, Supabase
inalterado, PILOT não iniciado, cutover não realizado, commit/push/deploy não
realizados.
