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

### Uma vez só, para você

1. **Meta Business Manager** (`business.facebook.com`) — criar o negócio, se
   ainda não existir
2. **Verificação do negócio** (Business Verification) — CNPJ, documento e
   comprovante de endereço. Demora dias e é pré-requisito para sair dos limites
   de teste
3. **Meta for Developers** (`developers.facebook.com`) — criar um app do tipo
   *Business* e adicionar o produto **WhatsApp**
4. Pedir acesso a **Tech Provider** / *Embedded Signup*, se for pelo caminho
   recomendado da seção 3
5. Guardar **App ID**, **App Secret** e o **token permanente do sistema**

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
