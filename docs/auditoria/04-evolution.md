# Auditoria — Componente EVOLUTION (canal WhatsApp não-oficial)

**Data:** 2026-09-05. Auditoria somente-leitura, por três vias: JSON dos workflows do n8n
(MCP n8n), SELECTs no Supabase de produção (`bukhpvvybeltmhtwamox` — confirmado como o
projeto do CRM por `docs/n8n-integration.md:62`) e painel da Hostinger (VPS 1833354).
A API da própria Evolution **não** foi consultada (exigiria credencial — fora da regra).
Nenhum valor de segredo aparece aqui; apenas nomes de variáveis e contratos.

---

## 1. O que existe hoje

**Onde a Evolution roda.** VPS Hostinger `srv1833354.hstgr.cloud` (id 1833354, plano KVM 2:
2 vCPU, 8 GB RAM, 100 GB disco, template "Ubuntu 24.04 with Docker and Traefik",
IPv4 179.197.78.181). Projeto Docker Compose `evolution-api-8lfe`
(`/docker/evolution-api-8lfe/docker-compose.yml`) com 3 containers, todos `running`:

| Container | Imagem | Estado | Porta |
|---|---|---|---|
| `evolution-api-8lfe-api-1` | `evoapicloud/evolution-api:latest` | Up 4 dias | 8080 → publicada em `0.0.0.0:32770` **e** via Traefik em `https://evolution-api-8lfe.srv1833354.hstgr.cloud` (letsencrypt) |
| `evolution-api-8lfe-postgres-1` | `postgres:15` | Up 4 dias | 5432 só interna |
| `evolution-api-8lfe-redis-1` | `redis:latest` | Up 4 dias | 6379 só interna |

Config relevante do compose (painel Hostinger, nomes apenas): `AUTHENTICATION_API_KEY`
(variável `API_KEY`), `DATABASE_PROVIDER=postgresql`, `DATABASE_SAVE_DATA_*` todos true,
`DEL_INSTANCE=false`, `CACHE_REDIS_ENABLED=true`, `QRCODE_LIMIT=30`,
`TELEMETRY_ENABLED=false`, `CORS_ORIGIN='*'`,
`AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true`, integração de sessão como
"Evolution API V2"/Chrome. Volumes persistentes: `postgres_data`, `redis_data`,
`evolution_instances`. No mesmo VPS rodam `n8n-m5uf` (n8n, porta 32769) e `traefik`.
O VPS **não tem firewall da Hostinger** (lista de firewalls vazia; `firewall_group_id: null`).
Backups semanais do VPS existem (2026-09-03 e 2026-08-27, VPS_getBackupsV1).

**Instâncias e estado, pelo banco.** A tabela `whatsapp_connections`
(colunas: `salon_id`, `instance_name`, `status`, `provedor`, `phone_number_id`, `waba_id`,
`updated_at`) tem **exatamente 1 linha**:

| Salão | instance_name | provedor | status | updated_at |
|---|---|---|---|---|
| El Guardians (`4748d5b4-9184-4a70-add9-02c1dda88f12`) | `salon-4748d5b4-9184-4a70-add9-02c1dda88f12` | `evolution` | **`close`** | 2026-09-04 08:09 UTC |

Ou seja: **hoje não há nenhuma instância Evolution conectada** segundo o banco.
Contexto importante: o banco de produção foi **re-semeado em 2026-09-04** — `salons` tem
1 linha (criada 2026-09-04 02:52), `appointments` = 0, `whatsapp_messages` = 0,
`whatsapp_conversations` = 0, e as migrations agora usam versão por timestamp
(153 aplicadas, última `20260904041946`). As barbearias Curitiba e São José citadas em
`docs/estado-do-projeto.md` **não existem mais no banco**. O que o servidor Evolution
ainda guarda de instâncias antigas não é visível por esta via (ver seção 6).

A view `conexoes_ativas` define conectividade por provedor:
`evolution → status = 'open'`; `cloud_api → phone_number_id is not null`
(pg_get_viewdef em produção). `remetentes_oficiais` tem 1 remetente ativo
(`rotulo='principal'`, phone_number_id `1288009817732005`) — é o lado Meta do híbrido,
fora do escopo Evolution.

