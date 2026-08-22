# Backlog — o que está aberto

Só o que **não** foi resolvido. O que já foi corrigido mora em
[`historico.md`](historico.md), junto com o motivo e a lição — material que
vale guardar, mas que atrapalhava quem vinha aqui procurar o que fazer.

Separados em 2026-08-16, quando este arquivo passou de 800 linhas e 41% dele
era passado.

Para o retrato de hoje, ver [`estado-do-projeto.md`](estado-do-projeto.md).
Consultável pelo grafo: `graphify query "backlog"`.

---

## Segurança

### Proteção contra senhas vazadas desativada — exige plano Pro
Supabase Auth pode recusar senha que já apareceu em vazamento, comparando com o
HaveIBeenPwned por *k-anonymity* (só os 5 primeiros caracteres do hash saem do
servidor; a senha nunca é enviada). Está desligado, e é um WARN do advisor.

**Não é "um clique":** a documentação diz que o recurso é do **plano Pro** para
cima, e o projeto está no Free. Ligar significa assinar.

Onde fica quando houver plano: *Authentication → Attack Protection*.

**Reclassificado como fora da v1** em 2026-08-02. Hoje as contas são criadas
pelo painel administrativo com senha temporária aleatória de 14 caracteres
(`crypto.getRandomValues`) e **não existe cadastro aberto** — ninguém escolhe a
própria senha na entrada. O risco aparece quando o dono troca para algo fraco
depois. Revisitar quando o projeto subir para Pro, o que provavelmente vai
acontecer por limite de banco e de e-mail antes de acontecer por isto.

---

## Correção de comportamento

### ⚠️ Editar workflow no n8n não publica
Pegadinha operacional, ao lado de "migration não está no pipeline". As
alterações via API vão para o **rascunho**; o agendamento ativo continua
rodando a **versão publicada**. Em 2026-08-02 isso custou tempo: corrigi um
defeito, reexecutei, e o erro continuou idêntico — porque o que rodou foi a
versão antiga. Só percebi comparando os parâmetros na saída da execução.

**Depois de alterar qualquer fluxo, publicar.** E conferir o resultado pela
execução, não pelo editor.

### O lembrete pergunta se o cliente confirma, e ninguém registra a resposta
Achado em 2026-08-02, revisando o fluxo. A mensagem termina com *"Você confirma
que vai poder vir?"* — mas nada processa a resposta. O cliente responde "sim" e
aquilo cai no fluxo principal como conversa comum; o agente não sabe que existe
uma confirmação pendente, e **`appointments.status` nunca vira `confirmado`**.

O status existe na constraint do banco e no tipo `AppointmentStatus`, e **nenhum
código em lugar nenhum o atribui** — é um estado morto.

Consequência: o lembrete reduz falta por lembrar, que já é a maior parte do
ganho, mas o dono não consegue olhar a agenda e ver quem confirmou. E a
"confirmação 10 min antes" da visão (v2) depende exatamente dessa peça.

**Feito em 2026-08-09** no fluxo principal (`rJO1n7cFeNDIJyB5`), publicado:

- ferramenta **Confirmar Presenca**, escrevendo pela view `agendamento_local` —
  a mesma do cancelamento, para o retorno já trazer `data_local` e `hora_local`
- filtro `status = 'agendado'` no update: sem ele, confirmar um horário já
  cancelado o **ressuscitaria** na agenda
- seção *QUANDO O CLIENTE CONFIRMA QUE VEM* no prompt, logo após CANCELAR E
  REAGENDAR — é ali que o agente decide o que fazer com a resposta

Correção de registro: `confirmado` **não** era estado morto. O botão em
`AppointmentDetailModal.tsx:104` sempre gravou; o que faltava era o agente fazer
isso sozinho ao ler a resposta do lembrete.

**Não verificado em conversa real.** O teste é responder "confirmo" a um lembrete
e ver `appointments.status` virar `confirmado`.

### `whatsapp/index.ts` escolhe salão arbitrário sem `salonId`
Em `supabase/functions/whatsapp/index.ts`, quando `body.salonId` não vem, a
consulta faz `.limit(1).maybeSingle()` e pega um vínculo qualquer. O comentário
logo acima diz por que isso é errado. Para dono de rede com várias unidades,
uma chamada sem `salonId` pode conectar, desconectar ou consultar status da
unidade errada.

Saídas: exigir `salonId` (400 sem ele), ou aceitar o fallback só quando o
usuário tem exatamente um vínculo.

---

### Mensagem de comissão engana quando não há vendas
No Financeiro, com zero vendas no período, aparece: *"Nenhuma comissão no
período (defina o percentual de comissão do profissional para calcular)"* —
mesmo quando o percentual **está** definido (verificado com a Giova, 60%). A
mensagem atribui à configuração o que na verdade é ausência de venda, e manda
o usuário mexer numa tela que não tem esse ajuste (ver item da comissão).

Caminho: separar as duas causas — sem venda no período vs. profissional sem
percentual.

