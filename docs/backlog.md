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

### ~~Instância de WhatsApp própria para os alertas~~ — RESOLVIDO em 2026-08-21
Não virou instância própria: virou **e-mail**. Na API oficial, mensagem que o
sistema inicia exige template aprovado, e alerta de auditoria tem texto
arbitrário — para caber num template o corpo seria quase todo `{{1}}`, formato
que a Meta costuma recusar. E nada disso é conversa com cliente: é o produto
falando com o dono do produto.

Migrations 0090–0092, fluxos `Auditoria do Agente` e `Feedback dos Donos`
trocados para `emailSend` e testados com envio real. `canal_de_alertas.email`
aceita vários destinatários separados por vírgula.

`canal_de_alertas_conferido` existe para denunciar se o canal voltar a sair pelo
WhatsApp de uma barbearia — hoje devolve `e_de_cliente = false`.

### Clube de assinatura do cliente final
**A fidelidade foi construída** (migrations 0072–0074): carimbos calculados a
partir de vendas fechadas, resgates e ajustes gravados, recurso `fidelidade`
ligado por barbearia, com tela no cliente, no caixa e nas configurações. O que
falta é só o clube.

O clube ("corte ilimitado por R$ X/mês") é receita recorrente **para o
barbeiro**, o que muda o argumento de venda: o produto deixa de ser custo e vira
faturamento. Aparece na descrição do Trinks e do AppBarber.

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

### ~~Integração de cobrança (Asaas) não existe~~ — ERRADO desde 2026-08-21
Este item afirmava que "nenhuma linha de código menciona Asaas". **É falso.**
Existem as edge functions `asaas` e `asaas-webhook`, a tela `/assinatura` com
troca de plano e ações, `useAssinatura`, e `asaas_eventos` com 6 eventos
processados em produção — além de um pagamento registrado.

Segundo item de backlog a acusar ausência de algo que existe (o primeiro foi
Pacotes, ao contrário). **Conferir no banco e no código antes de planejar em
cima de um item antigo.**

---

## Infraestrutura e manutenção

### Template de e-mail do Supabase ainda diz "14 dias" (2026-08-31)
O prazo do teste voltou de 14 para 7 dias. Foi trocado no CRM
(`src/lib/planos.ts`, fonte única de todas as telas), na meta description do
`index.html`, na edge function `criar-minha-barbearia` (redeployada, v9) e no
prompt do agente Aurora do popup da landing (n8n `j2g3tdLZTlvs8sdP`,
republicado).

**Falta o que não mora no repositório:** o corpo do e-mail de confirmação de
cadastro vive no painel do Supabase, em *Authentication → Email Templates →
Confirm signup*. O arquivo `docs/emails-auth/confirmacao-de-cadastro.html` já
está corrigido; ele é só a cópia versionada — **colar no painel à mão**, senão
quem se cadastra recebe um e-mail prometendo 14 dias e o sistema concede 7.

Enquanto não for colado, é a única superfície do produto que mente sobre o
prazo.


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
setup, teste de 7 dias, lembretes, confirmação, "Aura") e instrução
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

## Página `/sobre` — o que falta para ela ficar inteira (2026-08-23)

A rota existe e está no ar com três blocos: a tese, as três posições e o
fechamento. Os outros três (origem, quem faz, prova de existência) estão
escritos e testados, mas **não renderizam** porque dependem de dado que só o
dono tem. Tudo isso mora em `src/lib/institucional.ts`, com a mesma regra do
`CONTATO`: campo vazio não vira layout.

- [x] **Origem** (`ORIGEM.paragrafos`): 3 a 5 parágrafos com data, número
      pequeno e pelo menos um erro admitido. É o bloco que mais carrega a
      página e o que mais afasta a impressão de texto gerado.
- [ ] **Imagem de ambiente** (`ORIGEM.imagem`): interior de barbearia, bancada,
      cadeira. Nunca rosto atribuído a um nome — ambiente ninguém audita,
      pessoa sim. Arquivo em `public/`, com largura e altura declaradas.
- [x] **Quem faz** (`QUEM_FAZ`): nome, o que a pessoa faz no dia a dia, bio e
      links públicos que dão para conferir. Foto real é o ideal; sem foto,
      com link verificável, funciona. Foto gerada de rosto é o único caminho
      que pode custar mais do que entrega.
- [x] **Prova de existência** (`EMPRESA` + `CONTATO`): razão social, CNPJ,
      cidade, e-mail em domínio próprio, Instagram. A seção só aparece quando
      houver pelo menos um dado real além do canal de suporte — e preencher o
      `CONTATO` acende junto os canais no rodapé do site inteiro, que hoje
      estão todos vazios.

Fora do repositório: nada. Nenhuma peça de Supabase, Vercel ou n8n é tocada
por esta página.

### O que sobrou da `/sobre` (2026-08-23)

- [ ] **Imagem de ambiente** (`ORIGEM.imagem`): é o único item do plano
      original que continua vazio. Interior de barbearia, bancada, cadeira,
      luz — nunca rosto atribuído a um nome. Arquivo em `public/`, com largura
      e altura declaradas.
- [ ] **Bio e link público de cada fundador** (`QUEM_FAZ[].bio` / `.links`):
      hoje o cartão mostra só nome e cargo. Um link de Instagram ou LinkedIn
      que qualquer um possa abrir é o que transforma o nome em pessoa
      verificável — é ele, e não a foto, que faz o bloco funcionar.
- [ ] **Foto de cada fundador** (`QUEM_FAZ[].foto`): opcional. Sem ela o
      cartão continua de pé.
- [ ] **WhatsApp de suporte** (`CONTATO.whatsapp`): ainda `null`. E-mail e
      Instagram já estão preenchidos e apareceram no rodapé do site inteiro.

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


## Vários destinatários nos alertas — 2026-08-21

Migration 0092. `canal_de_alertas.email` aceita lista separada por vírgula:

```sql
update canal_de_alertas
   set email = 'castrocollin01@gmail.com, socio@exemplo.com';
```

Não precisa mexer no n8n — esse é o formato que o cabeçalho To do SMTP já
espera, então atravessa sem transformação.

**Validado por `canal_de_alertas_email_valido`.** Um endereço malformado no
meio da lista faz o SMTP recusar o envio **inteiro**, não só o endereço ruim —
e aí o alerta sumiria calado, que é o único modo de falha que este canal não
pode ter. Testados sete casos, incluindo `a@b.com, lixo`, onde só um dos dois
está quebrado: rejeitado.

Envio real verificado (execução 9047): `accepted` voltou com os dois endereços,
`rejected` vazio.


## Os documentos envelheceram mais rápido que o produto — 2026-08-21

Três itens deste backlog descreviam realidade que não existe mais, e o roadmap
está no mesmo estado. Registrado aqui porque decidir prioridade com documento
velho é decidir com informação errada.

**A v3 existe em dois documentos, com listas diferentes:**

