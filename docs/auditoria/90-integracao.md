# Auditoria de Integração — Fluxos ponta a ponta

**Data de início:** 2026-09-05. **Método:** síntese dos 8 relatórios de componente (`docs/auditoria/01`–`08`, todos de 2026-09-05) + leitura dirigida do código onde os relatórios não respondiam à pergunta de integração. Âncoras: `arquivo:linha` do repositório, ou `NN-arquivo.md §seção/item` quando o fato vem de um relatório de componente (que carrega a âncora primária). Nada foi executado nem alterado.

**Documento construído em 6 partes.** Estado atual:

| Parte | Fluxo | Estado | Completude |
|---|---|---|---|
| 1 | A — Onboarding de barbearia nova | **concluída** | **60%** |
| 2 | B — Mensagem de cliente | **concluída** | **55% estrutural / 0% operando hoje** |
| 3 | C — Agendamento e lembrete | **concluída** | **60% (agendamento ~90 / lembrete ~15)** |
| 4 | D — Cobrança | **concluída** | **70% estrutural / 0 ciclos reais no modelo vigente** |
| 5 | E — Deploy e runtime | **concluída** | **45%** |
| 6 | Consolidação (matriz de SPOFs, completude geral, NÃO VERIFICADO revisado) | **concluída** | — |

**Documento completo em 2026-09-05.** Veredito geral na seção "Consolidação".

---

## Fluxo A — Onboarding de uma barbearia nova

Cadastro no CRM → criação no Supabase → provisionamento da instância Evolution / número Meta → QR code → `whatsapp_connections` populada → primeiro atendimento funcionando.

### A.0 — Diagrama do caminho completo

```
CAMINHO 1 (self-service)                 CAMINHO 2 (presencial)                CAMINHO 3 (convite à distância)
─────────────────────────                ──────────────────────                ───────────────────────────────
Dono                                     Operador do produto                   Operador do produto
 │ /criar-conta (signUp Supabase Auth)    │ /admin/nova-barbearia               │ /admin/nova-barbearia
 │ e-mail de confirmação ──► dono         │ header x-admin-secret               │ header x-admin-secret
 │ clica, volta logado                    ▼                                     ▼
 ▼                                       edge admin-create-salon               edge admin-invite-salon
edge criar-minha-barbearia               {action:'create', dono, unidades[],   {nome, email, servicos[],
{nome, nomeSalao, telefone,               servicos[], assinatura}               dias_de_teste, dono_atende}
 versaoTermos} + JWT                      │                                     │
 │                                        │ cria auth user (senha temp.)       │ cria salão + subscriptions
 ▼                                        ▼                                     │ (acesso_ate NULO) + convite
[service_role] salons ─ user_salons ─ subscriptions ─ professionals            │ token 10 dias
 ─ professional_schedules ─ services ─ professional_services                   ▼
 ─ termos_aceites                                                    fila convites_a_enviar (view)
 (trial 7d no caminho 1; trial N d ou 'ativa' sem vencimento no 2)             │ cron n8n 10min
                                                                               ▼
                                                                    e-mail Gmail ──► /convite/<token>
                                                                               ▼
                                                                    edge accept-invite
                                                                    {token, senha, nome, versaoTermos}
                                                                    vínculo + trial começa AQUI
        ────────────────────── os 3 caminhos convergem ──────────────────────
                                         │
                                         ▼
Dono logado ──► /conexao (RequireManager) ──► edge whatsapp {action:'connect', salonId} + JWT
                                         │  papel owner|gerente conferido em user_salons
                                         ▼
                              Evolution API (header apikey, env EVOLUTION_API_URL)
                              1. POST /instance/create  {instanceName:'salon-<uuid>', qrcode:true,
                                                         integration:'WHATSAPP-BAILEYS'}
                              2. POST /settings/set/salon-<uuid>   {groupsIgnore:true, ...}
                              3. POST /webhook/set/salon-<uuid>    {url: env N8N_WEBHOOK_URL,      ◄── ELO ABERTO A1
                                                                    webhookBase64:true,
                                                                    events:[MESSAGES_UPSERT,SEND_MESSAGE]}
                              4. GET  /instance/connect/salon-<uuid> ──► QR base64
                                         │
                                         ▼
                              upsert whatsapp_connections {salon_id, instance_name,
                                                           status:'connecting', updated_at}
                                         │
                              tela mostra QR (validade 40 s) ──► dono escaneia no celular
                                         │
                              polling {action:'status'} ──► GET /instance/connectionState
                                         ▼
                              upsert whatsapp_connections {status:'open'}                          ◄── ELO ABERTO A2
                                         │                    (único escritor: a tela)
                                         ▼
                              [Número Meta: NADA por barbearia — modelo híbrido usa o
                               remetente central em remetentes_oficiais; phone_number_id
                               fica NULO para provedor 'evolution']
                                         │
                                         ▼
Cliente manda mensagem ──► Evolution ──► POST N8N_WEBHOOK_URL (sem autenticação)                  ◄── ELO ABERTO A3
                                         ▼
                              n8n "Atendimento WhatsApp" ──► primeiro atendimento    = Fluxo B
                              (ZERO execuções reais do ramo Evolution, desde sempre)              ◄── ELO ABERTO A4
```

### A.1 — Passo a passo: quem dispara, o que trafega, quem recebe, o que grava, o que acontece se falhar

**Passo 1 — Conta.**
- *Caminho 1:* o dono dispara em `/criar-conta`; trafega `signUp` com `emailRedirectTo` direto do navegador para o Supabase Auth (`src/features/site/CriarContaPage.tsx:14-24`, via `02-crm.md §1`); o Auth grava `auth.users` e envia o e-mail de confirmação. **Se falhar** o envio do e-mail, o dono trava no passo seguinte com a mensagem certa (`criar-minha-barbearia/index.ts:118-123` recusa e-mail não confirmado com 403) — mas a entrega de e-mail do Auth (SMTP, limites) **nunca foi verificada** (`01-supabase.md §6`; pendência declarada em `docs/estado-do-projeto.md:47`).
- *Caminho 2:* o operador dispara; a conta nasce pronta com `email_confirm: true` e senha temporária de 14 caracteres devolvida em claro na resposta (`admin-create-salon/index.ts:327-336,442-448`). **Se falhar** qualquer passo, `rollback()` apaga usuário, organização e salões criados (`:308-312`).
- *Caminho 3:* a conta só nasce no aceite (`accept-invite/index.ts:218-227`), com prova de posse por senha quando o e-mail já tem conta (`:194-216`) — o relógio do trial começa no aceite, não no convite (`:292-299`).

**Passo 2 — Provisionamento no Supabase.** Quem grava é sempre o `service_role` dentro da edge function; o que é gravado: `salons` (com `horario_funcionamento` padrão do servidor — `criar-minha-barbearia/index.ts:61-69`), `user_salons` (`role:'owner'`), `subscriptions` (`status:'trial'`, `acesso_ate = hoje+7` no caminho 1 — `:186-194`; `trial` de N dias ou `'ativa'` com `acesso_ate` nulo no caminho 2 — `admin-create-salon/index.ts:370-377`; nulo até o aceite no caminho 3 — `admin-invite-salon/index.ts:146-151`), `professionals` + `professional_schedules` derivada do horário, `services` (catálogo padrão de 4 itens — `:71-76`) + `professional_services`, e `termos_aceites` com IP e user-agent do cabeçalho (`:227-234`). **Se falhar no meio:** os três caminhos compensam apagando o salão (cascade leva o resto) — `criar-minha-barbearia/index.ts:237-244`, `admin-create-salon/index.ts:449-456`, `admin-invite-salon/index.ts:195-202`; o `accept-invite` desfaz só o que o aceite criou, preservando conta pré-existente (`:328-348`). Freios: 3 cadastros/IP/dia (`criar-minha-barbearia/index.ts:43,153-167`), 20 chamadas admin/IP/10min (`admin-create-salon/index.ts:139-146`), 30 consultas de convite/IP/10min + 5 senhas/token/15min (`accept-invite/index.ts:146-148,200-202`).

**Passo 3 — E-mail do convite (caminho 3).** A view `convites_a_enviar` não filtra `role` (`supabase/migrations/0104_convite_por_email.sql:17-25`), então o convite de dono entra na mesma fila que o de equipe; o cron de 10 min do n8n (`Fy9aqg14kCkhhNHW`) envia por **SMTP do Gmail pessoal** com o link `https://clubcut.space/convite/<token>` **hardcoded no nó** (`03-n8n.md §5`), e marca `email_enviado_em` depois do envio. Em paralelo, `admin-invite-salon` devolve o mesmo link montado sobre a env `APP_URL` — que tem **fallback hardcoded `https://clubcut.vercel.app`** (`admin-invite-salon/index.ts:26`; mesmo fallback em `admin-create-salon/index.ts:10`). **Se falhar** o e-mail, a fila re-tenta no próximo ciclo (marca depois de enviar — correto); **se a env `APP_URL` sumir**, o link aponta para o domínio velho sem nenhum erro.

**Passo 4 — Provisionamento Evolution + QR.** O dono dispara em `/conexao` (`src/features/conexao/ConexaoPage.tsx:30-44`); a edge `whatsapp` valida papel `owner|gerente` em `user_salons` e aceita `salonId` explícito para não conectar a unidade errada da rede (`whatsapp/index.ts:88-103`). Trafegam 4 chamadas REST à Evolution com header `apikey` (payloads no diagrama; `whatsapp/index.ts:106-168`), o QR volta em base64 para a tela (validade tratada, 40 s — `ConexaoPage.tsx:28`), e a função grava `whatsapp_connections {salon_id, instance_name:'salon-<uuid>', status:'connecting'}` (`:170-176`). O contrato de nome é um módulo só, testado (`_shared/instanceName.ts`). **Se falhar:** settings/webhook que falham voltam à tela como `settingsOk`/`webhookOk` false (`:125-157`) — o dono não fica "conectado e mudo" *quando a chamada falha*; mas **se `N8N_WEBHOOK_URL` estiver configurada com o valor errado, a chamada é um sucesso** e o webhook aponta para o lugar errado, silenciosamente (ver A1 abaixo). Falha ao gerar QR → 502 explícito (`:159-162`).

**Passo 5 — Número Meta.** No modelo híbrido vigente **não existe provisionamento Meta por barbearia**: conversa sai pela Evolution com o número real da barbearia; tudo que a plataforma inicia sai pelo remetente central `1288009817732005` em `remetentes_oficiais` (decisão 2026-08-30 — `05-meta.md §1`; `supabase/migrations/0115_modelo_hibrido_remetente_central.sql:1-16`). Para o onboarding, o campo `phone_number_id` de `whatsapp_connections` fica NULO — correto por desenho. O passo "número Meta" do fluxo, portanto, é vazio por decisão, não por buraco — o buraco correspondente (templates, lembrete) pertence ao Fluxo C.

**Passo 6 — Pareamento e status.** O dono escaneia; o Baileys pareia no servidor Evolution. O banco só fica sabendo quando a tela pergunta: `{action:'status'}` → `GET /instance/connectionState` → upsert do status (`whatsapp/index.ts:180-194`). **Este é o único mecanismo que atualiza `whatsapp_connections.status`** — nenhum cron, nenhum evento (`04-evolution.md §3.2`: eventos assinados são só `MESSAGES_UPSERT`/`SEND_MESSAGE`, sem `CONNECTION_UPDATE`; `_shared/evolutionConfig.json:4`).

**Passo 7 — Primeiro atendimento.** Cliente manda mensagem → Evolution POSTa no webhook do n8n → fluxo do agente (detalhado no Fluxo B). Para o onboarding, o que importa: **não existe nenhuma evidência de que este elo já funcionou pelo caminho Evolution** — o histórico do workflow tem zero execuções reais do ramo Evolution, desde sempre (`04-evolution.md §1` "Execuções reais"; `docs/backlog.md:1647`), a única conexão do banco está `close` sem que se saiba se chegou a parear (`04-evolution.md §6`), e a última execução por webhook de qualquer procedência é de 23/08 (`03-n8n.md §A3`).

### A.2 — Onde a corrente ESTÁ FECHADA

1. **Cadastro → provisionamento completo no Supabase, pelos três caminhos.** Transacional com compensação, idempotente contra clique duplo (`criar-minha-barbearia/index.ts:129-146`), com rate limit, prova de aceite de termos e trial que começa no momento certo de cada caminho. A barbearia nasce *usável*: catálogo, jornada, vínculo, assinatura. É o trecho mais bem construído dos cinco fluxos.
2. **Autorização do provisionamento WhatsApp.** JWT + papel + `salonId` explícito para redes (`whatsapp/index.ts:88-103`) — o dono não conecta a unidade errada.
3. **Provisionamento Evolution idempotente com feedback.** Settings e webhook reaplicados a cada connect, resultado devolvido à tela (`whatsapp/index.ts:117-157`); QR com validade tratada.
4. **Contrato de nomes `salon-<uuid>` centralizado e testado** (`_shared/instanceName.ts`), consumido igual pela edge, pelos scripts e pelo n8n.
5. **Fila de convite marca depois de enviar** — e-mail que falha volta à fila (`03-n8n.md §2`).

### A.3 — Onde a corrente ESTÁ ABERTA

**A1 — ABERTO/CRÍTICO: o elo `webhook/set → n8n` depende de um secret que ninguém confere e a evidência disponível diz que está errado.** O valor de `N8N_WEBHOOK_URL` é carimbado no webhook de **toda instância nova** no connect (`whatsapp/index.ts:138-150`). O URL de produção real do n8n tem um UUID no path (`…/webhook/<uuid>/salao-atendimento` — triggerInfo do workflow), enquanto a doc manda configurar **sem** o UUID (`docs/n8n-cloud-api-entrada.md:87-89`), e o fluxo não recebe uma execução por webhook desde 23/08 com retenção que alcança 22/08 (`03-n8n.md §A3`). Se o secret estiver com a forma sem UUID, **todo onboarding termina em "conectado e mudo"**: o `webhook/set` responde OK, a tela mostra `webhookOk: true`, e a primeira mensagem de cliente morre num 404 do n8n que ninguém loga. Não há teste automático de ponta a ponta que pegue isso.

