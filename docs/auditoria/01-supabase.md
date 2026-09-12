# Auditoria Fase 1 — Supabase

**Data:** 2026-09-05. **Escopo:** banco, schema, RLS, RPCs, triggers, migrations, edge functions, extensões, advisors, backup. Somente leitura; nada foi alterado.

**Projeto auditado:** `clinica-crm` (ref `bukhpvvybeltmhtwamox`, região `sa-east-1`, Postgres 17.6.1.147, status ACTIVE_HEALTHY, criado 2026-07-21) — é o projeto deste repo: `supabase/config.toml:1` declara `project_id = "clinica-crm"` e os nomes em `list_migrations` batem com `supabase/migrations/`. A organização tem um segundo projeto, `crm-salao` (`adlwuzqthotnmuiguebe`), que é **outro produto** (CRM de salões de beleza em `~/meus-projetos/crm-salao`, conforme `_backup-claude-2026-09-01\transcripts\...\memory\projeto-crm-salao.md:11-13`) — fora do escopo.

---

## 1. O que existe hoje

**Banco (list_tables + execute_sql em catálogos):**
- 46 tabelas no schema `public`, **todas com RLS habilitada** (`list_tables` → `rls_enabled: true` em 46/46).
- 64 policies em 33 tabelas (`pg_policies`); 11 tabelas com RLS ligada e **zero policies de propósito** (deny-by-default, só `service_role`): `asaas_eventos`, `auditoria_avisos`, `avaliacao_pedidos`, `canal_de_alertas`, `consumo_ia`, `controle_de_taxa`, `eventos_da_waba`, `faixas_de_uso`, `precos_modelo`, `remetentes_oficiais`, `whatsapp_templates` — cada uma com comment na tabela explicando (`list_tables` → comments).
- 39 views, **todas** com `security_invoker=true` (`pg_views` + `pg_class.reloptions`).
- ~47 funções próprias em `public`/`private`; 45 delas SECURITY DEFINER, todas com `search_path` fixo em `proconfig` (`pg_proc`). 16 triggers em 12 tabelas (`pg_trigger`).
- 7 jobs no `pg_cron` (`cron.job`): `fechamento-mensal-de-uso`, `fechamento-diario-do-caixa`, `cancela-agendamentos-sem-comanda` (*/5 min), `poda-historico-antigo`, `cria-reativacoes`, `expira-reativacoes`, `estende-acesso-sem-debito`. Histórico 100% `succeeded` (`cron.job_run_details` → 0 falhas).
- Realtime (`pg_publication_tables` → `supabase_realtime`): `appointments`, `clients`, `orders`, `payments`, `whatsapp_conversations`, `whatsapp_messages`.
- Extensões instaladas (`list_extensions`): `plpgsql`, `btree_gist` (schema **public**), `pg_cron`, `pgcrypto`, `pg_stat_statements`, `supabase_vault`, `uuid-ossp`. `pgtap` **não** está instalada em produção (CI roda local).
- Branches: nenhum (`list_branches` → []).

**Dados (execute_sql, counts em 2026-09-05):** 1 salão (`salons.nome = "El Guardians"`, `created_at` 2026-09-04), 1 usuário em `auth.users`, 1 vínculo em `user_salons`, 1 `subscriptions`, **0** `clients`, **0** `appointments`, **0** `whatsapp_messages`, 0 `organizations`, 25 `whatsapp_templates`, 1 `whatsapp_connections`, 1 `remetentes_oficiais`, 1 `canal_de_alertas`.

**Migrations:** repo tem **138 arquivos** (`supabase/migrations/0001..0138`); produção registra **152 migrations** aplicadas (`list_migrations`). O mapeamento não é 1:1 (detalhe na seção 3).

**Edge functions (list_edge_functions):** 12 ativas — `whatsapp`, `admin-create-salon`, `accept-invite`, `add-salon-unit`, `asaas-webhook`, `asaas`, `admin-invite-salon`, `criar-minha-barbearia`, `admin-metricas`, `agenda-publica`, `whatsapp-webhook`, `cobrar-uso`. Com `verify_jwt=false`: `admin-create-salon`, `asaas-webhook`, `agenda-publica`, `whatsapp-webhook`. O repo tem fonte para **11** delas (`supabase/functions/` → 11 diretórios); `admin-metricas` só existe em produção.