## Funcionalidade ausente

### Instância de WhatsApp própria para os alertas do produto
`canal_de_alertas` (migration `0071`) já centraliza por onde auditoria e
feedback saem, e os dois fluxos leem de lá — mas a linha **ainda aponta para a
instância da Curitiba**, que é de uma cliente.

Enquanto for assim, se a Curitiba cancelar, trocar de número ou o WhatsApp dela
cair, você para de receber auditoria e feedback **em silêncio**. É circular: o
alerta que avisaria da queda depende do que caiu.

Falta criar a instância na Evolution API, ler o QR com um número seu e rodar um
`update` de duas colunas. Nenhum fluxo precisa ser editado. Passo a passo no
painel da área de trabalho.

### Fidelidade e clube de assinatura do cliente final
Aparecem na descrição do Trinks e do AppBarber e não temos nenhum dos dois.
Fidelidade é o que traz o cliente de volta à mesma barbearia; o clube
("corte ilimitado por R$ X/mês") é receita recorrente **para o barbeiro**, o que
muda o argumento de venda: o produto deixa de ser custo e vira faturamento.

### Fluxo n8n da política de atraso está construído mas **desligado**
`CRM Salao - Politica de Atraso` (id `67oZqGOIoKO6pAeQ`) existe e teve o wiring
verificado com dados simulados, mas está inativo — e enquanto estiver, a
política de atraso **não existe para o cliente**.

Ligar manda WhatsApp para clientes **reais** da Curitiba, a única barbearia com
WhatsApp conectado. Antes disso faltam duas coisas: conferir na tela que as
credenciais dos três nós ficaram preenchidas (o criador avisou que o nó HTTP foi
pulado na atribuição automática), e fazer um teste sem terceiros — WhatsApp da
El Guardians conectado, cliente com o número do dono, agendamento 15 minutos no
passado, fluxo rodado à mão.

Passo a passo em [`n8n-politica-de-atraso.md`](n8n-politica-de-atraso.md).

### ~~Pacotes de crédito e planos não têm interface~~ — OBSOLETO
As cinco tabelas de pacote (`packages`, `package_items`, `client_packages`,
`client_package_credits`, `package_usages`) **não existem mais** no banco —
conferido em 2026-08-17. E `plans` e `subscriptions`, que sobraram, hoje são a
espinha da cobrança pelo Asaas, com tela em `/assinatura`.

Fica registrado como aviso de leitura: item de backlog envelhece, e este ficou
meses acusando ausência de algo já removido.

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

### Recuperação de clientes antigos (Pro) — v3
Reativar cliente que parou de frequentar. Foi projetado e construído (fase 1) em
2026-08-02 e **removido na `0026`** para alinhar o projeto ao roteiro. O desenho
completo, as decisões e o que se aprendeu testando com dado real estão
preservados em [`docs/marketing.md`](marketing.md); o código está no histórico do
git. Reentra na v3.

Duas dependências que só apareceram construindo, e que precisam entrar no plano
quando isso voltar:

- **`orders` não tem coluna de desconto.** Nem `orders` nem `order_items`
  guardam desconto, então não há como amarrar o desconto concedido à venda e
  medir o faturamento gerado. Decisão de negócio pendente junto: com desconto na
  comanda, o barbeiro perde comissão proporcional ou a barbearia absorve?
  `commissions` é calculada sobre o item.
