# INVENTÁRIO-INTELLIGENCE-002 — Conhecimento Existente no Sistema de Captação e Sofia

> Este documento contém candidatos a conhecimento. Nenhum achado deste inventário é automaticamente conhecimento oficial do Cérebro Tania Joias.

**Data:** 2026-08-16
**Escopo:** somente este workspace (Landing + Admin + Sofia + Supabase `tania-joias-crm`, ref `iaqzbernshmhkqznleye`). Não foi lido nem comparado nenhum conteúdo do ConsigGold — essa comparação fica para uma etapa futura.
**Modo:** somente leitura. Nenhum código, prompt, migration, banco, Landing, Admin, CRM ou WhatsApp foi alterado para produzir este documento. A única escrita realizada é este arquivo.
**Fontes consultadas:** `docs/knowledge/COM-001..004`, `docs/playbooks/PLAYBOOK-001-sofia.md`, `docs/rfc/RFC-012/013/013.1`, `docs/qualificacao/QUALIFICACAO-002`, `apps/landing/src/orchestrator/knowledge/*` (seedDocuments, KnowledgeEngine, KnowledgeRepository, KnowledgeTool), `apps/landing/src/orchestrator/agent/*`, `apps/landing/src/orchestrator/{Planner,SofiaOrchestrator,composer}/*`, `apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts`, `apps/landing/src/hooks/useSofiaFlow.ts`, `apps/landing/src/data/sofia-script.ts`, `apps/landing/src/orchestrator/classifyForFeature004.ts`, `apps/landing/src/components/sections/*` (Landing pública), `supabase/functions/{agent-ai-gateway,sofia-config,sofia-reagir,finalize-candidate,submit-ficha,get-ficha,send-lembretes-ficha}/index.ts`, `supabase/functions/_shared/{agent-prompts,ai-analysis,sofia-reacao,whatsapp-cloud-api}.ts`, `apps/admin/src/hooks/useSettings.ts`, `apps/admin/src/components/leads/TaniaAprovacaoSection.tsx`, `packages/shared/src/constants.ts`, tabela `public.settings` do Supabase real (consulta `SELECT` read-only via MCP), e o diagnóstico técnico irmão já existente neste repositório, `DIAGNOSTICO-CAPTURA-LEADS-CEREBRO-TANIA.md` (2026-08-15), usado aqui como fonte cruzada de corroboração técnica, nunca como fonte de conhecimento de negócio por si só.

Também foi identificada e **excluída da análise como fonte oficial** a pasta `landing/` na raiz do repositório: é uma cópia antiga, fora dos workspaces npm (`package.json` raiz só lista `apps/*`/`packages/*`), com último commit em 2026-07-29, enquanto `apps/landing/` (a app real) foi alterada pela última vez em 2026-08-13. Todo o texto/roteiro deste inventário vem de `apps/landing/`.

---

## 1. Como ler este documento

- Cada achado tem uma **classificação** (seção 2) que diz o quão "oficial" ele é hoje — a maioria começa em `[DOCUMENTADO]`, `[CONFIGURADO]` ou `[CONFIRMADO-EXECUTAVEL]`, nenhuma em "aprovado para o Cérebro".
- Regras determinísticas (IPR, elegibilidade, pipeline) são separadas de conhecimento de negócio conforme a seção 3 — nunca viradas texto solto sem contexto.
- A seção 5 (duplicação) e a seção 6 (contradições) são o conteúdo mais crítico deste inventário — é onde o sistema, hoje, diz coisas diferentes sobre a mesma coisa.
- A seção 7 ("o que a Sofia realmente usa hoje") é a peça mais nova em relação ao que já existia: **confirma, por leitura direta de `useSofiaFlow.ts` e por consulta ao banco real, que a Sofia HOJE responde perguntas de negócio ao vivo usando os 8 documentos de `seedDocuments.ts`** — um comentário no próprio código (`answerCandidateQuestion.ts`) afirma o contrário e está desatualizado (ver CAP-CON-006).

---

## 2. Legenda de classificação

| Tag | Significado |
|---|---|
| `[CONFIRMADO-EXECUTAVEL]` | Regra atualmente executada pelo sistema (código real, rodando, confirmado). |
| `[CONFIRMADO-MULTIFONTE]` | Aparece consistentemente em múltiplas fontes atuais. |
| `[DOCUMENTADO]` | Existe em documentação (`.md`), sem confirmação direta de que chega ao runtime. |
| `[PROMPT-HARDCODED]` | Está embutido literalmente num prompt/Edge Function. |
| `[CONFIGURADO]` | Vem de configuração viva (tabela `settings`), editável sem deploy. |
| `[LEGADO/POSSIVELMENTE-OBSOLETO]` | Parece pertencer a um fluxo antigo, substituído ou nunca finalizado. |
| `[CONTRADITORIO]` | Duas ou mais fontes atuais dizem coisas diferentes. |
| `[INFERIDO]` | Inferência de comportamento, sem confirmação literal. |
| `[PRECISA-DO-DONO]` | Só Carlos/Tania podem confirmar. |

---

## 3. Conhecimento vs. regra determinística

Este inventário separa:

- **CONHECIMENTO** — frases que a Sofia poderia dizer a uma candidata ("não é preciso comprar um mostruário para começar").
- **REGRA EXECUTÁVEL** — cálculo/decisão que o sistema faz sozinho (ex.: `calcularIpr`, `isCidadeAtendida`). Uma regra determinística **nunca** é copiada para dentro de um item de conhecimento sem o bloco `FONTE_EXECUTAVEL` abaixo — o futuro Cérebro pode **explicar** a regra, nunca substituir o cálculo real.

```text
FONTE_EXECUTAVEL:
tipo: <função/arquivo>
referência: <caminho:linha>
descrição: <o que a regra faz, em 1-2 frases>
```

Todas as regras executáveis relevantes encontradas estão listadas na seção 4 (dentro de cada tema) e resumidas aqui para referência rápida:

```text
FONTE_EXECUTAVEL — IPR (Índice de Potencial da Revendedora)
tipo: função determinística (calcularIpr/decidirStatus/classificarPerfil)
referência: supabase/functions/finalize-candidate/index.ts:88-132
descrição: soma pesos configuráveis (settings.ipr_pesos, hoje trabalha=50,
experiencia_vendas=20, whatsapp=10, instagram=10, cidade_atendida=10 — total
100) só se trabalha=true (senão IPR=0 e reprovada, sem exceção); aprova se
IPR>=80, em_analise se IPR entre 60 e 79, senão reprovada. Confirmado ao
vivo no Supabase em 2026-08-16 (settings.ipr_pesos/ipr_thresholds).

FONTE_EXECUTAVEL — cidade atendida
tipo: função determinística (isCidadeAtendida)
referência: supabase/functions/finalize-candidate/index.ts:81-86
descrição: compara a cidade digitada (texto livre, case-insensitive) contra
settings.cidades_atendidas.lista; só é usada para dar OU NÃO 10 pontos no
IPR — nunca bloqueia a candidatura sozinha (ver CAP-CON-001).

FONTE_EXECUTAVEL — pipeline pós-aprovação
tipo: função determinística (pipelineColumnKeyForLead/patchForPipelineColumn)
referência: packages/shared/src/constants.ts:104-220
descrição: combina lead_status + etapa_pos_aprovacao (contatada → confirmada
→ aguardando_tania → ativa | desistiu) num único Kanban de 6 colunas
visuais; nunca reavalia IPR/status de qualificação.
```

---

## 4. Achados por área

### 4.1 Empresa

**CANDIDATO: CAP-KNOW-001**
TEMA: Quem é a Tania Joias / proposta de valor
CATEGORIA SUGERIDA: Empresa
RESUMO: Empresa de revenda de semijoias por consignação, com sede/endereço físico em Mauá/SP, que se posiciona como ajudando "mulheres a conquistar independência financeira" através da revenda, oferecendo produtos "premium", treinamento e suporte "em todas as etapas".
EVIDÊNCIAS: `apps/landing/src/components/sections/QuemSomos.tsx:50-60`; `apps/landing/src/components/sections/Footer.tsx:9-13,29-36` (endereço "R. Vereador Fernando Zanella, 13 — 1º andar, sala 04, Centro, Mauá/SP", telefone "(11) 94637-0390"); `docs/playbooks/PLAYBOOK-001-sofia.md:18` ("Sua missão é encontrar mulheres com perfil para se tornarem excelentes revendedoras").
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]` (proposta de valor) + `[DOCUMENTADO]` (endereço/telefone, nunca verificado fora do código).
RUNTIME ATUAL USA? Parcial — a Landing exibe isso sempre; a Sofia (IA) não tem esse texto em nenhum `seedDocuments.ts`, então não pode citá-lo literalmente se perguntada.
FONTE_EXECUTAVEL: nenhuma (é copy estático, não regra).
CONFIANÇA: Alta (texto existe e está ao vivo), Baixa quanto a "tempo de mercado" (não encontrado em nenhum lugar).
PODE VIRAR CONHECIMENTO OFICIAL? Não ainda — falta tempo de mercado, história da empresa, CNPJ/razão social.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: Há quanto tempo a Tania Joias existe, e há uma versão curta da "história da empresa" que a Sofia poderia contar se perguntada?
OBSERVAÇÕES: Nenhum documento (`COM-00X`) cobre "quem somos" — é conhecimento que só existe como copy de marketing, nunca como base para a Sofia responder.

**CANDIDATO: CAP-KNOW-002**
TEMA: Diferenciais declarados (treinamento, suporte, produtos premium, margem)
CATEGORIA SUGERIDA: Empresa
RESUMO: A Landing lista 6 "diferenciais": semijoias premium com garantia, treinamento completo, suporte desde o primeiro atendimento, "até 40% de comissão", venda por qualquer canal (presencial/WhatsApp/redes sociais), "empresa consolidada".
EVIDÊNCIAS: `apps/landing/src/components/sections/QuemSomos.tsx:10-41`.
CLASSIFICAÇÃO: `[CONFIGURADO]`/`[DOCUMENTADO]` — texto de marketing, não vem de `docs/knowledge`.
RUNTIME ATUAL USA? Sim, sempre (Landing pública, sem flag).
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Média — "até 40% de comissão" bate com COM-001; "treinamento completo" e "suporte" não têm nenhum documento de apoio (ver CAP-KNOW-023, lacuna).
PODE VIRAR CONHECIMENTO OFICIAL? Parcial — só a parte de comissão tem lastro documental.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: (ver CAP-KNOW-023 sobre treinamento).
OBSERVAÇÕES: —

**CANDIDATO: CAP-KNOW-003**
TEMA: Área de atuação real (declarada) — "todo o Brasil" x 5 cidades do ABC Paulista
CATEGORIA SUGERIDA: Empresa / Recrutamento
RESUMO: O rodapé do site declara "Semijoias premium para revendedoras em **todo o Brasil**", e a seção QuemSomos declara "Atendimento em todo o ABCD" — duas afirmações amplas — enquanto a elegibilidade real (COM-002, `settings.cidades_atendidas`) restringe a 5 cidades específicas (Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo, São Caetano do Sul).
EVIDÊNCIAS: `apps/landing/src/components/sections/Footer.tsx:11-13`; `apps/landing/src/components/sections/QuemSomos.tsx:43`; `docs/knowledge/COM-002-recrutamento.md:16`; Supabase real, `settings.cidades_atendidas` (consulta 2026-08-16): `{"lista":["Mauá","Ribeirão Pires","Santo André","São Bernardo do Campo","São Caetano do Sul"],"restringir":true}`.
CLASSIFICAÇÃO: `[CONTRADITORIO]` — ver CAP-CON-004.
RUNTIME ATUAL USA? Sim (Footer sempre visível); a frase "todo o Brasil" nunca é usada pela Sofia (não está em nenhum `seedDocuments.ts`).
FONTE_EXECUTAVEL: ver bloco de cidade atendida na seção 3.
CONFIANÇA: Alta que a contradição existe; baixa sobre qual das duas está "certa".
PODE VIRAR CONHECIMENTO OFICIAL? Não — precisa decisão do dono primeiro.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: ver pergunta 5 da seção 15.
OBSERVAÇÕES: "ABCD" no texto da QuemSomos também é levemente impreciso — a lista real tem 5 cidades da região do Grande ABC (falta, por ex., Diadema/Mauá já está, mas "ABCD" tradicionalmente inclui Santo André/São Bernardo/São Caetano/Diadema — Mauá e Ribeirão Pires não são o "ABCD" clássico). Nomenclatura de região, não substância de regra.

---

### 4.2 Oportunidade de revenda / Recrutamento

**CANDIDATO: CAP-KNOW-004**
TEMA: Quem pode se candidatar (elegibilidade declarada)
CATEGORIA SUGERIDA: Recrutamento
RESUMO: Documento oficial diz que, para ser revendedora, é necessário: ser mulher, acima de 21 anos; morar em uma das 5 cidades atendidas; ter WhatsApp e Instagram; estar trabalhando (empresa/escola/hospital) ou ser cabeleireira em salão.
EVIDÊNCIAS: `docs/knowledge/COM-002-recrutamento.md:14-19` (v1.1, revisado por Antonio); `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:83-95` (`com-002-elegibilidade`, versão compilada idêntica em conteúdo).
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]` como texto — mas ver CAP-CON-001/002/003 para a divergência com a regra executável real.
RUNTIME ATUAL USA? Sim — é um dos 8 documentos que a Sofia usa para responder perguntas de negócio (`sofia_perguntas_ia_ativa=true` em produção, ver seção 7).
FONTE_EXECUTAVEL: nenhuma neste nível (é o texto declarado — a regra real que a diferencia está nos itens CAP-KNOW-005 a 008).
CONFIANÇA: Alta quanto ao texto existir e estar ativo; baixa quanto a refletir 100% o que o sistema realmente decide.
PODE VIRAR CONHECIMENTO OFICIAL? Sim, mas só depois de decidir a divergência das seções 6/15.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: ver perguntas 4, 6 e 7 da seção 15.
OBSERVAÇÕES: —