**Testes no repo:** 14 arquivos pgTAP em `supabase/tests/` + rotina de verificação `supabase/verificacao/rotina.sql`.

---

## 2. O que está correto e por quê

- **RLS em 100% das tabelas** (`list_tables`), e o advisor de segurança não acusa nenhuma tabela exposta sem RLS. As 11 tabelas sem policy são deny-by-default deliberado e documentado em comment — padrão correto para tabelas que só o `service_role` (n8n/edge) toca.
- **Isolamento multi-tenant consistente**: as policies das tabelas de negócio filtram por `salon_id IN (SELECT private.salon_ids())` com papel via `private.is_manager(salon_id)` / `private.my_professional_ids()` — verificado o texto completo em `appointments` (`pg_policies.qual`) e o padrão de nomes nas demais. As funções `private.*` de policy são SECURITY DEFINER **com `search_path` fixo** (`pg_proc.proconfig`). Há teste dedicado: `supabase/tests/rls_isolamento_entre_saloes.test.sql`.
- **Todas as SECURITY DEFINER têm `search_path` fixo** (`pg_proc` → 45/45 com `proconfig` contendo `search_path`), fechando o vetor clássico de escalada.
- **Views com `security_invoker=true` em 39/39** (`pg_class.reloptions`) — view não fura RLS.
- **Webhooks autenticam de verdade (verificado no código deployado, sem valores):**
  - `whatsapp-webhook`: GET responde ao desafio com `WHATSAPP_VERIFY_TOKEN`; POST valida HMAC `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET` em **comparação de tempo constante**; falha fechada se o secret faltar (`get_edge_function whatsapp-webhook` → `assinaturaConfere`).
  - `asaas-webhook`: exige header `asaas-access-token` igual a `ASAAS_WEBHOOK_TOKEN`; recusa tudo (500) se a env faltar; **idempotência** via insert em `asaas_eventos` (23505 = repetido) com liberação da trava se o efeito falhar (`get_edge_function asaas-webhook`).
  - `admin-create-salon`: header `x-admin-secret` vs `ADMIN_TOOL_SECRET` em comparação de tempo constante + limitador `taxa_excedida` (20/IP/10min); falha fechada sem o secret (`get_edge_function admin-create-salon`).
- **`agenda-publica` (pública de propósito) tem defesa em camadas** (`supabase/functions/agenda-publica/index.ts`): gate por `salons_atendendo` + recurso `agenda_publica` em `recursos_ativos`, rate limit por IP (8 agendamentos/10min), teto por barbearia (10/h), revalidação do horário contra `horarios_livres` no servidor, cancelamento só por `token_gestao` (uuid) com antecedência mínima, telefone validado com faixa 10–13 dígitos.
- **`asaas` (verify_jwt=true) autoriza pelo JWT do chamador** via client `ANON_KEY + Authorization` (RLS decide) e filtra vínculo por `user_id` (`supabase/functions/asaas/index.ts:74-88`) — o `service_role` não é usado para autorizar.
- **Índices nos caminhos quentes**: `idx_appointments_salon_inicio`, `uq_clients_salon_telefone_norm`, `idx_clients_salon_telefone_norm`, `idx_whatsapp_conversations_salon`, exclusão de sobreposição `appointments_sem_sobreposicao` (`pg_indexes`).
- **Cron saudável**: 7/7 jobs com histórico só `succeeded` (`cron.job_run_details`).
- **Retenção de dados existe**: `poda_historico_antigo` (migration 0106 + cron mensal).

---

## 3. O que está errado ou incompleto

Ordenado por severidade. (Só sugestões; nada foi corrigido.)