- **O opt-out depende do fluxo n8n.** Reconhecer que o cliente quer sair da
  lista é do agente, não do CRM, e não basta casar a palavra "SAIR" ("para de
  mandar promoção"). É requisito de LGPD — sem isso, não se envia campanha
  nenhuma.

### Não existe fuso horário do salão no schema
`professional_schedules.hora_inicio` é hora local da barbearia (`time`), mas
`appointments.data_hora_inicio` é `timestamptz`. Cruzar os dois exige um fuso, e
o schema não tem nenhum — sem isso o Postgres usa o da sessão (UTC no Supabase)
e qualquer agrupamento por faixa de hora sai 3 horas deslocado. A `0025` tinha
contornado com `private.fuso_do_salao()` fixo em `America/Sao_Paulo`, removida
junto com o Marketing na `0026`. Volta a importar assim que existir relatório
por horário — ou salão fora do horário de Brasília.

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

## Cobrança pelo Asaas

### O que está provado, e o que não está
`2026-08-03` — o ciclo inteiro foi exercitado no sandbox, com quatro
confirmações reais entregues pelo Asaas e gravadas em `asaas_eventos`:
assinar (`pendente` → `ativa`), cancelar, trocar de plano sem recorrência,
assinar de novo, e a **cobrança avulsa da diferença**, que aplicou o plano novo
e subiu o valor da recorrência. O rateio parcial foi conferido pela simulação
na própria tela: com 10 dias de um ciclo de 31 e diferença de R$ 102, previmos
R$ 32,90 antes de olhar e foi o que apareceu.

O que **não** está provado é o Pix. O sandbox não movimenta dinheiro, o QR que
ele gera não existe no arranjo Pix e nenhum banco o reconhece. Testar exige a
chave de produção — e aí o pagamento é real. Fica pendente até a decisão de
migrar.

Três achados que custaram tempo e não são óbvios:

- **"Recebido em dinheiro" não dispara webhook.** É baixa manual, não
  pagamento. Foi o que fez parecer, por horas, que a integração estava muda.
  Para confirmar pagamento no sandbox o caminho é `POST
  /v3/sandbox/payment/{id}/confirm`, ou o botão CONFIRMAR PAGAMENTO no painel.
- **Pagar o QR do sandbox falha com "saldo insuficiente"**, porque a conta
  estaria pagando a si mesma. Não é erro de integração.
- **Cobrança avulsa carrega o `externalReference` do salão** e casaria no
  filtro de fallback do webhook, ganhando um mês inteiro de acesso por pagar
  poucos dias de diferença. Por isso a troca de plano é tratada **antes** do
  caminho comum. Qualquer cobrança avulsa nova precisa da mesma atenção.

### ⚠️ ABERTO: El Guardians cobra R$ 5,00 por mês no Asaas

O teste foi pago com o valor mínimo. O banco já voltou para R$ 299, mas a
**recorrência criada no Asaas continua em R$ 5,00** — mudar `subscriptions.valor`
não alcança o que existe lá.

Enquanto a recorrência existir, ela gera uma cobrança de R$ 5 todo dia 19.

**Conserto:** Assinatura → **Cancelar**. O acesso segue até 19/09 (já pago) e as
cobranças futuras param. Não precisa reassinar — a barbearia é de teste.

### Curitiba: banco diz R$ 299, recorrencia no Asaas diz R$ 5
Aberto em 2026-08-09. Para o teste de pagamento real o `valor` da assinatura
foi baixado para R$ 5,00, e a recorrencia `sub_klx4z6d0xv9p83h4` foi criada no
Asaas com esse valor. O banco ja voltou para R$ 299; **o Asaas nao**, porque a
chave da API nao esta acessivel daqui.

Enquanto durar, uma cobranca gerada por aquela recorrencia sai por **R$ 5,00**.

Conserto: **Cancelar** e **Assinar agora** na tela de Assinatura. Cancelar apaga
a recorrencia la e limpa o `asaas_subscription_id`; assinar cria outra ja em
R$ 299. O cadastro do pagante e reaproveitado, entao nao duplica cliente.

Vale como padrao, nao como caso isolado: **valor de teste em producao precisa de
data para voltar**. Este quase virou cobranca de cinco reais por mes.

### `preco_unidade_rede` desproporcional
Básico 77 / Pro 157 contra 197 / 299 da unidade avulsa. Decisão de preço
pendente, não defeito.

### ⚠️ A landing promete cobrança por uso; o Asaas continua cobrando mensalidade fixa (2026-08-21)

A seção "Quanto custa" mudou de dois planos com mensalidade (Básico R$197 /
Pro R$299) para R$0,85 por agendamento confirmado, sem mensalidade e sem
taxa de setup — mudança pedida e confirmada pelo usuário. **Só a landing
mudou.** O sistema de assinatura de verdade continua exatamente como está
documentado acima nesta mesma seção: recorrência mensal fixa no Asaas,
`preco_unidade_rede`, o ciclo de cobrança provado em sandbox. Nada disso foi
tocado.

Enquanto durar essa diferença, qualquer pessoa que ler "sem mensalidade" na
landing e criar conta caminha para um sistema que, quando o teste grátis
acabar, vai tentar cobrar uma recorrência mensal fixa que a página dela nunca
mencionou — o oposto exato do que foi prometido.

**Isto não é dívida técnica pequena.** Migrar a cobrança real de mensal para
por-uso é: trocar o modelo de assinatura recorrente do Asaas por cobrança
avulsa medida (ou por um evento por vez, ou fechada no fim do mês), instrumentar
a contagem de agendamentos confirmados por barbearia, decidir o que acontece
com quem já está na assinatura mensal (migração forçada? os dois modelos
coexistindo?), e re-testar o ciclo inteiro que já foi provado em sandbox para
o modelo antigo. Antes disso acontecer, a landing e o produto real prometem
coisas diferentes — e essa lacuna precisa fechar antes de qualquer campanha
de tráfego pago apontar para a página nova.

## Agente de WhatsApp

### Agendamento fantasma — corrigido em 2026-08-04, falta reconfirmar
Nos dois primeiros testes reais por WhatsApp o agente respondeu **"já agendei
seu horário"** sem ter criado agendamento nenhum. É o pior erro possível: o
cliente aparece na barbearia e não há nada na agenda.

A execução gravada mostrou a causa, e não era a suspeita inicial. `Criar
Agendamento` **nunca foi chamada**. O agente chutou `"Saymon"` como
`professional_id` duas vezes (erro `invalid input syntax for type uuid`), foi
buscar o id certo, consultou disponibilidade — que voltou `[]`, ou seja, dia
livre — e anunciou que estava garantido. Com `maxIterations: 6`, as duas
chamadas desperdiçadas provavelmente esgotaram o orçamento e forçaram a
resposta final antes de marcar.

Três correções, todas publicadas:

- Seção **NUNCA AFIRME O QUE VOCÊ NÃO FEZ** no prompt: só dizer que marcou
  depois do sucesso de `Criar Agendamento`; lista vazia de disponibilidade
  significa dia livre, não agendamento feito.
- `maxIterations` 6 → 14. Um agendamento completo usa cinco ferramentas; seis
  iterações não cabem, e o que sobra quando o orçamento acaba é uma resposta
  inventada.
- Descrições de `$fromAI` dizendo que os ids são **UUID** e de qual ferramenta
  vêm.

Falta refazer o teste ponta a ponta e confirmar que o agendamento nasce.

### `saveDataSuccessExecution` estava em `none`
Execuções bem-sucedidas não eram gravadas, então o primeiro agendamento
fantasma não deixou rastro nenhum e não pôde ser diagnosticado. Ligado
(`all`, com progresso). **Rever antes de escalar**: gravar tudo cresce o banco
do n8n; o certo é manter durante os testes e reavaliar depois.

### O agente responde em Markdown, que o WhatsApp não entende
Ele respondeu com `**Corte masculino**`; o WhatsApp usa `*asterisco simples*`,
então o cliente vê os asteriscos. Regras de formato adicionadas ao prompt
(negrito simples, mensagens de 3-4 linhas, no máximo 5 itens ao listar).
Falta confirmar no celular.

### Nunca releu o horário de trabalho depois de achar o uuid
Na mesma execução, `Horário de Trabalho do Profissional` só foi chamada com o
nome (que falhou). O agente ofereceu 09:00 sem nunca ter lido os horários
cadastrados — acertou por coincidência. As regras 17 e 21 foram ajustadas para
corrigir o dado e chamar de novo, mas isso precisa ser verificado no teste.


## Rodapé da landing: canais de suporte reais (2026-08-18)

O rodapé novo lê os canais de `src/lib/contato.ts`, e hoje os três estão
`null` de propósito — número de WhatsApp de suporte, e-mail e Instagram não
existem oficialmente, e inventar um canal que ninguém atende é pior que não
ter. Enquanto isso, o rodapé mostra a frase dos Termos ("suporte por WhatsApp,
resposta em até 1 dia útil").

Quando os canais existirem, preencher `CONTATO` em `contato.ts` e eles
aparecem sozinhos. Fora do repositório: criar/definir o número de WhatsApp de
suporte e o e-mail (domínio), e decidir se haverá perfil de Instagram.

## Depoimentos reais para a landing (permanente)

`Depoimentos.tsx` continua com a lista vazia e a seção oculta. A regra está
documentada no arquivo: só entra depoimento real, com autorização por escrito
e número conferido com o dono. Coletar os primeiros com os clientes-piloto.

## Coletar os primeiros depoimentos reais (2026-08-19)

A seção de depoimentos está construída e testada (`Depoimentos.tsx`, padrão
adaptado da 21st.dev). Ela renderiza sozinha assim que houver o primeiro item
em `DEPOIMENTOS`. Falta só o conteúdo, que tem que ser real.

Mensagem para mandar para as barbearias-piloto:

  "Oi [nome], tudo certo? Tô montando a página do Club Cut e queria colocar
   sua opinião nela. Duas perguntas rápidas:
   1) O que mudou no seu dia depois que começou a usar?
   2) Tem algum número que você consegue tirar do sistema? (cortes no mês,
      faltas, quanto entrou) — pode ser aproximado, mas tem que ser real.
   Posso publicar seu nome e o nome da barbearia? Se preferir só o primeiro
   nome, sem problema."

