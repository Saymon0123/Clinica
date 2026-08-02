# Aba Marketing — campanhas de desconto por WhatsApp

> ## ⚠️ Fora do escopo atual — reentra na v3
>
> Projetado, construído (fase 1) e **removido do produto em 2026-08-02**, para
> alinhar o projeto ao roteiro: "Recuperação de clientes antigos" é o item 3 da
> **v3**, e tinha sido antecipado. Nada disso existe hoje no CRM nem no banco —
> a migration `0026_reduz_escopo_v1.sql` removeu as funções e a tabela
> `client_marketing`.
>
> **Este documento é mantido de propósito.** O desenho, as decisões tomadas e o
> raciocínio do ponto de equilíbrio custaram trabalho e continuam válidos; jogar
> fora significaria recomeçar do zero na v3. Para recuperar o código, ver as
> migrations `0025`/`0026` e o diretório `src/features/marketing/` no histórico
> do git (último commit com ele: `f5dbc03`).
>
> O que foi aprendido testando com dado real, e que vale carregar para a v3:
> o ponto de equilíbrio precisa cobrir o **vazamento** (desconto dado a quem
> voltaria sozinho), não o desconto inteiro; e o segmento de horário ocioso, do
> jeito que ficou, **dava prejuízo** — porque convida cliente ativo em vez de
> convidar para a faixa vazia.

Desenho da aba de marketing, decidido em 2026-08-02. Dono e gerente lançam
campanhas de desconto para os clientes da barbearia, enviadas pelo WhatsApp do
próprio salão.

**Decisões travadas:**
- o desconto vira **cupom real amarrado à venda** (não é só texto na mensagem)
- o **n8n executa o envio**, seguindo o padrão do resto do produto
- v1 cobre **quatro segmentos**: sumidos, aniversariantes, horário ocioso e
  vieram-uma-vez-só
- a campanha guarda a **regra**, não a lista — a elegibilidade é resolvida no envio
- quem absorve o desconto (barbearia ou barbeiro) é **opção do dono**
- dono de rede escolhe **quais unidades participam**
- a mensagem vem de **modelos prontos editáveis**, um conjunto por segmento
- cupom **não acumula**: vale a melhor vantagem para o cliente
- **o barbeiro aplica o cupom sozinho** na comanda

Onde está escrito **`[ABERTO]`**, a resposta ainda não existe — perguntar, não
preencher por conta própria.

---

## 1. O problema que a aba resolve

Enviar mensagem em massa é a parte fácil: a edge function `whatsapp` já expõe
`sendText` na Evolution API. O que trava o dono é **decidir**: quanto de
desconto, para quem, e se compensa.

Por isso a aba **não abre num formulário em branco**. Abre numa lista de
oportunidades já calculadas pelo banco, e o dono aprova. A pergunta que a tela
responde antes de qualquer coisa é *"vale a pena?"*, não *"o que eu escrevo?"*.

## 2. Tela inicial — oportunidades

Cards calculados por RPC no Postgres a partir de `appointments`, `orders`,
`order_items` e `clients`.

| Segmento | Regra | Por que importa |
|---|---|---|
| **Sumidos** | último `appointment.status = 'concluido'` há mais de 60 dias | é a "Recuperação de clientes antigos" prometida no plano Pro |
| **Vieram uma vez só** | exatamente 1 atendimento concluído, há mais de 30 dias | falha de retenção, não de aquisição — público diferente do sumido |
| **Aniversariantes do mês** | `clients.aniversario` no mês corrente | o campo já existe, custo de modelagem quase zero |
| **Horário ocioso** | faixas de dia/hora com ocupação abaixo de um limite | desconto que preenche terça de manhã **não canibaliza** venda que já aconteceria |

Cada card mostra quatro números: **quantos clientes**, **ticket médio do
grupo**, **faturamento potencial** e **quando esse grupo recebeu campanha pela
última vez**.

