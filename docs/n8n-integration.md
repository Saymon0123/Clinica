# Integração n8n ↔ CRM (Supabase)

Referência para quem for montar o fluxo do agente de IA no n8n. O CRM lê os
dados diretamente das tabelas abaixo — se o n8n escrever certo aqui, aparece
automaticamente no CRM (Agenda, Clientes, aba WEB), sem precisar de nenhuma
integração adicional.

## 0. Configuração das instâncias na Evolution (automática)

Não é mais preciso abrir o painel da Evolution a cada instância criada. A edge
function `whatsapp` aplica a configuração padrão sozinha ao conectar, e
reaplica a cada nova conexão — então uma instância alterada à mão volta ao
padrão. A fonte única é
[`supabase/functions/_shared/evolutionConfig.json`](../supabase/functions/_shared/evolutionConfig.json):

- **`groupsIgnore: true`** — sem isso toda mensagem de grupo entra no fluxo e o
  agente responde dentro de grupos de clientes
- **eventos do webhook**: `MESSAGES_UPSERT` (recebidas) e `SEND_MESSAGE`
  (enviadas)
- `readMessages`, `alwaysOnline`, `syncFullHistory`, `rejectCall` desligados

Para reaplicar nas instâncias que já existiam (ou criadas direto no painel):

```bash
EVOLUTION_API_URL=... EVOLUTION_API_KEY=... N8N_WEBHOOK_URL=... \
  node scripts/evolution-aplicar-config.mjs --dry-run
```

Tire o `--dry-run` para aplicar de verdade. Servidor validado: Evolution API
v2.3.7 (settings em `POST /settings/set/{instance}`, corpo plano).

## 0.1. Regras de comportamento do agente (v1)

Fixadas no `systemMessage` do nó `Agente de Atendimento` em 2026-07-31, depois
de o agente ter marcado um corte sem perguntar qual serviço o cliente queria.

**Serviço — nunca deduzir.** Mesmo com "quero marcar" ou "tem horário amanhã?",
o agente pergunta qual serviço e **confirma pelo nome** antes de criar o
agendamento. Não é preciosismo: `duracao_minutos` define o `data_hora_fim`, e
supor "Corte" (30min) quando o cliente queria "Corte + Barba" (50min) estoura
20 minutos na agenda e combina o preço errado.

**Duração nunca é dita ao cliente.** Serve só para o agente calcular o término.
Preço pode ser informado quando perguntado.

**Barbeiro — perguntar preferência.** Com mais de um barbeiro ativo, o agente
pergunta se há preferência, deixando claro que pode ser qualquer um. Se o
cliente não tiver, **o agente decide** (não devolve a pergunta): primeiro
horário livre no dia pedido, desempate por quem tem menos agendamentos naquele
dia.

**Decisões adiadas para a v2:**
- tornar a política de atribuição configurável por salão (hoje é fixa)
- propor automaticamente o barbeiro do último atendimento, lendo o histórico de
  `appointments` — exige uma ferramenta nova no fluxo
- respeitar `professional_services`: hoje o agente ignora quais serviços cada
  barbeiro faz. Barbeiro **sem** serviços cadastrados é tratado como fazendo
  todos; a intenção é que todo barbeiro registrado tenha a própria lista

## 1. Credenciais necessárias no n8n

- **Supabase URL:** `https://bukhpvvybeltmhtwamox.supabase.co`
- **Service Role Key:** pegar no painel do Supabase → Project Settings → API
  → `service_role` (secreta — nunca usar a `anon key` no n8n, e nunca expor
  essa chave fora do n8n).

Por quê `service_role` e não a chave anônima: todas as tabelas têm RLS
(Row Level Security) que só libera acesso a quem está autenticado como dono
daquele salão. O n8n não faz login como usuário — ele age como "admin" via
service role, que ignora RLS. **Isso significa que o próprio fluxo do n8n é
responsável por sempre filtrar/gravar o `salon_id` certo** — não existe uma
trava automática do banco te protegendo de gravar no salão errado.

## 2. Como descobrir o `salon_id` de cada mensagem (multi-tenant)

Cada barbearia tem uma instância na Evolution API nomeada `salon-<uuid>`
(por exemplo `salon-381a2742-6471-420d-b04b-eac0056e64dd`). O webhook que a
Evolution API manda pro n8n inclui o nome da instância no payload
(`instance` ou `instanceName`, dependendo da versão).

**Primeiro passo de todo fluxo:** extrair o `salon_id` removendo o prefixo
`salon-` do nome da instância recebida no webhook. Esse UUID é o `salon_id`
usado em todas as gravações abaixo — nunca hardcode um salon_id fixo no
fluxo.

