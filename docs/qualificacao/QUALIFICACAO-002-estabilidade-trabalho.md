# QUALIFICAÇÃO-002 — Estabilidade de Trabalho

Documento de **design de regra de negócio**. Nenhum código, banco, Sofia, IPR, Meta Pixel/CAPI ou prompt de IA foi alterado para produzir este documento. Tudo aqui é proposta, para aprovação do Antonio/Tania antes de qualquer implementação.

Baseado nas auditorias anteriores (rastreamento Meta Pixel/CAPI e regra de qualificação atual), ambas 100% lidas do código real do projeto.

---

## 1. Problema atual

O sistema hoje só sabe `trabalha = sim/não` (booleano). Isso funciona como filtro grosseiro, mas mistura dois problemas de negócio diferentes num único bit de informação:

- Se a candidata tem uma fonte de renda relativamente previsível (relevante pro risco operacional da consignação).
- Se o ambiente dela favorece contato com potenciais clientes (relevante pro potencial comercial).

Hoje, "trabalha = sim" vale exatamente os mesmos 50 pontos pra uma CLT de 3 anos, uma autônoma com rotina fixa num salão movimentado, e alguém fazendo bicos esporádicos sem regularidade — desde que todas tenham respondido "sim" à pergunta binária. `profissao` e `empresa_atual` são coletados mas não têm nenhum peso formal no motor de regras.

## 2. Objetivo da nova qualificação

Não é criar uma "checagem de carteira assinada". É dar ao motor de regras (e à equipe humana) uma forma de diferenciar, dentro do universo de quem já respondeu "trabalha = sim", quem tem uma atividade mais previsível de quem tem uma atividade mais instável — **sem** assumir que informal = ruim ou que uma profissão específica é automaticamente boa ou ruim.

Dois eixos independentes, que não devem ser misturados:

- **Eixo A — Estabilidade Profissional**: risco operacional (a renda dela tende a ser recorrente?).
- **Eixo B — Potencial de Convívio Comercial**: o ambiente de trabalho dela naturalmente a coloca em contato com muita gente (clientela em potencial)?

Uma candidata pode ser ALTA em um eixo e BAIXA no outro — os dois casos do enunciado (cabeleireira autônoma em salão movimentado vs. autônoma isolada em casa) ilustram exatamente essa independência.

---

## 3. Estabilidade profissional (Eixo A)

**Pergunta que este eixo responde:** *"Essa candidata possui atividade profissional recorrente e uma fonte de renda relativamente previsível?"*

Proponho 4 categorias — mas a decisão final de nomenclatura é aberta:

| Categoria | Significado pretendido |
|---|---|
| **ALTA** | Vínculo formal/fixo (CLT, servidora pública, contrato fixo) **ou** atividade autônoma com rotina comprovadamente fixa e recorrente (mesmo local, mesma frequência, ex.: "trabalho todo dia no salão X"). |
| **MÉDIA** | Atividade recorrente mas com variabilidade de carga/renda — autônoma sem local fixo mas com clientela regular, microempreendedora, freelancer quase diário. |
| **BAIXA** | Atividade esporádica, "bicos" ocasionais, sem regularidade perceptível. |
| **NÃO_IDENTIFICADA** | Resposta vaga demais pra classificar com segurança — **não deve ser tratada como sinônimo de BAIXA**, é uma categoria de "não sei", não de "é ruim". |

Importante: a fronteira entre ALTA e MÉDIA é inerentemente subjetiva quando vem de texto livre. A forma mais honesta de reduzir esse ruído é deixar a **própria candidata se autoclassificar** por uma pergunta de múltipla escolha (ver seção 7), em vez de tentar inferir isso de texto livre de profissão/empresa.

---

## 4. Potencial de convivência comercial (Eixo B)

**Pergunta que este eixo responde:** *"O ambiente onde ela atua a coloca em contato frequente com pessoas que podem virar clientes?"*

Categorias propostas:

