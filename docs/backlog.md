# Backlog — achados durante testes e auditoria

Registro vivo do que foi identificado mas **não** corrigido, para não se perder
em conversa. Ordenado por risco dentro de cada bloco. Última revisão:
2026-07-29.

Consultável pelo grafo: `graphify query "backlog"` ou `graphify explain "<item>"`.

---

## Segurança

### View `client_package_saldo` é SECURITY DEFINER
Advisor do Supabase classifica como **ERROR**. A view está em `public`, logo
exposta via PostgREST, e por ser SECURITY DEFINER ignora o RLS de quem
consulta — qualquer usuário autenticado pode ler saldo de pacote de qualquer
salão. Hoje não é alcançável pela interface (nenhuma tela usa), mas é
alcançável pela API com a chave anon.

Correção: `alter view client_package_saldo set (security_invoker = on);`

### Rotacionar `EVOLUTION_API_KEY`
A chave foi exposta em texto puro num print durante os testes de 2026-07-29, e
ficou no histórico do PowerShell. É a credencial de administração do servidor
Evolution — permite criar, apagar e ler instâncias de WhatsApp de todos os
salões. Trocar no servidor e atualizar o secret no Supabase.

### Proteção contra senhas vazadas desativada
Supabase Auth pode checar senhas contra o HaveIBeenPwned. Está desligado.
Aviso de nível WARN no advisor.

---

## Correção de comportamento

### ~~Fluxo n8n de lembretes ignora `agent_paused`~~ — CORRIGIDO
Corrigido em 2026-07-30 no workflow `CRM Salão - Lembretes de Agendamento`
(id `DW0nq1Jyp9xeOJwm`), que segue **inativo** — ativar é decisão do dono.

As três correções:

1. **Handoff respeitado.** A busca da conversa foi movida para antes do envio, e
   um IF novo (`Agente Pausado? (Lembrete)`) consulta `agent_paused`. Se o dono
   assumiu, o lembrete é suprimido e `lembrete_enviado` **não** é marcado — se
   ele devolver ao agente ainda dentro da janela de 55–65min, o próximo ciclo
   tenta de novo.
2. **Ordem invertida.** `Marcar lembrete_enviado` passou a rodar **antes** do
   envio. Trade-off explícito: se o envio falhar, o cliente perde um lembrete;
   na ordem anterior, se o update falhasse ele receberia o lembrete a cada 10
   minutos. Perder um é muito menos grave que bombardear.
3. **Telefone confiável.** O envio usa o `contact_phone` da conversa — o número
   real que o WhatsApp usa — caindo no número montado (`'55' + dígitos`) só
   quando o cliente nunca conversou. Resolve o caso do número antigo sem o 9.

Como a busca da conversa mudou de posição, as referências a `$json` nos nós
seguintes foram trocadas por `$('Buscar Conversa (para log)')`, senão leriam a
saída do nó errado.

**Não verificado em execução:** o fluxo nunca rodou. A primeira execução real é
a validação. O nó `Buscar Conversa (para log)` casa por
`contact_phone like '%<últimos 8>'`, escopado por `salon_id` — dois contatos do
mesmo salão terminando nos mesmos 8 dígitos casariam com o primeiro.

### `whatsapp/index.ts` escolhe salão arbitrário sem `salonId`
Em `supabase/functions/whatsapp/index.ts`, quando `body.salonId` não vem, a
consulta faz `.limit(1).maybeSingle()` e pega um vínculo qualquer. O comentário
logo acima diz por que isso é errado. Para dono de rede com várias unidades,
uma chamada sem `salonId` pode conectar, desconectar ou consultar status da
unidade errada.

Saídas: exigir `salonId` (400 sem ele), ou aceitar o fallback só quando o
usuário tem exatamente um vínculo.

---

### ~~`/web` e `/conexao` são alcançáveis pelo barbeiro~~ — CORRIGIDO
Verificado em 2026-07-29 logando como barbeiro (Giova), corrigido em 2026-07-30.
`/web` estava sob `RequireAuth` sem guard de papel e `/conexao` no grupo comum
do `AppLayout`, então o barbeiro chegava nas duas telas digitando a URL.

