# AULA — A arquitetura do Club Cut, do zero ao estado atual

**Data:** 2026-09-05. **Fontes:** os 9 relatórios de auditoria em `docs/auditoria/` e o `docs/relatorio-tecnico.md`, todos de 2026-09-05, mais o código do repositório citado com `arquivo:linha`.

**Como ler este documento.** Isto não é um inventário — o inventário é o relatório técnico. Isto é uma aula: eu sou o professor, você é o desenvolvedor que vai sustentar este sistema sozinho daqui para frente. A ordem dos módulos é a ordem em que as decisões precisaram ser tomadas, porque cada uma condiciona as seguintes. Cada módulo responde, nesta sequência: qual problema apareceu; quais eram as opções na mesa; qual foi escolhida e por quê; o que a escolha custou; como isso ficou no código, com o trecho real; e o que quebraria se você mexesse nisso amanhã. No fim, o que eu faria diferente começando hoje e o que você precisa estudar para segurar cada parte.

Uma frase para você guardar antes de começar: **este sistema tem os miolos bem construídos e as pontas soltas.** O provisionamento de barbearia, as travas de agenda no banco, a RLS multi-tenant e a idempotência do webhook do Asaas são código acima da média. As três pontas que justificam o produto — o atendimento pelo WhatsApp, o lembrete e o ciclo de cobrança — nunca rodaram no modelo vigente. A aula explica como cada peça chegou onde está; os defeitos abertos aparecem no lugar da decisão que os produziu, não numa lista à parte.

---

## Módulo 1 — O modelo de dados e o multi-tenant

### O problema

O produto é um CRM para **várias barbearias no mesmo sistema**: agenda, clientes, vendas, comissões, estoque, WhatsApp. Cada barbearia (tenant) tem dono, gestores e barbeiros com visões diferentes — o barbeiro não pode ver a comissão do colega, o dono de uma rede vê várias unidades. E a decisão de plataforma que condiciona tudo: **o front fala direto com o banco**. Não existe backend próprio — o React consulta o Postgres via PostgREST (a API REST automática do Supabase). Isso significa que qualquer regra "quem vê o quê" que morar só no JavaScript é decorativa: o usuário tem a chave `anon` no bundle e pode montar a query que quiser.

### As opções na mesa

1. **Um banco (ou schema) por barbearia.** Isolamento físico perfeito, mas operacionalmente inviável para um dev só no plano gratuito: cada migration teria que rodar N vezes, cada backup é N backups, e o Supabase cobra por projeto.
2. **Backend próprio no meio** que filtra tenant em toda query. Isolamento na aplicação — mas exige construir e hospedar um backend inteiro, e um esquecimento num endpoint vaza dados.
3. **Uma coluna `salon_id` em tudo + Row Level Security do Postgres.** O banco filtra, não a aplicação. Um projeto só, uma migration só, e o vazamento exige um erro de *policy*, não um erro em qualquer um dos milhares de pontos de query.

### A escolha e o critério

Opção 3, pelos três critérios que vão se repetir a aula inteira: **custo** (um projeto Supabase gratuito), **tempo** (um dev, sem backend para manter) e a natureza do Supabase (o front fala com o banco, então a defesa TEM que estar no banco). O desenho concreto:

- **46 tabelas em `public`, todas com RLS habilitada.** As policies das tabelas de negócio filtram por `salon_id IN (SELECT private.salon_ids())`.
- **A identidade do tenant mora numa tabela só, `user_salons`** (`user_id`, `salon_id`, `role`). Todo o resto deriva dela.
- **As funções de policy vivem num schema `private`**, SECURITY DEFINER com `search_path` fixo — o cliente não as chama por RPC e elas não podem ser sequestradas por resolução de nomes.
- **11 tabelas de infraestrutura ficam deny-by-default**: RLS ligada e zero policies de propósito (`asaas_eventos`, `consumo_ia`, `whatsapp_templates`, `remetentes_oficiais`…). Só o `service_role` (edge functions e n8n) as toca; cada uma tem um comment na tabela explicando.
- **39 views, todas `security_invoker=true`** — view não fura RLS.

### O que custou

- **Performance adiada.** O advisor acusa 95 achados de `multiple_permissive_policies` em 12 tabelas (em `services`, 5 policies permissivas avaliadas por comando) e 19 FKs sem índice, várias em `salon_id` (`01-supabase.md §3.8-3.9`). Hoje é irrelevante (banco quase vazio); com dezenas de barbearias, cada leitura avalia várias subqueries `private.*` por linha.
- **Tudo aposta na RLS estar certa.** As escritas do CRM são por `id`, confiando na policy (Módulo 3). O único teste do isolamento é o pgTAP do CI (`supabase/tests/rls_isolamento_entre_saloes.test.sql`) — que valida um schema que já divergiu da produção (Módulo 8).
- **O `service_role` fura tudo, por definição.** Toda a superfície que escreve com `service_role` (n8n, edge functions) opera SEM a rede de segurança — se ela errar o tenant, o banco grava no salão errado sem reclamar. Isso é o que transforma o defeito do Módulo 6 (tenant derivado de string no n8n) em CRÍTICO.
- **Restos dos defaults do Supabase**: `anon`/`authenticated` ainda têm grants largos demais, incluindo TRUNCATE — que a RLS **não** filtra (`01-supabase.md §3.5`). Não é porta aberta via PostgREST, mas é superfície desnecessária.

### Como ficou no código

A fundação está na migration `0015_fase1_politicas_por_papel.sql`. A função-fonte do tenant:

```sql
create schema if not exists private;
grant usage on schema private to authenticated, anon;

create or replace function private.salon_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select salon_id from user_salons where user_id = (select auth.uid())
$$;
```

E o padrão de policy que se repete nas tabelas de negócio (`0015:84-100`):

```sql
create policy "salons: membros leem" on salons for select
  using (id in (select private.salon_ids()));

create policy "professionals: leitura conforme papel" on professionals for select
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or id in (select private.my_professional_ids()))
  );

create policy "professionals: gestor gerencia" on professionals for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));
```

Repare no comentário da própria 0015 ("barbeiro vê só a própria ficha — protege a comissão dos colegas"): a regra de papel mora na policy, escrita uma vez, e vale para qualquer caminho de leitura.

### O que quebraria se você mexesse amanhã

- **Mexer em `user_salons` ou nas funções `private.*` mexe em TODAS as policies de uma vez.** É a alavanca mais poderosa e mais perigosa do sistema. Qualquer alteração ali exige rodar o pgTAP de isolamento antes e depois.
- **Criar tabela nova sem policy não é seguro por acidente — é *inacessível* por acidente** (RLS ligada sem policy = deny), o que é o modo de falha certo. Mas criar tabela nova **sem RLS** expõe ao mundo: o hábito de `enable row level security` em toda tabela nova é inegociável.
- **Revogar os grants largos sem ler as policies primeiro** pode derrubar o CRM: as policies autorizam, mas o grant é a primeira porta. A ordem certa está sugerida em `01-supabase.md §3.5` (revogar só TRUNCATE/REFERENCES/TRIGGER primeiro).
- **As 3 funções `private` sem `search_path` fixo** (`telefone_valido`, `destino_whatsapp`, `documento_valido`) são a exceção do padrão — se você criar funções novas, o padrão é `set search_path = public, pg_temp`.

---

## Módulo 2 — As regras de negócio que moram no banco

### O problema

Assim que o agendamento existiu, apareceu o conflito de horário. E o agendamento tem **três portas de criação**: o CRM (barbeiro/gestor), o agente de IA (n8n) e a agenda pública do QR do balcão. Checar conflito na aplicação significaria implementar a mesma regra três vezes, em três linguagens, com três chances de race condition — duas requisições simultâneas passam pela checagem e gravam as duas.

### As opções na mesa

