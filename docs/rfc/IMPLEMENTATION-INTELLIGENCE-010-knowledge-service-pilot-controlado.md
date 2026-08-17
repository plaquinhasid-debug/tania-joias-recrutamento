# IMPLEMENTATION-INTELLIGENCE-010 — PILOT controlado

Status: implementado e validado localmente; **não ativado em produção**.

## Comportamento

- `LOCAL`: usa exclusivamente os documentos locais.
- `SHADOW`: mantém a resposta candidata-visível local e compara o remoto em best-effort.
- `PILOT`: permite conteúdo remoto candidata-visível somente para os quatro slugs aprovados; qualquer falha usa o documento local correspondente.

Allowlist fechada:

- `comissao-por-faixa-de-valor-vendido`
- `garantia-por-tipo-de-peca`
- `prazo-referencia-consignacao-30-dias`
- `primeiro-mostruario-sem-caucao`

O modo é carregado uma vez no início da conversa por `sofia-config`. Ausência, erro ou valor inválido continua resolvido como `SHADOW`. O repositório PILOT preserva ID, tags, palavras-chave, prioridade e visibilidade locais; somente título, categoria, conteúdo e versão do item remoto público e allowlisted podem chegar ao contexto do Claude.

Falhas normalizadas: `remote_timeout`, `remote_invalid_payload`, `remote_unavailable` e `remote_slug_missing`. Não há retry. A observabilidade contém apenas modo, disponibilidade, latência, slug, versão, fonte efetiva e código de fallback — nunca pergunta, resposta, conteúdo, sessão ou PII.

## Segurança e regressão

O Knowledge Service permanece com contrato fechado. Nenhum KI, secret, migration, IPR, `finalize-candidate`, Admin ou regra do wizard é alterado. O pipeline contém uma única chamada ao gateway de IA. O modo de produção permanece `SHADOW`; PILOT não foi iniciado nesta implementação.

## Verificação local

Há testes explícitos para os três modos, allowlist exata, quatro regras oficiais, exclusão de KIs fora do piloto e internos, timeout, indisponibilidade, payload inválido, slug ausente, ausência de retry, fallback local, logs sem PII/conteúdo e uma única chamada ao Claude.