**A2 — ABERTO/ALTO: o estado final do onboarding (`status='open'`) não se sustenta sozinho.** Único escritor é a tela `/conexao` (`04-evolution.md §3.2`). A instância cai (celular desligado, logout) e o banco continua dizendo `open` até o dono abrir a tela — e o alerta `whatsapp-caiu` lê exatamente essa coluna (`0053`), então o alarme é cego para o caso mais comum. Inversamente, a única conexão existente hoje está `close` sem que se saiba se algum dia pareou (`04-evolution.md §6`).

**A3 — ABERTO/CRÍTICO (herdado do Fluxo B, mas nasce aqui): o webhook que o onboarding configura aponta para um endpoint sem autenticação que confia no nome da instância como identidade do tenant** (`03-n8n.md §C1`, `04-evolution.md §3.1`). O onboarding entrega cada barbearia nova a um canal em que qualquer POST forjado com `instance: 'salon-<uuid>'` grava conversa no tenant dela e responde pelo WhatsApp real dela. A URL está em doc de repositório público.

**A4 — ABERTO/ALTO: "primeiro atendimento funcionando" nunca foi observado.** Zero execuções reais do ramo Evolution na história do workflow (`04-evolution.md §1`; `backlog.md:1647`). O fluxo A termina, hoje, num elo que só existe estruturalmente.

**A5 — ABERTO/MÉDIO: checagem de e-mail duplicado quebra silenciosamente a partir de ~50 contas.** `admin-create-salon/index.ts:294-301` e `admin-invite-salon/index.ts:120-127` usam `auth.admin.listUsers()` sem paginação — o próprio `accept-invite` documenta o defeito e usa a RPC certa (`accept-invite/index.ts:20-23`). Passando de ~50 usuários, o cadastro presencial e o convite passam a falhar de forma intermitente (o `createUser` estoura e-mail duplicado depois do rollback, com erro genérico).

**A6 — ABERTO/MÉDIO: dois lugares montam o link do convite com fontes diferentes.** n8n com `clubcut.space` hardcoded no nó; edges com env `APP_URL` cujo fallback é `clubcut.vercel.app` (`admin-invite-salon/index.ts:26`). Hoje coincidem por sorte; qualquer mudança de domínio quebra um dos dois em silêncio.

**A7 — ABERTO/MÉDIO: instâncias órfãs.** Apagar barbearia (ou zerar o banco, como em 03-04/09) **não** remove a instância na Evolution (`scripts/evolution-remover-instancias.mjs`, cabeçalho; `04-evolution.md §4`). Instâncias antigas provavelmente seguem no servidor com webhook apontado para produção e `salon-<uuid>` que não existe mais. A lista real de instâncias nunca foi inventariada (`04-evolution.md §6`).

**A8 — ABERTO/MÉDIO: a porta de entrada administrativa do onboarding é um segredo estático compartilhado guardado em `sessionStorage`** (`02-crm.md §3.4`), e `admin-metricas` — parte do mesmo painel — não tem fonte no repo nem rate limit (`01-supabase.md §3.4`).

### A.4 — Completude: **60%**

Justificativa por segmento, ponderando pelo que o fluxo existe para entregar (uma barbearia *atendendo*):

| Segmento | Peso | Estado |
|---|---|---|
| Conta + provisionamento Supabase (passos 1–3) | 30% | ~95% fechado — desconto só pela entrega de e-mail do Auth não verificada e pelo `listUsers` (A5) ainda inofensivo com 1 conta |
| Provisionamento Evolution + QR + `whatsapp_connections` (passos 4 e 6) | 30% | ~80% fechado — código completo e idempotente, mas estado não se sustenta (A2) e o que está aplicado nas instâncias do servidor não foi inventariado (A7) |
| Número Meta (passo 5) | 5% | 100% por desenho (vazio de propósito no híbrido) |
| Primeiro atendimento (passo 7) | 35% | **~5%** — o elo webhook→n8n tem indício forte de configuração errada (A1), o endpoint é inseguro (A3) e nunca houve uma execução real (A4) |

30×0,95 + 30×0,80 + 5×1,0 + 35×0,05 ≈ **60%**. A leitura honesta: **o onboarding leva a barbearia até o QR com qualidade acima da média do projeto, e a abandona exatamente no elo que é a razão do produto existir.** Nenhuma barbearia nova, hoje, terminaria o fluxo A com um atendimento funcionando — e a tela diria que está tudo certo.

### A.5 — Pontos únicos de falha e o efeito nos OUTROS tenants

| SPOF | O que acontece quando falha | Efeito nos outros tenants |
|---|---|---|
| **Secret `N8N_WEBHOOK_URL`** (um valor, carimbado em toda instância no connect) | Valor errado/rotacionado → toda instância nova (e as reaplicadas) aponta para o nada | **Todos**: mensagens de todos os salões Evolution morrem em silêncio; consertar exige rodar o backfill (`scripts/evolution-aplicar-config.mjs`) em todas as instâncias |
| **Evolution API** (1 container, imagem `:latest` não pinada — `04-evolution.md §3.8`) | Container cai ou recreate troca versão com breaking change do Baileys | **Todos**: nenhum QR novo (onboarding para), todas as conversas Evolution mudas de uma vez |
| **VPS `srv1833354`** (Evolution + n8n + Traefik juntos, sem firewall — `08-hostinger.md §3`) | VPS cai | **Todos**: canal de conversa E o carteiro dos alertas caem juntos — o e-mail de "WhatsApp caiu" depende do n8n que caiu junto (`04-evolution.md §4`) |
| **`ADMIN_TOOL_SECRET`** (um segredo estático para criar/listar/desativar barbearias) | Vaza (XSS no painel, navegador compartilhado — fica em `sessionStorage`) | **Todos**: `toggle_salon` desativa qualquer barbearia; `list` expõe a base inteira de clientes do produto |
| **`AUTHENTICATION_API_KEY` global da Evolution** + `EXPOSE_IN_FETCH_INSTANCES=true` + porta 32770 em `0.0.0.0` sem TLS (`04-evolution.md §3.4/3.7`) | Chave interceptada/força bruta | **Todos**: `fetchInstances` devolve os tokens de todas as instâncias de uma vez — sequestro do canal de todas as barbearias |
| **SMTP Gmail pessoal** (fila de convites, ~500/dia — `03-n8n.md §4.3`) | Conta bloqueada/limite | **Todos** os convites novos param; barbearias em onboarding à distância não recebem o link |
| **`auth.admin.listUsers()` sem paginação** (A5) | >50 contas | **Todos** os onboardings futuros presenciais/por convite ficam intermitentes |
| **Projeto Supabase** (plano gratuito, sem backup — `01-supabase.md §3.1`) | Perda do banco | **Todos**: o onboarding inteiro e tudo o que ele criou deixam de existir; não há restauração |

---

## Fluxo B — Mensagem de cliente

WhatsApp → Evolution/Meta → webhook n8n → resolução do tenant → agente → ferramentas no Supabase → resposta enviada → histórico gravado → aparece no CRM.

### B.0 — Diagrama do caminho completo

```
RAMO EVOLUTION (conversa da barbearia)          RAMO CLOUD API (número central / salão cloud)
──────────────────────────────────              ─────────────────────────────────────────────
Cliente ──► WhatsApp ──► Baileys                Cliente ──► WhatsApp ──► Meta Cloud API
              (instância salon-<uuid>)                        │
              │                                               ▼
              │ POST direto, SEM edge no meio    edge whatsapp-webhook (verify_jwt=false)
              │ SEM autenticação    ◄── B2       ├─ POST: HMAC x-hub-signature-256 tempo
              ▼                                  │  constante; falha ⇒ 200 "IGNORED" + log
   payload Evolution nativo:                     ├─ field ≠ 'messages' ⇒ INSERT eventos_da_waba
   {event:'messages.upsert',                     ├─ statuses (entregue/lido/falhou) ⇒ descartado
    instance:'salon-<uuid>',                     ├─ RPC salon_por_phone_number_id
    data:{key:{remoteJid,fromMe,id},             │   ├─ salão cloud ⇒ monta payload plano ↓
         pushName,                               │   └─ nulo ⇒ remetentes_oficiais?
         message:{conversation |                 │        ├─ central: botão ⇒ RPC responder_lembrete /
          extendedTextMessage.text |             │        │  responder_avaliacao ⇒ POST
          audioMessage.base64 |                  │        │  N8N_LEMBRETE_RESPOSTA_URL   (= Fluxo C)
          imageMessage.base64+mimetype}}}        │        │  texto solto ⇒ log e descarta
              │                                  │        └─ desconhecido ⇒ log e descarta
              │                                  ▼
              │                     POST N8N_WHATSAPP_WEBHOOK_URL  {salon_id, phone_number_id,
              │                     waba_id, contact_phone, contact_name, message_id, texto,
              │                     media_id, tipo, contexto}
              │                                  │  n8n recusa ⇒ só console.error; Meta recebe 200 ◄── B1
              └───────────────┬──────────────────┘
                              ▼
        n8n workflow rJO1n7cFeNDIJyB5 (83 nós) — webhook /webhook/<uuid>/salao-atendimento
        │ ZERO execuções por webhook desde 23/08; ramo Evolution: zero NA HISTÓRIA        ◄── B1
        ▼
   Adaptar Payload (Provedor)
   ├─ Evolution: só messages.upsert; fromMe ⇒ DESCARTA (barbeiro invisível)               ◄── B6
   │             salon_id = instance.slice('salon-'.length)  — SEM validar no banco       ◄── B2
   └─ Cloud: Buscar Instância Conectada (whatsapp_connections.phone_number_id) ⇒ não achou ⇒ Fim
                              ▼
   Barbearia Atendendo? (view salons_atendendo: janela de acesso + tolerância)
   │ bloqueada ⇒ fim SILENCIOSO (cliente não recebe nada)
                              ▼
   Buscar Conversa Existente ─► não existe ⇒ Criar Conversa Nova (create simples)         ◄── B3
                              ▼
   Inserir Mensagem Recebida {direction:'in', sender:'cliente', content}
                              ▼
   Esperar a Sequencia (Wait 15 s) ─► ultima_mensagem_recebida ─► Ainda É a Última? não ⇒ noOp
                              ▼
   Consultar agent_paused ─► pausado ⇒ fim (mensagem gravada, agente calado — correto)
                              ▼
   mídia: audio ⇒ whisper-1 (grava consumo_ia) · imagem ⇒ visão (grava consumo_ia)
          video/documento ⇒ viram texto VAZIO e o agente responde confuso                 ◄── B5
                              ▼
   contexto (cliente, catálogo, barbeiros, histórico) ─► Agente LangChain gpt-4o-mini
   12 Supabase Tools com salon_id FIXADO por expressão (nunca $fromAI)
   │ tokens do agente NÃO entram em consumo_ia                                            ◄── B9
                              ▼
   Formatar para WhatsApp (valida listas contra catálogo/barbeiros reais)
                              ▼
   Inserir Mensagem do Agente {direction:'out', sender:'agente'}   ── ANTES do envio      ◄── B4
                              ▼
   Rotear Envio (provedor)
   ├─ Cloud API message/send        (retryOnFail 3×, onError: stopWorkflow)
   └─ Evolution /message/sendText   (SEM retry, SEM onError)                              ◄── B4
                              ▼
   CRM: Realtime whatsapp_conversations + whatsapp_messages (filtro salon_id) ─► aba /web
   ├─ ferramenta "Chamar o Dono" ⇒ needs_human=true + agent_paused=true + resumo_contexto
   ├─ dono responde: edge whatsapp {action:'send'} ⇒ SEMPRE Evolution sendText            ◄── B7
   │  (ignora provedor) ⇒ grava mensagem DEPOIS do envio ⇒ agent_paused=true
   └─ devolver ao agente: {action:'resume_agent'} ⇒ agent_paused=false, needs_human=false
```

### B.1 — Passo a passo: quem dispara, o que trafega, quem recebe, o que grava, o que acontece se falhar

**Passo 1 — Entrada Evolution (o caminho de TODA barbearia no modelo híbrido).** O cliente dispara; a Evolution POSTa **direto** no n8n, sem edge function no meio e **sem autenticação nenhuma** (nó `Webhook da Edge Function`: só `path` e `httpMethod` — `03-n8n.md §C1`; `04-evolution.md §1`). Trafega o payload nativo do diagrama, com mídia embutida em base64 (`webhookBase64: true`, exigido pelo ramo de mídia). **Se falhar** (n8n fora, URL errada): a mensagem simplesmente não chega, e **não se sabe se a Evolution re-tenta o POST** — a política de retry do webhook da Evolution não está documentada em lugar nenhum do repo (NÃO VERIFICADO). Não há fila, não há log do lado de cá.

**Passo 2 — Entrada Cloud API.** A Meta dispara na edge `whatsapp-webhook` (v12, `verify_jwt=false`). Autentica por HMAC em tempo constante com falha fechada (`whatsapp-webhook/index.ts:44-67,149-154`); eventos administrativos viram linha em `eventos_da_waba` (`:169-175`); `statuses` são descartados nos dois ramos (`:199,280` — nenhuma visibilidade de "entregue/lido/falhou", `05-meta.md §3.5`); número central resolve clique de botão por wamid via RPC e reposta ao n8n de lembrete (`:201-274` — pertence ao Fluxo C); mensagem de salão cloud vira o payload plano e é POSTada em `N8N_WHATSAPP_WEBHOOK_URL` (`:366-386`). **Se falhar:** assinatura inválida → `200 IGNORED` + `console.error` (`:149-154`) — se o `WHATSAPP_APP_SECRET` for rotacionado errado, **todas as mensagens somem em silêncio**; n8n recusando → `console.error('n8n recusou a mensagem')` e a Meta recebe 200 achando que entregou (`:387-389`). Nenhum alerta cobre nenhum dos dois casos.

**Passo 3 — Resolução do tenant no n8n.** Ramo Cloud: `Buscar Instância Conectada` filtra `whatsapp_connections.phone_number_id` e para em `Fim - Instância Não Encontrada` se não achar — resolvido pelo banco, correto (`03-n8n.md §2`). Ramo Evolution: `salon_id = instance.slice('salon-'.length)`, **sem validar contra o banco**, pulando o nó de busca (`03-n8n.md §C1`). Combinado com o passo 1 (sem auth), qualquer POST forjado com `instance: 'salon-<uuid>'` grava conversa e mensagem **em qualquer tenant** com `service_role` (RLS não se aplica) e faz o número real da barbearia responder a um telefone escolhido pelo atacante. A URL do webhook está em doc de repositório **público** (`docs/n8n-cloud-api-entrada.md:87-89`; `docs/backlog.md:1557-1558`).