| | `mercado-e-roadmap.md` | `jornada-do-cliente.md` |
|---|---|---|
| v3 | clube de assinatura, site institucional, recuperação de clientes, permissões configuráveis, fidelidade por pontos | vaga liberada virando oferta, desconto na comanda, fidelidade/pacote |

**E boa parte de v2 e v3 já foi entregue:**

- v2 "agenda pública de autoatendimento" — **feita** (recurso `agenda_publica`)
- v2 "o balão: check-in, fila, walk-in, política de atraso" — **feito**, menos a
  política de atraso, que está construída e desligada
- v2 "registrar a confirmação (`status = 'confirmado'`)" — **feito**, mas pelo
  botão do lembrete, não por ferramenta do agente
- v2 "confirmação 10 min antes" — **construída e depois removida de propósito**
- v3 "recuperação de clientes antigos" — **feita** (`clientes_para_reativar`)
- v3 "fidelidade" — **feita**, por carimbos e não por pontos

Sobra de v2, de verdade: **tom de voz configurável** e **aviso de estado
emocional do cliente ao escalar**. Nenhum dos dois tem tabela nem código.


## Primeira conversa real pela Cloud API — 2026-08-22, madrugada

**O marco:** cliente → Meta → edge function → n8n → agente → resposta, com
número real (`+55 41 98475-4172`, `phone_number_id` `1288009817732005`, WABA
Club Cut `975811062135581`). Sem Evolution em nenhum ponto do caminho.

O teste destravou depois de inscrever a WABA pela Graph API
(`POST /975811062135581/subscribed_apps`) — o toggle "Assinar webhooks" do
painel não gravava e voltava sozinho, pela **terceira** vez que aquela tela
falha calada.

### O defeito de raiz que o teste revelou

`Converge Texto Final` é o **hub de contexto de todo o fluxo**: nove das dez
ferramentas do agente e o nó de envio leem `salon_id`, `phone_number_id` e
`contact_phone` dele.

Ele era um Set vazio com `includeOtherFields`, ou seja, só repassava o que
chegasse. No caminho de **texto** o payload sobrevive; no de **áudio e imagem**
o item vira a resposta da OpenAI, e todo o contexto se perde.

Consequências observadas em produção, todas na mesma execução (9140):

1. As dez ferramentas do agente falharam com
   `invalid input syntax for type uuid: "undefined"` — **oito vezes em
   looping**, o que explica os 40 segundos de execução.
2. **O agente inventou dois barbeiros (Rafael e Bruno) e quatro horários.** A
   El Guardians tem um profissional cadastrado. Sem conseguir ler o banco, ele
   parafraseou o que sabe de barbearias em geral e ofereceu ao cliente. É
   exatamente o defeito que as regras de `auditoria_do_agente` existem para
   pegar.
3. O envio saiu com `phoneNumberId` e destinatário indefinidos e falhou — mas
   como o nó tinha `onError: continueRegularOutput`, a execução ficou **verde**,
   a mensagem entrou em `whatsapp_messages` como enviada, e o cliente nunca
   recebeu. O histórico passou a conter uma mensagem que não existiu.

**Corrigido:** `Converge Texto Final` agora reanexa explicitamente todo o
payload de `Extrair Salon ID`, que roda antes da bifurcação e sempre tem os
dados. E os dois nós de envio passaram de `continueRegularOutput` para
`stopWorkflow` — falha de envio precisa aparecer como erro, não virar histórico
falso.

### Ainda por testar (2026-08-22)

Nada disso foi verificado depois da correção. Testar **os quatro caminhos**,
porque o sucesso do texto escondeu metade do fluxo:

1. Texto, primeira mensagem (cria conversa)
2. Texto, segunda mensagem (ramo "conversa existe" — estava morto)
3. Áudio
4. Imagem

### Duas credenciais quebradas, consertadas pelo dono

- `Authorization` (Header Auth): campo **Name** tinha `Meta Graph API`. Nome de
  cabeçalho não pode ter espaço.
- `Header Auth account` (OpenAI): campo **Name** vazio, então a chave ia sem
  cabeçalho e a OpenAI devolvia 401.

**Atenção:** existem **duas credenciais chamadas "Authorization"** — uma Header
Auth (`OZEs5UkyhiYZkkan`) e uma SMTP (`Ozsdd8R9j8L9vUJO`), e os IDs se parecem.
Renomear a de SMTP evita perder tempo editando a errada, como já aconteceu.

**Vale considerar:** trocar os `httpRequest` de transcrição e visão pelos nós
nativos da OpenAI. Três credenciais de cabeçalho montadas à mão, duas quebradas
— o nó nativo elimina a classe de erro.


## O agente ofereceu e agendou com barbeiro inexistente — 2026-08-23

Em produção, na El Guardians (**um** profissional cadastrado: Saymon Castro
Collin), o agente ofereceu quatro horários com **"Rafael" e "Bruno"** e fechou
um agendamento dizendo *"às 14:00 com o Rafael"*.

**O banco ficou certo:** o agendamento foi criado com o profissional real. O que
era falso era só o texto — o que é pior de detectar, porque nada quebra.

### Três defeitos somados

**1. O contexto dizia que havia quatro barbeiros.**
`Barbeiros para Contexto` roda uma vez por item de entrada, e a entrada eram os
4 serviços do catálogo — então devolvia o mesmo profissional 4 vezes:

```
"barbeiros": "Saymon Castro Collin | Saymon Castro Collin | Saymon Castro Collin | Saymon Castro Collin"
```

O agente lê uma lista de quatro e conclui que há quatro pessoas. **Corrigido**
com `executeOnce`.

**2. A trava anti-invenção tinha um buraco escrito no código.**
`Formatar para WhatsApp` remove linha que cita serviço inexistente, mas tinha:

```js
// Linha com horario e listagem de barbeiro ou de encaixe, nao de servico.
if (/\d{1,2}:\d{2}/.test(item)) return true
```

**Qualquer linha com hora passava sem conferência.** A trava foi escrita só para
serviço e assumiu que hora era segura. `• 14:00 com Rafael` tem hora, logo
passou. Pior: o regex de "é item de lista" só aceitava letra depois do marcador,
então linha começando com dígito nem chegava a ser examinada.

**Corrigido:** linha com hora que nomeia alguém depois de `com` só passa se o
nome existir na lista de barbeiros. Hora sem nome continua passando.

**3. A alucinação virou memória permanente.**
A mensagem falsa de 22/08 ficou em `whatsapp_messages` e `Montar Histórico` a
devolve ao agente como fala dele próprio. Na execução 9926 ele **nem chamou as
ferramentas** — leu a resposta antiga e repetiu.

**NÃO corrigido.** Enquanto essas linhas estiverem no histórico, o agente tende
a repeti-las mesmo com as travas novas.

### O que isso ensina sobre o desenho

