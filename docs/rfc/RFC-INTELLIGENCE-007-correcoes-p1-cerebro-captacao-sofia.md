# RFC-INTELLIGENCE-007 — Correções P1 Cérebro × Captação/Sofia

**Status:** ESPECIFICAÇÃO IMPLEMENTADA E DEPLOYADA EM PRODUÇÃO — decisões tomadas por Antonio Carlos (Seção 12); ver `IMPLEMENTATION-INTELLIGENCE-004` (commit `a721f75b80f823d39a8b60dc12f780f7d95ff008`, Edge Function `finalize-candidate` v27)
**Baseada em:** `RFC-INTELLIGENCE-005` (achados), com o P0 já implementado e em produção (`IMPLEMENTATION-INTELLIGENCE-003`, commit `fe78e57`, deploy confirmado)
**Repositório:** `PROJETO CAPTURA DE LEADS 02` (`tania-joias-recrutamento`), branch `main`
**Modo:** 100% investigação + especificação. Nenhum código, banco, `settings`, Landing, Admin, Edge Function foi alterado. Nenhum deploy, nenhum commit. Toda consulta ao Supabase foi `SELECT` read-only.

Os quatro pontos do P0 (idade, WhatsApp, Instagram, atividade profissional/KnowledgeEngine, gate manual do Admin, Paulicéia) **não foram reabertos** — confirmados como já corretos e fora do escopo desta RFC.

---

## 1. Fontes lidas

**Knowledge Layer (`consiggold-v2`, read-only, reconsultado agora):** `cidades-atendidas`, `prazo-referencia-consignacao-30-dias`, `comissao-por-faixa-de-valor-vendido` — conteúdo idêntico ao já registrado na RFC-005 (nenhuma mudança nos KIs desde então).

**Código real (lido integralmente ou grep exaustivo nesta sessão):** `supabase/functions/finalize-candidate/logic.ts` (já P0, revalidado); `apps/landing/src/orchestrator/knowledge/seedDocuments.ts`; `docs/knowledge/COM-001-comissao-consignacao-garantia.md` e `COM-002-recrutamento.md`; `apps/landing/src/components/sections/{Footer,QuemSomos,QuantoPossoGanhar,Hero,ComoFunciona,FAQ,ChamadaFinal,Depoimentos}.tsx`; `packages/shared/src/{constants.ts,schemas.ts}`; `apps/admin/src/pages/SettingsPage.tsx`; `apps/admin/src/components/leads/{LeadFilters,IprBreakdown}.tsx`.

---

## 2. Estado real das cidades (confirmado nesta sessão)

- `settings.cidades_atendidas` (banco real, reconfirmado por `SELECT`): `{"lista":["Mauá","Ribeirão Pires","Santo André","São Bernardo do Campo","São Caetano do Sul"],"restringir":true}` — idêntico à RFC-005, ao KI publicado e ao que o P0 preservou.
- `isCidadeAtendida()` (`logic.ts:61-66`): comparação **exata**, só `trim()` + `toLowerCase()` — sem remover acento, sem separar cidade de UF, sem tolerância a abreviação. **Achado concreto:** a lead real `Paulicéia do nascimento` tem `cidade = "Santo André São Paulo"` no banco — não bate com `"santo andré"` da lista, então ela nunca recebeu os 10 pontos de cidade, apesar de morar numa cidade válida. Isso é evidência direta e real (não hipotética) do risco de normalização tratado na Seção 4.
- Campo `cidade` no wizard da Sofia (`identificacaoSchema.cidade`, `packages/shared/src/schemas.ts`): texto livre, `min(2)`, sem lista suspensa, sem validação contra as 5 cidades.
- **Pós-P0, com `elegivel = trabalha && idade≥18 && whatsapp`:** cidade nunca é motivo de reprovação automática hoje, nem antes nem depois do P0 — só soma ou deixa de somar 10 pontos.

---

## 3. Cidades — análise matemática das 3 opções

