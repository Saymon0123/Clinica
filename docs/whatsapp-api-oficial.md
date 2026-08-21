# Migrar para a API oficial da Meta, em coexistência

**Escrito em 2026-08-20. Nada implementado ainda** — este documento é o plano e
o passo a passo manual.

> **Leia primeiro a seção "O que muda o cálculo".** A premissa de que a API
> oficial sai barata tem prazo de validade: 1º de outubro de 2026.

---

## 1. O que muda o cálculo

Hoje o agente conversa pela Evolution API, que é não oficial: risco de
banimento, mas **custo zero por mensagem**. A conta é só a VPS.

Na API oficial, a Meta cobra por mensagem entregue, por categoria:

| Categoria | O que é | Preço hoje (Brasil) |
|---|---|---|
| **Serviço** | resposta livre dentro da janela de 24h aberta pelo cliente | **grátis** |
| **Utilidade** | template transacional (lembrete, confirmação) | ~R$ 0,04 |
| **Marketing** | template promocional | ~R$ 0,31 a R$ 0,38 |
| **Autenticação** | código de verificação | por país |

Quase tudo que o nosso agente faz é **serviço**: o cliente manda mensagem, o
agente responde dentro da janela. Isso hoje é de graça.

### O prazo

**A partir de 1º de outubro de 2026, mensagem de serviço passa a ser cobrada**,
com o mesmo preço de utilidade no país de destino. As fontes indicam também que
o template de utilidade perde a gratuidade que tinha dentro da janela de 24h.
A Meta anunciou em 1º de julho de 2026 e prometeu divulgar as tarifas finais por
país até **1º de setembro de 2026**.

**O que isso significa na prática:** a migração deixa de ser neutra em custo. Um
cliente que troca oito mensagens com o agente passa a custar oito cobranças, não
uma. Antes de decidir, é preciso medir quantas mensagens uma conversa média
gasta — e esse número nós temos, em `whatsapp_messages`.

> **Verificar antes de decidir:** confirmar as tarifas finais do Brasil na
> página oficial de preços da Meta depois de 1º de setembro. Este documento se
> baseia em fontes secundárias, não no anúncio oficial.

## 2. O que é coexistência, e o que ela não é

**É:** manter o número no **WhatsApp Business App** (o aplicativo do celular) e,
ao mesmo tempo, ligado à Cloud API. As mensagens dos dois lados são espelhadas
por webhook, então o barbeiro continua atendendo pelo celular e o agente
continua atendendo pela API, no mesmo número.

**Não é:** um jeito de pagar menos à Meta. A cobrança por mensagem enviada pela
API é a mesma. O que ela evita é a migração total, que **tira o número do
aplicativo** e obriga o barbeiro a atender só por painel.

**Por que ela é a escolha certa aqui:** o dono de barbearia não vai largar o
WhatsApp do celular. Uma migração total que o obrigue a isso não seria adotada.

### Limites que precisam entrar no contrato com o cliente

- **Não desinstalar o WhatsApp Business App** — desconecta a conta
- **Abrir o app ao menos uma vez a cada 13 dias**, senão a sincronia cai
- **Grupos não funcionam pela API** — só aparecem no aplicativo
- O número precisa estar no **Business App**, não no WhatsApp pessoal

## 2-A. Decisões tomadas em 2026-08-20

**Conexão: coexistência, com o QR na tela do dono do produto.**

Os dois pedidos originais — coexistência e conexão por código, sem QR — se
excluem. A Meta exige câmera e leitura de QR para coexistência; e para registrar
por código de SMS o número precisa antes ter a **conta de WhatsApp excluída**.

Não seguimos pelo código por dois motivos:

1. A barreira humana fica pior. "Preciso de um computador para mostrar o QR" é
   logística; **"preciso apagar meu WhatsApp"** é um não. O número do barbeiro
   guarda anos de conversa e contato — é o ativo dele.
2. Sem coexistência, **toda resposta manual do barbeiro vira mensagem de API
   cobrada**. Como o custo é do produto (ver abaixo), um barbeiro conversador
   consome a margem.