Nunca foi vazamento de dados — `whatsapp_conversations: gestor` exige
`private.is_manager(salon_id)` e a edge function filtra por papel. Era falha de
interface: casca vazia com botão que sempre falharia.

Correção: novo `RequireManager` (espelhando `RequireNetworkOwner`), usando o
`isManager` que já existia no `SalonContext`. Verificado que o dono continua
acessando as duas rotas.

### ~~Editar comissão de membro existente~~ — CORRIGIDO
Corrigido em 2026-07-30. Edição inline na lista da aba Equipe (ícone de
porcentagem), seguindo o padrão que já existia para editar e-mail de convite.
Aceita vazio como "sem comissão" (o dono que não tira percentual de si mesmo),
valida a faixa 0–100, e salva com Enter. Verificado definindo 45% num
profissional que estava sem percentual.

### ~~Cliente órfão quando o agendamento falha por sobreposição~~ — CORRIGIDO
Reproduzido em 2026-07-29 e corrigido em 2026-07-30. Em `NewAppointmentModal`,
o cliente era criado antes do insert do agendamento; quando a constraint
`appointments_sem_sobreposicao` recusava (`23P01`), o cliente permanecia gravado
sem nenhum agendamento.

Correção aplicada: compensação no `catch` — o cliente criado **naquela
tentativa** é apagado quando a reserva falha. Um cliente que já existia não é
tocado. Verificado reproduzindo o cenário: reserva recusada, zero cliente órfão,
e o caminho felizsegue criando cliente + agendamento juntos.

Também corrigido no mesmo trecho: a busca por nome usava `.maybeSingle()`, que
estouraria com dois clientes homônimos no salão e mostraria "não foi possível
criar a reserva" sem explicar. Passou a usar `.limit(1)`.

**Pendência menor:** a compensação não é atômica — se o `delete` também falhar
(rede caindo no meio), o órfão volta a existir. A solução robusta é uma RPC no
banco que faça os dois inserts numa transação. Vale quando houver outro chamador
além desta tela.

**Também vale rever:** o cliente é casado por **nome** (`ilike`), não por
telefone. `telefone_norm` é a chave confiável — casar por nome junta dois
clientes homônimos e separa o mesmo cliente que digitou o nome diferente.

### Mensagem de comissão engana quando não há vendas
No Financeiro, com zero vendas no período, aparece: *"Nenhuma comissão no
período (defina o percentual de comissão do profissional para calcular)"* —
mesmo quando o percentual **está** definido (verificado com a Giova, 60%). A
mensagem atribui à configuração o que na verdade é ausência de venda, e manda
o usuário mexer numa tela que não tem esse ajuste (ver item da comissão).

Caminho: separar as duas causas — sem venda no período vs. profissional sem
percentual.

### ~~Sessão expirada aparecia como "conta sem vínculo"~~ — CORRIGIDO
Reproduzido e corrigido em 2026-07-30. O `SalonProvider` engolia qualquer erro
da consulta e assumia "usuário sem unidades", então um JWT vencido levava o dono
a ler *"Sua conta ainda não está vinculada a um salão. Fale com o administrador
do sistema"* — sendo ele o administrador. Parecia perda de dados.

Correção: `sessaoExpirou()` reconhece `PGRST303`; o provider renova a sessão e
repete a consulta, e só desloga se o refresh token também venceu. 6 testes
cobrem o que **não** pode ser confundido com sessão expirada (`42501`, `23505`,
`PGRST301` — este não se resolve renovando).

### ~~Link de redefinição de senha caía no login~~ — CORRIGIDO
O Supabase descarta o `redirectTo` quando a URL não está na lista de permitidas
do projeto e manda para a Site URL, sem avisar. O usuário clicava no e-mail e
via a tela de entrar.