**Como uma instância nasce e conecta (QR).** Quem faz é o **CRM + edge function**, não o n8n:

1. `src/features/conexao/ConexaoPage.tsx:30-44` chama a edge function `whatsapp`
   com `action: 'connect' | 'status' | 'disconnect'` e `salonId`.
2. `supabase/functions/whatsapp/index.ts` (action `connect`, linhas 106-178):
   `POST /instance/create` (`integration: 'WHATSAPP-BAILEYS'`, nome
   `salon-<uuid>` via `_shared/instanceName.ts`), depois `POST /settings/set/{instance}`
   com `_shared/evolutionConfig.json` (`groupsIgnore: true` etc.), depois
   `POST /webhook/set/{instance}` apontando para a env `N8N_WEBHOOK_URL` com
   `webhookBase64: true` e eventos `["MESSAGES_UPSERT","SEND_MESSAGE"]`
   (`evolutionConfig.json:4`), e por fim `GET /instance/connect/{instance}` que devolve o
   QR em base64 para a tela. Upsert em `whatsapp_connections` com `status='connecting'`.
   A tela trata a validade do QR (`QR_VALIDADE_MS = 40_000`, `ConexaoPage.tsx:28`).
3. `action: 'status'` consulta `GET /instance/connectionState/{instance}` e faz upsert do
   status (`open`/`connecting`/`close`) — é **o único mecanismo que atualiza o status**
   (grep: só `whatsapp/index.ts` escreve em `whatsapp_connections`; nenhum job do
   `cron.job` toca a tabela).
4. `action: 'disconnect'` chama `DELETE /instance/logout/{instance}` e grava `close`.

Backfill/limpeza manuais: `scripts/evolution-aplicar-config.mjs` (reaplica settings+webhook
em todas as instâncias) e `scripts/evolution-remover-instancias.mjs` (remove instâncias
órfãs — o cabeçalho documenta que apagar a barbearia no banco **não** remove a instância).

**Webhook Evolution → n8n.** A Evolution posta **direto** no n8n, sem edge function no
meio: workflow `CRM Salão - Atendimento WhatsApp (Supabase Nativo)` (`rJO1n7cFeNDIJyB5`,
ativo), trigger `Webhook da Edge Function` = `POST /webhook/salao-atendimento`, **sem
autenticação nenhuma** (parâmetros do nó: só `path` e `httpMethod`; `options: {}`).
O mesmo path recebe também o canal oficial (a edge `whatsapp-webhook` encaminha para a env
`N8N_WHATSAPP_WEBHOOK_URL`). O nó `Adaptar Payload (Provedor)` (Code) distingue os dois:
payload com `body.event` ou `data.key.remoteJid` é Evolution; aceita só
`event === 'messages.upsert'`, descarta `key.fromMe === true`, extrai
`contact_phone` do `remoteJid`, e **deriva o tenant do nome da instância por corte de
string**: `instance.slice('salon-'.length)` → `salon_id`. No ramo Evolution o fluxo segue
por `Provedor É Evolution? (Instância)` **direto para `Extrair Salon ID`**, pulando o nó
`Buscar Instância Conectada` (que só roda no ramo cloud, resolvendo por
`phone_number_id` em `whatsapp_connections`). Mídia: espera `audioMessage.base64` /
`imageMessage.base64` no próprio payload (por isso o `webhookBase64: true` no set do
webhook), converte para binário e manda para transcrição/visão (OpenAI).

