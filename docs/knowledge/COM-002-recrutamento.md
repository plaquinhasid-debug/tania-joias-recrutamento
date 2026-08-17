# Base de Conhecimento Oficial — Tania Joias
Documento: COM-002
Versão: 1.2 (correção: idade mínima 18 anos [não 21]; WhatsApp obrigatório, Instagram opcional [não ambos obrigatórios]; atividade profissional ampliada para autônoma/comerciante/dona do próprio negócio/qualquer ocupação real [não restrita a empresa/escola/hospital/cabeleireira]; critério de gênero removido — alinhado ao Knowledge Layer oficial, RFC-INTELLIGENCE-005/006)
Revisado por: Antonio (proprietário)
Status: Oficial — substitui a versão 1.1

---

## Tópico: Quem pode ser revendedora (elegibilidade)

**Pergunta da candidata:** Eu posso ser revendedora? Quais os requisitos?

**Resposta oficial:**
Para ser revendedora, é preciso ter 18 anos completos ou mais, morar em uma das cidades atendidas, ter WhatsApp e estar trabalhando ou exercer alguma atividade profissional ativa — inclusive como autônoma, comerciante ou dona do próprio negócio. Instagram é opcional.

Detalhando cada ponto:
- **Idade:** 18 anos completos ou mais.
- **Cidade:** morar em uma destas cidades: **Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo ou São Caetano do Sul**.
- **WhatsApp:** obrigatório. **Instagram:** opcional — pode ser perguntado/coletado, mas sua ausência não torna a candidata inelegível.
- **Atividade profissional:** estar **trabalhando** ou exercer atividade profissional ativa — não se limita a vínculo CLT ou emprego em empresa. Contam também autônoma, comerciante, dona do próprio negócio, profissional liberal e outras ocupações reais (não é uma lista fechada).

**Palavras-chave para busca:** requisitos, posso ser revendedora, cidade atendida, idade mínima, precisa trabalhar, autônoma, instagram obrigatório

---

## Tópico: Como funciona o processo de candidatura

**Pergunta da candidata:** Como eu me inscrevo? O que acontece depois?

**Resposta oficial:**
A candidata preenche um **cadastro** com suas informações. A partir daí a Tania Joias avalia se ela atende aos critérios antes de liberar o primeiro mostruário.

**Palavras-chave para busca:** como me inscrevo, cadastro, próximo passo, depois que eu preencher

---

## Tópico: Critério de reprovação (uso interno — não expor diretamente à candidata)

**Contexto para a Sofia (não é uma resposta a ser lida literalmente para a candidata):**
Não é aprovada automaticamente candidata que esteja **desempregada**.

**Removido nesta versão (1.1):** o critério de número de filhos/estado civil foi retirado por decisão do Antonio — risco de discriminação no acesso a uma oportunidade econômica.

**Importante:** este critério é interno para a triagem/IPR. A Sofia **não deve comunicar esse critério diretamente** a uma candidata reprovada de forma que soe como julgamento pessoal. A mensagem exata de reprovação ainda precisa ser definida com o Antonio antes de colocar em produção.

**Palavras-chave para busca:** critério de reprovação, não aprovada, IPR, triagem interna

---

## Notas de manutenção

- **Correção aplicada:** cidade "Ribeirão Pires" incluída (estava faltando na v1.0, mas já configurada no Supabase desde 29/07/2026).
- **Correção aplicada:** critério de filhos/estado civil removido — havia sido descartado em sessão anterior por risco de discriminação, e a v1.0 tinha reintroduzido isso por engano.
- **Pendência de revisão:** a mensagem que a Sofia envia para uma candidata reprovada ainda não foi definida com você.

---

## Nota do Claude Code (2026-08-02)

Os dois conflitos sinalizados na v1.0 (critério de filhos/estado civil vs. decisão anterior; 4 vs. 5 cidades atendidas) estão resolvidos nesta versão. `seedDocuments.ts` foi atualizado: `com-002-elegibilidade` agora inclui as 5 cidades (igual ao setting `cidades_atendidas` em produção). A seção "Critério de reprovação" continua **fora** do KnowledgeEngine — não por conflito de decisão desta vez, mas porque (a) o próprio documento ainda marca isso como "uso interno, não expor diretamente", e (b) a mensagem exata de reprovação ainda está pendente. A informação positiva equivalente ("estar trabalhando") já está no documento de elegibilidade, então nada de útil pra candidata fica de fora.

---

## Nota do Claude Code (2026-08-16, RFC-INTELLIGENCE-005/006)

A RFC-INTELLIGENCE-005 (reconciliação) encontrou três divergências entre esta versão (v1.1) e o Knowledge Layer oficial publicado (`knowledge_items`/`knowledge_versions`, Supabase `consiggold-v2`): (1) idade mínima comunicada como "21 anos" — o KI publicado confirma 18 anos completos, com nota explícita "não existe requisito de 21 anos"; (2) Instagram comunicado como obrigatório junto ao WhatsApp — o KI publicado confirma que só WhatsApp é obrigatório; (3) atividade profissional comunicada de forma mais estreita (empresa/escola/hospital/cabeleireira) do que a regra real, que também aceita autônoma/comerciante/dona do próprio negócio/profissional liberal (lista exemplificativa, não fechada). A RFC-INTELLIGENCE-006 (especificação) e a implementação seguinte corrigiram os três pontos nesta v1.2, junto com a remoção do critério "ser mulher" (nunca foi implementado como regra executável em nenhum ponto do sistema — não vira gate agora). `seedDocuments.ts` (`com-002-elegibilidade`, versão 3) e `SOFIA_REJECTION_LINES` (`apps/landing/src/data/sofia-script.ts`) foram atualizados em conjunto com este documento, para as três fontes não divergirem entre si. A seção "Critério de reprovação" abaixo permanece inalterada — fora do escopo desta correção, já corretamente marcada como uso interno.