**1. CRÍTICO — Backup inexistente/não gerenciado, e o banco é o único depositário do negócio.**
- Evidência: `docs/estado-do-projeto.md:40-41` ("Supabase no plano gratuito, sem backup gerenciado. É o único item que pode acabar com o negócio num dia"); Glob `**/*backup*` no repo → só arquivos de `node_modules` (nenhuma rotina de dump); o MCP não expõe estado de backup/PITR (ver seção 6).
- Impacto: perda irreversível de agenda, clientes, financeiro e prova de aceite de termos (`termos_aceites` é insert-only justamente por valor probatório) de todas as barbearias num único incidente.
- Correção sugerida: upgrade para plano com backup diário (e PITR quando couber) **ou** rotina externa agendada de `pg_dump` para storage fora do Supabase, com teste de restore documentado. Registrar a data no contrato como o docs já prevê.

**2. ALTO — O banco de produção contradiz os docs: os dados operacionais sumiram ou nunca estiveram aqui.**
- Evidência: `docs/estado-do-projeto.md:33-34` afirma "Duas barbearias reais no banco (Curitiba e São José) mais a El Guardians" (atualizado 2026-08-16). Hoje: `select count(*)` → 1 salão, 0 clients, 0 appointments, 1 auth user; o único salão é "El Guardians" com `created_at = 2026-09-04` — ou seja, até a linha do teste de pagamento foi **recriada** depois dos docs.
- Impacto: ou houve perda/limpeza de dados de produção (exatamente o cenário do item 1, e as barbearias reais estariam sem sistema), ou docs e rotina de verificação apontam para um estado que não existe mais — e qualquer decisão tomada sobre eles está errada.
- Correção sugerida: o dono confirma o que houve (wipe intencional? migração de dados? outro banco?); atualizar `docs/estado-do-projeto.md` e registrar o evento. Se foi perda: item 1 vira emergência.

**3. ALTO — Migrations do repo e de produção divergem nos dois sentidos.**
- Evidência: repo = 138 arquivos; `list_migrations` = 152 entradas. Aplicadas **sem arquivo correspondente no repo** (≥18): `add_lembrete_enviado_to_appointments`, `add_last_message_preview_to_whatsapp_conversations`, `remover_cliente_duplicado_e_travar_duplicidade`, `planos_e_assinaturas`, `pacotes_pre_pagos`, `marketing_fuso_search_path`, `tolerancia_unica_de_tres_dias`, `auditoria_menos_ruido`, `reativacao_template_com_optout`, `consumo_ia`, `troca_de_convite_qualifica_pgcrypto`, `convite_fecha_o_insert_e_a_barbearia_desativada`, `destino_whatsapp_regua_unica`, `fechamento_mensal_e_rede_de_seguranca_do_cancelamento`, `trial_ate_preenchido_pelo_banco`, `documento_valido_para_boleto_unico`, `boleto_unico_exige_documento`, `sem_vencimento_automatico_continua_atendendo`. No sentido inverso: `0057_planos_iniciais.sql` e `0087_confirmacao_de_chegada_aposentada.sql` **não constam** em `list_migrations` — a 0087 foi aplicada por fora (o comment "MORTA desde 2026-08-21" existe na coluna, verificado via `col_description`), a 0057 ficou obsoleta (`plans` foi dropada; não aparece em `list_tables`). Numeração também deriva: prod tem `0082a_tempo_sem_vir` + `0082_reativacao_em_duas_etapas` onde o repo tem `0082_tempo_sem_vir` + `0083_reativacao_em_duas_etapas`. O próprio repo confessa o padrão: `supabase/migrations/0057_planos_iniciais.sql:10-13` lista "quinta forma de divergência entre repositório e produção... mesma raiz: mudança aplicada direto no ambiente".
- Impacto: um banco criado do zero a partir do repo **não** é a produção; o pgTAP do CI valida um schema que diverge do real; um `db push`/reset futuro pode reintroduzir ou apagar coisas silenciosamente.
- Correção sugerida: congelar mudanças manuais; gerar uma migration de sincronização a partir do diff real (como já foi feito na 0022) e registrar as manuais na tabela de migrations; adotar regra "nada entra em produção sem arquivo no repo" (o CLAUDE.md já manda aplicar à mão — o que falta é o registro simétrico).

