# Integração n8n ↔ CRM (Supabase)

Referência para quem for montar o fluxo do agente de IA no n8n. O CRM lê os
dados diretamente das tabelas abaixo — se o n8n escrever certo aqui, aparece
automaticamente no CRM (Agenda, Clientes, aba WEB), sem precisar de nenhuma
integração adicional.

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

| coluna | tipo | obrigatório |
|---|---|---|
| `salon_id` | uuid | sim |
| `nome` | text | sim |
| `telefone` | text | não, mas recomendado sempre preencher |

**Não existe unique constraint em telefone hoje.** Antes de criar, faça um
`GET` filtrando `salon_id=eq.<uuid>&telefone=eq.<telefone>` — se retornar
algo, reuse o `id`; se vazio, crie um novo. Isso evita duplicar o mesmo
cliente a cada agendamento.

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

**Cuidado com conflito de horário:** hoje o banco não impede dois
agendamentos sobrepostos pro mesmo profissional — se isso importa, o
fluxo do n8n precisa checar disponibilidade antes de criar (consultar
`appointments` do profissional/dia e comparar intervalos).

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