**CANDIDATO: CAP-KNOW-005**
TEMA: Único critério realmente eliminatório hoje é "estar trabalhando"
CATEGORIA SUGERIDA: Recrutamento
RESUMO: Apesar da elegibilidade declarada ter 5 condições (sexo, idade, cidade, WhatsApp, Instagram, trabalho), a única que de fato reprova automaticamente e sem exceção é `trabalha = false`. Todas as outras (cidade, WhatsApp, Instagram, experiência) só somam pontos no IPR — uma candidata pode ser aprovada sem nenhuma delas, desde que o total chegue a 80 (ex.: trabalha 50 + experiência 20 + WhatsApp 10 + Instagram 10 = 90, sem nenhum ponto de cidade).
EVIDÊNCIAS: `supabase/functions/finalize-candidate/index.ts:88-109` (`calcularIpr`/`decidirStatus`); Supabase real, `settings.ipr_pesos`/`ipr_thresholds` (2026-08-16).
CLASSIFICAÇÃO: `[CONFIRMADO-EXECUTAVEL]`.
RUNTIME ATUAL USA? Sim, sempre — é o motor de aprovação real.
FONTE_EXECUTAVEL: ver bloco IPR na seção 3.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Não ainda — é uma descoberta que precisa virar decisão de negócio antes (ver CAP-CON-001/002/003).
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim — ALTO RISCO se a Sofia continuar dizendo que cidade/WhatsApp/Instagram são "necessários" enquanto o sistema aprova sem eles.
PERGUNTA PARA O DONO: ver perguntas 4 e 7 da seção 15.
OBSERVAÇÕES: Este é o achado mais importante de todo o inventário do ponto de vista de risco operacional.

**CANDIDATO: CAP-KNOW-006**
TEMA: Cidade atendida — declarada obrigatória, mas apenas pontua no IPR
CATEGORIA SUGERIDA: Recrutamento
RESUMO: COM-002 trata cidade como requisito ("é necessário... morar em uma destas cidades"), mas `calcularIpr` só dá 10 dos 100 pontos possíveis por cidade atendida — nunca bloqueia a aprovação sozinha.
EVIDÊNCIAS: `docs/knowledge/COM-002-recrutamento.md:16`; `supabase/functions/finalize-candidate/index.ts:81-102`; Supabase real (2026-08-16).
CLASSIFICAÇÃO: `[CONTRADITORIO]` — ver CAP-CON-001.
RUNTIME ATUAL USA? Sim, ambos os lados (o texto que a Sofia pode citar e a regra que decide de verdade) estão ativos simultaneamente.
FONTE_EXECUTAVEL: ver bloco "cidade atendida" na seção 3.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Não — depende da seção 6/15.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: ver pergunta 4 da seção 15.
OBSERVAÇÕES: —

**CANDIDATO: CAP-KNOW-007**
TEMA: WhatsApp e Instagram — declarados necessários, mas só pontuam
CATEGORIA SUGERIDA: Recrutamento
RESUMO: Mesmo padrão do item anterior: "ter WhatsApp e Instagram" está na lista de requisitos declarados (COM-002), mas cada um vale só 10 pontos no IPR (de um total de 100, com aprovação em 80) — uma candidata pode ser aprovada sem ter WhatsApp nem Instagram (trabalha 50 + experiência 20 + cidade 10 = 80, exatamente o limiar).
EVIDÊNCIAS: `docs/knowledge/COM-002-recrutamento.md:17`; `supabase/functions/finalize-candidate/index.ts:93-98`.
CLASSIFICAÇÃO: `[CONTRADITORIO]` — ver CAP-CON-003.
RUNTIME ATUAL USA? Sim.
FONTE_EXECUTAVEL: ver bloco IPR na seção 3.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Não ainda.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: ver pergunta 7 da seção 15.
OBSERVAÇÕES: Vale notar que, operacionalmente, WhatsApp é quase sempre necessário na prática (é o canal usado pela Ficha de Aprovação e pelas notificações automáticas) — mesmo que a regra do IPR não o exija.

**CANDIDATO: CAP-KNOW-008**
TEMA: Idade mínima (21 anos) e critério de gênero — nunca verificados pelo sistema
CATEGORIA SUGERIDA: Recrutamento
RESUMO: COM-002 declara "mulher, acima de 21 anos" como requisito. O campo `idade` é coletado no roteiro, mas nunca entra em `calcularIpr`/`decidirStatus`/`classificarPerfil` — não existe nenhuma verificação de idade mínima em nenhum ponto do código. Gênero nunca é perguntado nem validado em lugar nenhum.
EVIDÊNCIAS: `apps/landing/src/data/sofia-script.ts:106-112` (campo `idade`, sem uso em regra); `supabase/functions/finalize-candidate/index.ts:88-132` (função completa do IPR, sem referência a `idade` nem a gênero).
CLASSIFICAÇÃO: `[CONTRADITORIO]` — ver CAP-CON-002.
RUNTIME ATUAL USA? Idade é coletada e armazenada, mas não usada para decidir nada. Gênero nunca é coletado.
FONTE_EXECUTAVEL: ver bloco IPR na seção 3 (idade está ausente dele, deliberadamente destacado aqui).
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Não — é um ponto sensível (idade/gênero como critério de acesso a oportunidade econômica; o próprio COM-002 já registrou preocupação equivalente ao remover o critério de "filhos/estado civil" por risco de discriminação).
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim — ALTO RISCO/sensível.
PERGUNTA PARA O DONO: ver pergunta 6 da seção 15.
OBSERVAÇÕES: —

**CANDIDATO: CAP-KNOW-009**
TEMA: Texto oficial de reprovação por não estar trabalhando
CATEGORIA SUGERIDA: Recrutamento
RESUMO: Quando `trabalha = false`, a Sofia envia um texto fixo, verbatim, definido pelo Antonio: "No momento, um dos requisitos para ser revendedora é estar trabalhando (empresa, escola, hospital) ou atuar como cabeleireira em salão de beleza. Por esse motivo, não conseguimos seguir com sua candidatura agora — mas você pode se candidatar novamente assim que essa situação mudar."
EVIDÊNCIAS: `apps/landing/src/data/sofia-script.ts:23-31` (`SOFIA_REJECTION_LINES`, comentário cita origem em `docs/knowledge/COM-002-recrutamento.md` v1.1).
CLASSIFICAÇÃO: `[CONFIRMADO-EXECUTAVEL]` + `[PROMPT-HARDCODED]` (texto fixo, nunca gerado por IA).
RUNTIME ATUAL USA? Sim, sempre que `trabalha = false` — é 100% determinístico, nunca parafraseado.
FONTE_EXECUTAVEL: `apps/landing/src/hooks/useSofiaFlow.ts:294-303` (dispara este texto e depois chama `finalize-candidate`, que grava `status = reprovada`).
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim — já é texto aprovado pelo dono (Antonio) e em uso real.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Não para o texto em si (já aprovado); sim para o prazo/processo de "recandidatura" que ele promete (ver "O que a Sofia não sabe", seção 10).
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: O COM-002 v1.1 registrava esta mensagem como "pendência de revisão" — a nota do `seedDocuments.ts` (2026-08-02) afirma que a pendência foi resolvida e o texto vive em `sofia-script.ts`. Isso é uma correção documentada em cascata, não uma contradição ativa.