**Envio pela Evolution.** No agente há exatamente 2 nós que chamam a Evolution:
`Responder pela Evolution (Agente)` e `Responder pela Evolution (Padrão)`, ambos
`POST https://evolution-api-8lfe.srv1833354.hstgr.cloud/message/sendText/{{instance_name}}`
com corpo `{ number, text }`, atrás dos IFs `Rotear Envio (Agente/Padrão)`
(`provedor === 'evolution'`). Os pares Cloud (`Responder pela Cloud API`) têm
`retryOnFail: true, maxTries: 3, onError: stopWorkflow`; **os nós Evolution não têm retry
nem onError configurados**. A gravação em `whatsapp_messages` (`Inserir Mensagem do
Agente`) acontece **antes** do envio (`Formatar para WhatsApp` → `Inserir Mensagem do
Agente` → `Rotear Envio (Agente)`). Fora do agente, **nenhum outro workflow chama a
Evolution**: Lembretes (`DW0nq1Jyp9xeOJwm`), Aviso de Fim de Teste (`Dz35hJOz7UJER1Ll`),
Política de Atraso (`67oZqGOIoKO6pAeQ`, desligado) e Avaliação Pós-Atendimento
(`NsHcELIXrETknywa`, cuja descrição diz "NÃO usa Evolution") enviam por `sendTemplate` /
`send` na Cloud API. A edge function `whatsapp` também envia (`action: 'send'`,
`index.ts:225`) — sempre via Evolution `sendText`, sem checar `provedor`.

**Alerta de queda.** A peça real é SQL + e-mail, não um monitor da Evolution:
a view `auditoria_operacao` (migration `0053_alerta_de_whatsapp_caido.sql`, ramo
`'whatsapp-caiu'`) acusa salão ativo e atendendo com `wc.status <> 'open'` **que já trocou
mensagens**; o workflow `CRM Salao - Auditoria do Agente` (`7yliDoD9AaQp3Qcm`) lê
`auditoria_pendente` a cada 30 min e manda **e-mail** ao destino de `canal_de_alertas`
(nó `Enviar Relatorio`, emailSend com retry 3x), marcando `auditoria_avisos` depois do
envio. O monitor de qualidade (`eventos_da_waba`, migration 0116) cobre só o número
central da **Meta**, não a Evolution.

**Execuções reais.** O histórico do agente tem 18 execuções: as últimas por webhook são de
2026-08-23; as de 2026-08-31 são todas `manual` (testes do híbrido). Bate com
`docs/backlog.md:1647`: "Ramo Evolution do agente ainda sem execução real".

**O híbrido como mitigação do banimento** (âncoras: `docs/backlog.md:1560-1566`,
`docs/whatsapp-api-oficial.md:1-44`): conversa com o cliente sai pelo número REAL da
barbearia via Evolution (custo zero por mensagem; banimento atinge o número daquela
barbearia, não o remetente central); lembrete/reativação/avisos saem do número DA
PLATAFORMA na Cloud API com template (`remetentes_oficiais` + views fail-closed da
migration 0115). O risco residual do canal não-oficial fica confinado à conversa.

## 2. O que está correto e por quê

- **O contrato de nomes é um só e testado.** `_shared/instanceName.ts` concentra as duas
  direções `salon-<uuid>` ↔ `salon_id`, valida UUID e devolve `null` em vez de palpite —
  crítico porque o n8n grava com `service_role` (comentário do próprio arquivo, linhas 1-15).
- **Provisionamento idempotente e com feedback.** `whatsapp/index.ts` reaplica settings e
  webhook a cada `connect` (linhas 117-157) e devolve `webhookOk`/`settingsOk` à tela — o
  dono não fica "conectado e mudo" sem aviso. `groupsIgnore: true` impede o agente de
  responder em grupo; `webhookBase64: true` é exatamente o que o ramo de mídia do n8n
  consome.
- **Autorização no provisionamento.** A edge `whatsapp` exige JWT, resolve o salão por
  `user_salons` com papel `owner|gerente` e aceita `salonId` explícito para redes
  (`index.ts:88-103`) — o dono não conecta a unidade errada.
- **`conexoes_ativas` desacopla o vocabulário do provedor.** `conectado` é
  `status='open'` só para Evolution; workflows leem a view, não a string da Evolution
  (view def em produção; sticky note dos Lembretes registra o porquê).