**4. MÉDIO — `admin-metricas` só existe em produção, e é a mais fraca das funções admin.**
- Evidência: `list_edge_functions` → 12 funções; `supabase/functions/` → 11 diretórios (sem `admin-metricas`). No código deployado (`get_edge_function admin-metricas`): compara `x-admin-secret` com `!==` (não é tempo constante, ao contrário de `admin-create-salon` que usa `segredoConfere`) e **não** tem limitador `taxa_excedida`.
- Impacto: função sem fonte versionada (não sobrevive a um redeploy limpo) e endpoint que aceita força bruta do segredo sem freio (mitigado pelo tamanho do segredo, mas o padrão do projeto é outro).
- Correção sugerida: trazer o fonte para `supabase/functions/admin-metricas/` e alinhar com o padrão da `admin-create-salon` (comparação constante + rate limit).

**5. MÉDIO — Grants largos demais para `anon`/`authenticated`, incluindo TRUNCATE (que RLS não filtra).**
- Evidência: `information_schema.role_table_grants` → `anon` tem `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` em ~40 tabelas base (incl. `salons`, `appointments`, `clients`, `subscriptions`, `whatsapp_messages`); `authenticated` idem em 72 objetos. São os defaults do Supabase que as migrations 0023/0095/0114 não chegaram a fechar.
- Impacto: RLS cobre SELECT/INSERT/UPDATE/DELETE, mas **não** TRUNCATE; `REFERENCES`/`TRIGGER` também não servem a cliente nenhum. Pelo PostgREST não há como emitir TRUNCATE, então a exploração exige outro vetor — é superfície desnecessária, não um buraco aberto.
- Correção sugerida: `REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` e revogar escrita de `anon` nas tabelas em que nenhuma policy o contempla; ajustar `ALTER DEFAULT PRIVILEGES` para o futuro.

**6. MÉDIO — 3 funções `private` sem `search_path` fixo (advisor WARN).**
- Evidência: `get_advisors security` → `function_search_path_mutable` em `private.telefone_valido`, `private.destino_whatsapp`, `private.documento_valido`; confirmado em `pg_proc.proconfig = null`. São SECURITY INVOKER usadas em CHECKs/lógica.
- Impacto: menor que numa DEFINER, mas função de CHECK com search_path móvel ainda é vetor de confusão de resolução de nomes.
- Correção sugerida: `ALTER FUNCTION ... SET search_path = public, pg_temp` (mesma linha das demais).

**7. MÉDIO — Proteção contra senha vazada desligada no Auth (advisor WARN).**
- Evidência: `get_advisors security` → `auth_leaked_password_protection` ("Leaked password protection is currently disabled").
- Impacto: dono de barbearia cria conta com senha já vazada no HaveIBeenPwned; conta de dono dá acesso a dados de clientes finais.
- Correção sugerida: ligar no painel Auth (Password Security).

**8. MÉDIO — 19 FKs sem índice de cobertura, várias em coluna de tenant (advisor performance).**
- Evidência: `get_advisors performance` → `unindexed_foreign_keys` em `services.salon_id`, `professionals.salon_id`, `products.salon_id`, `professional_schedules.professional_id`, `professional_services.service_id`, `feedbacks.salon_id`, `reativacao_envios.salon_id`, `termos_aceites.salon_id`, `avaliacao_pedidos.{order_id,salon_id}`, `avaliacoes.{client_id,order_id}`, `cash_registers.aberto_por`, `consumo_ia.conversation_id`, `orders.cash_register_id`, `pacote_do_cliente_itens.service_id`, `recursos_do_salao.recurso`, `salon_invites.criado_por`, `feedbacks.user_id`.
- Impacto: hoje irrelevante (tabelas minúsculas); com dezenas de barbearias, cada RLS check e cada join por `salon_id` nessas tabelas vira scan.
- Correção sugerida: criar índices nas FKs de consulta frequente (`services(salon_id)`, `professionals(salon_id)`, `products(salon_id)`, `professional_schedules(professional_id)` primeiro).

