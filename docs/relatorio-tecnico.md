# RELATÓRIO TÉCNICO CONSOLIDADO — Club Cut

**Data:** 2026-09-05. **Fonte exclusiva:** os 9 relatórios de auditoria em `docs/auditoria/` (`01-supabase.md`, `02-crm.md`, `03-n8n.md`, `04-evolution.md`, `05-meta.md`, `06-asaas.md`, `07-vercel.md`, `08-hostinger.md`, `90-integracao.md`), todos de 2026-09-05. Este documento **não contém análise nova**: consolida, cruza e prioriza o que os relatórios registram. Onde os relatórios não respondem, a lacuna está apontada no capítulo 10 — não preenchida.

**Público:** o desenvolvedor do sistema. **Convenção de âncoras:** `arquivo:linha` do repositório, ou `NN-arquivo.md §seção` quando o fato mora no relatório de componente.

---

## 1. Sumário executivo

### 1.1 Estado geral em uma frase

O sistema tem miolos bem construídos — provisionamento de barbearia, travas de conflito no banco, RLS multi-tenant, idempotência do webhook do Asaas — e **as três pontas que justificam o produto nunca funcionaram no modelo vigente**: o atendimento pelo ramo Evolution tem **zero execuções reais na história** e nenhum tráfego por webhook desde 23/08; o lembrete está **morto duas vezes** (templates nunca submetidos à Meta + workflow buscando `phone_number_id` no lugar errado); e o ciclo de cobrança por uso tem **zero ciclos reais completados**. Tudo isso sem backup do banco, sem nenhum alerta de falha, e com o padrão dominante sendo a **falha silenciosa**: cada componente falha educadamente (sempre-200, fail-closed, `onError: continueRegularOutput`) e o conjunto morre sem barulho — a prova empírica é o produto principal ter ficado 2 semanas mudo sem ninguém saber (`90-integracao.md §Consolidação P1`).

Resposta direta do relatório de integração à pergunta "dá para colocar barbearias reais?": **hoje, não** (`90-integracao.md §Consolidação 1`).

### 1.2 Placar de achados por severidade

Contagem dos relatórios de componente (o `90-integracao.md` reindexa a maioria como "elos abertos" A1–A8, B1–B11, C1–C9, D1–D12, E1–E13 — não somados de novo aqui para não duplicar):

| Componente | CRÍTICO | ALTO | MÉDIO | BAIXO | Total |
|---|---|---|---|---|---|
| Supabase (01) | 1 | 2 | 6 | 4 | 13 |
| CRM React (02) | 0 | 2 | 3 | 4 | 9 |
| n8n (03) | 1 | 4 | 7 | 7 | 19 |
| Evolution (04) | 1 | 3 | 4 | 2 | 10 |
| Meta (05) | 1 | 2 | 4 | 3 | 10 |
| Asaas (06) | 0 | 2 | 5 | 3 | 10 |
| Vercel (07) | 0 | 2 | 3 | 1 | 6 |
| Hostinger (08) | 1 | 1 | 2 | 2 | 6 |
| **Total bruto** | **5** | **18** | **34** | **26** | **83** |

Duplicidade conhecida: o CRÍTICO do n8n (`03-n8n.md §C1`) e o da Evolution (`04-evolution.md §3.1`) são **o mesmo buraco** (webhook `salao-atendimento` sem autenticação + tenant por corte de string) visto dos dois lados; o A1 do n8n (contexto descartado) reaparece como C2 da integração. Placar deduplicado de CRÍTICOs distintos: **4** (webhook do agente, backup Supabase, templates Meta, firewall do VPS).

Completude por fluxo ponta a ponta (`90-integracao.md §Consolidação 1`): Onboarding **60%**, Mensagem de cliente **55% estrutural / 0% operando**, Agendamento+lembrete **60% (90/15)**, Cobrança **70% estrutural / 0 ciclos reais**, Deploy/runtime **45%**. Média estrutural ≈ 58% — "mas a média mente": os elos-fim estão em ~0%.

### 1.3 Os 5 riscos que travam o go-live

1. **A entrada do produto principal está, com alta probabilidade, quebrada AGORA — e o modo de falha é invisível por construção** (B1/A1). Zero execuções por webhook no fluxo do agente (`rJO1n7cFeNDIJyB5`) desde 23/08 com retenção alcançando 22/08; o URL de produção registrado tem UUID no path (`…/webhook/<uuid>/salao-atendimento`) e `docs/n8n-cloud-api-entrada.md:87-89` manda configurar **sem** o UUID. A edge `whatsapp-webhook` devolve 200 à Meta com só um `console.error` quando o n8n recusa (`index.ts:388`); a Evolution não loga nada do lado de cá. Enquanto isso não for decidido (uma mensagem de teste real decide em minutos), nada mais do produto é testável.
2. **Os webhooks internos do n8n não têm autenticação e o tenant é forjável** (N8N-C1 = EV-01, mais C3/A4). `POST /webhook/salao-atendimento` aceita payload Evolution forjado com `instance: "salon-<uuid-de-qualquer-salão>"` — grava conversa/mensagem em qualquer tenant com `service_role` (RLS não se aplica), gasta OpenAI e faz o **WhatsApp real da barbearia** responder a um telefone escolhido pelo atacante (o gatilho exato do banimento que o híbrido existe para evitar). `lembrete-resposta-central` envia `body.resposta` **verbatim** pelo número oficial da plataforma. A URL está escrita em doc de **repositório público**.
3. **O dado do negócio não tem backup** (SB-01/E1). Supabase no plano gratuito, sem PITR, sem rotina de dump; o banco é o único depositário de agenda, clientes, financeiro e prova de aceite de termos — e **um wipe já aconteceu** (produção zerada em 03/09, re-semeada em 04/09, com os docs oficiais ainda descrevendo o banco antigo).
4. **O VPS que carrega toda a mensageria está sem firewall, com n8n e Evolution publicados em `0.0.0.0` em HTTP puro** (HG-01/E2). `srv1833354.hstgr.cloud` (179.197.78.181), portas 32769 (n8n) e 32770 (Evolution), `firewall_group_id: null`, nenhum firewall criado na conta. Agravado por `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true` + `CORS_ORIGIN='*'`: um vazamento da chave global entrega os tokens de **todas** as instâncias de uma vez.
5. **Dinheiro real pode estar se movendo hoje fora do alcance do sistema, e a estreia do ciclo de cobrança será com dinheiro de cliente** (AS-01/D2 + D1). Recorrências órfãs no Asaas pós-reseed (El Guardians R$ 5/mês; Curitiba `sub_klx4z6d0xv9p83h4`; customers `cus_000192278757`/`cus_000194207151`) sem espelho no banco — o botão Cancelar não as alcança (`asaas_subscription_id` NULO). E o ciclo por uso (`fechar_mes_de_uso` → `cobrar-uso` → e-mail → pagamento → webhook) tem 0 execuções reais; o primeiro fechamento real é 01/10, com a El Guardians saindo do teste em 11/09.

**Sexto lugar por um triz:** o lembrete — recurso central — morto duas vezes (MT-01 + MT-02), com o corolário perverso de que aprovar os templates **liga sozinho** avaliação/vencimento/reativação para clientes reais enquanto o lembrete continua mudo (`90-integracao.md §C1`).

---

## 2. Componente Supabase

### 2.1 Estado

Projeto `clinica-crm` (ref `bukhpvvybeltmhtwamox`, `sa-east-1`, Postgres 17.6.1.147, ACTIVE_HEALTHY, plano gratuito). 46 tabelas em `public`, **todas com RLS habilitada**; 64 policies em 33 tabelas; 11 tabelas deny-by-default deliberado (só `service_role`): `asaas_eventos`, `auditoria_avisos`, `avaliacao_pedidos`, `canal_de_alertas`, `consumo_ia`, `controle_de_taxa`, `eventos_da_waba`, `faixas_de_uso`, `precos_modelo`, `remetentes_oficiais`, `whatsapp_templates`. 39 views, todas `security_invoker=true`. ~47 funções próprias; 45 SECURITY DEFINER com `search_path` fixo. 16 triggers em 12 tabelas. 7 jobs pg_cron com histórico 100% `succeeded`: `fechamento-mensal-de-uso`, `fechamento-diario-do-caixa`, `cancela-agendamentos-sem-comanda` (*/5min), `poda-historico-antigo`, `cria-reativacoes`, `expira-reativacoes`, `estende-acesso-sem-debito`. Realtime publica `appointments`, `clients`, `orders`, `payments`, `whatsapp_conversations`, `whatsapp_messages`. 12 edge functions ativas (4 com `verify_jwt=false`: `admin-create-salon`, `asaas-webhook`, `agenda-publica`, `whatsapp-webhook`); `admin-metricas` **só existe em produção**, sem fonte no repo.

Dados em 2026-09-05: **1 salão** ("El Guardians", `created_at` 2026-09-04), 1 usuário, 0 clients, 0 appointments, 0 whatsapp_messages, 25 `whatsapp_templates` (todas rascunho). Migrations: repo 138 arquivos vs produção 152–153 aplicadas, **divergentes nos dois sentidos**.

### 2.2 Decisões de arquitetura e o porquê

- **RLS em 100% das tabelas + deny-by-default documentado por comment** nas 11 tabelas de infraestrutura — o `service_role` (n8n/edges) é o único escritor delas; padrão correto para tabelas que cliente nenhum toca.
- **Isolamento multi-tenant por funções `private.*`** (`salon_id IN (SELECT private.salon_ids())`, papéis via `private.is_manager()`/`my_professional_ids()`), SECURITY DEFINER com `search_path` fixo — fecha o vetor clássico de escalada; há teste dedicado `supabase/tests/rls_isolamento_entre_saloes.test.sql`.
- **Views `security_invoker=true` em 39/39** — view não fura RLS.
- **Webhooks públicos autenticam de verdade e falham fechado**: `whatsapp-webhook` valida HMAC `x-hub-signature-256` em tempo constante e ignora tudo se `WHATSAPP_APP_SECRET` faltar; `asaas-webhook` exige `asaas-access-token` e recusa tudo (500) sem a env; `admin-create-salon` compara `x-admin-secret` em tempo constante + rate limit `taxa_excedida` (20/IP/10min).
- **`agenda-publica` com defesa em camadas** (gate por `salons_atendendo` + recurso `agenda_publica`, rate limit 8 agendamentos/IP/10min + 10/h por barbearia, revalidação server-side contra `horarios_livres`, cancelamento só por `token_gestao` uuid) — por ser o único endpoint público de propósito.
- **Conflito de agenda resolvido no banco, não na aplicação**: exclusão `appointments_sem_sobreposicao` (btree_gist), exclusão por cliente, folga por trigger — cobre as 3 portas de criação de uma vez.
- **`asaas` (verify_jwt=true) autoriza pelo JWT do chamador** via client `ANON_KEY + Authorization` — a RLS decide, não o `service_role`.