| Categoria | Exemplos |
|---|---|
| **ALTO** | Hospital, escola, salão de beleza, clínica, loja/comércio com fluxo de clientes, escritório com bastante gente. |
| **MÉDIO** | Atendimento em casa mas com agenda de clientes (manicure, esteticista autônoma), ambientes pequenos ou de baixo fluxo. |
| **BAIXO** | Trabalho isolado, sozinha, sem contato direto com público (ex.: trabalho remoto solitário). |
| **NÃO_IDENTIFICADO** | Profissão/local informado não dá pra classificar (texto vago, ambíguo, ou ausente). |

**Diferente do Eixo A, este eixo não deveria virar uma pergunta nova.** É naturalmente um julgamento de contexto (que tipo de ambiente é "escritório de contabilidade" vs. "escritório de advocacia com muitos clientes"?) — mais adequado pra inferência qualitativa (hoje já existe uma tentativa disso, fraca e não-estruturada, no prompt da IA em `ai-analysis.ts`) do que pra um checklist rígido de palavras-chave. Ver seção 9 sobre os limites de confiar nisso sem confirmação humana.

---

## 5. Informação atual disponível

- `trabalha` (booleano) — [sofia-script.ts:114-119](apps/landing/src/data/sofia-script.ts:114)
- `profissao` (texto livre, sem estrutura) — [sofia-script.ts:120-127](apps/landing/src/data/sofia-script.ts:120)
- `empresa_atual` (texto livre, sem estrutura) — [sofia-script.ts:128-138](apps/landing/src/data/sofia-script.ts:128)
- `experiencia_vendas` (booleano) — sinal comercial, não é sobre estabilidade de trabalho.
- Uma tentativa fraca e não-vinculante de inferência de "vínculo fixo vs. autônomo/casa" já embutida no prompt da IA ([ai-analysis.ts:215-217](supabase/functions/_shared/ai-analysis.ts:215)) — explicitamente instruída a não penalizar quando não souber, e nunca chega aos campos oficiais (`leads.ipr`/`status`/`perfil_comercial`).

## 6. Informação que falta

- **Natureza do vínculo** (fixo vs. variável) — não existe como dado estruturado, só como suposição de texto livre.
- **Tempo no trabalho/atividade atual** — nunca perguntado (nem "há quanto tempo").
- **Frequência real** (diária, semanal, esporádica) — nunca perguntado diretamente.
- **Se o local tem fluxo de pessoas** — só inferível fracamente do nome da profissão/empresa, nunca perguntado.

---

## 7. Pergunta adicional recomendada

**Recomendo UMA pergunta nova**, de múltipla escolha (mesmo padrão de `chips` já usado hoje em "Quanto tempo você pode dedicar por dia?" — [sofia-script.ts:172-179](apps/landing/src/data/sofia-script.ts:172)), logo depois de "Onde você trabalha?" (a Sofia já sabe profissão e empresa, então a pergunta soa como uma continuação natural, não um formulário).

**Proposta de texto** (sugestão, não final):
> "Sua rotina de trabalho hoje é mais fixa, ou mais variável?"

**Opções propostas** (mapeiam diretamente pro Eixo A, sem precisar de inferência de texto):
1. "Fixa — mesma empresa/local, mesma escala"
2. "Variável, mas recorrente (ex.: atendo todos os dias, sem horário fixo)"
3. "Esporádica, sem muita regularidade"

Por que isso resolve o problema do enunciado (cabeleireira em salão ≠ atendimento esporádico em casa): as duas description caem em opções DIFERENTES aqui, mesmo as duas sendo "autônomas" — a rotina fixa da cabeleireira em salão cai na opção 1, o atendimento esporádico cai na 2 ou 3, dependendo de como ela mesma descreve sua frequência. Nenhuma das duas é penalizada só por não ter CLT.

**Se a resposta for "SIM, precisamos" estiver descartada:** a alternativa seria tentar inferir isso só do texto de `profissao`/`empresa_atual` via IA (sem pergunta nova) — mas isso é estruturalmente menos confiável (é exatamente o que já existe hoje, fraco, e o motivo de ainda não sabermos diferenciar D de E na auditoria anterior). Uma pergunta de múltipla escolha é mais barata em confiabilidade do que é cara em fricção (1 clique a mais, chips já são um padrão familiar no roteiro).