**Passo 4 — Gate de acesso.** `Barbearia Atendendo?` lê `salons_atendendo` (janela `acesso_ate`/`atendimento_ate` + tolerância de 3 dias — `0131:76-112`). **Se a barbearia estiver bloqueada, o cliente recebe silêncio absoluto** — nenhuma mensagem de "fora do ar", nenhum aviso ao dono de que clientes estão escrevendo no vácuo. Detalhe de relógio: a view usa `current_date` UTC e a RPC do CRM usa data de São Paulo — perto da meia-noite a tela diz "atendendo" e o agente já parou (`06-asaas.md §4.3`).

**Passo 5 — Conversa e mensagem.** `Buscar Conversa Existente` (limit 1) → `Criar Conversa Nova` (create simples, sem `onError`) → `Inserir Mensagem Recebida`. **Se falhar:** duas mensagens quase simultâneas de um cliente **novo** (o cenário mais comum do mundo: "oi" + "queria marcar") disputam o create; o segundo estoura `23505` e a execução **morre antes de gravar a mensagem** — ela some do CRM e o debounce nunca a vê (`03-n8n.md §M1`). O contrato documentado mandava upsert (`docs/n8n-integration.md:127-141`); o fluxo não faz.

**Passo 6 — Debounce e pausa.** Wait de 15 s + `ultima_mensagem_recebida` + `Ainda É a Última?`: rajada vira uma resposta só. `Consultar agent_paused` antes de responder; pausado → termina com a mensagem gravada. Contrato `needs_human`/`agent_paused` respeitado: o n8n só escreve `true` (ferramenta `Chamar o Dono`, com `resumo_contexto` obrigatório); quem escreve `false` é só o front via edge (`whatsapp/index.ts:280-286`). Fechado.

**Passo 7 — Mídia.** Áudio: Cloud baixa por `mediaUrlGet` + GET autenticado; Evolution usa o base64 do payload → whisper-1 → transcrição, com consumo gravado em `consumo_ia` (`execucao_n8n = $execution.id`). Imagem: idem com visão. **Vídeo e documento caem em `conversation` com texto vazio** — o nó `Tipo Não Suportado` (que responderia "só entendo texto ou áudio") é **inalcançável** no caminho real (`03-n8n.md §M3`): o cliente manda um vídeo e o agente responde confusão. O ramo de mídia Evolution **nunca teve execução real** (`04-evolution.md §6`).

**Passo 8 — Agente e ferramentas.** `gpt-4o-mini` com 12 Supabase Tools, todas com `salon_id` fixado por expressão do fluxo, nunca `$fromAI` — o modelo não escolhe o tenant; `Cancelar Agendamento`/`Confirmar Presenca` ainda exigem `client_id` + `status='agendado'` (`03-n8n.md §2`). O validador `Formatar para WhatsApp` confere cada lista da resposta contra catálogo e barbeiros reais (cicatriz do incidente do barbeiro "Rafael" inventado, 23/08). **Se falhar** a chamada OpenAI: execução morre; sem error workflow, ninguém sabe (B8). **Os tokens do agente — a maior fatia do custo de IA — não são medidos** em `consumo_ia` (`03-n8n.md §M4`); a fatura por uso e o export para a Aura saem sistematicamente subestimados (conecta no Fluxo D).

**Passo 9 — Resposta.** `Inserir Mensagem do Agente` grava no histórico **antes** do envio; depois `Rotear Envio` manda por Cloud (retry 3×, `stopWorkflow`) ou Evolution `sendText` (**sem retry, sem onError** — `04-evolution.md §3.3`). **Se o envio Evolution falhar** num soluço de rede: a execução morre, o cliente não recebe nada, e o CRM mostra a conversa "respondida" — o dono acredita que o cliente foi atendido. Não há reconciliação nem status de entrega. Contraste: a edge `whatsapp` action `send` (resposta manual do dono) faz na ordem certa — envia, e só grava se o envio passou (`whatsapp/index.ts:225-249`).

**Passo 10 — CRM.** Realtime em `whatsapp_conversations`/`whatsapp_messages` com filtro por `salon_id`/`conversation_id` (`02-crm.md §1`); a aba `/web` (RequireManager) espelha a conversa; `needs_human` lista os pedidos de humano. Resposta manual do dono: edge `whatsapp {action:'send'}` → **sempre** Evolution `sendText`, sem checar `provedor` (`whatsapp/index.ts:225` — se alguma barbearia voltar a `cloud_api`, a resposta manual quebra com erro genérico, `04-evolution.md §3.9`) → `agent_paused=true`. **O buraco espelho: o barbeiro que responde pelo próprio celular** — o caso de uso que justificou o híbrido — **é invisível**: `fromMe` é descartado, `SEND_MESSAGE` é assinado mas ignorado, `agent_paused` não liga, a mensagem manual não entra no histórico, e o agente responde por cima criando duas conversas paralelas (`04-evolution.md §3.6`).

### B.2 — Onde a corrente ESTÁ FECHADA

1. **A porta Cloud API.** HMAC em tempo constante com falha fechada, tenant resolvido pelo banco, sempre-200 com racional documentado, botão resolvido por wamid sem pagar LLM por clique (`whatsapp-webhook/index.ts:44-67,185-198,292-307`). A execução 9945 de 23/08 prova o caminho Cloud ponta a ponta — **provou, no passado**.
2. **Isolamento de tenant dentro do agente.** As 12 ferramentas com `salon_id` fixado fora do alcance do modelo (`03-n8n.md §2`) — o LLM não consegue vazar dados entre salões nem que alucine.
3. **O contrato `agent_paused`/`needs_human`** respeitado nas duas pontas, com escritor único para cada direção.
4. **Debounce de rajada** e **validador anti-alucinação** — engenharia acima da média, nascida de incidentes reais e documentada nos próprios nós.
5. **Resposta manual do dono pelo CRM**: ordem envia→grava correta, com pausa do agente automática (`whatsapp/index.ts:225-258`).
6. **Exibição no CRM**: Realtime filtrado por tenant, quatro estados tratados nas telas (`02-crm.md §2`).

### B.3 — Onde a corrente ESTÁ ABERTA

**B1 — ABERTO/CRÍTICO: a entrada do fluxo está, com alta probabilidade, quebrada AGORA — e o modo de falha é invisível por construção.** Zero execuções por webhook desde 23/08 com retenção alcançando 22/08; URL registrada tem UUID, doc manda configurar sem (`03-n8n.md §A3`). Os dois pontos de entrada engolem a falha: a Evolution não loga nada do lado de cá, e a edge devolve 200 à Meta com um `console.error` que ninguém lê (`whatsapp-webhook/index.ts:387-389`). O produto principal pode ficar mudo por semanas — **ficou**, por duas — sem um único sinal.

**B2 — ABERTO/CRÍTICO: webhook sem autenticação + tenant por corte de string + URL em repo público** (`03-n8n.md §C1`; `04-evolution.md §3.1`). Injeção de mensagem em qualquer tenant, gasto de OpenAI de graça, e spam saindo pelo WhatsApp real da barbearia — o gatilho exato do banimento que o híbrido existe para evitar.

**B3 — ABERTO/ALTO: corrida no create de conversa perde a mensagem do cliente novo** (`03-n8n.md §M1`) — justamente na primeira impressão do produto.

**B4 — ABERTO/ALTO: histórico mente.** Resposta gravada antes do envio + envio Evolution sem retry (`03-n8n.md §M2`; `04-evolution.md §3.3`). O CRM é a única janela do dono para o atendimento, e ela mostra respostas que não foram entregues.

**B5 — ABERTO/MÉDIO: vídeo/documento viram mensagem vazia** e a resposta educada de "não suportado" é código morto (`03-n8n.md §M3`).

**B6 — ABERTO/ALTO: a resposta do barbeiro pelo celular não existe para o sistema** (`04-evolution.md §3.6`). O caso de uso que vendeu o modelo híbrido produz duas conversas paralelas com o mesmo cliente.

**B7 — ABERTO/BAIXO (latente): resposta manual ignora o provedor** (`whatsapp/index.ts:225`; `04-evolution.md §3.9`) — quebra no dia em que uma barbearia voltar a `cloud_api`.

**B8 — ABERTO/ALTO: nenhum error workflow, nenhum alerta de execução, retenção ~14 dias** (`03-n8n.md §A2`) — toda falha deste fluxo é silenciosa e a evidência evapora. Agravante LGPD: conteúdo de conversa de cliente final retido em claro nas execuções do n8n, num VPS fora do perímetro, sem menção nos termos (`03-n8n.md §M6`).

**B9 — ABERTO/MÉDIO: o custo do agente não é medido** (`03-n8n.md §M4`) — o Fluxo D cobra por uso um serviço cujo custo principal não entra na conta.

**B10 — ABERTO/BAIXO: `executionTimeout: 120` mata a execução depois de gravar a mensagem e antes de responder** em casos de áudio longo + visão + agente lento (`03-n8n.md §4.5`) — o cliente fica no vácuo com a mensagem registrada.

**B11 — ABERTO/BAIXO (escala): conversas sem paginação no CRM** e `useAgentStats` com `.in()` de ids crescendo sem limite (`02-crm.md §4.1`) — dói na primeira barbearia movimentada.

### B.4 — Completude: **55% estrutural / 0% operando hoje**

| Segmento | Peso | Estado |
|---|---|---|
| Entrada (Evolution direto + Meta→edge→n8n) | 30% | ~30% — a edge Cloud é sólida e já funcionou (23/08), mas hoje **nada entra**: indício forte de secret errado (B1), ramo Evolution jamais executado, e ambos os modos de falha são mudos |
| Resolução de tenant | 10% | ~50% — Cloud pelo banco (fechado), Evolution por string sem validação (B2) |
| Gravação de conversa/mensagem | 15% | ~75% — funciona, com a corrida B3 exatamente no cliente novo |
| Agente + ferramentas + mídia | 20% | ~80% — isolamento exemplar; vídeo/documento quebrados (B5), custo não medido (B9) |
| Envio da resposta | 15% | ~55% — Cloud com retry; Evolution sem retry e com histórico gravado antes (B4) |
| Histórico + CRM | 10% | ~80% — Realtime ok; barbeiro pelo celular invisível (B6), provedor ignorado no manual (B7) |

30×0,30 + 10×0,50 + 15×0,75 + 20×0,80 + 15×0,55 + 10×0,80 ≈ **55%**. E o número operacional é mais duro: **a única conexão do banco está `close`, não há tráfego real desde 23/08, e o ramo Evolution — o caminho de todas as barbearias no modelo vigente — nunca processou uma mensagem real.** O fluxo B, hoje, é uma máquina bem construída em vários trechos internos, desligada da tomada nas duas pontas: a entrada provavelmente aponta para o lugar errado e a saída grava sucesso sem confirmar entrega.

### B.5 — Pontos únicos de falha e o efeito nos OUTROS tenants

| SPOF | O que acontece quando falha | Efeito nos outros tenants |
|---|---|---|
| **Um único workflow/webhook para todos os salões** (`rJO1n7cFeNDIJyB5`, path único) | Unpublish acidental, edição quebrada (3 workflows já têm rascunho ≠ publicado — `03-n8n.md §M5`), ou bug num nó | **Todos** os agentes mudos de uma vez; sem error workflow, sem aviso |
| **Secrets `N8N_WEBHOOK_URL` / `N8N_WHATSAPP_WEBHOOK_URL`** | Valor errado (o estado provável atual) | **Todos**: cada mensagem de cada tenant morre num 404 silencioso |
| **n8n (1 container, mesmo VPS da Evolution)** | Cai | **Todos** os agentes + todos os crons + o carteiro dos alertas caem juntos |
| **Credencial OpenAI única** | Quota estourada, chave revogada, OpenAI fora | **Todos** os agentes param no passo 8; execuções falham sem alerta (B8) |
| **`WHATSAPP_APP_SECRET` / rotação errada** | Toda mensagem Cloud vira `200 IGNORED` | **Todos** os salões cloud + o número central (cliques de lembrete/avaliação do Fluxo C) somem em silêncio |
| **Credencial `service_role` do Supabase dentro do n8n** | Vaza (VPS sem firewall, porta 32769 em 0.0.0.0 — `08-hostinger.md §3`) | **Todos**: acesso total de leitura/escrita ao banco inteiro, RLS irrelevante |
| **Evolution API / VPS** (herdado do Fluxo A) | Cai ou recreate com `:latest` quebrado | **Todos** os salões Evolution sem conversa; alerta morre junto |
| **Número central da Meta** (um para todas as barbearias) | Qualidade cai / banimento | Não afeta a conversa (Evolution), mas cala lembrete/avaliação/aviso de **todos** (Fluxo C) — e o monitor está cego (`05-meta.md §3.3`) |

---

## Fluxo C — Agendamento e lembrete

Criação → checagem de conflito → gravação → job de lembrete → envio → confirmação.

### C.0 — Diagrama do caminho completo