### 2.3 Achados

| ID | Sev | Achado | Evidência-chave |
|---|---|---|---|
| SB-01 | CRÍTICO | Backup inexistente/não gerenciado; banco é o único depositário do negócio | `docs/estado-do-projeto.md:40-41`; glob `**/*backup*` sem rotina; MCP não expõe estado de backup |
| SB-02 | ALTO | Banco contradiz os docs: as barbearias Curitiba e São José sumiram; El Guardians recriada 04/09 | counts 2026-09-05 vs `estado-do-projeto.md:33-34` |
| SB-03 | ALTO | Drift de migrations nos dois sentidos: ≥18 aplicadas sem arquivo no repo (`planos_e_assinaturas`, `consumo_ia`, `add_lembrete_enviado_to_appointments`…); `0057`/`0087` do repo fora da produção; numeração derivando | `list_migrations` vs `supabase/migrations/`; confissão em `0057_planos_iniciais.sql:10-13` |
| SB-04 | MÉDIO | `admin-metricas` só em produção, compara secret com `!==` (não constante) e sem rate limit | `get_edge_function admin-metricas` |
| SB-05 | MÉDIO | Grants largos p/ `anon`/`authenticated` incl. TRUNCATE (RLS não filtra TRUNCATE) em ~40 tabelas | `information_schema.role_table_grants` |
| SB-06 | MÉDIO | 3 funções `private` sem `search_path` fixo: `telefone_valido`, `destino_whatsapp`, `documento_valido` | advisor `function_search_path_mutable` |
| SB-07 | MÉDIO | Proteção contra senha vazada desligada no Auth | advisor `auth_leaked_password_protection` |
| SB-08 | MÉDIO | 19 FKs sem índice, várias em `salon_id` (`services`, `professionals`, `products`…) | advisor `unindexed_foreign_keys` |
| SB-09 | MÉDIO | 95 achados de `multiple_permissive_policies` em 12 tabelas (`services` 20, `stock_movements` 15…) | advisor performance |
| SB-10 | BAIXO | 14 RPCs DEFINER executáveis por `authenticated` (API intencional, autorização interna não auditada) + 2 grants-lixo de trigger p/ `anon` | `has_function_privilege` |
| SB-11 | BAIXO | `btree_gist` no schema `public` | advisor `extension_in_public` |
| SB-12 | BAIXO | 10 índices nunca usados (sinal fraco, banco vazio) | advisor `unused_index` |
| SB-13 | BAIXO | 4 funções `private` de policy com `search_path=public` sem `pg_temp` | `pg_proc.proconfig` |

**Bombas de tempo declaradas** (`01-supabase.md §4`): `admin-create-salon` checa e-mail duplicado com `auth.admin.listUsers()` sem paginação (quebra a partir de ~50 contas); `ASAAS_BASE_URL` com fallback sandbox em 2 funções; `APP_URL` com fallback `https://clubcut.vercel.app`; timezone fixa `America/Sao_Paulo` na agenda pública; Realtime publicando tabelas inteiras contra o teto do plano gratuito; `controle_de_taxa` sem limpeza confirmada; ritmo de ~2 migrations manuais/semana engordando o drift.

---

## 3. Componente CRM (React/Vite)

### 3.1 Estado

React 19.2, Vite 8.1, TS ~6.0 (**sem `strict`**), react-router-dom 7, supabase-js 2, Tailwind 4, recharts 3; lint oxlint, testes vitest (28 arquivos, ~239 blocos `it/test`, só funções puras). Rotas públicas (`/login`, `/inicio`, `/criar-conta`, `/convite/:token`, `/agendar/:salonId`, `/meu-horario/:token`, `/admin/nova-barbearia`) e protegidas (`RequireAuth` + `RequireManager`/`RequireNetworkOwner`); todas as telas fora de login+agenda por `lazy()`. `dist/` de 2026-09-04 ~2,8 MB (maior chunk: recharts 338 KB). Envs de build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (obrigatórias, falham alto), `VITE_APP_URL`, `VITE_AGENTE_IA_URL` (fallback silencioso).

### 3.2 Decisões de arquitetura e o porquê

- **Permissão num módulo puro e testado** (`src/features/auth/permissoes.ts`: `isManager`/`isOwner`/`ehDonoDesta`/`podeVerRede`) com fonte em `user_salons` — a mesma tabela que a RLS consulta; um vocabulário só para papel.
- **Leituras filtram `salon_id` explicitamente em todos os hooks** (incl. joins `!inner` e canais Realtime `filter: salon_id=eq.`); **escritas por `id` confiam na RLS**, com o pgTAP do CI como "o único ponto onde o isolamento entre salões é verificado" — decisão consciente de não duplicar a regra no front.
- **Fluxo público nunca toca tabela**: agenda pública, meu-horário e convite passam só por edge function; o token é a credencial e a regra fica no servidor.
- **Erro ≠ vazio como regra de projeto**, travada por teste-contrato (`ErroDeCarga.test.ts` lê o próprio código-fonte das telas); sessão expirada tratada no `SalonContext` (refresh → signOut) em vez de mentir "sua conta não tem salão".
- **Credencial errada falha cedo com mensagem específica** (`credenciaisSupabase.ts`) — cicatriz registrada do incidente de 2026-08-02.
- **Flag desligada por padrão**: `useRecurso` mantém `ativo=false` em carga e em erro — falha de rede não liga funcionalidade; cancela resposta atrasada ao trocar de unidade.
- **Guardas de rota honestas com o loading** (skeleton antes de redirecionar) — correção documentada do bug de rota de gestor inalcançável no refresh.

### 3.3 Achados

| ID | Sev | Achado | Evidência-chave |
|---|---|---|---|
| CRM-01 | ALTO | TypeScript sem `strict` (nem `strictNullChecks`) — typecheck verde não pega null/any em telas de venda/cobrança | `tsconfig.app.json:2-24` |
| CRM-02 | ALTO | Venda = "transação" de 8 passos no cliente (`orders`→`order_items`→`payments`→`stock_movements`→`commissions`→pacotes→`clients`→`appointments`) com rollback manual; fechar a aba no meio deixa comanda meio-escrita | `NewSaleModal.tsx:483-675` |
| CRM-03 | MÉDIO | `/equipe` sem `RequireManager` na rota (check só interno; queries disparam p/ barbeiro) | `App.tsx:146`; `EquipePage.tsx:471-477` |
| CRM-04 | MÉDIO | Painel admin: segredo estático em `sessionStorage` (`admin_tool_secret`), viaja em todo request como `x-admin-secret`; legível por XSS | `NovaBarbeariaPage.tsx:11,37` |
| CRM-05 | MÉDIO | `vercel.json` formato legado `routes` sem headers de segurança (bloqueia adicionar `headers`) | `vercel.json:1-6` |
| CRM-06 | BAIXO | `@tanstack/react-query` declarada e nunca usada | `package.json:18` |
| CRM-07 | BAIXO | Erro engolido no caixa (consulta de `salons.troco_padrao` sem ler `error`) | `CaixaSection.tsx:46-56` |
| CRM-08 | BAIXO | Docs divergem do código (chave `balcao` e `trocar_horarios` não existem em `src/`; "133 testes" vs ~239) | `estado-do-projeto.md:70-74` vs grep |
| CRM-09 | BAIXO | `/login` não redireciona usuário já logado | `LoginPage.tsx:7-33` |

**Bombas de tempo** (`02-crm.md §4`): conversas sem paginação (`useConversations` carrega tudo; `useAgentStats` faz `.in()` com todos os ids — estoura URL do PostgREST); `index.html` com canonical/og fixos em `clubcut.vercel.app`; renovação de sessão só no SalonContext (aba aberta o dia todo mostra erro até refresh manual); 3–4 canais Realtime por aba vs teto do plano gratuito; rotação da anon key exige redeploy; QR do balcão nunca visto num dia útil cheio.

---

## 4. Componente n8n

### 4.1 Estado

Self-hosted em `n8n-m5uf.srv1833354.hstgr.cloud` (mesmo VPS da Evolution). 13 workflows — 12 ativos, 1 desligado (`CRM Salao - Politica de Atraso`, `67oZqGOIoKO6pAeQ`, nunca publicado). O principal: `CRM Salão - Atendimento WhatsApp (Supabase Nativo)` (`rJO1n7cFeNDIJyB5`, 83 nós) — normaliza Cloud API **e** Evolution no mesmo fluxo, debounce 15s, agente LangChain **gpt-4o-mini** com 12 Supabase Tools, validador anti-alucinação, envio roteado por `provedor`. Demais: Lembretes (`DW0nq1Jyp9xeOJwm`), Avaliação (`NsHcELIXrETknywa`), Auditoria (`7yliDoD9AaQp3Qcm`), Feedback (`BvWc74ctfqDZYmtK`), Fim de Teste (`Dz35hJOz7UJER1Ll`), Convite (`Fy9aqg14kCkhhNHW`), Detalhamento de Uso (`8Qh33uoFm4VqT1eO`), Estoque Baixo (`vF05VWFrN7ufgi9L`), export Aura (`UqLCK8lElBR7iSze`), 2 popups de landing. 15 credenciais (com duplicadas/órfãs), 3 data tables. ~700 execuções/dia de polling; 3 erros em ~8.9k execuções retidas.

**Situação prática:** a camada voltada ao cliente final está em repouso — lembrete/avaliação gated por template Meta aprovado (nenhum aprovado), atraso desligado, e o fluxo do agente **sem execução por webhook desde 23/08**.

### 4.2 Decisões de arquitetura e o porquê

- **`salon_id` fixado por expressão em todas as 12 Supabase Tools, nunca `$fromAI`** — o modelo não escolhe o tenant nem alucinando; `Cancelar Agendamento`/`Confirmar Presenca` ainda exigem `client_id` + `status='agendado'`.
- **Regras de negócio moram em views SQL, não nos nós** (`avaliacoes_a_pedir`, `vencimentos_a_avisar`, `salons_atendendo`…) — gating de plano/template/tolerância num lugar só.
- **Ordem marcar×enviar escolhida por janela, com justificativa em sticky**: ciclos de 10 min marcam ANTES (reenvio bombardearia); ciclos lentos marcam DEPOIS (perda seria pior).
- **Debounce de rajada** (Wait 15s + `ultima_mensagem_recebida` + `Ainda E a Ultima?`) — rajada vira uma resposta.
- **Anti-alucinação com defeito real documentado** (`Formatar para WhatsApp` valida listas contra catálogo/barbeiros reais — cicatriz do barbeiro "Rafael" inventado em 23/08).
- **Política Meta respeitada**: conversa iniciada pelo sistema só por `sendTemplate` no número central; Evolution só responde quem falou primeiro.
- **Contrato `agent_paused`/`needs_human` com escritor único por direção**: n8n só escreve `true`; o front só zera pela edge `whatsapp`.
- **E-mails escapam HTML de terceiros**, com o motivo escrito no código.