- **O roteamento por provedor no agente é coerente nas duas pontas.** Entrada dupla
  (`Adaptar Payload (Provedor)`) e saída roteada (`Rotear Envio`), convergindo no mesmo
  log/preview — a Curitiba pôde voltar ao ar sem duplicar fluxo (backlog, Fase 2).
- **Exposição TLS via Traefik** com certresolver letsencrypt para o hostname da API, e
  containers de dados (postgres/redis) sem porta publicada.
- **Persistência e sobrevivência a restart.** Volumes nomeados para instâncias, banco e
  redis (appendonly); `DEL_INSTANCE=false` evita perda de instância por instabilidade;
  `restart: unless-stopped`. Backups semanais do VPS inteiro existem.
- **O alerta de queda distingue incidente de estado esperado.** Só alarma quem já trocou
  mensagem e está dentro do prazo de atendimento (0053, linhas 38-65) — alarme que sempre
  toca é ignorado. E o canal do alerta é e-mail (0090-0092), resolvendo o defeito apontado
  no próprio 0053 de o alarme sair pela coisa vigiada.
- **QR com validade tratada na tela** (`QR_VALIDADE_MS`, achado 45 da revisão de 01/09) e
  limpeza de órfãs possível por script dedicado com `--dry-run`.

## 3. O que está errado ou incompleto

**3.1 — CRÍTICO. Webhook do agente sem autenticação + tenant derivado de string, com a URL pública.**
- **Evidência:** nó `Webhook da Edge Function` (`rJO1n7cFeNDIJyB5`) tem só
  `path: salao-atendimento`, `httpMethod: POST`, `options: {}` — nenhum header/token; o ramo
  Evolution vai de `Provedor É Evolution? (Instância)` direto a `Extrair Salon ID` sem
  passar por `Buscar Instância Conectada` (wiring extraído do JSON); o `salon_id` é
  `instance.slice('salon-'.length)` sem validação no banco. A URL completa está escrita em
  `docs/n8n-cloud-api-entrada.md:89`, e o repositório é **público**
  (`docs/backlog.md:1557-1558`).
- **Impacto prático:** qualquer um que leia o repositório pode forjar um payload
  "Evolution" com `instance: salon-<uuid-do-salão>` e (a) injetar mensagens falsas na
  conversa de qualquer salão — gravadas com `service_role`, sem RLS que impeça — e
  (b) fazer o número REAL da barbearia responder via `sendText` para um telefone escolhido
  pelo atacante: spam saindo do WhatsApp do barbeiro, o exato gatilho de banimento que o
  híbrido tenta evitar. Hoje o estrago é limitado porque só existe 1 salão e a instância
  está `close`, mas o buraco é estrutural.
- **Correção sugerida (não aplicada):** header secreto no `/webhook/set` da Evolution
  (campo `headers` do webhook) conferido no primeiro nó do fluxo; e, no ramo Evolution,
  validar `instance_name` contra `whatsapp_connections` (provedor + existência) antes de
  agir. Remover a URL do webhook dos docs do repositório público (ou fechar o repositório).

**3.2 — ALTO. Ninguém observa a conexão cair: o status só muda quando o dono abre a tela.**
- **Evidência:** eventos assinados no webhook são só `MESSAGES_UPSERT` e `SEND_MESSAGE`
  (`evolutionConfig.json:4`) — não há `CONNECTION_UPDATE`; o único escritor de
  `whatsapp_connections.status` é a edge `whatsapp` (`index.ts:170-207`), chamada apenas
  pela `ConexaoPage`; nenhum job em `cron.job` (7 jobs listados em produção) atualiza
  status; o alerta `'whatsapp-caiu'` (0053) lê exatamente essa coluna.
- **Impacto prático:** a instância cai (celular desligado, logout, Baileys derrubado) e
  `status` continua `open` no banco até alguém abrir `/conexao`. O "alerta de queda" da
  vitrine de Vigilância (`docs/estado-do-projeto.md:30`) fica cego no caso mais comum —
  detecta a queda que o dono já viu, não a que ninguém viu. Clientes escrevem, nada
  responde, e o e-mail de alerta nunca sai.