Pesos e thresholds reais (inalterados pelo P0): `trabalha=50, experiencia_vendas=20, whatsapp=10, instagram=10, cidade_atendida=10`; `aprovar=80, analise_min=60`.

### Opção 1 — continuar como score (estado atual)

Com `elegivel=true` (trabalha + idade 18+ + WhatsApp confirmado — já garantido pelo P0), o piso é sempre **60** (50+10), porque `elegivel` já exige trabalha e WhatsApp. A partir desse piso, `experiência` (20) e `Instagram` (10) variam livre, e `cidade` (10) só soma se bater a lista:

| Experiência | Instagram | Cidade atendida | IPR | Status |
|---|---|---|---|---|
| — | — | Fora | 60 | em_analise |
| — | — | Dentro | 70 | em_analise |
| — | ✓ | Fora | 70 | em_analise |
| — | ✓ | Dentro | **80** | **aprovada** |
| ✓ | — | Fora | **80** | **aprovada** |
| ✓ | — | Dentro | 90 | aprovada |
| ✓ | ✓ | Fora | 90 | aprovada |
| ✓ | ✓ | Dentro | 100 | aprovada |

**Exemplos reais de combinação, candidata de fora das 5 cidades:**
- **Aprovada:** trabalha + WhatsApp + experiência em vendas, sem Instagram → 80 → aprovada, mesmo morando fora da área.
- **Em análise:** trabalha + WhatsApp + Instagram, sem experiência → 70 → em_analise.
- **Reprovada por cidade sozinha:** **nunca acontece** — o piso de qualquer candidata elegível é 60 (em_analise), cidade nunca derruba abaixo disso.

### Opção 2 — hard gate (mesmo padrão do WhatsApp no P0)

`elegivel = trabalha && idade≥18 && whatsapp && cidadeAtendida`. Mantendo os 10 pontos de cidade na soma (Abordagem A, mesmo raciocínio do P0): o piso de quem passa no gate sobe de 60 para **70** (cidade sempre presente quando elegível), e **qualquer candidata fora das 5 cidades é reprovada automaticamente, incondicionalmente — não importa o resto do perfil**.

| Experiência | Instagram | Cidade | IPR | Status |
|---|---|---|---|---|
| qualquer | qualquer | **Fora** | — | **reprovada (sempre)** |
| — | — | Dentro | 70 | em_analise |
| — | ✓ | Dentro | 80 | aprovada |
| ✓ | — | Dentro | 90 | aprovada |
| ✓ | ✓ | Dentro | 100 | aprovada |

**Exemplo real de risco concreto:** a lead `Paulicéia do nascimento` (cidade real "Santo André", só com string mal-formatada no banco) seria **reprovada automaticamente** sob esta opção, hoje, sem revisão humana nenhuma — apesar de morar numa das 5 cidades reais. Implementar hard gate **sem antes corrigir a normalização** de cidade é o principal risco desta opção.

### Opção 3 — vira condição de revisão manual (não reprovação automática)

Não é um gate binário — é um **teto**: se `elegivel=true` mas `!cidadeAtendida`, o `status` nunca pode ser `"aprovada"` automaticamente, mesmo que o IPR bruto chegasse a 100 — no máximo `"em_analise"`. Candidatas dentro das 5 cidades seguem exatamente a Opção 1 (nada muda pra elas).

| Experiência | Instagram | Cidade | IPR bruto | Status |
|---|---|---|---|---|
| ✓ | ✓ | **Fora** | 90 | **em_analise** (capado, não vira aprovada) |
| ✓ | — | Fora | 80 | em_analise (capado) |
| — | ✓ | Fora | 70 | em_analise (já seria, sem mudança) |
| — | — | Fora | 60 | em_analise (já seria, sem mudança) |
| qualquer combinação | Dentro | igual à Opção 1 | — |

Nenhuma candidata é reprovada automaticamente por cidade; nenhuma é aprovada automaticamente sem revisão humana se morar fora da área.

### Impacto operacional de cada alternativa