### 4.3 Achados

| ID | Sev | Achado | Evidência-chave |
|---|---|---|---|
| N8N-C1 | CRÍTICO | Webhook do agente sem autenticação + ramo Evolution deriva `salon_id` de `instance.slice('salon-'.length)` sem validar no banco; URL divulgada em doc | nó `Webhook da Edge Function` `options:{}`; `Adaptar Payload (Provedor)` |
| N8N-A1 | ALTO | `body.contexto` do lembrete ("REMARQUE o existente") descartado — clique Reagendar gera **segundo agendamento** | 0 ocorrências de `body.contexto` no JSON do workflow vs `whatsapp-webhook/index.ts:329-341` |
| N8N-A2 | ALTO | Nenhum workflow tem `errorWorkflow`/alerta; retenção ~14 dias apaga a evidência | `settings` dos 13 workflows |
| N8N-A3 | ALTO | Zero execuções de produção no agente desde 23/08; URL registrada tem UUID, doc manda sem | `search_executions`; `n8n-cloud-api-entrada.md:87-89` |
| N8N-A4 | ALTO | `lembrete-resposta-central` sem auth envia `body.resposta` verbatim pelo número oficial p/ `body.contact_phone` | fluxo `DW0nq1Jyp9xeOJwm` |
| N8N-M1 | MÉDIO | Conversa é select→create sem upsert — corrida do cliente novo perde a mensagem (23505 mata antes de gravar) | `Criar Conversa Nova` sem `onError` |
| N8N-M2 | MÉDIO | Resposta gravada no CRM ANTES do envio; nó Evolution sem retry | wiring `Inserir Mensagem do Agente` → `Rotear Envio` |
| N8N-M3 | MÉDIO | Vídeo/documento viram texto vazio; ramo `Tipo Não Suportado` inalcançável | mapa `({audio,imagem})[tipo] ?? "conversation"` |
| N8N-M4 | MÉDIO | Tokens do próprio agente (gpt-4o-mini) não entram em `consumo_ia` — fatura por uso e export Aura subestimados | só `Registrar consumo (transcrição/visão)` existem |
| N8N-M5 | MÉDIO | 3 workflows com rascunho ≠ versão publicada (Detalhamento com cron incompleto no rascunho) | `versionId ≠ activeVersionId` |
| N8N-M6 | MÉDIO | Conversas de clientes retidas em claro nas execuções ~14 dias (LGPD), redaction off | `saveDataSuccessExecution:"all"` |
| N8N-M7 | MÉDIO | Export diário p/ Aura não verificável (`saveDataSuccessExecution:"none"`, nenhuma execução do cron 03:00 retida) | `UqLCK8lElBR7iSze` |
| N8N-B1 | BAIXO | Estoque dispara 12h, não 9h (compensação UTC desnecessária) | `triggerAtHour: 12` sem timezone |
| N8N-B2 | BAIXO | Docs divergentes (integração, cloud-api-entrada, política de atraso, descrição dos lembretes) | `03-n8n.md §B2` |
| N8N-B3 | BAIXO | Fim de Teste sem splitInBatches — falha no meio pode duplicar aviso | `Enviar Aviso` lote inteiro |
| N8N-B4 | BAIXO | Avaliação pode reenviar template se a RPC de marcação falhar | `onError: continueRegularOutput` |
| N8N-B5 | BAIXO | Limite dos popups contornável por sessionId; data tables sem expurgo | CORS `*`, `sessionId` do cliente |
| N8N-B6 | BAIXO | Credenciais duplicadas/órfãs; Fenié Pro (outro negócio) no mesmo projeto | `list_credentials` |
| N8N-B7 | BAIXO | Landing 2 sem modelo fixado no nó OpenRouter (default pode não ser `:free`) | `parameters` sem `model` |

**Bombas de tempo** (`03-n8n.md §4`): token Meta e número central únicos; templates aprovados **ligam envios sozinhos**; Gmail SMTP como canal transacional (~500/dia); consultas sem filtro que crescem com a base (Aura lê tabelas inteiras; Lembretes varre `appointments` de todos os salões a cada 10min); latência fixa 15s + `executionTimeout: 120`; um VPS para tudo, sem staging; segurança por URL nos 4 webhooks.

---

## 5. Componente Evolution (WhatsApp não-oficial)

### 5.1 Estado

VPS Hostinger `srv1833354.hstgr.cloud` (KVM 2), projeto compose `evolution-api-8lfe`: `evoapicloud/evolution-api:latest` (porta 8080 → `0.0.0.0:32770` **e** Traefik TLS), `postgres:15` e `redis` internos. Config: `DEL_INSTANCE=false`, `DATABASE_SAVE_DATA_*` true, `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true`, `CORS_ORIGIN='*'`. **1 linha em `whatsapp_connections`**: El Guardians, `instance_name=salon-4748d5b4-9184-4a70-add9-02c1dda88f12`, `provedor='evolution'`, **`status='close'`** — nenhuma instância conectada segundo o banco. Provisionamento pela edge `whatsapp` (`connect`/`status`/`disconnect`): `POST /instance/create` (`WHATSAPP-BAILEYS`) → `/settings/set` (`evolutionConfig.json`) → `/webhook/set` (URL = env `N8N_WEBHOOK_URL`, `webhookBase64:true`, eventos `MESSAGES_UPSERT`+`SEND_MESSAGE`) → `GET /instance/connect` (QR). **O único escritor de `whatsapp_connections.status` é a tela `/conexao`.** Envio: 2 nós no agente (`POST /message/sendText/{instance}`) **sem retry**; a edge `whatsapp` action `send` sempre usa Evolution, sem checar `provedor`. Zero execuções reais do ramo Evolution na história.

### 5.2 Decisões de arquitetura e o porquê

- **Modelo híbrido (decisão 2026-08-30)**: conversa sai pelo número REAL da barbearia via Evolution (custo zero/mensagem; banimento confinado ao número daquela barbearia); tudo que a plataforma inicia sai pelo remetente central da Cloud API com template. O risco do canal não-oficial fica confinado à conversa.
- **Contrato de nomes num módulo só e testado** (`_shared/instanceName.ts`: `salon-<uuid>` ↔ `salon_id`, valida UUID, devolve `null` em vez de palpite) — crítico porque o n8n grava com `service_role`.
- **Provisionamento idempotente com feedback**: settings+webhook reaplicados a cada connect, `webhookOk`/`settingsOk` devolvidos à tela; `groupsIgnore:true` impede resposta em grupo; `webhookBase64:true` é o que o ramo de mídia consome.
- **`conexoes_ativas` desacopla o vocabulário do provedor** (`evolution → status='open'`; `cloud_api → phone_number_id is not null`) — workflows leem a view, não a string da Evolution.
- **Alerta de queda por SQL + e-mail** (view `auditoria_operacao` ramo `whatsapp-caiu`, migration 0053): só alarma salão ativo que já trocou mensagem — alarme que sempre toca é ignorado; e o canal é e-mail para não sair pela coisa vigiada.
- **Persistência**: volumes nomeados, `DEL_INSTANCE=false`, `restart: unless-stopped`, backups semanais do VPS.

### 5.3 Achados

| ID | Sev | Achado | Evidência-chave |
|---|---|---|---|
| EV-01 | CRÍTICO | (= N8N-C1) Webhook sem auth + tenant por string, URL em repo público | `docs/n8n-cloud-api-entrada.md:89`; `backlog.md:1557-1558` |
| EV-02 | ALTO | Ninguém observa a conexão cair: sem `CONNECTION_UPDATE`, sem cron; status só muda quando o dono abre `/conexao`; o alerta `whatsapp-caiu` lê exatamente essa coluna → cego para o caso comum | `evolutionConfig.json:4`; `whatsapp/index.ts:170-207` |
| EV-03 | ALTO | Envio Evolution sem retry E histórico gravado antes do envio — CRM mostra resposta que o cliente não recebeu | dump dos nós; wiring |
| EV-04 | ALTO | Evolution e n8n em HTTP puro em `0.0.0.0:32770/32769`, sem firewall | compose; `VPS_getFirewallListV1` vazio |
| EV-05 | MÉDIO | No híbrido, o lembrete busca `phone_number_id` do salão (NULO) em vez do remetente central; e 25/25 templates em rascunho | fluxo `DW0nq1Jyp9xeOJwm`; SELECT `whatsapp_templates` |
| EV-06 | MÉDIO | Resposta do barbeiro pelo celular não pausa o agente (`fromMe` descartado; `SEND_MESSAGE` ignorado) — duas conversas paralelas | `Adaptar Payload (Provedor)` |
| EV-07 | MÉDIO | `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true` + `CORS_ORIGIN='*'` — vazou a chave global, vazam todos os tokens | compose |
| EV-08 | MÉDIO | Imagem `:latest` não pinada (recreate = upgrade silencioso de Baileys p/ todas as instâncias) | compose; `api` Up 4 days vs n8n 7 weeks |
| EV-09 | BAIXO | Edge `whatsapp` action `send` ignora `provedor` — quebra se alguém voltar a `cloud_api` | `whatsapp/index.ts:225` |
| EV-10 | BAIXO | Docs desatualizados pós-reseed (salon_id antigo, barbearias inexistentes) | `whatsapp-retomar.md:66-78` |

**Bombas de tempo** (`04-evolution.md §4`): RAM por instância Baileys (~1/barbearia, hoje 1,5/8 GB com zero conectadas, sem alerta de recurso); tudo num VPS só (o e-mail de queda depende do n8n que caiu junto); **instâncias órfãs do reseed provavelmente vivas no servidor com webhook apontado para produção**; deriva de config por instância (backfill manual); obrigações humanas da coexistência sem verificação; banimento sem detector próprio (aparece como… conexão caída, que ninguém vê — EV-02).

---

## 6. Componente Meta (WhatsApp Cloud API oficial)

### 6.1 Estado