**9. MÉDIO — 95 achados de `multiple_permissive_policies` em 12 tabelas (advisor performance).**
- Evidência: `get_advisors performance` → concentração em `services` (20), `stock_movements` (15), `commissions` (10), `pacotes_do_cliente` (10), `user_salons`, `professionals`, etc. Ex.: `services` tem 5 policies permissivas (gestor ALL + membros SELECT + 3 de barbeiro) avaliadas em cada comando.
- Impacto: cada linha lida avalia várias subqueries `private.*`; custo cresce com o volume.
- Correção sugerida: consolidar policies por comando (OR interno) e/ou envolver `private.salon_ids()` em `(select ...)` para initplan, como o linter recomenda.

**10. BAIXO — RPCs SECURITY DEFINER expostas a papéis de API (advisor WARN).**
- Evidência: `get_advisors security` → 14 funções DEFINER executáveis por `authenticated` (ex.: `definir_papel_do_membro`, `tirar_da_equipe`, `estornar_venda`, `garantir_cliente`, `salvar_jornada`) e 2 por `anon` (`marca_o_fim_do_teste`, `respeita_folga_entre_atendimentos`); confirmado em `has_function_privilege`. As duas de `anon` são funções de **trigger** (retornam `trigger` — `pg_trigger` mostra `trg_marca_o_fim_do_teste` e `trg_respeita_folga`), então a chamada via REST falha; o grant é lixo herdado, não porta aberta. As 14 de `authenticated` são a API intencional do CRM.
- Impacto: depende de cada função checar papel internamente — checagem função a função **não** foi auditada (seção 6).
- Correção sugerida: revogar EXECUTE de `anon`/`authenticated` nas funções de trigger e de cron (`fechar_*`, `poda_*`, `criar_agendamentos_*` etc., no espírito da 0095); manter grant só nas RPCs que o CRM chama.

**11. BAIXO — `btree_gist` instalada no schema `public`** (advisor WARN `extension_in_public`; `list_extensions` → schema public). Polui o namespace da API (dezenas de funções `gbt_*` visíveis). Correção: mover para `extensions` numa janela de manutenção (exige recriar a exclusão de sobreposição).

**12. BAIXO — 10 índices nunca usados** (advisor `unused_index`: `services_created_by_idx`, `consumo_ia_salao_dia_idx`, `appointments_chegou_em_idx`, `idx_asaas_eventos_subscription`, `idx_salons_remetente`, `idx_orders_appointment`, `idx_order_items_*` ×3, `idx_cash_registers_salon`). Com o banco quase vazio o sinal é fraco — reavaliar com carga real antes de dropar.

**13. BAIXO — 4 funções `private` de policy com `search_path=public` sem `pg_temp`** (`pg_proc.proconfig` de `is_manager`, `my_client_ids`, `my_professional_ids`, `salon_ids`). Inconsistente com o resto (`public, pg_temp`). Correção: padronizar.

---

## 4. O que ainda não quebrou mas vai virar problema em produção

- **`admin-create-salon` checa e-mail duplicado com `auth.admin.listUsers()` sem paginação** (`get_edge_function admin-create-salon` → `listUsers()` e `existingUsers.users.some(...)`). O default da API é ~50 usuários por página: passando de 50 contas, e-mails duplicados deixam de ser detectados e o cadastro presencial começa a falhar de forma intermitente. Trocar por `getUserByEmail`/consulta direta.
- **`ASAAS_BASE_URL` tem fallback para sandbox** (`asaas-webhook` e `asaas`: `?? 'https://api-sandbox.asaas.com'`). Se a env sumir num redeploy, ajustes de recorrência e cancelamentos passam a falar com o sandbox **sem erro visível**. Fallback mais seguro seria falhar fechado.
- **`APP_URL` tem fallback hardcoded `https://clubcut.vercel.app`** (`admin-create-salon`, comentário no próprio código admite o risco). Quando o domínio próprio chegar (pendência em `docs/estado-do-projeto.md:42-43`), e-mail de boas-vindas pode apontar para o endereço velho.
- **`verify_jwt=true` nas funções admin aceita qualquer JWT do projeto (o anon key inclusive)** — a barreira real é só o `x-admin-secret`. Com a `admin-metricas` sem rate limit (item 4 da seção 3), o segredo é a única linha de defesa.
- **Timezone fixa `America/Sao_Paulo`** em `agenda-publica` (`toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })`). Barbearia fora desse fuso (Manaus, Cuiabá) verá "hoje" errado na virada do dia.
- **Realtime publica `whatsapp_messages`, `clients`, `appointments`, `orders`, `payments` inteiros** (`pg_publication_tables`): com dezenas de barbearias, todo insert de mensagem passa pelo Realtime; o plano gratuito tem teto de conexões/mensagens. A poda (`poda_historico_antigo`) é mensal — o fluxo é contínuo.
- **Plano gratuito pausa projeto inativo e limita recursos** (afirmação do dono sobre o plano; não verificável via MCP — seção 6). Enquanto houver 1 barbearia ativa não pausa, mas o teto de armazenamento/egress chega antes do backup ser resolvido se o item 1 ficar parado.
- **`controle_de_taxa` acumula linhas por chave/janela** (tabela do limitador, 0111). Não verifiquei rotina de limpeza; sem ela, cresce para sempre (devagar, mas sempre).
- **Duas migrations de produção por fora do repo por semana** foi o ritmo recente (seção 3, item 3 — 4 hotfixes só em 2026-09-02). O custo do drift cresce com cada uma; a migration de sincronização fica maior a cada semana que passa.