| | Opção 1 (score) | Opção 2 (hard gate) | Opção 3 (revisão manual) |
|---|---|---|---|
| Candidata boa perdida por erro de digitação | Não (só perde 10 pontos) | **Sim — reprovada sem chance de revisão** (caso real: Paulicéia) | Não (vai pra revisão, nunca reprovada) |
| Candidata fora da área pode ser aprovada sem controle humano | Sim | Não (nunca passa) | Não (sempre revisada antes de aprovar) |
| Carga de trabalho da equipe (revisão manual) | Baixa (hoje) | Baixa (reprova sozinho, sem revisão) | **Aumenta** — toda candidata elegível fora da área vai pra fila de revisão |
| Risco de decisão errada sem supervisão | Médio (pode aprovar quem a empresa não atende logisticamente) | Alto (reprova quem a empresa atenderia, por erro de string) | Baixo |
| Consistente com "IA/regra não decide sozinha o que precisa de julgamento humano" | Parcial | Não | **Sim** |

---

## 4. Cidades — matriz de decisão

| Opção | Comportamento | Impacto no IPR | Impacto operacional | Risco | Recomendação |
|---|---|---|---|---|---|
| **Score atual** | Cidade soma 0 ou 10 pts; nunca bloqueia | Nenhuma mudança | Nenhum | Pode aprovar automaticamente candidata fora da área de logística real | Manter até decisão do dono — é o status quo seguro |
| **Hard gate** | `cidadeAtendida` vira gate igual trabalha/idade/WhatsApp; reprova sozinho, incondicional | Piso sobe 60→70 pra quem passa; ninguém fora da lista passa | Reduz leads fora da área a zero automaticamente, sem trabalho de equipe | **Alto** — reprova por erro de digitação sem revisão (caso real comprovado: Paulicéia); exige normalização robusta ANTES de ativar | **Não recomendado agora** — só depois de normalizar cidade (accent-insensitive, separar UF, aceitar variações) e/ou trocar o campo livre por uma lista suspensa no wizard |
| **Revisão manual (teto em `em_analise`)** | Elegível + fora da lista nunca vira `aprovada` sozinho; sempre cai pra revisão humana | Piso permanece 60; teto capado em `em_analise` quando fora da lista | Aumenta fila de revisão manual (mais candidatas em `em_analise`) | Baixo — nenhuma candidata boa é perdida automaticamente | **Recomendação técnica, se o dono quiser mais controle geográfico:** esta opção, não o hard gate — evita perder candidatas por erro de digitação e ainda dá controle humano sobre expandir a área informalmente |

Sobre logística real, possibilidade futura de ampliar cidades e não perder boas candidatas por erro de digitação: a Opção 3 é a única que atende as três preocupações simultaneamente sem exigir nenhuma mudança de infraestrutura (o campo `restringir` de `settings.cidades_atendidas` já existe e já é editável pelo Admin — `SettingsPage.tsx:441-499` — então ampliar/reduzir a lista já é possível hoje, sem código novo, em qualquer uma das 3 opções).

**Se o dono optar por gate (Opção 2) no futuro:** recomendação técnica é usar `em_analise`, não reprovação direta, **e só depois de resolver a normalização** — não usar bloqueio antes do cálculo do IPR (isso escondaria da equipe até o dado bruto da candidata, dificultando auditoria/correção manual de erro de digitação).

**Esta RFC não decide entre as 3 opções — fica registrado como a primeira decisão pendente do dono (Seção 12).**

---

## 5. Fonte única de cidades