**CANDIDATO: CAP-KNOW-010**
TEMA: Processo de candidatura ponta a ponta (Sofia → IPR → Ficha → aprovação final da Tania)
CATEGORIA SUGERIDA: Recrutamento
RESUMO: O processo real tem 3 etapas: (1) conversa com a Sofia + decisão automática do IPR (aprovada/em análise/reprovada); (2) se aprovada, candidata recebe link da "Ficha de Aprovação" (2ª etapa, dados complementares); (3) depois da Ficha preenchida, a decisão **final** de liberar o Mostruário é manual da Tania (pelo Admin ou respondendo "sim"/"não" no WhatsApp).
EVIDÊNCIAS: `supabase/functions/finalize-candidate/index.ts:376-420` (geração automática da Ficha ao aprovar); `supabase/functions/submit-ficha/index.ts:220-295` (avanço de etapa + notificação à Tania); `apps/admin/src/components/leads/TaniaAprovacaoSection.tsx:56-134` (botões "Tania aprovou"/"Tania recusou"); `apps/landing/src/data/sofia-script.ts:36-41` (`SOFIA_APPROVED_LINES`, avisa só "pré-aprovada"); `DIAGNOSTICO-CAPTURA-LEADS-CEREBRO-TANIA.md:292-311` (seção 9.4/9.6, corrobora e acrescenta o caminho por WhatsApp).
CLASSIFICAÇÃO: `[CONFIRMADO-EXECUTAVEL]` + `[CONFIRMADO-MULTIFONTE]`.
RUNTIME ATUAL USA? Sim, e todas as automações de WhatsApp envolvidas estão com flag **ligada** em produção hoje (confirmado no Supabase real, 2026-08-16: `whatsapp_ficha_automatica_ativa`, `whatsapp_notificacao_tania_ativa`, `whatsapp_aprovacao_automatica_ativa` = todas `true`).
FONTE_EXECUTAVEL: ver referências acima.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim, em linhas gerais — mas a Sofia hoje não explica esse processo completo à candidata (só diz "pré-aprovada", nunca menciona que existe uma decisão manual final da Tania).
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim, quanto a até onde detalhar isso pra candidata.
PERGUNTA PARA O DONO: A Sofia deveria explicar, já na etapa 1, que a aprovação automática é "pré-aprovação" e que ainda existe uma etapa (Ficha) e uma decisão manual sua antes do Mostruário ser liberado de verdade?
OBSERVAÇÕES: Existe também um caminho **não documentado em nenhum lugar oficial** (nem `docs/`, nem `settings`, nem Admin): um webhook (`apps/admin/api/webhooks/whatsapp.mjs`, fora do Supabase, achado e confirmado pelo diagnóstico irmão) aplica a decisão da Tania automaticamente se ela responder "sim"/"não" pelo WhatsApp para exatamente 1 lead pendente — sem flag, sem tela no Admin, silenciosamente ignorado se houver 0 ou 2+ pendentes. Ver CAP-KNOW-027.

**CANDIDATO: CAP-KNOW-011**
TEMA: O que é a Ficha de Aprovação e o que ela pede
CATEGORIA SUGERIDA: Recrutamento
RESUMO: Formulário público (`/ficha/:token`, link único, uso único) preenchido depois da pré-aprovação, pedindo: endereço completo, nome do pai e da mãe, se trabalha atualmente (endereço/telefone do trabalho, se sim), se tem cônjuge (nome/telefone/se trabalha, endereço/telefone do trabalho do cônjuge se sim), 3 referências pessoais (nome+telefone cada) e 1 referência comercial (o que vende, nome, telefone).
EVIDÊNCIAS: `supabase/functions/submit-ficha/index.ts:72-89` (`REQUIRED_STRING_FIELDS`) e `124-164` (lógica condicional de trabalho/cônjuge); `supabase/functions/get-ficha/index.ts` (fluxo de acesso via token).
CLASSIFICAÇÃO: `[CONFIRMADO-EXECUTAVEL]`.
RUNTIME ATUAL USA? Sim, sempre que uma candidata é aprovada.
FONTE_EXECUTAVEL: `supabase/functions/submit-ficha/index.ts:98-218`.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim, como descrição do processo — mas hoje a Sofia nunca antecipa esses campos pra candidata (ela só sabe "vai receber um link", ver CAP-KNOW-010).
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim, quanto à conveniência de a Sofia adiantar o que a Ficha vai pedir.
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: A quantidade de dados pedidos (pais, cônjuge, 3 referências pessoais + 1 comercial) é bem mais extensa que qualquer coisa mencionada na Landing ou no roteiro da Sofia — pode surpreender/gerar fricção se a candidata não for avisada antes.

**CANDIDATO: CAP-KNOW-012**
TEMA: Quem decide de verdade se libera o Mostruário
CATEGORIA SUGERIDA: Recrutamento
RESUMO: A aprovação do IPR (feita pela Sofia/sistema) é uma "pré-aprovação". A decisão final e humana de liberar o Mostruário é sempre da Tania, manualmente — seja clicando "Tania aprovou"/"Tania recusou" no Admin, seja respondendo "sim"/"não" no WhatsApp (caminho automático, ver CAP-KNOW-027).
EVIDÊNCIAS: `apps/admin/src/components/leads/TaniaAprovacaoSection.tsx:78-88`; `packages/shared/src/constants.ts:28-34` (`ativa`/`desistiu` como etapas finais do pipeline).
CLASSIFICAÇÃO: `[CONFIRMADO-EXECUTAVEL]`.
RUNTIME ATUAL USA? Sim.
FONTE_EXECUTAVEL: `apps/admin/src/components/leads/TaniaAprovacaoSection.tsx:78-88`.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Não quanto ao fato; sim quanto a se a Sofia deveria comunicar isso à candidata.
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: —

**CANDIDATO: CAP-KNOW-013**
TEMA: Estabilidade profissional (pergunta nova) — hoje só informativa
CATEGORIA SUGERIDA: Recrutamento
RESUMO: Desde a implementação parcial de QUALIFICACAO-002, o roteiro pergunta "Sua rotina de trabalho hoje é mais fixa, ou mais variável?" (3 opções: Fixa / Variável mas recorrente / Esporádica). A resposta é persistida (`estabilidade_profissional`, ALTA/MEDIA/BAIXA), mas está **explicitamente proibida** de entrar no cálculo do IPR — é só um dado consultivo pra equipe humana.
EVIDÊNCIAS: `apps/landing/src/data/sofia-script.ts:146-160`; `supabase/functions/finalize-candidate/index.ts:134-154,289-292` (comentário "PROIBIDO participar de calcularIpr/decidirStatus/classificarPerfil"); `docs/qualificacao/QUALIFICACAO-002-estabilidade-trabalho.md` (documento de design original, que recomendava formalmente o "Modelo C" — estabilidade como critério adicional de pontuação).
CLASSIFICAÇÃO: `[CONFIRMADO-EXECUTAVEL]` (a coleta) + o desenho original (`[DOCUMENTADO]`) diverge da implementação real — ver observações.
RUNTIME ATUAL USA? Sim, a pergunta está ativa e o dado é salvo; não influencia aprovação.
FONTE_EXECUTAVEL: `supabase/functions/finalize-candidate/index.ts:143-154`.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim, como fato ("a rotina de trabalho não afeta a aprovação hoje").
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: ver pergunta 16 da seção 15.
OBSERVAÇÕES: QUALIFICACAO-002 recomendou explicitamente o "Modelo C" (estabilidade como critério adicional de pontuação, com o "trabalha" continuando eliminatório do jeito que está). O que foi implementado foi só a coleta da pergunta ("Parte 1"), mantendo o comportamento do "Modelo A" (puramente informativo). Não é uma contradição entre fontes — é a recomendação de um documento de design que ainda não foi totalmente adotada na prática, o que é útil registrar como decisão pendente.

**CANDIDATO: CAP-KNOW-014**
TEMA: Profissões-sinal positivo usadas internamente pela IA consultiva
CATEGORIA SUGERIDA: Recrutamento
RESUMO: Existe uma lista fixa de profissões ("Cabeleireira", "Professora", "Enfermeira", "Bancária") tratada como "sinal positivo" pela análise consultiva de IA (nunca pela candidata, nunca pelo IPR) — a IA é instruída a reconhecer profissões semelhantes/mesmo tipo (atendimento ao público), não só a lista literal.
EVIDÊNCIAS: `supabase/functions/finalize-candidate/index.ts:20-23` (`PROFISSOES_PREFERIDAS`); `supabase/functions/_shared/ai-analysis.ts:199-220` (system prompt que usa essa lista como contexto de raciocínio).
CLASSIFICAÇÃO: `[PROMPT-HARDCODED]` + `[CONFIRMADO-EXECUTAVEL]`.
RUNTIME ATUAL USA? Sim, sempre que `sofia_ia_ativa=true` (confirmado ligado) e a candidata `trabalha=true`.
FONTE_EXECUTAVEL: `supabase/functions/finalize-candidate/index.ts:20-23,265-268`.
CONFIANÇA: Alta que existe e roda; baixa quanto a ser a lista "certa" hoje.
PODE VIRAR CONHECIMENTO OFICIAL? Não como está — é uma regra interna, nunca deveria virar algo que a Sofia diz à candidata (ela nunca vê essa lista, e não deveria).
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: ver pergunta 15 da seção 15.
OBSERVAÇÕES: Esta lista é semelhante, mas não idêntica, aos critérios de elegibilidade declarados em COM-002 (empresa/escola/hospital/cabeleireira) — ver seção 5 (duplicação).

---

### 4.3 Consignação

**CANDIDATO: CAP-KNOW-015**
TEMA: Como funciona o ciclo de consignação
CATEGORIA SUGERIDA: Consignação
RESUMO: A revendedora recebe um mostruário sem pagar nada adiantado, tem 30 dias para vender. No fim dos 30 dias faz o "acerto": paga só as peças vendidas (comissão já descontada), devolve as não vendidas, recebe um novo mostruário e o ciclo recomeça.
EVIDÊNCIAS: `docs/knowledge/COM-001-comissao-consignacao-garantia.md:9-21`; `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:38-51` (`com-001-consignacao`, texto idêntico em substância); reforçado de forma vaga na Landing: `apps/landing/src/components/sections/FAQ.tsx:16-18` ("Não precisa comprar estoque antecipado"), `Hero.tsx:25` ("Sem investimento inicial").
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]`.
RUNTIME ATUAL USA? Sim — é um dos 8 documentos usados pela Sofia via IA (`sofia_perguntas_ia_ativa=true`).
FONTE_EXECUTAVEL: nenhuma (é conhecimento puro, não regra de sistema).
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Só para reconfirmar que os "30 dias" ainda são válidos (documento é v1.0, sem revisão desde então).
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: —

---

### 4.4 Comissão

**CANDIDATO: CAP-KNOW-016**
TEMA: Tabela de comissão por faixa de valor vendido
CATEGORIA SUGERIDA: Comissão
RESUMO: Comissão varia de 30% a 40% conforme o valor total vendido no acerto: até R$299,00 → 30%; de R$299,00 a R$399,00 → 35%; a partir de R$400,00 → 40%.
EVIDÊNCIAS: `docs/knowledge/COM-001-comissao-consignacao-garantia.md:25-40`; `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:52-66` (`com-001-comissao`, tabela idêntica).
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]`.
RUNTIME ATUAL USA? Sim, via IA (FEATURE-004 ligada).
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Alta quanto a existir e estar em uso; documento é v1.0 sem revisão registrada.
PODE VIRAR CONHECIMENTO OFICIAL? Sim.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim — reconfirmar valores (ver pergunta 1/20 da seção 15).
PERGUNTA PARA O DONO: ver perguntas 1 e 20 da seção 15.
OBSERVAÇÕES: —

