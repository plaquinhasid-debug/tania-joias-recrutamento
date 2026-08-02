# Base de Conhecimento Oficial — Tania Joias
Documento: COM-002
Versão: 1.1 (correção: cidade adicionada, critério de filhos/estado civil removido)
Revisado por: Antonio (proprietário)
Status: Oficial — substitui a versão 1.0

---

## Tópico: Quem pode ser revendedora (elegibilidade)

**Pergunta da candidata:** Eu posso ser revendedora? Quais os requisitos?

**Resposta oficial:**
Para se tornar revendedora da Tania Joias, é necessário:
- Ser **mulher, acima de 21 anos**
- Morar em uma destas cidades: **Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo ou São Caetano do Sul**
- Ter **WhatsApp** e **Instagram**
- Estar **trabalhando** — em uma empresa, escola ou hospital, **ou** ser cabeleireira atuando em salão de beleza

**Palavras-chave para busca:** requisitos, posso ser revendedora, cidade atendida, idade mínima, precisa trabalhar

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