O "sim" tem que vir por escrito (o print da conversa serve). Sem autorização,
não entra. Sem número conferido, entra só a fala — `resultado` é opcional.

## Prova falsificável na seção Franqueza (2026-08-19)

A landing tem o convite "Manda mensagem pro nosso número e pergunta [se é
robô]" pronto, mas ele só renderiza quando `CONTATO.whatsapp` deixa de ser
null em `src/lib/contato.ts`. É a prova mais forte disponível hoje e custa
zero: nenhum concorrente copia sem expor que o bot dele mente.

Depende de peça fora do repositório: um número de WhatsApp com o agente
rodando, apontado para uma barbearia de demonstração no n8n.

## Popup de WhatsApp na landing: agente de tira-dúvidas pronto no código, falta ativar (2026-08-22)

`WhatsAppPopup.tsx` já chama o agente de verdade: a mensagem digitada vai via
`POST` para `VITE_AGENTE_IA_URL` com `{ pergunta, sessionId }` (sessão gerada
uma vez por navegador e guardada em `localStorage`), e a resposta some no
painel como uma mensagem do bot — sem depender do `CONTATO.whatsapp` (esse
continua `null`; esse popup não é mais um atalho pro WhatsApp real, é o
próprio agente). Sem a variável de ambiente configurada, o painel mostra "em
breve" e desabilita o campo — a mesma regra de nunca prometer o que ainda
não existe.

