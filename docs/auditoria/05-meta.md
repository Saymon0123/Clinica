# Auditoria Fase 1 — Componente META (WhatsApp Business API oficial)

**Data:** 2026-09-05. Auditoria somente-leitura. Fontes: repositório local
(`docs/`, `supabase/`), JSON dos workflows n8n (MCP n8n, só leitura), consultas
`SELECT` no Supabase (projeto `bukhpvvybeltmhtwamox`). Nenhuma chamada à Graph
API foi feita (exigiria token); o que só o painel da Meta responde está na
seção 6.

---

## 1. O que existe hoje

**Papel da Meta no modelo híbrido** (decisão de 2026-08-30, `docs/backlog.md:1560-1566` e `supabase/migrations/0115_modelo_hibrido_remetente_central.sql:1-16`):

- **Conversa com o cliente** sai pelo número REAL da barbearia via **Evolution**
  (não-oficial). A Meta **não** participa do atendimento conversacional.
- **Toda conversa INICIADA pela plataforma** (lembrete, reativação, avaliação,
  aviso de fim de teste, política de atraso) sai por um **número central da
  plataforma na Cloud API**, sempre por **template aprovado**. Regra registrada
  no sticky do workflow `NsHcELIXrETknywa` ("regra de produto de 01/09 — toda
  conversa iniciada por nós sai pelo número central da API oficial").
- **Alertas internos** (auditoria, feedback) saíram do WhatsApp: vão por
  **e-mail** (workflow `7yliDoD9AaQp3Qcm`, nó `Enviar Relatorio`,
  `emailSend`; sticky explica o porquê — template de texto arbitrário a Meta
  recusa).

**Infra Meta registrada no repo** (`docs/backlog.md:925-934` e `:2196-2203`):
WABA "Club Cut" `975811062135581`; número central `+55 41 98475-4172` com
`phone_number_id` `1288009817732005`; App `1054189290929803` inscrito no
webhook da WABA (inscrição feita via `POST /<waba>/subscribed_apps`,
`backlog.md:931-934`). Snapshot de 2026-09-04 (`backlog.md:2196-2203`):
account_review APPROVED, business_verification verified, quality GREEN,
throughput STANDARD, **name_status DECLINED**, **1 template na Meta
(hello_world) contra 25 rascunhos no Postgres**.

**Porta de entrada — webhook da Meta:** edge function `whatsapp-webhook`
(`supabase/functions/whatsapp-webhook/index.ts`), implantada como versão 12,
ACTIVE, `verify_jwt: false` (resultado de `list_edge_functions`). Faz:

- GET com `hub.mode`/`hub.verify_token`/`hub.challenge` contra
  `WHATSAPP_VERIFY_TOKEN` (index.ts:132-143);
- POST com validação HMAC `x-hub-signature-256` contra `WHATSAPP_APP_SECRET`,
  comparação em tempo constante (index.ts:44-67, 149-154); sempre responde 200
  para a Meta não desativar o webhook (index.ts:19-23);
- eventos administrativos (`field != 'messages'`) → INSERT em
  `public.eventos_da_waba` (index.ts:169-174; tabela criada na migration
  `0116_monitor_de_qualidade_da_waba.sql:9-17`);
- mensagens → resolve salão por `salon_por_phone_number_id`; se o número é o
  **remetente central** (`remetentes_oficiais`), clique de botão vai para as
  RPCs `responder_lembrete`/`responder_avaliacao` e o resultado é postado no
  webhook n8n `lembrete-resposta-central`; texto solto no número central é
  **logado e descartado** (index.ts:185-275);
- mensagem de salão com conexão cloud → encaminha ao n8n
  (`N8N_WHATSAPP_WEBHOOK_URL`, path `salao-atendimento`) com
  `{salon_id, phone_number_id, waba_id, contact_phone, contact_name,
  message_id, texto, media_id, tipo, contexto}` (index.ts:366-386).

**Workflows n8n que usam a API oficial** (nó nativo `n8n-nodes-base.whatsApp`):

| Workflow | Uso da Meta | Template (nó) |
|---|---|---|
| `rJO1n7cFeNDIJyB5` Atendimento | `media/mediaUrlGet` + download autenticado (nós `Buscar URL do Audio/Imagem`, `Baixar Audio/Imagem`); envio `message/send` (nós `Responder pela Cloud API` e `Responder Padrao pela Cloud API`, `onError: stopWorkflow`); entrada dupla Evolution/Cloud (nó `Adaptar Payload (Provedor)`) | — (texto livre, resposta dentro da janela) |
| `DW0nq1Jyp9xeOJwm` Lembretes | `sendTemplate` (nó `Enviar Lembrete (Template)`); resposta do botão via webhook `lembrete-resposta-central` + `message/send` (nó `Enviar Resposta de Lembrete (Cloud API)`) | `lembrete_hoje` (nó `Buscar Template Aprovado`, filtro `status='aprovado'`) |
| `NsHcELIXrETknywa` Avaliação | `sendTemplate` (nó `Enviar Pedido de Nota (Template)`), phone_number_id vem da view `avaliacoes_a_pedir` (join com `remetentes_oficiais`) | `avaliacao_pos_atendimento` |
| `Dz35hJOz7UJER1Ll` Fim de Teste | `sendTemplate` (nó `Enviar Aviso`), dados da view `vencimentos_a_avisar` | `fim_de_teste` → nome_meta `fim_do_teste_gratis` |
| `67oZqGOIoKO6pAeQ` Política de Atraso (**inativo**) | `sendTemplate` (nó `Perguntar ao Cliente`), view `atrasos_para_perguntar` | `atraso_esta_vindo` → nome_meta `cliente_atrasado` |

**Templates:** `docs/templates-para-a-meta.md` define 24 (11 lembrete + 13
recuperação). O banco (`public.whatsapp_templates`, SELECT em 2026-09-05) tem
**25 linhas, todas `status='rascunho'`, `categoria_meta` NULL** — o 25º é
`avaliacao_pos_atendimento`, que não está no documento. As views de envio da
0115 filtram `status='aprovado'` (0115:114-117, 176-179, 212-213, 270-273) —
trava no banco, fail-closed.

**Estado do banco (SELECTs de 2026-09-05):** `eventos_da_waba` = **0 linhas**;
`remetentes_oficiais` = 1 linha (`1288009817732005`, rótulo "principal", WABA
`975811062135581`, ativo); `whatsapp_connections` = 1 linha (El Guardians,
`provedor='evolution'`, `status='close'`, `phone_number_id` NULL) — o
desvínculo do número oficial da El Guardians (pendência de
`backlog.md:1614-1616`) **foi feito**; filas de envio todas vazias
(avaliações 0, vencimentos 0, reativação 0, atrasos 0).

**Execuções recentes** (search_executions, 2026-09-05): Avaliação
`NsHcELIXrETknywa` — 222 execuções, 8 mais recentes todas `success`,
sub-segundo (fila vazia). Lembretes `DW0nq1Jyp9xeOJwm` — 2.018 execuções, 8
mais recentes `success`. Atendimento `rJO1n7cFeNDIJyB5` — 18 execuções retidas,
todas `success`, as últimas de 2026-08-31 em modo `manual` (nenhum tráfego real
de cliente na janela de retenção). Política de Atraso — inativa, 0 triggers.

**Monitoramento de qualidade:** migration 0116 cria `eventos_da_waba` + ramo
`qualidade-waba:` na view `auditoria_operacao` (0116:97-103), consumido pelo
workflow de auditoria `7yliDoD9AaQp3Qcm` (nó `Buscar Achados Novos` lê
`auditoria_pendente`; e-mail com HTML escapado no nó `Montar Relatorio`).

## 2. O que está correto e por quê

- **Verificação do webhook está certa nos dois sentidos.** GET responde o
  `hub.challenge` só com `hub.mode=subscribe` e token igual, senão 403
  (index.ts:132-143); POST valida HMAC-SHA256 do corpo com comparação em tempo
  constante (index.ts:44-67). Sem `WHATSAPP_APP_SECRET` configurado, tudo é
  ignorado — **falha fechado** (index.ts:45).
- **Sempre 200 para a Meta é decisão consciente e documentada** — evita a Meta
  desativar o webhook da aplicação inteira por erros repetidos
  (index.ts:19-23); o erro vai para log, não para o status HTTP.
- **A trava de template mora no banco, num lugar só.** Todas as views de envio
  só devolvem linha com template `aprovado` (0115), e os workflows não
  reimplementam a checagem (stickies de `NsHcELIXrETknywa` e `Dz35hJOz7UJER1Ll`
  dizem isso explicitamente). Enquanto nada está aprovado, nada é enviado e
  nada é marcado — as 2.018+222 execuções verdes com fila vazia confirmam o
  fail-closed em produção.
- **Clique de botão é resolvido por `wamid` (`context.id`), nunca por texto**
  (index.ts:301-307 e RPC `responder_lembrete`) — impede cancelamento acidental
  por um "cancelar" digitado no meio de conversa, e não paga LLM por clique.
- **Envio marca depois, falha aparece.** `Dz35hJOz7UJER1Ll` marca
  `auditoria_avisos` só após o envio, sem `continueRegularOutput` (notes do nó
  `Enviar Aviso`); os dois nós de envio do agente usam `onError: stopWorkflow`
  (correção pós-execução 9140, `backlog.md:956-965`) — falha de envio não vira
  histórico falso.
- **Status de entrega não vira linha em `eventos_da_waba`.** `statuses` chega
  com `field='messages'` e o INSERT só ocorre com `field != 'messages'`
  (index.ts:169-174, 199, 280) — o teste de borda sugerido em
  `backlog.md:1650-1651` passa por construção.
- **O detalhe do evento da WABA é escapado no e-mail da auditoria**
  (`Montar Relatorio` escapa `&<>` antes do HTML) — a reconferência pedida em
  `backlog.md:1651-1653` confere.
- **Alertas internos fora do canal pago** (e-mail via SMTP) — elimina template
  de texto arbitrário que a Meta recusaria e o custo por alerta
  (sticky de `7yliDoD9AaQp3Qcm`).
- **Fragmentação futura por número já tem esqueleto**:
  `salons.remetente_phone_number_id` + ordenação no lateral join das views
  (0115:31-33, 80-85) — nota de qualidade e tier são por número.

## 3. O que está errado ou incompleto

1. **CRÍTICO — Nenhum dos 25 templates foi submetido à Meta; o canal oficial
   inteiro está mudo.** Evidência: SELECT em `whatsapp_templates` (25 linhas
   `rascunho`, `categoria_meta` NULL); `backlog.md:2200-2201` ("1 na Meta
   (hello_world) contra 25 rascunho... nunca foram submetidos"); filas
   `avaliacoes_a_pedir`/`vencimentos_a_avisar`/`clientes_para_reativar`/
   `atrasos_para_perguntar` todas com 0 linhas. Impacto: lembrete, avaliação,
   reativação, aviso de vencimento e política de atraso — as automações que
   justificam o produto — não enviam nada, e o n8n roda verde por cima
   (fail-closed mascarando funcionalidade morta). Correção sugerida: submeter
   `lembrete_hoje` primeiro e sozinho (o caminho crítico segundo
   `templates-para-a-meta.md:15-23`), registrar `status`/`categoria_meta` no
   banco, depois o lote.

2. **ALTO — O workflow de Lembretes ainda busca o `phone_number_id` na conexão
   do PRÓPRIO salão, não no remetente central — no modelo híbrido atual ele
   nunca vai enviar, mesmo com template aprovado.** Evidência: workflow
   `DW0nq1Jyp9xeOJwm`, nó `Buscar Instância do Salão` lê `conexoes_ativas` por
   `salon_id` + `conectado=true` e o nó `Instância Encontrada?` exige
   `phone_number_id`; o envio usa
   `$('Buscar Instância do Salão').item.json.phone_number_id`. Só que a única
   conexão existente é `provedor='evolution'` com `phone_number_id` NULL
   (SELECT em `whatsapp_connections`), e a decisão do híbrido é lembrete sair
   pelo número da plataforma (`backlog.md:1562-1563`). A 0115 desamarrou as
   views de reativação/atraso/vencimento, mas o lembrete não passa por view —
   monta a fila com nós Supabase dentro do workflow e ficou para trás. Impacto:
   quando os templates forem aprovados, avaliação/vencimento/reativação passam
   a enviar e o lembrete — o recurso mais usado — continua caindo no ramo
   `Sem Instância - Pula Lembrete` em silêncio, com execução verde. Correção
   sugerida: trocar a origem do `phone_number_id` para `remetentes_oficiais`
   (mesmo lateral join das views da 0115), ou mover a fila do lembrete para uma
   view `lembretes_a_enviar` com a mesma trava.

3. **ALTO — O monitor de qualidade da WABA está cego: zero eventos recebidos e
   os campos do webhook não foram assinados no painel.** Evidência:
   `eventos_da_waba` com 0 linhas (SELECT); pendência explícita em
   `backlog.md:1608-1610` ("assinar os campos `phone_number_quality_update` e
   `account_update` — sem isso a Meta não envia os eventos que o monitor
   escuta"). Impacto: o ramo `qualidade-waba` da auditoria (0116:97-103) nunca
   pode disparar; queda de nota do número central — que carrega os lembretes de
   TODAS as barbearias — só seria notada manualmente no WhatsApp Manager.
   Correção sugerida: assinar os campos no painel do app (e também
   `message_template_status_update`, ver item 8) e provocar um evento de teste
   para ver a linha nascer e o alerta sair.

4. **MÉDIO — Resposta digitada ao lembrete no número central é descartada.**
   Evidência: index.ts:270-274 ("texto solto no número de avisos... registra e
   segue"); a Fase 2 do híbrido previa "resposta educada a texto solto"
   (`backlog.md:1583-1586`), ainda não feita. Impacto: o template
   `lembrete_hoje` pergunta "Voce vem?" — parte dos clientes responde digitando
   "sim" em vez de apertar o botão; a confirmação se perde e o cliente fica no
   vácuo num número que não conversa. Correção sugerida: resposta automática
   fixa apontando o wa.me da barbearia (não precisa de template — a mensagem do
   cliente abre janela de 24h).

5. **MÉDIO — Eventos `statuses` (entregue/lido/falhou) são descartados nos dois
   ramos; não há visibilidade de entrega dos templates.** Evidência:
   index.ts:199 e 280 (`if (valor.statuses?.length) continue`). Os workflows
   marcam sucesso quando a API aceita (wamid devolvido) — `Marcar Como Avisado`
   / `Guardar wamid do Lembrete` / `marcar_avaliacao_pedida`. Impacto: template
   aceito mas não entregue (número sem WhatsApp, throttling por qualidade, par
   de mensagens fora da janela) fica registrado como enviado, sem rastro — o
   mesmo padrão do histórico falso que a execução 9140 já ensinou
   (`backlog.md:956-959`). Correção sugerida: gravar ao menos `status=failed`
   por wamid (tabela pequena ou coluna em `reativacao_envios`/`appointments`).

6. **MÉDIO — As views de reativação/retorno não têm consumidor no n8n.**
   Evidência: `clientes_para_reativar` e `clientes_para_avisar_retorno`
   existem e devolvem template + parâmetros (0115:58-179), mas nenhum dos 13
   workflows ativos as lê (search_workflows + inspeção dos JSONs; os únicos
   leitores de views de envio são os 4 workflows da tabela da seção 1).
   Impacto: aprovado o template, a reativação — vendida como entregue
   (`backlog.md:918`) — continua sem enviar nada, silenciosamente. Correção
   sugerida: criar o workflow de envio de reativação nos moldes do de
   Avaliação (mesma mecânica de marcar após enviar em `reativacao_envios`).

7. **MÉDIO — `docs/templates-para-a-meta.md` está desatualizado para o
   cadastro: faltam `avaliacao_pos_atendimento` e as chaves reais do banco.**
   Evidência: doc diz 24 templates (linha 6, gerado 2026-08-20); banco tem 25 —
   o ausente é justamente o único usado por workflow ATIVO da oficial
   (`NsHcELIXrETknywa`). O doc também referencia por `nome_meta` enquanto o
   exemplo SQL usa `chave = 'lembrete_confirmacao'`
   (templates-para-a-meta.md:27-31) — quem cadastrar pelo doc não submete o da
   avaliação. Impacto: submissão incompleta no momento mais crítico. Correção
   sugerida: regenerar o doc a partir de `whatsapp_templates` (a tabela é a
   fonte declarada, linha 3-5).

8. **BAIXO — Todo evento em `eventos_da_waba` vira alerta 'grave', qualquer que
   seja o campo.** Evidência: 0116:97-103 (sem filtro de `campo`, gravidade
   fixa). Se `message_template_status_update` for assinado (útil para saber da
   aprovação dos 25 templates), cada aprovação vira alerta grave de "Aviso da
   Meta sobre o numero central". Correção sugerida: gravidade por campo.

9. **BAIXO — Falha ao marcar avaliação pedida gera reenvio a cada 30 min.**
   Evidência: `NsHcELIXrETknywa`, nó `Marcar Avaliacao Pedida` com
   `onError: continueRegularOutput` — se o envio der certo e a RPC falhar, o
   cliente continua elegível na view e recebe o template de novo no próximo
   ciclo. Correção sugerida: falha na marcação deve parar e alertar (o inverso
   do envio).

10. **BAIXO — `docs/whatsapp-api-oficial.md` descreve a arquitetura abandonada
    sem faixa de obsolescência.** Evidência: seções 3-5 (Embedded Signup por
    barbearia, `phone_number_id` em `whatsapp_connections`, coexistência por
    barbearia) contradizem a 0115/backlog:1560-1566 (número central da
    plataforma, barbearia na Evolution). O manual "Registro WhatsApp" foi
    aposentado (`backlog.md:1625-1628`), este doc não. Correção sugerida: faixa
    de obsolescência no topo apontando o modelo híbrido.

## 4. O que ainda não quebrou mas vai virar problema em produção

- **1º de outubro de 2026 — fim da gratuidade da mensagem de serviço e da
  utility dentro da janela** (`docs/whatsapp-api-oficial.md:29-43`). O híbrido
  reduziu a exposição (conversa saiu da Meta), mas TODO clique de botão
  respondido pelo número central e todo template passam a custar; as tarifas
  finais do Brasil precisam ser confirmadas (o doc se baseia em fontes
  secundárias e pede verificação após 01/09 — ainda não registrada no repo).
- **Um único número central para todas as barbearias.** Nota de qualidade e
  tier são por número (0115:10-12); uma onda de denúncias de reativação
  derruba lembrete, avaliação e vencimento de todos os clientes de uma vez — e
  hoje o monitor está cego (achado 3). A fragmentação
  (`salons.remetente_phone_number_id`) existe no schema mas não há segundo
  número em `remetentes_oficiais`.
- **`verify_jwt` da `whatsapp-webhook` vive só no painel.** Implantada com
  `verify_jwt: false` (list_edge_functions), mas `supabase/config.toml` não
  tem entrada para ela (grep sem resultado; dívida já anotada em
  `backlog.md:1543`). Um deploy futuro com default `true` faria a Meta receber
  401 e, após falhas repetidas, desativar o webhook do app inteiro.
- **Assinatura inválida devolve 200 com log.** Correto para a Meta, mas se o
  `WHATSAPP_APP_SECRET` for rotacionado errado, todas as mensagens somem em
  silêncio — só `console.error` (index.ts:149-154). Nenhum alerta cobre "zero
  mensagens chegando".
- **Retenção de execuções do n8n é curta** (18 execuções para o fluxo
  principal): quando o tráfego oficial voltar, diagnóstico de incidente pela
  API do n8n terá janela pequena.
- **name_status DECLINED** (`backlog.md:2199`): enquanto não reenviar, o nome
  de exibição do número central não é o da marca — cliente recebe lembrete de
  um número sem nome verificado, o que aumenta denúncia (que alimenta o risco
  do item acima).
- **`retorno_faltou` e a família marketing** (`templates-para-a-meta.md:145-199`):
  quando forem submetidos, recategorizações para `marketing` multiplicam o
  custo por ~9x; a view `templates_recategorizados` citada no doc precisa ser
  vigiada no momento da aprovação (não auditada aqui — fora das filas ativas).

## 5. Interfaces: o que ENTREGA e o que CONSOME

**ENTREGA (lado Meta → sistema):**

| Contrato | Detalhe |
|---|---|
| Rota `GET /functions/v1/whatsapp-webhook` | verificação: `hub.mode=subscribe`, `hub.verify_token` == secret `WHATSAPP_VERIFY_TOKEN`, ecoa `hub.challenge` (index.ts:132-143) |
| Rota `POST /functions/v1/whatsapp-webhook` | header `x-hub-signature-256` (HMAC-SHA256 do corpo com `WHATSAPP_APP_SECRET`); payload `entry[].changes[].{field,value}`; sempre HTTP 200 |
| Tabela `public.eventos_da_waba` | colunas `campo` (field do webhook, ex. `phone_number_quality_update`, `account_update`), `evento` (jsonb), `criado_em`; RLS sem policy (service_role) — 0116:9-17 |
| POST → n8n `webhook/salao-atendimento` (secret `N8N_WHATSAPP_WEBHOOK_URL`) | corpo `{salon_id, phone_number_id, waba_id, contact_phone, contact_name, message_id, texto, media_id, tipo: texto\|botao\|audio\|imagem\|video\|documento, contexto}` (index.ts:366-386) |
| POST → n8n `webhook/lembrete-resposta-central` (secret `N8N_LEMBRETE_RESPOSTA_URL`) | corpo `{salon_id, phone_number_id, contact_phone, appointment_id, acao (confirmar\|cancelar\|reagendar_central\|avaliacao...), resposta, nota, avisar_dono}` (index.ts:228-265) |
| View `auditoria_operacao`, ramo chave `qualidade-waba:<id>` | alerta 'grave' com `campo` + 500 chars do evento (0116:97-103), consumido por `auditoria_pendente` → e-mail |

**CONSOME (sistema → lado Meta):**

| Contrato | Detalhe |
|---|---|
| Cloud API `message/send` (texto) | nós `Responder pela Cloud API`/`Responder Padrao pela Cloud API` (`rJO1n7cFeNDIJyB5`), `Enviar Resposta de Lembrete (Cloud API)` (`DW0nq1Jyp9xeOJwm`) — só dentro da janela de 24h aberta pelo cliente/clique |
| Cloud API `message/sendTemplate` | nós `Enviar Lembrete (Template)`, `Enviar Pedido de Nota (Template)`, `Enviar Aviso`, `Perguntar ao Cliente`; formato `nome_meta\|idioma` + `template_parametros` (body) |
| Cloud API `media/mediaUrlGet` + GET autenticado | nós `Buscar URL do Audio/Imagem` + `Baixar Audio/Imagem` (URL expira em minutos — `docs/n8n-cloud-api-entrada.md:44-49`) |
| Credenciais n8n (só nomes) | `WhatsApp account` (tipo `whatsAppApi`); `Authorization` (tipo `httpHeaderAuth`, header da Graph API — `backlog.md:979-985`; não confundir com a SMTP de nome parecido) |
| Tabelas/views lidas | `remetentes_oficiais(phone_number_id, waba_id, ativo)`; `salons.remetente_phone_number_id`; `whatsapp_connections(provedor, phone_number_id, waba_id, status)`; `conexoes_ativas(conectado)`; `whatsapp_templates(chave, nome_meta, idioma, status, categoria_meta, ativo)`; views de fila `avaliacoes_a_pedir`, `vencimentos_a_avisar`, `clientes_para_reativar`, `clientes_para_avisar_retorno`, `atrasos_para_perguntar` — todas expõem `phone_number_id`, `destino`, `template`, `template_idioma`, `template_parametros` |
| RPCs | `salon_por_phone_number_id(p_phone_number_id)`; `responder_lembrete(p_message_id, p_botao)`; `responder_avaliacao(p_message_id, p_botao)`; `marcar_avaliacao_pedida(p_client_id, p_salon_id, p_order_id, p_message_id)` — casamento sempre por wamid |
| Campos de correlação | `appointments.lembrete_message_id` (wamid do template de lembrete); `messages[0].id` da resposta da Cloud API |

## 6. NÃO VERIFICADO

| Item | Motivo | O que o dono precisa fornecer/checar |
|---|---|---|
| **Tipo e validade do token** nas credenciais `WhatsApp account` e `Authorization` | n8n nunca expõe segredo; nenhuma âncora no repo diz se é o token permanente de usuário do sistema (passo 5 de `whatsapp-api-oficial.md:374-385`) ou um token de painel de 24h | Confirmar em Business Manager → Usuários do sistema que o token em uso é de system user com validade "Nunca" e permissões `whatsapp_business_messaging` + `whatsapp_business_management`; anotar a data de criação |
| **Qual credencial está atada aos nós `whatsApp`** | a API do n8n omite o bloco `credentials` dos nós (mesma limitação registrada em `backlog.md:1641-1643`) | Abrir os nós na UI do n8n e conferir |
| **Campos assinados no webhook do app** (`messages`, `message_template_status_update`, `phone_number_quality_update`, `account_update`) e a URL de callback configurada | só o painel da Meta mostra; `eventos_da_waba` vazio sugere que os campos administrativos NÃO estão assinados (pendência `backlog.md:1608-1610`), mas ausência de evento não prova ausência de assinatura | Painel do app → WhatsApp → Configuração → Webhook → Gerenciar |
| **Status real dos templates na Meta hoje** | sem token não há `GET /<waba>/message_templates`; a última âncora é o snapshot de 2026-09-04 (`backlog.md:2200`: só hello_world) | Conferir/submeter no WhatsApp Manager → Message templates |
| **messaging_limit_tier do número central** | ilegível até com token de management (`backlog.md:2202-2203`) | WhatsApp Manager → número → limites de envio |
| **Nota de qualidade ATUAL do número** | snapshot de 09-04 dizia GREEN; sem webhook de qualidade nem token, não há leitura de hoje | WhatsApp Manager → qualidade do número |
| **Reenvio do nome de exibição** (name_status DECLINED, `backlog.md:2199`) | ação e status só no painel | Reenviar "Club Cut" e anotar resultado |
| **Valores dos secrets** `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `N8N_WHATSAPP_WEBHOOK_URL`, `N8N_LEMBRETE_RESPOSTA_URL` nas edge functions | não há MCP para secrets do Supabase (mesma limitação registrada para o Asaas em `backlog.md:2215-2219`); o código só loga quando faltam | Conferir no painel Supabase → Edge Functions → Secrets (a pendência do `N8N_LEMBRETE_RESPOSTA_URL` já era aberta em `backlog.md:1643-1646`) |
| **Tarifas finais do Brasil pós-01/10/2026** | doc baseia-se em fontes secundárias e exige confirmação (`whatsapp-api-oficial.md:40-43`) | Página oficial de preços da Meta |
| **Workflow arquivado consumindo as views de reativação** | search_workflows não lista arquivados; nos 13 ativos não há consumidor | Conferir arquivados na UI do n8n antes de criar o workflow do achado 6 |