As travas de conteúdo moram no código (`Formatar para WhatsApp`) e cobrem uma
categoria por vez — serviço, agora barbeiro. Cada categoria nova de dado que o
agente pode citar (preço, endereço, horário de funcionamento) é um buraco em
aberto até alguém escrever a regra.

Vale considerar inverter: em vez de remover o que não casa, **só deixar passar
lista montada a partir de dado do banco**. É mudança grande e não cabe num
remendo, mas o padrão atual já falhou duas vezes por motivos diferentes.


## Validado em produção pela Cloud API — 2026-08-23

Testes com número real (`+55 41 98475-4172`), El Guardians, dois contatos
diferentes. **Ciclo completo fechado por texto e por áudio.**

| O quê | Evidência |
|---|---|
| Recebimento de texto | execuções 9926, 9928, 9942, 9943 |
| Recebimento de áudio | 9937, 9938, 9941 |
| Transcrição, com gíria | *"Deu de bola, belezinha?"* transcrito corretamente |
| Contexto sobrevive ao desvio de mídia | `Converge Texto Final` devolvendo `salon_id` e `phone_number_id` na 9941 |
| Cadastro de cliente novo | cliente "Samuel" criado pelo agente |
| Agendamento | 24/08 14:00 (Manuel) e 24/08 16:30 (Samuel) |
| **Detecção de conflito** | agente recusou 14:00 por estar ocupado e ofereceu alternativa, que o cliente aceitou |
| Envio confirmado | `wamid` de retorno da Meta na 9941 |

O teste de conflito é o mais valioso: não foi simulado. O horário estava ocupado
por um agendamento criado noutra conversa, e o agente **nomeou o barbeiro real**
(Saymon) ao recusar — numa conversa sem histórico envenenado.

### Não testado

- **Imagem.** `Baixar Imagem` usa a mesma credencial que foi consertada, então há
  boa chance de funcionar, mas ninguém exercitou.
- **Botões do lembrete.** Depende de template aprovado.

### Aberto

**Histórico envenenado na conversa do "Manuel"** (`a1e86b3c-...`): **cinco**
mensagens do agente citando "Rafael", de 22 a 23/08, cada uma copiando a
anterior. As travas novas impedem novas, mas não apagam as existentes. Decidido
em 23/08 **não apagar por ora** — a conversa fica como espécime do defeito, e os
testes seguem pelo outro número.

**Telefone gravado sem padrão.** O cliente "Manuel" ficou com `41984729754` e o
"Samuel" com `554187275895` — um com DDI, outro sem. Não quebrou nada porque as
views casam pelos últimos 8 dígitos, mas isso é contorno, não solução.
Padronizar na criação do cliente pelo agente.


## Evolution fora dos fluxos — 2026-08-23

Os três últimos fluxos que mandavam pela Evolution passaram para o nó nativo do
WhatsApp com `sendTemplate`. **Nenhum fluxo do n8n fala com a Evolution agora.**

| Fluxo | O que mudou | Estado |
|---|---|---|
| `Aviso de Fim de Teste` | `httpRequest` → `sendTemplate` | publicado, ativo |
| `Política de Atraso` | `httpRequest` → `sendTemplate` | **salvo, NÃO publicado** — continua desligado de propósito |
| `Lembretes` | envio, conexão e gravação do wamid | publicado, ativo |

Migration 0093: `atrasos_para_perguntar` e `vencimentos_a_avisar` passam a
devolver `template`, `template_idioma` e `template_parametros`, como a
reativação já fazia.

### Ficam prontos e parados, e isso é o desenho

As duas views fazem **join** com `whatsapp_templates` filtrando
`status = 'aprovado'`. Enquanto a Meta não aprovar, elas vêm vazias e os fluxos
não têm o que enviar. O lembrete tem a mesma trava num nó próprio
(`Buscar Template Aprovado` → `Template Aprovado?`), e quando não encontra
**não marca `lembrete_enviado`** — no dia da aprovação o próximo ciclo pega.

Conferido depois de aplicar: as cinco views de disparo devolvem 0 linhas, e
`templates_com_parametros_errados` continua vazia.

### O nó novo mais importante

`Guardar wamid do Lembrete`, no fluxo de lembretes. A RPC `responder_lembrete`
casa o clique do cliente pelo `context.id` do webhook contra
`appointments.lembrete_message_id`. **Sem esse nó, o botão "Sim, confirmo" não
é reconhecido** e a resposta cai no agente como conversa solta — ou seja, os
três botões existiriam e não fariam nada.

Roda depois do envio porque o wamid só existe na resposta da Meta. A proteção
contra reenvio continua sendo `Marcar lembrete_enviado`, que roda antes.

### O que sobra da Evolution

Nada mais no n8n. Continuam existindo, sem uso pelos fluxos:

- edge function `whatsapp` (connect/status/disconnect) — **ainda chamada pela
  tela `/conexao` do CRM**, confirmado em log de produção
- `_shared/instanceName.ts`, `_shared/evolutionConfig.json`, `scripts/evolution-*.mjs`
- credencial `Evolution API - CRM Salão` no n8n
- coluna `instance_name`, ainda exposta pelas views para o caso de alguma
  barbearia voltar à Evolution

Desligar a Evolution agora só quebraria a tela `/conexao` — que já está mentindo
de qualquer forma.


## Convite aceita quem já tem conta — 2026-08-23

Convidar um e-mail que já tinha login devolvia *"Já existe uma conta com esse
e-mail. Peça ao dono para trocar o e-mail"* — ou seja, pedia à pessoa um e-mail
falso para poder trabalhar. Barbeiro em duas barbearias é comum no ramo, o
schema (`user_salons`) sempre permitiu, e a produção já tinha um dono com duas
unidades; só o fluxo de convite proibia.

**Agora são dois caminhos:** conta nova cria senha como sempre; conta existente
**entra com a senha que já possui** e só ganha o vínculo novo. A senha é a prova
de posse do e-mail — sem ela, um dono que digitasse o e-mail de um terceiro o
colocaria numa equipe sem consentimento, e o fluxo antigo ainda deixaria quem
abrisse o link definir senha nova na conta alheia.

Três defeitos caíram juntos:

1. **`listUsers()` sem paginação** — a verificação funcionava com 5 contas e
   quebraria em silêncio a partir de 50. Virou a RPC `user_id_por_email`
   (migration 0094), consulta por índice, só para service_role — expô-la a
   usuários logados viraria um oráculo de quais e-mails têm conta.
2. **Conta órfã bloqueava o e-mail para sempre** — `samuel21almeiida@` existia
   no auth sem barbearia nenhuma, invisível em qualquer tela. No fluxo novo ela
   se resolve sozinha: a pessoa entra com a senha e ganha o vínculo.
3. **O rollback apagava demais** — o catch fazia `deleteUser` incondicional.
   Se falhasse no meio do vínculo de uma conta PRÉ-EXISTENTE, apagaria um login
   com vínculos em outras barbearias. Agora só conta criada agora é desfeita
   inteira; conta antiga tem desfeitos apenas o profissional e o vínculo deste
   aceite.