Continua coordenado com o `CtaFixo` pela variável CSS `--cta-fixo-h` e por
`useCtaInlineVisivel` (ver `CtaFixo.tsx`).

O workflow do agente já existe no n8n: **"Landing - Agente de Tira-Dúvidas
(Popup)"** (`j2g3tdLZTlvs8sdP`) — webhook `POST /webhook/popup-agente-ia`,
limite de 30 perguntas por sessão por dia (tabela `popup_ia_limite_diario`,
via n8n Data Table, zero custo), modelo OpenRouter `:free`
(`nvidia/nemotron-3-ultra-550b-a55b:free`, confirmado `$0` de entrada e
saída via openrouter.ai/api/v1/models em 2026-08-22), prompt com
só fatos reais do produto (preço R$0,85/agendamento, sem mensalidade, sem
setup, teste de 14 dias, lembretes, confirmação, "Aura") e instrução
explícita de nunca inventar número ou recurso.

**Limite subiu de 8 para 30/sessão/dia** (2026-08-22, mesmo dia dos testes
reais): 8 era baixo demais e travou a própria sessão de teste no meio de uma
conversa real. Como o modelo é `:free` (custo zero), 30 continua seguro
contra abuso sem incomodar quem está de fato conversando.

**Feito em 2026-08-22:** credencial "OpenRouter" criada e conectada ao nó do
modelo, workflow testado (execução `9148`, resposta correta e sem dado
inventado) e **publicado**. Testado direto na URL de produção via `curl` —
responde de verdade:

```
POST https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/popup-agente-ia
{"pergunta":"Tem taxa de setup?","sessionId":"..."}
→ {"resposta":"Não, o Club Cut não cobra taxa de setup..."}
```

**Prompt reforçado com princípios de customer care/success** (mesmo dia):
reconhecer objeção antes de responder (nunca discordar de cara), fechar com
próximo passo só quando fizer sentido (não empurrar "teste grátis" em toda
mensagem), linguagem de barbeiro em vez de startup, admitir limite com uma
frase direta em vez de inventar. Testado com objeção real
("já uso caderno, pra que trocar?") e voltou reconhecendo o ponto antes do
fato — sem inventar nada. Republicado.

**Escalonamento para humano, com aviso automático** (mesmo dia): quando a
pessoa pede pra falar com alguém, parece frustrada, ou a dúvida é específica
demais, o agente pergunta o contato (WhatsApp/e-mail), e ao receber chama
duas ferramentas — `Salvar Pedido de Humano` (grava na tabela
`popup_pedidos_humano`: `session_id`, `pergunta`, `contato`) e
`Avisar no Telegram` (manda a mesma informação pro bot Telegram do dono, em
tempo real). Nunca promete prazo que não existe. Testado ponta a ponta
(execução `9176`): o agente reconheceu o pedido, salvou o contato, mandou a
mensagem real no Telegram, e confirmou pra pessoa sem inventar prazo.
Republicado.

Credencial "Telegram account" criada e conectada. Durante a montagem, uma
edição manual no editor do n8n resetou por baixo dos panos o `model` do nó
OpenRouter e o `resource`/`operation` dos dois nós de ferramenta, e a
`sessionKey` da memória perdeu o prefixo `=` de expressão (o que teria
quebrado o isolamento de sessão entre visitantes diferentes — todo mundo
cairia na mesma "conversa"). Tudo corrigido antes de publicar. **Lição:**
depois de qualquer edição manual no editor, reler o workflow via API antes
de publicar — o editor pode reescrever campos silenciosamente.

**Objeções cobertas no prompt hoje:** preço, "já uso caderno/agenda", "já
uso WhatsApp comum", desconfiança de automação, "parece complicado",
"sou só eu, não preciso", "e se travar no meio de um agendamento", fadiga
de concorrente (Trinks/AppBarber), segurança/LGPD (resposta restrita ao que
é verificável — isolamento por barbearia no Supabase — sem citar
certificação nenhuma que não existe), e pedido de humano.

**Só falta a Vercel**, fora do repositório:

1. **Vercel**: variável `VITE_AGENTE_IA_URL` =
   `https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/popup-agente-ia`
   (Production, e Preview se quiser testar em PR) e **redeploy** — o Vite
   embute a variável em build time, salvar sozinho não basta.
2. Depois do redeploy, testar uma pergunta real no popup do site e
   confirmar que a contagem em `popup_ia_limite_diario` sobe e que a 31ª
   pergunta do dia recebe a mensagem de limite em vez do agente.

### ⚠️ Latência alta quando o agente chama as duas ferramentas (2026-08-22)