**CANDIDATO: CAP-KNOW-017**
TEMA: "Até 40% de comissão" — versão simplificada da Landing
CATEGORIA SUGERIDA: Comissão
RESUMO: A Landing (Hero, QuemSomos) cita só o número máximo da faixa ("Ganhe até 40% de comissão!"), sem explicar a estrutura de faixas por valor vendido.
EVIDÊNCIAS: `apps/landing/src/components/sections/Hero.tsx:22`; `apps/landing/src/components/sections/QuemSomos.tsx:29`.
CLASSIFICAÇÃO: `[CONFIGURADO]` (copy de marketing) — semelhante, mas simplificado, em relação a CAP-KNOW-016.
RUNTIME ATUAL USA? Sim, sempre (visível a qualquer visitante, antes mesmo de abrir a Sofia).
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Alta quanto ao texto estar correto tecnicamente (40% é de fato o teto), mas incompleto.
PODE VIRAR CONHECIMENTO OFICIAL? Sim, como está — mas ver seção 5 (duplicação "semelhante, não idêntico").
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Não é urgente — não contradiz, só simplifica.
PERGUNTA PARA O DONO: ver pergunta 2 da seção 15.
OBSERVAÇÕES: —

---

### 4.5 Produtos / Garantia

**CANDIDATO: CAP-KNOW-018**
TEMA: Garantia das peças
CATEGORIA SUGERIDA: Garantia
RESUMO: Anéis têm garantia de 3 meses; demais peças (colares, brincos, pulseiras etc.) têm garantia de até 6 meses.
EVIDÊNCIAS: `docs/knowledge/COM-001-comissao-consignacao-garantia.md:44-53`; `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:67-81` (`com-001-garantia`).
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]`.
RUNTIME ATUAL USA? Sim, via IA (FEATURE-004).
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Alta quanto a existir; documento v1.0, sem revisão registrada.
PODE VIRAR CONHECIMENTO OFICIAL? Sim.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim, reconfirmar (ver pergunta 20).
PERGUNTA PARA O DONO: ver pergunta 20 da seção 15.
OBSERVAÇÕES: Este tema não aparece em nenhum lugar da Landing (nem FAQ) — só existe se a candidata perguntar diretamente à Sofia.

**CANDIDATO: CAP-KNOW-019**
TEMA: O que NÃO é coberto pela garantia
CATEGORIA SUGERIDA: Garantia
RESUMO: Quebra por mau uso e oxidação por mau uso não são cobertas pela garantia.
EVIDÊNCIAS: `docs/knowledge/COM-003-troca-defeito.md:20-29`; `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:127-140` (`com-003-nao-coberto-garantia`).
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]`.
RUNTIME ATUAL USA? Sim, via IA.
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Não, salvo mudança de política.
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: "Mau uso" e "oxidação por mau uso" não são definidos com mais detalhe em nenhum documento — pode gerar disputa subjetiva ("isso foi mau uso ou defeito de fábrica?"), sem critério objetivo registrado.

**CANDIDATO: CAP-KNOW-020**
TEMA: Troca por defeito — grátis na 1ª, cobra frete a partir da 2ª
CATEGORIA SUGERIDA: Garantia
RESUMO: A revendedora devolve a peça com defeito diretamente para a Tania Joias. Na primeira troca não há cobrança de frete. A partir da segunda troca (mesma revendedora), passa a haver cobrança de frete/envio.
EVIDÊNCIAS: `docs/knowledge/COM-003-troca-defeito.md:9-17` (regra original, com pendência "não ficou claro se a partir da segunda cobra"); `docs/knowledge/COM-004-primeiro-mostruario.md:27-30` (correção formal: "a partir da segunda troca por defeito, passa a haver cobrança de frete"); `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:113-126` (`com-003-troca-defeito`, versão 2, já incorpora a correção).
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]` (a versão final, pós-correção).
RUNTIME ATUAL USA? Sim, via IA — a versão v2 (já corrigida) é a que está em `seedDocuments.ts`.
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Alta na versão corrigida.
PODE VIRAR CONHECIMENTO OFICIAL? Sim.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Não seria urgente, mas o valor exato do frete cobrado a partir da 2ª troca nunca é especificado em nenhum lugar.
PERGUNTA PARA O DONO: ver pergunta 11 da seção 15.
OBSERVAÇÕES: O arquivo `COM-003-troca-defeito.md` original ainda traz a nota "pendência de revisão" no rodapé, mesmo depois de o `COM-004` ter resolvido isso — é uma inconsistência leve de manutenção documental (o `.md` de origem não foi atualizado, só o compilado em `seedDocuments.ts`), risco baixo.

---

### 4.6 Primeiro mostruário

**CANDIDATO: CAP-KNOW-021**
TEMA: Como funciona o primeiro mostruário
CATEGORIA SUGERIDA: Primeiro Mostruário
RESUMO: Sem depósito ou caução. Chega em 1 a 3 dias após o cadastro aprovado. Composição: brincos, anéis, correntes, pulseiras e pingentes, em acabamentos banhados a ouro 18k, aço inoxidável banhado a ouro, e banhados a prata. Retirada pessoal ou entrega por motoboy — na primeira entrega, o custo do motoboy é da Tania Joias.
EVIDÊNCIAS: `docs/knowledge/COM-004-primeiro-mostruario.md:9-23`; `apps/landing/src/orchestrator/knowledge/seedDocuments.ts:142-155` (`com-004-primeiro-mostruario`).
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]`.
RUNTIME ATUAL USA? Sim, via IA.
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Só reconfirmar (documento v1.0, sem revisão desde a criação).
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: A Landing menciona "Mostruário" e "materiais de divulgação" (`ComoFunciona.tsx`) e "acesso ao Mostruário completo" (`FAQ.tsx`), mas nunca com este nível de detalhe — só a Sofia (via IA) tem esse conteúdo, e só se perguntada.

---

### 4.7 Ganhos

**CANDIDATO: CAP-KNOW-022**
TEMA: Faixas de ganho ilustrativas em R$ por dedicação diária
CATEGORIA SUGERIDA: Ganhos
RESUMO: A Landing apresenta 3 faixas de ganho concretas em Reais, associadas a horas dedicadas por dia: "Começando" (1h/dia, R$300–600/mês), "Consistente" (2-3h/dia, R$800–1.800/mês, destacada como "Mais comum"), "Dedicada" (4h+/dia, R$2.000+/mês). Ressalva no rodapé da seção: "Valores ilustrativos... Não é garantia de ganhos."
EVIDÊNCIAS: `apps/landing/src/components/sections/QuantoPossoGanhar.tsx:5-25,69-75`.
CLASSIFICAÇÃO: `[CONFIGURADO]` (copy de marketing, nunca revisado como documento de conhecimento).
RUNTIME ATUAL USA? Sim, sempre — visível a qualquer visitante da Landing.
FONTE_EXECUTAVEL: nenhuma — são números fixos no componente React, sem nenhum cálculo por trás (não derivam da tabela de comissão nem de dado real de vendas conhecido por este inventário).
CONFIANÇA: Baixa quanto à origem/lastro dos números — não há nenhuma fonte, documento ou cálculo encontrado que explique de onde vêm R$300–600/R$800–1.800/R$2.000+.
PODE VIRAR CONHECIMENTO OFICIAL? Não ainda — **ALTO RISCO**, ver seção 11 e CAP-CON-005.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim, urgente.
PERGUNTA PARA O DONO: ver pergunta 3 da seção 15.
OBSERVAÇÕES: Isso é diferente de "conhecimento comercial" simples — é uma promessa numérica pública, na contramão explícita do PLAYBOOK-001 ("Você nunca promete: ... ganhos garantidos... resultados garantidos") — só que a promessa está na Landing, antes de a candidata sequer falar com a Sofia.

---

### 4.8 Treinamento (lacuna)

**CANDIDATO: CAP-KNOW-023**
TEMA: "Treinamento completo" — claim recorrente sem conteúdo formal
CATEGORIA SUGERIDA: Empresa / Objeções
RESUMO: A Landing menciona "treinamento" pelo menos 4 vezes (QuemSomos, ComoFunciona, FAQ, um depoimento), sempre como diferencial forte ("Mesmo sem experiência você aprende tudo", "Damos treinamento completo"), mas nenhum documento oficial (`COM-001` a `COM-004`) descreve o que é esse treinamento — formato, duração, conteúdo, obrigatoriedade ou custo.
EVIDÊNCIAS: `apps/landing/src/components/sections/QuemSomos.tsx:18-19`; `apps/landing/src/components/sections/ComoFunciona.tsx:20-22` ("Treinamento e Mostruário... tabela de preços e conteúdo pronto"); `apps/landing/src/components/sections/FAQ.tsx:21-23`; `apps/landing/src/components/sections/Depoimentos.tsx:15` (depoimento da "Sonia Aguiar": "O treinamento me deu segurança pra começar"); ausência confirmada em `docs/knowledge/COM-001..004*.md` e em `apps/landing/src/orchestrator/knowledge/seedDocuments.ts` (nenhum dos 8 documentos menciona a palavra "treinamento").
CLASSIFICAÇÃO: `[CONTRADITORIO]`/lacuna — ver CAP-CON-010 e seção 10.
RUNTIME ATUAL USA? A Landing sim (sempre); a Sofia (IA), se perguntada sobre treinamento, não encontra nenhum documento em `KnowledgeEngine.searchByQuestion` e cai no fallback seguro ("Prefiro não passar uma informação imprecisa neste momento.") — nunca inventa, mas também nunca responde de forma útil.
FONTE_EXECUTAVEL: `apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts:66-74` (comportamento de fallback quando zero documentos são encontrados).
CONFIANÇA: Alta que a lacuna existe.
PODE VIRAR CONHECIMENTO OFICIAL? Não ainda — precisa ser escrito do zero.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: ver pergunta 9 da seção 15.
OBSERVAÇÕES: Mesmo padrão de lacuna para "tabela de preços dos produtos", também citada em `ComoFunciona.tsx:22` e nunca documentada.

---

### 4.9 FAQ

**CANDIDATO: CAP-KNOW-024**
TEMA: As 6 perguntas frequentes publicadas na Landing
CATEGORIA SUGERIDA: FAQ
RESUMO: A seção FAQ da Landing responde: (1) precisa estar empregada? (prioridade, não bloqueio absoluto na redação, mas na prática hoje é eliminatório — ver CAP-KNOW-005); (2) precisa investir algo? (não); (3) precisa ter experiência com vendas? (não, treinamento completo); (4) quanto tempo por dia? (a candidata decide, 1-2h comum); (5) como recebe o Mostruário? (após aprovação, "equipe libera acesso"); (6) quanto tempo até resposta? ("poucos dias úteis").
EVIDÊNCIAS: `apps/landing/src/components/sections/FAQ.tsx:9-40`.
CLASSIFICAÇÃO: `[CONFIGURADO]` (copy estático da Landing, nunca passou por `docs/knowledge`).
RUNTIME ATUAL USA? Sim, sempre — visível antes mesmo de abrir a Sofia.
FONTE_EXECUTAVEL: nenhuma.
CONFIANÇA: Média — item (1) usa linguagem mais suave ("priorizamos") que a regra real (eliminatória); os outros itens não contradizem nada encontrado, mas também não têm lastro documental formal (ex.: "poucos dias úteis" para resposta não é confirmado em nenhuma regra de SLA).
PODE VIRAR CONHECIMENTO OFICIAL? Parcialmente — cada item precisaria ser confrontado individualmente com a regra real antes.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim.
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: O item (1) da FAQ ("Hoje priorizamos candidatas que já estejam trabalhando... Se não for o seu caso, seu cadastro fica salvo") é uma redação mais branda que a realidade (é eliminatório, sem exceção, na regra real) — ver CAP-CON-001-adjacente.