1. **Checar na aplicação** (select antes do insert) em cada porta — frágil por corrida e triplicado.
2. **Lock pessimista** (advisory lock por profissional) — resolve a corrida, mas ainda é código de aplicação em três lugares.
3. **Exclusion constraint no Postgres** — o banco garante, atomicamente, que dois períodos não se sobrepõem, para qualquer porta, para sempre.

### A escolha e o critério

Opção 3. O critério é o mesmo do Módulo 1: quando existe mais de uma porta, a regra mora no banco. O mesmo raciocínio foi aplicado depois a outras regras: a folga entre atendimentos é trigger (`0134`), o cancelamento de agendamento vencido sem comanda é pg_cron (`cancela-agendamentos-sem-comanda`, */5min), e a dedupe de cliente é constraint por `telefone_norm` + RPC `garantir_cliente`.

### O que custou

- **A extensão `btree_gist` ficou instalada no schema `public`** (advisor WARN) — dezenas de funções `gbt_*` poluindo o namespace da API. Movê-la exige recriar as constraints.
- **O erro que o banco devolve (23P01) precisa ser traduzido em cada porta.** O CRM traduz (`erroDoBanco.ts`); o que o **agente** responde quando a tool bate na constraint no meio de uma conversa **nunca foi observado** — zero execuções reais desse caminho (`90-integracao.md §C.1 passo 2`).
- As constraints tiveram que evoluir com o produto: a 0063 as recriou como `deferrable` e ampliou o WHERE quando o status `faltou` nasceu.

### Como ficou no código

A trava original (`0018_trava_horario_duplicado.sql:28-36`):

```sql
create extension if not exists btree_gist;

alter table appointments
  add constraint appointments_sem_sobreposicao
  exclude using gist (
    professional_id with =,
    tstzrange(data_hora_inicio, data_hora_fim) with &&
  )
  where (status <> 'cancelado');
```

E a versão vigente, refeita na `0063_adiantar_horario.sql:30-44` — repare no par: uma exclusão por **profissional** e outra por **cliente** (a 0042 nasceu quando o agente revelou que o mesmo cliente podia ser agendado duas vezes):

```sql
alter table public.appointments
  add constraint appointments_sem_sobreposicao
  exclude using gist (
    professional_id with =,
    tstzrange(data_hora_inicio, data_hora_fim) with &&
  ) where (status not in ('cancelado', 'faltou'))
  deferrable initially immediate;

alter table public.appointments
  add constraint appointments_cliente_sem_sobreposicao
  exclude using gist (
    client_id with =,
    tstzrange(data_hora_inicio, data_hora_fim) with &&
  ) where (status not in ('cancelado', 'faltou'))
  deferrable initially immediate;
```

O comment da 0042 registra um detalhe que você vai precisar saber: `client_id` é nulo em bloqueio de agenda, e o EXCLUDE ignora nulos — bloqueios coexistem de propósito.

### O que quebraria se você mexesse amanhã

- **Adicionar um status novo a `appointments` sem revisar os `where` das duas constraints** muda silenciosamente o que conta como "ocupa horário". O status `faltou` já exigiu exatamente essa revisão.
- **Mover `btree_gist` para o schema `extensions`** exige dropar e recriar as duas exclusões — uma janela em que NENHUM salão tem proteção de sobreposição. Se fizer, faça em janela de manutenção com o sistema parado.
- **Uma limitação para não esquecer:** a exclusão protege contra sobreposição, não contra duplicidade lógica. Dois agendamentos do mesmo cliente em **horários disjuntos** passam — e é exatamente por isso que o clique "Reagendar" do lembrete, com o contexto descartado pelo n8n, cria um segundo agendamento sem nenhuma constraint reclamar (Módulo 6).

---

## Módulo 3 — O CRM: papéis, leituras e a fronteira do que o front garante

### O problema

Com o banco defendido pela RLS, o front precisa de três coisas: saber **quem é** o usuário (papel e unidades), mostrar **só o que interessa** (e rápido), e nunca **mentir** — nem sobre permissão, nem sobre erro de carga.

### As opções na mesa

Para permissão: duplicar as regras da RLS no front (drift garantido), ou derivar tudo de uma fonte só. Para dados: uma lib de data-fetching (react-query) ou hooks próprios com Realtime. Para escrita: repetir o filtro de tenant em toda escrita, ou confiar na RLS.

### A escolha e o critério

- **Permissão num módulo puro e testado** — `src/features/auth/permissoes.ts` (`isManager`, `isOwner`, `ehDonoDesta`, `podeVerRede`), com fonte em `user_salons`: **a mesma tabela que a RLS consulta**. Um vocabulário só para papel; o menu e as guardas de rota derivam dele.
- **Leituras filtram `salon_id` explicitamente em todos os hooks** (inclusive joins `!inner` e canais Realtime com `filter: salon_id=eq.${salonId}`) — não por segurança (a RLS já filtra), mas por correção: o usuário multi-unidade veria dados da unidade errada.
- **Escritas por `id` confiam na RLS** — decisão consciente de não duplicar a regra, com o pgTAP do CI declarado como "o único ponto onde o isolamento entre salões é verificado" (`.github/workflows/ci.yml`, job `banco`).
- **Fluxo público nunca toca tabela**: `/agendar/:salonId`, `/meu-horario/:token` e `/convite/:token` passam só por edge function; o token é a credencial, a regra fica no servidor.
- **Regras de projeto travadas por teste-contrato**: `ErroDeCarga.test.ts` lê o código-fonte das telas para garantir que erro ≠ vazio; `useRecurso` mantém flag `ativo=false` em carga e em erro (falha de rede não liga funcionalidade); guardas de rota mostram skeleton antes de redirecionar (cicatriz do bug de rota de gestor inalcançável no refresh, documentada em `RequireManager.tsx:6-15`).

O critério dominante aqui foi **tempo com honestidade**: não construir camada de cache (react-query está no `package.json` e nunca foi usada — remova), mas travar por teste as regras que já morderam.

### O que custou

- **TypeScript sem `strict`** (`tsconfig.app.json` — nem `strictNullChecks`). O typecheck verde do CI não pega null/any implícito, justamente em telas de venda e cobrança. É a maior dívida do front (CRM-01).
- **A venda é uma "transação" de 8 passos no cliente** (`NewSaleModal.tsx:483-675`): `orders` → `order_items` → `payments` → `stock_movements` → `commissions` → pacotes → `clients` → `appointments`, com rollback manual no `catch`. Fechar a aba no meio deixa comanda meio-escrita. O estorno já é RPC (`estornar_venda`); a venda ficou para trás — é a prova de que a regra "multi-passo mora no banco" foi aprendida DEPOIS que este modal foi escrito.
- **Sem paginação nas conversas** (`useConversations` carrega tudo; `useAgentStats` faz `.in()` com todos os ids — estoura a URL do PostgREST com centenas de conversas).
- Guarda de gestor inconsistente (`/equipe` sem `RequireManager` na rota, só check interno) e o painel admin com segredo estático em `sessionStorage` (Módulo 4).

### Como ficou no código

O padrão de leitura, repetido em todos os hooks (âncoras em `02-crm.md §1`): consulta com `.eq('salon_id', salonId)` mesmo onde a RLS já filtraria, Realtime com `filter: salon_id=eq.${salonId}`, e joins que repetem o tenant (`!inner` + `eq('orders.salon_id', ...)` em `useServicesData.ts:25-31`). O contraste que interessa: escrita é `update(...).eq('id', id)` — sem tenant, de propósito, porque a RLS decide.

### O que quebraria se você mexesse amanhã