Corrigido em 2026-08-01 em três camadas:
- desvio automático para `/redefinir-senha` quando o retorno traz `type=recovery`
- link vencido (`otp_expired`) leva para pedir outro, **com explicação**
- **fluxo por código de 6 dígitos**, que não depende de redirecionamento nenhum —
  é o caminho principal agora, e o único confiável no celular, onde o link abre
  num navegador diferente do que a pessoa estava usando

A primeira versão do desvio falhou: lia `window.location.hash` dentro do
componente, mas o supabase-js consome o fragmento de forma assíncrona e o
React Router descarta o resto. Passou a capturar no carregamento do módulo.

**Ainda depende de configuração:** o template "Reset Password" precisa incluir
`{{ .Token }}`, e a lista de URLs permitidas deve ter o domínio de produção e o
localhost.

### ~~Barbeiro não tinha caminho para a tela de Clientes~~ — CORRIGIDO
A rota `/clientes` respondia, mas o item não aparecia no menu (`somenteGestor`).
O banco sempre permitiu: a policy chama-se `clients: membros cadastram` e libera
`INSERT` a qualquer membro do salão, e a leitura devolve os que ele criou ou
atendeu.

Corrigido em 2026-08-01 removendo o `somenteGestor` do item. Decisão de produto
confirmada: o barbeiro cadastra cliente novo na cadeira, e é para isso que existe
`clients.created_by`.

## Serviço de e-mail não serve para produção
O projeto usa o SMTP embutido do Supabase (`noreply@mail.app.supabase.io`), que
é limitado a poucas mensagens por hora e não é destinado a produção. Com 200
barbearias, recuperação de senha e convite de equipe não funcionam.