O problema do computador se resolve por logística, não por arquitetura: nesta
fase o onboarding é acompanhado, então **o QR aparece na tela do dono do
produto** e o barbeiro só precisa do celular na mão. Quando escalar, manda-se o
link do signup e ele abre num segundo aparelho.

**Cobrança: tudo sob o cartão do dono do produto.** Cada barbearia recebe uma
fatura variável no fim do mês, por **quantidade de agendamentos**, a R$ 0,60
cada. A Meta cobra o produto; o produto cobra a barbearia.

Consequências que vêm junto:

- **O risco de qualidade é seu.** Todas as WABAs no seu Business Manager: uma
  barbearia denunciada por spam mancha a sua conta e os seus limites de envio.
- **O desconto por volume passa a valer sobre o total**, o que joga a favor
  conforme o número de barbearias cresce.
- A fatura variável precisa ser gerada a partir da contagem de `appointments`
  por barbearia no mês — e o Asaas já está integrado.

### O número que decide se o modelo fecha

A conta desenhada foi: 100 agendamentos rendem R$ 60 contra R$ 15–20 de custo.
Isso pressupõe **4 a 5 mensagens cobradas por agendamento**.

Os únicos dados reais que existem hoje (2026-08-20) são de teste — **duas
conversas**, entre 02 e 07/08: **40 recebidas e 35 enviadas**, ou seja quase
**18 mensagens enviadas por conversa**.

A amostra não prova nada: são conversas de teste, do próprio dono, não de
cliente real. Mas mostra qual é a suposição que decide o negócio. A R$ 0,04 por
mensagem:

| Mensagens enviadas por agendamento | Custo Meta | Sobra de R$ 0,60 |
|---|---|---|
| 5 | R$ 0,20 | R$ 0,40 |
| 9 | R$ 0,36 | R$ 0,24 |
| 15 | R$ 0,60 | **zero** |
| 18 (o que o teste mostrou) | R$ 0,72 | **prejuízo** |

E isso antes da OpenAI.

**A consequência de projeto:** com a API oficial, **conversa longa vira custo**.
O número de idas e vindas do agente até fechar um agendamento deixa de ser
questão de experiência e passa a ser questão de margem. O prompt precisa ser
reescrito para fechar em menos turnos — e esse passa a ser um número a medir e
vigiar, como o teto de uso.

**Antes de migrar:** deixar o agente rodar com clientes reais o suficiente para
ter uma média honesta de mensagens enviadas por agendamento.

### Feito em 2026-08-20: o prompt foi reescrito para fechar em três mensagens

O fluxo `rJO1n7cFeNDIJyB5` teve o `systemMessage` alterado e **publicado**. Três
regras do prompt antigo obrigavam idas e voltas que não decidiam nada:

| Regra removida | Por que custava uma mensagem |
|---|---|
| *"pergunte se prefere manhã, tarde ou noite **antes de listar** horários"* | uma rodada inteira para descobrir o que a própria lista já mostra |
| *"se sobrarem dois ou mais barbeiros, **PARE** e pergunte a preferência"* | o nome do barbeiro cabe ao lado de cada horário |
| *"cliente novo: pergunte o nome e **espere** a resposta"* | cabia junto com serviço e dia |

O caminho agora é: **1)** pergunta tudo o que falta de uma vez, nome incluído;
**2)** oferece até cinco horários concretos com o nome do barbeiro em cada;
**3)** marca e confirma — porque escolher um horário da lista **já é** a
confirmação, e *"posso confirmar?"* é uma mensagem que não decide nada.

**O que não foi afrouxado:** a fronteira inteira, a proibição de inventar
serviço/preço/horário, o "nunca afirme o que você não fez", a exigência de
esperar o nome antes de cadastrar e a regra de não marcar com barbeiro fora da
jornada. Economizar mensagem não virou adivinhar — está escrito no prompt com
essas palavras.

**Falta medir.** A mudança é de instrução, não de código: só conversa real diz
se ela pega. Reconferir a média de enviadas por conversa depois de algumas
conversas novas.

## 3. A pergunta de negócio que precisa ser respondida antes do código

Cada barbearia tem o número dela. Na API oficial, cada número vive dentro de uma
**WABA** (WhatsApp Business Account), e **alguém paga a conta da Meta**.