- **Ligar `strict: true` de uma vez** vai acender centenas de erros. O caminho é por módulo, começando por `lib/` e `features/auth` (BL-26).
- **Mover a venda para uma RPC `registrar_venda`** é a correção certa (BL-27) — mas o modal tem lógica de pacotes e comissão entrelaçada; migre validando contra o estorno, que já é transacional do lado do banco.
- **Qualquer tela nova que carregue dados precisa repetir o padrão**: filtrar `salon_id` na leitura, distinguir erro de vazio (o teste-contrato vai te cobrar), e cancelar resposta atrasada ao trocar de unidade (`useRecurso.ts:74-79` é o molde).
- **Rotação da anon key exige redeploy** — `VITE_SUPABASE_ANON_KEY` entra em build time. Não existe procedimento escrito; escreva um antes de precisar.

---

## Módulo 4 — As edge functions: a fronteira de quem não tem login

### O problema

Quatro tipos de visitante precisam entrar sem sessão do Supabase Auth: a **Meta** (webhook de mensagens), o **Asaas** (webhook de pagamento), o **cliente final** (agenda pública do QR, link de gestão, convite) e o **operador do produto** (painel admin). Cada um precisa de uma autenticação diferente, e todos gravam com `service_role` — ou seja, do lado de dentro da RLS.

### As opções na mesa

Para os webhooks: aceitar aberto e confiar na URL; validar um token simples; ou validar assinatura criptográfica. Para o público: expor tabelas com policies de `anon` (arriscadíssimo); ou concentrar tudo em edge functions onde o token/regra fica no servidor. Para o admin: papel de usuário autenticado; ou um segredo compartilhado.

### A escolha e o critério

- **`whatsapp-webhook`**: HMAC SHA-256 do corpo com o App Secret, **comparação em tempo constante**, e falha fechada (sem o secret configurado, tudo é ignorado). E **sempre responde 200** — decisão consciente, não preguiça.
- **`asaas-webhook`**: header `asaas-access-token` contra a env; sem a env, recusa tudo com 500 (fechado).
- **`agenda-publica`**: o único endpoint público *de propósito*, com defesa em camadas — gate por `salons_atendendo` + recurso `agenda_publica`, rate limit 8 agendamentos/IP/10min + 10/h por barbearia, revalidação server-side contra `horarios_livres`, cancelamento só por `token_gestao` uuid.
- **`admin-create-salon`**: header `x-admin-secret` em tempo constante + rate limit 20/IP/10min.
- **`asaas` (verify_jwt=true)**: autoriza pelo **JWT do chamador** via client `ANON_KEY + Authorization` — a RLS decide, não o `service_role`. É o padrão certo para ação disparada por usuário logado.

O critério: cada fronteira autentica pelo mecanismo que o outro lado oferece (a Meta assina, o Asaas manda token, o cliente tem o token da própria reserva), e **falha fechado** quando a configuração falta.

### O que custou

- **Sempre-200 para a Meta é o preço de não ser desativado** — a Meta desliga o webhook do app inteiro após falhas repetidas. Mas o custo é brutal: quando o n8n recusa a mensagem, a edge devolve 200 e o único rastro é um `console.error` (`whatsapp-webhook/index.ts:388`). Este é um dos dois pilares da "falha silenciosa" do sistema (Módulo 9).
- **`verify_jwt` vive só no painel.** A `whatsapp-webhook` está deployada com `verify_jwt=false`, mas o `config.toml` não declara isso. Um redeploy com o default `true` faria a Meta tomar 401 e, após retries, desativar o webhook do app.
- **O admin ficou no segredo estático**: `ADMIN_TOOL_SECRET` compartilhado, guardado em `sessionStorage` no navegador, viajando em todo request — legível por XSS, sem expiração, sem trilha de quem usou. E `admin-metricas` só existe em produção, sem fonte no repo, comparando o secret com `!==` e sem rate limit — a mais fraca das funções admin.
- **`admin-create-salon` checa e-mail duplicado com `auth.admin.listUsers()` sem paginação** — quebra silenciosamente a partir de ~50 contas (o `accept-invite` já usa o caminho certo).

### Como ficou no código

A decisão do sempre-200, documentada onde deve estar (`whatsapp-webhook/index.ts:19-23`):

```ts
/**
 * **Sempre responde 200, mesmo quando dá errado.** Não é preguiça: a Meta
 * reenvia o que não recebeu 200 e, depois de falhas repetidas, **desativa o
 * webhook da aplicação inteira**. Um erro nosso numa barbearia não pode calar
 * todas as outras. O que dá errado é registrado, não devolvido como 500.
 */
```

E a comparação em tempo constante, com o porquê (`whatsapp-webhook/index.ts:44-67`):

```ts
async function assinaturaConfere(corpo: string, cabecalho: string | null) {
  if (!APP_SECRET) return false
  if (!cabecalho?.startsWith('sha256=')) return false
  // ... HMAC-SHA256 do corpo ...
  if (calculado.length !== esperado.length) return false
  let diferenca = 0
  for (let i = 0; i < calculado.length; i++) {
    diferenca |= calculado.charCodeAt(i) ^ esperado.charCodeAt(i)
  }
  return diferenca === 0
}
```

O comentário acima dessa função explica: comparar com `===` vaza, pelo tempo de resposta, quantos bytes iniciais bateram. Guarde o padrão — o `asaas-webhook` ainda compara o token com `!==` (AS-10) e deveria reutilizar isto.

### O que quebraria se você mexesse amanhã

- **Redeploy de qualquer edge sem conferir `verify_jwt` no painel.** Para a `whatsapp-webhook`, o default errado cala a Meta para o app inteiro. Declare todas no `config.toml` (BL-13) antes de qualquer redeploy em série.
- **Rotacionar `WHATSAPP_APP_SECRET` errado** silencia todas as mensagens Cloud sem nenhum alerta — a assinatura passa a falhar e tudo vira `200 IGNORED` com log que ninguém lê.
- **Um "redeploy limpo" das functions apaga `admin-metricas`**, que não tem fonte no repo. Traga o fonte para `supabase/functions/admin-metricas/` antes.
- **Os fallbacks silenciosos são armadilhas**: `APP_URL ?? 'https://clubcut.vercel.app'` (domínio velho) e `ASAAS_BASE_URL ?? sandbox` em 2 funções (Módulo 7). O padrão certo já existe no próprio repo — copie-o, não os fallbacks.

---

## Módulo 5 — O canal WhatsApp: da Cloud API ao modelo híbrido

### O problema

O produto É o atendimento por WhatsApp. E o WhatsApp oferece dois mundos incompatíveis: a **Cloud API oficial** (estável, mas com custo por conversa a partir de 01/10/2026 e um onboarding que exige login no Facebook e verificação de empresa **de cada barbeiro**) e o **canal não-oficial via Baileys/Evolution** (custo zero por mensagem, QR code e pronto — mas sujeito a banimento do número).

### As opções na mesa

1. **Cloud API por barbearia** — o modelo original (`docs/whatsapp-api-oficial.md` descreve essa arquitetura, hoje morta). Fricção de onboarding inaceitável para o público (barbeiro não vai verificar empresa no Facebook), e custo por conversa em cima.
2. **Só Evolution** — onboarding trivial, mas TODO o produto pendurado num canal que a Meta pode derrubar, inclusive os lembretes (mensagem iniciada pelo sistema é o comportamento mais parecido com spam — o mais arriscado).
3. **Híbrido** — conversa pelo número REAL da barbearia via Evolution; tudo que a plataforma INICIA (lembrete, avaliação, reativação, avisos) sai por um número central DA PLATAFORMA na Cloud API, sempre por template aprovado.

### A escolha e o critério

Híbrido, decidido em 2026-08-30. O racional está escrito na própria migration (`0115_modelo_hibrido_remetente_central.sql:1-16`):