### Como o fluxo em produção resolve isso (não é string parsing)

O fluxo `CRM Salão - Atendimento WhatsApp (Supabase Nativo)` **não** deriva o
`salon_id` fatiando o nome. Ele faz a resolução pelo banco, que é mais seguro:

1. `Normalizar Payload` — pega `instance` do payload do webhook
2. `Buscar Instância Conectada` — `getAll` em `whatsapp_connections` filtrando
   `instance_name = instance`
3. `Instância Configurada?` — se não achou `salon_id`, desvia para
   `Fim - Instância Não Encontrada` e o fluxo termina
4. `Extrair Salon ID` — fixa o `salon_id` vindo da linha encontrada

Prefira esse caminho a qualquer `replace('salon-', '')`: a tabela é a fonte de
verdade, e uma instância desconhecida para o fluxo em vez de virar um UUID
inventado.

Se algum fluxo novo precisar mesmo montar ou ler o nome da instância, use
[`supabase/functions/_shared/instanceName.ts`](../supabase/functions/_shared/instanceName.ts)
como especificação — `instanceNameFor` e `salonIdFromInstanceName` são a regra
canônica, com teste cobrindo prefixo trocado, UUID truncado, prefixo duplicado
e valor ausente. `salonIdFromInstanceName` devolve `null` em vez de chutar.

> ⚠️ **`whatsapp_connections.instance_name` não tem constraint de unicidade**
> (a PK é `salon_id`). Como o passo 2 usa `limit 1`, duas linhas com o mesmo
> `instance_name` fariam o fluxo escolher um salão arbitrário — e, com
> `service_role`, gravar lá sem erro. Enquanto não houver
> `unique (instance_name)`, essa é a única coisa entre o webhook e uma escrita
> cross-tenant.

## 3. Tabelas e contrato de dados

### `whatsapp_conversations` — uma linha por contato/cliente

| coluna | tipo | obrigatório | observação |
|---|---|---|---|
| `salon_id` | uuid | sim | vindo do passo 2 |
| `contact_phone` | text | sim | telefone completo com DDI, ex: `5511999990000` (só dígitos, sem `+`, sem espaço/traço) |
| `contact_name` | text | não | nome do contato no WhatsApp, se disponível |
| `needs_human` | boolean | não (default `false`) | `true` quando o cliente pedir para falar com o dono/barbeiro |
| `agent_paused` | boolean | **somente leitura para o n8n** (default `false`) | `true` quando o dono assumiu a conversa manualmente pelo CRM. Controlado só pelo CRM — o n8n **nunca** deve gravar este campo, só ler e respeitar. |

Existe uma constraint `unique (salon_id, contact_phone)` — **use upsert**
(`on_conflict=salon_id,contact_phone`), nunca insert puro, senão dá erro de
duplicidade na segunda mensagem do mesmo cliente.

Exemplo de upsert via REST (`POST /rest/v1/whatsapp_conversations` com
header `Prefer: resolution=merge-duplicates` e query `?on_conflict=salon_id,contact_phone`):

```json
{
  "salon_id": "381a2742-6471-420d-b04b-eac0056e64dd",
  "contact_phone": "5511999990000",
  "contact_name": "Carlos Souza",
  "needs_human": false
}
```

O CRM já toca som e acende o botão "WEB" sozinho quando `needs_human` virar
`true` — não precisa fazer mais nada além de gravar esse campo.

**Importante:** uma vez que o agente marcou `needs_human = true`, o n8n
**nunca** deve voltar a marcar `false` sozinho. Esse campo só volta a
`false` quando o dono clica em "Devolver ao agente" no CRM — mesmo que o
dono já tenha respondido manualmente, a conversa continua aparecendo na
aba "Solicitou falar com o dono" até ele resolver explicitamente por lá.

### ⚠️ Handoff dono ↔ agente (`agent_paused`) — leia antes de montar a resposta automática

Quando o dono responde uma conversa pelo CRM, o sistema grava
`agent_paused = true` automaticamente naquela conversa e só volta para
`false` quando o **próprio dono** clica em "Devolver ao agente" na aba WEB.
Isso existe para evitar que o agente e o dono respondam ao mesmo cliente ao
mesmo tempo, gerando confusão.

**Regra obrigatória do fluxo:** depois de fazer o upsert de
`whatsapp_conversations` e o insert da mensagem recebida, **antes de gerar
qualquer resposta automática**, consulte o campo `agent_paused` dessa
conversa:

```
GET /rest/v1/whatsapp_conversations?id=eq.<conversation_id>&select=agent_paused
```