---

### 4.10 Objeções e tom de atendimento

**CANDIDATO: CAP-KNOW-025**
TEMA: Como a Sofia trata dúvidas, objeções e small talk (sem responder com IA de negócio)
CATEGORIA SUGERIDA: Objeções / Atendimento
RESUMO: Existe uma camada de classificação (sempre ativa, sem flag) que decide, para cada mensagem de texto livre, se ela é DOUBT, OBJECTION, SMALL_TALK, QUESTION, END_CONVERSATION ou AMBIGUOUS. Cada tipo tem uma resposta curta e fixa antes de retomar a pergunta atual — nunca grava a mensagem como resposta, nunca a interpreta como aceite. Exemplos: dúvida → explicação curta específica do campo (ex.: sobre "idade": "Sua idade em anos — só o número."); objeção → "Entendo a sua preocupação. Vamos continuar com calma..."; pergunta de negócio (quando a flag de IA está desligada) → "Essa é uma boa pergunta. Prefiro não responder algo que possa estar desatualizado neste momento."
EVIDÊNCIAS: `apps/landing/src/orchestrator/classifyForFeature004.ts:229-268` (`DOUBT_EXPLANATIONS`, `buildNonAnswerMessage`).
CLASSIFICAÇÃO: `[CONFIRMADO-EXECUTAVEL]`.
RUNTIME ATUAL USA? Sim, sempre — é a camada de proteção dos campos, ativa independente de qualquer flag.
FONTE_EXECUTAVEL: `apps/landing/src/orchestrator/classifyForFeature004.ts:207-219,252-268`.
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? É mais comportamento/UX do que "conhecimento de negócio" — mas as objeções específicas mapeadas (medo de não vender, insegurança, "será que...", "complicado", "difícil") são um sinal real de quais objeções o time já antecipou.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Não é prioritário.
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: Este item é majoritariamente plumbing técnico (classificador de intenção) — só a lista de objeções reconhecidas e as explicações por campo têm valor como "conhecimento institucional sobre como tratar a candidata". O classificador em si não deve virar item do Cérebro (ver seção 12).

**CANDIDATO: CAP-KNOW-026**
TEMA: Regras de tom e promessas proibidas (Playbook oficial da Sofia)
CATEGORIA SUGERIDA: Atendimento
RESUMO: A Sofia deve ser educada, natural, empática, profissional, positiva, respeitosa, calma, paciente, organizada, elegante — nunca fria, agressiva, insistente, apática, infantil, irônica ou arrogante. Nunca promete ganhos/sucesso/lucro/aprovação/resultados garantidos. Nunca decide aprovação, reprovação, pontuação, IPR ou regras da empresa. Quando não sabe, nunca inventa — diz que não tem a informação ou consulta o conhecimento oficial. Respostas: 60-120 palavras, no máximo 3 parágrafos, no máximo 1 pergunta por resposta.
EVIDÊNCIAS: `docs/playbooks/PLAYBOOK-001-sofia.md` (documento inteiro, esp. linhas 44-51, 104-121, 145-181); `supabase/functions/_shared/agent-prompts.ts:73-136` (`SOFIA_PLAYBOOK`, versão derivada usada no system prompt real).
CLASSIFICAÇÃO: `[CONFIRMADO-MULTIFONTE]` + `[PROMPT-HARDCODED]`.
RUNTIME ATUAL USA? Sim, sempre que a IA responde (FEATURE-004 e reações contextuais, ambas com flag ligada hoje).
FONTE_EXECUTAVEL: `supabase/functions/_shared/agent-prompts.ts:154-178` (`buildSystemPrompt`).
CONFIANÇA: Alta.
PODE VIRAR CONHECIMENTO OFICIAL? Sim — é comportamento institucional já formalizado e aprovado.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Não, salvo mudança de posicionamento.
PERGUNTA PARA O DONO: —
OBSERVAÇÕES: Este item é o mais forte candidato a "conhecimento institucional sobre tom" pedido na seção 4 do escopo — mas note a CAP-CON-005: a regra "nunca promete ganhos" vale só para a Sofia (IA), não para a Landing estática, que já promete números concretos antes da conversa começar.

**CANDIDATO: CAP-KNOW-027**
TEMA: Decisão automática da Tania por "sim"/"não" no WhatsApp — regra de aprovação não documentada
CATEGORIA SUGERIDA: Recrutamento / Atendimento
RESUMO: Existe um webhook (fora do Supabase, em `apps/admin/api/webhooks/whatsapp.mjs`, Vercel) que, ao receber uma mensagem do número da Tania reconhecida como "sim" ou "não" (com variações), aplica essa decisão diretamente a um lead em `aguardando_tania` — mas só se houver **exatamente 1** lead pendente nesse estado; se houver 0 ou 2+, ignora silenciosamente, sem avisar ninguém. Não tem flag em `settings`, não aparece em nenhuma tela do Admin.
EVIDÊNCIAS: `DIAGNOSTICO-CAPTURA-LEADS-CEREBRO-TANIA.md:309-311` (achado documentado no diagnóstico técnico irmão, com caminho de arquivo e descrição da lógica `processarDecisaoTania()`). Este inventário não releu o arquivo `.mjs` diretamente — a evidência aqui é uma fonte secundária (o diagnóstico irmão), não primária.
CLASSIFICAÇÃO: `[LEGADO/POSSIVELMENTE-OBSOLETO]` quanto a estar documentado — na prática, se real, é `[CONFIRMADO-EXECUTAVEL]`, mas este inventário não confirmou por leitura direta.
RUNTIME ATUAL USA? Possivelmente sim, sempre que o webhook estiver publicado e as credenciais WhatsApp configuradas — não verificado diretamente aqui.
FONTE_EXECUTAVEL: referência indireta apenas — recomenda-se releitura direta de `apps/admin/api/webhooks/whatsapp.mjs` antes de tratar isso como fato consolidado.
CONFIANÇA: Média (fonte secundária, mesmo repositório, mesma data-base, mas não relida por este inventário).
PODE VIRAR CONHECIMENTO OFICIAL? Não — é um comportamento de sistema de risco operacional (falha silenciosa em ambiguidade), não conhecimento de negócio para a Sofia comunicar a candidatas.
PRECISA CONFIRMAÇÃO DE CARLOS/TANIA? Sim, urgente — risco operacional (ela pode achar que decidiu e nada mudou).
PERGUNTA PARA O DONO: Você sabe que responder "sim" ou "não" no seu WhatsApp pode aprovar/recusar uma candidata automaticamente, sem nenhuma confirmação visual? Isso foi uma decisão consciente?
OBSERVAÇÕES: Incluído aqui por ser diretamente relevante a "regras de aprovação" e "relacionamento com candidatas", mesmo fora do escopo original das fontes obrigatórias listadas no pedido — sinalizado com confiança reduzida por não ter sido relido neste levantamento.

---

## 5. Matriz de duplicação

| Assunto | Markdown (`docs/knowledge`) | seedDocuments.ts | Prompt (agent-prompts/ai-analysis) | Config (`settings`) | Landing (copy) | Runtime (regra real) |
|---|---|---|---|---|---|---|
| Comissão (30/35/40%) | X | X (idêntico) | — (injetado dinamicamente via `knowledgeDocuments`, nunca hardcoded no prompt) | — | X (simplificado, só "até 40%") | — (não é regra de sistema, é texto) |
| Consignação (30 dias) | X | X (idêntico) | — | — | X (versão vaga: "sem investimento inicial") | — |
| Garantia (3m/6m) | X | X (idêntico) | — | — | — (ausente) | — |
| Exclusão de garantia | X | X (idêntico) | — | — | — (ausente) | — |
| Troca por defeito | X (2 documentos, com correção em cascata) | X (v2, já corrigida) | — | — | — (ausente) | — |
| Primeiro mostruário | X | X (idêntico) | — | — | X (vago: "Mostruário", "materiais") | — |
| Elegibilidade (cidade/idade/whatsapp/instagram/trabalho) | X | X (idêntico ao md) | X (`ai-analysis.ts`, só a lista de cidades, como contexto) | X (`cidades_atendidas`, só a lista de cidades) | — (ausente, exceto contradição do Footer) | X (`calcularIpr`, mas só trabalha é eliminatório — **divergente**) |
| Profissões-alvo | X (COM-002: empresa/escola/hospital/cabeleireira) | X (mesmo texto do md) | X (`PROFISSOES_PREFERIDAS`: Cabeleireira/Professora/Enfermeira/Bancária — **semelhante, não idêntico**) | — | — | X (`ai-analysis.ts`, contexto consultivo, não elegibilidade) |
| Critério de reprovação | X (COM-002, "uso interno") | — (deliberadamente fora do KnowledgeEngine) | — | — | X (FAQ, redação mais branda) | X (`SOFIA_REJECTION_LINES`, texto oficial verbatim) |
| Ganhos/comissão em R$ | — | — | — | — | X (`QuantoPossoGanhar.tsx`, único lugar) | — (sem cálculo formal por trás) |
| Treinamento | — (ausente) | — (ausente) | — | — | X (4 menções) | — |
| Tom/postura da Sofia | X (`PLAYBOOK-001`) | — (não é knowledge document, é comportamento) | X (`SOFIA_PLAYBOOK` em `agent-prompts.ts`, derivado manualmente) | — | — | X (`ResponsePolicies`/`ResponseComposer`, valida antes de exibir) |
| Estabilidade profissional | X (`QUALIFICACAO-002`, design) | — | — | — | — | X (coleta ativa, mas proibida de pontuar) |
| Área de atuação | X (5 cidades) | X (5 cidades) | — | X (5 cidades, confirmado ao vivo) | X (Footer: "todo o Brasil" — **divergente**) | X (só pontua, não bloqueia) |