```
CRIAÇÃO (3 portas)                                          CHECAGEM DE CONFLITO (uma só, no banco)
──────────────────                                          ───────────────────────────────────────
1. CRM (barbeiro/gestor)                                    Toda porta desagua nas MESMAS travas:
   NewAppointmentModal                                       • appointments_sem_sobreposicao
   ├─ RPC garantir_cliente (dedup por telefone_norm)           (EXCLUDE btree_gist por profissional —
   ├─ INSERT appointments {salon_id, client_id,                 0018:31, refeita na 0063:31)
   │   professional_id, service_id, data_hora_inicio/fim,    • appointments_cliente_sem_sobreposicao
   │   status: 'agendado' | 'concluido' se retroativo}          (mesmo cliente — 0042:18)
   └─ RPC definir_servicos_do_agendamento (recalcula fim,    • trg_respeita_folga (folga entre
      23P01 se não couber; rollback manual se falhar)           atendimentos — 0134:82-85)
2. AGENTE (n8n, ferramenta Criar Agendamento)               Violação ⇒ 23P01/23514; o CRM traduz
   origem='agente', salon_id fixado pelo fluxo               (erroDoBanco.ts); o agente… ver C.3
3. AGENDA PÚBLICA (QR do balcão)
   edge agenda-publica: revalida horarios_livres no
   servidor, rate limit 8/IP/10min + 10/h por salão,
   telefone 10–13 dígitos, token_gestao p/ cancelar
                              │
                              ▼
                    appointments gravado
   (cron */5min cancela-agendamentos-sem-comanda varre 'agendado' vencido sem comanda)

LEMBRETE (job) — hoje NÃO envia, por DUAS travas independentes
──────────────────────────────────────────────────────────────
cron n8n 10 min (workflow DW0nq1Jyp9xeOJwm)
  ├─ busca appointments de TODOS os salões, filtra lembrete_enviado em code node   ◄── C7
  ├─ janela 85–100 min antes do horário
  ├─ GATE 1: template 'lembrete_hoje' com status='aprovado' em whatsapp_templates
  │          → 25/25 templates estão 'rascunho' ⇒ fila SEMPRE vazia               ◄── C1a
  ├─ GATE 2: Buscar Instância do Salão lê conexoes_ativas e exige o
  │          phone_number_id DO SALÃO — no híbrido é NULO (provedor evolution)
  │          ⇒ "Sem Instância - Pula Lembrete", mesmo com template aprovado       ◄── C1b
  │          (deveria usar remetentes_oficiais, padrão da 0115)
  ├─ marca lembrete_enviado ANTES de enviar (ciclo de 10 min: reenvio bombardearia)
  ├─ sendTemplate lembrete_hoje pelo número… errado (C1b) — retry 3×
  └─ guarda wamid em appointments.lembrete_message_id (DEPOIS do envio OK)         ◄── C4

CONFIRMAÇÃO (clique do cliente)
───────────────────────────────
Cliente clica [Sim/Reagendar/Cancelar] ──► Meta ──► edge whatsapp-webhook (HMAC)
  ├─ botão + context.id ⇒ RPC responder_lembrete(wamid, texto do botão)
  │   0086: casa pelo wamid, NUNCA pelo texto; idempotente
  │   (lembrete_respondido_em); tarde demais ⇒ não mexe; botão
  │   desconhecido ⇒ atendido=false ⇒ vai ao agente
  │   ├─ 'sim…'    ⇒ status='confirmado' + resposta pronta
  │   ├─ 'cancel…' ⇒ status='cancelado' + resposta pronta
  │   └─ 'reagend…'⇒ reagendamento_pedido_em (horário NÃO libera) +
  │                  entregar_ao_agente=true
  ├─ resposta pronta ⇒ POST N8N_LEMBRETE_RESPOSTA_URL {salon_id, phone_number_id,
  │   contact_phone, appointment_id, acao, resposta}
  │        ▼
  │   n8n webhook lembrete-resposta-central  — SEM AUTENTICAÇÃO                   ◄── C3
  │        └─ Enviar Resposta de Lembrete (Cloud API) — body.resposta VERBATIM
  ├─ reagendar (número do salão) ⇒ edge monta contexto "JÁ TEM horário, REMARQUE"
  │   e manda ao fluxo do agente… que DESCARTA body.contexto                       ◄── C2
  │   ⇒ agente cria um SEGUNDO agendamento (a trava do banco não pega:
  │      dois horários em momentos distintos não se sobrepõem)
  ├─ reagendar (número central) ⇒ acao='reagendar_central' ⇒ convite wa.me da barbearia
  └─ cliente DIGITA "sim" em vez de clicar ⇒ descartado com log; confirmação perdida ◄── C5
```

### C.1 — Passo a passo: quem dispara, o que trafega, quem recebe, o que grava, o que acontece se falhar

**Passo 1 — Criação pelo CRM.** O barbeiro/gestor dispara; trafega primeiro a RPC `garantir_cliente {p_salon_id, p_nome, p_telefone}` (acha ou cria por cima da RLS de leitura, dedup pelos últimos 8 dígitos — `NewAppointmentModal.tsx:139-152`), depois o INSERT em `appointments` com os campos do diagrama (`:194-207`; retroativo entra como `'concluido'` para escapar do cron de cancelamento — `:186-203`), depois `definir_servicos_do_agendamento` que recalcula o fim e recusa 23P01 se não couber (`:212-227`). **Se falhar:** rollback manual do agendamento e do cliente criado nesta tentativa (`:216-246`); erro de constraint chega traduzido ao barbeiro. Fechado.

**Passo 2 — Criação pelo agente.** O cliente dispara via conversa (Fluxo B); a ferramenta `Criar Agendamento` grava com `origem='agente'`, `status='agendado'`, `salon_id` fixado pelo fluxo (`03-n8n.md §2`); há ferramenta `Verificar Disponibilidade do Profissional`, mas a garantia dura é a mesma do passo 1: as constraints do banco. **Se falhar** (horário ocupado no meio da conversa): a tool devolve erro ao modelo — **o que o agente responde nesse caso nunca foi observado** (zero execuções reais do caminho — NÃO VERIFICADO). Operacionalmente este passo está morto junto com o Fluxo B.

**Passo 3 — Criação pela agenda pública.** O cliente dispara pelo QR; a edge `agenda-publica` revalida o horário contra `horarios_livres` **no servidor**, com rate limit por IP e teto por barbearia, e devolve `token_gestao` (uuid) para `/meu-horario/:token` (`01-supabase.md §2`; `02-crm.md §1`). **Se falhar:** erros explícitos na tela; cancelamento só com o token e antecedência mínima. Ressalvas: o recurso nasce **desligado** (`useRecurso` default false), o fuso é fixo `America/Sao_Paulo` (`01-supabase.md §4`), e a lista real de um dia útil cheio nunca foi vista (`02-crm.md §4.8`).

**Passo 4 — Checagem de conflito.** Não é um passo de aplicação: mora no banco e cobre **as três portas de uma vez** — exclusão por profissional (`0018:31`/`0063:31`), exclusão por cliente (`0042:18`), folga entre atendimentos (`0134:82-85`). É o elo mais sólido dos cinco fluxos. Ressalva estrutural: as exclusões dependem da `btree_gist` instalada no schema `public` (`01-supabase.md §3.11`) — movê-la exige recriar as constraints, uma janela em que a proteção some para todos.

**Passo 5 — Job de lembrete.** O cron de 10 min dispara; a fila é montada **dentro do workflow** (não numa view, ao contrário dos irmãos): busca `appointments` de todos os salões e filtra em código (`03-n8n.md §4.4`), aplica a janela 85–100 min, pula cliente que nunca conversou (política Meta), e passa por dois gates. **Gate 1:** `whatsapp_templates.status='aprovado'` — **os 25 templates estão em rascunho, nunca submetidos à Meta** (`05-meta.md §3.1`); fila vazia, 2.018 execuções verdes de 100–600 ms por cima de um canal morto. **Gate 2:** `Buscar Instância do Salão` exige `phone_number_id` da conexão **do salão** — que é NULA no modelo híbrido; a migration 0115 desamarrou reativação/atraso/vencimento para o remetente central, **mas o lembrete ficou para trás** (`05-meta.md §3.2`). Conclusão dura: **mesmo aprovando o template, o lembrete não sai.** E quando sair: marca `lembrete_enviado` ANTES de enviar (decisão consciente pelo ciclo curto), então **falha de envio = lembrete perdido para sempre, sem retry além dos 3× e sem rastro** — e sem o wamid gravado, o clique de resposta fica órfão (C4).

**Passo 6 — Confirmação.** O cliente clica; trafega o botão com `context.id` (wamid) pela Meta até a edge; a RPC `responder_lembrete` (`0086:41-157`) aplica com idempotência (`lembrete_respondido_em`), recusa clique atrasado (`tarde_demais`), e devolve texto pronto — **o banco decide, não o LLM, e não se paga chamada de modelo por clique**. A resposta volta ao cliente por `N8N_LEMBRETE_RESPOSTA_URL` → n8n → Cloud API. **Se falhar:** RPC com erro no número do salão → cai para o agente (melhor atender mal que ignorar — `whatsapp-webhook/index.ts:320-323`); `N8N_LEMBRETE_RESPOSTA_URL` ausente → clique **aplicado no banco** mas cliente sem resposta, só `console.error` (`:350-352`). **Reagendar é o caso quebrado:** no número do salão, a edge monta o contexto "REMARQUE o existente" (`:328-334`) e o n8n **descarta `body.contexto`** (`03-n8n.md §A1`) — o agente cria um segundo agendamento, e a trava de sobreposição do banco não pega dois horários em momentos distintos. **Quem digita "sim" em vez de clicar** no número central é descartado com log (`:270-274`; `05-meta.md §3.4`) — confirmou e ficou no vácuo. E como `statuses` são descartados (`:199,280`), template aceito-mas-não-entregue fica registrado como enviado (`05-meta.md §3.5`).

**Passo 7 — Pós-agendamento.** O cron `cancela-agendamentos-sem-comanda` (*/5 min, ativo — `01-supabase.md §1`) limpa `'agendado'` vencido sem comanda; a faixa de check-in do balcão saiu da UI e a decisão passou ao banco (`02-crm.md §3.8`). A Política de Atraso — o "está vindo?" — existe pronta e está **desligada, nunca publicada** (`03-n8n.md §1`).

### C.2 — Onde a corrente ESTÁ FECHADA

1. **Conflito resolvido no lugar certo, uma vez, para todas as portas** — dupla exclusão + folga no banco (`0018`/`0042`/`0063`/`0134`). Nenhum caminho de criação escapa.
2. **Criação pelo CRM**: dedup de cliente por RPC, compensação de falha parcial, retroativo tratado, erro traduzido (`NewAppointmentModal.tsx:100-246`).
3. **Agenda pública com defesa em camadas** e cancelamento por token — melhor endpoint público do projeto (`01-supabase.md §2`).
4. **`responder_lembrete` é exemplar** (`0086`): wamid como chave, idempotência contra reentrega da Meta, clique atrasado não falseia histórico, botão desconhecido vai ao agente em vez de morrer.
5. **Fail-closed dos templates**: nada aprovado ⇒ nada sai ⇒ nada é marcado — as execuções verdes com fila vazia provam a trava em produção (`05-meta.md §2`).
6. **Reagendar não libera o horário antigo** (`0086:143-147`) — o cliente não perde a vaga por ter cogitado trocar.

### C.3 — Onde a corrente ESTÁ ABERTA

**C1 — ABERTO/CRÍTICO: o lembrete — recurso central do produto — está morto DUAS vezes, e as duas mortes são silenciosas.** (a) 25/25 templates em rascunho, nunca submetidos (`05-meta.md §3.1`); (b) mesmo aprovando, o workflow busca o `phone_number_id` na conexão do salão em vez do remetente central — cai em "Pula Lembrete" com execução verde (`05-meta.md §3.2`). Corolário perverso: **no dia em que o template for aprovado, avaliação/vencimento/reativação começam a enviar sozinhos para clientes reais** (`03-n8n.md §4.2`) **e o lembrete continua mudo** — o pior dos dois mundos, sem nenhum alerta em nenhum dos lados.

**C2 — ABERTO/ALTO: o clique "Reagendar" produz agendamento duplicado.** A edge prepara o contexto; o n8n o descarta (`03-n8n.md §A1`); o agente trata como pedido novo; a constraint não protege horários disjuntos. É exatamente o defeito que a auditoria do agente existe para flagrar — introduzido pelo elo de integração, não por nenhum componente isolado.

**C3 — ABERTO/ALTO: o webhook `lembrete-resposta-central` não tem autenticação e envia `body.resposta` verbatim pelo número oficial da plataforma** (`03-n8n.md §A4`). Um POST forjado = spam/phishing carimbado pela marca, no número que carrega os avisos de **todas** as barbearias. Barreira atual: o UUID do path.

**C4 — ABERTO/MÉDIO: "enviado" não significa entregue, e às vezes nem enviado.** Marca antes de enviar + `statuses` descartados (`05-meta.md §3.5`) — lembrete que falhou no envio ou não foi entregue fica registrado como sucesso, sem reconciliação. E sem o wamid, a resposta do cliente vira mensagem solta.

**C5 — ABERTO/MÉDIO: confirmação digitada é jogada fora.** Parte real dos clientes responde "sim" em texto; no número central isso é logado e descartado (`whatsapp-webhook/index.ts:270-274`) — a confirmação se perde e o cliente fica sem resposta num número que não conversa.

**C6 — ABERTO/MÉDIO: o schema do elo central nasceu fora do repo.** `add_lembrete_enviado_to_appointments` está na lista de migrations aplicadas **sem arquivo no repositório** (`01-supabase.md §3.3`) — a coluna que governa o job de lembrete não tem fonte versionada; um banco recriado do repo não a teria.

**C7 — ABERTO/BAIXO (escala): o job varre `appointments` de todos os salões a cada 10 min** filtrando em code node (`03-n8n.md §4.4`) — vira transferência e memória à toa com dezenas de salões.

**C8 — ABERTO/BAIXO: Política de Atraso pronta e desligada** (`67oZqGOIoKO6pAeQ`, `active:false`, nunca publicada — `03-n8n.md §1`) — prometida na régua do produto, inexistente na prática.

**C9 — ABERTO/BAIXO: dois relógios.** Views de gate em UTC, RPC/telas em São Paulo (`06-asaas.md §4.3`); agenda pública com fuso fixo (`01-supabase.md §4`) — barbearia fora de SP verá "hoje" errado na virada do dia.

### C.4 — Completude: **60%** (agendamento ~90 / lembrete ~15)

| Segmento | Peso | Estado |
|---|---|---|
| Criação CRM + conflito + gravação | 25% | ~90% — o trecho mais sólido do sistema inteiro; conflito garantido no banco para todas as portas |
| Criação pelo agente | 15% | ~65% estrutural — ferramentas certas, mas operacionalmente morto (Fluxo B) e com o caso reagendar quebrado (C2) |
| Criação pela agenda pública | 10% | ~85% — fechada em código; desligada por padrão e nunca vista num dia útil cheio |
| Job de lembrete → envio | 30% | **~10%** — morto duas vezes (C1), marca antes de enviar, sem visibilidade de entrega (C4), schema sem fonte (C6) |
| Confirmação (clique → status → resposta) | 20% | ~55% estrutural — RPC exemplar, mas nunca exercitada com tráfego real, com o reagendar duplicando (C2), a resposta digitada perdida (C5) e o webhook de resposta aberto (C3) |