WABA "Club Cut" `975811062135581`; número central `+55 41 98475-4172` (`phone_number_id` `1288009817732005`); App `1054189290929803` inscrito no webhook. Snapshot 2026-09-04: account_review APPROVED, business verified, quality GREEN, throughput STANDARD, **name_status DECLINED**, **1 template na Meta (`hello_world`) contra 25 rascunhos no Postgres**. Porta de entrada: edge `whatsapp-webhook` v12 (`verify_jwt=false`) — GET challenge com `WHATSAPP_VERIFY_TOKEN`; POST HMAC tempo constante com `WHATSAPP_APP_SECRET`; sempre 200; `field != 'messages'` → `eventos_da_waba` (**0 linhas hoje**); clique de botão no número central → RPCs `responder_lembrete`/`responder_avaliacao` por wamid → POST `N8N_LEMBRETE_RESPOSTA_URL`; texto solto no central é logado e descartado. `remetentes_oficiais`: 1 linha ativa. Execuções n8n verdes de fila vazia (fail-closed funcionando… por cima de canal morto).

### 6.2 Decisões de arquitetura e o porquê

- **Trava de template no banco, num lugar só**: todas as views de envio da 0115 filtram `status='aprovado'` — fail-closed; os workflows não reimplementam a checagem. Enquanto nada é aprovado, nada sai e nada é marcado.
- **Sempre-200 para a Meta é decisão consciente** — evita a Meta desativar o webhook do app inteiro por falhas repetidas; o erro vai para log.
- **Clique resolvido por wamid (`context.id`), nunca por texto** — impede cancelamento acidental por um "cancelar" digitado no meio da conversa, e não paga LLM por clique.
- **Alertas internos por e-mail, fora do canal pago** — template de texto arbitrário a Meta recusa.
- **Esqueleto de fragmentação por número já existe** (`salons.remetente_phone_number_id` + lateral join das views) — nota de qualidade e tier são por número; dá para dividir o risco quando houver um segundo número.

### 6.3 Achados

| ID | Sev | Achado | Evidência-chave |
|---|---|---|---|
| MT-01 | CRÍTICO | Nenhum dos 25 templates foi submetido à Meta — canal oficial inteiro mudo, com n8n rodando verde por cima | SELECT `whatsapp_templates` (25 rascunho, `categoria_meta` NULL) |
| MT-02 | ALTO | Lembretes busca `phone_number_id` da conexão do salão, não de `remetentes_oficiais` — nunca enviará no híbrido, mesmo com template aprovado (a 0115 desamarrou as outras filas, o lembrete ficou para trás) | nó `Buscar Instância do Salão` |
| MT-03 | ALTO | Monitor de qualidade da WABA cego: `eventos_da_waba` = 0; campos `phone_number_quality_update`/`account_update` não assinados no painel | `backlog.md:1608-1610` |
| MT-04 | MÉDIO | Resposta digitada ao lembrete no número central é descartada — cliente que digita "sim" fica no vácuo | `index.ts:270-274` |
| MT-05 | MÉDIO | Eventos `statuses` (entregue/lido/falhou) descartados — template aceito-mas-não-entregue registrado como enviado | `index.ts:199,280` |
| MT-06 | MÉDIO | Views `clientes_para_reativar`/`clientes_para_avisar_retorno` sem consumidor no n8n — reativação "vendida como entregue" não envia nada | inspeção dos 13 workflows |
| MT-07 | MÉDIO | `templates-para-a-meta.md` desatualizado: falta `avaliacao_pos_atendimento` (o único usado por workflow ativo) e as chaves reais | doc 24 vs banco 25 |
| MT-08 | BAIXO | Todo evento em `eventos_da_waba` vira alerta 'grave' independente do campo | 0116:97-103 |
| MT-09 | BAIXO | Falha ao marcar avaliação pedida → reenvio a cada 30 min | `onError: continueRegularOutput` |
| MT-10 | BAIXO | `whatsapp-api-oficial.md` descreve a arquitetura abandonada sem faixa de obsolescência | seções 3-5 vs 0115 |

**Bombas de tempo** (`05-meta.md §4`): 01/10/2026 fim da gratuidade (tarifas BR não confirmadas); número central único para todas as barbearias com monitor cego; `verify_jwt` da `whatsapp-webhook` vive só no painel (redeploy com default `true` = Meta desativa o webhook do app); rotação errada do `WHATSAPP_APP_SECRET` silencia tudo sem alerta; name_status DECLINED aumenta denúncia; recategorização p/ marketing multiplica custo ~9x.

---

## 7. Componente Asaas (cobrança)

### 7.1 Estado

**O modelo de assinatura/troca de plano morreu em 24-25/08** (`0110_aposenta_plans.sql`); vigente é **cobrança por uso**: R$/agendamento de `origem='agente'` por faixa de barbeiros (`faixas_de_uso`: R$ 0,75 até 3, caindo a R$ 0,60), fechamento mensal no banco (`fechamento-mensal-de-uso`, `0 9 1 * *`), boleto avulso via edge `cobrar-uso` (v4, `billingType:'UNDEFINED'`, `dueDate=hoje+7`, mínimo R$ 5, `externalReference = salon_id` ou `rede:<orgId>`), entrega por e-mail via workflow `8Qh33uoFm4VqT1eO`, baixa via `asaas-webhook` (v21, idempotência por `asaas_eventos`), bloqueio via `situacao_do_acesso` + cron `estende-acesso-sem-debito` (quem não deve não bloqueia), tolerância de 3 dias no WhatsApp. **As 3 funções deployadas = repo (único componente sem drift confirmado).** Produção zerada em 03/09; hoje 1 assinatura `trial` (El Guardians, `acesso_ate=2026-09-11`), 0 faturas, 0 eventos.

### 7.2 Decisões de arquitetura e o porquê

- **Idempotência real do webhook**: PK no `id` do evento em `asaas_eventos`; INSERT é a trava (23505 = "já tratei"); efeito falhou → destrava para a reentrega at-least-once do Asaas funcionar.
- **Evento desconhecido devolve 200** — 15 falhas seguidas pausam a fila do Asaas e silenciariam as confirmações.
- **Período pago conta do vencimento, não do dia do pagamento**; **atraso não mexe em datas** (só `status`) — separação entre estado informativo e estado que tranca.
- **Dupla trava de escrita em `subscriptions` aplicada em produção**: policy por linha + grant por coluna restrito a `cpf_cnpj` — o dono não se dá `acesso_ate='2099'`.
- **`cobrar-uso` idempotente com compensação**: só fatura sem `asaas_payment_id`; gravação falhou → DELETE da cobrança criada; **sem fallback de URL** ("sandbox silencioso em produção é pior que falhar" — comentário no código).
- **Cadeia 0130 anti-cobrança-dupla/bloqueio-injusto** com teste pgTAP e os 2 crons confirmados ativos.
- **Cancelamento aborta se o Asaas recusar** a remoção da recorrência legada — evita "cancelada no banco, cobrando no Asaas".

### 7.3 Achados

| ID | Sev | Achado | Evidência-chave |
|---|---|---|---|
| AS-01 | ALTO | Recorrências/customers órfãos no Asaas pós-reseed, inalcançáveis pelo sistema (El Guardians R$ 5/mês; `sub_klx4z6d0xv9p83h4`; `cus_000192278757`/`cus_000194207151`) — podem cobrar dinheiro real todo mês | `backlog.md:351-375, 2043` vs SELECT (`asaas_subscription_id` NULO) |
| AS-02 | ALTO | Inadimplência não fala com ninguém: OVERDUE só marca status; sem dunning; customer criado sem e-mail (nem o Asaas notifica) | `cobrar-uso/index.ts:173-176` |
| AS-03 | MÉDIO | Fallback silencioso p/ sandbox em `asaas` e `asaas-webhook` (pior caso: 404 do sandbox tratado como sucesso → "cancelou" e a produção segue cobrando) | `asaas/index.ts:31,53` |
| AS-04 | MÉDIO | OVERDUE fora de ordem marca conta paga como "atrasada" na tela | `asaas-webhook/index.ts:210,256` |
| AS-05 | MÉDIO | Nota do nó "Gerar Boletos" mente ("token anon basta") e o nó engole 401 — modo de falha "nenhuma cobrança nasce, tudo verde" armado | vs `cobrar-uso/index.ts:70-81` |
| AS-06 | MÉDIO | Promessa "boleto, Pix ou cartão" com Pix/boleto bloqueados na conta | `estado-do-projeto.md:48-49` |
| AS-07 | MÉDIO | Docs oficiais descrevem o modelo morto e um conserto que não funciona mais | `estado-do-projeto.md:25-26` |
| AS-08 | BAIXO | `ajustarRecorrencia` é código morto no webhook (e o único ponto que ainda falaria com a API com o fallback sandbox) | `asaas-webhook/index.ts:48-63` |
| AS-09 | BAIXO | `somarUmMes` estoura fim de mês (rollover JS: 31/01 + 1 mês = 03/03) — 1–3 dias grátis | `asaas-webhook/index.ts:36-40` |
| AS-10 | BAIXO | Comparação do token do webhook com `!==` (não constante) | `asaas-webhook/index.ts:78` |

**Bombas de tempo** (`06-asaas.md §4`): corrida no `cobrar-uso` (duas execuções → boleto duplo com órfã pagável); acesso de todo pagante em dia pendurado num cron diário sem monitor; relógios SP vs UTC divergem na virada do dia; `email_do_dono` escolhe um dono só; zerar banco não zera o Asaas; cauda de micro-uso < R$ 5 permanentemente grátis sem medição; e-mail Gmail como canal único; cobrança manual no painel com `externalReference` de salão dá mês de acesso.

---

## 8. Componente Vercel + Hostinger (hospedagem, domínio, VPS)

### 8.1 Estado

**Vercel:** time hobby, projeto `clubcut` (`prj_i51uHJBL2A4fxmSn44iEmTJ0o59Q`), framework vite, Node 24.x, deploy automático por push em `main` do repo **público** `Saymon0123/Clinica`. Últimos 20 deploys: 19 READY, 1 ERROR (typecheck — a produção anterior continuou servindo). Vercel Authentication ligada (`all_except_custom_domains`). Domínios: `clubcut.space` (canônico, 200, HSTS, `gru1`), `www` 308 → apex, **e dois legados servindo o app completo com 200**: `clubcut.vercel.app`, `clinica-crm-kappa.vercel.app`. `vercel.json` legado (`routes`), sem headers. Runtime sem erros (100% estático). Web Analytics desligado.

