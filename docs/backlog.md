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

### Divergência inversa: `profiles` existe no repositório, não em produção
`0002_profiles_and_rls.sql` cria a tabela `profiles`, removida em produção pela
migration `remove_profiles`. As funções `auth_salon_id()` e afins também não
existem mais (sobraram as quatro em `private`). Um banco limpo construído do
repositório sai diferente de produção.

Falta uma `0023` que remova `profiles`, senão o CI testa um schema que
produção não tem.

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
Reativar cliente que parou de frequentar. Não existe.

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