O ticket médio sai de `order_items` (`preco_unitario * quantidade`) das ordens
`fechada` daquele cliente, não do preço de tabela do serviço — o que importa é
o que ele realmente gasta.

### Segmento "horário ocioso" é diferente dos outros

Os três primeiros selecionam **pessoas**. O horário ocioso seleciona uma
**faixa da agenda**, e só depois escolhe quem convidar para ela. A regra:

1. Calcular a ocupação por (dia da semana, faixa de hora) nas últimas 4 semanas,
   dentro de `salons.horario_funcionamento` e de `professional_schedules`
2. Marcar as faixas abaixo do limite de ocupação
3. Convidar clientes ativos cujo histórico mostra que **conseguem** vir naquele
   horário — quem sempre marcou sábado às 10h não é público para terça às 9h

O passo 3 pode ficar para a v2; sem ele, o segmento ainda funciona convidando
os clientes ativos em geral, só com taxa de retorno menor.

### A campanha guarda a pergunta, não a resposta

Princípio central, decidido em 2026-08-02. Uma campanha **nunca** guarda uma
lista congelada de clientes. Guarda a **regra** ("sumidos há mais de 60 dias,
sem agendamento futuro"), e a lista é resolvida no momento do envio.

Isso resolve dois problemas de uma vez:

**Elegibilidade não envelhece.** Uma campanha criada na segunda e enviada na
sexta não pode alcançar quem marcou horário na quarta. Como a lista só existe no
envio, o cliente que deixou de ser elegível simplesmente não entra — não é uma
correção, é uma consequência do desenho.

**Reaproveitar campanha fica trivial.** O dono duplica a campanha do mês
passado, ajusta o desconto e dispara: a regra é a mesma, mas **o público é
outro**, porque outras pessoas sumiram desde então. Reaproveitar uma lista
congelada seria o pior resultado possível — mandar "sentimos sua falta" para
quem cortou o cabelo ontem.

Consequência na interface: o simulador mostra **"34 elegíveis agora"**, com a
palavra *agora* visível, e no envio aparece o número final com o que mudou —
*"31 enviados, 3 pulados: marcaram horário depois"*. O dono precisa ver que o
sistema protegeu ele, senão parece erro de contagem.

## 3. Simulador — é isso que faz o dono decidir

Ao abrir um segmento: três controles (percentual ou valor do desconto, validade
do cupom, quantos clientes incluir) e quatro números recalculados ao vivo.

- **Receita potencial** — clientes × ticket médio × taxa de retorno estimada
- **Desconto concedido** — o custo, se todos usarem
- **Resultado líquido**
- **Ponto de equilíbrio** — *"precisa trazer 6 dos 34 de volta para se pagar"*

O ponto de equilíbrio é o número que transforma "acho que vale" em decisão, e
deve ser o mais destacado da tela. É o único que não depende de estimativa de
conversão: é aritmética do desconto contra o ticket.

A taxa de retorno começa num padrão conservador (12%) e, a partir da segunda
campanha do salão, passa a usar **a taxa real medida** naquele salão — o que só
é possível porque o cupom fecha o ciclo (seção 5).

**Alerta de margem:** quando o desconto passa da margem do serviço, a tela
avisa. "Custo do serviço" aqui significa: um corte de R$ 50 **não** são R$ 50 no
bolso do dono. Sai dali a comissão do barbeiro e os insumos gastos (lâmina,
produto, toalha). Se o barbeiro leva 40%, sobram R$ 30 — e um desconto de 30%
(R$ 15) não come 30% do resultado, come **metade** dele.

Boa parte disso o sistema já sabe: `commissions.percentual_aplicado` guarda o
percentual real aplicado por item. Dá para calcular margem ≈ `preço − comissão`
sem inventar nada, e é o suficiente para o alerta ser honesto.

O que falta é só o **custo de insumo por serviço** — quanto de produto cada
corte consome. Não existe no schema e provavelmente não vale criar agora: é
cadastro chato para o dono e move pouco o número. **Recomendação:** usar
`preço − comissão` como margem e deixar o insumo de fora, declarando isso na
tela ("não considera produtos"). Fica **`[ABERTO]`** só se você quiser precisão
maior depois.

## 3.1 A mensagem — modelos prontos, editáveis

Campo em branco reproduz o problema que a aba existe para resolver: o dono trava
no "o que eu escrevo?". Cada segmento traz **2 a 3 textos prontos**, ele escolhe
um e ajusta o que quiser.

Variáveis preenchidas pelo sistema no envio: `{{nome}}` (primeiro nome do
cliente), `{{desconto}}`, `{{validade}}`, `{{salao}}`. Nome vazio precisa
degradar bem — "Oi!" e não "Oi , ".

Regras da tela:

- **preview no formato do WhatsApp**, com um cliente real do segmento, para o
  dono ver como chega de verdade
- o **opt-out é acrescentado pelo sistema**, não pelo dono, e não é editável —
  é a única linha que não pode faltar
- limite de tamanho: mensagem longa em campanha tem cara de spam
- sem link encurtado. Encurtador em disparo em massa é gatilho conhecido de
  bloqueio no WhatsApp

Os modelos ficam versionados no repositório (não em tabela) enquanto forem os
mesmos para todos os salões. Quando o tom de voz configurável da visão existir,
eles passam a ser o ponto natural de personalização.

## 4. Travas — o que impede o dono de se machucar

Sem estas regras a funcionalidade vira prejuízo ou número banido. Todas são do
banco e do fluxo, não da interface — a interface só as explica.

### Nunca enviar para quem já tem agendamento futuro
O erro número um desse tipo de ferramenta: dar desconto para uma venda que já
estava garantida. Filtro obrigatório em todo segmento: sem `appointments` com
`data_hora_inicio > now()` e status diferente de `cancelado`.

### Cooldown por cliente
Um cliente não recebe mais de uma campanha a cada 30 dias, **independente do
segmento**. Sem isso, quem cai em dois segmentos recebe duas mensagens e a
barbearia vira spam.

### Opt-out obrigatório
Toda mensagem oferece saída ("responda SAIR para não receber mais"). É LGPD e é
higiene do número.

⚠️ **Esta trava depende de trabalho fora deste repositório.** Reconhecer a
intenção de sair e gravar `client_marketing.opt_out` é do fluxo do agente no
n8n — e não basta casar a palavra "SAIR": o cliente escreve "não quero mais
receber isso", "para de mandar promoção". Enquanto o fluxo não fizer isso, o
opt-out existe no papel e não na prática, e o CRM só consegue oferecer a saída
manual (dono desmarcando na ficha do cliente).

### Só quem já conversou pelo WhatsApp
Envio só para clientes com linha em `whatsapp_conversations` daquele salão.
Número que nunca falou com a barbearia é abordagem fria — outro problema, outro
risco.

### Janela de envio e throttle
Horário comercial, lotes pequenos, intervalo aleatório entre mensagens, teto
diário. **O número é o do salão.** Se o WhatsApp bloquear, o negócio inteiro
para — não é uma degradação de funcionalidade, é a operação parando. A primeira
campanha de um salão deve ser deliberadamente pequena.

### Valores operacionais do v1

Números escolhidos por prudência, **não medidos**. Ficam em constante única, num
lugar só, porque vão ser ajustados assim que houver dado real de campo.

| Limite | v1 |
|---|---|
| Cooldown por cliente | 30 dias, entre campanhas de qualquer segmento |
| Janela de envio | 09h–20h, hora local do salão |
| Intervalo entre mensagens | aleatório, 20–60s |
| Teto diário por unidade | 100 mensagens |
| Primeira campanha do salão | teto reduzido, como aquecimento |
| Limiares de segmento (60 dias, etc.) | fixos; configuráveis numa versão futura |

Unidade com WhatsApp desconectado: a execução **falha com aviso**, não fica
pendurada em `enviando`.

## 5. O cupom precisa existir de verdade

Se a campanha for só texto, o barbeiro concede o desconto de cabeça, o desconto
vaza para quem não era do segmento, e o retorno é incalculável.

A campanha gera **uma oferta por cliente**, com código e validade. No
`NewSaleModal`, ao escolher o cliente, a tela mostra sozinha: *"este cliente tem
20% da campanha Sumidos-Agosto, válido até 31/08"*. O barbeiro aceita ou ignora.

É isso que permite dizer ao dono **"essa campanha gerou R$ 1.840"** — e é isso
que alimenta a taxa de retorno real do simulador.

### Cupom não acumula: vale a melhor

O cliente pode chegar na comanda com mais de uma vantagem — duas campanhas
válidas, ou um cupom mais um pacote de crédito ativo. **Uma vantagem por
venda**, e o sistema aplica automaticamente a de **maior valor para o cliente**,
mostrando qual ficou de fora e que continua válida.

Escolhi por cima do "barbeiro escolhe" porque a conversa acontece com o cliente
na cadeira: o barbeiro não deve ter que comparar cupom com saldo de pacote de
cabeça. E deixar quem tem pacote fora das campanhas seria excluir justamente o
cliente fiel.

A oferta não usada **não é queimada** — continua valendo até a validade.

### O barbeiro aplica sozinho

Sem aprovação de dono ou gerente. O desconto já foi autorizado quando a campanha
foi criada; pedir confirmação de novo trava o atendimento com o cliente na
cadeira, que é exatamente o tipo de fricção que o produto promete tirar.

O controle vem do registro, não do bloqueio: `orders.campaign_offer_id` diz de
qual campanha veio cada desconto concedido, e desconto fora de campanha não é
possível pela tela.

### Falta coluna de desconto na venda

`orders` e `order_items` **não têm nenhuma coluna de desconto** hoje. O cupom
exige criá-la, e a decisão de onde é relevante:

- **em `orders`** — desconto da comanda inteira, mais simples, suficiente para o
  caso "20% nessa visita"
- **em `order_items`** — desconto por item, permite "corte com desconto, produto
  sem", mas complica o fechamento e a comissão

Recomendação: `orders.desconto_valor` + `orders.campaign_offer_id`, e o desconto
por item fica para quando alguém pedir.

### Quem absorve o desconto: escolha do dono

Decidido em 2026-08-02: **é uma opção, não uma regra fixa.** `commissions` é
calculada sobre o item, então com desconto na comanda alguém precisa perder.

- `salons.desconto_reduz_comissao` — o padrão do salão, na aba Configurações
- sobrescrevível **por campanha**, porque a resposta muda com o caso: numa
  campanha de horário ocioso o barbeiro ganha um atendimento que não existiria
  (rateio faz sentido); numa campanha de aniversário ele perde comissão de um
  cliente que talvez viesse assim mesmo

O simulador mostra os dois lados, sempre: *"desconto de R$ 15 → você absorve
R$ 15"* contra *"você absorve R$ 9, o barbeiro R$ 6"*. Sem isso a opção vira uma
caixinha sem consequência visível.

**Padrão recomendado: a barbearia absorve.** O barbeiro não participa dessa
decisão e só descobre no dia do pagamento. Se o dono ligar o rateio, o
financeiro do barbeiro precisa mostrar o motivo da diferença — "desconto
campanha Sumidos-Agosto", não um valor menor sem explicação. É o tipo de coisa
silenciosa que quebra a confiança na ferramenta.

## 6. A resposta cai no agente — e ele precisa saber da oferta

O cliente responde *"quero usar meu desconto"* e o agente hoje não faz ideia do
que ele está falando. Duas exigências:

1. A mensagem da campanha é gravada em `whatsapp_messages`
   (`direction: 'out'`, `sender: 'agente'`) na conversa do cliente. Assim ela
   aparece na aba WEB e o histórico fica coerente.
2. Antes de responder, o agente consulta as ofertas ativas daquele cliente —
   uma ferramenta nova no fluxo do n8n.

Sem o passo 2, a campanha gera conversas que o agente não consegue conduzir, e
todas caem em `needs_human` — o oposto de devolver tempo ao dono.

`agent_paused` vale aqui também: se o dono assumiu aquela conversa, a campanha
**pula o cliente** (`motivo_pulo = 'conversa assumida pelo dono'`). Injetar
promoção automática no meio de um atendimento manual é o mesmo problema que o
`agent_paused` existe para evitar.

## 7. Modelo de dados

```
campaigns                      -- a definição (a "pergunta"), reaproveitável
  id, organization_id, nome, segmento jsonb, mensagem text,
  desconto_tipo text check (percentual | valor),
  desconto_valor numeric, validade_dias int,
  desconto_reduz_comissao boolean,      -- null = herda de salons
  cupom_vale_na_rede boolean default false,
  duplicada_de uuid references campaigns(id),
  created_by uuid, created_at

campaign_runs                  -- uma execução por unidade participante
  id, campaign_id, salon_id,
  status text check (rascunho | agendada | enviando | concluida | cancelada),
  agendada_para timestamptz, enviada_em,
  total_elegiveis int, total_enviados int, total_pulados int

campaign_recipients            -- criado NO ENVIO, nunca na criação
  id, run_id, client_id, telefone,
  status text check (enviado | falha | pulado),
  motivo_pulo text, sent_at, erro text

campaign_offers
  id, recipient_id, client_id, codigo text, validade date,
  usado_em timestamptz, order_id uuid

client_marketing
  client_id, opt_out boolean, opt_out_em, last_campaign_at
```

Os segmentos são **RPC no Postgres**, não lógica no front: o CRM e o n8n
precisam da mesma definição, e o front não deve conseguir montar um segmento que
burla as travas da seção 4.

RLS por `salon_id`, como o resto do schema. Lembrando que o n8n usa
`service_role` e **ignora RLS** — a responsabilidade de filtrar o salão certo é
do fluxo (ver `docs/n8n-integration.md`).

## 8. Execução do envio (n8n)

O CRM cria a campanha e os `campaign_runs` das unidades participantes. Ele
**não** envia nada, e **não** monta lista de destinatários. O n8n:

1. Busca `campaign_runs` `agendada` cuja hora chegou, dentro da janela permitida
2. **Resolve o segmento agora** (RPC), com todas as travas da seção 4 aplicadas
   — é aqui que a lista nasce
3. Grava os `campaign_recipients` do lote, incluindo os `pulado` com
   `motivo_pulo`, para o dono conseguir auditar quem ficou de fora e por quê
4. Envia pela Evolution, grava em `whatsapp_messages`, marca `enviado`
5. Espera o intervalo aleatório e repete até acabar

O passo 2 é o que torna o desenho seguro contra o intervalo entre criar e
enviar, e é o mesmo mecanismo que faz uma campanha duplicada alcançar o público
certo meses depois.

Falha de envio não pode travar o lote: marca `falha`, registra o erro, segue.

## 9. Resultado da campanha

Tela de detalhe, na ordem em que interessa ao dono — do fundo do funil para o
topo:

**faturamento gerado** → compareceram → agendaram → responderam → entregues →
enviados

Os dois primeiros são os que importam. Os últimos servem para diagnosticar
quando os primeiros vierem baixos.

## 10. Permissões e plano

`RequireManager` já existe: **dono e gerente** veem a aba, **barbeiro não**.

É funcionalidade do plano **Pro** pela própria tabela de planos da visão
("Recuperação de clientes antigos"). Vale nascer atrás do gate mesmo enquanto o
gate for manual.

### Rede — o dono escolhe as unidades participantes

Decidido em 2026-08-02. Ao criar a campanha, o dono de rede marca **quais
unidades participam** (todas, ou um subconjunto). Faz sentido: promoção existe
para resolver problema de unidade — a loja nova que precisa encher, não a que já
está lotada.

Tecnicamente isso **não é uma campanha que atravessa unidades**, e sim uma
definição compartilhada que se abre em uma campanha por unidade:

- cada unidade tem a **própria instância** de WhatsApp (`instance_name` por
  `salon_id`), então o envio é sempre pelo número da unidade — o cliente recebe
  da barbearia que ele conhece
- os segmentos rodam por unidade: "sumido" é sumido **daquela** unidade
- efeito colateral bom: como são números diferentes, as unidades enviam em
  paralelo sem somar no teto de mensagens de ninguém

O resultado consolida na tela do dono de rede (total gerado), com abertura por
unidade — que é onde o gerente de cada uma enxerga a parte dele.

Duas coisas a resolver:

- **o cupom vale em qualquer unidade?** O produto já tem esse conceito em
  `packages.vale_na_rede`. Recomendação: seguir a mesma lógica e deixar o dono
  escolher por campanha, com padrão **só na unidade que enviou** — senão a
  unidade que pagou o desconto não é a que recebe o cliente.
- **o gerente de unidade não pode recusar** no v1. O dono decide, mas a campanha
  aparece para o gerente antes do envio — ele precisa saber o que vai chegar nos
  clientes dele. Se na prática virar atrito, a recusa entra depois.

## 11. Ordem de entrega sugerida

1. **Segmentos + simulador, sem enviar nada.** O dono já enxerga as
   oportunidades e o ponto de equilíbrio. Entrega valor sozinho e valida se os
   números fazem sentido no salão real.
2. **Envio pelo n8n** com as travas e lotes pequenos, ainda sem cupom — desconto
   anotado na mensagem.
3. **Cupom real** (`orders.desconto_valor`) e o painel de faturamento gerado.
4. **Taxa de retorno real** alimentando o simulador, e o agente lendo as ofertas
   ativas.

A fase 1 é a que responde "vale a pena?", que é o problema original. As fases
seguintes só aumentam a confiança na resposta.

### Estado: fase 1 implementada (2026-08-02)

- `supabase/migrations/0025_marketing_segmentos.sql` — `client_marketing` com
  RLS, e as funções `marketing_segmentos`, `marketing_segmento_clientes`,
  `marketing_horarios_ociosos` e `marketing_comissao_media`. As travas de
  elegibilidade estão nas funções, não na tela, porque o n8n vai chamar as
  mesmas na fase 2.
- `src/features/marketing/` — `simulador.ts` (matemática pura, 14 testes),
  `useMarketingData.ts`, `MarketingPage.tsx` e `SimuladorModal.tsx`.
- Rota `/marketing` sob `RequireManager`, item no menu com `somenteGestor`.

**A migration ainda não foi aplicada em nenhum banco** — não há Docker nem
Supabase CLI na máquina de desenvolvimento, então o SQL não foi executado.
Aplicar e conferir os quatro segmentos com dado real é o próximo passo.

Sobre o ponto de equilíbrio, o código corrigiu uma conta que este documento
descrevia por cima: não é "quantos clientes pagam o desconto". Quem não volta não
custa nada, porque o desconto só é concedido a quem aparece. O custo real é o
desconto dado a **quem voltaria sem campanha nenhuma**, e o ponto de equilíbrio é
quantos clientes *além* desses precisam aparecer para cobrir esse vazamento. É
por isso que aumentar o desconto aumenta o número — e é isso que o simulador
mostra. O raciocínio está documentado no cabeçalho de `simulador.ts`.