---

## 8. Classificação dos 10 casos

*(Eixo A = Estabilidade, Eixo B = Convívio comercial. Só fazem sentido quando `trabalha = sim` — quando `trabalha = não`, a regra eliminatória atual já decide tudo antes de qualquer eixo entrar em jogo.)*

| Caso | Eixo A (Estabilidade) | Eixo B (Convívio) | Por quê | Falta informação? |
|---|---|---|---|---|
| **A** — Enfermeira CLT em hospital há 3 anos | **ALTA** | **ALTO** | Vínculo formal + tempo definido = renda previsível; hospital = alto fluxo de pessoas | Não |
| **B** — Professora concursada em escola pública | **ALTA** | **ALTO** | Concursada = vínculo estável (até mais que CLT comum); escola = contato com professoras, funcionárias, famílias | Não |
| **C** — Recepcionista registrada em clínica | **ALTA** | **ALTO** | Registrada = vínculo formal; recepção = contato direto e constante com público | Não |
| **D** — Cabeleireira autônoma, todo dia no salão | **MÉDIA** (pode subir a ALTA com a pergunta nova) | **ALTO** | Autônoma mas rotina diária e local fixo = mais previsível que um bico, mas sem vínculo formal confirmado | **Sim** — é o caso clássico que a pergunta do item 7 resolve |
| **E** — Manicure que atende em casa todo dia | **MÉDIA** | **MÉDIO** | Atividade diária e recorrente, mas sem local comercial fixo (mais suscetível a variação de agenda pessoal) | Parcialmente — volume de clientes ajudaria, mas não justifica pedir |
| **F** — Trabalhos esporádicos, sem renda recorrente | **BAIXA** | **NÃO_IDENTIFICADO** | O próprio enunciado já descreve como não-recorrente | Sim — tipo de trabalho não informado no caso |
| **G** — Microempreendedora, loja física própria | **ALTA** | **ALTO** | Negócio com ponto fixo = estrutura recorrente; loja física = fluxo de clientes | Não |
| **H** — Autônoma, sozinha, pela internet, de casa | **MÉDIA** (depende da pergunta nova) | **BAIXO** | Pode ser recorrente, mas sem confirmação de regularidade; trabalho isolado = pouco contato direto | Sim — a pergunta nova diferencia "negócio online estabelecido" de "bico ocasional online" |
| **I** — Funcionária em supermercado | **ALTA** | **ALTO** | "Funcionária" sugere vínculo formal típico; supermercado = alto fluxo de clientes/colegas | Levemente — não confirma CLT vs. temporária, mas ALTA é razoável por padrão |
| **J** — Enfermeira atualmente desempregada | **N/A** — reprovada pela regra eliminatória (`trabalha = não`) antes de qualquer eixo ser avaliado | **N/A** | A regra atual já decide tudo nesse ponto, independente da profissão | N/A |

---

## 9. Alternativas de evolução do IPR

**Nenhuma foi implementada.** Comparação de 3 modelos, todos mantendo os 100 pontos/thresholds atuais como referência de comparação (`aprovar >= 80`, `em_analise >= 60`).

### Modelo A — Estabilidade só informativa
`trabalha` continua valendo 50 pontos fixos; estabilidade (Eixo A) e convívio (Eixo B) aparecem só como campos consultivos (Admin/IA), sem tocar no IPR.

- **Vantagens:** risco zero de reclassificar quem já é aprovada hoje; simples de explicar; nada quebra.
- **Riscos:** os dois eixos viram "decoração" — não fazem diferença real na decisão, o que pode frustrar a intenção de negócio por trás desta auditoria.
- **Impacto em candidatas atuais:** nenhum.
- **Facilidade de explicar:** máxima.
- **Risco de reprovar boas candidatas:** nenhum.
- **Risco de aprovar candidatas instáveis:** mantém o risco de hoje, sem melhora.