- **Correção sugerida:** assinar `CONNECTION_UPDATE` no webhook da Evolution e tratar o
  evento (n8n ou edge) atualizando `whatsapp_connections.status`; ou um job periódico que
  chame `connectionState` de cada instância com `provedor='evolution'`.

**3.3 — ALTO. Envio Evolution sem retry, e o histórico é gravado antes do envio.**
- **Evidência:** `Responder pela Evolution (Agente)` e `(Padrão)` sem `retryOnFail`/
  `onError` (dump dos nós), enquanto `Responder pela Cloud API` tem
  `retryOnFail: true, maxTries: 3`; ordem no wiring: `Inserir Mensagem do Agente` →
  `Rotear Envio (Agente)` → envio.
- **Impacto prático:** um 5xx/timeout momentâneo da Evolution mata a execução sem nova
  tentativa, e `whatsapp_messages` fica com a resposta do agente registrada como se
  entregue — o dono vê a conversa "respondida" no CRM, o cliente não recebeu nada, e não
  há reconciliação.
- **Correção sugerida:** espelhar o retry dos nós Cloud nos nós Evolution; ou mover a
  gravação para depois do envio (como o Aviso de Fim de Teste faz, sticky note do
  `Dz35hJOz7UJER1Ll`: "Marcar vem DEPOIS do envio").

**3.4 — ALTO. Evolution e n8n expostos em HTTP puro na porta alta, sem firewall.**
- **Evidência:** compose publica `0.0.0.0:32770→8080` (Evolution) e `0.0.0.0:32769→5678`
  (n8n) (VPS_getProjectListV1); lista de firewalls da Hostinger vazia e
  `firewall_group_id: null` na VM (VPS_getFirewallListV1 / getVirtualMachinesV1).
- **Impacto prático:** a API da Evolution responde em `179.197.78.181:32770` sem TLS,
  protegida só pela `AUTHENTICATION_API_KEY` — tráfego em claro e superfície para força
  bruta/scan, contornando o Traefik. (Firewall interno da VM não verificável por esta via
  — ver seção 6.)
- **Correção sugerida:** parar de publicar as portas no host (Traefik alcança pela rede
  do Docker) ou firewall da Hostinger liberando só 80/443/SSH.

**3.5 — MÉDIO. No híbrido, salão pareado na Evolution não recebe lembrete — e hoje nenhum template está aprovado.**
- **Evidência:** no fluxo de Lembretes (`DW0nq1Jyp9xeOJwm`), `Buscar Instância do Salão`
  lê `conexoes_ativas` e `Enviar Lembrete (Template)` usa
  `$('Buscar Instância do Salão').item.json.phone_number_id` — o phone_number_id **do
  salão**, não o remetente central de `remetentes_oficiais` (a migration 0115 desamarrou
  reativação/atrasos/vencimentos, mas não este fluxo); a única linha de
  `whatsapp_connections` tem `phone_number_id = null` → cai em "Sem Instância - Pula
  Lembrete". E `whatsapp_templates` tem **25 linhas, todas `rascunho`** (SELECT em
  produção) — as views fail-closed devolvem vazio.
- **Impacto prático:** o lembrete de 1h — parte do valor central do Pro — não sai para
  nenhuma barbearia do modelo híbrido (Evolution), mesmo quando houver template aprovado,
  porque o fluxo procura o remetente no lugar errado. Hoje nada sai de template nenhum.
- **Correção sugerida:** apontar o lembrete para o remetente central (mesmo padrão da
  0115) e submeter/aprovar `lembrete_hoje` primeiro (ordem já documentada em
  `docs/whatsapp-retomar.md:99-106`).

**3.6 — MÉDIO. Resposta do barbeiro pelo celular não pausa o agente (fromMe descartado).**
- **Evidência:** `Adaptar Payload (Provedor)`: `if (key.fromMe === true) continue;`
  eventos `SEND_MESSAGE` são assinados (`evolutionConfig.json:4`) mas o código só aceita
  `messages.upsert`; `agent_paused` só é ligado pelo `send` do CRM
  (`whatsapp/index.ts:254-257`).