Edge function v22 no ar; tela com os dois modos. **Teste manual pendente:** usar
o convite da El Guardians com `samuel21almeiida@gmail.com` (a órfã) — deve
pedir a senha existente e vincular.


## Funcoes SECURITY DEFINER estavam executaveis por anon — CORRIGIDO 2026-08-23

`revoke ... from anon, authenticated` não fecha nada: toda função nasce com
EXECUTE concedido a PUBLIC, e anon herda de PUBLIC. As migrations 0084, 0086 e
0094 fizeram exatamente esse revoke acreditando ter restringido. O advisor do
Supabase mostrou as cinco executáveis sem login via `/rest/v1/rpc`:

- `user_id_por_email` — oráculo de quais e-mails têm conta;
- `responder_lembrete` — confirmar/cancelar agendamento alheio com o wamid;
- `trocar_horarios` — trocar horários de QUALQUER barbearia (definer ignora RLS);
- `salon_por_phone_number_id`, `horarios_livres` — leitura.

Migration 0095 revoga de `public, anon, authenticated` nas cinco; só
service_role executa (conferido com `has_function_privilege`). **Regra nova:**
função definer revoga de PUBLIC primeiro, e o grant é explícito e pontual.


## Rede de barbearias — fase 1 entregue em 2026-08-23

**Decisão de desenho:** rede não é um cadastro, é uma promoção. Todo mundo entra
criando a primeira barbearia; a rede nasce no primeiro "Adicionar unidade". Não
há (nem haverá) funil "cadastre sua rede" na landing — dono de barbearia não se
apresenta como rede, ele abre a segunda loja.

**O que já existia** (mais do que o backlog dizia): `organizations`, seletor de
unidade no `SalonContext`, painel `/rede` com comparativo, `add-salon-unit`,
`RequireNetworkOwner`, e uma rede real de teste (El Guardian: Curitiba + SJP).
O que faltava era **como uma rede passa a existir** — nada criava
`organizations`; a única nasceu por SQL.

**Feito:**

- `add-salon-unit` (v18) recebe `salonId` de origem em vez de `organizationId`.
  Origem sem organização → cria a organização com o nome da barbearia, anexa a
  origem, e só então cria a unidade. O dono nunca vê "organização".
- **A unidade nasce com assinatura** (herda o plano da origem, 7 dias de
  teste). Antes não nascia — e unidade sem `subscriptions` some de
  `salons_com_automacao` e abre `/assinatura` como "cadastrada antes do
  controle". Buraco achado lendo a função.
- Horário de funcionamento herdado da origem; catálogo copiado por padrão.
- `NovaUnidadeModal` extraído da RedePage para arquivo próprio, com dois donos:
  aba Rede e **Configurações → seção Unidades**, visível para toda barbearia
  cujo usuário é dono. É ali que a avulsa encontra o botão.
- Após criar: recarrega unidades (liga `isNetwork`, aparece seletor e aba
  Rede), entra na unidade nova.

**Fases seguintes (não feitas):**

- Fase 2 — cobrança: `/assinatura` mostrar todas as unidades e o total; desconto
  de rede; decidir um cartão para tudo (recomendado) vs fatura consolidada.
- Fase 3 — landing: seção "Para redes" + FAQ de preço por unidade.
- Fase 4 — papéis: gerente de rede que vê tudo sem ser dono. Hoje dono da rede =
  owner em cada unidade, e serve.
- WhatsApp por unidade: mesmo caminho da avulsa (número por unidade na WABA
  Club Cut, 20 números com empresa verificada); Embedded Signup resolve os dois.

**Teste manual pendente:** com `castrocollin01` (El Guardians, avulsa),
Configurações → Adicionar unidade. Esperado: organização "El Guardians"
criada, unidade nova com assinatura em trial, seletor de unidades e aba Rede
aparecendo.


## Rede — fase 2: cobrança unificada — 2026-08-23

**O modelo, como decidido:** cada barbearia continua gerando a própria cobrança
(`subscriptions` por unidade segue sendo a verdade de plano/valor/acesso — e é
nela que o modelo de preço novo, ainda por definir, vai mexer). O que a rede
escolhe é só o **formato do boleto**: um por unidade (padrão) ou um único com a
soma de todas.

**Como funciona por dentro:**

- `organizations` ganhou `cobranca_unificada`, `cpf_cnpj`, `asaas_customer_id`
  e `asaas_subscription_id` (migration 0096). Sem policy de escrita para
  authenticated de propósito: ligar a flag por update direto, sem cancelar as
  recorrências por unidade no Asaas, cobraria a rede em dobro.
- Ação `assinar-rede` na function `asaas` (v22): valida que quem pediu é dono
  de TODAS as unidades, cancela as recorrências por unidade (antes de criar a
  nova — a ordem inversa deixaria janela de cobrança dupla) e cria UMA
  recorrência da rede com `externalReference: rede:<orgId>`, no valor da soma.
- Ação `separar-rede`: cancela a recorrência da rede; cada unidade volta a
  assinar sozinha; `acesso_ate` fica (o que foi pago continua valendo).
- Webhook (v17): pagamento cuja subscription é a da rede (ou externalReference
  `rede:`) estende `acesso_ate`/`atendimento_ate` de TODAS as unidades da
  organização; atraso marca todas como atrasadas.
- CRM: seção **Cobrança da rede** na `/assinatura` (`CobrancaDaRede.tsx`), só
  para dono de 2+ unidades: lista as assinaturas, soma o total e oferece
  unificar/separar. O CPF/CNPJ do pagante da rede é separado do por unidade
  (rede paga pela matriz/holding).
- Modal de unidade nova pergunta o **nome da rede** quando é a primeira — senão
  a rede nasce com o nome da barbearia e não há tela para renomear.

**Limitações conhecidas (aceitas por ora):**

- Troca de plano de uma unidade sob cobrança unificada **não reajusta** o valor
  da recorrência da rede automaticamente — o ajuste só acontece ao
  separar/unificar de novo. Resolver quando o modelo de preço novo for definido.
- Unidade criada depois da unificação não entra sozinha no boleto — mesma
  janela de decisão.

**Não testado em produção:** o ciclo completo unificar → boleto → webhook →
todas liberadas. Precisa de uma rede com 2+ assinaturas reais; a El Guardians
vira o cenário assim que o teste da fase 1 criar a segunda unidade.


## Modelo de cobrança por uso — 2026-08-24

**Pay-per-booking progressivo**, decidido em 24/08: o cliente paga por
agendamento criado pelo agente no WhatsApp. Faixas por barbeiros ativos
(1–3: R$0,75 · 4–7: R$0,70 · 8–10: R$0,65 · 11+: R$0,60), medidos no último
dia do período. **A faixa nunca aparece para o cliente — só o preço dele.**

Regras travadas:
- Cobra o agendamento com `origem = 'agente'`, MESMO cancelado depois (o
  sistema entregou o prometido). Reagendar não duplica (mesma linha). CRM e QR
  não cobram.