### Modelo B — Dividir os 50 pontos de "trabalha"
Ex. conceitual: `trabalha (base) = 20-30 pts` + `estabilidade (Eixo A) = 20-30 pts`, escalonado por categoria (ALTA = todos os pontos, MÉDIA = parcial, BAIXA/NÃO_IDENTIFICADA = pouco ou nada — com cuidado pra não tratar NÃO_IDENTIFICADA igual a BAIXA).

- **Vantagens:** estabilidade passa a ter peso real na decisão.
- **Riscos:** muda o IPR de **todas** as candidatas que passarem pelo motor novo — precisa recalibrar o threshold de 80, senão o mix de aprovadas muda sem intenção clara; risco real de empurrar autônomas com rotina boa (caso D) pra baixo se a régua MÉDIA/ALTA não for bem calibrada — indo contra o princípio "não penalizar autônoma boa" que motivou esta auditoria.
- **Impacto em candidatas atuais:** médio/alto.
- **Facilidade de explicar:** média — mais nuançado, mas ainda cabe em 1-2 frases.
- **Risco de reprovar boas candidatas:** existe, mitigável só com calibração cuidadosa e um período de observação antes de valer pra decisão real.
- **Risco de aprovar candidatas instáveis:** reduz — é o ganho principal deste modelo.

### Modelo C — "Trabalha" continua eliminatório; estabilidade vira critério adicional
A regra eliminatória de hoje (`trabalha = não → reprovada`) fica exatamente como está. Estabilidade (Eixo A) entra como um **novo critério de pontuação**, adicional aos 5 já existentes (redistribuindo peso ou somando ao total, a decidir).

- **Vantagens:** não mexe na regra que já filtra a entrada (menor risco de reprovar quem hoje seria aprovada só pela introdução do novo critério); funciona como "refinamento" pra quem já passou no básico.
- **Riscos:** se os pontos vierem "abrindo espaço" nos critérios existentes (tirando de whatsapp/instagram/cidade), pode desvalorizar sinais que já funcionam bem hoje; se vierem como pontos extras (total > 100), precisa redefinir o que os thresholds significam no novo total.
- **Impacto em candidatas atuais:** menor que o Modelo B para quem já é claramente aprovada; mais perceptível só nas fronteiras (`em_analise`).
- **Facilidade de explicar:** alta — "primeiro decide se ela trabalha, depois refina com o tipo de rotina" é uma história simples.
- **Risco de reprovar boas candidatas:** baixo — a régua eliminatória de hoje continua igual, o novo critério só adiciona.
- **Risco de aprovar candidatas instáveis:** reduz, mas menos que o Modelo B, porque o peso de "trabalha" continua dominando o score.

**Recomendação (ver resposta objetiva D no final):** Modelo C como primeiro passo — menor risco, mais fácil de auditar antes/depois, e não exige recalibrar o que "trabalha = sim" já decide hoje.

---

## 10. Regra eliminatória

Hoje: `trabalha = não → reprovada`, sem exceção, decidido em [finalize-candidate/index.ts:99-104](supabase/functions/finalize-candidate/index.ts:99), antes até do IPR ser considerado.

**Existem casos legítimos de "não" que ainda têm atividade econômica recorrente?** Sim, é plausível — o risco real não é alguém empregada respondendo "não" por engano (isso seria raro), é o contrário: uma trabalhadora **informal/autônoma** que não se enxerga como "trabalhando de verdade" no sentido convencional da palavra, e responde "não" por insegurança ou interpretação literal da pergunta ("eu não tenho emprego, então não trabalho") — mesmo tendo renda recorrente de verdade.

**Onde está o problema: a regra, a pergunta, ou ambos?**

**Ambos, mas com pesos diferentes:**
- A **pergunta** ("Você trabalha atualmente?") é a fonte mais imediata de risco — é ambígua pra quem tem atividade informal, e essa ambiguidade pode gerar falso-negativo (candidata boa respondendo "não" por autoexclusão linguística).
- A **regra** (reprovação automática e definitiva no mesmo instante, sem chance de esclarecimento) é o segundo problema — mesmo se a pergunta fosse perfeita, tratar "não" como reprovação irreversível não deixa espaço pra correção caso a resposta tenha sido malinterpretada.