Duas formas, e elas mudam o produto:

| | Quem paga a Meta | Consequência |
|---|---|---|
| **Cada barbearia com a própria WABA** | a barbearia | seu custo não cresce com o uso dela; ela precisa pôr um cartão internacional |
| **Tudo sob a sua conta** | você | cobrança simples para o cliente, mas o custo por mensagem vira seu, e escala junto |

**Recomendação:** a primeira. Você vira **Tech Provider** e usa o *Embedded
Signup* — o dono clica em "Conectar WhatsApp" no CRM, faz login no Facebook dele
e a WABA nasce no nome dele, com o cartão dele. Você não entra na conta.

Isso responde direto à sua preocupação com gasto: **o gasto não é seu.**

## 4. As cinco peças

| Peça | O que muda |
|---|---|
| **CRM** | a tela de Conexão deixa de mostrar QR da Evolution e passa a abrir o Embedded Signup da Meta |
| **Supabase** | `whatsapp_connections` troca `instance_name` por `phone_number_id` + `waba_id`; a edge function `whatsapp` troca a URL da Evolution pela Graph API; `_shared/instanceName.ts` morre |
| **Vercel** | variável nova do App ID da Meta exige **redeploy** |
| **GitHub** | commit e push |
| **n8n** | **todos os fluxos mudam.** Seis deles fazem `POST .../message/sendText/{instance}`. Passam a chamar `graph.facebook.com/v21.0/{phone_number_id}/messages`, com corpo diferente. O webhook de entrada também muda de formato |

**O `instanceName.ts` é o ponto mais delicado.** Ele é o único tradutor entre
tenant do CRM e número de WhatsApp, e o comentário dele diz por quê: o n8n
grava com `service_role`, que ignora RLS — se a tradução errar, a mensagem é
gravada na barbearia errada e nada impede. O substituto (`phone_number_id` →
`salon_id`) precisa da mesma cobertura de teste, e provavelmente de uma consulta
ao banco em vez de derivação por string.

## 5. Passo a passo manual — o que você faz com o número

Nada disto dá para eu fazer daqui: exige login no Facebook, celular na mão e
leitura de QR.

### Uma vez só, para você — a verificação do negócio

> **Correção de 2026-08-20:** este documento dizia que a verificação travava
> tudo e que era por onde começar. **Está errado, e a inversão importa.**
>
> Sem verificação nenhuma, a Meta libera **250 destinatários únicos por dia**,
> compartilhados entre todos os números do portfólio. São *destinatários*, não
> mensagens: um cliente que troca dez mensagens com o agente conta como um.
>
> Numa barbearia de cinco atendimentos por dia isso dá uns 10 únicos diários.
> **Há folga para ~25 barbearias antes de o limite apertar.** Verificado, o
> limite salta para 100 mil por dia.
>
> Portanto: **construa e valide primeiro, verifique depois** — perto das 20
> barbearias, quando já houver receita para pagar a burocracia. Apresentar a
> verificação como portão de entrada fez uma tarefa que não bloqueia nada
> parecer pré-requisito.

#### Se e quando for verificar: o que ter na mão

A lista abaixo é o **pior caso**. Na prática a Meta muitas vezes verifica
sozinha pelos registros públicos, e quando pede documento costuma pedir o que
falta, não tudo. Sendo MEI, o certificado do `gov.br` é um PDF só, grátis, que
prova existência e CNPJ ao mesmo tempo.

Tudo em PDF ou foto legível, com o documento inteiro visível (sem cortar bordas):

| Documento | Onde consegue |
|---|---|
| **Cartão CNPJ** (Comprovante de Inscrição) | `solucoes.receita.fazenda.gov.br` — grátis, emite na hora |
| **Contrato social** ou **Certificado MEI** | contador, ou `gov.br` no caso do MEI |
| **Comprovante de endereço da empresa** | conta de luz, água ou telefone, ou extrato bancário — **dos últimos 90 dias**, no nome da empresa |
| **Documento com foto** do responsável | RG ou CNH |