- Lembrete não cobra. Reativação não cobra por mensagem; o agendamento que ela
  gerar cobra como qualquer um.
- Sem mínimo, sem franquia grátis.
- Boleto gerado À MÃO a partir do e-mail de detalhamento. Sem assinatura pelo
  sistema; o cliente só cancela.

**Construído (migration 0097):**
- `faixas_de_uso` (preços em tabela, sem policy — o cliente não lê faixas),
  `preco_por_uso(n)` (authenticated pode: devolve só o preço unitário).
- `faturas_de_uso` — fechamentos CONGELADOS com detalhe linha a linha (jsonb).
  Cancelar agendamento dia 3 não muda fatura fechada dia 1. Idempotente por
  unique. RLS: dono lê as suas.
- `gerar_fatura_de_uso`, `fechar_mes_de_uso` (todas as barbearias ativas),
  `gerar_fatura_de_cancelamento` (último fechamento → hoje). Todas revogadas de
  PUBLIC (lição da 0095).
- **pg_cron** roda `fechar_mes_de_uso()` todo dia 1 às 06h de Brasília — o
  fechamento é do banco, não do n8n.
- `uso_do_sistema_no_mes` (medidor ao vivo, invoker) e `faturas_a_notificar`
  (fila do notificador; view porque `is null` no nó do Supabase quebra).
- Policy de SELECT criada para `reativacao_envios` — não tinha, e a view
  invoker mostraria zero em silêncio.

**n8n:** `CRM Salao - Detalhamento de Uso` (8Qh33uoFm4VqT1eO), de hora em hora:
fatura sem `notificada_em` → e-mail para o canal com resumo + tabela linha a
linha → marca DEPOIS do envio. Testado com envio real (execuções 10463/10464;
a primeira revelou o mesmo defeito de contexto do Converge — depois do
emailSend o $json vira resposta SMTP — corrigido com referência explícita).

**Edge `asaas` v23:** cancelar gera a fatura parcial na hora (falha não derruba
o cancelamento — o fechamento mensal cobre).

**CRM:** `UsoDoSistema` na `/assinatura` — medidor do mês (agendamentos ×
preço, VALOR GERADO em serviços, lembretes e reativações "sem custo") +
histórico de períodos fechados.

**Transição pendente (decisões de negócio, não de código):**
1. Desmontar o fluxo antigo de assinar/trocar plano na `/assinatura` — hoje os
   dois modelos convivem na tela.
2. Destino dos planos Básico/Pro e do gating `salons_com_automacao`
   (`inclui_automacoes`) — no modelo por uso, todo mundo tem tudo.
3. Migrar as assinaturas recorrentes existentes no Asaas para o modelo novo.
4. Trial: hoje unidade nova nasce com 7 dias; no modelo por uso talvez nem
   precise de trial.


## Modelo antigo removido do produto — 2026-08-24

O que o dono vê agora é só o modelo por uso. Saíram do CRM: `TrocarPlano`,
`RecursosDoPlano`, `AcoesDaAssinatura` (virou `CancelarUso`, o único botão),
o cálculo de proporcional e seus testes. A `/assinatura` é: medidor de uso →
situação do acesso + cancelar → CPF/CNPJ do pagante → cobrança da rede.

A edge function `asaas` encolheu de 660 para ~200 linhas (v24): sobraram
`cancelar` (que derruba recorrência legada se existir e gera a fatura parcial)
e `unificar-rede`/`separar-rede` — que agora são SÓ uma preferência
(`organizations.cobranca_unificada`), sem criar nada no Asaas: o boleto é
manual, e a flag diz ao faturamento para tratar a rede como um pagante só.

A seção da rede mostra **o uso do mês de cada unidade** (agendamentos × preço
da unidade) e o total — não mais mensalidades.

Migration 0098: `plans.ativo = false` em tudo (tabela aposentada, fica pelo
histórico/FK) e `salons_com_automacao` **sem filtro de plano** — no modelo por
uso todo mundo tem as automações; a trava que resta é estar ativa e dentro de
`atendimento_ate`.

**Pendências que esta remoção revelou:**

1. **Preço da landing ≠ faixas do banco.** A landing vende R$ 0,85 por
   agendamento (`src/lib/planos.ts`); as faixas cobram 0,75–0,60. Alinhar um
   dos dois — decisão de negócio.
2. **Os Termos de Uso descrevem o modelo antigo** (troca de plano, proporcional,
   mensalidade — `TermosPage`). Precisa de texto novo para o modelo por uso e
   bump da `VERSAO_DOS_TERMOS` (o aceite é registrado por versão). Junta com a
   revisão de advogado já pendente.
3. **Recorrências legadas no Asaas** (ex.: Curitiba) seguem cobrando até serem
   canceladas — pelo botão de cancelar de cada uma, ou à mão no painel do
   Asaas, na migração de cada cliente para o modelo novo.


## Termos de uso atualizados para o modelo por uso — 2026-08-24

`VERSAO_DOS_TERMOS = '2026-08-24'`. O que mudou no texto:

- **§2** “O que cada plano inclui” → “O que está incluído”: sem planos, todo
  cliente tem tudo; conexão do WhatsApp “feita junto com a nossa equipe” (sem
  QR code no texto).
- **§4** reescrita: cobrança por agendamento criado pelo atendimento automático,
  sem mínimo; cancelado depois cobra (“o serviço de marcar foi prestado”);
  remarcar não duplica; CRM e QR do balcão não cobram; lembretes e reativações
  sem custo; fechamento no mês-calendário; reajuste com 30 dias de aviso. O
  texto fala em “valor unitário informado na contratação” — as faixas
  continuam fora do texto público, como decidido.
- **§5** cancelamento: fecha o período em aberto na hora, última cobrança só
  com o usado até o dia.
- **§7 antiga (troca de plano) removida**; seções renumeradas (13 → 12).
- **§8 (antiga 9) WhatsApp**: deixou de descrever “canal não oficial” — a
  conexão é pela API oficial da Meta desde 22/08; mantém que a Meta pode
  restringir números pelas políticas dela, e cita os modelos aprovados.

**Consequências em aberto:**
- Todos os aceites registrados são da versão 2026-08-14 ou anterior — a
  diferença é detectável por design, mas **não existe fluxo de re-aceite** para
  usuário já logado. Decidir se o texto novo vale só para entradas novas ou se
  o CRM deve pedir aceite de novo.
- `TERMOS_EM_REVISAO` continua true: a revisão por advogado segue pendente, e
  agora com o texto já no modelo definitivo de cobrança.


## Boleto automático do uso — 2026-08-24

O boleto do fechamento nasce sozinho. Ciclo completo:

```
dia 1  → pg_cron fecha as faturas               (banco)
hora/hora → n8n: cobrar-uso gera as cobranças no Asaas
          → detalhamento p/ dono do produto (com link do boleto)
          → boleto p/ DONO DA BARBEARIA por e-mail
CRM    → banner “Cobrança em aberto — Pagar (boleto, Pix ou cartão)”
pago   → webhook estende o acesso E marca a fatura como paga
```

- **Edge `cobrar-uso` (v1)**: agrupa por rede quando `cobranca_unificada`
  (externalReference `rede:<id>`), acumula grupos abaixo de R$ 5, pula quem não
  tem CPF/CNPJ (fatura fica aberta; o CRM pede o documento). Idempotente — só
  olha fatura sem `asaas_payment_id` — e por isso o gatilho aceita o token anon
  (público): disparo à toa só faz o trabalho que já ia acontecer.
- **Migration 0099**: colunas do boleto em `faturas_de_uso`, `email_do_dono()`
  (definer, service_role — senão vira oráculo de e-mails), views
  `faturas_a_notificar` (+boleto) e `boletos_a_enviar` (uma linha POR COBRANÇA:
  boleto acumulado gera UM e-mail, não três).
- **Webhook v18** marca `paga_em` nas faturas da cobrança paga — é o “pago” do
  histórico no CRM.
- **n8n (15 nós)**: Gerar Boletos roda ANTES do notificador (o detalhamento já
  sai com o link); duas filas independentes de e-mail.
- **CRM**: banner de cobrança em aberto com botão de pagar; histórico com
  pago / pagar / acumula.

**Testado ao vivo**: `cobrar-uso` devolveu `acumuladas: 1` para a fatura de
R$ 1,50 — regra do mínimo funcionando. O caminho ≥ R$ 5 (criação real de
cobrança + e-mail ao dono) ainda não rodou: acontece no primeiro fechamento
que somar R$ 5, ou num cancelamento com uso suficiente.

## Conexão: bloco legado da Evolution (2026-08-25)

A ConexaoPage agora decide pelo `whatsapp_connections.provedor`: `cloud_api`
mostra o estado da API oficial (sem QR); `evolution` cai no bloco legado com o
fluxo de QR code. **Curitiba e São José dos Pinhais ainda são `evolution`** —
quando a migração delas para a API oficial acontecer, apagar o componente
`ConexaoEvolutionLegada`, a edge function `whatsapp` (ações connect/status/
disconnect da Evolution) e este item.

## Pacotes — Fase 2 e 3 (2026-08-26)

Fase 1 entregue: tabelas/RLS/view (0112), aba Pacotes no Catalogo, venda e
consumo no caixa, bloco na ficha, comissao na venda do pacote, carimbo
aposentado. Prompt do agente corrigido (nao nega mais; orienta ao balcao).
Pendente:
- **Fase 2**: agente consultar `saldo_de_pacotes` no contexto e responder
  "restam N, vence dia X" (mexe no fluxo do n8n, testar com mensagem real).
- **Fase 3**: template `pacote_vencendo` (utility: credito comprado expirando)
  no lote da submissao a Meta + fluxo n8n de aviso.
- Landing ainda anuncia "fidelidade" generica — avisar quem cuida da landing
  que o modelo agora e pacotes pre-pagos.

## Reativação por agendamento automático — Fase 1 no banco e no CRM (2026-08-27)

O que já existe (migration `0113`, aplicada em produção e testada ponta a ponta
com a El Guardians):
- `clients.reativacao_semanas` (opt-in digitado no caixa, 1–8), pausa e
  contadores de silêncio/no-show; origem `reativacao` em `appointments` com
  `reativacao_confirmada_em` como marcador de cobrança.
- Cron `cria-reativacoes` (hora em hora) cria o horário real na janela de
  24–25h; view `reativacoes_a_enviar` é a fila do n8n; RPC
  `marcar_reativacao_enviada` guarda o wamid; `responder_lembrete` ganhou os
  ramos de reativação (Sim = confirma e cobra; Remarcar = cancela a reserva e
  entrega ao agente; Cancelar = sai da base). Cron `expira-reativacoes`
  cancela sem resposta até 3h antes e pausa quem ignorou 2 envios; trigger
  pausa após 2 no-shows. Fatura de uso passou a contar o Sim da reativação.
- CRM: campo de semanas no fechamento da comanda (NewSaleModal) e bloco
  "Reativação" no dashboard do agente (view `reativacao_resumo`).

O que falta (bloqueado nos templates da Meta):
- **n8n**: fluxo que varre `reativacoes_a_enviar`, sorteia a variante aprovada
  (rotação por cliente — nunca a mesma frase duas vezes seguidas; conferir
  `templates_recategorizados` antes de cada lote), envia com os 3 botões e
  chama `marcar_reativacao_enviada`. Construir quando Saymon informar quais
  das 10 variantes (`agendamento_automatico_v2`…`v10` + a original) a Meta
  aprovou.
- **n8n**: lembrete de 1h antes para quem confirmou — sai pela janela de 24h
  aberta pelo clique (grátis) e cai no template de lembrete só se a janela
  fechou.

## Revisão de código do CRM (2026-08-28) — pendências fora do repositório

Achados confirmados que exigem peças além do commit (edge functions e
migrations não estão no pipeline de deploy — aplicar à mão):

- **Supabase (edge function `asaas`)**: cancelamento quebrado desde a migration
  0110 (update em `plano_agendado`/`upgrade_payment_id`, colunas dropadas) e
  checagem de vínculo sem filtro de `user_id` (dono com equipe recebe 500).
  Corrigir no repositório + **redeploy manual da função**.
- **Supabase (migration)**: policy `user_salons: gestor gerencia a equipe`
  (0015) deixa gerente se promover a `owner` ou deletar o vínculo do dono via
  API; convite `role='owner'` também sai por RLS de gerente (0017/0050).
  Migration nova + **aplicar em produção à mão**.
- **Supabase (edge functions `asaas-webhook`, `cobrar-uso`, `whatsapp-webhook`,
  `accept-invite`, `criar-minha-barbearia`, `admin-*`)**: erros de update não
  checados (pagamento confirmado pode não liberar acesso), cobrança sem lock
  (execução dupla = boleto duplicado), webhook da Meta sem dedupe de `wamid`
  (agente responde 2×), corrida no aceite de convite, `listUsers()` sem
  paginação. Cada correção exige **redeploy manual**.
- **Painel do Supabase**: ligar proteção contra senha vazada (Auth); revogar
  EXECUTE de `trg_reativacao_pos_atendimento()` para anon/authenticated.
- **n8n**: se o dedupe de `wamid` for por tabela, o fluxo do agente não muda;
  se for no fluxo, ajustar lá.

## Atualização (2026-08-28, tarde)
- **Resolvido**: cancelamento de assinatura (colunas dropadas + vínculo sem
  user_id) corrigido no PR #67 e a função `asaas` **redeployada (v25)** via
  MCP. O item correspondente da revisão de código está fechado; os demais
  (webhook, cobrar-uso, RLS de gerente→dono etc.) seguem pendentes.