**Não estou alterando nada agora.** Fica registrado como decisão futura: valeria considerar reformular o texto do botão/pergunta pra deixar claro que trabalho autônomo/informal conta como "sim" (ex.: rótulo do botão "Sim, trabalho (inclusive por conta própria)"), e/ou dar uma segunda chance de esclarecimento antes de reprovar definitivamente. Ambas são decisões de negócio, não implementadas aqui.

---

## 11. Veracidade / autodeclaração

O sistema inteiro depende de autodeclaração — nada é verificado hoje. Documentando **só como catálogo de opções futuras**, sem propor implementação:

- **Confirmação leve** (dentro da própria conversa): perguntas que já pedem detalhe (ex.: "há quanto tempo", already coberto em parte pela pergunta do item 7) tendem a gerar respostas mais confiáveis que perguntas genéricas — respostas vagas podem ser sinalizadas com confiança baixa. Existe até um campo pronto pra isso, hoje sem uso prático: `ai_analysis.grau_confianca_ia` ([ai-analysis.ts:64-65](supabase/functions/_shared/ai-analysis.ts:64)) — já é gerado, mas ninguém age sobre ele hoje.
- **Revisão manual**: reservar "em_analise" (que já existe como status) especificamente para os casos onde estabilidade ficou `NÃO_IDENTIFICADA` ou `grau_confianca_ia` baixo — decisão humana, sem automação nova.
- **Documentação opcional**: candidata poderia, por vontade própria e nunca como barreira de entrada, anexar algo (crachá, foto do local) **depois** de aprovada, como reforço — nunca como pré-requisito de qualificação.
- **Confirmação antes da primeira entrega**: como a operação já é consignação (primeira entrega física de mercadoria), esse é o ponto natural onde uma confirmação mais forte pode acontecer sem fricção na etapa de qualificação digital — ex.: a equipe humana confirma verbalmente por WhatsApp antes de liberar o primeiro mostruário.

Nenhuma dessas opções está sendo proposta pra implementação agora — é só o mapa de possibilidades, do mais leve ao mais forte.

---

## 12. Relação com Meta

**Nenhuma mudança de evento é proposta.** `Lead = candidata aprovada` continua sendo a regra — confirmado de novo: [finalize-candidate/index.ts:331](supabase/functions/finalize-candidate/index.ts:331) e [useLeadDetail.ts:83](apps/admin/src/hooks/useLeadDetail.ts:83), ambos com o gatilho `status === "aprovada"`, sem alteração.

**Como melhorar a definição de "aprovada" melhora o Meta indiretamente:** o evento já usa `status === "aprovada"` como gatilho — isso não muda. O que muda é **o que precisa ser verdade** pra alguém chegar em "aprovada". Se a definição de aprovação passar a considerar estabilidade real (não só um "sim" binário), o **conjunto de pessoas que geram o sinal `Lead`** fica mais preciso automaticamente, sem tocar em `event_id`, Pixel, CAPI ou dedução — porque a melhoria acontece antes, na decisão de status, e o evento só reage a essa decisão. O algoritmo do Meta passaria a aprender a encontrar "pessoas com atividade recorrente e bom potencial de rede", em vez de só "pessoas que bateram um score genérico baseado num sim/não".

---

## 13. Riscos