| Fonte | Papel | Tipo |
|---|---|---|
| `settings.cidades_atendidas` (Supabase) | **Fonte executável real** — usada por `isCidadeAtendida()` em `finalize-candidate`, editável via `SettingsPage.tsx` | Executável |
| `com-002-elegibilidade` (`seedDocuments.ts`) + `COM-002-recrutamento.md` | Lista as mesmas 5 cidades em prosa, servida pela IA quando perguntada | Explicativa (já corretamente sincronizada com o setting, confirmado nesta sessão) |
| `packages/shared/src/constants.ts:235-241` (`IPR_PESOS.cidade_atendida = 10`) | **Duplicação não notada antes** — hardcoded, usada só por `IprBreakdown.tsx` no Admin para desenhar a barra/label de "Cidade" no detalhe do IPR. Hoje bate com `settings.ipr_pesos.cidade_atendida` (10) por coincidência de sincronização manual, não por design — se alguém mudar o peso em `settings` no futuro (quando esse peso se tornar editável pela UI, hoje não é), o Admin mostraria um valor errado sem ninguém perceber. | Executável duplicada (só para exibição, não decide nada, mas pode **exibir** um número errado |
| Landing wizard (`cidade` step) | Campo de texto livre, sem lista, sem validação contra as 5 cidades | Não é fonte, é coleta |
| `LeadFilters.tsx` (Admin) | Lista de cidades do filtro é montada dinamicamente a partir das cidades que já apareceram em leads reais — não é uma cópia da lista de elegibilidade, é outra coisa (filtro de busca) | Não é uma duplicação da regra |

**Proposta (não implementada):** `settings.cidades_atendidas` continua sendo a única fonte executável. `com-002-elegibilidade`/`COM-002.md` continuam como fonte explicativa (já corretas). `packages/shared/src/constants.ts` deveria, no futuro, deixar de hardcodar `cidade_atendida: 10` e ler o peso real de `settings.ipr_pesos` (o mesmo já vale para os outros 4 pesos ali hardcoded — não é um problema exclusivo de cidade, mas cidade é o único dos 5 que esta RFC foi pedida para investigar). Isso respeita "o Cérebro aprende a explicar, não a recalcular": nenhuma mudança aqui envolve o Knowledge Layer, é puramente sobre não duplicar configuração executável dentro do próprio código do produto.

---

## 6. Landing — "todo o Brasil" / "todo o ABCD"

**Todos os textos regionais reais encontrados** (grep exaustivo em `apps/landing/src/components/sections/*`; nenhum outro arquivo de Landing menciona região):

| Arquivo | Linha | Texto atual |
|---|---|---|
| `Footer.tsx` | 11-12 | "Semijoias premium para revendedoras em **todo o Brasil**." |
| `QuemSomos.tsx` | 43 | `INDICADORES = [..., "Atendimento em **todo o ABCD**"]` |

Nenhum outro componente (`Hero`, `ComoFunciona`, `FAQ`, `ChamadaFinal`, `Depoimentos`) menciona cidade/região. `Depoimentos.tsx` (3 depoimentos) usa "Mauá" nos três — consistente com a área real, sem conflito.

**Proposta de redação (não implementada, seguindo o exemplo do pedido):**

`Footer.tsx:11-12`:
> "Semijoias premium para revendedoras em Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo e São Caetano do Sul."

`QuemSomos.tsx:43` (item da lista `INDICADORES`):
> "Atendimento em Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo e São Caetano do Sul" — ou, se o espaço no layout for um problema (é um indicador curto ao lado de "Produtos Premium"/"Suporte Especializado"), uma versão compacta: **"Atendimento no Grande ABC + Mauá e Ribeirão Pires"** (nomenclatura de região mais precisa que "ABCD", que tradicionalmente inclui Diadema — não uma das 5 — e não inclui Mauá/Ribeirão Pires da forma como o termo é usado popularmente).

Complementar, em algum lugar próximo (Footer ou uma nova linha em QuemSomos), frase de flexibilidade futura:
> "Nossa área de atendimento pode ser ampliada conforme a logística da empresa."

**Nenhuma dessas propostas transforma a lista em algo hardcoded de novo** — o texto deve continuar sendo só uma cópia estática das mesmas 5 cidades já existentes em `settings.cidades_atendidas`, sujeita a ficar desatualizada se a lista mudar no futuro (mesmo risco de duplicação da Seção 5, já existente hoje para `com-002-elegibilidade`) — fora do escopo desta RFC resolver isso via automação (o princípio do Cérebro é o texto explicar, não a Landing consultar `settings` em tempo real na página estática).

---

## 7. Prazo de ~30 dias — estado real e proposta

**Todas as fontes atuais encontradas:**

| Fonte | Conteúdo | Rigidez do texto |
|---|---|---|
| `docs/knowledge/COM-001-comissao-consignacao-garantia.md:9-21` | "Ela tem **30 dias** para trabalhar (revender) esse mostruário. Ao final dos 30 dias, ela faz o **acerto**" | Soa como prazo fixo — não menciona reagendamento |
| `seedDocuments.ts` (`com-001-consignacao`) | "tem 30 dias para revender esse mostruário. Ao final dos 30 dias, ela faz o acerto" — praticamente idêntico ao COM-001 | Mesma rigidez — é o texto **servido de verdade pela IA hoje** (`sofia_perguntas_ia_ativa=true`) |
| Landing (`Hero`, `ComoFunciona`, `FAQ`, `QuemSomos`, `ChamadaFinal`, `Footer`) | **Nenhuma menção a "30 dias"** em nenhum lugar da Landing estática | Não aplicável — não existe texto pra corrigir aqui |
| Admin | Nenhuma menção a "30 dias" encontrada em `apps/admin/src` | Não aplicável |
| Sofia (roteiro fixo, `sofia-script.ts`) | Nenhuma menção — o prazo só aparece se a candidata perguntar e a IA buscar `com-001-consignacao` | — |

**Conclusão:** existe uma única fonte real de risco de comunicação rígida — o par `COM-001.md` / `com-001-consignacao` — e ela só chega à candidata se ela perguntar espontaneamente "como funciona o prazo/acerto" (via FEATURE-004, IA + KnowledgeEngine). O texto atual não é errado no fato (30 dias, mostruário, acerto), só omite inteiramente a flexibilidade que o KI publicado deixa explícita ("pode ocorrer antes ou depois... pode ser reagendado... não é prazo absolutamente rígido... o que preocupa é não cumprir o combinado").

**Proposta de texto canônico (não implementada):**

`docs/knowledge/COM-001-comissao-consignacao-garantia.md` (substituir o parágrafo do tópico "Consignação — como funciona o ciclo"):
> "Não. A revendedora recebe um mostruário de peças sem pagar nada adiantado. Ela tem cerca de 30 dias como referência para trabalhar (revender) esse mostruário — não é um prazo rígido: o acerto pode ser antecipado, adiado ou reagendado, desde que combinado com a equipe. O que importa é cumprir o que foi combinado."
>
> "No acerto: paga para a Tania Joias apenas as peças que vendeu, já com a comissão descontada; devolve as peças que não vendeu; recebe um novo mostruário e o ciclo recomeça."

`seedDocuments.ts` (`com-001-consignacao`, mesma correção, versão compilada):
> "A revendedora recebe um mostruário de peças sem pagar nada adiantado e tem cerca de 30 dias como referência para revender esse mostruário — não é um prazo rígido, pode ser antecipado, adiado ou reagendado combinando com a equipe. Ao final, ela faz o acerto: paga à Tania Joias apenas as peças que vendeu (já com a comissão descontada) e devolve as peças que não vendeu. Em seguida recebe um novo mostruário e o ciclo recomeça."

**Sofia (linguagem curta e natural, para o caso de a IA resumir/parafrasear a resposta ao vivo):** como a resposta real é gerada por IA a partir do documento (não é texto fixo), a correção do documento-fonte acima já deve refletir na resposta da IA automaticamente — não é necessário (nem possível, sem reabrir o Agent Core) fixar uma frase literal para a Sofia dizer. Se quiserem reforçar via prompt, uma frase-guia possível para `_shared/agent-prompts.ts` (não implementada, fora do escopo de código desta RFC): *"Ao falar sobre o prazo de acerto, sempre deixe claro que ~30 dias é referência, não prazo fixo — pode reagendar combinando antes."*

**Landing:** não existe texto relevante a corrigir — nenhuma menção a prazo em nenhuma seção estática.

**Confirmação explícita:** nenhuma lógica executável, timer, gate ou automação de 30 dias foi proposta ou deve ser criada — isto é 100% correção de comunicação, o prazo continua sendo um acordo operacional humano, nunca um cálculo de sistema.

---

## 8. Ganhos em R$ — auditoria completa

**Componente:** `apps/landing/src/components/sections/QuantoPossoGanhar.tsx:5-25` (único lugar do código com valores em R$ de ganho — confirmado por grep em todo o repositório).

| Texto/valor | Arquivo | Onde aparece | Fonte empresarial encontrada? | Tipo |
|---|---|---|---|---|
| "R$ 300 – R$ 600 /mês" (tier "Começando", 1h/dia) | `QuantoPossoGanhar.tsx:9` | Card de faixa de ganho na Landing | Nenhuma — não aparece em nenhum `COM-*`, KI publicado, ou comentário de commit | **SEM FONTE** |
| "R$ 800 – R$ 1.800 /mês" (tier "Consistente", 2-3h/dia, marcado "Mais comum") | `QuantoPossoGanhar.tsx:15` | Card de faixa de ganho | Nenhuma | **SEM FONTE** |
| "R$ 2.000+ /mês" (tier "Dedicada", 4h+/dia) | `QuantoPossoGanhar.tsx:22` | Card de faixa de ganho | Nenhuma | **SEM FONTE** |
| "Valores ilustrativos, baseados no histórico de revendedoras da Tania Joias" | `QuantoPossoGanhar.tsx:70-71` | Disclaimer abaixo dos cards | A frase **afirma** uma base empírica ("baseados no histórico") que não foi possível confirmar em nenhuma fonte do repositório — nem código, nem documento, nem KI | **PROMESSA/AFIRMAÇÃO NÃO CONFIRMADA** (o disclaimer em si faz uma alegação de fonte que não está comprovada) |
| "Ganhe até 40% de comissão!" (`Hero.tsx:22`) / "Ganhe até 40% de comissão revendendo produtos de alto valor percebido." (`QuemSomos.tsx:29`) | `Hero.tsx`, `QuemSomos.tsx` | Destaque e card de benefício | **Sim** — bate com o teto da tabela de comissão do KI publicado (30/35/40%) | **REGRA CONFIRMADA** (simplificada, mas correta — já havia sido classificada assim na RFC-005, não é uma faixa de ganho em R$, é a comissão % oficial) |

**Separação pedida:**
- **Comissão oficial 30/35/40%:** correta e já comunicada em % (Hero/QuemSomos) — sem problema, fora desta auditoria de R$.
- **Exemplo hipotético:** os 3 tiers de R$ não são apresentados como "exemplo" — são apresentados como faixas reais ("Veja faixas de referência de revendedoras em diferentes ritmos"), o que os aproxima mais de estimativa/promessa do que de exemplo hipotético claramente rotulado.
- **Promessa de renda:** o disclaimer ("Não é garantia de ganhos") tecnicamente nega ser promessa — mas a frase anterior, no mesmo parágrafo, afirma que os valores são "baseados no histórico de revendedoras", o que empresta credibilidade factual às três faixas sem fonte comprovável.

**Classificação final: `PRECISA-DO-DONO`** — nenhuma das 3 faixas em R$ tem fonte empresarial confirmável nesta investigação. Não estou inventando nem sugerindo uma faixa nova nem recomendando removê-las — só registrando que, sem confirmação do Antonio de que esses números vêm de dados reais de revendedoras (e não foram valores estimados na hora de escrever a copy), eles não podem ser tratados como "conhecimento confirmado" para fins do Cérebro.

**Pergunta mínima necessária ao dono (Seção 12):** os valores de R$ 300–600 / R$ 800–1.800 / R$ 2.000+ por mês em `QuantoPossoGanhar.tsx` vêm de dados reais de revendedoras (histórico de vendas/comissão), ou foram estimativas de copy? Se forem reais, qual o período/amostra de referência (pra poder documentar como KI oficial no futuro)? Se forem estimativas, o texto do disclaimer ("baseados no histórico") deveria ser ajustado para não afirmar uma origem que não existe.

---

## 9. Testes futuros (especificação, não escritos agora)

| # | Cenário | Verifica |
|---|---|---|
| 1 | Candidata em cidade atendida (ex.: "Mauá") | `isCidadeAtendida` retorna `true`; IPR soma os 10 pontos |
| 2 | Candidata fora da cidade (ex.: "Guarulhos") | Comportamento conforme a opção decidida (Seção 4) — hoje: soma 0, nunca bloqueia |
| 3 | Cidade com variação de escrita (ex.: "santo andré", "Santo Andre" sem acento, "Santo André SP", "Sto. André") | Hoje: só "santo andré" (sem UF, com acento) bate — as outras 3 variações falham. Teste deve documentar esse comportamento atual antes de qualquer melhoria de normalização |
| 4 | Sofia responde área atendida corretamente quando perguntada | `KnowledgeEngine.searchByQuestion("vocês atendem minha cidade?")` encontra `com-002-elegibilidade` com as 5 cidades corretas (já coberto indiretamente pelos testes do P0, mas nenhum teste específico pra pergunta de área hoje) |
| 5 | Landing não fala "todo o Brasil" nem "todo o ABCD" | Teste de conteúdo estático (grep/snapshot) em `Footer.tsx`/`QuemSomos.tsx`, após a correção de texto ser aplicada |
| 6 | Sofia explica 30 dias como referência, não prazo fixo | `KnowledgeEngine.searchByQuestion("quanto tempo tenho pra vender?")` encontra `com-001-consignacao` (corrigido) e o conteúdo contém "não é um prazo rígido" ou equivalente |
| 7 | Nenhum texto da Landing promete ganho não confirmado | Requer decisão do dono primeiro (Seção 8) — o teste em si só pode ser escrito depois que os valores forem confirmados ou removidos/reclassificados |

Nenhum desses foi implementado nesta sessão — ficam especificados para quando a implementação for autorizada.

---

## 10. Riscos de mudança

| Risco | Avaliação |
|---|---|
| Impacto em conversão da Landing | Corrigir "todo o Brasil"→5 cidades pode reduzir o público que preenche o cadastro (menos gente se sente elegível) — efeito esperado e correto (reduz candidaturas de quem a empresa não consegue atender de qualquer forma) |
| Impacto em volume de leads | Mesmo raciocínio — queda de volume bruto, mas aumento de qualidade/aderência real |
| Impacto em Meta/CAPI | Nenhum — o evento `Lead` já só dispara em `status="aprovada"`, que não muda de mecanismo nesta RFC (nenhuma implementação ainda) |
| Impacto no IPR | Depende da opção escolhida na Seção 4 — Opção 1 (atual) = zero impacto; Opções 2/3 mudam quem chega a `aprovada` automaticamente, conforme as tabelas das Seções 3-4 |
| Impacto em candidatas já existentes | Nenhuma alteração retroativa proposta — ver próximo item |
| Impacto no funil | Se Opção 2/3 for adotada, aumenta (Opção 3) ou elimina (Opção 2) o caminho de aprovação automática pra quem mora fora da área — afeta só candidaturas *novas*, não as já registradas |
| Risco de reclassificação retroativa | **Não avaliado como necessário** — ver Seção 11 |

**Por padrão, esta RFC não propõe nenhuma alteração retroativa em leads antigos** — inclusive porque, sob a Opção 1 (atual), nada muda; e sob as Opções 2/3, mudar a regra pra frente não implica reavaliar quem já foi decidido no passado (mesmo princípio já seguido no P0 com a Paulicéia).

---

## 11. Migrations e `settings`

**Migrations necessárias: 0**, para qualquer uma das 3 opções de cidade — `settings.cidades_atendidas` já existe e já tem o campo `restringir` que today alterna entre "soma pontos sempre" (`restringir=false`) e "só soma se bater a lista" (`restringir=true`, valor atual). Implementar a Opção 2 ou 3 é mudança de **código** (`logic.ts`), não de schema.

**`settings` que precisariam mudar:** nenhuma automaticamente. Se o dono quiser, no futuro, que a Opção 2/3 seja também configurável (ligar/desligar sem novo deploy, como já é `sofia_ia_ativa` etc.), seria necessário adicionar uma nova chave (ex.: `cidade_como_gate: {modo: "score" | "gate" | "revisao"}`) — **não proposto para implementação agora**, só registrado como possibilidade.

---

## 12. Decisões pendentes do dono (contagem: 5)

1. **Cidades:** manter score (Opção 1), virar hard gate (Opção 2, não recomendado sem normalização), ou virar teto de revisão manual (Opção 3, recomendação técnica se quiser mais controle) — Seção 4.
2. **Landing/Footer/QuemSomos:** aprovar a redação proposta na Seção 6 (ou ajustar).
3. **COM-001/seedDocuments (30 dias):** aprovar a redação proposta na Seção 7 (ou ajustar).
4. **Faixas de ganho em R$:** confirmar se `QuantoPossoGanhar.tsx` tem lastro real em dados de revendedoras, e qual período/amostra — Seção 8.
5. **Normalização de cidade** (pré-requisito prático se a Opção 2 for escolhida no futuro): decidir se vale investir em normalização (accent-insensitive, separar UF, lista suspensa no wizard em vez de texto livre) antes de qualquer gate — não é uma decisão de conteúdo, é uma decisão de investimento de engenharia futura.

---

## 13. Arquivos futuros a alterar (quando autorizado — não implementado agora)

| Arquivo | Mudança futura |
|---|---|
| `apps/landing/src/components/sections/Footer.tsx` | Texto de região (linha 11-12) |
| `apps/landing/src/components/sections/QuemSomos.tsx` | Item `INDICADORES` (linha 43) |
| `docs/knowledge/COM-001-comissao-consignacao-garantia.md` | Texto do tópico de consignação (30 dias como referência) |
| `apps/landing/src/orchestrator/knowledge/seedDocuments.ts` | `com-001-consignacao` (mesma correção, versão compilada) |
| `supabase/functions/finalize-candidate/logic.ts` | **Só se** a Opção 2 ou 3 de cidade for escolhida — novo parâmetro/lógica em `calcularElegibilidade`/`decidirStatus` |
| `packages/shared/src/constants.ts` | Opcional/menor prioridade — parar de hardcodar `IPR_PESOS`/`IPR_THRESHOLDS`, ler de `settings` (fora do escopo estrito desta RFC, registrado na Seção 5) |
| `apps/landing/src/components/sections/QuantoPossoGanhar.tsx` | Só depois da decisão do dono (Seção 8) — pode ser manter, ajustar valores, ou ajustar o disclaimer |

---

## 14. Confirmação de nenhuma implementação

Confirmado — nenhum arquivo de código, schema, `settings`, Landing, Admin ou Edge Function foi alterado nesta sessão. Todas as consultas ao Supabase (`iaqzbernshmhkqznleye` e `shvqtmjmquclxwqqfnbh`) foram `SELECT` read-only.

## 15. Arquivos realmente alterados nesta tarefa

Um único arquivo criado: este documento (`docs/rfc/RFC-INTELLIGENCE-007-correcoes-p1-cerebro-captacao-sofia.md`). Nenhum arquivo existente foi modificado.

## 16. Bloqueadores

Nenhum. Todas as fontes necessárias (código real, `settings` real, KIs publicados) estavam acessíveis em modo read-only sem necessidade de reativar/pausar nenhum projeto Supabase.

## 17. Próximo passo recomendado (não executado)

Levar as 5 decisões pendentes da Seção 12 ao Antonio Carlos — em particular a pergunta 4 (faixas de R$) é a que tem maior risco de comunicação enganosa se ficar sem resposta por mais tempo, e a pergunta 1 (cidades) é a que mais interage com trabalho de engenharia futuro (normalização), então vale decidir essas duas primeiro. Depois de decididas, uma futura RFC-INTELLIGENCE-008 especificaria a implementação (mesmo padrão da RFC-006), a ser feita só quando autorizada.

Parando aqui, conforme instruído.