- **Impacto prático:** o barbeiro responde pelo celular (o caso de uso que justificou o
  híbrido), o agente não fica sabendo e responde por cima — cliente com duas conversas
  paralelas. O espelho do atendimento manual também não entra em `whatsapp_messages`.
- **Correção sugerida:** tratar o evento fromMe/`SEND_MESSAGE` marcando `agent_paused`
  (ou registrando a mensagem do dono), em vez de descartar.

**3.7 — MÉDIO. `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true` e `CORS_ORIGIN='*'`.**
- **Evidência:** compose do projeto `evolution-api-8lfe` (painel Hostinger).
- **Impacto prático:** qualquer chamada autenticada a `fetchInstances` devolve também os
  tokens por instância — combinado com 3.4, um vazamento da chave global expõe todas as
  instâncias de uma vez; CORS aberto permite uso da API por qualquer origem de navegador.
- **Correção sugerida:** desligar a exposição no fetch e restringir CORS aos consumidores
  reais (edge functions e n8n não precisam de CORS).

**3.8 — MÉDIO. Imagem `evolution-api:latest`, versão não pinada.**
- **Evidência:** compose (`image: evoapicloud/evolution-api:latest`); container `api`
  "Up 4 days" vs n8n/traefik "Up 7 weeks" (houve recreate recente).
- **Impacto prático:** qualquer recreate pode trocar a versão silenciosamente; quebras de
  Baileys entre versões são comuns e derrubariam todas as instâncias de uma vez, sem
  changelog do que mudou.
- **Correção sugerida:** pinar a tag da versão homologada (o comentário de
  `evolutionConfig.json` cita v2.3.7) e atualizar deliberadamente.

**3.9 — BAIXO. Edge `whatsapp` action `send` ignora o provedor.**
- **Evidência:** `whatsapp/index.ts:225` sempre chama `/message/sendText/{instance}`; não
  há leitura de `provedor` na função.