**Hostinger:** domínio `clubcut.space` registrado 2026-09-04 (expira 2027-09-04, WHOIS privacy + lock, NS `atlas`/`hyperion.dns-parking.com`); zona com A `@` → Vercel, CNAME `www`, MX/SPF/DKIM completos, **DMARC `p=none`**; 2 snapshots de zona. VPS KVM 2 (`srv1833354`, 2 vCPU/8 GB/100 GB/8 TB), CPU ~0,7%, RAM ~19%, uptime ~51 dias, **sem firewall**; backups semanais (27/08 e 03/09, restore nunca ensaiado), **zero snapshots manuais**. Mailbox `contato@clubcut.space` ativa (2 mensagens, sem papel operacional ainda). 3 assinaturas com auto-renew e cartão válido: KVM 2 R$ 108,99/mês (renova **16/09**), e-mail R$ 11,99/mês, domínio R$ 182,08/ano.

### 8.2 Decisões de arquitetura e o porquê

- **Build gate por typecheck** (`tsc -b && vite build`): erro de tipo derruba o deploy, não a produção — comprovado no ERROR de 03/09.
- **Previews atrás de Vercel Authentication** — para um CRM multi-tenant com dados reais, nenhuma URL gerada é pública.
- **Front 100% estático na Vercel; toda a lógica no Supabase** — zero runtime serverless para operar.
- **DNS na Hostinger com snapshots de zona** — restauração possível da edição de 04/09.
- **Auto-renew + cartão válido nas 3 assinaturas** — o clássico "domínio expirou em silêncio" coberto no nível do painel.

### 8.3 Achados

| ID | Sev | Achado | Evidência-chave |
|---|---|---|---|
| VC-01 | ALTO | Assets com hash servidos com `Cache-Control: max-age=0, must-revalidate` — cada visita revalida ~100 arquivos | curl -I no bundle; `vercel.json` legado |
| VC-02 | ALTO | Nenhum header de segurança além de HSTS (sem CSP, X-Frame-Options, nosniff, Referrer-Policy) — clickjacking e XSS sem segunda linha; `routes` legado bloqueia adicionar `headers` | curl -I nos 4 domínios |
| VC-03 | MÉDIO | Dois domínios legados servem o app completo sem redirect — 3 origens públicas permanentes | curl -I |
| VC-04 | MÉDIO | `estado-do-projeto.md` diz que o domínio próprio não existe; existe desde 04/09 | vs `get_project → domains` |
| VC-05 | MÉDIO | Env vars do painel não conferíveis; `VITE_APP_URL`/`VITE_AGENTE_IA_URL` têm fallback silencioso | `07-vercel.md §3.5` |
| VC-06 | BAIXO | Web Analytics desligado com meta declarada de "medir ativação/retenção" | `get_web_analytics → 400` |
| HG-01 | CRÍTICO | VPS sem firewall nenhum; n8n `:32769` e Evolution `:32770` em `0.0.0.0`, HTTP puro, fora do Traefik | `firewall_group_id: null`; lista de firewalls vazia |
| HG-02 | ALTO | Zero snapshots manuais; backup só semanal, restore jamais testado — janela de perda de até 7 dias p/ workflows editados quase diariamente | `VPS_getSnapshotV1` zerado |
| HG-03 | MÉDIO | DMARC `p=none` — qualquer um envia como `@clubcut.space`; e o plano é migrar o remetente dos convites para lá | TXT `_dmarc` |
| HG-04 | MÉDIO | Docs desencontrados sobre o estado do domínio (inclusive dentro do próprio backlog) | `08-hostinger.md §3` |
| HG-05 | BAIXO | `clubcut.com.br` livre para terceiros (decisão de negócio registrada) | `domains_getDomainListV1` |
| HG-06 | BAIXO | Método de pagamento secundário (NuPay) expirado; redundância de pagamento zero | `billing_getPaymentMethodListV1` |

**Bombas de tempo** (`07-vercel.md §4`, `08-hostinger.md §4`): **plano Hobby da Vercel é pessoal/não-comercial servindo um SaaS cobrado** (risco de suspensão + teto de 100 GB/mês); **deploy de produção não é gateado pelo CI** — vitest e pgTAP vermelhos chegam em produção (só o typecheck bloqueia; o commit `21f359b` documenta o buraco); repo público expõe mensagens de commit com regras de cobrança e incidentes; renovação do VPS em 16/09 é a primeira cobrança relevante e toda a mensageria mora lá; custo Hostinger ≈ R$ 1.634/ano; reputação do `.space` no e-mail; trava de 60 dias do domínio até 03/11.

---

## 9. Integração — a cadeia completa

Síntese do `90-integracao.md`. A regra de leitura: **as bordas externas autenticam bem (HMAC Meta, token Asaas, JWT no CRM); os elos internos confiam no segredo do path; e o banco registra intenções e as exibe como fatos** (padrões P1–P6).

### 9.1 Cadeia da mensagem (Fluxo B — o produto)

```
Cliente → WhatsApp → [Evolution Baileys | Meta Cloud API]
  Evolution: POST direto no n8n, SEM auth, payload nativo {event, instance:'salon-<uuid>', data:{key,message}}
  Meta:      edge whatsapp-webhook (HMAC constante, sempre-200) → POST N8N_WHATSAPP_WEBHOOK_URL
             {salon_id, phone_number_id, waba_id, contact_phone, contact_name, message_id,
              texto, media_id, tipo, contexto}          ← 'contexto' é DESCARTADO pelo n8n (N8N-A1)
→ n8n rJO1n7cFeNDIJyB5:
  Adaptar Payload → tenant: Cloud pelo banco (whatsapp_connections.phone_number_id) /
                            Evolution por instance.slice() SEM validar (N8N-C1)
  → gate salons_atendendo (bloqueada = silêncio absoluto ao cliente)
  → Buscar/Criar Conversa (select→create, corrida N8N-M1) → Inserir Mensagem (in)
  → debounce 15s → agent_paused? → mídia (áudio whisper-1 / imagem visão → consumo_ia;
    vídeo/documento viram texto vazio, N8N-M3)
  → Agente gpt-4o-mini + 12 tools com salon_id fixado (tokens NÃO medidos, N8N-M4)
  → Formatar para WhatsApp (valida contra catálogo)
  → Inserir Mensagem (out) ANTES do envio → Rotear Envio:
      Cloud: retry 3×, stopWorkflow  /  Evolution: sendText SEM retry (EV-03)
→ CRM: Realtime whatsapp_conversations/whatsapp_messages (filtro salon_id) → aba /web
  needs_human/agent_paused: n8n só escreve true; front zera pela edge whatsapp
  resposta manual do dono: edge whatsapp {action:'send'} → SEMPRE Evolution (EV-09),
  envia→grava (ordem certa) → agent_paused=true
  barbeiro respondendo pelo celular: INVISÍVEL (fromMe descartado, EV-06)
```

**Estado operacional: 0% — nada entra desde 23/08** (B1) e o ramo Evolution nunca executou.

### 9.2 Cadeia do onboarding (Fluxo A)

Três portas convergentes — self-service (`/criar-conta` → signUp Auth → edge `criar-minha-barbearia`, trial 7d), presencial (`/admin/nova-barbearia` + `x-admin-secret` → `admin-create-salon`, rollback completo), convite (`admin-invite-salon` → view `convites_a_enviar` → cron n8n 10min → Gmail → `/convite/<token>` → `accept-invite`, trial começa no aceite) — todas gravando com `service_role`: `salons` → `user_salons` → `subscriptions` → `professionals`/`professional_schedules` → `services`/`professional_services` → `termos_aceites`. Depois: `/conexao` → edge `whatsapp {connect}` → 4 chamadas Evolution → QR 40s → upsert `whatsapp_connections`. O elo final (webhook → n8n → primeiro atendimento) é o descrito em 9.1 — e é onde a corrente abre (A1–A4). O segredo `N8N_WEBHOOK_URL` é carimbado **em toda instância nova** no connect: valor errado = todo onboarding termina "conectado e mudo" com a tela dizendo `webhookOk: true`.

### 9.3 Cadeia do agendamento e lembrete (Fluxo C)

Criação por 3 portas (CRM via `garantir_cliente` + INSERT + `definir_servicos_do_agendamento`; agente via tool; agenda pública via edge) → **todas desaguam nas mesmas travas do banco** (exclusões + folga). Lembrete: cron n8n 10min varre `appointments` de todos os salões → janela 85–100min → gate 1 template `lembrete_hoje` aprovado (**nenhum é**) → gate 2 `phone_number_id` da conexão do salão (**NULO no híbrido** — deveria ser `remetentes_oficiais`) → marca ANTES → `sendTemplate` → wamid em `appointments.lembrete_message_id`. Confirmação: clique → Meta → edge → `responder_lembrete(wamid, botão)` (idempotente, 0086) → resposta pronta via `N8N_LEMBRETE_RESPOSTA_URL` → n8n → Cloud API. Quebras: Reagendar duplica agendamento (contexto descartado); "sim" digitado é jogado fora; `statuses` descartados (enviado ≠ entregue); a coluna `lembrete_enviado` nasceu de migration sem arquivo no repo.

### 9.4 Cadeia da cobrança (Fluxo D)

`origem='agente'` → pg_cron `fechamento-mensal-de-uso` (dia 1º) → `fechar_mes_de_uso()`/`gerar_fatura_de_uso()` → `faturas_de_uso` → cron horário n8n (único chamador) → `POST /functions/v1/cobrar-uso` (Bearer service key) → `POST /v3/customers` (**sem e-mail**) + `POST /v3/payments` → e-mail de boleto via Gmail → pagamento → `POST /functions/v1/asaas-webhook` (`asaas-access-token`) → `asaas_eventos` (idempotência) → `faturas_de_uso.paga_em` + `subscriptions.acesso_ate = dueDate+1mês` (+3d atendimento) → cron diário `estende-acesso-sem-debito` mantém quem não deve → RPC `situacao_do_acesso` → `AppLayout` bloqueia tudo menos `/assinatura`. O melhor código do sistema, 0 ciclos reais, e a fronteira externa suja (órfãos — AS-01).

### 9.5 Cadeia do deploy (Fluxo E)

GitHub `main` (repo público) → **Vercel: automático com gate de typecheck (única peça com pipeline de verdade)**; → Supabase: migrations e edges **à mão**, com drift nos dois sentidos e `verify_jwt` vivendo só no painel; → n8n: **edição ao vivo em produção**, sem export, sem staging, 3 rascunhos divergindo; → VPS/Evolution: compose no painel, imagem `:latest`. Identidade do produto em 4 fontes divergentes (2 domínios legados vivos + canonical velho no `index.html` + fallback `APP_URL` velho + hardcode novo no nó do n8n). Backup: zero para o banco, semanal nunca testado para o VPS, nenhum para os workflows. Conclusão do relatório: **o sistema roda, mas não é reconstruível**.