**Legenda de avaliação por célula, quando presente em 2+ fontes:**
- Comissão, Consignação, Garantia, Exclusão de garantia, Troca por defeito, Primeiro mostruário, Elegibilidade (texto), Cidades (lista): **idêntico** entre `docs/knowledge` e `seedDocuments.ts` (o segundo é a compilação em prosa do primeiro, sem alteração de conteúdo).
- Profissões-alvo (COM-002 x `PROFISSOES_PREFERIDAS`): **semelhante** (sobreposição parcial: professora↔escola, enfermeira↔hospital, cabeleireira↔cabeleireira; "bancária" não tem par explícito em COM-002; "empresa" de COM-002 não tem par de profissão específica em `PROFISSOES_PREFERIDAS`).
- Área de atuação (lista de cidades x Footer "todo o Brasil"): **divergente**.
- Elegibilidade declarada x regra executável do IPR: **divergente** (ver seção 6).
- Comissão tabelada x "até 40%" da Landing: **semelhante** (subconjunto correto, mas incompleto).
- Ganhos em R$ (Landing) x comissão em % (COM-001): **sem fonte comum** — nunca foram formalmente cruzados nem no código nem em documento algum.

---

## 6. Contradições encontradas

```text
CONTRADIÇÃO CAP-CON-001
ASSUNTO: Cidade atendida como requisito de elegibilidade
FONTE A: docs/knowledge/COM-002-recrutamento.md:14-19
DIZ: "Para se tornar revendedora... é necessário... morar em uma destas
cidades: Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo ou São
Caetano do Sul" — apresentado como requisito obrigatório, no mesmo nível de
"estar trabalhando".
FONTE B: supabase/functions/finalize-candidate/index.ts:81-102 (calcularIpr)
+ Supabase real (settings.ipr_pesos, 2026-08-16)
DIZ: cidade atendida vale só 10 dos 100 pontos do IPR. Uma candidata fora
das 5 cidades pode ser aprovada normalmente (ex.: trabalha 50 + experiência
20 + WhatsApp 10 + Instagram 10 = 90 >= 80, sem nenhum ponto de cidade).
O QUE O RUNTIME REAL USA HOJE:
A regra do IPR (Fonte B) — cidade nunca bloqueia sozinha. Só "trabalha =
false" reprova automaticamente.
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
Cidade fora da lista deveria continuar podendo ser aprovada (como acontece
hoje), ou isso é um comportamento que precisa virar bloqueio automático?
```

```text
CONTRADIÇÃO CAP-CON-002
ASSUNTO: Idade mínima (21 anos) e critério de gênero ("mulher")
FONTE A: docs/knowledge/COM-002-recrutamento.md:14-15
DIZ: requisito declarado de "ser mulher, acima de 21 anos".
FONTE B: supabase/functions/finalize-candidate/index.ts (função inteira do
IPR, sem qualquer referência a idade/gênero) + apps/landing/src/data/sofia-
script.ts:106-112 (campo idade coletado, sem uso em regra)
DIZ: nem idade nem gênero são verificados em nenhum ponto do sistema.
O QUE O RUNTIME REAL USA HOJE:
Nenhuma verificação de idade ou gênero acontece — o campo idade é só
armazenado.
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
Idade mínima e gênero ainda são exigidos de verdade? Se sim, por que nunca
entraram na regra de aprovação — e vocês querem que entrem agora?
```

```text
CONTRADIÇÃO CAP-CON-003
ASSUNTO: WhatsApp e Instagram como requisitos
FONTE A: docs/knowledge/COM-002-recrutamento.md:17
DIZ: "ter WhatsApp e Instagram" é um requisito para se tornar revendedora.
FONTE B: supabase/functions/finalize-candidate/index.ts:93-98 + Supabase
real (settings.ipr_pesos)
DIZ: cada um vale só 10 pontos de 100 — uma candidata sem WhatsApp nem
Instagram pode ser aprovada (trabalha 50 + experiência 20 + cidade 10 = 80,
exatamente o limiar de aprovação).
O QUE O RUNTIME REAL USA HOJE:
A regra do IPR — WhatsApp/Instagram nunca bloqueiam sozinhos.
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
WhatsApp/Instagram são realmente obrigatórios, ou são só um diferencial que
ajuda a pontuação (como o sistema trata hoje)? Note que, operacionalmente,
o WhatsApp segue sendo necessário depois da aprovação (Ficha, notificações).
```

```text
CONTRADIÇÃO CAP-CON-004
ASSUNTO: Área de atuação declarada ("todo o Brasil"/"ABCD") x real (5 cidades)
FONTE A: apps/landing/src/components/sections/Footer.tsx:11-13
DIZ: "Semijoias premium para revendedoras em todo o Brasil."
FONTE B: docs/knowledge/COM-002-recrutamento.md + settings.cidades_atendidas
(Supabase real, 2026-08-16)
DIZ: atuação restrita a 5 cidades específicas do Grande ABC Paulista.
O QUE O RUNTIME REAL USA HOJE:
O Footer é exibido sempre, sem nenhuma lógica condicional — a frase "todo o
Brasil" nunca é usada pela Sofia (não está em nenhum documento de
conhecimento), mas é a primeira coisa que qualquer visitante lê no rodapé.
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
"Todo o Brasil" é uma ambição futura de expansão, ou é um erro de copy que
deveria dizer "região do ABC Paulista" (ou as 5 cidades específicas)?
```

```text
CONTRADIÇÃO CAP-CON-005
ASSUNTO: Promessa de ganhos — Landing (números concretos) x Playbook da Sofia
(proibição explícita)
FONTE A: apps/landing/src/components/sections/QuantoPossoGanhar.tsx:5-25
DIZ: 3 faixas de ganho em R$ concretos por hora dedicada (R$300-600,
R$800-1.800, R$2.000+), com ressalva pequena de "valores ilustrativos" no
rodapé da seção.
FONTE B: docs/playbooks/PLAYBOOK-001-sofia.md:167-169 + supabase/functions/
_shared/agent-prompts.ts:122 ("VOCÊ NUNCA PROMETE: ganhos garantidos,
sucesso garantido, lucro garantido, aprovação garantida, resultados
garantidos")
DIZ: a Sofia (IA) está proibida de prometer ganhos.
O QUE O RUNTIME REAL USA HOJE:
A proibição (Fonte B) vale só para as respostas geradas por IA da Sofia
durante a conversa — não existe nenhuma regra equivalente para o conteúdo
estático da Landing, que já apresenta números concretos antes mesmo de a
candidata abrir o chat.
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
ver pergunta 3 da seção 15 — os números da Landing são baseados em dado
real de revendedoras? Podem continuar sendo exibidos assim?
```

```text
CONTRADIÇÃO CAP-CON-006
ASSUNTO: Comentário de código desatualizado sobre a conexão do FEATURE-004
FONTE A: apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts:1-9
DIZ: "Continua 'shadow': nada em `useSofiaFlow.ts` chama isto ainda."
FONTE B: apps/landing/src/hooks/useSofiaFlow.ts:356-383 (handleCandidateQuestion)
DIZ: chama `answerCandidateQuestion` diretamente sempre que a candidata faz
uma pergunta de negócio e a flag `sofia_perguntas_ia_ativa` está ligada.
O QUE O RUNTIME REAL USA HOJE:
A Fonte B — confirmado também pelo valor real da flag no Supabase
(`sofia_perguntas_ia_ativa = {"ativa": true}`, consultado em 2026-08-16).
O comentário da Fonte A está desatualizado (provavelmente escrito antes da
integração final ter sido feita, e nunca corrigido).
PODE DECIDIR AUTOMATICAMENTE?
NÃO (é uma correção de comentário de código, fora do escopo deste
inventário alterar) — mas É seguro afirmar, para fins deste documento, que
a base de conhecimento de `seedDocuments.ts` está ativa em produção hoje.
PERGUNTA PARA CARLOS/TANIA:
Nenhuma — é um achado técnico, não uma decisão de negócio pendente.
```

```text
CONTRADIÇÃO CAP-CON-007
ASSUNTO: Modelo de pipeline pós-aprovação planejado (RFC-013) x implementado
FONTE A: docs/rfc/RFC-013-crm-001-pipeline-operacional.md (enum
crm_stage_enum de 5 valores: AGUARDANDO_CONTATO/EM_CONTATO/ENTREVISTA/
REVENDEDORA/DESCARTADA, com discard_reason, trigger de banco, RPC
administrativa — bloqueado explicitamente até um "gate de catálogo" que a
própria RFC-013.1 registra como NÃO CONCLUÍDO)
FONTE B: packages/shared/src/constants.ts:104-220 (enum etapa_pos_aprovacao,
5 valores diferentes: contatada/confirmada/aguardando_tania/ativa/desistiu)
DIZ: dois desenhos de nomenclatura e de mecanismo diferentes para a mesma
necessidade de negócio (acompanhar o pós-aprovação).
O QUE O RUNTIME REAL USA HOJE:
A Fonte B — é o que está implementado e rodando (migration
20260812150000_add_leads_etapa_pos_aprovacao.sql). A RFC-013/013.1 nunca
foi implementada como especificada.
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
ver pergunta 8 (variante) — quem quiser saber "o que acontece depois da
aprovação" deve confiar em `constants.ts`/Admin, não na RFC-013. Vale
arquivar formalmente a RFC-013/013.1 como superada?
```

```text
CONTRADIÇÃO CAP-CON-008
ASSUNTO: Recomendação de QUALIFICACAO-002 (Modelo C) x implementação real
(Modelo A)
FONTE A: docs/qualificacao/QUALIFICACAO-002-estabilidade-trabalho.md:204-230
DIZ: recomenda formalmente o "Modelo C" — estabilidade profissional como
critério adicional de pontuação no IPR, mantendo "trabalha" eliminatório
como já é.
FONTE B: supabase/functions/finalize-candidate/index.ts:134-141,289-292
DIZ: a implementação real manteve o "Modelo A" — a pergunta foi adicionada
e o dado é persistido, mas está EXPLICITAMENTE PROIBIDO de entrar em
calcularIpr/decidirStatus/classificarPerfil.
O QUE O RUNTIME REAL USA HOJE:
Modelo A (só informativo) — Fonte B.
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
ver pergunta 16 da seção 15 — vocês querem mesmo evoluir para o Modelo C
recomendado, ou preferem manter a estabilidade como informação consultiva
apenas (como está hoje)?
```

```text
CONTRADIÇÃO CAP-CON-009 (risco baixo, inconsistência de manutenção)
ASSUNTO: Nota de "pendência de revisão" sobre troca por defeito
FONTE A: docs/knowledge/COM-003-troca-defeito.md:35 ("Pendência de revisão:
você disse que 'na primeira vez' a troca é sem cobrança — não ficou claro
se, a partir da segunda troca... passa a existir cobrança de frete")
FONTE B: docs/knowledge/COM-004-primeiro-mostruario.md:27-29 (resolve a
pendência: "A partir da segunda troca por defeito, passa a haver cobrança
de frete/envio")
O QUE O RUNTIME REAL USA HOJE:
A versão já corrigida (seedDocuments.ts com-003-troca-defeito, versão 2).
PODE DECIDIR AUTOMATICAMENTE?
NÃO (mas é só uma atualização de nota de rodapé, não uma divergência de
conteúdo real)
PERGUNTA PARA CARLOS/TANIA:
Nenhuma — sugestão de limpeza documental (atualizar a nota do COM-003.md
original), fora do escopo de implementação deste inventário.
```