**A regra que mais reprova:** os dados que você digitar precisam bater
**exatamente** com o Cartão CNPJ. Razão social completa, sem abreviar; endereço
com o mesmo logradouro, número e complemento; CEP igual. "Rua" onde o cartão diz
"R." já é motivo de recusa.

#### Você também precisa de um site

A Meta confere se o site existe, se menciona a empresa e se tem forma de
contato. `clubcut.vercel.app` serve, mas domínio próprio passa com menos
atrito — e isso transforma o item "domínio" do backlog em **pré-requisito**,
não mais em melhoria.

O site precisa mostrar, em algum lugar visível: nome da empresa, CNPJ e um
contato.

#### O passo a passo

1. Entre em **`business.facebook.com`** com a sua conta do Facebook
2. Crie o **portfólio empresarial** (ou selecione o existente)
3. Vá em **Configurações do negócio → Informações do negócio** e preencha:
   razão social, CNPJ, endereço, telefone e site — **copiando do Cartão CNPJ**
4. Vá em **Central de Segurança** (*Security Center*) e clique em
   **Iniciar verificação**
5. Escolha **Brasil** e o tipo de empresa
6. Confira os dados na tela de revisão — é a última chance antes do envio
7. **Envie os documentos**
8. **Confirme o telefone** por código (SMS ou ligação). Use o telefone que está
   no Cartão CNPJ, se possível
9. Acompanhe o andamento na própria Central de Segurança

#### O que esperar

Normalmente **alguns dias úteis**. Se algum documento for recusado, o ciclo
recomeça — por isso vale conferir a correspondência dos dados antes de enviar,
e não depois.

### Meta for Developers — do começo ao fim

Este é o caminho que destrava de verdade, e nada aqui exige verificação nem
documento. Os rótulos da Meta mudam de tempos em tempos; a sequência, não.

#### 1. Conta de desenvolvedor

`developers.facebook.com` → **Começar** → confirmar e-mail e telefone. Usa a
mesma conta do Facebook do portfólio empresarial.

#### 2. Criar o app — CINCO etapas, verificado na tela em 2026-08-20

> **Correção:** este documento dizia para escolher o tipo **Empresa**. **Esse
> passo não existe mais.** A Meta trocou o sistema — agora é por *casos de uso*,
> e não há escolha de tipo em lugar nenhum. Foi isso que travou o dono do
> produto no passo 2.

**Meus Apps → Criar aplicativo.** Aparece um aviso sobre "uma nova maneira de
criar apps"; clique em **Criar app** para seguir.

O assistente tem cinco etapas, mostradas no topo:

**Detalhes do app → Casos de uso → Empresa → Requisitos → Visão geral**

1. **Detalhes do app** — só dois campos: **Nome do app** (`Club Cut`, até 30
   caracteres) e o e-mail de contato, que já vem preenchido. O botão
   **Avançar** fica cinza até o nome ser digitado.
2. **Casos de uso** — na coluna da esquerda, clique no filtro
   **Business Messaging (3)**. Aparecem três opções; marque a terceira:
   **"Conectar-se com clientes pelo WhatsApp"**.
   > O próprio texto dela avisa: *"É necessário um portfólio empresarial"*.
3. **Empresa** — é aqui que o app é vinculado ao portfólio empresarial. Se
   ainda não houver um, dá para criar nesta tela.
4. **Requisitos** — a Meta lista o que falta.
5. **Visão geral** — conferir e criar.

#### 3. O produto WhatsApp

No fluxo novo, escolher o caso de uso **"Conectar-se com clientes pelo
WhatsApp"** já traz o produto WhatsApp junto — não existe mais o passo separado
de "Adicionar produto".

A Meta cria sozinha, de graça:

- uma **WABA de teste**
- um **número de teste**, que não é o seu e não custa nada

#### 4. Testar tudo no número de teste, antes de encostar num número real

O número de teste envia para até **5 destinatários** que você cadastra na tela.
É o lugar certo para validar a integração inteira: webhook, envio, template,
botão. **Nenhuma barbearia é afetada, e não custa nada.**

Cadastre o seu próprio celular como destinatário e mande a primeira mensagem
pelo botão da própria tela — ela chega em segundos, e é a prova de que o
caminho existe.