```sql
-- Decisão de 2026-08-30: conversa com cliente fica no número REAL da barbearia
-- (Evolution); lembrete/reativação/avisos saem de um número DA PLATAFORMA na
-- Cloud API. Motivo: sem BSP, registrar um número oficial por barbearia exige
-- login no Facebook e verificação de empresa de cada barbeiro — fricção que
-- mata o onboarding. E se a Meta banir, o número queimado é o nosso, não o do
-- barbeiro.
```

Critérios, na ordem: **fricção de onboarding** (o gargalo de venda), **custo** (conversa é o volume; template é raro), e **confinamento do risco** (banimento da conversa atinge só o número daquela barbearia; banimento do central atinge só as notificações).

Os dois contratos que sustentam o híbrido:

**1. O nome da instância é o tenant.** Cada barbearia vira uma instância Evolution chamada `salon-<uuid>`. A tradução mora num módulo só, testado, porque atravessa a fronteira do sistema (`supabase/functions/_shared/instanceName.ts`):

```ts
/**
 * Do lado do n8n as escritas usam `service_role`, que ignora RLS. Ou seja: se
 * a extração do UUID errar, o banco não impede a gravação no salão errado.
 * Por isso as duas direções vivem aqui juntas e cobertas por teste.
 */
export const INSTANCE_PREFIX = 'salon-'

export function salonIdFromInstanceName(instanceName: string | null | undefined): string | null {
  if (typeof instanceName !== 'string') return null
  const nome = instanceName.trim()
  if (!nome.startsWith(INSTANCE_PREFIX)) return null
  const candidato = nome.slice(INSTANCE_PREFIX.length)
  return isUuid(candidato) ? candidato.toLowerCase() : null
}
```

Leia o comentário duas vezes: devolve `null`, **nunca um palpite** — o chamador deve parar o fluxo. (Guarde isso: o n8n não usa este módulo, e é aí que mora o CRÍTICO do Módulo 6.)

**2. A config de toda instância tem fonte única versionada** (`_shared/evolutionConfig.json`), consumida pela edge no connect e pelo script de backfill:

```json
{
  "webhookEvents": ["MESSAGES_UPSERT", "SEND_MESSAGE"],
  "settings": {
    "groupsIgnore": true,
    "rejectCall": false,
    "alwaysOnline": false,
    "readMessages": false,
    "syncFullHistory": false
  }
}
```

O provisionamento (`whatsapp/index.ts`, action `connect`) faz 4 chamadas: `POST /instance/create` (WHATSAPP-BAILEYS) → `/settings/set` → `/webhook/set` (apontando para a env `N8N_WEBHOOK_URL`, com `webhookBase64:true` porque o ramo de mídia lê `audioMessage.base64`) → `GET /instance/connect` (QR de 40s). E devolve o resultado à tela (`whatsapp/index.ts:130-157`):

```ts
// O resultado volta para a tela: sem isso o dono conectaria o WhatsApp,
// veria "conectado" e só descobriria que o agente está mudo quando um
// cliente reclamasse.
let webhookOk = false
if (N8N_WEBHOOK_URL) {
  const webhookResult = await evoFetch(`/webhook/set/${instanceName}`, { ... })
  webhookOk = webhookResult.ok
}
```

Do lado oficial, a 0115 criou `remetentes_oficiais` (o número central `1288009817732005`) e reescreveu as views de envio para buscar o remetente **da plataforma** em vez da conexão do salão, com a trava de template no banco (`0115:114-117`):

```sql
join public.whatsapp_templates t
  on t.chave = case when ce.etapa = 1 then 'reativacao_convite' else 'reativacao_tempo' end
 and t.status = 'aprovado' and t.ativo
```

Template não aprovado ⇒ fila vazia ⇒ nada sai e nada é marcado. **Fail-closed num lugar só** — os workflows não reimplementam a checagem.

### O que custou

Este é o módulo em que os trade-offs mais cobram caro. Anote todos:

- **O feedback `webhookOk: true` só cobre a chamada, não o valor.** Se `N8N_WEBHOOK_URL` estiver configurada com o valor **errado**, o `/webhook/set` responde OK, a tela diz `webhookOk: true`, e toda mensagem morre num 404 do n8n que ninguém loga. É o cenário A1/B1 da integração — e a evidência disponível (zero execuções por webhook desde 23/08; URL registrada com UUID no path enquanto o doc manda sem) diz que é o estado **atual**.
- **O estado da conexão não se sustenta sozinho.** Os eventos assinados são só `MESSAGES_UPSERT` e `SEND_MESSAGE` — sem `CONNECTION_UPDATE`. O único escritor de `whatsapp_connections.status` é a tela `/conexao`. A instância cai e o banco diz `open` até o dono abrir a tela; e o alerta `whatsapp-caiu` (migration 0053) lê exatamente essa coluna — o alarme é cego para o caso comum (EV-02).
- **A resposta do barbeiro pelo celular é invisível.** `fromMe` é descartado, `SEND_MESSAGE` é ignorado — o agente responde por cima, duas conversas paralelas com o cliente. O caso de uso que **vendeu** o híbrido não funciona (EV-06).
- **O lembrete ficou para trás na 0115.** As views de reativação/atraso/vencimento foram desamarradas para o remetente central; o fluxo de Lembretes monta a fila **dentro do workflow** (não numa view) e ainda busca o `phone_number_id` da conexão do salão — que é NULO no híbrido. Resultado: **mesmo com template aprovado, o lembrete não sai** (MT-02). E o corolário perverso: aprovar os templates liga avaliação/vencimento/reativação sozinhos, com o lembrete ainda mudo.
- **Nenhum dos 25 templates foi submetido à Meta** (todos `rascunho`, `categoria_meta` NULL) — o canal oficial inteiro está mudo, com o n8n rodando verde por cima (MT-01).
- **Instância órfã existe.** Apagar barbearia (ou zerar o banco, como em 03/09) não remove a instância na Evolution — instâncias antigas provavelmente seguem no servidor com webhook apontado para produção (`scripts/evolution-remover-instancias.mjs` existe exatamente por isso).
- **Custo de RAM por instância Baileys** (~1 por barbearia; hoje 1,5/8 GB com zero conectadas) e a imagem `evoapicloud/evolution-api:latest` **não pinada** — um recreate é um upgrade silencioso de Baileys para todas as instâncias.

### O que quebraria se você mexesse amanhã

- **Mudar o prefixo `salon-` ou o formato do nome** quebra a resolução de tenant no n8n E o inverso na edge — as duas direções vivem em `instanceName.ts`, mas o n8n tem uma cópia informal (`instance.slice`) que não te avisaria.
- **Editar `evolutionConfig.json` só muda instâncias NOVAS** — as conectadas precisam do backfill (`scripts/evolution-aplicar-config.mjs`). Esquecer o backfill cria deriva invisível de comportamento entre salões.
- **Rotacionar `N8N_WEBHOOK_URL`** exige reaplicar o webhook em TODAS as instâncias, porque o valor é carimbado por instância no connect. É o SPOF número um do onboarding.
- **Recriar o container da Evolution** pode trocar a versão do Baileys (imagem `:latest`). Pine a tag homologada (o comentário do `evolutionConfig.json` cita v2.3.7) antes de qualquer recreate.
- **Submeter os templates à Meta sem antes consertar o lembrete** (fonte do `phone_number_id` → `remetentes_oficiais`) liga as outras automações com o recurso principal ainda morto. A ordem certa: consertar o lembrete, submeter `lembrete_hoje` primeiro e sozinho, testar controlado, depois o lote (BL-10/BL-11).

---

## Módulo 6 — O n8n: a automação como camada, e o buraco no meio dela

### O problema

O produto precisa de um agente de IA que conversa, agenda e chama o dono — mais uma dúzia de rotinas (lembrete, avaliação, convite por e-mail, aviso de fim de teste, boleto, estoque baixo, auditoria). Construir isso como backend próprio custaria semanas; cada rotina nova custaria deploy.