## Revisão de agentes (2026-08-29) — o que ficou aberto

Revisão em 6 frentes (db/backend/frontend/qa/n8n/deploy) com os agentes de
`~/meus-projetos`. Corrigido na hora: troca de cliente corrompia crédito de
pacote no caixa (NewSaleModal, + guardas no save); `cobrar-uso` sem authz
(agora exige service key, n8n "Gerar Boletos" migrado para a credencial
Supabase — JWT saiu do texto plano); migration 0114 (revokes de
`trg_reativacao_pos_atendimento` e `precificar_consumo_ia`; pausa da
reativação só no vencimento real; DELETE de `stock_movements` para membros —
rollback de estoque do barbeiro funcionava só para gestor; drift
`consumo_ia`/`precos_modelo` versionado); limite do popup 30→8; rótulo
"Pacote" na comanda; fallback sandbox removido do `cobrar-uso`.

Aberto, por prioridade:
- **Agente n8n: transcrição/visão sem caminho de erro** — cliente fica sem
  resposta em silêncio se a OpenAI falhar. Precisa de ramo de fallback ("não
  consegui ouvir o áudio") testado com mensagem real antes de publicar.
  Nenhum dos 11 workflows tem errorWorkflow global — um único notificando o
  canal de alertas cobriria todos.
- **Testes zero nos fluxos críticos**: venda/rollback, pacotes, caixa
  automático, reativação — nem vitest nem pgTAP.
- Edge functions: `listUsers()` sem paginação (admin-create/invite-salon);
  `add-salon-unit` sem rate limit; `criar-minha-barbearia` com maybeSingle
  sem tratamento (salão duplicado) e rate limit próprio burlável; token do
  asaas-webhook sem constant-time; update de faturas no webhook com erro
  descartado; `whatsapp` sem salonId cai em `.limit(1)`; CORS `*` nas
  funções admin; `taxaExcedida` fail-open em 4 cópias (extrair p/ _shared);
  `verify_jwt` das públicas não versionado no config.toml.
- Banco: FKs por `salon_id` sem índice (services/products/professionals/
  professional_schedules/professional_services/orders.cash_register_id/
  reativacao_envios); policies duplicadas de SELECT em `user_salons` (90
  avisos); `preco_por_uso` executável por authenticated (decidir se é
  intencional); `btree_gist` no schema public; `criar_agendamentos_de_
  reativacao` não checa profissional ativo nem expediente.
- Frontend: conferir o que os PRs #62-69 já resolveram (Modal único com Esc
  chegou no #65) e varrer o resto: `window.confirm` na Equipe, busca da
  Ajuda sem estado vazio, banners sem safe-area-top, erro booleano na
  Conexão, labels no adminTool, escala de z-index.
- Popup da landing: limite contornável por sessionId novo (considerar IP),
  leads em data table do n8n sem expurgo (LGPD); áudio/imagem de cliente vão
  à OpenAI — cobrir na política de privacidade.
- Infra: CI Node 22 vs Vercel Node 24; chunks grandes (jspdf ~400kB);
  repositório ainda público.

## Modelo híbrido de WhatsApp — Fase 1 entregue (2026-08-30)

Decisão: conversa com o cliente no número REAL da barbearia (Evolution);
lembrete/reativação/avisos saem de número DA PLATAFORMA na Cloud API (sem BSP
não há Embedded Signup viável por barbearia, e banimento no oficial queima o
nosso número, não o do barbeiro). Remarcar da reativação responde no número
central com link wa.me da barbearia (decisão v1).

Feito (0115 aplicada + whatsapp-webhook v7):
- `remetentes_oficiais` (semeada com o número atual da WABA) +
  `salons.remetente_phone_number_id` para fragmentar por número no futuro
  (nota de qualidade e tier são por número).
- Views de envio (clientes_para_reativar/avisar_retorno, atrasos, vencimentos
  + dependentes) desamarradas da conexão Cloud do salão: remetente vem da
  plataforma, provedor fixo cloud_api. Fail-closed sem remetente ativo;
  vencimentos com LEFT lateral para a auditoria "sem canal" continuar viva.
- Webhook oficial ganhou o ramo do número central: botão resolve salão pelo
  wamid (responder_lembrete); Remarcar vira acao `reagendar_central` para o
  fluxo de resposta; texto solto é logado e descartado (nunca salão
  arbitrário). Não-quebra: enquanto o número estiver vinculado à El Guardians
  em whatsapp_connections, o ramo por salão continua valendo.

Fase 2 (pendente): ponte Evolution de volta na ENTRADA do agente n8n (roteada
por salão, restaurando o caminho de mídia antigo — áudio/imagem chegam
diferente, ver docs/n8n-cloud-api-entrada.md); fluxo de resposta do lembrete
tratando `reagendar_central` (texto com wa.me do salão) e resposta educada a
texto solto no número central; desvincular o número oficial da El Guardians
(vira só remetente central) e parear a El Guardians na Evolution para teste.
Fase 3 (pendente): aba Conexão focada na Evolution (bloco Cloud por salão
morre), alerta de desconexão Evolution no canal de alertas, monitor de nota
do número central, reescrever artifacts "Conexão WhatsApp" e Central de
Ajuda; manual "Registro WhatsApp" fica obsoleto. Radar: RAM do VPS cresce por
instância Baileys (~1 por barbearia).

## Modelo híbrido — Fases 2 e 3 entregues (2026-08-30)

Fase 2 PUBLICADA: agente com ponte Evolution (entrada dupla, mídia base64,
envio roteado por provedor com a URL real do servidor) — a Curitiba voltou a
ter atendimento automático (decisão do Saymon); lembretes com o webhook
`lembrete-resposta-central` (Remarcar → wa.me da barbearia).

Fase 3: aba Conexão reescrita para o híbrido (QR é o fluxo principal; aviso
sobre o número de lembretes); Central de Ajuda atualizada; migration 0116
(`eventos_da_waba` + ramo `qualidade-waba` na auditoria, testado — alerta da
Meta sobre o número central cai no canal de alertas em até 30min); webhook v8
captura campos administrativos (phone_number_quality_update etc.).

Pendências do híbrido:
- **Saymon**: no painel da Meta (app → Webhooks → WhatsApp Business Account),
  assinar os campos `phone_number_quality_update` e `account_update` — sem
  isso a Meta não envia os eventos que o monitor de qualidade escuta.
- **Saymon**: parear a El Guardians no QR e testar texto + ÁUDIO real (ramo de
  mídia só foi verificado estruturalmente); observar as primeiras execuções da
  Curitiba no n8n.
- Depois do teste: desvincular o número oficial da El Guardians em
  `whatsapp_connections` (vira remetente central puro; o ramo central do
  webhook assume).
- Reescrever o artifact "Conexão WhatsApp" e aposentar o manual "Registro
  WhatsApp na API oficial" (obsoleto no híbrido — barbearia não registra mais
  nada na Meta).