- Recalibração mal feita (Modelos B/C) pode mudar o mix de quem é aprovada sem essa ser a intenção — qualquer modelo escolhido precisa de um período de observação/comparação antes de valer pra decisão real.
- A pergunta nova, mesmo sendo só 1, ainda é fricção adicional — mitigado por usar o padrão de chips já familiar no roteiro (resposta em 1 clique).
- Eixo B (convívio comercial), se vier de inferência de IA, herda o mesmo risco de hoje: "alucinar" contexto que não está nas respostas — precisa manter o mesmo guardrail já usado (não penalizar quando não souber, ver [ai-analysis.ts:217](supabase/functions/_shared/ai-analysis.ts:217)).
- **Risco de viés indireto**: certas profissões podem estar correlacionadas socialmente com atributos protegidos (gênero, classe, região). A classificação dos dois eixos deve sempre ser pelo **tipo de rotina/ambiente** ("atividade com fluxo constante de pessoas"), nunca pelo **nome da profissão isoladamente** ("enfermeira = boa") — é exatamente a diferença que a Objetivo 3 do pedido já exigiu, e que este documento respeitou em toda a seção 8 (nenhuma linha do quadro classifica por nome de profissão isolado, sempre por rotina/vínculo/ambiente descritos no caso).
- A mesma ambiguidade de interpretação da pergunta "trabalha" (seção 10) pode se repetir na pergunta nova do item 7, se o texto final não for claro — vale revisão de copy antes de qualquer implementação futura.

---

## 14. Recomendação final

1. Tratar Estabilidade (Eixo A) e Convívio Comercial (Eixo B) como dois conceitos formalmente distintos daqui pra frente em qualquer documentação/discussão futura — nunca somar os dois num único número.
2. Capturar o Eixo A com **uma pergunta nova de múltipla escolha** (seção 7) — mais barata em confiabilidade do que tentar inferir de texto livre.
3. Deixar o Eixo B como inferência qualitativa não-vinculante (reforçando o prompt de IA já existente no futuro, se decidido) — não vale a pena transformar em pergunta rígida, o julgamento de "que tipo de ambiente é esse" é melhor feito por leitura de contexto do que por checklist de palavras-chave.
4. Evoluir o IPR pelo **Modelo C** primeiro (menor risco, mais fácil de auditar antes/depois) — Modelo B fica como evolução possível depois de observar dados reais de como as categorias de estabilidade se distribuem entre candidatas de verdade.
5. Manter a regra eliminatória de "trabalha" como está por enquanto, mas registrar formalmente (seção 10) que a REDAÇÃO da pergunta é um risco real de falso-negativo — decisão separada, pra quando quiserem endereçar.
6. Não pedir nenhuma documentação/comprovante nesta fase — manter só como catálogo de opções futuras (seção 11).

---

## Respostas objetivas

**A. Precisamos de uma pergunta nova?**
**SIM.**

**B. Qual deve ser a pergunta, se SIM?**
Proposta (não é texto final aprovado): **"Sua rotina de trabalho hoje é mais fixa, ou mais variável?"** — perguntada logo depois de "Onde você trabalha?", só quando `trabalha = sim`.

**C. Quais respostas/opções ela deve oferecer?**
Três opções (chips, mesmo padrão já usado hoje em "tempo_disponivel"):
1. "Fixa — mesma empresa/local, mesma escala"
2. "Variável, mas recorrente (ex.: atendo todos os dias, sem horário fixo)"
3. "Esporádica, sem muita regularidade"

**D. Qual modelo de evolução do IPR você recomenda, sem implementar?**
**Modelo C** — manter "trabalha" como regra eliminatória exatamente como está hoje, e adicionar estabilidade como um novo critério de pontuação complementar. Menor risco de reclassificar quem já é aprovada, mais fácil de explicar e auditar antes de qualquer decisão de calibração fina.

**E. O que deve continuar igual?**
- A pergunta "Você trabalha atualmente?" (o risco identificado na seção 10 é uma decisão separada, não decidida aqui).
- O peso e o comportamento atual da regra eliminatória de `trabalha`.
- O IPR em produção (pesos, thresholds, cálculo) — nada foi alterado.
- Meta Pixel/CAPI, `event_id`, e a regra `Lead = aprovada` — inalterados.
- Todos os prompts de IA (`ai-analysis.ts`, `agent-prompts.ts`) — inalterados.
- O restante do roteiro da Sofia — inalterado.

---

Nenhum código, banco, migration, Sofia, IPR, Meta Pixel/CAPI ou prompt foi alterado para produzir este documento. Aguardando aprovação antes de qualquer implementação.