Descoberto testando em produção: quando a pessoa pede humano e informa o
contato, o turno que chama `Salvar Pedido de Humano` + `Avisar no Telegram`
demora **~17 segundos** com o `nvidia/nemotron-3-ultra-550b-a55b:free` (é um
modelo de 550B parâmetros, mesmo sendo MoE com 55B ativos). Isso já causou
pelo menos uma falha visível no site ("Não consegui responder agora").

Tentei trocar por modelos `:free` menores pra ganhar velocidade. Nenhum
funcionou bem:

| Modelo | Resultado |
|---|---|
| `nvidia/nemotron-3-nano-30b-a3b:free` | Vazou o raciocínio bruto (chain-of-thought) como resposta final, sem chamar as ferramentas |
| `nvidia/nemotron-nano-9b-v2:free` | Respondeu vazio, não chamou as ferramentas |
| `meta-llama/llama-3.3-70b-instruct:free` | **Saiu do catálogo** — não existe mais na OpenRouter |
| `nvidia/nemotron-3-super-120b-a12b:free` | Erro interno de parsing (`Cannot read properties of undefined (reading 'message')`) |
| `google/gemma-4-26b-a4b-it:free` / `google/gemma-4-31b-it:free` / `z-ai/glm-5.2:free` | Nunca cheguei a testar o comportamento — bati rate limit da OpenRouter em todas as tentativas |

**Voltei pro `nvidia/nemotron-3-ultra-550b-a55b:free`** (o que já estava
publicado) — lento, mas o único confirmado confiável pra chamar as duas
ferramentas corretamente e responder de forma limpa.

**Achado paralelo, sem custo real:** o painel de uso da OpenRouter mostrou
`GPT-4.1 Mini` — um modelo pago, não `:free` — aparecendo no gráfico de uso
do dia. Bate com a janela em que uma edição manual no editor do n8n tinha
apagado o campo `model` do nó (ver o item de escalonamento acima): sem
`model` explícito, o node cai no padrão do pacote (`openai/gpt-4.1-mini`,
que a OpenRouter também serve). **Gasto total do dia ficou em $0,00** —
essas tentativas aparentemente falharam antes de gerar tokens cobráveis, o
que explica alguns dos erros estranhos vistos durante os testes. Já
corrigido: o campo `model` está fixo de novo, e a lição do item acima
(reler o workflow via API depois de editar manualmente no editor) cobre
isso.

**Em aberto:** achar um modelo `:free` mais rápido que se comporte bem com
tool-calling, ou aceitar os ~17s do Nemotron Ultra como custo da gratuidade.
Se for tentar de novo, espaçar os testes (o rate-limit de rajada da
OpenRouter — provavelmente por minuto — trava rápido em sequência de
testes, mesmo com o total do dia bem abaixo de qualquer cota diária).

### ⚠️ O agente tem teto de ~50 atendimentos por DIA, na conta inteira (2026-08-22)

Mensagem exata da OpenRouter, capturada na execução `9492`:

> `Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000
> free model requests per day`

O teto **não é por sessão nem por visitante** — é da conta, somando todo
mundo que usar o popup no dia. A trava de 30/sessão/dia da tabela
`popup_ia_limite_diario` protege contra uma pessoa sozinha abusar, mas não
protege contra o volume somado: ~50 mensagens no dia inteiro e o agente para
para todos os visitantes seguintes até virar o dia.

**Decisão (do usuário, 2026-08-22): ficar no grátis mesmo assim.** O custo
contínuo segue zero e o teto serve para a fase atual de testes. A alternativa
registrada, se um dia o volume justificar: um depósito único de US$ 10 na
OpenRouter sobe o teto para 1000/dia e **não é consumido** — modelos `:free`
continuam custando $0; basta existir crédito na conta.

**O que foi feito para a falha não mentir.** Antes, cota estourada derrubava
a execução, o webhook devolvia 500 e o site mostrava *"Não consegui responder
agora. Tenta de novo em instantes"* — mandando a pessoa repetir uma ação que
não ia funcionar por horas. Agora o nó do agente usa
`onError: continueErrorOutput`, e a saída de erro vai para **"Responder
Indisponível"**, que devolve 200 com o motivo real:

> "Foi mal — bati o limite de atendimentos automáticos de hoje. Não é você, é
> cota minha mesmo, e ela só volta amanhã. Enquanto isso, a seção de Dúvidas
> aqui do site cobre a maioria das perguntas."

Confirmado em produção com a cota de fato estourada: HTTP 200 e a mensagem
acima, em vez do 500. A mensagem genérica do front (`MENSAGEM_ERRO` em
`WhatsAppPopup.tsx`) continua existindo, mas agora como último recurso para
falha de rede de verdade — que é o único caso em que "tenta de novo" é um
conselho honesto.

**Efeito colateral conhecido, não corrigido:** `Atualizar Contagem` roda
antes do agente, então uma pergunta que morre na cota ainda consome 1 das 30
da sessão da pessoa. Injusto, mas pequeno perto de reordenar o fluxo.