25×0,90 + 15×0,65 + 10×0,85 + 30×0,10 + 20×0,55 ≈ **60%**. A leitura honesta: **"agendamento" e "lembrete" não são um fluxo — são dois, em estados opostos.** O agendamento é o orgulho do projeto: três portas, uma trava, compensações corretas. O lembrete é uma procissão de execuções verdes em volta de um canal que nunca enviou nada no modelo vigente e que, por construção, não enviará nem quando o template for aprovado. Tudo o que depende do lembrete — confirmação, cancelamento pelo botão, reagendamento — é código bom esperando um gatilho que não dispara.

### C.5 — Pontos únicos de falha e o efeito nos OUTROS tenants

| SPOF | O que acontece quando falha | Efeito nos outros tenants |
|---|---|---|
| **Número central da Meta** (um `phone_number_id` para toda a plataforma) | Nota de qualidade cai / número sinalizado (denúncias de reativação, por ex.) | Lembrete, avaliação, vencimento e atraso de **todas** as barbearias calam juntos — e o monitor de qualidade está cego (`eventos_da_waba` = 0, campos não assinados — `05-meta.md §3.3`) |
| **Tabela `whatsapp_templates` (gate central)** | Template recategorizado/pausado pela Meta | O recurso correspondente para para **todos** de uma vez; aprovação em lote liga envios para **todos** de uma vez, sem rito de teste (`03-n8n.md §4.2`) |
| **Webhook `lembrete-resposta-central`** (um endpoint, sem auth) | Forjado ou fora do ar | Forjado: spam pelo número oficial ⇒ banimento atinge **todos**; fora do ar: cliques de **todos** aplicados no banco sem resposta ao cliente |
| **Cron scheduler do n8n** (mesmo container de tudo) | n8n cai | Nenhum lembrete/avaliação/aviso para **ninguém** — e nenhum alerta, porque o carteiro morreu junto |
| **pg_cron do Supabase** (`cancela-agendamentos-sem-comanda` */5min, sem monitoramento — `06-asaas.md §4.2`) | Job com bug ou parado em silêncio | Bug: cancela agendamentos legítimos de **todos** a cada 5 min; parado: 'agendado' fantasma acumula em **todos** |
| **`WHATSAPP_APP_SECRET`** | Rotação errada | Cliques de lembrete/avaliação de **todos** viram `200 IGNORED` — confirmações somem em silêncio |
| **`btree_gist` em `public`** (base das exclusões) | Migração malfeita ao movê-la | Janela sem proteção de sobreposição para **todos** os salões |

---

## Fluxo D — Cobrança

Assinatura/uso do lojista → Asaas → webhook → estado da conta no Supabase → bloqueio/liberação do serviço.

**Nota de modelo:** "assinatura" morreu em 24-25/08 (`0110_aposenta_plans.sql`). O modelo vigente é **cobrança por uso**: R$/agendamento do agente, fechamento mensal no banco, boleto avulso no Asaas (`06-asaas.md`, aviso de escopo). O que segue é o modelo vigente + o legado que ainda vaza dele.

### D.0 — Diagrama do caminho completo

```
MEDIÇÃO (100% no banco)
agendamento origem='agente' (+ reativação confirmada)
   │  pg_cron fechamento-mensal-de-uso (0 9 1 * *, ativo em produção)
   ▼
fechar_mes_de_uso() → gerar_fatura_de_uso() congela o período em faturas_de_uso
   preço por faixa de barbeiros (faixas_de_uso: R$0,75 até 3, caindo a R$0,60)
   corta dias de teste e dias já faturados (0130:73-84)
   custo de IA do agente NÃO entra em consumo_ia ⇒ margem por salão desconhecida  ◄── D8

EMISSÃO
n8n "Detalhamento de Uso" (8Qh33uoFm4VqT1eO, cron de hora em hora — ÚNICO chamador) ◄── SPOF
   └─ nó Gerar Boletos: POST /functions/v1/cobrar-uso
      Authorization: Bearer <service role key>, comparação em tempo constante
      (nota do nó diz "token anon basta" — MENTIRA; e onError engole 401)         ◄── D6
      cobrar-uso (v4 = repo): fatura com asaas_payment_id NULO, valor ≥ R$5, com CPF/CNPJ
        ├─ POST /v3/customers {name, cpfCnpj, externalReference}  — SEM e-mail    ◄── D3
        ├─ POST /v3/payments  {billingType:'UNDEFINED', dueDate: hoje+7,
        │                      externalReference: salon_id | 'rede:<orgId>'}
        ├─ grava asaas_payment_id/boleto_url/boleto_vencimento; se a gravação
        │  falhar → DELETE /v3/payments/{id} (compensa)
        └─ sem ASAAS_BASE_URL ⇒ falha ALTO (sem fallback — o padrão certo)

ENTREGA
n8n lê faturas_a_notificar → e-mail de detalhamento (dono do produto)
     boletos_a_enviar    → e-mail com link ao dono da barbearia (SMTP Gmail pessoal) ◄── D11
     marca notificada_em / boleto_notificado_em DEPOIS do envio (correto)
     texto promete "boleto, Pix ou cartão" — só cartão funciona na conta          ◄── D7

PAGAMENTO
Asaas ──► POST /functions/v1/asaas-webhook (v21 = repo; verify_jwt=false)
   ├─ header asaas-access-token = ASAAS_WEBHOOK_TOKEN; env ausente ⇒ 500 (fechado)
   ├─ idempotência: INSERT asaas_eventos (PK no id do evento; 23505 = "já tratei";
   │  efeito falhou ⇒ destrava para a reentrega)
   ├─ PAGOU (CONFIRMED/RECEIVED/RECEIVED_IN_CASH):
   │   roteia payment.subscription → organizations │ 'rede:<org>' → todas as
   │   unidades │ salon_id → a unidade
   │   faturas_de_uso.paga_em (por asaas_payment_id)
   │   subscriptions.acesso_ate = dueDate+1mês; atendimento_ate +3d
   │   (conta do VENCIMENTO, não do dia do pagamento — atraso não vira bônus)
   ├─ PAYMENT_OVERDUE ⇒ só status='atrasada' (fora de ordem marca PAGO como atrasado) ◄── D5
   └─ evento desconhecido ⇒ 200 (fila do Asaas não pausa)
   ⚠ asaas e asaas-webhook têm fallback ASAAS_BASE_URL → SANDBOX silencioso       ◄── D4

BLOQUEIO / LIBERAÇÃO
pg_cron estende-acesso-sem-debito (20 4 * * *, ativo): estende quem NÃO tem
   fatura vencida em aberto — quem não deve não bloqueia (0130:232-274)           ◄── SPOF
RPC situacao_do_acesso (0131) ─► AppLayout troca o CRM por AcessoBloqueado
   (exceto /assinatura); WhatsApp segue +3 dias (salons_atendendo)
   relógios: RPC em São Paulo, views em UTC — divergem na virada do dia           ◄── D10

CANCELAR
CRM CancelarUso ─► edge asaas {acao:'cancelar', salonId} (JWT, owner)
   ├─ remove recorrência LEGADA no Asaas se houver; recusa do Asaas ABORTA
   ├─ status='cancelada' + RPC gerar_fatura_de_cancelamento (parcial, na hora)
   └─ MAS: recorrências órfãs pós-reseed não têm mais espelho ⇒ inalcançáveis    ◄── D2

INADIMPLÊNCIA
(nada) — OVERDUE marca status e mais ninguém fica sabendo                         ◄── D3
```

### D.1 — Passo a passo: quem dispara, o que trafega, quem recebe, o que grava, o que acontece se falhar

**Passo 1 — Medição e fechamento.** Ninguém "assina": usar é a assinatura; a barbearia nasce em `trial` (Fluxo A). O pg_cron dispara `fechar_mes_de_uso()` no dia 1º; `gerar_fatura_de_uso()` congela agendamentos de `origem='agente'` em `faturas_de_uso`, com a cadeia anti-cobrança-dupla da 0130 (corta teste, corta já-faturado, cancelada só pula com fatura de cancelamento emitida). Há teste pgTAP dedicado (`supabase/tests/cadeia_de_cobranca.test.sql`). **Se falhar:** pg_cron parado em silêncio = nenhuma fatura nasce; **não há monitoramento de execução dos crons** (`06-asaas.md §4.2`). Fatura < R$5 acumula sem teto — cauda de micro-uso permanentemente grátis, por desenho e sem medição (`06-asaas.md §4.6`).

**Passo 2 — Emissão.** O cron horário do n8n é o **único** chamador de `cobrar-uso` (`06-asaas.md §1.4`). A função é idempotente (só fatura sem `asaas_payment_id`), autentica por service key em tempo constante, **sem fallback de URL** (falha alto — o padrão que as irmãs deviam copiar), e compensa falha parcial deletando a cobrança criada (`06-asaas.md §2.7`). **Se falhar:** o nó tem `onError: continueRegularOutput` e a nota dele afirma — **errado** — que o token anon basta (`06-asaas.md §3.5`): um 401 permanente deixaria as execuções verdes com **zero cobranças nascendo**, indefinidamente. Evidência indireta de que a credencial atual está certa (as 282 execuções leem views só-service_role), mas o nó HTTP pode usar outra credencial e o MCP não mostra. Corrida: duas execuções simultâneas podem gerar **duas cobranças** da mesma fatura, a primeira ficando órfã — e se o cliente pagar a órfã, o acesso estende sem nenhuma fatura ganhar `paga_em` (`06-asaas.md §4.1`).

**Passo 3 — Entrega.** E-mail é o **único** canal: detalhamento ao dono do produto, boleto ao dono da barbearia, ambos pelo Gmail pessoal `castrocollin01@gmail.com`, marcando depois de enviar (correto — falha volta à fila). **Se falhar:** boleto no spam = a barbearia nunca fica sabendo que deve (`06-asaas.md §4.7`); barbearia com dois donos manda para um só, o mais antigo (`06-asaas.md §4.4`). E o texto do e-mail promete "boleto, Pix ou cartão" com **Pix e boleto bloqueados na conta Asaas** — o dono clica e só encontra cartão (`06-asaas.md §3.6`): atrito direto na conversão do pagamento, no público que mais usa Pix.

**Passo 4 — Pagamento e webhook.** O Asaas dispara com o header `asaas-access-token`; a idempotência por `asaas_eventos` com trava/destrava está correta para entrega at-least-once (`06-asaas.md §2.1`). O período pago conta do vencimento; atraso não mexe em datas. **Se falhar:** evento com efeito quebrado destrava e a reentrega do Asaas re-processa (fechado); **evento fora de ordem** não é tratado — `PAYMENT_OVERDUE` chegando depois do `PAGOU` do mesmo boleto marca "atrasada" uma conta paga, e a tela do dono passa a exibir "Cobrança em atraso" (`06-asaas.md §3.4`). E as duas funções que ainda falam com a API (`asaas`, `asaas-webhook`) têm **fallback silencioso para o sandbox** (`06-asaas.md §3.3`): env sumida num redeploy e o cancelamento de recorrência legada conversa com o sandbox — o 404 do sandbox é tratado como sucesso, o banco marca `cancelada`, **e a recorrência real continua cobrando**. O próprio projeto já sabe que isso é errado: `cobrar-uso` não tem fallback de propósito, com comentário dizendo por quê.

**Passo 5 — Bloqueio/liberação.** `estende-acesso-sem-debito` (diário) estende quem não tem dívida vencida com boleto emitido; `situacao_do_acesso` decide `bloqueado`/`atendendo` para a equipe inteira sem vazar CPF ao barbeiro; o CRM tranca tudo menos `/assinatura`; o WhatsApp segue 3 dias. A dupla trava de escrita em `subscriptions` está aplicada em produção — o dono só atualiza `cpf_cnpj`, não se dá `acesso_ate='2099'` (`06-asaas.md §2.6`). **Se falhar:** o acesso de **todo pagante em dia depende desse cron diário** — pg_cron mudo por alguns dias e barbearias sem dívida nenhuma começam a bloquear (`06-asaas.md §4.2`). E os dois relógios (RPC em SP, views em UTC) fazem tela e agente discordarem perto da meia-noite (`06-asaas.md §4.3`).

**Passo 6 — Cancelamento.** Único botão do cliente; valida `owner` pelo JWT; aborta se o Asaas recusar a remoção da recorrência legada (evita "cancelada no banco, cobrando no Asaas"); gera fatura parcial na hora, com o fechamento mensal como rede de segurança (`06-asaas.md §2.10`). Fechado — **para o que o banco conhece.**

**Passo 7 — O que o banco NÃO conhece (o buraco real de dinheiro).** A produção foi zerada em 03/09 e recriada em 04/09; as recorrências antigas (El Guardians R$ 5/mês, Curitiba `sub_klx4z6d0xv9p83h4`) e 2 customers **ficaram no Asaas sem nenhum espelho no banco** (`06-asaas.md §3.1`). O botão Cancelar só alcança recorrência com `asaas_subscription_id` preenchido — que hoje é NULO. Se ainda estiverem ativas, **cobram dinheiro real todo mês** de pagadores que o sistema não conhece; o webhook responderia "assinatura não encontrada" com 200 e nada apareceria no CRM. **Não existe regra "zerar banco exige zerar Asaas".**

**Passo 8 — Inadimplência.** `PAYMENT_OVERDUE` marca `status='atrasada'` e **acabou**: nenhum workflow de cobrança vencida existe, nenhum lembrete, e o customer no Asaas nasce **sem e-mail** — nem o próprio Asaas consegue mandar as notificações dele (`06-asaas.md §3.2`). Depois do único e-mail de boleto, o silêncio até o bloqueio. Inadimplência vira churn evitável.

### D.2 — Onde a corrente ESTÁ FECHADA