---

## 5. Interfaces — o que o Supabase ENTREGA e CONSOME

**ENTREGA (contratos que os outros componentes usam):**

| Consumidor | Contrato exato |
|---|---|
| CRM (React) | PostgREST `/rest/v1/` sobre as 46 tabelas/39 views com RLS; RPCs `authenticated`: `horarios_livres`, `trocar_horarios`, `quero_atender`, `garantir_cliente`, `situacao_do_acesso`, `definir_servicos_do_agendamento`, `salvar_jornada`, `tirar_da_equipe`, `definir_papel_do_membro`, `editar_convite`, `trocar_email_do_convite`, `estornar_venda`, `preco_por_uso`, `clientes_por_mes`, `definir_agenda_publica` (`has_function_privilege` → auth_exec) |
| CRM (React) | Realtime nas tabelas `appointments`, `clients`, `orders`, `payments`, `whatsapp_conversations`, `whatsapp_messages` (`supabase_realtime`) |
| CRM (React) | Auth GoTrue (signup/login; `user_salons.role` decide papel; `salon_invites` + edge `accept-invite` para entrar na equipe) |
| n8n (service_role) | Views de fila/estado: `salons_atendendo`, `salons_com_automacao`, `reativacoes_a_enviar`, `avaliacoes_a_pedir`, `vencimentos_a_avisar`, `boletos_a_enviar`, `convites_a_enviar`, `faturas_a_notificar`, `atrasos_para_perguntar`, `clientes_para_reativar`, `ultima_mensagem_recebida`, `saldo_de_pacotes_por_telefone`, `canal_de_alertas_conferido`, `auditoria_pendente`/`auditoria_*`, `metricas_do_produto`, `uso_do_sistema_no_mes` |
| n8n (service_role) | RPCs de escrita: `marcar_reativacao_enviada`, `marcar_avaliacao_pedida`, `responder_lembrete`, `responder_avaliacao`, `salon_por_phone_number_id`, `user_id_por_email`, `taxa_excedida`; tabelas só-service_role: `consumo_ia`, `precos_modelo`, `whatsapp_templates`, `canal_de_alertas`, `remetentes_oficiais`, `eventos_da_waba`, `avaliacoes` |
| Asaas | Edge `POST /functions/v1/asaas-webhook` — autentica pelo header `asaas-access-token` (= `ASAAS_WEBHOOK_TOKEN`); eventos `PAYMENT_CONFIRMED/RECEIVED/RECEIVED_IN_CASH/OVERDUE`; casa por `payment.subscription` → `subscriptions.asaas_subscription_id`, `externalReference = salon_id` ou `rede:<organization_id>`; grava `asaas_eventos` (idempotência) e atualiza `subscriptions.{status,acesso_ate,atendimento_ate,proximo_vencimento}` e `faturas_de_uso.paga_em` |
| Meta (Cloud API) | Edge `GET/POST /functions/v1/whatsapp-webhook` — GET: `hub.mode/hub.verify_token/hub.challenge`; POST: HMAC `x-hub-signature-256`; roteia por `metadata.phone_number_id` (RPC `salon_por_phone_number_id` ou `remetentes_oficiais`); grava `eventos_da_waba` para `field != messages`; **sempre responde 200** |
| Página pública (QR) | Edge `POST /functions/v1/agenda-publica` — ações `consultar`, `agendar`, `meu_horario`, `cancelar_horario`; campos `salonId`, `servicoId`, `profissionalId`, `inicio`, `nome`, `telefone`, `token` (uuid `token_gestao`) |
| Painel admin (fora do repo) | Edges `admin-create-salon` (ações `verify/list/update_salon/toggle_salon/create`), `admin-invite-salon`, `admin-metricas` — todas autenticadas pelo header `x-admin-secret` (= `ADMIN_TOOL_SECRET`) |
| Página de vendas | Edge `criar-minha-barbearia` (self-service) e `accept-invite`/`add-salon-unit`/`cobrar-uso` (JWT) |