### Agente do popup ganhou identidade: Aurora (2026-08-22)

Nome derivado da marca "Aura", que já assina o rodapé ("CRIADO PELA AURA")
e o programa de reconhecimento das barbearias — reaproveita o que já existe
em vez de inventar identidade nova. Aparece no cabeçalho do painel
(`WhatsAppPopup.tsx`), na saudação, e no `systemMessage` do agente no n8n
(se souber, apresenta-se como Aurora; sem enfeitar com história de origem
inventada). Testado em produção: pergunta "quem é você?" volta "Sou a
Aurora, do Club Cut. Em que posso ajudar?". Republicado.

### ⚠️ Vazamento de raciocínio bruto em produção, corrigido (2026-08-22)

Um usuário real recebeu como resposta o raciocínio interno cru do modelo
("The user wants details about the Aura program... I'll use
'session_419987275895' maybe...") em vez de uma resposta limpa — aconteceu
no turno em que o agente decide chamar as duas ferramentas de
escalonamento, exatamente o cenário mais pesado do prompt.

Causa provável: `maxTokens: 400` era baixo demais para esse modelo de
raciocínio (Nemotron Ultra) terminar de "pensar" e ainda sobrar espaço pra
resposta final — sem token sobrando, ele devolve o raciocínio truncado como
se fosse a resposta.

**Corrigido**: `maxTokens` subiu de 400 para 1500 no nó "Modelo OpenRouter
(grátis)". Testado duas vezes reproduzindo o cenário exato (pedir detalhes
do Aura + informar contato) — resposta limpa nas duas, ferramentas
chamadas certo (execução `9233`). Confirmado em produção. Republicado.

**Vale observar nos próximos dias** se o vazamento reaparece — se sim, o
problema não é só o limite de tokens, e a alternativa é achar um modelo
`:free` que não seja "reasoning model" por padrão (nenhum dos testados até
agora se qualificou, ver item acima).

### ⚠️ Aviso no Telegram falhando silenciosamente, corrigido (2026-08-22)

Achado revisando a execução real (`9240`) do item acima: o agente confirmou
"pedido registrado" pro usuário, mas o Telegram nunca chegou. A ferramenta
`Salvar Pedido de Humano` funcionou (linha gravada na tabela), mas
`Avisar no Telegram` **falhou** com `400 - can't parse entities: Can't find
end of the entity starting at byte offset 151` — o node usa `parse_mode`
HTML por padrão, e algum caractere no texto interpolado (pergunta/contato
vindos do `$fromAI`) quebrou o parser de entidades do Telegram. Como o erro
do tool acontece **dentro** do agente, ele segue e responde como se tivesse
dado certo — daí a resposta "registrado" sem o aviso real ter saído.

**Corrigido**: `parse_mode` do node zerado explicitamente
(`={{ '' }}`, formato que o validador aceitou — string vazia direta gerava
aviso de validação). Testado reproduzindo o cenário (execução `9243`):
Telegram recebeu a mensagem com sucesso (`ok:true`). Confirmado em
produção. Republicado.

**Lição:** um erro dentro de uma tool call não necessariamente aparece pro
usuário nem falha a execução do agente — ele pode responder como se tivesse
dado certo mesmo com uma das duas ferramentas falhando. Vale conferir a
execução real no n8n (não só a resposta do chat) quando o aviso não chegar.

## Marca do Club Cut (2026-08-19)

A marca virou componente único em `src/components/MarcaClubCut.tsx`, usado em
todas as telas. Antes cada uma desenhava o logo por conta própria com o ícone
`Scissors` do lucide — sete lugares, um glifo de biblioteca.

Pendências fora do repositório:

- Exportar PNGs da marca (192/512/1024) para `apple-touch-icon`, manifesto PWA
  e perfis sociais. O ambiente atual não tem conversor SVG instalado; dá para
  gerar com `npx @aspect-build/resvg` ou pelo próprio navegador.
- Não existe `site.webmanifest`. Quando existir, apontar os ícones e usar
  `#0D1512` como `theme_color`.


## Lembrete de 1h30 com botões — o que falta

Feito em 2026-08-21: janela mudou de 1h para 1h30 (n8n), e a resposta ao botão
passou a ser aplicada pela RPC `responder_lembrete`, chamada pela edge function
`whatsapp-webhook` (v6). O agente **não** vê o clique.

Falta, e nesta ordem:

1. **Meta:** aprovar `lembrete_hoje`. É o gargalo — sem template aprovado não
   há mensagem iniciada por nós na API oficial, e portanto não há lembrete.
2. **Supabase:** criar o segredo `N8N_LEMBRETE_RESPOSTA_URL` apontando para o
   novo webhook do n8n. Sem ele o banco é atualizado mas o cliente não recebe
   resposta nenhuma — confirma e fica no vazio.