- **Impacto prático:** latente — se alguma barbearia voltar a `cloud_api` (a própria
  `ConexaoPage.tsx:102-108 prevê o caso), a resposta manual do dono pela aba WEB tenta uma
  instância que não existe e falha com erro genérico.
- **Correção sugerida:** rotear por `provedor` como o n8n faz, ou bloquear com mensagem
  clara quando `provedor <> 'evolution'`.

**3.10 — BAIXO. Documentação desatualizada em relação ao banco re-semeado.**
- **Evidência:** `docs/whatsapp-retomar.md:66-78` dá El Guardians como
  `e1705efb-944f-4083-925d-fe5d742bfbb4` com `phone_number_id` de teste; no banco o salão é
  `4748d5b4-...` e a conexão é `evolution` sem phone_number_id; `docs/estado-do-projeto.md`
  descreve duas barbearias reais que não existem mais nas tabelas.
- **Impacto prático:** quem retomar pelo doc vai executar UPDATEs em `salon_id` que não
  existe e tirar conclusões erradas sobre o que está conectado.
- **Correção sugerida:** atualizar os dois docs após a decisão sobre o re-seed (ver 6).

## 4. O que ainda não quebrou mas vai virar problema em produção

- **RAM por instância Baileys.** Hoje o VPS usa ~1,5 GB de 8 GB (VPS_getMetricsV1,
  04/09) — com **zero** instância conectada. O próprio backlog põe no radar "~1 por
  barbearia" (`docs/backlog.md:1591-1592`). Não há alerta de recurso do VPS; o primeiro
  sinal de esgotamento será instância caindo — que, por 3.2, ninguém verá.
- **Tudo num VPS só.** Evolution, n8n e Traefik dividem a mesma máquina. Se o VPS cai,
  cai o canal de conversa **e** o carteiro dos alertas (n8n) — o e-mail de queda depende
  do n8n que caiu junto. O limite já estava escrito no 0053 ("o alarme depende da coisa
  que ele vigia"); o e-mail resolveu o caso "Evolution caiu", não o caso "VPS caiu".
  Monitor externo continua inexistente.
- **Instâncias órfãs no servidor.** O reseed de 04/09 apagou as linhas de
  `whatsapp_connections`, mas apagar no banco não remove instância na Evolution
  (cabeçalho de `evolution-remover-instancias.mjs`). Instâncias antigas (ex.: da Curitiba)
  provavelmente seguem no servidor, conectadas ou não, consumindo RAM e — pior — com
  webhook apontado para o fluxo de produção com um `salon-<uuid>` que não existe mais
  (cada mensagem morreria em "Barbearia Atendendo?" gastando execução).
- **Deriva de configuração por instância.** Settings/webhook são reaplicados no
  `connect`, mas mudança em `evolutionConfig.json` só chega a instâncias já conectadas se
  alguém rodar o script de backfill à mão — com dezenas de barbearias isso vira diferença
  invisível de comportamento entre salões.
- **Contrato humano da coexistência.** As obrigações do dono (não desinstalar o app,
  abrir a cada 13 dias etc. — `docs/whatsapp-api-oficial.md:59-64`) não têm nenhuma
  verificação no produto; no híbrido via Baileys o análogo ("manter o celular pareado")
  depende de 3.2 para sequer ser notado.
- **Banimento continua sendo o risco de fundo.** O híbrido confina o dano ao número da
  barbearia (backlog:1560-1566), mas não há hoje nenhum detector do banimento em si
  (um número banido aparece como... conexão caída, de novo 3.2). O plano de coexistência
  oficial — o fim declarado do modelo (artifact "Conexão WhatsApp", backlog:1621-1624) —
  está parado nas filas da Meta (`docs/whatsapp-retomar.md`).

## 5. Interfaces: o que ENTREGA e o que CONSOME

**A Evolution ENTREGA ao sistema:**

| Contrato | Detalhe |
|---|---|
| Webhook de mensagens | `POST https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/salao-atendimento` (workflow `rJO1n7cFeNDIJyB5`, nó `Webhook da Edge Function`) |
| Eventos assinados | `MESSAGES_UPSERT` (consumido) e `SEND_MESSAGE` (descartado no n8n) — `evolutionConfig.json:4` |
| Identificação do tenant no payload | `body.instance` = `salon-<salon_id>`; o n8n extrai o UUID por prefixo (`Adaptar Payload (Provedor)`); contrato canônico em `_shared/instanceName.ts` (`INSTANCE_PREFIX = 'salon-'`) |
| Campos consumidos do payload | `body.event`, `data.key.remoteJid` (→ `contact_phone`), `data.key.fromMe`, `data.key.id` (→ `message_id`), `data.pushName` (→ `contact_name`), `message.conversation` / `extendedTextMessage.text` / `audioMessage.base64` / `imageMessage.base64` + `mimetype` (exige `webhookBase64: true`) |
| QR de conexão | resposta de `GET /instance/connect/{instance}`: `base64` ou `qrcode.base64` (`whatsapp/index.ts:164-168`) |
| Estado da conexão | `GET /instance/connectionState/{instance}` → `instance.state` ∈ `open/connecting/close` (`index.ts:180-184`) |

**O sistema CONSOME da Evolution (REST, header `apikey`):**

| Rota | Quem chama |
|---|---|
| `POST /instance/create` (`integration: WHATSAPP-BAILEYS`, `qrcode: true`) | edge `whatsapp` (connect) |
| `POST /settings/set/{instance}` | edge `whatsapp` (connect); `scripts/evolution-aplicar-config.mjs` |
| `POST /webhook/set/{instance}` (`enabled`, `url`, `webhookBase64`, `events`) | idem |
| `GET /instance/connect/{instance}` | edge `whatsapp` (connect) |
| `GET /instance/connectionState/{instance}` | edge `whatsapp` (status) |
| `DELETE /instance/logout/{instance}` | edge `whatsapp` (disconnect); script de remoção |
| `POST /message/sendText/{instance}` — corpo `{ number, text }` | n8n `Responder pela Evolution (Agente)`/`(Padrão)` (URL fixa `https://evolution-api-8lfe.srv1833354.hstgr.cloud`); edge `whatsapp` (send, via env `EVOLUTION_API_URL`) |
| `GET /instance/fetchInstances` | scripts de backfill/remoção |

**Contratos de dados no Supabase:** tabela `whatsapp_connections`
(`salon_id` PK/FK, `instance_name`, `status` `open|connecting|close`, `provedor`
`evolution|cloud_api`, `phone_number_id`, `waba_id`, `updated_at`); view `conexoes_ativas`
(campo `conectado`); view `auditoria_operacao` (chave `whatsapp-caiu:<salon_id>:<data>`,
gravidade `grave`) → `auditoria_pendente` → e-mail.

**Nomes de variáveis/credenciais (sem valores):** edge functions — `EVOLUTION_API_URL`,
`EVOLUTION_API_KEY`, `N8N_WEBHOOK_URL` (agente), `N8N_WHATSAPP_WEBHOOK_URL` e
`N8N_LEMBRETE_RESPOSTA_URL` (lado oficial); scripts — os mesmos via ambiente; compose —
`API_KEY`, `POSTGRES_PASSWORD`, `TRAEFIK_HOST`, `COMPOSE_PROJECT_NAME`; n8n — credencial
nomeada "Evolution API - CRM Salão" (citada em `docs/backlog.md:1641-1643`).

## 6. NÃO VERIFICADO

| Item | Motivo | O que o dono precisa fornecer |
|---|---|---|
| Lista real de instâncias no servidor Evolution (quantas, quais conectadas, órfãs do reseed) | Exigiria chamar a API da Evolution com credencial — vedado nesta auditoria | Saída de `GET /instance/fetchInstances` (ou `node scripts/evolution-remover-instancias.mjs` sem argumentos, que só lista) |
| Configuração efetiva do webhook por instância (URL, `webhookBase64`, eventos aplicados) | Idem — o que auditei é o que o código *manda* aplicar, não o que está aplicado | `GET /webhook/find/{instance}` para cada instância, ou o `--dry-run` do script de backfill |
| Versão da Evolution em execução | Imagem é `:latest`; a versão real só aparece na API/logs do container | `GET /` da API (devolve a versão) ou log de inicialização do container no painel |
| Credencial "Evolution API - CRM Salão" atrelada aos 2 nós de envio do agente | A API do n8n omite o bloco `credentials` dos nós (limitação já registrada em `docs/backlog.md:1641-1643`); nos dumps os nós aparecem com `creds: []` | Conferência visual na UI do n8n (item já aberto no backlog para o Saymon) |
| Segredos `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`/`N8N_WEBHOOK_URL` existentes no projeto Supabase | Não há tool somente-leitura para listar secrets de edge function | Print da lista de secrets (só nomes) em Project Settings → Edge Functions |
| Firewall interno da VM (ufw/iptables) cobrindo as portas 32769/32770 | Painel Hostinger não expõe; exigiria SSH | `ufw status` / `iptables -L` na VM — decide a severidade final do item 3.4 |
| Por que o banco de produção tem só El Guardians (reseed de 2026-09-04: 153 migrations com versionamento novo, 0 appointments/mensagens; Curitiba e São José ausentes) | Fato observado por SELECT; a *intenção* (migração de projeto? limpeza? incidente?) não é dedutível por leitura | Confirmação do dono — cruza com a auditoria do componente Supabase |
| Se a instância `salon-4748d5b4-...` (El Guardians) chegou a ser pareada e caiu, ou nunca conectou | `status='close'` com `updated_at` 04/09 08:09 não distingue os dois casos (o próprio 0053 documenta a ambiguidade) | O QR da El Guardians está como pendência do Saymon no backlog (linhas 1611-1613) |
| Comportamento real do ramo de mídia Evolution (base64 de áudio/imagem) | Nenhuma execução real do ramo Evolution existe no histórico do n8n; o backlog:1612 diz "verificado estruturalmente" | O teste de texto + áudio real citado como pendência no backlog |