### 9.6 SPOFs que atravessam tudo

Sem isolamento de infraestrutura entre tenants em nenhuma linha — o multi-tenant vive só na camada de dados (RLS), que é a parte bem-feita. Os transversais: projeto Supabase sem backup; VPS único (n8n + Evolution + Traefik + o próprio alarme); n8n como instância/workflow único sem error workflow; secrets `N8N_*_URL` (indício de erro hoje); número central Meta + `whatsapp_templates`; `WHATSAPP_APP_SECRET`; pg_cron sem monitor; conta Asaas + token do webhook; Gmail pessoal; `ADMIN_TOOL_SECRET`; credencial OpenAI única; cartão Hostinger (renovação 16/09); GitHub main sem gate; **o dono (bus factor 1)**.

---

## 10. Backlog priorizado

Esforço: **XS** ≤30min · **S** ≤2h · **M** ½–1 dia · **L** 1–3 dias · **XL** >3 dias. Ordem = prioridade. P0 = piso para conectar a primeira barbearia real (itens 1–5 do caminho mínimo da integração); P1 = antes de prometer lembrete/cobrança; P2 = dívidas que não bloqueiam o go-live imediato.

### P0 — piso para a primeira barbearia real

| ID | Sev | Componente | O que fazer | Esforço | Dependências |
|---|---|---|---|---|---|
| BL-01 | CRÍTICO | n8n/Evolution/Supabase | **Decidir A1/B1**: parear o QR da El Guardians, mandar 1 mensagem real; se morrer, conferir secrets `N8N_WEBHOOK_URL`/`N8N_WHATSAPP_WEBHOOK_URL` contra o URL do triggerInfo (com UUID) e reaplicar webhook (`scripts/evolution-aplicar-config.mjs`) | S | — |
| BL-02 | CRÍTICO | Supabase | Backup: upgrade p/ plano com backup diário OU `pg_dump` agendado p/ storage externo, **com restore ensaiado e documentado** | M | — |
| BL-03 | ALTO | Asaas | Inventário no painel: cancelar/arquivar recorrências e customers sem espelho no banco (`sub_klx4z6d0xv9p83h4`, El Guardians R$5, `cus_000192278757/194207151`); registrar a regra "zerar banco = zerar Asaas"; conferir config do webhook (URL, token, fila pausada?) | S | — |
| BL-04 | CRÍTICO | Hostinger/VPS | Firewall no painel (só 80/443 + 22 restrito); remover publish `0.0.0.0` de 32769/32770 dos composes (Traefik alcança pela rede Docker); desligar `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES`; restringir `CORS_ORIGIN` | S | BL-05 antes (snapshot) |
| BL-05 | ALTO | Hostinger/n8n | Snapshot manual da VM + exportar os 13 workflows do n8n para o repositório | XS | — |
| BL-06 | CRÍTICO | n8n | Autenticar os webhooks: header secreto conferido no nó em `salao-atendimento` e `lembrete-resposta-central` (enviado pela edge e pelo `/webhook/set` da Evolution); no ramo Evolution, validar `instance_name` contra `whatsapp_connections` antes de agir; remover URLs dos docs (ou fechar o repo) | M | BL-01 |
| BL-07 | ALTO | n8n | Error workflow único (e-mail via `canal_de_alertas`) + `errorWorkflow` em todos os ativos + alerta de silêncio ("zero mensagens em X horas") — transforma todos os modos de falha mudos em avisos | M | — |
| BL-08 | ALTO | Evolution | Observar a conexão: assinar `CONNECTION_UPDATE` e tratar o evento atualizando `whatsapp_connections.status`, OU job periódico chamando `connectionState` das instâncias `provedor='evolution'` | M | BL-06 |
| BL-09 | MÉDIO | Evolution | Inventariar instâncias no servidor (`GET /instance/fetchInstances` ou script `--dry-run`) e remover órfãs do reseed | XS | — |

### P1 — antes de prometer lembrete e cobrança