3. **n8n:** trocar `Enviar WhatsApp (Lembrete)` pelo nó nativo com
   `sendTemplate`, e gravar o `wamid` devolvido em
   `appointments.lembrete_message_id`. **Sem esse passo o clique nunca é
   reconhecido** — a RPC casa pelo wamid, e ele não existirá.
4. **n8n:** fluxo novo, determinístico, que recebe de
   `N8N_LEMBRETE_RESPOSTA_URL` e só entrega o texto que veio decidido do banco,
   registrando em `whatsapp_messages`. Nenhum agente nele.
5. **n8n:** `Buscar Instância do Salão` ainda filtra `status = 'open'`
   (vocabulário da Evolution). Migrar para a view `conexoes_ativas`. As views
   do banco já foram (migrations 0088 e 0089); os fluxos do n8n não.

**Decidido em 2026-08-21:** a confirmação de chegada de 10 min antes deixa de
existir. O lembrete com botões já pergunta o mesmo, e ela só saia com a janela
de 24h aberta — chegava a quem já tinha respondido e sumia em silêncio para
quem não tinha, que era o único caso em que servia. Nós removidos do fluxo;
`appointments.confirmacao_enviada` fica no schema marcada como morta (migration
0087), porque `agendamento_local` a lista.


## Views migradas para `conexoes_ativas` — 2026-08-21

Migrations 0088 e 0089. As seis views que perguntavam `status = 'open'` agora
perguntam `conexoes_ativas.conectado`, e cada uma expõe `provedor`,
`phone_number_id` e `instance_name` — os fluxos do n8n continuam usando o
`instance_name` até serem migrados, e o que precisam depois já está lá.

Confirmado depois: a El Guardians voltou a aparecer, e `pg_views` não tem mais
nenhuma view com `'open'` a não ser a própria `conexoes_ativas`.

**Dois defeitos achados no caminho, ambos corrigidos:**

1. Duas regras da `auditoria_operacao` ("WhatsApp desconectado" e "nunca
   terminou de conectar") disparavam com `status is distinct from 'open'`.
   Como barbearia na Cloud API nunca tem status `open`, as duas iriam alertar
   para toda barbearia migrada e funcionando. Agora o texto muda por provedor.
2. A etapa 1 da reativação usava o template `reativacao`, que **não tem o
   botão de opt-out**. Passou para `reativacao_convite`, que tem — e a lista de
   parâmetros caiu de três para dois junto, porque o corpo dela usa dois.

Criada a view `templates_com_parametros_errados` por causa do segundo: uma
incompatibilidade entre a lista montada pela view e o corpo do template só
aparece quando a Meta recusa o envio, e como nada sem `status = 'aprovado'` é
enviado hoje, o defeito ficaria dormindo até o dia da aprovação — ou seja,
apareceria junto com todo o resto. Hoje ela está vazia nos 24 templates.


## Canal de alertas interno — 2026-08-21

Auditoria do agente e feedback dos donos passam a chegar por **e-mail**, não
por WhatsApp. Migrations 0090 e 0091.

**Por quê:** na API oficial, mensagem que o sistema inicia exige template
aprovado, e alerta de auditoria tem texto arbitrário — para caber num template
o corpo seria quase todo `{{1}}`, formato que a Meta costuma recusar. E nada
disso é conversa com cliente: é o produto falando com o dono do produto. Não há
razão para pagar pedágio da Meta nem para caber em 1024 caracteres.

O banco já está correto: `canal_de_alertas_conferido` devolve
`e_de_cliente = false`.

**FECHADO em 2026-08-21.** Credencial SMTP criada, e os dois fluxos
(`Auditoria do Agente` e `Feedback dos Donos`) trocados para `emailSend` e
publicados. Testado com envio real: execução 9046, Gmail devolveu
`250 2.0.0 OK` com `accepted: [castrocollin01@gmail.com]`, e o achado foi
marcado como avisado.

Duas melhorias que o canal novo trouxe de graça:

- **O limite de 8 achados por relatório sumiu.** Ele existia porque mensagem de
  WhatsApp não aguenta relatório longo, e foi a origem de um defeito real (por
  um tempo mostrava 8 e marcava todos, e do nono em diante o achado sumia sem
  nunca ter sido lido). Hoje todo achado aparece e todo achado é marcado.
- **`Montar Aviso` do feedback virou código com escape de HTML.** Era um nó Set
  montando markdown de WhatsApp; `mensagem` é texto livre escrito pelo dono da
  barbearia, e ia direto para o corpo.

O remetente ficou fixo (`Club Cut <castrocollin01@gmail.com>`) e o destinatário
vem de `canal_de_alertas.email`. O Gmail exige que o From seja a conta
autenticada no SMTP — se ele viesse do banco, mudar o destino quebraria o envio
justamente quando alguém tentasse melhorar a configuração.

**Ainda na Evolution:** o envio dos lembretes, o `Aviso de Fim de Teste` e a
`Política de Atraso` (desligada).