> O número de teste **não** serve para coexistência. Ele é para validar; o
> número real da barbearia entra depois, no passo 7.

#### 5. Token permanente

O token que aparece na tela do painel **expira em 24 horas** — serve para o
primeiro teste e mais nada. Para o token que não vence:

**Configurações do negócio → Usuários → Usuários do sistema → Adicionar**

1. Crie um usuário do sistema com papel de **Administrador**
2. **Adicionar ativos** → marque o app e a WABA, com controle total
3. **Gerar novo token** → escolha o app → marque as permissões
   **`whatsapp_business_messaging`** e **`whatsapp_business_management`**
4. Escolha validade **Nunca**
5. **Copie o token na hora.** Ele não é mostrado de novo

#### 6. Webhook

É por aqui que a mensagem do cliente chega até nós.

**Painel do app → WhatsApp → Configuração → Webhook → Editar**

- **URL de callback:** o endereço da nossa edge function — *ainda não existe,
  vou construí-la*
- **Token de verificação:** uma senha qualquer que você inventa; ela só precisa
  ser a mesma dos dois lados
- Depois de salvar, em **Gerenciar**, assine o campo **`messages`**

> **Este passo depende de mim.** Faça os passos 1 a 5, e o 6 quando eu avisar
> que o endereço está no ar.

#### 7. O número real da barbearia

Só depois que o número de teste provou que tudo funciona. É o Embedded Signup
com coexistência — ver a seção 5 deste documento.

#### 8. Faturamento

**Configurações do negócio → Faturamento de WhatsApp** → cartão internacional.
Sem isso, os envios param assim que a cota gratuita inicial acaba.

#### 9. Templates

Submeter os 24 de [`templates-para-a-meta.md`](templates-para-a-meta.md).
Comece pelo `lembrete_agendamento`, sozinho, para ver que categoria a Meta
aplica antes de mandar o resto.

#### O que me passar no fim

| | Onde acha |
|---|---|
| **App ID** e **App Secret** | painel do app → Configurações → Básico |
| **Token permanente** | do passo 5 |
| **WABA ID** | painel do app → WhatsApp → Configuração da API |
| **Phone Number ID** | mesma tela, ao lado do número |
| **Token de verificação do webhook** | o que você inventou no passo 6 |

> **O selo verde é outra coisa.** Exige volume e reputação, não sai junto de
> nada disto, e **não é necessário**. Não perca tempo com ele.

### Para cada barbearia — a alteração no número

1. **Conferir onde o número está hoje.** Se estiver no WhatsApp comum, instalar
   o **WhatsApp Business App** e migrar por lá — o histórico vai junto. Se já
   estiver no Business App, seguir.
2. **Desconectar da Evolution.** Na Evolution, remover a instância
   `salon-<uuid>`; no celular, WhatsApp Business → **Aparelhos conectados** →
   sair de todos. Manter os dois pareados ao mesmo tempo é fonte de confusão e
   de risco de bloqueio.
3. **Abrir o Embedded Signup** (hoje, pelo painel da Meta; depois, pelo botão no
   CRM). Fazer login com o Facebook **do dono da barbearia**.
4. **Escolher "usar um número que já está no WhatsApp Business App"** — é esta
   opção que liga a coexistência. Se escolher a outra, o número é migrado por
   inteiro e some do celular.
5. **Ler o QR dentro do WhatsApp Business App**, em Configurações → Ferramentas
   comerciais. É o app do celular que confirma, não o navegador.
6. **Aguardar a sincronia.** Contatos e histórico recente são importados.
7. **Anotar o `phone_number_id` e o `waba_id`** que aparecem no painel — são
   eles que substituem o `instance_name` no nosso banco.
8. **Testar**: mandar uma mensagem de fora e conferir que ela aparece nos dois
   lados; responder pelo celular e conferir que o eco chega na API.

### O que avisar o dono, por escrito

- Não desinstalar o app
- Abrir o app pelo menos a cada 13 dias
- Grupos continuam só no celular
- Se ele sair de "Aparelhos conectados", derruba a coexistência

## 6. Inventário: tudo que manda ou recebe mensagem