```text
CONTRADIÇÃO CAP-CON-010
ASSUNTO: "Treinamento completo" citado 4x na Landing, sem nenhum documento
de conhecimento oficial que o descreva
FONTE A: apps/landing/src/components/sections/{QuemSomos,ComoFunciona,FAQ,
Depoimentos}.tsx
DIZ: treinamento é um diferencial central, oferecido a quem não tem
experiência.
FONTE B: docs/knowledge/COM-001..004*.md e apps/landing/src/orchestrator/
knowledge/seedDocuments.ts
DIZ: nenhuma menção à palavra "treinamento" em nenhum dos 8 documentos.
O QUE O RUNTIME REAL USA HOJE:
Se uma candidata perguntar à Sofia sobre o treinamento, a busca no
KnowledgeEngine não encontra nenhum documento e a IA nunca é chamada — cai
direto no fallback "Prefiro não passar uma informação imprecisa neste
momento." (nunca inventa, mas também não ajuda).
PODE DECIDIR AUTOMATICAMENTE?
NÃO
PERGUNTA PARA CARLOS/TANIA:
ver pergunta 9 da seção 15.
```

---

## 7. Conhecimento efetivamente visível para a candidata

Esta seção é o achado mais importante deste levantamento em termos de "o que realmente chega", separado do que apenas existe no repositório.

**7.1 Sempre visível, sem depender de nenhuma flag (Landing pública):**
Hero, QuemSomos, ComoFunciona, QuantoPossoGanhar, Depoimentos, FAQ, ChamadaFinal, Footer — todo o conteúdo das seções 4.1, 4.2 (parcial), 4.7, 4.8, 4.9 acima. Isso inclui a contradição de área de atuação (CAP-CON-004) e as faixas de ganho em R$ (CAP-CON-005). Este conteúdo **nunca passa por IA nem por nenhuma validação de política** — é HTML/React estático.

**7.2 Roteiro fixo (`sofia-script.ts`), sempre ativo:** as 14 perguntas do wizard, `SOFIA_INTRO_LINES`, `SOFIA_REJECTION_LINES` (texto oficial verbatim), `SOFIA_APPROVED_LINES`, `SOFIA_EM_ANALISE_LINES`, `SOFIA_REPROVADA_FINAL_LINES`. Determinístico, nunca gerado por IA, nunca parafraseado.

**7.3 Perguntas de negócio respondidas por IA — CONFIRMADO ATIVO HOJE em produção:** com `sofia_perguntas_ia_ativa = true` (confirmado por consulta direta ao Supabase real em 2026-08-16), quando a candidata digita uma pergunta de negócio (ex.: "quanto eu ganho de comissão"), o fluxo real é: `useSofiaFlow.ts` → `classifyMessageForFeature004` classifica como `QUESTION` → `handleCandidateQuestion` → `answerCandidateQuestion` → `KnowledgeEngine.searchByQuestion` (busca por palavra-chave + stemming leve nos 8 documentos de `seedDocuments.ts`) → se encontrar ao menos 1 documento, chama `agent-ai-gateway` (Claude Haiku 4.5) com os documentos encontrados anexados ao prompt → `ResponseComposer` valida a resposta (tamanho, nº de perguntas, ausência de promessa) antes de exibir. **Isto significa que os 8 documentos de `seedDocuments.ts` (comissão, consignação, garantia, exclusões, elegibilidade, processo de candidatura, troca por defeito, primeiro mostruário) são, hoje, a base de conhecimento real e ativa que a Sofia usa para responder perguntas espontâneas.**

Se a busca não encontrar nenhum documento (ex.: pergunta sobre treinamento, tabela de preços, ou qualquer assunto fora dos 8 documentos), a IA **nunca é chamada** — cai direto no fallback seguro (nunca inventa).

**7.4 Reações contextuais por IA (2 pontos: pós-profissão, pós-objetivo):** ativas hoje (`sofia_ia_ativa = true`), mas geram só tom/reconhecimento a partir do que a própria candidata já disse — não introduzem conhecimento novo sobre a empresa.

**7.5 Reconhecimentos determinísticos (FEATURE-005, `sofia_conducao_natural = ACTIVE`, confirmado ativo):** frases curtas fixas (sem IA) antes de nome/cidade/idade/WhatsApp/Instagram — comportamental, não é conhecimento de negócio.

**7.6 Nunca visível à candidata:** toda a análise consultiva de IA (`ai_analysis`, campos como `perfil_sugerido_ia`, `icp_score`, `proxima_acao`) — só aparece no Admin, para a equipe humana. A lista `PROFISSOES_PREFERIDAS` também nunca é exibida.

**7.7 Confirmado como shadow/sem efeito no que a candidata vê:** todo o "Agent Core clássico" (`WorkingMemory`→`Context`→`Objectives`→`Planner`→`IntentClassifier` de raiz→`DecisionEngine`→`ActionEngine`, orquestrado por `SofiaOrchestrator`), o `AgentProfile`/`AgentRegistry`/`AgentFactory`/`AgentRuntime`, e o `KnowledgeTool`/`ToolEngine` (nunca registrado). Rodam a cada turno só para fins de observação/log/Simulator — o valor de retorno nunca é lido por quem decide o que a candidata vê.

**7.8 Ficha de Aprovação (2ª etapa):** formulário estático em React, sem IA — campos fixos (endereço, pais, cônjuge, referências).

---

## 8. Mapa de conhecimento

```text
TANIA JOIAS — CAPTAÇÃO
│
├── Empresa (3 candidatos | confiança média | lacuna: história/tempo de mercado)
├── Oportunidade / Recrutamento (11 candidatos | confiança alta na existência,
│     baixa na coerência entre "declarado" e "executado" | lacuna: comunicação
│     do processo pós-Sofia à candidata)
├── Consignação (1 candidato | confiança alta | sem lacuna relevante)
├── Comissão (2 candidatos | confiança alta | lacuna: nunca cruzada com os
│     ganhos em R$ da Landing)
├── Produtos / Garantia (3 candidatos | confiança alta | lacuna: "mau uso"
│     sem definição objetiva; zero presença na Landing)
├── Primeiro Mostruário (1 candidato | confiança alta | sem lacuna relevante)
├── Ganhos (1 candidato | confiança BAIXA quanto à origem dos números |
│     ALTO RISCO)
├── Treinamento (1 candidato | confiança zero quanto a conteúdo real |
│     LACUNA CRÍTICA — claim recorrente, zero documento)
├── FAQ (1 candidato agregador | confiança média)
├── Objeções / Atendimento (2 candidatos | confiança alta quanto ao
│     comportamento, N/A quanto a "conhecimento" propriamente dito)
└── Cidades (embutido em Oportunidade — ver CAP-KNOW-003/006 | confiança
      alta na regra, CONTRADITÓRIO quanto à comunicação pública)
```

Total: 27 candidatos catalogados na seção 4.

---

## 9. O que a Sofia não sabe

Lacunas de **conhecimento** (não técnicas — a Sofia sempre pode "tecnicamente" tentar responder, o ponto aqui é que não há fato confiável nenhum por trás):

1. O que exatamente é o "Treinamento Completo" (formato, duração, conteúdo, obrigatoriedade, custo) — citado 4x na Landing, zero documentos.
2. A "tabela de preços" dos produtos, mencionada em `ComoFunciona.tsx`, nunca documentada.
3. O que são exatamente os "materiais de divulgação/conteúdo pronto" mencionados em `ComoFunciona.tsx`.
4. O que acontece com uma candidata que fica em `em_analise` (IPR entre 60 e 79) — quem decide manualmente, com que critério, em quanto tempo.
5. Detalhes da Ficha de Aprovação (o que ela vai pedir) — a Sofia nunca antecipa isso, só diz "vai receber um link".
6. Prazo/processo formal para uma candidata reprovada por "não trabalha" se candidatar de novo (o texto promete a possibilidade, sem detalhar como).
7. Motivo de negócio pelo qual só as 5 cidades do ABC Paulista são atendidas (raio de entrega? equipe de campo? capacidade operacional?).
8. Definição objetiva de "mau uso" (para fins de exclusão de garantia) — hoje é um conceito sem critério registrado.
9. Valor exato do frete cobrado a partir da 2ª troca por defeito.
10. Se existe algum caso de caução/pagamento inicial em qualquer etapa além do primeiro mostruário (ex.: mostruários seguintes, reposição).
11. Capacidade operacional (quantas revendedoras a empresa consegue atender bem hoje).
12. Conteúdo da Política de Privacidade (link existe no Footer, conteúdo não avaliado neste inventário).

---

## 10. Conhecimentos de alto risco

| Tema | Risco se errado | Classificação |
|---|---|---|
| Faixas de ganho em R$ (`QuantoPossoGanhar.tsx`) | Gera expectativa financeira concreta sem lastro formal encontrado; contradiz diretamente a regra "nunca prometer ganhos" do Playbook (aplicada só à Sofia, não à Landing) | **ALTO** |
| Cidade atendida (declarado "obrigatório" x executado "só pontua") | Pode reprovar/confundir quem deveria ser aprovada, ou aprovar quem a empresa não consegue atender de verdade | **ALTO** |
| WhatsApp/Instagram (declarado "obrigatório" x executado "só pontua") | Mesma classe de risco do item acima, em menor escala | **MÉDIO-ALTO** |
| Idade mínima / gênero (declarado, nunca verificado) | Risco de discriminação percebida OU de a empresa achar que está filtrando por isso quando não está | **ALTO** |
| Comissão (30/35/40% por faixa) | Se comunicado errado, gera expectativa financeira diretamente incorreta em cada acerto | **ALTO** |
| Garantia (3m anéis / 6m demais + exclusões) | Errar gera disputa pós-venda com revendedora já ativa | **MÉDIO** |
| Consignação (30 dias, sem pagamento antecipado) | Errar gera confusão financeira, mas não é promessa de ganho | **MÉDIO** |
| Primeiro mostruário (prazo, composição, motoboy grátis) | Expectativa de entrega errada | **MÉDIO** |
| Troca por defeito (1ª grátis / 2ª cobra frete) | Mal comunicado gera atrito, mas é reversível | **MÉDIO** |
| Treinamento (claim recorrente, zero conteúdo) | Se a Sofia inventar detalhes (hoje ela não inventa — cai em fallback), geraria expectativa falsa; hoje o risco real é frustração por "não saber responder" | **MÉDIO** |
| Área de atuação ("todo o Brasil" x 5 cidades) | Atrai candidatas fora da área de atendimento real, gerando trabalho de triagem/decepção | **MÉDIO** |
| Decisão automática da Tania por WhatsApp sim/não (CAP-KNOW-027) | Falha silenciosa (2+ pendentes) pode fazer a Tania achar que decidiu quando nada mudou | **ALTO** (risco operacional, não de conteúdo) |
| Critério de reprovação por "desempregada" | Tema sensível (já reconhecido pelo próprio COM-002 ao remover critério de filhos/estado civil por risco de discriminação) — a mensagem precisa continuar sendo cuidadosamente mantida | **MÉDIO** |
| Instagram/WhatsApp como diferencial (não bloqueio) comunicado errado isoladamente | Risco baixo isoladamente, mas some dentro do item combinado acima | **BAIXO** |