### As opções na mesa

1. **Backend próprio** com filas e workers — controle total, custo de construção e operação altos.
2. **Serviços gerenciados** (n8n cloud, Zapier/Make) — custo mensal por execução, e o agente com 12 ferramentas estouraria qualquer plano.
3. **n8n self-hosted no VPS** — custo fixo baixo (o VPS já existiria para a Evolution), editor visual que acelera iteração, nó LangChain pronto para o agente.

### A escolha e o critério

n8n self-hosted, pelos critérios **tempo** e **custo** de um dev só. E dentro do n8n, três decisões de desenho que você precisa entender porque são o que mantém o sistema são:

**1. O modelo não escolhe o tenant.** Todas as 12 Supabase Tools do agente fixam `salon_id` por expressão do fluxo — `$('Converge Texto Final').item.json.salon_id` — nunca via `$fromAI`. O LLM pode alucinar o que quiser; a query vai para o salão da conversa. `Cancelar Agendamento` e `Confirmar Presenca` ainda exigem `client_id` + `status='agendado'`.

**2. As regras de negócio moram em views SQL, não nos nós.** Os workflows leem `avaliacoes_a_pedir`, `vencimentos_a_avisar`, `salons_atendendo`, `boletos_a_enviar` — o gating de plano/template/tolerância mora num lugar só (o banco), e o n8n é só o carteiro. Por isso as 2.018 execuções do lembrete são verdes com fila vazia: fail-closed funcionando.

**3. A ordem marcar×enviar é escolhida por janela, com justificativa em sticky note.** Ciclos de 10 min marcam ANTES de enviar (reenvio a cada 10 min bombardearia o cliente); ciclos lentos (avaliação a cada 30 min, convite, boleto) marcam DEPOIS (perder um envio é pior que repetir). Não é inconsistência — é decisão por fluxo, documentada no próprio fluxo.

Mais dois padrões do fluxo principal (`rJO1n7cFeNDIJyB5`, 83 nós): **debounce de rajada** (Wait 15s + view `ultima_mensagem_recebida` + nó `Ainda E a Ultima?` — três mensagens seguidas viram uma resposta) e o **validador anti-alucinação** (`Formatar para WhatsApp` confere cada lista da resposta contra catálogo e barbeiros reais — cicatriz do barbeiro "Rafael" inventado em 23/08).

### O que custou

Aqui mora o CRÍTICO número um do sistema e o padrão de falha silenciosa. Em ordem de gravidade:

- **O webhook do agente não tem autenticação, e o ramo Evolution deriva o tenant por corte de string sem validar no banco.** O nó de entrada tem, extraído do JSON do workflow: `parameters = {httpMethod: 'POST', path: 'salao-atendimento', options: {}}` — nenhum header conferido. E o nó `Adaptar Payload (Provedor)` faz `salonId = instance.slice('salon-'.length)` e segue **direto** para o fluxo, pulando o nó `Buscar Instância Conectada` (que só roda no ramo Cloud). Combine com o Módulo 1: o n8n grava com `service_role`, então a RLS não segura nada. Qualquer POST forjado com `instance: "salon-<uuid-de-qualquer-salão>"` grava conversa em qualquer tenant, gasta OpenAI, e faz o WhatsApp **real** da barbearia responder a um telefone escolhido pelo atacante — o gatilho exato do banimento que o híbrido existe para evitar. A única barreira é o UUID no path da URL — que está escrita em doc de **repositório público** (`docs/n8n-cloud-api-entrada.md:89`). O contrato certo existe e está testado (`salonIdFromInstanceName` devolvendo `null`); o n8n simplesmente não o segue. [= N8N-C1/EV-01, BL-06]
- **O mesmo vale para `lembrete-resposta-central`**: sem auth, e envia `body.resposta` **verbatim** pelo número oficial da plataforma para `body.contact_phone` (N8N-A4).
- **Nenhum workflow tem `errorWorkflow`.** Se o agente começar a falhar (credencial expirada, OpenAI fora), clientes ficam sem resposta e ninguém é avisado; a retenção de ~14 dias ainda apaga a evidência (N8N-A2).
- **A conversa é select→create, não upsert** — duas mensagens quase simultâneas de um cliente NOVO disputam o create; o segundo estoura 23505 e a execução morre **antes** de gravar a mensagem. A primeira impressão do produto é onde a mensagem some (N8N-M1).
- **A resposta é gravada no CRM ANTES do envio, e o nó Evolution não tem retry** (os nós Cloud têm `retryOnFail: 3, onError: stopWorkflow`; os Evolution, nada). Um soluço de rede e o CRM mostra uma resposta que o cliente nunca recebeu (N8N-M2/EV-03). Compare com a edge `whatsapp` action `send`, que envia e só grava depois — a ordem certa existe no mesmo sistema.
- **O campo `contexto` do lembrete é descartado.** A edge envia `contexto: "Ele JÁ TEM esse horário marcado… REMARQUE o existente"` (`whatsapp-webhook/index.ts:329-341`); o workflow tem **0 ocorrências** de `body.contexto`. Clique em "Reagendar" ⇒ segundo agendamento (N8N-A1 — e lembre do Módulo 2: a constraint não pega horários disjuntos).
- **Os tokens do próprio agente (gpt-4o-mini) não entram em `consumo_ia`** — só transcrição e visão são medidos. A fatura por uso cobra por um serviço cujo custo principal não é medido (N8N-M4; volta no Módulo 7).
- **Não há pipeline nenhum**: workflows editados ao vivo no único ambiente (que é produção), sem export no repo, 3 workflows com rascunho ≠ versão publicada, dois negócios (Club Cut e Fenié Pro) no mesmo projeto com credenciais compartilháveis.
- **Vídeo/documento viram texto vazio** (o mapa `({audio, imagem})[tipo] ?? "conversation"` engole os tipos não mapeados e o ramo `Tipo Não Suportado` é inalcançável) e **conversas de clientes ficam retidas em claro ~14 dias** nas execuções (`saveDataSuccessExecution: "all"`, redaction off) — item de LGPD que os termos não citam.

### Como ficou no código

O n8n não tem código no repo — esse É o problema de governança. O que existe no repo são as pontas: o payload que a edge envia (`whatsapp-webhook/index.ts:366-386` — `{salon_id, phone_number_id, waba_id, contact_phone, contact_name, message_id, texto, media_id, tipo, contexto}`) e as views que os workflows leem. Os trechos dos nós citados acima vêm do JSON extraído via API do n8n durante a auditoria — a "fonte" deles é a instância viva.

### O que quebraria se você mexesse amanhã

- **Renomear qualquer nó do fluxo principal** quebra as expressões que o referenciam (`$('Converge Texto Final').item.json...`) — e o erro só aparece em execução, não em "compilação".
- **Publicar um rascunho sem revisar**: o Detalhamento de Uso tem no rascunho um cron incompleto (`{"field":"hours"}` sem `hoursInterval`) — um publish acidental quebra a emissão de boletos.
- **Mudar o path do webhook** (`salao-atendimento`) desconecta a edge (secret `N8N_WHATSAPP_WEBHOOK_URL`) E todas as instâncias Evolution (webhook por instância) de uma vez.
- **Ao corrigir o C1** (autenticar o webhook + validar instância no banco — BL-06): o header secreto precisa entrar em TRÊS lugares ao mesmo tempo — o nó Webhook, a edge `whatsapp-webhook` (para o ramo Cloud) e o `/webhook/set` de cada instância Evolution (campo `headers`), com backfill. Fazer só um lado derruba o outro.
- **Antes de qualquer mexida grande: exporte os 13 workflows para o repo** (BL-05). Hoje o backup deles é o backup semanal do VPS, nunca testado.

---

## Módulo 7 — A cobrança: do plano morto ao modelo por uso

### O problema