1. **Idempotência do webhook** com trava/destrava correta para at-least-once (`06-asaas.md §2.1`) — o melhor tratamento de webhook do sistema.
2. **Autenticação fail-closed nas três funções** e `cobrar-uso` sem fallback de URL, com compensação de falha parcial (`§2.2, §2.7`).
3. **A cadeia 0130** (anti-cobrança-dupla, teste grátis, bloqueio justo) com os dois crons **confirmados ativos em produção** e teste pgTAP.
4. **Dupla trava de escrita em `subscriptions`** aplicada e verificada — o dono não se auto-libera (`§2.6`).
5. **Período conta do vencimento; atraso não mexe em datas** (`§2.4-2.5`).
6. **n8n marca depois de enviar** — e-mail perdido volta à fila (`§2.11`).
7. **Cancelamento que aborta** se o Asaas recusar, com fatura parcial imediata (`§2.10`).
8. **Código deployado = repo nas três funções** — o único componente sem drift confirmado (`06-asaas.md §1`, "Código deployado").

### D.3 — Onde a corrente ESTÁ ABERTA

**D1 — ABERTO/CRÍTICO-operacional: o ciclo NUNCA rodou ponta a ponta com dinheiro real no modelo vigente.** 0 faturas, 0 cobranças, 0 eventos de webhook (`06-asaas.md §6.7`). O teste real de 16/08 foi no modelo morto. O primeiro fechamento real (01/10, com a El Guardians saindo do teste em 11/09) será a **estreia em produção** de `fechar_mes_de_uso` → `cobrar-uso` → e-mail → pagamento → webhook, com clientes reais no meio. Não é defeito de código — é dívida de verificação num fluxo de dinheiro.

**D2 — ABERTO/ALTO: dinheiro real cobrando fora do alcance do sistema.** Recorrências e customers órfãos no Asaas pós-reseed, inalcançáveis pelo botão de cancelar (`06-asaas.md §3.1`). É o único ponto de TODOS os fluxos em que dinheiro de verdade pode estar se movendo **hoje** contra o estado do banco.

**D3 — ABERTO/ALTO: inadimplência muda de status e não fala com ninguém** — sem dunning, sem retry, e customer sem e-mail no Asaas (`06-asaas.md §3.2`).

**D4 — ABERTO/MÉDIO: fallback sandbox silencioso** em `asaas` e `asaas-webhook`, com o pior caso "cancelou no sandbox, cobra na produção" (`06-asaas.md §3.3`).

**D5 — ABERTO/MÉDIO: OVERDUE fora de ordem** marca pago como atrasado na tela do dono (`06-asaas.md §3.4`).

**D6 — ABERTO/MÉDIO: a nota do nó Gerar Boletos mente sobre a credencial e o nó engole 401** — o modo de falha "nenhuma cobrança jamais nasce, tudo verde" está armado (`06-asaas.md §3.5`).

**D7 — ABERTO/MÉDIO: promessa "boleto, Pix ou cartão" com só cartão funcionando** (`06-asaas.md §3.6`) — atrito de conversão no elo mais sensível.

**D8 — ABERTO/MÉDIO: o preço é por agendamento, mas o custo não é conhecido.** Os tokens do agente — a maior fatia do custo de IA — não entram em `consumo_ia` (`03-n8n.md §M4`); a margem real por salão e o export para a Aura saem subestimados. Cobra-se por uso sem medir o custo do uso.

**D9 — ABERTO/BAIXO: corrida no `cobrar-uso`** pode emitir boleto duplo com órfã pagável (`06-asaas.md §4.1`).

**D10 — ABERTO/BAIXO: o acesso de todo pagante em dia pende de um cron diário sem monitor**, e os dois relógios divergem na virada do dia (`06-asaas.md §4.2-4.3`).

**D11 — ABERTO/BAIXO: e-mail como canal único, por Gmail pessoal, para um dono só** (`06-asaas.md §4.4, §4.7`).

**D12 — ABERTO/BAIXO: precedente do `externalReference`** — cobrança manual no painel com `externalReference = salon_id` casa no fallback do webhook e dá um mês de acesso; o quase-acidente já aconteceu (`06-asaas.md §4.8`).

### D.4 — Completude: **70% estrutural / 0 ciclos reais completados**

| Segmento | Peso | Estado |
|---|---|---|
| Medição + fechamento mensal | 20% | ~85% — cadeia 0130 sólida, crons ativos, pgTAP; sem monitor de cron, custo de IA fora da conta (D8) |
| Emissão (`cobrar-uso`) | 20% | ~80% — idempotente com compensação; credencial não confirmada + 401 engolido (D6), corrida (D9) |
| Entrega (e-mail) | 10% | ~65% — funciona; canal único, Gmail, promessa de Pix/boleto falsa (D7, D11) |
| Pagamento + webhook | 20% | ~80% — idempotência exemplar; fora-de-ordem (D5), sandbox fallback (D4) |
| Bloqueio/liberação | 15% | ~80% — 0130/0131 corretas e aplicadas; cron único sem monitor, relógios (D10) |
| Espelho com o mundo externo + inadimplência | 15% | **~25%** — órfãos cobrando de verdade (D2), dunning inexistente (D3), "zerar banco ≠ zerar Asaas" |

20×0,85 + 20×0,80 + 10×0,65 + 20×0,80 + 15×0,80 + 15×0,25 ≈ **70%**. A leitura honesta: **é o fluxo mais bem fechado dos cinco em código — e o único onde dinheiro real pode estar vazando AGORA.** As três funções são as únicas com deploy = repo confirmado, a idempotência e as travas de escrita são as melhores do sistema. Mas o ciclo nunca rodou de verdade, a fronteira com o Asaas está suja (órfãos cobrando sem dono), e quem não paga simplesmente não é avisado. Colocar barbearias reais significa que a estreia do ciclo inteiro acontece com dinheiro delas.

### D.5 — Pontos únicos de falha e o efeito nos OUTROS tenants

| SPOF | O que acontece quando falha | Efeito nos outros tenants |
|---|---|---|
| **pg_cron do Supabase** (`fechamento-mensal` + `estende-acesso-sem-debito`, sem monitor) | Para em silêncio | Fechamento: nenhuma fatura de **ninguém**; extensão: **todo pagante em dia começa a bloquear** em ~1 dia — o modo de falha pune exatamente quem não deve |
| **Cron horário do n8n** (único chamador de `cobrar-uso`) | n8n cai ou nó com credencial errada (D6) | Nenhum boleto nasce nem é entregue para **ninguém** — verde por fora |
| **Conta Asaas única** (`ASAAS_API_KEY`; Pix/boleto já bloqueados) | Suspensão/análise/chave revogada | Emissão e baixa de pagamento de **todos** param; webhook com token errado pausa a fila após 15 falhas e as confirmações de **todos** ficam presas |
| **Secret `ASAAS_WEBHOOK_TOKEN` + config do webhook no painel** | Divergência após rotação | Todos os eventos viram 401 → fila do Asaas pausa → **ninguém** é liberado após pagar |
| **`ASAAS_BASE_URL`** (com fallback sandbox em 2 de 3 funções) | Env some num redeploy | Cancelamentos de **qualquer** tenant "funcionam" contra o sandbox enquanto a produção segue cobrando (D4) |
| **Gmail pessoal** (canal único de boleto) | Bloqueio/limite/spam | Boletos de **todos** deixam de chegar; inadimplência em massa sem ninguém saber (D3 agrava) |
| **Convenção `externalReference`** | Uso manual no painel com id de salão | Um tenant específico ganha mês de graça — não derruba os outros, mas corrompe a contabilidade do produto (D12) |

---

## Fluxo E — Deploy e runtime

Repo → Vercel (CRM) e Hostinger/VPS (n8n, Evolution) → variáveis de ambiente → domínios/webhooks apontando para os lugares certos.

### E.0 — Diagrama da topologia de deploy

```
                            GitHub Saymon0123/Clinica (repo PÚBLICO, branch main)
                                              │
        ┌─────────────────────────────────────┼──────────────────────────┬─────────────────────┐
        │ push = deploy AUTOMÁTICO            │ aplicação MANUAL         │ NENHUM pipeline     │
        ▼                                     ▼                          ▼                     ▼
   VERCEL (projeto clubcut)             SUPABASE (clinica-crm)      n8n (VPS)           EVOLUTION (VPS)
   build: tsc -b && vite build          migrations à mão            workflows editados   docker-compose no
   (erro de tipo derruba o             (supabase CLI / painel)      AO VIVO no único     painel Hostinger
    deploy, não a produção)             edge functions à mão        ambiente = produção  imagem :latest ◄─E11
   CI (vitest+pgTAP) roda EM            │                           sem export no repo   config versionada
   PARALELO — NÃO gateia ◄── E5         │ DRIFT DOS DOIS LADOS ◄─E3 sem staging  ◄── E4  (evolutionConfig
   envs VITE_* em BUILD TIME            │ repo 138 arquivos vs      3 rascunhos ≠         .json) aplicada no
   (rotação = redeploy) ◄── E9          │ prod 152-153 aplicadas;   publicado             connect + script
        │                               │ ≥18 sem arquivo no repo;  retenção ~14d é a     de backfill manual
        │                               │ admin-metricas SÓ em      única trilha
        │                               │ prod ◄── E7; verify_jwt
        │                               │ vive SÓ no painel ◄── E7
        ▼                               ▼                                │
   DOMÍNIOS                        RUNTIME SUPABASE                 VPS srv1833354 (KVM 2, único)
   clubcut.space (DNS Hostinger)   46 tabelas RLS, 12 edges,        SEM FIREWALL; n8n :32769 e
    A @ → Vercel ✓ www 308 ✓       7 pg_cron, Realtime              Evolution :32770 em 0.0.0.0
    HSTS ✓ e-mail MX/SPF/DKIM ✓    SEM BACKUP ◄────────── E1        HTTP puro ◄──────────── E2
    DMARC p=none ◄── E12           plano gratuito                   backup semanal (2), restore
   + clubcut.vercel.app 200        já houve UM wipe (03/09)         jamais testado; snapshot: 0
   + clinica-crm-kappa 200 ◄── E8
   index.html canonical =          WEBHOOKS EXTERNOS ("apontando para os lugares certos")
   clubcut.vercel.app ◄── E8       Meta → whatsapp-webhook ......... config no painel, NÃO CONFERÍVEL
   APP_URL fallback =              Asaas → asaas-webhook ........... config no painel, NÃO CONFERÍVEL
   clubcut.vercel.app ◄── E8       Evolution → N8N_WEBHOOK_URL ...... INDÍCIO FORTE DE ERRADO (A1/B1)
   n8n hardcode =                  edge → N8N_WHATSAPP_WEBHOOK_URL .. idem
   clubcut.space ◄── E8            Supabase Auth Site URL/allow-list  PENDENTE (go-live 4,5,7,10) ◄── E13
```

### E.1 — Passo a passo: quem dispara, o que trafega, quem recebe, o que grava, o que acontece se falhar

**Peça 1 — Repo → Vercel (CRM).** Push em `main` dispara build+deploy de produção automaticamente (`07-vercel.md §1`). O build repete o typecheck, então erro de tipo **derruba o deploy e preserva a produção** (o único ERROR dos últimos 20 ficou em ERROR, corrigido em ~1 min — `07-vercel.md §1`). Previews atrás de Vercel Authentication. **Se falhar do jeito perigoso:** o CI (vitest + pgTAP) roda **em paralelo, não antes** — teste vermelho com typecheck verde **chega em produção** (`07-vercel.md §4.3`; o commit `21f359b` documenta o buraco). Runtime: sem headers de segurança, assets com `max-age=0` revalidando ~100 arquivos por visita, e o plano é **Hobby — pessoal e não comercial — servindo um SaaS cobrado** (`07-vercel.md §3.1-3.2, §4.1`).

**Peça 2 — Repo → Supabase.** Migrations e edge functions são aplicadas **à mão** (regra do próprio `CLAUDE.md`). O resultado acumulado: **drift nos dois sentidos** — ≥18 migrations aplicadas sem arquivo no repo, 2 arquivos do repo fora da produção, numeração derivando, e o ritmo recente foi de ~2 mudanças manuais por semana (`01-supabase.md §3.3, §4.8`). Um banco criado do repo **não é** a produção; o pgTAP do CI valida um schema que diverge do real. `admin-metricas` existe **só em produção** — um redeploy limpo a apaga (`01-supabase.md §3.4`). E `verify_jwt` de cada função vive só no painel: um redeploy da `whatsapp-webhook` com o default `true` faria a Meta tomar 401 e, após falhas repetidas, **desativar o webhook do app inteiro** (`05-meta.md §4`).

**Peça 3 — Repo → n8n.** **Não existe pipeline.** Os 13 workflows são editados ao vivo no único ambiente, que é produção; não há export no repositório, não há staging, e 3 workflows têm rascunho diferente da versão publicada — um "publish" acidental do Detalhamento publica um trigger incompleto (`03-n8n.md §M5, §4.6`). A peça que o `CLAUDE.md` chama de "nenhuma automação existe sem passar por aqui" é a única sem nenhuma forma de versionamento, revisão ou rollback além da memória da instância (~14 dias).