Nenhum destes pode ficar para trás — quem ficar, fica **mudo**.

| Onde | O que faz | O que acontece na API oficial |
|---|---|---|
| **n8n — Atendimento WhatsApp** (`rJO1n7cFeNDIJyB5`) | recebe o webhook e responde | webhook muda de formato; resposta é **serviço** (grátis até 01/10/2026) |
| **n8n — Lembretes** (`DW0nq1Jyp9xeOJwm`) | lembrete 1h antes + confirmação 10min antes | **vira template de utilidade.** O cliente marcou há dias, então a janela de 24h está fechada e mensagem livre **não é entregue** |
| **n8n — Política de Atraso** (`67oZqGOIoKO6pAeQ`) | pergunta se o cliente está vindo | idem: **template de utilidade** |
| **n8n — Auditoria do Agente** (`7yliDoD9AaQp3Qcm`) | avisa você dos achados | template, ou manter fora da Meta (ver abaixo) |
| **n8n — Feedback dos Donos** (`BvWc74ctfqDZYmtK`) | avisa você do feedback | idem |
| **n8n — Aviso de Fim de Teste** (`Dz35hJOz7UJER1Ll`) | avisa o dono do vencimento | idem |
| **Edge function `whatsapp`** | `connect`, `status`, `disconnect`, `send`, `resume_agent` | `connect`/`disconnect` deixam de existir como QR da Evolution; `send` passa pela Graph API |
| **CRM — Conexão** | mostra QR e status | vira botão de Embedded Signup |
| **CRM — aba WEB** | o dono responde pelo painel | continua, mas o `send` por baixo muda; e **fora da janela de 24h ele não consegue iniciar conversa** sem template |
| **`_shared/instanceName.ts`** | traduz `salon-<uuid>` ↔ `salon_id` | morre; some substituído por `phone_number_id` → `salon_id` |
| **`scripts/evolution-*.mjs`** | criam/removem instâncias | deixam de servir |

### A consequência que muda funcionalidade, não só código

**Tudo que o sistema envia sem o cliente ter falado primeiro vira template
aprovado pela Meta.** Isso atinge lembrete, confirmação de chegada e política de
atraso — justamente as três coisas que fazem o produto valer.

Na prática:

- Cada texto precisa ser **cadastrado e aprovado** antes (leva de horas a dias),
  e só aceita variáveis em lugares definidos. Nada de texto livre montado em SQL
  como fazemos hoje
- Mudar a redação exige **nova aprovação**
- Cada envio custa (~R$ 0,04 hoje, categoria utilidade)
- Se for reprovado por parecer promocional, cai em **marketing**, a ~R$ 0,35

**As views que hoje montam o texto em SQL** (`vencimentos_a_avisar`,
`atrasos_para_perguntar`) precisam passar a devolver **o nome do template e os
parâmetros**, não a frase pronta. A regra continua no banco; muda o formato da
saída.

### Uma saída para os seus três alertas internos

Auditoria, feedback e aviso de vencimento são mensagens **para você e para os
donos** — não para clientes finais. Passá-las por template pago e aprovado é
caro e burocrático para pouca coisa.

Vale considerar tirá-las do WhatsApp: Telegram, e-mail ou push. Já existe o
`canal_de_alertas` (migration `0071`) centralizando o destino, então trocar o
meio é mexer num lugar só — e resolveria de uma vez a dependência da instância
da Curitiba, que já está no backlog.

## 7. Ordem sugerida

1. **Medir o custo antes de migrar** — quantas mensagens de serviço uma conversa
   média gasta hoje, por `whatsapp_messages`. Sem esse número, migrar é apostar
2. Confirmar as tarifas do Brasil depois de 1º de setembro
3. Decidir quem paga a Meta (seção 3)
4. Fazer **uma** barbearia inteira, de ponta a ponta, antes de tocar nas outras
5. Só então mexer nos seis fluxos do n8n

## 8. O que ainda falta para este plano fechar

O documento do modelo de coexistência que o dono do produto vai enviar. Até ele
chegar, **nada de código deve ser alterado** — os seis fluxos do n8n e a edge
function funcionam hoje, e trocá-los pela metade deixa as barbearias mudas.
