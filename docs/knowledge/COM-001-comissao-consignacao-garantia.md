# Base de Conhecimento Oficial — Tania Joias
Documento: COM-001
Versão: 1.1 (correção: ciclo de ~30 dias comunicado como referência flexível, não prazo rígido — alinhado ao Knowledge Layer oficial, RFC-INTELLIGENCE-007)
Revisado por: Antonio (proprietário)
Status: Oficial — substitui a versão 1.0

---

## Tópico: Consignação — como funciona o ciclo

**Pergunta da candidata:** Como funciona a consignação? Preciso pagar alguma coisa antes de vender?

**Resposta oficial:**
Não. A revendedora recebe um mostruário de peças sem pagar nada adiantado. O acerto costuma acontecer em torno de **30 dias** — esse período é uma referência, não um prazo rígido: pode ser antecipado, adiado ou reagendado, desde que combinado com a equipe.

No acerto:
- Paga para a Tania Joias apenas as peças que **vendeu**, já com a comissão descontada.
- **Devolve** as peças que não vendeu.
- Recebe um **novo mostruário** e o ciclo recomeça.

**Palavras-chave para busca:** consignação, mostruário, prazo, 30 dias, acerto, devolução, pagar antes, adiantado, reagendar, prazo flexível

---

## Tópico: Comissão — quanto a revendedora ganha

**Pergunta da candidata:** Quanto eu ganho de comissão? Como é calculado?

**Resposta oficial:**
A comissão varia de **30% a 40%**, dependendo do valor total vendido no acerto:

| Valor vendido | Comissão |
|---|---|
| Até R$ 299,00 | 30% |
| R$ 299,00 a R$ 399,00 | 35% |
| A partir de R$ 400,00 | 40% |

Quanto mais a revendedora vende em cada ciclo, maior a porcentagem que ela recebe.

**Palavras-chave para busca:** comissão, porcentagem, quanto ganho, tabela, faixa, valor vendido

---

## Tópico: Garantia — o que é coberto

**Pergunta da candidata:** As peças têm garantia? Por quanto tempo?

**Resposta oficial:**
Sim. A garantia varia conforme o tipo de peça:
- **Anéis:** 3 meses
- **Demais peças** (colares, brincos, pulseiras, etc.): até 6 meses

**Palavras-chave para busca:** garantia, defeito, prazo de garantia, anel, colar, brinco, quanto tempo

---

## Notas de manutenção

- Este documento cobre apenas 3 dos temas mais comuns. Próximos documentos a criar: processo de recrutamento/aprovação, política de troca/devolução por defeito, como funciona o primeiro pedido, área de atuação (cidades atendidas).
- Qualquer alteração numérica (faixas de comissão, prazos) deve ser atualizada aqui E versionada (v1.1, v1.2...) para o Claude Code conseguir rastrear mudanças, conforme o padrão de "Explainability" que já é seguido no projeto.

## Nota do Claude Code (RFC-INTELLIGENCE-007)

A RFC-INTELLIGENCE-007 encontrou o texto do ciclo de consignação comunicando os "30 dias" de forma mais rígida do que o Knowledge Layer oficial publicado (KI `prazo-referencia-consignacao-30-dias`), que deixa explícito: "o acerto pode ocorrer antes ou depois desses 30 dias, e pode ser reagendado — não é um prazo absolutamente rígido [...] o que de fato preocupa a empresa é não cumprir o combinado, não avisar, deixar de responder, ou prometer nova data e descumprir." Esta v1.1 corrige o texto acima para refletir essa flexibilidade, sem criar nenhuma lógica de prazo/timer executável — o ciclo continua sendo um acordo operacional humano. `seedDocuments.ts` (`com-001-consignacao`) foi atualizado em conjunto, para as duas fontes não divergirem entre si.