Além do volume, há um intervalo mínimo entre envios para o mesmo endereço
(observado em 2026-08-01: `429 over_email_send_rate_limit`, "you can only request
this after 29 seconds") — independente do limite por hora, que é ajustável em
**Authentication → Rate Limits**.

**Bloqueador de lançamento.** Antes da primeira barbearia pagante: configurar
SMTP próprio (Resend, Brevo) e, junto, domínio próprio — hoje o e-mail sai de um
endereço pessoal e o CRM vive num subdomínio da Vercel.

### ~~Seletor de profissional oferecia colegas ao barbeiro~~ — CORRIGIDO
Em `NewSaleModal`, o seletor listava todos os profissionais do salão. A policy
`orders: acesso conforme papel` exige `professional_id` entre os do próprio
usuário para quem não é gestor — então o barbeiro que escolhesse um colega
veria *"Não foi possível completar a venda"*, sem pista da causa.

Corrigido em 2026-08-01: quem não é gestor só se enxerga no seletor.

**Não reproduzido no cenário real:** a barbearia de teste tem um profissional
só, então o filtro dá o mesmo resultado com ou sem a correção. Validar quando
houver dois barbeiros na mesma unidade.

## Funcionalidade ausente

### ~~Dono não consegue editar dados da barbearia~~ — CORRIGIDO
Descoberto e corrigido em 2026-07-30. `nome`, `endereco`, `telefone` e
`horario_funcionamento` eram gravados **apenas** pelo wizard do painel
administrativo (`SalonWizard.tsx:115`) e nunca mais podiam ser alterados. Dos
campos de `salons`, o único editável era `meta_faturamento_mensal`.

Gravidade: o agente de IA só oferece horários dentro de `horario_funcionamento`.
Uma barbearia que mudasse o horário — feriado, passar a abrir sábado — teria de
pedir para alguém editar o banco. Com 50 clientes isso não escala.

Correção: nova tela `/configuracoes` (`ConfiguracoesPage`), sob `RequireManager`,
com item no menu de Gestão. O RLS já permitia (`salons: gestor altera` com
`private.is_manager(id)`), então não houve migration. Adicionado
`desserializarHorario` ao lado do `serializarHorario` que o wizard já usava, para
os dois lados compartilharem o formato.

Verificado: carrega o que o wizard gravou, salva alteração de horário e telefone,
fecha e reabre dia, e recusa dia com fechamento antes da abertura sem gravar.

Durante a verificação apareceu um defeito próprio: `recarregarUnidades()` põe o
`SalonProvider` em `loading`, o `RequireManager` desmonta a tela e ela volta com
o estado zerado — o aviso de "Salvo" desaparecia. Passou a recarregar só quando
o **nome** muda, que é o único campo que outra tela exibe.

### Wizard de criação não pede comissão nem jornada
`SalonWizard` cria salão, dono, profissional e serviços, mas não popula
`professional_schedules` nem `comissao_percentual`. A jornada tem fallback
documentado (cai no horário do salão); a comissão não tem.

### Pacotes de crédito e planos não têm interface
7 tabelas com RLS e policies completas (`packages`, `package_items`,
`client_packages`, `client_package_credits`, `package_usages`, `plans`,
`subscriptions`) e **zero** referências em `src/`. Não podem ser testados pelo
CRM.

### Integração de cobrança (Asaas) não existe
`subscriptions` tem `asaas_customer_id` e `asaas_subscription_id`, mas nenhuma
linha de código menciona Asaas — nem no front, nem nas edge functions. Schema
pronto, integração ausente. Também não há criação de `subscriptions` no
onboarding.

---

## Infraestrutura e manutenção

### Migrations estão fora do pipeline de deploy
Levantado em 2026-08-02. A cadeia `push → GitHub → CI → Vercel` funciona e é
automática: o CI roda typecheck, lint, vitest e pgTAP, e o `vercel[bot]` publica
a produção sozinho a cada push na `main`. **O banco não participa disso.**
Nenhum passo aplica migration em produção — hoje isso é feito à mão.

O risco é concreto e assimétrico: o front chega em produção em ~1 minuto, a
migration só quando alguém lembra. Um deploy pode publicar uma tela que chama
uma função que não existe no banco — foi exatamente o caso da aba Marketing, em
que a `0025` precisou ser aplicada manualmente antes do push valer alguma coisa.

Caminho: um job no CI, após o `estatico` e o `banco` passarem, rodando
`supabase db push` com `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` nos
secrets do repositório. Depende de resolver antes o formato dos arquivos (item
abaixo), senão o `db push` não reconhece as migrations existentes. Enquanto não
existir, **aplicar a migration antes do push** é regra, não preferência.

### `0023_permissoes_de_tabela` nunca entrou no histórico de produção
Instância concreta da divergência descrita abaixo. O ledger
`supabase_migrations.schema_migrations` vai de `0021_instance_name_unico` direto
para as entradas de marketing de 2026-08-02 — não há linha para a `0023`. Na
prática os GRANTs existem em produção (foi de lá que a migration foi escrita,
para o dev local reproduzir), então não há efeito funcional; o problema é o
ledger não descrever o repositório. Some junto com o item abaixo, no `migration
repair`.

### ~~`VITE_SUPABASE_ANON_KEY` da Vercel quebrava o login em produção~~ — DIAGNOSTICADO
Achado em 2026-08-02, investigando "não consigo entrar com meus logins de teste".
Aconteceu duas vezes seguidas, por dois motivos diferentes:

1. **Chave vencida** — o bundle publicado carregava uma anon key antiga e o
   Supabase respondia `401 Invalid API key`. Nenhuma tentativa chegava a ser
   avaliada como senha errada; nos logs de auth não havia falha de credencial
   nenhuma vinda do domínio publicado.
2. **Chave copiada do campo mascarado** — na correção, o valor publicado virou
   `eyJhbGci` seguido de **200 bolinhas** (`•`, U+2022): 8 caracteres reais e o
   resto do desenho da tela. O navegador passou a recusar a requisição com
   *"Failed to read the 'headers' property from 'RequestInit': String contains
   non ISO-8859-1 code point"*, porque header HTTP é Latin-1.

O código agora barra os dois casos na subida (`src/lib/credenciaisSupabase.ts`),
com mensagem que nomeia a causa. Fica aqui como registro operacional: variável
de ambiente da Vercel é embutida em build time, então **toda troca exige
redeploy**, e a chave precisa ser revelada antes de copiar.

Vale considerar migrar para a publishable key (`sb_publishable_...`), que
rotaciona de forma independente e não é um JWT gigante mascarado na tela.

### Vercel MCP não enxerga o projeto
O deploy funciona pelo GitHub App (`vercel[bot]`, Production a cada push na
`main`), mas o conector MCP da Vercel devolve `list_projects` vazio e 404 no
`get_project`, mesmo com o time correto (`castrocollin01-6426s-projects`, o
mesmo da URL publicada). Consequência: dá para confirmar o deploy pela API de
deployments do GitHub, mas não para ler build log nem erro de runtime pela
Vercel. Provável escopo/permissão do conector. Reconectar quando for preciso
depurar um build quebrado.

### Migrations do repositório não seguem o formato do CLI
Os arquivos são `0001_init.sql`; o Supabase CLI exige
`<14 dígitos>_nome.sql`. O histórico real em produção tem 26 entradas com
nomes diferentes dos arquivos. Consequência: `supabase db push` não faz o que
se espera, e as 20 primeiras migrations **não são idempotentes** (`create
table` puro) — se algum dia o CLI passar a reconhecê-las, tentaria reaplicar e
falharia no meio.

Caminho: renomear para o formato de timestamp, casar com o histórico remoto via
`supabase migration repair --status applied`, e passar a usar
`supabase migration new`.

### ~~Divergência inversa: `profiles` existe no repositório, não em produção~~ — CORRIGIDO
`0002_profiles_and_rls.sql` cria `profiles`, removida em produção pela migration
`remove_profiles`. Corrigido em 2026-07-30 pela `0024_remove_profiles.sql`, que
derruba a tabela e a função `auth_salon_id()` — substituída pelas funções do
schema `private` na `0015`.

### ~~Permissões de tabela ausentes das migrations~~ — CORRIGIDO
Descoberto em 2026-07-30 lendo o log do CI. Produção tem GRANT completo para
`anon`, `authenticated` e `service_role` nas 28 tabelas de `public` — padrão do
Supabase — e isso **nunca entrou nas migrations**. Um banco criado do
repositório nascia sem as permissões.

O sintoma engana: em vez de "zero linhas" pelo RLS, o Postgres devolve
`permission denied for table clients`. Foi onde os testes de pgTAP pararam.

Corrigido pela `0023_permissoes_de_tabela.sql`, que concede os privilégios e
define `alter default privileges` para tabelas futuras não repetirem o problema.

**Padrão a observar:** esta é a terceira forma de divergência entre repositório
e produção (tabelas ausentes → `0022`, tabela a mais → `0024`, permissões
ausentes → `0023`). Todas nasceram de mudanças aplicadas direto no banco. O
conserto de raiz continua sendo alinhar o fluxo de migrations com o CLI.

### Sem Docker na máquina de desenvolvimento
Bloqueia `supabase db start`, `supabase test db` (os testes de RLS em pgTAP) e
`supabase db pull` (diff de schema real). Hoje o pgTAP só roda no CI, e nunca
rodou.

### Ordem invertida no histórico de migrations
`0021_instance_name_unico` foi registrada com timestamp `20260730005330`,
depois de `0022_sincroniza_schema_producao` (`20260729000100`). Sem impacto
funcional — ambas aplicadas — mas inconsistente para quem ler o histórico.

### `oxlint` analisa `.claude/`
Um warning vem de `.claude/skills/design-system/scripts/generate-tokens.cjs`,
que não é código da aplicação. Ruído no CI. Resolve com `ignorePatterns` no
`.oxlintrc.json`.

### Cobertura de testes rasa
Cobertos: `csv`, `appUrl`, contrato de nomeação das instâncias, isolamento
multi-tenant (pgTAP, ainda não executado). Sem cobertura: componentes, hooks
de dados, e todo o fluxo financeiro (caixa, comanda, comissão, meta).

---

## Derivado da visão do produto

Itens que vêm de [`visao.md`](visao.md) e **não existem em nenhuma forma** no
código. Não são defeitos — é escopo declarado ainda não construído.

### Nada aplica os planos (gating por Básico/Pro)
Preço, trial de 7 dias e diferença de funcionalidade entre Básico (R$ 197) e Pro
(R$ 299) estão definidos, e o schema (`plans`, `subscriptions`, campos do Asaas)
reflete isso. Falta tudo: checkout, criação de assinatura no onboarding,
verificação de plano ativo, e bloqueio das funções Pro para quem está no Básico.

Também `[ABERTO]`: o que acontece na inadimplência.

### Tom de voz do agente configurável pelo dono
O dono deve escolher no cadastro como o agente fala com o cliente. Nenhuma
tabela guarda essa preferência, e o prompt do agente no n8n é fixo.

### Aviso ao dono sobre o estado emocional do cliente
Quando o agente escala uma conversa, deve informar ao dono em que estado o
cliente está (irritado, normal…). Hoje só existe o booleano `needs_human`.

### Permissões configuráveis por salão
A visão pede que o dono ajuste: poder do gerente, e quem pode criar/modificar
agendamento (todos, ou só ele). Hoje isso é fixo nas policies de RLS — tornar
configurável exige mover parte da decisão para dados.

### Ciclo de no-show e avaliação no Google
Sequência descrita na visão, quase toda ausente:
- 1h antes: lembrete *(Pro)* — parcialmente coberto pelo workflow inativo
- 10 min antes: pedir confirmação de chegada *(Pro)* — **não existe**
- 1h depois do horário: se a comanda está aberta, cancelar, com opção de o
  barbeiro reverter — **não existe**
- após fechar a comanda: pedir avaliação no Google com link — **não existe**

### Recuperação de clientes antigos (Pro)
Reativar cliente que parou de frequentar. Não existe. Desenhado como parte da
aba Marketing — ver [`docs/marketing.md`](marketing.md).

### `orders` não tem coluna de desconto
Nem `orders` nem `order_items` guardam desconto. Hoje isso não aparece porque
nenhuma tela concede desconto, mas bloqueia o cupom de campanha da aba
Marketing, que precisa amarrar o desconto concedido à venda para medir o
faturamento gerado. Decisão pendente junto: com desconto na comanda, o barbeiro
perde comissão proporcional ou a barbearia absorve? `commissions` é calculada
sobre o item.

### Fuso horário do salão está fixo no código
`professional_schedules.hora_inicio` é hora local da barbearia (`time`), mas
`appointments.data_hora_inicio` é `timestamptz`. Cruzar os dois exige um fuso, e
o schema não tem nenhum — sem isso o Postgres usa o da sessão (UTC no Supabase)
e as faixas de horário saem 3 horas deslocadas. A migration `0025` resolveu com
`private.fuso_do_salao()` devolvendo `America/Sao_Paulo` fixo. Vira coluna em
`salons` quando existir salão em outro fuso. Afeta o segmento de horário ocioso
da aba Marketing e qualquer relatório futuro por faixa de hora.

### Opt-out de campanha depende do fluxo n8n
A aba Marketing ([`docs/marketing.md`](marketing.md)) exige que o cliente
consiga sair da lista respondendo no WhatsApp. Reconhecer essa intenção e gravar
`client_marketing.opt_out` é do agente no n8n, não do CRM — e não basta casar a
palavra "SAIR" ("não quero mais receber isso", "para de mandar promoção").
Enquanto não existir, a trava é só documental e o descadastro é manual pelo
dono. É requisito de LGPD, não conforto.

### Site institucional ligado ao Google (Pro)
Site com botão direto para o WhatsApp, vinculado ao perfil do Google onde as
pessoas localizam o salão. Não existe.

### Fronteira do agente: o que ele nunca deve fazer
`[ABERTO]` na visão, e é a definição mais importante que falta. Sem ela não há
como testar o agente contra abuso, nem limitar o que ele promete ao cliente.

## Dívida de qualidade

### `src/App.tsx` / shell de rotas com coesão 0,06
A mais baixa do grafo, 61 nós. É onde tudo se cruza sem estrutura interna.
Refatoração de conforto, não de risco.