### Documentos do híbrido — feito (30/08/2026)
Artifact "Conexão WhatsApp Club Cut" reescrito para o modelo híbrido (dois
canais, por quê do híbrido, caminho da conversa e do aviso, vigilância da
qualidade, estado por barbearia, coexistência como fim do modelo) — mesma URL.
Manual "Registro de Número na API Oficial" aposentado com faixa de
obsolescência, preservado como referência histórica. Restam do híbrido só os
passos do Saymon (campos do webhook na Meta, QR da El Guardians, observar
Curitiba) e o desvínculo final do número oficial.

## Verificação completa do híbrido (2026-08-31) — corrigido na hora

5 frentes (db/backend/n8n/qa/deploy). Produção limpa (Vercel READY em main,
CI verde, 0 erros de runtime; webhook v8→v9, cobrar-uso v2; 0115/0116 conferem
no banco). Corrigido: Termos de Uso descreviam conexão "pela API oficial" —
cláusula 8 reescrita para o híbrido e VERSAO_DOS_TERMOS → 2026-08-31 (quem
aceitou a anterior fica detectável); clique no número central com wamid
desconhecido morria sem rastro — webhook v9 loga; índice da FK
salons.remetente_phone_number_id (0117).

Aberto da verificação:
- **Saymon**: conferir na UI do n8n (a API omite o bloco credentials) que os 2
  nós "Responder pela Evolution" do agente estão com a credencial "Evolution
  API - CRM Salão"; e criar/conferir o segredo `N8N_LEMBRETE_RESPOSTA_URL`
  nas edge functions do Supabase apontando para
  https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/lembrete-resposta-central
  (sem ele, a resposta dos botões de lembrete não é entregue ao cliente).
- Ramo Evolution do agente ainda sem execução real (todas as 25 amostradas
  foram cloud_api) — validação de verdade vem com o QR da El Guardians ou a
  primeira mensagem de cliente da Curitiba.
- Testes de borda sugeridos: evento de status da Meta não deve virar linha em
  eventos_da_waba; e conferir escaping do detalhe no e-mail da auditoria (o
  fluxo 7yliDoD9AaQp3Qcm escapa HTML nos textos — verificado na revisão de
  29/08 — mas vale reconferir com o campo novo qualidade-waba).

## Trio da realidade do balcão — itens 14, 12 e 16 entregues (2026-08-31)

- **14 Saldo pelo agente**: view `saldo_de_pacotes_por_telefone` (0118) +
  ferramenta "Saldo de Pacotes" no agente com identidade travada no número da
  conversa (nunca $fromAI); prompt reescrito sem a contradição da seção
  DINHEIRO (saldo pode, só via ferramenta; vazio = sem pacote). Testado:
  agente chamou a ferramenta e não inventou número. Publicado.
- **12 Cancelar/remarcar público**: `appointments.token_gestao` (0118) +
  ações meu_horario/cancelar_horario na agenda-publica v7 (rate limit,
  antecedência 2h, testada com curl 404/400) + página /meu-horario/:token no
  CRM + link na tela de sucesso do QR. Remarcar = wa.me da barbearia.
- **16 Avaliação pós-atendimento**: PRIMEIRO fluxo 100% Evolution do híbrido
  (workflow NsHcELIXrETknywa, publicado): pede nota pelo número da barbearia,
  sem template/janela/custo Meta; marca só após envio; 8 semanas de respiro
  por cliente; nota registrada pelo agente (ferramenta "Registrar Avaliação",
  tabela `avaliacoes`); nota 5 → link do Google (campo novo nas Configurações,
  exposto em salons_atendendo pela 0119); nota ≤3 → dono avisado.

Fase 2 do trio (backlog): mostrar média/lista de avaliações no CRM
(dashboard); link de gestão também na confirmação do agente; teste real do
ciclo avaliação quando a El Guardians parear na Evolution.

## Item 6 — corte + barba num agendamento só (2026-08-31)

Entregue (migration 0120 aplicada e testada na El Guardians; CRM verde):
- `appointment_services` (filha) + espelho automático do principal em todo
  INSERT (agente/QR/reativação ficam consistentes sem saber da tabela);
  `appointments.service_id` segue como o principal.
- Trigger de fim soma a filha — arrastar multi-serviço não encolhe mais
  (testado: 40+30=1h10; mover manteve 1h10).
- RPC `definir_servicos_do_agendamento` (definer com checagem de vínculo):
  define a lista, recalcula o fim; estourar no vizinho devolve 23P01 com
  rollback total (testado).
- Fatura: valor_gerado e detalhe somam todos os serviços; cobrança segue
  1 agendamento cobrável (decisão de 30/08).
- Reativação copia a lista completa do último corte.
- CRM: NewAppointmentModal com chips de serviços extras + duração total +
  rollback no 23P01 com mensagem própria; detalhe mostra a lista; "Concluir e
  cobrar" pré-preenche a comanda com todos; grade mostra "+N".

Fase 2 (pendente, decisão consciente): agente de WhatsApp e QR público seguem
marcando UM serviço — ensinar a IA a somar duração é risco de overbooking e
só entra com teste real de conversa; quando entrar, o prompt precisa citar
"corte + barba" nas confirmações e a disponibilidade considerar a soma.

## Correções de rota — avaliação e UX de serviços (2026-09-01)

**Regra enunciada pelo Saymon:** toda conversa INICIADA por nós (reativação,
lembrete, avaliação) sai pelo número central da API oficial; a Evolution só
responde quem falou primeiro. Reduz risco de banimento e mantém o número do
barbeiro fora da linha de tiro.

- Avaliação migrada da Evolution para a Cloud API (migration 0121): template
  `avaliacao_pos_atendimento` (rascunho, entra na leva a submeter à Meta) com
  3 botões (Otimo/Bom/Podia melhorar → notas 5/4/2); view `avaliacoes_a_pedir`
  agora é template-gated e usa o remetente central; `avaliacao_pedidos` guarda
  o wamid; RPC `responder_avaliacao` transforma clique em nota, devolve o texto
  pronto (nota 5 + link do Google) e sinaliza avisar o dono; nota <=3 vira
  alerta na auditoria (view `auditoria_avaliacao`). Webhook v10 tenta
  responder_avaliacao quando responder_lembrete não reconhece o wamid. Fluxo
  n8n NsHcELIXrETknywa republicado enviando sendTemplate + RPC com wamid.
  Testado no banco: clique→nota→resposta→alerta→clique repetido não duplica.
- UX de múltiplos serviços refeita (NewAppointmentModal): saíram os chips de
  "adicionais sugeridos"; entrou a mecânica da comanda — select + Adicionar,
  lista dos escolhidos com remover, badge "principal" no primeiro, total
  somado. Nada é sugerido ao barbeiro.

Pendente: a ferramenta "Registrar Avaliação" do agente continua existindo para
quem responder por texto no número da barbearia (caminho secundário) — avaliar
se vale manter depois de ver o uso real.