**Peça 4 — Repo → VPS/Evolution.** O compose vive no painel da Hostinger; a imagem é `:latest` não pinada — qualquer recreate pode trocar a versão do Baileys em silêncio para todas as instâncias (`04-evolution.md §3.8`). O runtime está **sem firewall nenhum**, com n8n e Evolution publicados em `0.0.0.0` em HTTP puro, contornando o TLS do Traefik (`08-hostinger.md §3-CRÍTICO`) — a Evolution guarda sessões de WhatsApp, o n8n guarda credenciais de SMTP/OpenRouter/Telegram/**Supabase service_role**. Ponto positivo isolado: `evolutionConfig.json` é fonte única versionada, com script de backfill.

**Peça 5 — Domínios e DNS.** `clubcut.space` comprado (04/09), DNS na Hostinger apontando certo para a Vercel, HSTS, www→apex 308, e-mail com MX/SPF/DKIM completo e snapshots de zona (`08-hostinger.md §1-2`). **Mas a identidade do produto está espalhada em 4 fontes divergentes:** dois domínios legados servindo o app completo com 200 (`clubcut.vercel.app`, `clinica-crm-kappa.vercel.app` — `07-vercel.md §3.3`), `index.html` com canonical/og no domínio **velho** (`02-crm.md §4.2`), `APP_URL` com fallback no domínio velho (`admin-create-salon/index.ts:10`), e o nó do n8n com o domínio novo **hardcoded** (`03-n8n.md §5`). DMARC em `p=none` justamente antes de migrar o remetente para `contato@clubcut.space` (`08-hostinger.md §3-MÉDIO`).

**Peça 6 — Envs, secrets e webhooks.** O mapa completo (nomes): Vercel 4 `VITE_*` (build time), Supabase ~15 secrets de edge, n8n 15 credenciais, compose com `API_KEY`/`POSTGRES_PASSWORD`. **Nenhum deles é listável por tool, nenhum tem procedimento de rotação escrito, e três têm fallback silencioso** (`APP_URL` → domínio velho; `ASAAS_BASE_URL` → sandbox em 2 funções). O pedido do fluxo — "webhooks apontando para os lugares certos" — tem esta resposta honesta: **Meta e Asaas não são conferíveis do lado de cá, e o da Evolution/n8n tem indício forte de estar errado** (A1/B1). Rotação da anon key = app quebrado até redeploy manual (`02-crm.md §4.6`).

**Peça 7 — Backup e DR.** Supabase: **nenhum backup**, plano gratuito, único depositário de agenda/clientes/financeiro/prova de termos — e **um wipe já aconteceu** (03/09), com os docs contradizendo o banco (`01-supabase.md §3.1-3.2`). VPS: backup semanal automático (janela de perda de até 7 dias para workflows editados quase diariamente), **zero snapshots manuais, restore jamais ensaiado** (`08-hostinger.md §3-ALTO`). n8n: workflows sem export = o backup deles é o backup do VPS. DNS: snapshots ok. Monitoramento externo de qualquer coisa: **inexistente** — o alarme de tudo é o n8n, que mora no VPS que ele deveria vigiar (`04-evolution.md §4.2`).

### E.2 — Onde a corrente ESTÁ FECHADA

1. **GitHub → Vercel**: pipeline automático saudável, typecheck gateando o build, produção preservada em falha, previews protegidos (`07-vercel.md §2`).
2. **Domínio próprio no ar e correto**: DNS, TLS, HSTS, redirect www, e-mail completo, snapshots de zona, renovações automáticas com cartão válido (`08-hostinger.md §2`).
3. **As 3 funções de cobrança com deploy = repo confirmado** (`06-asaas.md §1`) — prova de que dá para manter paridade quando se quer.
4. **`evolutionConfig.json` como fonte única versionada** com backfill scriptado (`04-evolution.md §2`).
5. **VM folgada e estável**: CPU <1%, RAM ~19%, uptime ~51 dias (`08-hostinger.md §1`).

### E.3 — Onde a corrente ESTÁ ABERTA

**E1 — ABERTO/CRÍTICO: o dado do negócio não tem backup.** Supabase gratuito, sem PITR, sem dump externo, com um wipe já ocorrido e não documentado nos docs oficiais (`01-supabase.md §3.1-3.2`). É o único item da auditoria inteira que pode **encerrar o negócio num dia**.

**E2 — ABERTO/CRÍTICO: runtime exposto.** VPS sem firewall, n8n e Evolution em `0.0.0.0` HTTP puro (`08-hostinger.md §3`). Combinado com `EXPOSE_IN_FETCH_INSTANCES=true` e CORS `*` (`04-evolution.md §3.7`), um vazamento da chave global entrega todas as sessões de WhatsApp de uma vez.

**E3 — ABERTO/ALTO: a produção do Supabase não é reproduzível a partir do repo** — drift nos dois sentidos, crescendo ~2 mudanças manuais/semana (`01-supabase.md §3.3`). O custo do conserto cresce toda semana que passa.

**E4 — ABERTO/ALTO: o n8n não tem deploy — tem edição ao vivo em produção**, sem export, sem staging, com rascunhos divergindo (`03-n8n.md §M5`). A peça central do produto é a menos governada.

**E5 — ABERTO/ALTO: o CI não protege a produção.** vitest e pgTAP vermelhos não impedem o deploy — só o typecheck impede (`07-vercel.md §4.3`).

**E6 — ABERTO/ALTO: os apontamentos externos são um ato de fé.** Nenhum dos webhooks configurados em painéis de terceiros (Meta, Asaas, Evolution→n8n) é conferível daqui, e o único com evidência circunstancial — o da Evolution — aponta para o lado errado (A1/B1).

**E7 — ABERTO/MÉDIO: dois artefatos de deploy armadilhados** — `admin-metricas` sem fonte (redeploy a perde) e `verify_jwt` só no painel (redeploy da `whatsapp-webhook` pode calar a Meta para o app inteiro).

**E8 — ABERTO/MÉDIO: 4 fontes divergentes para a identidade/URL do produto** (dois domínios legados vivos, canonical velho no HTML, fallback velho na env, hardcode novo no n8n). Cada verificador de origem futuro nasce tendo que conhecer a lista tripla (`07-vercel.md §4.4`).

**E9 — ABERTO/MÉDIO: nenhum segredo rotaciona.** Sem procedimento escrito para nenhuma das ~35 credenciais; anon key exige redeploy; `ADMIN_TOOL_SECRET` compartilhado e sem trilha de quem usou (`02-crm.md §4.6-4.7`).

**E10 — ABERTO/MÉDIO: postura de runtime do CRM** — sem CSP/X-Frame-Options/nosniff, cache zerado, plano Hobby fora dos termos para uso comercial (`07-vercel.md §3.1-3.2, §4.1`).

**E11 — ABERTO/MÉDIO: `:latest` na Evolution** — recreate = upgrade silencioso de todas as instâncias (`04-evolution.md §3.8`).

**E12 — ABERTO/BAIXO: repo público** expõe URLs de webhook (o combustível do B2/C3) e o histórico de decisões/incidentes nas mensagens de commit (`07-vercel.md §4.5`); DMARC `p=none` na véspera de migrar o remetente (`08-hostinger.md §3`).

**E13 — ABERTO/BAIXO: go-live do domínio incompleto** — Site URL/allow-list do Auth, secret `APP_URL` e o teste ponta a ponta (passos 4, 5, 7, 10) seguem pendentes nos painéis (`08-hostinger.md §6`).

### E.4 — Completude: **45%**

| Segmento | Peso | Estado |
|---|---|---|
| Repo → Vercel | 15% | ~85% — o único pipeline de verdade do sistema; desconto pelo CI que não gateia (E5) e postura (E10) |
| Repo → Supabase | 20% | ~40% — drift estrutural nos dois sentidos (E3), artefatos armadilhados (E7) |
| Repo → n8n | 15% | **~15%** — não há pipeline; produção editada ao vivo (E4) |
| Repo → VPS/Evolution | 10% | ~40% — config versionada, mas `:latest`, compose no painel e runtime exposto (E2, E11) |
| Domínios/DNS | 10% | ~75% — certo no núcleo; identidade espalhada em 4 fontes (E8), DMARC frouxo |
| Envs/secrets/webhooks apontando certo | 15% | **~30%** — nada conferível, nada rotaciona, um apontamento provavelmente errado (E6, E9) |
| Backup/DR | 15% | **~25%** — zero para o dado do negócio (E1), semanal nunca testado para o VPS, nada para o n8n |

15×0,85 + 20×0,40 + 15×0,15 + 10×0,40 + 10×0,75 + 15×0,30 + 15×0,25 ≈ **45%**. A leitura honesta: **das cinco peças do CLAUDE.md, só uma (Vercel) tem deploy de verdade.** O Supabase tem um processo manual que já divergiu da fonte; o n8n não tem processo nenhum; e a pergunta-título do fluxo — "webhooks apontando para os lugares certos?" — não tem como ser respondida "sim" com a evidência disponível, e tem um "provavelmente não" no elo mais importante. Somado ao E1: o sistema roda, mas não é **reconstruível** — se qualquer peça for perdida (banco, VPS, workflows), não existe caminho testado de volta.

### E.5 — Pontos únicos de falha e o efeito nos OUTROS tenants

| SPOF | O que acontece quando falha | Efeito nos outros tenants |
|---|---|---|
| **Projeto Supabase sem backup** (E1) | Perda/corrupção do banco | **Fim do negócio para todos**: agenda, clientes, financeiro, prova de aceite — irrecuperáveis |
| **VPS único** (n8n + Evolution + Traefik + alertas) | Queda, comprometimento (E2), disco cheio | Canal de conversa, automações e o próprio alarme de **todos** caem juntos; restore de 30 min é teórico |
| **Cartão de crédito único na Hostinger** (renovação do VPS em 16/09 — `08-hostinger.md §4.1`) | Cobrança falha | Hostinger suspende → WhatsApp + n8n de **todos** param por inadimplência da plataforma |
| **Conta GitHub / branch main** (repo público, push = produção sem gate) | Comprometimento da conta ou push errado | Deploy malicioso/quebrado para **todos** os usuários do CRM em minutos |
| **Conta Vercel (Hobby)** | Suspensão por termos de uso comercial (E10) | CRM de **todos** fora do ar, sem SLA nem interlocutor |
| **Zona DNS na Hostinger** | Edição errada da zona | Site + e-mail de **todos** fora (mitigado pelos snapshots de zona) |
| **O dono (bus factor 1)** | Único humano com acesso a todos os painéis; toda migration é manual; nenhum runbook | Qualquer incidente fora do horário dele espera; conhecimento de deploy inteiro numa cabeça só |

---

## Consolidação (parte 6)

### 1. Placar geral

| Fluxo | Completude | O elo que define o número |
|---|---|---|
| A — Onboarding | 60% | Termina num "primeiro atendimento" que nunca foi observado; a tela diz que está tudo certo |
| B — Mensagem de cliente | 55% estrutural / **0% operando** | Entrada provavelmente apontando para o lugar errado; saída grava sucesso sem confirmar entrega |
| C — Agendamento e lembrete | 60% (90/15) | Agendamento fechado no banco; lembrete morto duas vezes, com execuções verdes por cima |
| D — Cobrança | 70% estrutural / **0 ciclos reais** | Melhor código do sistema; dinheiro real possivelmente vazando em órfãos do Asaas |
| E — Deploy e runtime | 45% | Só a Vercel tem pipeline; o sistema roda mas não é reconstruível; sem backup do dado |

**Média estrutural ≈ 58%. Mas a média mente.** Os três elos-fim — a razão de o produto existir — estão em outro patamar: **o primeiro atendimento nunca aconteceu pelo caminho vigente, o lembrete nunca enviou no modelo vigente, e o ciclo de cobrança nunca fechou com dinheiro real.** O que está de fato fechado ponta a ponta, hoje, com evidência: o cadastro/provisionamento (A passos 1–3), o agendamento pelo CRM com conflito no banco (C passos 1/4), o pipeline GitHub→Vercel (E peça 1) e a mecânica interna de webhook/idempotência do Asaas (D passo 4) — os miolos. As pontas que tocam o cliente e o dinheiro estão soltas ou nunca exercitadas.

**Resposta direta à pergunta "dá para colocar barbearias reais?": hoje, não.** Uma barbearia real conectada hoje teria: mensagens de clientes possivelmente morrendo num 404 silencioso (B1), zero lembretes (C1), um canal aberto para terceiros mandarem mensagens pelo WhatsApp dela (B2), e uma cobrança cujo primeiro teste real seria com o dinheiro dela (D1) — tudo isso sem backup do banco (E1) e sem nenhum alerta quando qualquer coisa falhar (B8). O caminho mínimo está na seção 4.

### 2. Matriz de pontos únicos de falha × fluxos

Cada linha é UM ponto; as colunas mostram quais fluxos ele derruba. **Não existe isolamento de infraestrutura entre tenants em nenhuma linha** — o multi-tenant vive só na camada de dados (RLS + salon_id), que é, coerentemente, a parte bem-feita.

| SPOF | A | B | C | D | E | Quando falha, para TODOS os tenants: |
|---|---|---|---|---|---|---|
| **Projeto Supabase (sem backup)** | ● | ● | ● | ● | ● | Fim do negócio; irrecuperável (E1) |
| **VPS srv1833354** (n8n+Evolution+Traefik+alertas) | ● | ● | ● | ● | ● | Canal, automações, cobrança emitida E o alarme caem juntos |
| **n8n (instância/workflow único, sem error workflow)** | ● | ● | ● | ● | ● | Agente, lembretes, convites, boletos — tudo muda, sem aviso |
| **Secrets `N8N_*_URL`** (indício de erro HOJE) | ● | ● | ● | — | ● | Toda mensagem morre em 404 silencioso (A1/B1) |
| **Evolution API** (container único, `:latest`, chave global) | ● | ● | — | — | ● | QR e conversas de todos; `fetchInstances` expõe todos os tokens |
| **Número central Meta + `whatsapp_templates`** | — | ● | ● | — | — | Lembrete/avaliação/vencimento calam juntos; monitor cego (C-SPOF) |
| **`WHATSAPP_APP_SECRET`** | — | ● | ● | — | — | Mensagens cloud e cliques de confirmação viram `200 IGNORED` |
| **pg_cron** (7 jobs, sem monitor) | — | — | ● | ● | — | Bloqueia pagante em dia; cancela/deixa de cancelar agendamentos |
| **Conta Asaas + `ASAAS_WEBHOOK_TOKEN`** | — | — | — | ● | — | Ninguém é cobrado; ninguém é liberado após pagar; fila pausa |
| **Gmail pessoal (SMTP)** | ● | — | — | ● | — | Convites e boletos de todos param (~500/dia, spam) |
| **`ADMIN_TOOL_SECRET`** (estático, em sessionStorage) | ● | — | — | — | — | Criar/listar/desativar qualquer barbearia do produto |
| **Credencial OpenAI única** | — | ● | — | ● | — | Todos os agentes mudos; custo nem é medido (D8) |
| **Cartão Hostinger** (renovação VPS 16/09) | ● | ● | ● | ● | ● | VPS suspenso = linha 2 inteira |
| **GitHub main** (repo público, push=produção sem gate de CI) | — | — | — | — | ● | Deploy quebrado/malicioso em minutos |
| **O dono (bus factor 1)** | ● | ● | ● | ● | ● | Toda operação manual espera uma pessoa |

### 3. Os padrões transversais — o que a integração revela que nenhum componente mostra sozinho

**P1 — A falha silenciosa é o padrão dominante do sistema.** Não é um bug: é uma arquitetura acidental. Sempre-200 para a Meta (correto isolado) + `console.error` como único sinal + execuções verdes com filas vazias (fail-closed correto isolado) + `onError: continueRegularOutput` + nenhum error workflow + marca-antes-de-enviar = **um sistema em que cada componente falha educadamente e o conjunto morre sem barulho.** A prova empírica: o produto principal ficou 2 semanas sem tráfego e nada nem ninguém acusou. Cada decisão local foi defensável; a soma é um sistema não-observável.

**P2 — Segurança por obscuridade de URL nos elos internos.** As bordas externas autenticam bem (HMAC da Meta, token do Asaas, JWT no CRM). Os elos **internos** — os 3 webhooks do n8n (agente, lembrete-resposta, popups) — confiam no segredo do path, com a URL escrita num repositório público. O perímetro é duro por fora e oco por dentro (B2, C3).

**P3 — Estado que não se sustenta sozinho.** `whatsapp_connections.status` só muda quando o dono abre a tela (A2); `lembrete_enviado` marca antes do envio (C4); mensagem do agente gravada antes da entrega (B4); `statuses` da Meta descartados. **O banco registra intenções e as exibe como fatos.** O CRM — a única janela do dono — mostra um mundo mais funcional que o real.

**P4 — Fronteiras externas sem espelho nem reconciliação.** Zerar o banco não zerou o Asaas (recorrências cobrando — D2) nem a Evolution (instâncias órfãs com webhook vivo — A7); os templates existem no Postgres e não na Meta (C1a). **Não existe, em nenhuma fronteira, um processo que compare "o que o banco acha" com "o que o mundo externo tem".**

**P5 — Drift entre fonte e produção em três das cinco peças.** Migrations nos dois sentidos (E3), workflows sem versionamento (E4), `admin-metricas` sem fonte (E7), docs oficiais descrevendo dois modelos mortos (assinatura, arquitetura Meta por barbearia) e um banco que não existe mais. **Esta auditoria só foi possível cruzando produção ao vivo; o repo sozinho teria mentido.**

**P6 — Os elos-fim nunca foram exercitados.** Primeiro atendimento Evolution: 0 execuções na história. Lembrete no modelo vigente: 0 envios, impossível por construção. Ciclo de cobrança por uso: 0 ciclos. **Todo o valor prometido ao cliente pagante passa por um elo que nunca rodou.** O fluxo feliz não foi testado — não é que só ele foi testado.

### 4. O caminho mínimo antes de barbearias reais — em ordem, com dependências

1. **Mandar UMA mensagem de teste real** pelo WhatsApp de uma instância conectada. Decide A1/B1 em minutos e é pré-requisito de tudo: sem tráfego entrando, nada mais é testável. Se falhar: conferir `N8N_WEBHOOK_URL`/`N8N_WHATSAPP_WEBHOOK_URL` contra o URL do triggerInfo (com UUID) e reaplicar o webhook nas instâncias (`scripts/evolution-aplicar-config.mjs`).
2. **Backup do Supabase** (E1): upgrade de plano com backup diário OU `pg_dump` agendado para storage externo, com um restore ensaiado. Nada justifica adiar; um wipe já aconteceu.
3. **Inventário do Asaas** (D2): cancelar recorrências/customers sem espelho no banco. É dinheiro real se movendo hoje; 30 minutos de painel.
4. **Firewall no VPS + tirar as portas de `0.0.0.0`** (E2) e desligar `EXPOSE_IN_FETCH_INSTANCES`/restringir CORS (A/B). Uma ação de painel + edição de compose.
5. **Autenticar os webhooks do n8n** (header secreto conferido no nó) **e validar a instância contra `whatsapp_connections` no ramo Evolution** (B2/C3); remover as URLs dos docs ou fechar o repo.
6. **Um error workflow + um alerta de silêncio** ("zero mensagens em X horas") (B8/P1). É o item que transforma todos os outros modos de falha mudos em avisos — barato e de maior alavancagem.
7. **Consertar o lembrete** (C1b: fonte do `phone_number_id` → `remetentes_oficiais`; C2: propagar `contexto` no fluxo) **e só então submeter `lembrete_hoje`** — na ordem inversa, a aprovação liga avaliação/vencimento sozinhos com o lembrete ainda morto.
8. **Observar a conexão** (A2): assinar `CONNECTION_UPDATE` ou job periódico de `connectionState` — sem isso, o item 1 apodrece em silêncio de novo.
9. **Ensaiar o ciclo de cobrança com um caso controlado antes de 01/10** (D1) e incluir o e-mail do dono no customer do Asaas (D3).
10. **Estancar o drift** (E3/E4): migration de sincronização, regra "nada em produção sem arquivo no repo", e export dos workflows do n8n para o repositório.

Itens 1–5 são o piso para conectar a primeira barbearia real; 6–8 antes de prometer o lembrete; 9 antes da primeira fatura; 10 é o que impede esta auditoria de expirar em duas semanas.

---

*(Fim da consolidação. NÃO VERIFICADO consolidado abaixo — a revisão final está na primeira subseção.)*

---

## NÃO VERIFICADO (consolidado)

### Revisão final (parte 6) — as 7 verificações que destravam tudo, por alavancagem

Tudo abaixo é item de **painel ou teste manual**; nenhum exige código. Juntas, decidem os achados mais graves da auditoria inteira:

| # | Verificação | Decide | Esforço |
|---|---|---|---|
| 1 | **Mensagem de teste real** numa instância Evolution conectada | A1, A4, B1 — se o produto principal funciona | minutos (exige parear o QR antes) |
| 2 | Secrets `N8N_WEBHOOK_URL` / `N8N_WHATSAPP_WEBHOOK_URL` vs URL do triggerInfo (com UUID) | A1/B1 pela raiz, se o item 1 falhar | 2 min de painel |
| 3 | Painel Asaas: recorrências/customers sem espelho no banco; config do webhook (URL, token, **fila pausada?**) | D2, D-webhook — dinheiro real | 30 min |
| 4 | Painel Supabase: estado de backup/PITR + plano | E1 — o risco existencial | 2 min |
| 5 | `GET /instance/fetchInstances` na Evolution (ou script de listagem) | A7 — órfãs com webhook vivo; o que está aplicado de verdade | 5 min |
| 6 | `sudo ufw status` na VM | severidade final do E2 | 2 min de SSH |
| 7 | WhatsApp Manager: status dos templates + campos assinados no webhook do app | C1a, monitor cego (`05-meta.md §3.3`) | 10 min |

O restante, por fluxo, abaixo.

### Do Fluxo A

| Item | Motivo | O que decide |
|---|---|---|
| **Valor do secret `N8N_WEBHOOK_URL`** (com ou sem UUID no path) — decide o A1, o elo mais importante do fluxo | Secrets de edge function não são legíveis por tool | Painel Supabase → Edge Functions → Secrets, comparar com o URL do triggerInfo do workflow `rJO1n7cFeNDIJyB5`; ou simplesmente mandar uma mensagem de teste real |
| Lista real de instâncias no servidor Evolution (órfãs do reseed, webhook efetivamente aplicado em cada uma) | Exigiria credencial da Evolution | `GET /instance/fetchInstances` ou `node scripts/evolution-remover-instancias.mjs` (só lista) |
| Se a instância da El Guardians chegou a parear e caiu, ou nunca conectou | `status='close'` não distingue os dois casos | QR da El Guardians é pendência aberta do dono (`docs/backlog.md:1611-1613`) |
| Entrega de e-mail do Supabase Auth (confirmação de conta — passo 1 do caminho 1) | Config do GoTrue não exposta por tool | Painel Supabase → Auth → SMTP/rate limits; teste real de cadastro |
| Igualdade byte a byte repo ↔ deploy das edges do onboarding (`criar-minha-barbearia`, `accept-invite`, `admin-invite-salon`, `whatsapp`) | Custo de comparação integral; histórico já teve `accept-invite` divergente (`0057_planos_iniciais.sql:12`) | `supabase functions download` + diff |
| Se `verify_jwt` das edges do onboarding está como o esperado no painel (a config vive só lá — mesmo risco anotado para `whatsapp-webhook` em `05-meta.md §4`) | `config.toml` não declara todas | Painel Supabase → Edge Functions |

### Do Fluxo B

| Item | Motivo | O que decide |
|---|---|---|
| **Valores de `N8N_WHATSAPP_WEBHOOK_URL` e `N8N_WEBHOOK_URL`** vs URL real registrada no n8n (com UUID) — decide o B1 | Secrets ilegíveis por tool | Painel Supabase → Secrets + triggerInfo do workflow; **ou uma mensagem de teste real, que decide tudo em 1 minuto** |
| Política de retry do webhook da Evolution (re-tenta POST que falhou? por quanto tempo?) | Não documentada no repo; depende da versão (imagem `:latest`, versão real desconhecida — `04-evolution.md §6`) | Doc da versão em execução (`GET /` da API devolve a versão) ou teste controlado |
| Comportamento real do ramo de mídia Evolution (base64 de áudio/imagem) | Nenhuma execução real na história (`04-evolution.md §6`) | Teste com áudio real após resolver B1 |
| Qual credencial cada nó usa (OpenAI, Graph API, Supabase) — o MCP devolve `credentials: null` | Limitação da API do n8n (`03-n8n.md §6.1`) | Conferência visual na UI do n8n |
| Campos e URL de callback assinados no painel do app da Meta | Só o painel mostra; `eventos_da_waba` = 0 linhas sugere não assinados (`05-meta.md §3.3`) | Painel Meta → WhatsApp → Webhook |
| Se a fila de webhook da Meta está ativa (falhas repetidas pausam) | Sem token não há leitura | WhatsApp Manager |

### Do Fluxo C

| Item | Motivo | O que decide |
|---|---|---|
| Status real dos templates na Meta hoje (último snapshot 04/09: só `hello_world`) | Sem token não há `GET /<waba>/message_templates` | WhatsApp Manager → Message templates; submeter `lembrete_hoje` primeiro e sozinho |
| Se algum lembrete real já saiu na história (modelo antigo, pré-híbrido) | Retenção do n8n ~14 dias; banco re-semeado em 04/09 apagou o rastro | Só o dono sabe; irrelevante para o modelo vigente, que nunca enviou |
| O que o agente responde quando `Criar Agendamento` bate na exclusion constraint (23P01) no meio da conversa | Zero execuções reais do caminho; comportamento do LLM diante do erro da tool nunca observado | Teste real após destravar o Fluxo B |
| Se a cadeia clique→`responder_lembrete`→resposta já rodou alguma vez com clique real | `eventos` e execuções zerados na janela observável | O primeiro lembrete real será o primeiro teste de verdade da cadeia 0086 |
| Conteúdo/efeito da migration `add_lembrete_enviado_to_appointments` (aplicada sem arquivo no repo — C6) | `list_migrations` só dá o nome | Migration de sincronização sugerida em `01-supabase.md §3.3` resolve por consequência |
| Tarifas Meta pós-01/10/2026 para utility/serviço no Brasil (custo por confirmação de clique) | Doc baseado em fontes secundárias (`05-meta.md §6`) | Página oficial de preços da Meta |

### Do Fluxo D

| Item | Motivo | O que decide |
|---|---|---|
| **Recorrências órfãs no Asaas** (El Guardians R$ 5/mês, Curitiba `sub_klx4z6d0xv9p83h4`) e os customers `cus_000192278757`/`cus_000194207151` — decide o D2, o único vazamento possível de dinheiro real HOJE | Exige o painel do Asaas | Painel → Assinaturas/Clientes: cancelar/arquivar o que não tem espelho no banco |
| Config do webhook no painel do Asaas (URL, token = secret, eventos, **fila pausada?**) | Ilegível do lado de cá; `asaas_eventos` vazia não prova nada desde a limpeza | Painel Asaas → Integrações → Webhooks |
| Valores de `ASAAS_BASE_URL` (produção ou sandbox), `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Secrets não lidos por regra | Painel Supabase → Secrets (o teste de 16/08 prova o modelo antigo, não o estado de hoje) |
| Credencial real do nó "Gerar Boletos" (anon vs service role) — decide o D6 | n8n não expõe credencial por API | Abrir o nó no editor; ou disparar e olhar o status HTTP |
| Status da análise de Pix/boleto na conta Asaas — decide o D7 | Painel | Painel Asaas; ajustar os textos enquanto não liberar |
| **O primeiro ciclo real ponta a ponta** (fechamento 01/10; El Guardians sai do teste 11/09) | Nunca aconteceu no modelo vigente (D1) | Acompanhar com um caso real: fatura → boleto → e-mail → pagamento → webhook → extensão |
| Entrega dos e-mails de cobrança fora do Gmail | Testado só no Gmail (`docs/estado-do-projeto.md:47`) | Teste com destinatário Outlook/Yahoo antes de barbearias reais |

### Do Fluxo E

| Item | Motivo | O que decide |
|---|---|---|
| Estado real de backup/PITR e plano de billing do Supabase — decide a severidade final do E1 | MCP não expõe billing/backup | Print de Settings → Database → Backups e do plano da organização |
| Nomes/escopo das env vars na Vercel (`VITE_APP_URL` e `VITE_AGENTE_IA_URL` têm fallback silencioso) | Tool não lista env vars | Painel Vercel → Settings → Environment Variables |
| Nomes dos secrets de edge functions no Supabase (existência de todos os ~15 esperados) | Sem tool de listagem | Painel Supabase → Edge Functions → Secrets (só nomes) |
| "Ignored Build Step"/gating do deploy pela CI e config de previews | Tool não lê settings de git integration | Painel Vercel → Settings → Git |
| Firewall interno da VM (ufw/iptables) — decide a severidade final do E2 | Painel não expõe; exigiria SSH | `sudo ufw status` na VM |
| Site URL + redirect allow-list do Supabase Auth (passos 4/5/7/10 do go-live) | Painéis | Painel Supabase → Auth → URL Configuration |
| Se existe QUALQUER export dos workflows do n8n fora da instância | Nada no repo; backup do VPS é o único candidato | Dono confirma; se não houver, exportar já |
| Versão real da Evolution em execução (imagem `:latest`) | Só a API/logs do container mostram | `GET /` da API ou log de inicialização |
| Uso de banda/requests do ciclo na Vercel (limites do Hobby) | Sem tool de usage | Painel Vercel → Usage |