---

## 11. O que NÃO deve virar item do Cérebro empresarial

- Detalhes internos de React (componentes, hooks, roteamento).
- Plumbing do Agent Core (`WorkingMemory`, `Objectives`, `Planner`, `DecisionEngine`, `ActionEngine`, `SofiaOrchestrator`) — confirmado shadow, sem efeito visível.
- `KnowledgeTool`/`ToolEngine` — nunca registrado, classe morta.
- Tipos TypeScript, schemas Zod, tipos gerados do Supabase.
- Detalhes técnicos de Meta CAPI/Pixel (`event_id`, hashing SHA-256, dedup) — são implementação de rastreamento, não conhecimento comercial.
- IDs Meta, tokens, nomes de variáveis de ambiente (`WHATSAPP_CLOUD_API_TOKEN` etc.).
- Detalhes de implementação Supabase (RLS, policies, triggers, migrations) — pertencem ao diagnóstico técnico, não ao conhecimento de negócio.
- Detalhes do provider de IA (modelo `claude-haiku-4-5-20251001`, tool-use forçado, timeouts) — são decisão de engenharia, não conhecimento da empresa.
- O classificador de intenção em si (`classifyCandidateMessageContextual`) — comportamental/técnico; só as objeções específicas que ele reconhece (medo, insegurança etc.) têm valor de conhecimento institucional (já capturado em CAP-KNOW-025).
- Textos puramente de transição/reconhecimento ("Agora vamos continuar...", "Obrigada pela sua pergunta.") — são estilo, não conhecimento da empresa.

---

## 12. Top 20 conhecimentos para o Cérebro

Critério: frequência de uso pela Sofia hoje, impacto na decisão da candidata, risco se estiver errado, utilidade para outros agentes (ex.: um futuro agente de pós-venda), qualidade das evidências. **Não implica cadastro — é só priorização.**

1. Tabela de comissão por faixa de valor vendido (CAP-KNOW-016)
2. Único critério realmente eliminatório é "estar trabalhando" (CAP-KNOW-005) — junto com a decisão sobre CAP-CON-001/002/003
3. Como funciona a consignação — ciclo de 30 dias (CAP-KNOW-015)
4. Cidades atendidas e se isso deve virar bloqueio automático (CAP-KNOW-006)
5. Texto oficial de reprovação por não estar trabalhando (CAP-KNOW-009)
6. Garantia — prazos por tipo de peça (CAP-KNOW-018)
7. O que não é coberto pela garantia (CAP-KNOW-019)
8. Troca por defeito — regra da 1ª grátis / 2ª com frete (CAP-KNOW-020)
9. Primeiro mostruário — composição, prazo, sem caução (CAP-KNOW-021)
10. Processo completo de candidatura, incluindo decisão final da Tania (CAP-KNOW-010, CAP-KNOW-012)
11. O que é a Ficha de Aprovação e o que ela pede (CAP-KNOW-011)
12. Faixas de ganho em R$ — precisa de validação/lastro antes de continuar (CAP-KNOW-022)
13. "Treinamento completo" — precisa ser escrito do zero (CAP-KNOW-023)
14. Idade mínima e gênero — decisão pendente sobre se e como aplicar (CAP-KNOW-008)
15. WhatsApp/Instagram como diferencial, não bloqueio (CAP-KNOW-007)
16. Área de atuação real, com correção da divergência do Footer (CAP-KNOW-003)
17. Estabilidade profissional — decisão sobre Modelo A vs. Modelo C (CAP-KNOW-013)
18. Profissões-sinal positivo usadas pela IA consultiva (CAP-KNOW-014)
19. Regras de tom e promessas proibidas da Sofia (CAP-KNOW-026)
20. Decisão automática da Tania por WhatsApp sim/não — risco operacional a resolver (CAP-KNOW-027)

---

## 13. Entrevista para Carlos/Tania

1. A comissão que vale hoje é mesmo 30% / 35% / 40% conforme a faixa de valor vendido (COM-001), ou já mudou desde que o documento foi escrito?
2. Quando uma candidata pergunta "quanto eu ganho", vocês querem que a Sofia cite só "até 40%" (como a Landing faz hoje) ou sempre a tabela completa de faixas?
3. As faixas de ganho em R$ de "Quanto posso ganhar" (R$300–600 / R$800–1.800 / R$2.000+ por mês) são baseadas em dado real de revendedoras? Podemos continuar exibindo esses números, mesmo com a ressalva "valores ilustrativos"?
4. Hoje, uma candidata de fora das 5 cidades atendidas pode ser aprovada normalmente pelo sistema (cidade só soma pontos, nunca bloqueia sozinha). Isso é intencional, ou deveria virar um bloqueio automático?
5. O rodapé do site diz "revendedoras em todo o Brasil" — isso é uma ambição futura de expansão, ou é um erro de texto que deveria dizer "região do ABC Paulista"?
6. A idade mínima de 21 anos e o critério "ser mulher" ainda são exigidos de verdade? Se sim, por que eles nunca entraram no cálculo de aprovação — e vocês querem que passem a entrar?
7. WhatsApp e Instagram são realmente obrigatórios para virar revendedora, ou são só um diferencial que ajuda a pontuação, como o sistema trata hoje?
8. Vocês sabem que responder só "sim" ou "não" no seu WhatsApp pode aprovar ou recusar automaticamente uma candidata (sem nenhuma tela de confirmação), e que isso falha silenciosamente se houver mais de uma candidata pendente ao mesmo tempo? Isso foi uma decisão consciente?
9. O que exatamente é o "Treinamento Completo" citado várias vezes no site — formato, duração, conteúdo, é obrigatório ou opcional?
10. Existe uma "tabela de preços" oficial dos produtos (mencionada em "Como funciona")? Ela pode virar conhecimento oficial para a Sofia explicar?
11. A partir da segunda troca por defeito, o frete passa a ser cobrado — esse valor tem uma tabela, ou é calculado caso a caso?
12. Existe alguma situação em que se cobra caução ou pagamento inicial da revendedora, em qualquer etapa (cadastro, primeiro mostruário, mostruários seguintes, reposição)?
13. Quando uma candidata cai em "em análise" (score do IPR entre 60 e 79), o que decide se ela é aprovada ou reprovada manualmente, e quem faz essa análise hoje?
14. A aprovação final ainda depende sempre de você (Tania) confirmar manualmente — pelo Admin ou pelo WhatsApp — ou já existe algum caso que pula essa etapa?
15. As profissões usadas hoje internamente como "sinal positivo" pela IA consultiva (cabeleireira, professora, enfermeira, bancária) ainda refletem o que vocês consideram um bom perfil, ou é uma lista de exemplo desatualizada?
16. Sobre a pergunta nova "sua rotina é fixa ou variável" (estabilidade profissional): vocês querem que isso passe a valer pontos na aprovação, ou preferem manter só como informação para a equipe (como está hoje)?
17. Existe algum limite de quantas revendedoras vocês conseguem atender bem hoje, que devesse influenciar o quão "fácil" é ser aprovada?
18. A Sofia hoje já responde perguntas de negócio em tempo real usando IA (isso já está ligado em produção). Vocês já validaram o teor dessas respostas ao vivo, ou preferem revisar o conteúdo antes de manter a flag ligada?
19. Quando uma pergunta da candidata não tem resposta na base de conhecimento (ex.: sobre treinamento ou tabela de preços), a Sofia hoje diz que prefere não responder algo impreciso. Isso é aceitável, ou vocês preferem que a equipe seja avisada nesses casos?
20. O texto de garantia (3 meses em anéis, 6 meses nas demais peças, exceto mau uso/oxidação) ainda é válido, ou já mudou desde que o documento foi escrito?

---

## Relatório final

1. **Documento:** [INVENTARIO-INTELLIGENCE-002-CONHECIMENTO-CAPTACAO-SOFIA.md](INVENTARIO-INTELLIGENCE-002-CONHECIMENTO-CAPTACAO-SOFIA.md)
2. **Total de candidatos:** 27 (CAP-KNOW-001 a CAP-KNOW-027)
3. **Candidatos por classificação (classificação principal de cada um):**
   - `[CONFIRMADO-EXECUTAVEL]`: 8 (CAP-KNOW-005, 009, 010, 011, 012, 013, 014, 025)
   - `[CONFIRMADO-MULTIFONTE]`: 8 (CAP-KNOW-004, 015, 016, 018, 019, 020, 021, 026)
   - `[CONTRADITORIO]` (como classificação principal): 6 (CAP-KNOW-003, 006, 007, 008, 022, 023)
   - `[CONFIGURADO]`/`[DOCUMENTADO]` (copy/design ainda não validado como conhecimento oficial): 5 (CAP-KNOW-001, 002, 017, 024, além do próprio 022 já contado acima)
   - `[LEGADO/POSSIVELMENTE-OBSOLETO]` (confiança reduzida, fonte secundária): 1 (CAP-KNOW-027)
4. **Conhecimentos duplicados (matriz da seção 5):** 14 assuntos mapeados em 2 ou mais fontes; 8 avaliados como idênticos entre o `.md` original e `seedDocuments.ts`, 2 como semelhantes (profissões-alvo; "até 40%" vs. tabela completa), 3 como divergentes (elegibilidade declarada x IPR real; área de atuação; ganhos em R$ x comissão em %), 1 sem fonte comum (treinamento).
5. **Contradições registradas:** 10 (CAP-CON-001 a CAP-CON-010), sendo 5 de risco alto/médio-alto para o negócio (001, 002, 003, 004, 005), 1 puramente técnica de documentação (006), 2 de processo/arquitetura (007, 008), 1 de baixo risco (009) e 1 de lacuna de conteúdo (010).
6. **Lacunas identificadas ("o que a Sofia não sabe"):** 12.
7. **Perguntas para Carlos/Tania:** 20.
8. **Top 5 conhecimentos (por prioridade da seção 12):** (1) tabela de comissão por faixa; (2) único critério realmente eliminatório é "estar trabalhando"; (3) ciclo de consignação de 30 dias; (4) cidades atendidas e se devem virar bloqueio automático; (5) texto oficial de reprovação por não estar trabalhando.
9. **Top 5 conhecimentos de maior risco se estiverem errados:** (1) faixas de ganho em R$ na Landing, sem lastro formal encontrado; (2) divergência entre cidade "obrigatória" (declarada) e "apenas pontua" (executada); (3) idade mínima/gênero declarados mas nunca verificados; (4) tabela de comissão, se comunicada errada; (5) decisão automática da Tania por WhatsApp sim/não, com falha silenciosa em caso de ambiguidade.
10. **Confirmação:** nenhum código, prompt, migration, banco, Supabase, Landing, Admin, CRM, WhatsApp ou Edge Function foi alterado para produzir este inventário. Foi feita apenas 1 consulta `SELECT` de leitura à tabela `settings` do projeto Supabase real (`iaqzbernshmhkqznleye`), sem nenhuma escrita, sem leitura de dados pessoais de candidatas. Nenhuma comparação com o ConsigGold foi realizada.