**CONSOME (nomes de variáveis/serviços, sem valores):**
- Asaas API (`ASAAS_API_KEY`, `ASAAS_BASE_URL`) — PUT/DELETE `/v3/subscriptions/...`.
- n8n webhooks de entrada: `N8N_WHATSAPP_WEBHOOK_URL` (mensagens ao agente), `N8N_LEMBRETE_RESPOSTA_URL` (respostas de lembrete/avaliação).
- Meta App: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
- Evolution API (função `whatsapp` + `supabase/functions/_shared/evolutionConfig.json`).
- Internos: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ADMIN_TOOL_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `APP_URL`.

---

## 6. NÃO VERIFICADO

| Item | Motivo | O que o dono precisa fornecer |
|---|---|---|
| Plano de billing e estado real de backup/PITR | O MCP não expõe billing nem configuração de backup (`get_project` só devolve id/região/versão; não há tool de backup) | Print/confirmação de Settings → Database → Backups e do plano da organização no painel |
| Causa do banco quase vazio (item 2 da seção 3) | Só o dono sabe se houve wipe intencional, migração ou perda; logs de DML antigos não estão acessíveis por SELECT | Confirmação do que aconteceu entre 2026-08-16 e 2026-09-04 com Curitiba e São José |
| Igualdade byte a byte repo ↔ deploy das 11 edge functions com fonte no repo | Verifiquei integralmente `asaas-webhook`, `whatsapp-webhook`, `admin-create-salon`, `admin-metricas` (deploy) e `agenda-publica`, `asaas` (repo), e sentinelas de texto nas demais; não comparei o restante função a função por custo | Rodar um diff local `supabase functions download` vs repo, ou aceitar o risco (o histórico já teve `accept-invite` divergente — `0057_planos_iniciais.sql:12`) |
| Autorização interna de cada uma das 14 RPCs DEFINER expostas a `authenticated` | Exigiria ler o corpo das 14; auditei o padrão (`private.is_manager`/`salon_ids`) por amostragem (`appointments`, `asaas`) | Nada — é trabalho de auditoria de código função a função, recomendado para a Fase 2 |
| Config de Auth além dos advisors (SMTP, rate limits de e-mail, redirect URLs) | MCP não expõe configuração do GoTrue | Print da aba Auth → Settings (a entrega de e-mail é pendência declarada em `docs/estado-do-projeto.md:47`) |
| Conteúdo/efeito das ≥18 migrations aplicadas sem arquivo no repo | `list_migrations` devolve só nome/versão; reconstruir o SQL exigiria diff completo de schema | Nada imediato — a migration de sincronização sugerida no item 3 resolve por consequência |
| Limpeza da tabela `controle_de_taxa` | Não li o corpo de `taxa_excedida` para confirmar se apaga janelas velhas | Nada — checar na Fase 2 junto com as RPCs |

---

*Gerado por auditoria somente leitura via MCP Supabase (list_tables, list_migrations, list_edge_functions, get_edge_function, list_extensions, get_advisors, execute_sql em catálogos, get_project, list_branches) + leitura do repositório.*