Como cobrar barbearia pequena por um agente de WhatsApp? O primeiro modelo foi assinatura com planos e troca com rateio. Ele **morreu em 24-25/08** (`0110_aposenta_plans.sql` derrubou a tabela `plans`): a complexidade do rateio e o descolamento entre preço fixo e valor entregue não paravam em pé para o público.

### As opções na mesa

1. **Assinatura fixa por plano** — o modelo morto: previsível, mas desconectado do valor e cheio de casos de borda (rateio, upgrade, downgrade).
2. **Cobrança por uso** — R$ por agendamento criado pelo agente: o preço acompanha o valor entregue, e some o rateio.
3. **Híbridos** (mínimo + uso) — adiado; o lançamento foi sem mínimo e sem franquia.

### A escolha e o critério

Por uso, decidida em 2026-08-23 e documentada no cabeçalho da migration (`0097_cobranca_por_uso.sql:1-17`) — leia, porque cada linha é uma regra de negócio:

```sql
-- - **Cobra-se o agendamento criado pelo agente** (`origem = 'agente'`), mesmo
--   que seja cancelado depois: o sistema entregou o prometido. Reagendamento
--   nao cobra de novo (e a mesma linha). CRM e QR do balcao nao cobram.
-- - **Preco por faixa de barbeiros ativos**, medidos no ULTIMO dia do periodo.
-- - **Lembrete nao cobra** (o agendamento ja pagou).
-- - O fechamento e MENSAL (mes civil), roda DENTRO do banco (pg_cron) e
--   congela numa tabela: fatura fechada nao muda se um agendamento for
--   cancelado depois.
```

O preço em tabela, não em constante (`0097:36-39`):

```sql
insert into public.faixas_de_uso (min_barbeiros, max_barbeiros, preco) values
  (1, 3, 0.75), (4, 7, 0.70), (8, 10, 0.65), (11, null, 0.60);
```

A cadeia completa: `origem='agente'` → pg_cron `fechamento-mensal-de-uso` (dia 1º, 9h) → `gerar_fatura_de_uso()` congela em `faturas_de_uso` → cron horário do n8n chama a edge `cobrar-uso` → `POST /v3/customers` + `POST /v3/payments` no Asaas (`billingType:'UNDEFINED'`, vencimento hoje+7, mínimo R$ 5, `externalReference = salon_id`) → e-mail com o boleto → pagamento → `asaas-webhook` marca `paga_em` e estende `acesso_ate = vencimento + 1 mês` → bloqueio via RPC `situacao_do_acesso` + cron diário `estende-acesso-sem-debito`.

Três peças dessa cadeia são as melhores do sistema — estude-as como referência:

**1. Idempotência real do webhook** (`asaas-webhook/index.ts:101-126`). A entrega do Asaas é at-least-once; o INSERT é a trava:

```ts
// O insert é a trava: a segunda vez falha por chave duplicada, e é essa
// falha que diz "já tratei".
const { error: erroRegistro } = await admin.from('asaas_eventos').insert({ id: eventoId, ... })
if (erroRegistro) {
  if (erroRegistro.code === '23505') {
    return json({ ok: true, ignorado: 'evento repetido' })
  }
  return json({ error: 'erro interno' }, 500)  // Asaas reentrega depois.
}
```

E o par correto: se o **efeito** falhar depois da trava, a trava é removida — para a reentrega funcionar. Evento desconhecido devolve 200 (15 falhas seguidas pausam a fila do Asaas e silenciariam as confirmações).

**2. Sem fallback de URL, de propósito** (`cobrar-uso/index.ts:30-31`):

```ts
// Sem fallback de propósito: sandbox silencioso em produção é pior que falhar.
const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL')
```

**3. Bloqueio justo** (`0130_cadeia_de_cobranca.sql:255-270` — o cron que estende quem não deve):

```sql
   -- A trava: dívida vencida e não paga segura o acesso. Fatura de R$ 0,00
   -- não é dívida, e fatura sem boleto emitido não está vencida — não dá
   -- para vencer um prazo que nunca existiu.
   and not exists (
     select 1 from public.faturas_de_uso f
      where f.salon_id = sub.salon_id
        and f.paga_em is null and f.valor > 0
        and f.boleto_vencimento is not null
        and f.boleto_vencimento < v_hoje
   );
```

Mais as travas de escrita: policy por linha + **grant por coluna** em `subscriptions` restrito a `cpf_cnpj` — o dono não se dá `acesso_ate='2099'`. E o período pago conta do **vencimento**, não do dia do pagamento: atraso não vira bônus.

### O que custou

- **O ciclo nunca rodou com dinheiro real no modelo vigente.** 0 faturas, 0 eventos. O primeiro fechamento real é 01/10, com a El Guardians saindo do teste em 11/09 — **a estreia do ciclo inteiro será com dinheiro de cliente** (D1).
- **Zerar o banco não zerou o Asaas.** A produção foi zerada em 03/09; recorrências e customers antigos ficaram no Asaas **sem espelho no banco** (El Guardians R$ 5/mês; `sub_klx4z6d0xv9p83h4`; `cus_000192278757`/`cus_000194207151`). O botão Cancelar só alcança recorrência com `asaas_subscription_id` preenchido — que hoje é NULO. Se ainda estiverem ativas, cobram dinheiro real todo mês de pagadores que o sistema não conhece, e o webhook responderia "assinatura não encontrada" com 200 (AS-01). **Não existe reconciliação em nenhuma fronteira externa** — este é o exemplo mais caro do padrão.
- **Inadimplência não fala com ninguém**: OVERDUE só marca status; sem dunning; e o customer nasce no Asaas **sem e-mail** — nem o Asaas notifica (AS-02).
- **As duas funções legadas mantêm o fallback sandbox** (`asaas`, `asaas-webhook`) que o `cobrar-uso` já aboliu — pior caso: 404 do sandbox tratado como sucesso, banco marca `cancelada`, produção segue cobrando (AS-03).
- **Cobra-se por uso sem medir o custo do uso** — os tokens do agente não entram em `consumo_ia` (Módulo 6); a margem por salão é desconhecida por construção.
- Miudezas com data marcada: `somarUmMes` estoura fim de mês (31/01 + 1 mês = 03/03 — dias grátis); OVERDUE fora de ordem marca conta paga como atrasada na tela; corrida no `cobrar-uso` pode emitir boleto duplo; o texto promete "boleto, Pix ou cartão" com Pix/boleto **bloqueados** na conta.

### O que quebraria se você mexesse amanhã

- **Os dois crons do Postgres são o coração**: `fechamento-mensal-de-uso` e `estende-acesso-sem-debito`. O segundo parado por alguns dias **bloqueia pagante em dia** (o `acesso_ate` fica para trás) — e não há monitor de pg_cron. Antes de mexer em qualquer função que eles chamam, rode o pgTAP `cadeia_de_cobranca.test.sql`.
- **Rotacionar `ASAAS_WEBHOOK_TOKEN` sem atualizar o painel do Asaas em sincronia**: 15 falhas seguidas pausam a fila e ninguém mais é liberado após pagar.
- **Cobrança manual no painel do Asaas com `externalReference` de salão** casa no fallback do webhook e dá um mês de acesso de graça — o quase-acidente já aconteceu. Regra operacional: cobrança manual nunca leva `externalReference` de salão.
- **Mudar preço**: altere `faixas_de_uso`, nunca as faturas — fatura fechada congela o preço na linha, por desenho.
- **Zerar/re-semear o banco de novo**: a regra que faltou está escrita agora — **zerar banco exige zerar Asaas junto** (e inventariar as instâncias da Evolution, Módulo 5).

---

## Módulo 8 — Hospedagem, deploy e o que segura tudo de pé

### O problema

Onde roda cada peça, com orçamento perto de zero e um dev só? E como as mudanças chegam em produção?