- Se `agent_paused = true` → **não gere nem envie nenhuma resposta**. A
  mensagem do cliente já foi salva no histórico (passo 3 do fluxo) e vai
  aparecer no CRM normalmente para o dono ver e responder manualmente. O
  fluxo do n8n termina aqui para essa mensagem.
- Se `agent_paused = false` → segue normalmente com a geração da resposta
  do agente.

Nunca tente "reverter" esse campo pelo n8n (nem para `true` nem para
`false`) — quem decide quando o agente volta a responder é o dono, pelo
próprio CRM.

### `whatsapp_messages` — uma linha por mensagem trocada

| coluna | tipo | obrigatório | observação |
|---|---|---|---|
| `conversation_id` | uuid | sim | `id` retornado pelo upsert de `whatsapp_conversations` acima |
| `direction` | text | sim | `'in'` (cliente enviou) ou `'out'` (agente/dono respondeu) — **só esses dois valores**, qualquer outro dá erro de constraint |
| `sender` | text | sim | `'cliente'`, `'agente'` ou `'dono'` — idem, só esses três |
| `content` | text | sim | texto da mensagem |

Insert simples (não upsert):

```json
{
  "conversation_id": "<uuid da conversa>",
  "direction": "in",
  "sender": "cliente",
  "content": "Oi, vocês têm horário amanhã de manhã?"
}
```

Um trigger no banco já atualiza `last_message_at` da conversa sozinho a
cada mensagem inserida — não precisa (nem deve) atualizar isso manualmente.

### `clients` — cadastro do cliente (para vincular ao agendamento)

| coluna | tipo | obrigatório | observação |
|---|---|---|---|
| `salon_id` | uuid | sim | |
| `nome` | text | sim | |
| `telefone` | text | não, mas recomendado sempre preencher | grave como veio do WhatsApp |
| `telefone_norm` | text | **nunca escreva** | calculado pelo banco: os últimos 8 dígitos do telefone |

### ⚠️ Sempre busque o cliente por `telefone_norm`, nunca por `telefone`

O WhatsApp entrega o número como `554187275895` (com DDI `55` e, em números
antigos, **sem o 9**), enquanto o barbeiro cadastra no CRM como
`(41) 98727-5895` ou `41987275895`. Comparar `telefone` por igualdade
**nunca casa** — o fluxo acha que o cliente não existe e cria um duplicado.

Os últimos 8 dígitos são idênticos em todos esses formatos, então o banco
mantém uma coluna gerada `telefone_norm` com exatamente isso. Para buscar:

```
GET /rest/v1/clients?salon_id=eq.<uuid>&telefone_norm=eq.<ultimos8>&select=id,nome
```

Onde `<ultimos8>` é `contact_phone.replace(/\D/g,'').slice(-8)`.

Existe um índice único `(salon_id, telefone_norm)`: tentar cadastrar o mesmo
telefone duas vezes no mesmo salão retorna erro `23505`. Busque antes de
criar.

### `salons` — barbearia ativa e horário de funcionamento

Antes de responder qualquer coisa, confira se a barbearia está ativa:

```
GET /rest/v1/salons?id=eq.<salon_id>&select=nome,ativo,horario_funcionamento
```

- **`ativo = false`** → a barbearia foi suspensa no painel administrativo.
  O fluxo deve **parar sem responder nada**. Continuar atendendo por uma
  barbearia desativada é problema comercial, não só técnico.
- **`horario_funcionamento`** → JSON no formato
  `{"seg":{"abre":"09:00","fecha":"19:00"}, ..., "dom":null}`.
  `null` significa fechado naquele dia. Nunca ofereça horário fora disso.

### `professional_schedules` — horário de trabalho de cada barbeiro

Cada barbeiro tem os dias e horários em que atende. **Consulte antes de
oferecer horários**, senão o agente vai marcar em dia de folga:

```
GET /rest/v1/professional_schedules?professional_id=eq.<uuid>&ativo=eq.true&select=dia_semana,hora_inicio,hora_fim
```

- `dia_semana`: 0 = domingo, 1 = segunda ... 6 = sábado
- `hora_inicio` / `hora_fim`: hora local da barbearia (formato `HH:MM:SS`)
- **Se o barbeiro não tiver nenhuma linha**, considere que ainda não foi
  configurado e caia no horário de funcionamento do salão
  (`salons.horario_funcionamento`).

Nunca escreva nesta tabela pelo n8n — quem define é o dono, na aba Equipe.

### `professionals` e `services` — apenas leitura

O agente precisa consultar essas tabelas para saber **quem** e **o quê**
oferecer, e para calcular o horário de término do agendamento:

```
GET /rest/v1/professionals?salon_id=eq.<uuid>&ativo=eq.true&select=id,nome
GET /rest/v1/services?salon_id=eq.<uuid>&ativo=eq.true&select=id,nome,duracao_minutos,preco
```

Nunca crie/edite linhas nessas tabelas pelo n8n — é gerenciado pelo dono
dentro do CRM.

### `appointments` — o agendamento em si

| coluna | tipo | obrigatório | observação |
|---|---|---|---|
| `salon_id` | uuid | sim | |
| `client_id` | uuid | sim | do passo `clients` acima |
| `professional_id` | uuid | sim | de `professionals` |
| `service_id` | uuid | sim | de `services` |
| `data_hora_inicio` | timestamptz | sim | **ISO 8601 completo com timezone**, ex: `2026-07-23T09:00:00-03:00` |
| `data_hora_fim` | timestamptz | sim | `data_hora_inicio` + `duracao_minutos` do serviço escolhido |
| `status` | text | não (default `'agendado'`) | valores aceitos: `agendado`, `confirmado`, `concluido`, `cancelado`, `bloqueio` — qualquer outro valor quebra a constraint |

Insert simples:

```json
{
  "salon_id": "381a2742-6471-420d-b04b-eac0056e64dd",
  "client_id": "<uuid>",
  "professional_id": "<uuid>",
  "service_id": "<uuid>",
  "data_hora_inicio": "2026-07-23T09:00:00-03:00",
  "data_hora_fim": "2026-07-23T09:45:00-03:00",
  "status": "agendado"
}
```

Assim que essa linha é criada, o CRM detecta em tempo real (Realtime) e
mostra o aviso sonoro de "novo agendamento" pro barbeiro automaticamente —
não precisa chamar nada além desse insert.

### ⚠️ Conflito de horário agora é bloqueado pelo banco

O banco **impede** dois agendamentos sobrepostos para o mesmo profissional
(restrição de exclusão `appointments_sem_sobreposicao`). Cancelados não
contam.

Se o fluxo tentar criar um agendamento em cima de outro, o Postgres
devolve **erro `23P01`** (`conflicting key value violates exclusion
constraint`) e nada é gravado.

**Como o fluxo deve tratar:**
1. Antes de oferecer horários, consulte `Verificar Disponibilidade do
   Profissional` e ofereça só os livres.
2. Ainda assim, trate o erro `23P01` no insert: significa que alguém pegou
   o horário no meio da conversa. Responda pedindo desculpa e ofereça
   outro horário — nunca repita a mesma tentativa, ela vai falhar de novo.

Isso vale como rede de segurança: mesmo que o agente erre o cálculo, o
cliente nunca fica com horário duplicado.

## 4. Resumo do fluxo recomendado (visão geral)

1. Webhook da Evolution API chega no n8n → extrai `instance` → deriva `salon_id`
2. Upsert em `whatsapp_conversations` (salon_id + contact_phone) → pega `conversation_id`
3. Insert da mensagem recebida em `whatsapp_messages` (`direction: 'in'`, `sender: 'cliente'`)
4. **Checa `agent_paused` da conversa** (ver seção acima) — se `true`, para o
   fluxo por aqui, sem responder
5. Agente de IA decide a resposta / ação:
   - Só conversa → insert em `whatsapp_messages` (`direction: 'out'`, `sender: 'agente'`) **e** chama a Evolution API pra enviar de verdade pro WhatsApp do cliente
   - Cliente pede pra falar com o dono → `update` em `whatsapp_conversations` setando `needs_human: true`
   - Cliente quer agendar → busca/cria `clients`, consulta `professionals`/`services`, cria `appointments`, confirma pro cliente via Evolution API e registra a mensagem de confirmação

## 5. Erros comuns a evitar

- Usar a `anon key` em vez da `service_role` → toda escrita falha silenciosamente por causa do RLS
- Esquecer o `on_conflict` no upsert de `whatsapp_conversations` → erro de duplicidade a partir da segunda mensagem
- Mandar `status`/`direction`/`sender` fora dos valores aceitos → erro de constraint do Postgres
- Mandar `data_hora_inicio` sem timezone → o horário pode aparecer errado no CRM (sempre incluir o offset, ex. `-03:00`)
- Criar um `client` novo a cada mensagem em vez de buscar pelo telefone antes → duplica clientes na aba Clientes
- Responder automaticamente mesmo com `agent_paused = true` → o dono já assumiu a conversa manualmente; o agente respondendo por cima gera duplicidade e confusão pro cliente
- Escrever em `agent_paused` pelo n8n → esse campo é gerenciado só pelo CRM (dono assume/devolve), o agente só deve lê-lo