| ID | Sev | Componente | O que fazer | Esforço | Dependências |
|---|---|---|---|---|---|
| BL-10 | ALTO | n8n/Meta | Consertar o lembrete ANTES de submeter templates: fonte do `phone_number_id` → `remetentes_oficiais` (padrão 0115); mapear/propagar `body.contexto` até o prompt do agente (`[CONTEXTO INTERNO]`) | M | — |
| BL-11 | CRÍTICO | Meta | Submeter `lembrete_hoje` **primeiro e sozinho**; registrar `status`/`categoria_meta` no banco; assinar `phone_number_quality_update`, `account_update` e `message_template_status_update` no painel do app; depois o lote — com rito de teste controlado por template (aprovação liga envios sozinhos) | M | BL-10 |
| BL-12 | ALTO | Asaas | Ensaiar o ciclo de cobrança com caso controlado antes de 01/10 (fatura → boleto → e-mail → pagamento → webhook → extensão); incluir `email` do dono no `POST /v3/customers` | M | BL-03 |
| BL-13 | ALTO | Supabase | Estancar o drift: migration de sincronização a partir do diff real; registrar as manuais; regra "nada em produção sem arquivo no repo"; trazer `admin-metricas` p/ o repo (com comparação constante + rate limit); declarar `verify_jwt` de todas as edges no `config.toml` | L | — |
| BL-14 | ALTO | n8n | Conversa: trocar select→create por upsert (`Prefer: resolution=merge-duplicates`, `on_conflict=salon_id,contact_phone`) ou `onError`+re-busca | S | — |
| BL-15 | ALTO | n8n/Evolution | Inverter ordem gravar/enviar (ou status de entrega na linha); `retryOnFail` nos nós Evolution espelhando os nós Cloud | S | — |
| BL-16 | ALTO | n8n/Evolution | Tratar `fromMe`/`SEND_MESSAGE`: marcar `agent_paused` e registrar a mensagem manual do barbeiro | M | BL-06 |
| BL-17 | MÉDIO | Asaas | Remover fallback sandbox de `asaas` e `asaas-webhook` (padrão do `cobrar-uso`: falhar alto); apagar `ajustarRecorrencia` morto | XS | — |
| BL-18 | MÉDIO | Asaas | OVERDUE fora de ordem: ignorar se `paga_em` preenchido ou evento PAGOU do mesmo `payment.id` já registrado | S | — |
| BL-19 | MÉDIO | Asaas/n8n | Corrigir a nota do nó "Gerar Boletos"; confirmar credencial (service key) no editor; alertar quando `cobrar-uso` responder ≠200; dunning mínimo ("boleto vencido há N dias" sobre `faturas_de_uso`) | M | BL-07 |
| BL-20 | MÉDIO | Asaas | Ajustar textos "boleto, Pix ou cartão" → "cartão (Pix e boleto em breve)" enquanto a conta não liberar | XS | — |
| BL-21 | MÉDIO | Meta | Resposta automática fixa a texto digitado no número central (aponta wa.me da barbearia; a mensagem do cliente abre janela de 24h); gravar `status=failed` por wamid dos `statuses` | M | BL-11 |
| BL-22 | MÉDIO | Meta/n8n | Criar o workflow de reativação consumindo `clientes_para_reativar`/`clientes_para_avisar_retorno` (moldes da Avaliação, marca depois) — hoje as views não têm consumidor | M | BL-11 |
| BL-23 | MÉDIO | n8n | Vídeo/documento → `message_type` próprio caindo em `Tipo Não Suportado`; medir tokens do agente em `consumo_ia` (ou documentar medição parcial) | M | — |
| BL-24 | MÉDIO | Vercel | Migrar `vercel.json` p/ `rewrites` + `headers`: cache `immutable` em `/assets/`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`; CSP em Report-Only como passo 2; redirect 308 dos 2 domínios legados; corrigir canonical/og do `index.html` | M | — |
| BL-25 | ALTO | Vercel | Sair do plano Hobby (uso comercial) → Pro; avaliar gate do deploy pelo CI ("Ignored Build Step" condicionado / deploy por branch + promoção) | S + decisão | — |

### P2 — dívidas que não bloqueiam o go-live imediato

| ID | Sev | Componente | O que fazer | Esforço | Dependências |
|---|---|---|---|---|---|
| BL-26 | ALTO | CRM | Ligar `strict: true` (mínimo `strictNullChecks`) e corrigir por módulo, começando por `lib/` e `features/auth` | L | — |
| BL-27 | ALTO | CRM/Supabase | Mover o fechamento de venda para RPC transacional `registrar_venda` (o estorno já é RPC) | L | — |
| BL-28 | MÉDIO | CRM | Admin: papel de usuário autenticado (claim/tabela de admins checada na edge) no lugar do `x-admin-secret`; no mínimo, segredo só em memória | M–L | — |
| BL-29 | MÉDIO | Supabase | `REVOKE TRUNCATE, REFERENCES, TRIGGER … FROM anon, authenticated` + default privileges; revogar EXECUTE das funções de trigger/cron expostas; ligar leaked password protection; `search_path` nas 3 funções `private` + padronizar `pg_temp` nas 4 de policy | S | — |
| BL-30 | MÉDIO | Supabase | Índices nas FKs quentes (`services(salon_id)`, `professionals(salon_id)`, `products(salon_id)`, `professional_schedules(professional_id)` primeiro); consolidar policies permissivas por comando + `(select …)` initplan | M | — |
| BL-31 | MÉDIO | Supabase | `admin-create-salon`/`admin-invite-salon`: trocar `auth.admin.listUsers()` por `getUserByEmail`/RPC (o `accept-invite` já faz certo) — quebra em ~50 contas | S | — |
| BL-32 | MÉDIO | n8n | Publicar/descartar os 3 rascunhos divergentes; redaction/salvar-só-erros no fluxo principal (LGPD); salvar sucessos do export Aura (1/dia); fixar modelo `:free` no Landing 2; renomear credenciais genéricas, apagar órfãs; separar Fenié em projeto próprio | M | — |
| BL-33 | MÉDIO | Evolution | Pinar a tag da imagem (v2.3.7 homologada no `evolutionConfig.json`); rotear `send` da edge por `provedor` (ou bloquear com mensagem clara) | S | — |
| BL-34 | MÉDIO | Hostinger | DMARC: adicionar `rua=`, observar, subir p/ `p=quarantine` ANTES de migrar o remetente para `contato@clubcut.space` | XS + espera | — |
| BL-35 | MÉDIO | n8n/infra | Tirar o transacional do Gmail pessoal: migrar remetente para `contato@clubcut.space` (após BL-34) ou provedor transacional; boleto é o primeiro que cai em spam | M | BL-34 |
| BL-36 | MÉDIO | Docs | Passe único de atualização: `estado-do-projeto.md` (banco re-semeado, domínio no ar, modelo por uso, balcão), `n8n-integration.md`, `n8n-cloud-api-entrada.md`, `whatsapp-api-oficial.md` (faixa de obsolescência), `templates-para-a-meta.md` (regenerar da tabela), `whatsapp-retomar.md` | M | decisões BL-01/06 |
| BL-37 | BAIXO | CRM | `/equipe` sob `RequireManager`; checar `error` do troco no caixa; remover `@tanstack/react-query`; redirect de `/login` logado | S | — |
| BL-38 | BAIXO | n8n | `triggerAtHour: 9` no estoque; splitInBatches no Fim de Teste; limite por IP + expurgo nas data tables dos popups | S | — |
| BL-39 | BAIXO | Asaas | Comparação constante no token do webhook; clamp do `somarUmMes`; lock `FOR UPDATE SKIP LOCKED` no `cobrar-uso` | S | — |
| BL-40 | BAIXO | Supabase | Monitor de pg_cron (os 7 jobs — `estende-acesso-sem-debito` bloqueia pagante em dia se parar); limpeza de `controle_de_taxa`; mover `btree_gist` p/ `extensions` em janela de manutenção | M | BL-07 |
| BL-41 | BAIXO | Infra | Monitor externo ao VPS (o alarme atual mora na coisa vigiada); procedimento escrito de rotação para as ~35 credenciais | M | — |

---

## 11. Plano de testes manual — para o desenvolvedor

Ordem pensada: T1–T2 destravam tudo; T3–T9 validam o atendimento; T10–T12 o agendamento; T13–T16 a cobrança; T17–T19 onboarding; T20–T22 infra. Testes marcados **(pós-fix)** só fazem sentido depois do backlog indicado; os marcados **(prova de defeito)** servem para confirmar o achado antes de corrigir.

**T1 — Parear o QR da El Guardians.**
Entrada: login como dono da El Guardians → `/conexao` → Conectar.
Esperado: QR em ≤5s, validade 40s; após escanear, polling leva `status` a `open`.
Passou se: `SELECT status, updated_at FROM whatsapp_connections WHERE salon_id='4748d5b4-9184-4a70-add9-02c1dda88f12'` → `open` com `updated_at` de agora, e a tela mostra conectado com `webhookOk: true` e `settingsOk: true`.

**T2 — Mensagem de texto real (decide A1/B1 — o teste mais importante da auditoria).**
Entrada: de um celular terceiro, enviar "oi, quero marcar um corte" ao número pareado.
Esperado: execução por **webhook** no workflow `rJO1n7cFeNDIJyB5` (não manual); resposta do agente no WhatsApp em ~20–40s (15s de debounce inclusos).
Passou se: (a) o n8n mostra execução webhook de agora; (b) `whatsapp_conversations` ganhou a linha do contato e `whatsapp_messages` tem `direction='in'` + `direction='out'`; (c) a resposta chegou no celular. **Se falhar:** conferir secret `N8N_WEBHOOK_URL` vs URL do triggerInfo (com UUID) — é o cenário previsto pelo A1; corrigir e reaplicar `scripts/evolution-aplicar-config.mjs`.

**T3 — Rajada (debounce).**
Entrada: 3 mensagens em ~5s ("oi" / "tem horário amanhã?" / "de manhã").
Esperado: **uma** resposta só, considerando a última.
Passou se: 1 mensagem `out` para as 3 `in`; execuções intermediárias terminam no noOp de `Ainda E a Ultima?`.

**T4 — Áudio e imagem.**
Entrada: um áudio de voz ("quero marcar sábado") e uma foto qualquer.
Esperado: transcrição/descrição alimentam a resposta.
Passou se: resposta coerente com o conteúdo, e `SELECT * FROM consumo_ia ORDER BY criado_em DESC` tem linhas `transcricao` e `visao` com `execucao_n8n` preenchido. **Nota:** primeiro exercício real do ramo de mídia Evolution na história (`04-evolution.md §6`).

**T5 — Vídeo (prova de defeito N8N-M3).**
Entrada: enviar um vídeo curto.
Esperado hoje: o agente responde confusão (recebe texto vazio) — confirma o achado. Pós-fix (BL-23): resposta fixa "só entendo texto ou áudio".
Passou (pós-fix) se: a resposta padrão chega e nenhuma chamada de LLM ocorre para o vídeo.

**T6 — Chamar o dono / retomar agente.**
Entrada: cliente escreve algo que força a tool `Chamar o Dono` (ex.: "quero falar com uma pessoa"); depois o dono responde pela aba `/web` e clica devolver ao agente.
Esperado: `needs_human=true` + `agent_paused=true` + `resumo_contexto` preenchido; agente calado enquanto pausado; resposta manual chega ao cliente; `resume_agent` zera os dois flags.
Passou se: flags conferidos por SELECT em `whatsapp_conversations` a cada etapa, e a mensagem manual foi entregue (a edge grava **depois** de enviar — se aparecer no CRM, foi).

**T7 — Barbeiro responde pelo celular (prova de defeito EV-06).**
Entrada: com uma conversa ativa, responder ao cliente **pelo app WhatsApp do celular pareado**; o cliente manda outra mensagem.
Esperado hoje: o agente responde por cima (a resposta manual é invisível — `fromMe` descartado) — confirma o achado. Pós-fix (BL-16): `agent_paused=true` e a mensagem manual registrada.
Passou (pós-fix) se: `agent_paused` ligou sozinho e a mensagem do barbeiro está em `whatsapp_messages`.

**T8 — Injeção forjada no webhook (prova de defeito N8N-C1; pós-fix BL-06 vira teste de segurança).**
Entrada: `curl -X POST <URL do webhook salao-atendimento>` com payload Evolution mínimo (`event: messages.upsert`, `instance: salon-4748d5b4-...`, `data.key.remoteJid` de um telefone seu).
Esperado hoje: a execução roda e grava no tenant — confirma o CRÍTICO. Pós-fix: **4xx sem execução** (header ausente) e, com header certo mas `instance` inexistente, término em nó de rejeição sem gravar nada.
Passou (pós-fix) se: nenhuma linha nova em `whatsapp_conversations`/`whatsapp_messages` e nenhum envio ocorreu.

**T9 — Agendamento pelo agente + conflito.**
Entrada: pedir ao agente um horário livre e confirmar; depois, noutra conversa/cliente, pedir **o mesmo horário com o mesmo profissional**.
Esperado: primeiro cria (`origem='agente'`, `status='agendado'`); segundo bate na exclusão `appointments_sem_sobreposicao` (23P01) e o agente oferece alternativa (comportamento nunca observado — registrar o que ele faz).
Passou se: 1 linha só em `appointments` para o horário, e a segunda conversa não terminou com o agente afirmando ter marcado.

**T10 — Agendamento pelo CRM.**
Entrada: `NewAppointmentModal` com cliente novo (nome + telefone), serviço, profissional, horário; repetir com horário conflitante.
Esperado: `garantir_cliente` deduplica por `telefone_norm`; conflito volta com erro traduzido; falha parcial faz rollback (sem agendamento órfão).
Passou se: cliente único em `clients` mesmo repetindo o telefone com máscara diferente; nenhum `appointments` órfão após erro.

**T11 — Agenda pública (QR).**
Entrada: Configurações → ligar `agenda_publica` (RPC `definir_agenda_publica`); abrir `/agendar/<salonId>` anônimo; consultar, agendar com telefone válido; abrir `/meu-horario/<token>`; cancelar; tentar 9 agendamentos seguidos do mesmo IP.
Esperado: horários batem com `horarios_livres`; `tokenGestao` devolvido; cancelamento só com token e antecedência; 9º agendamento barrado pelo rate limit (8/IP/10min).
Passou se: cada ação refletida em `appointments` e o rate limit devolveu o erro esperado.

**T12 — Lembrete ponta a ponta (pós-fix BL-10 + BL-11 — hoje é impossível por construção).**
Entrada: template `lembrete_hoje` aprovado; agendamento real ~90min à frente para um cliente que já conversou com o número.
Esperado: no ciclo de 10min, `sendTemplate` sai **pelo número central** (`1288009817732005`); `lembrete_enviado=true` e `lembrete_message_id` (wamid) preenchidos; clicar **Sim** → `status='confirmado'` + resposta pronta; **Cancelar** → `cancelado`; **Reagendar** → `reagendamento_pedido_em` preenchido, horário NÃO liberado, e o agente **remarca em vez de criar segundo agendamento** (valida o fix do contexto). Extra (prova de defeito MT-04): responder "sim" **digitado** — hoje se perde; pós-fix BL-21, resposta fixa.
Passou se: cada clique refletido em `appointments` e o template chegou de fato no celular (não confiar na execução verde — é exatamente o que o achado C4 proíbe).

**T13 — Ciclo de cobrança controlado (antes de 01/10; BL-12).**
Entrada: com uso real do agente registrado (T9), rodar `SELECT fechar_mes_de_uso()` (ou aguardar o cron do dia 1º); `cpf_cnpj` preenchido em `/assinatura`.
Esperado: linha em `faturas_de_uso` com o período e valor ≥ R$ 5; no ciclo horário, `cobrar-uso` cria a cobrança (`asaas_payment_id`, `boleto_url`, `boleto_vencimento` preenchidos); e-mail de boleto chega ao dono; e-mail de detalhamento chega ao dono do produto.
Passou se: os campos da fatura preenchidos, a cobrança visível no painel do Asaas com `externalReference` = salon_id, e os 2 e-mails entregues (testar também num destinatário **não-Gmail** — pendência declarada).

**T14 — Pagamento e liberação.**
Entrada: pagar a cobrança do T13 (cartão — Pix/boleto bloqueados na conta).
Esperado: `asaas-webhook` recebe `PAYMENT_CONFIRMED/RECEIVED`; linha em `asaas_eventos`; `faturas_de_uso.paga_em` preenchido; `subscriptions.acesso_ate = dueDate + 1 mês`, `atendimento_ate = acesso_ate + 3 dias`.
Passou se: os 3 SELECTs conferem e o reenvio do mesmo evento pelo painel do Asaas **não** duplica efeito (idempotência 23505).

**T15 — Bloqueio e tolerância.**
Entrada: em teste controlado, deixar `acesso_ate` no passado com fatura vencida em aberto (ou esperar o caso real).
Esperado: CRM inteiro vira `AcessoBloqueado` exceto `/assinatura`, para **todos** os papéis; `salons_atendendo` mantém o WhatsApp por 3 dias; `estende-acesso-sem-debito` NÃO estende quem deve.
Passou se: navegação bloqueada, agente ainda responde dentro da tolerância e para depois dela (atenção à divergência SP/UTC perto da meia-noite — achado D10; anotar o horário do teste).

**T16 — Cancelamento.**
Entrada: `/assinatura` → Cancelar (como owner).
Esperado: `status='cancelada'`; fatura parcial gerada na hora (`gerar_fatura_de_cancelamento`); se houver recorrência legada no Asaas, ela morre lá — recusa do Asaas aborta o cancelamento.
Passou se: fatura parcial em `faturas_de_uso` e nada cobrando no painel do Asaas para o salão.

**T17 — Onboarding self-service.**
Entrada: `/criar-conta` com e-mail novo → confirmar pelo link → `criar-minha-barbearia` (nome, salão, telefone, aceite de termos).
Esperado: e-mail de confirmação chega (entrega do Auth nunca foi verificada — este teste também a decide); barbearia nasce com trial 7d, catálogo de 4 serviços, jornada e vínculo owner.
Passou se: `subscriptions.status='trial'` com `acesso_ate = hoje+7`; `termos_aceites` com IP/user-agent; e tentar de novo o mesmo clique não duplica (idempotência).

**T18 — Convite à distância.**
Entrada: `/admin/nova-barbearia` (senha admin) → convidar barbearia por e-mail.
Esperado: no ciclo de 10min do n8n, e-mail chega com link `https://clubcut.space/convite/<token>`; aceite pede senha + termos; trial começa **no aceite**.
Passou se: `salon_invites.email_enviado_em` preenchido depois do envio; o link aponta para `clubcut.space` (não `vercel.app` — se apontar errado, é o A6); `subscriptions.acesso_ate` datado do aceite.