### As opções na mesa

Para o front: Vercel/Netlify (estático, deploy por push) vs servir do próprio VPS. Para o banco: Supabase gratuito vs pago vs Postgres no VPS. Para n8n+Evolution: VPS único vs separados vs gerenciados. Para domínio/e-mail: qualquer registrador; a Hostinger unificou domínio, DNS, mailbox e o VPS num painel só.

### A escolha e o critério

- **Vercel Hobby, projeto 100% estático** — `tsc -b && vite build` como gate (erro de tipo derruba o **deploy**, não a produção — comprovado no ERROR de 03/09, em que a produção anterior continuou servindo), previews atrás de Vercel Authentication, push em `main` = produção.
- **Supabase gratuito** — banco + Auth + edge functions + Realtime + pg_cron num serviço só; toda a lógica de servidor mora lá, a Vercel não tem runtime.
- **Um VPS KVM 2** (`srv1833354`, 2 vCPU/8 GB, R$ 108,99/mês) com Docker + Traefik, rodando n8n E Evolution — a máquina está folgada (CPU <1%, RAM ~19%).
- **Hostinger** para domínio `clubcut.space` (R$ 182/ano, WHOIS privacy, auto-renew com cartão válido), DNS (com snapshots de zona) e mailbox `contato@clubcut.space`. E-mail com MX/SPF/DKIM completos, DMARC `p=none`.

Critério em tudo: **custo mínimo com o menor número de peças para operar** — cerca de R$ 1.634/ano de Hostinger antes de qualquer receita, e zero de Vercel/Supabase.

### Como ficou no código

O deploy do front é o único pipeline de verdade. O `vercel.json` inteiro:

```json
{
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

É o fallback de SPA no formato **legado** `routes` — e na Vercel, `routes` não coexiste com `headers`/`rewrites` modernos. Este arquivo de 6 linhas é o motivo de o app não ter nenhum header de segurança além de HSTS e de os assets com hash serem servidos com `Cache-Control: max-age=0, must-revalidate` (cada visita revalida ~100 arquivos). A correção é migrar para `rewrites` + `headers` (BL-24).

### O que custou

O relatório de integração resume em uma frase que você deve emoldurar: **"o sistema roda, mas não é reconstruível."** Por peça:

- **Supabase: sem backup.** Plano gratuito, sem PITR, sem rotina de dump — e o banco é o único depositário de agenda, clientes, financeiro e prova de aceite de termos. **Um wipe já aconteceu** (produção zerada em 03/09). É o único item da auditoria inteira que pode encerrar o negócio num dia (SB-01/E1).
- **Supabase: drift de migrations nos dois sentidos.** Repo com 138 arquivos, produção com 152-153 aplicadas; ≥18 aplicadas sem arquivo no repo (incluindo `add_lembrete_enviado_to_appointments` — a coluna que governa o lembrete não tem fonte versionada); 2 arquivos do repo fora da produção; ritmo recente de ~2 mudanças manuais/semana. Um banco criado do repo **não é** a produção, e o pgTAP do CI valida um schema que diverge do real (SB-03/E3).
- **n8n: não tem deploy — tem edição ao vivo em produção** (Módulo 6).
- **VPS: sem firewall nenhum.** `firewall_group_id: null`, nenhum firewall criado na conta, e os composes publicam n8n em `0.0.0.0:32769` e Evolution em `0.0.0.0:32770` — HTTP puro, contornando o TLS do Traefik. Combinado com `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true` + `CORS_ORIGIN='*'` na Evolution: um vazamento da chave global entrega os tokens de **todas** as instâncias de uma vez (HG-01/EV-07). É o CRÍTICO de infra.
- **VPS: backup semanal nunca testado, zero snapshots manuais** — janela de perda de até 7 dias para workflows editados quase diariamente.
- **Vercel: o CI não gateia o deploy.** vitest e pgTAP rodam **em paralelo** ao deploy, não antes — teste vermelho com typecheck verde chega em produção (o commit `21f359b` documenta o buraco). E o plano Hobby é pessoal/não-comercial servindo um SaaS cobrado — risco de suspensão sem SLA.
- **Identidade do produto em 4 fontes divergentes**: dois domínios legados servindo o app com 200 (`clubcut.vercel.app`, `clinica-crm-kappa.vercel.app`), canonical/og do `index.html` no domínio velho, fallback `APP_URL` no domínio velho, e o nó do n8n com o domínio novo hardcoded. Cada verificador de origem futuro nasce tendo que conhecer a lista tripla.
- **Repo público** expondo URLs de webhook (o combustível do C1) e histórico de decisões nas mensagens de commit.

### O que quebraria se você mexesse amanhã

- **`supabase db push` ou `db reset` a partir do repo** pode apagar/reintroduzir coisas silenciosamente — o repo e a produção divergem nos dois sentidos. Antes de qualquer operação de sincronização: gere a migration de sincronização a partir do **diff real** (BL-13), como já foi feito na 0022.
- **Ativar o firewall (BL-04) sem snapshot antes (BL-05)**: se errar a regra, você se tranca para fora do VPS que carrega toda a mensageria. Ordem: snapshot manual → firewall liberando 80/443 + 22 restrito → remover os publishes `0.0.0.0` dos composes (o Traefik alcança pela rede Docker) → testar que os hostnames TLS seguem vivos e repetir o teste de mensagem.
- **Mexer no `vercel.json`**: `routes` e `headers` não coexistem — a migração para `rewrites` + `headers` é tudo-ou-nada nesse arquivo.
- **A renovação do VPS em 16/09 (R$ 108,99)** é a primeira cobrança relevante e toda a mensageria mora lá; o cartão é único (o método secundário expirou). Falhou a cobrança, a Hostinger suspende e WhatsApp + n8n param juntos.
- **Trocar o remetente de e-mail do Gmail para `contato@clubcut.space` antes de endurecer o DMARC** (`p=none` → relatórios `rua=` → `p=quarantine`) é a combinação que mais cai em spam — domínio novo, TLD barato, DMARC frouxo (BL-34/35).

---

## Módulo 9 — A lição transversal: a falha silenciosa como arquitetura acidental

Este módulo não tem uma decisão única — tem seis decisões locais **corretas** que, somadas, produziram o maior defeito do sistema. Acompanhe a soma:

1. A Meta recebe **sempre-200** (correto: senão ela desativa o webhook) — o erro vai para `console.error`.
2. Os workflows são **fail-closed** por views (correto: template não aprovado ⇒ fila vazia) — execuções verdes com fila vazia são indistinguíveis de "funcionando".
3. Vários nós têm `onError: continueRegularOutput` (razoável localmente) — um 401 permanente não quebra execução nenhuma.
4. **Nenhum workflow tem error workflow** — falha de execução não avisa ninguém.
5. A resposta é **gravada antes de enviar** e os `statuses` da Meta são descartados — o banco registra intenções e as exibe como fatos.
6. O status da conexão Evolution **só muda quando o dono abre a tela** — queda de conexão é invisível.

Resultado: **um sistema em que cada componente falha educadamente e o conjunto morre sem barulho.** A prova empírica não é hipotética: o produto principal ficou **duas semanas** sem receber uma única mensagem (zero execuções por webhook desde 23/08) e nada nem ninguém acusou. O CRM — a única janela do dono — mostra um mundo mais funcional que o real.

O relatório de integração nomeia os padrões (P1–P6); os três que você mais vai reencontrar:

- **P2 — perímetro duro por fora, oco por dentro**: as bordas externas autenticam bem (HMAC, token, JWT); os elos internos (webhooks do n8n) confiam no segredo do path, com a URL num repo público.
- **P4 — fronteiras externas sem reconciliação**: zerar o banco não zerou o Asaas nem a Evolution; os templates existem no Postgres e não na Meta. Nenhuma fronteira compara "o que o banco acha" com "o que o mundo tem".
- **P6 — os elos-fim nunca foram exercitados**: primeiro atendimento Evolution, lembrete no modelo vigente e ciclo de cobrança — zero execuções reais os três. Todo o valor prometido passa por um elo que nunca rodou.

A correção de maior alavancagem custa um dia: **um error workflow único** (e-mail via `canal_de_alertas`, o padrão da Auditoria já existente) apontado em todos os fluxos, **mais um alerta de silêncio** ("zero mensagens em X horas") — é o item que transforma todos os outros modos de falha mudos em avisos (BL-07). E o teste que destrava tudo custa minutos: parear o QR da El Guardians e **mandar uma mensagem real** (T1/T2 do plano de testes) — decide em uma tacada se o secret `N8N_WEBHOOK_URL` está certo, e nada mais do produto é testável antes disso.

---

## Módulo 10 — O que eu faria diferente se começasse hoje

Não é uma lista de arrependimentos — várias escolhas foram certas para o contexto (RLS, travas no banco, o híbrido, cobrança por uso). É o que a experiência acumulada mudaria:

1. **Observabilidade no dia zero, não no fim.** O error workflow, o alerta de silêncio e um monitor externo ao VPS custam um dia e teriam evitado as duas semanas de mudez. Todo "sempre-200" e todo "fail-closed" nasceria junto com o alarme correspondente — a regra é: **quem engole erro tem que cuspir alerta.**
2. **Backup antes da primeira linha de dado real.** `pg_dump` agendado para storage externo com restore ensaiado custa uma tarde. O sistema operou meses com o único ativo irrecuperável do negócio sem cópia — e um wipe aconteceu.
3. **Nada em produção sem arquivo no repo, desde o começo** — migrations, `verify_jwt` no `config.toml`, export dos workflows do n8n. O drift começou como atalho ("aplico à mão e depois registro") e virou o motivo de a produção não ser reconstruível. O custo de sincronizar cresce toda semana.
4. **Autenticar os webhooks internos no dia em que nasceram.** Um header secreto no nó Webhook custa 10 minutos quando o fluxo é novo; custa coordenação em três pontas depois que a Evolution, a edge e a doc já apontam para ele. Segurança por URL nunca seria o design, nem "temporariamente".
5. **Escritas multi-passo nascem como RPC.** A venda de 8 passos no cliente é o exemplo: quando a regra "transação mora no banco" foi aprendida, o modal já existia. Começando hoje, `registrar_venda` seria RPC como `estornar_venda` já é.
6. **Uma tabela `envios` desde o início** (canal, destino, wamid, status, tentativas) em vez de flags espalhadas (`lembrete_enviado`, `email_enviado_em`, `notificada_em`…). Teria dado de graça: retry, reconciliação com os `statuses` da Meta, e a resposta à pergunta "o cliente recebeu?" — que hoje o sistema não sabe responder.
7. **Reconciliação como rotina em toda fronteira externa** (Asaas, Evolution, Meta): um job que compara o espelho local com a lista remota e alerta o que sobra. Os órfãos do Asaas e as instâncias fantasma da Evolution são o custo de não ter isso.
8. **TypeScript `strict` do primeiro commit** — ligar depois custa uma migração; ligar no início custa nada.
9. **Separar o n8n da Evolution em VPSs distintos** (ou ao menos o alarme fora do VPS): o carteiro dos alertas não pode morar na coisa vigiada.
10. **O que eu manteria igual, para você não "corrigir" sem necessidade**: RLS com `private.*` e deny-by-default; travas de agenda por exclusion constraint; regras de fila em views SQL fail-closed; idempotência do webhook do Asaas com trava/destrava; o modelo híbrido em si; e a disciplina de escrever o porquê das decisões em comments e sticky notes — foi ela que tornou esta auditoria (e esta aula) possível.

---

## Módulo 11 — O que estudar para sustentar cada parte

Por área, do mais urgente para o menos, com o "porquê" amarrado ao sistema:

**Postgres / Supabase (a fundação — prioridade máxima)**
- **Row Level Security a fundo**: policies permissivas vs restritivas, `USING` vs `WITH CHECK`, por que `service_role` ignora tudo, e o custo de múltiplas policies por comando (você vai consolidar as 95 do advisor um dia).
- **SECURITY DEFINER e `search_path`**: o vetor de escalada que as 45 funções do projeto fecham — e que você reabriria criando uma função sem `set search_path`.
- **Exclusion constraints, `tstzrange`, `btree_gist`, `deferrable`**: a agenda inteira depende disso.
- **pg_cron**: os 7 jobs são órgãos vitais sem monitor; aprenda a ler `cron.job_run_details`.
- **Migrations e drift**: como gerar diff de schema real (`supabase db diff`), e por que "aplicar à mão" cria as duas listas divergentes que você herdou.
- **PostgREST**: como policies + grants viram a API que o CRM consome; limites de URL (o `.in()` gigante do `useAgentStats`).

**Webhooks e integrações (onde o dinheiro e as mensagens passam)**
- **Entrega at-least-once e idempotência**: por que o INSERT-como-trava do `asaas-webhook` funciona e o que "fora de ordem" quebra (o caso OVERDUE).
- **HMAC e comparação em tempo constante**: você tem a implementação de referência no próprio repo.
- **Reconciliação entre sistemas**: o conceito que falta em todas as fronteiras (Asaas, Evolution, Meta).

**WhatsApp (o produto)**
- **Cloud API**: janela de 24h, categorias de template (utility vs marketing — a recategorização multiplica custo ~9x), qualidade e tier **por número**, webhook fields (`message_template_status_update`, `phone_number_quality_update` — o monitor cego), e as tarifas pós-01/10/2026.
- **Baileys/Evolution**: ciclo de vida de instância e sessão, eventos (`CONNECTION_UPDATE` — o que falta assinar), o que causa banimento, consumo de RAM por instância.

**n8n (a peça menos governada)**
- Error workflows e `errorWorkflow` por fluxo; `retryOnFail`/`onError` por nó (a diferença entre os nós Cloud e Evolution hoje); export/import de workflows via API (o backup que não existe); expressões entre nós (por que renomear nó quebra); retenção e redaction de execuções (o item LGPD).

**Front (React/Supabase)**
- `strictNullChecks` na prática de migração incremental; Realtime channels e seus limites no plano gratuito; envs de build time vs runtime (por que rotação de chave exige redeploy); headers de segurança (CSP, X-Frame-Options) e cache immutable — o que o `vercel.json` novo vai declarar.

**Infra (o chão)**
- Docker Compose + Traefik: redes internas vs portas publicadas (a correção do `0.0.0.0` é exatamente isso); pinagem de imagem.
- Firewall (painel Hostinger e ufw) — e a ordem snapshot-antes-de-firewall.
- DNS e e-mail: SPF/DKIM/DMARC (`p=none` → `rua=` → `quarantine`), reputação de domínio novo.
- Backup e DR de verdade: a diferença entre "existe backup" e "restore ensaiado com tempo medido" — o sistema hoje não tem nem um nem outro para o banco.

**Operação de um SaaS solo**
- Runbooks: rotação de cada um dos ~35 segredos, restore, "zerar banco = zerar Asaas + inventariar Evolution".
- O placar honesto do estado atual (`90-integracao.md §Consolidação`) e o caminho mínimo de 10 passos antes de barbearias reais — itens 1–5 são o piso; o item 1 (uma mensagem de teste real) custa minutos e destrava todos os outros.

---

*Fim da aula. Este documento envelhece junto com os relatórios de 2026-09-05 que o fundamentam — o drift em curso (~2 mudanças manuais/semana no banco, workflows editados ao vivo) invalida os detalhes em semanas. As decisões e os porquês, que são o que a aula ensina, envelhecem bem mais devagar.*