**T19 — Rate limits do admin/convite.**
Entrada: 21 chamadas seguidas ao `admin-create-salon` do mesmo IP; 6 tentativas de senha no mesmo token de convite.
Esperado: 21ª barrada (20/IP/10min); 6ª barrada (5/token/15min).
Passou se: erros de `taxa_excedida` nos dois casos.

**T20 — Firewall (pós-fix BL-04).**
Entrada: de uma rede externa, `curl -m 5 http://179.197.78.181:32770/` e `:32769`.
Esperado hoje: respondem (confirma HG-01). Pós-fix: timeout/refused, com `https://evolution-api-8lfe.srv1833354.hstgr.cloud` e `https://n8n-m5uf.srv1833354.hstgr.cloud` continuando a responder via Traefik.
Passou (pós-fix) se: portas altas mortas e os hostnames TLS vivos; T2 repetido continua funcionando (o webhook interno não quebrou).

**T21 — Restore de backup (BL-02/BL-05).**
Entrada: restaurar o dump do Supabase num projeto/instância descartável; restaurar o snapshot da VM (ou simular no plano).
Esperado: banco restaurado com contagens iguais às da origem; documentar o tempo real.
Passou se: `SELECT count(*)` das tabelas de negócio bate e o procedimento está escrito com data — "restore estimado em 30 min" hoje é teórico.

**T22 — As 7 verificações de painel (da revisão final da integração).**
Checklist sem código, na ordem de alavancagem: (1) mensagem de teste real (= T2); (2) secrets `N8N_*_URL` vs triggerInfo; (3) painel Asaas — órfãos + config do webhook + fila pausada?; (4) painel Supabase — backup/PITR + plano; (5) `GET /instance/fetchInstances`; (6) `sudo ufw status` na VM; (7) WhatsApp Manager — templates + campos assinados.
Passou se: cada resposta registrada por escrito (de preferência atualizando o capítulo 12 deste relatório) — são elas que fecham as lacunas abaixo.

---

## 12. Lacunas — o que continua não verificado e o que falta para fechar

### 12.1 Lacunas herdadas das auditorias (consolidado do NÃO VERIFICADO)

| # | Lacuna | Por que ficou aberta | O que fecha |
|---|---|---|---|
| L1 | Estado real de backup/PITR e plano do Supabase | MCP não expõe billing/backup | Print de Settings → Database → Backups + plano da org (T22.4) |
| L2 | Valores dos secrets `N8N_WEBHOOK_URL`, `N8N_WHATSAPP_WEBHOOK_URL`, `N8N_LEMBRETE_RESPOSTA_URL`, `ASAAS_BASE_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `WHATSAPP_*`, `APP_URL` | Secrets de edge não legíveis por tool (regra da auditoria) | Painel Supabase → Edge Functions → Secrets (nomes/valores conferidos pelo dono); T2 decide os dois primeiros na prática |
| L3 | Recorrências/customers órfãos no Asaas; config do webhook; fila pausada; análise de Pix/boleto; saldo | Exige painel do Asaas | T22.3 |
| L4 | Lista real de instâncias na Evolution (órfãs, webhook aplicado por instância, versão em execução) | Exigiria credencial da API | `fetchInstances` + `GET /webhook/find/{instance}` + `GET /` (T22.5) |
| L5 | Mapeamento credencial↔nó no n8n (`credentials: null` na API) — decide AS-05/D6 e qual token os nós de mídia usam | Limitação da API do n8n | Abrir os nós na UI; renomear credenciais genéricas |
| L6 | Campos assinados no webhook do app Meta; status real dos templates; tier/qualidade atual; token permanente vs 24h | Exige painel/token da Meta | T22.7 + Business Manager → Usuários do sistema |
| L7 | Firewall interno da VM (ufw/iptables) — severidade final do HG-01 | Painel não expõe; exigiria SSH | `sudo ufw status` (T22.6) |
| L8 | Config do GoTrue (SMTP, rate limits, Site URL, redirect allow-list — passos 4/5/7/10 do go-live do domínio) | MCP não expõe Auth config | Painel Supabase → Auth; T17 testa a entrega na prática |
| L9 | Env vars da Vercel (nomes/escopo; `VITE_APP_URL`/`VITE_AGENTE_IA_URL` com fallback silencioso); Ignored Build Step; usage do Hobby | Tools não expõem | Painel Vercel → Settings/Usage |
| L10 | Igualdade byte a byte repo ↔ deploy das edges fora das 3 do Asaas (histórico já teve `accept-invite` divergente) | Custo de comparação integral | `supabase functions download` + diff |
| L11 | Autorização interna das 14 RPCs SECURITY DEFINER expostas a `authenticated` | Auditado só por amostragem | Leitura função a função (recomendada como "Fase 2" pela auditoria 01) |
| L12 | Conteúdo/efeito das ≥18 migrations aplicadas sem arquivo no repo | `list_migrations` só dá nomes | A migration de sincronização (BL-13) resolve por consequência |
| L13 | Causa do banco quase vazio (wipe 03/09 — intencional confirmado pelo backlog, mas Curitiba/São José sem destino registrado nos docs oficiais) | Só o dono sabe | Registrar o evento em `estado-do-projeto.md` (BL-36) |
| L14 | Política de retry do webhook da Evolution (re-tenta POST falho?) | Não documentada; depende da versão `:latest` | Doc da versão real ou teste controlado |
| L15 | Comportamento real: ramo de mídia Evolution, resposta do agente a 23P01, cadeia clique→`responder_lembrete` com clique real, primeiro ciclo de cobrança | Nunca executados | T4, T9, T12, T13–T14 |
| L16 | Export dos workflows do n8n fora da instância; config da instância (queue mode, retention, `EXECUTIONS_DATA_*`) | Nada no repo; MCP não expõe | BL-05 + acesso ao painel do VPS |
| L17 | Tarifas Meta pós-01/10/2026 no Brasil | Doc baseado em fontes secundárias | Página oficial de preços da Meta |
| L18 | Entrega de e-mail (boleto/convite) fora do Gmail | Testado só no Gmail | T13/T18 com destinatário Outlook/Yahoo |
| L19 | Uso agregado de banda do VPS no ciclo; consumo mensal Vercel | APIs só dão amostras | Painéis |

### 12.2 Lacunas da própria auditoria — o que ninguém auditou (olhar crítico)

Estas não estão em nenhum NÃO VERIFICADO; são buracos do escopo da auditoria em si:

1. **Não existe auditoria do componente GitHub.** O `07-vercel.md §4` encaminha o repo público "como observação para o auditor do componente GitHub" — **esse relatório não existe** em `docs/auditoria/`. E o GitHub é um SPOF de primeira linha (push em `main` = produção sem gate; repo público expondo URLs de webhook e histórico de decisões; proteção de branch, 2FA, secrets do Actions e permissões de colaborador nunca examinados).
2. **Nada foi executado.** Nenhuma auditoria rodou build, testes, lint ou o app (regra de somente-leitura). Os "~239 testes" são contagem estática; o estado real do CI (`gh run list`) não foi visto; o comportamento visual (celular, tema escuro, os quatro estados) é inferido de testes-contrato, não observado. O plano do capítulo 11 é o que fecha isso.
3. **LGPD/termos foram tocados de raspão** (retenção de conversas no n8n — N8N-M6 — e o valor probatório de `termos_aceites`), mas ninguém auditou o conteúdo de `/termos` e `/privacidade` contra o que o sistema realmente faz (subprocessadores: OpenAI, OpenRouter, Meta, Asaas, Hostinger, Vercel; retenção; canal não-oficial do WhatsApp nos termos do cliente final).
4. **O corpo das 14 RPCs DEFINER e das ~47 funções do banco não foi lido função a função** (L11) — o isolamento foi verificado por padrão e amostragem. Num sistema em que a RLS é a única defesa das escritas do CRM, essa é a maior superfície não-lida que restou.
5. **O painel admin externo** ("fora do repo", consumidor das edges `admin-*` — `01-supabase.md §5`) não foi auditado por nenhum relatório: não se sabe onde está hospedado, quem tem acesso, nem como guarda o `ADMIN_TOOL_SECRET`.
6. **Custo unitário real por barbearia** (OpenAI + Meta pós-01/10 + infra ÷ preço por agendamento) não foi consolidado por ninguém — o N8N-M4 mostra que a maior fatia nem é medida; a margem do produto é hoje desconhecida por construção.
7. **Nenhum teste de carga/latência** — os limites citados (Realtime do plano gratuito, ~500 e-mails/dia do Gmail, RAM por instância Baileys, timeout de 120s do agente) são todos teóricos.

---

*Consolidado a partir de `docs/auditoria/01`–`08` e `90-integracao.md` (2026-09-05). Este relatório expira junto com eles: o próprio relatório de integração avisa que o drift em curso (~2 mudanças manuais/semana no banco, workflows editados ao vivo) o invalida em semanas — o item BL-13/BL-05 é o que o mantém vivo.*
