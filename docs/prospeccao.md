# Prospecção — o script da venda ativa

Escrito em 2026-09-09. Existe porque o gargalo declarado em
[`mercado-e-roadmap.md`](mercado-e-roadmap.md) nunca foi de software:

> *"O gargalo não é o software. Com o v1 acima, o produto atende 200 barbearias
> tecnicamente. O que não existe é a máquina de distribuição: ninguém
> prospectando, nenhum canal, nenhuma prova social, nenhum caso de sucesso."*

A meta de compromisso de lá são **50 unidades**, ou 8 a 10 novos por mês —
factível com venda ativa de uma pessoa só. Este documento é o que essa pessoa
fala. Três canais: **WhatsApp**, **presencial** e **ligação**.

Não é texto para decorar. É para abrir no celular na porta da barbearia.

---

## 1. A regra-mãe: vender o funcionário, não o sistema

É a única frase deste documento que, sozinha, muda o resultado:

> *"Se o vendedor disser 'é um sistema de gestão', o cliente compara com
> R$ 79,90 e acha caro. Se disser 'é um funcionário que atende seu WhatsApp
> 24h, e vem com o sistema de gestão de brinde', o preço fica barato."*
> — `mercado-e-roadmap.md:75`

O levantamento de preço mostra dois mercados diferentes: CRM de barbearia custa
R$ 20 a R$ 110 (Tua Agenda R$19,90, AppBarber R$79,90, Trinks ~R$110). Agente de
IA no WhatsApp começa em R$ 199. **Estamos no segundo mercado.** Quem se
apresenta no primeiro perde a conversa antes de começar.

**Consequência prática:** as palavras *sistema*, *plataforma*, *CRM*, *software*
e *gestão* **não aparecem na abertura**. Em nenhum canal. Elas entram depois do
sim, quando viram "e ainda vem com".

O que se vende é o que a `visao.md` chama de dor central: **tempo de volta**.
Não organização.

---

## 2. A régua da verdade — o que pode e o que não pode ser dito

A página de vendas recusa explicitamente o *"reduza até 70%"* dos concorrentes,
por não conseguir provar. **Um vendedor que diz na rua o que o site recusa
destrói os dois.** Esta seção não é burocracia: é o que mantém o argumento de
pé.

### Pode — tudo verificável no produto

| Frase | Onde se verifica |
|---|---|
| "Você só paga por horário que o atendimento automático marcou" | `faixas_de_uso`, `faturas_de_uso` |
| "R$ 0,75 por agendamento; cai até R$ 0,60 conforme a equipe cresce" | `src/lib/planos.ts` (migration 0097) |
| "Mês sem agendamento pelo WhatsApp é mês sem cobrança" | FAQ, `AjudaPage` |
| "Horário que **você** marca na agenda não é cobrado. O do QR do balcão também não" | idem |
| "Lembrete e reativação não custam nada — se cobra o horário, não o recado" | idem |
| "7 dias com tudo liberado, sem cartão" | `DIAS_DE_TESTE`, `autosservico.md` |
| "Se o cliente não confirmar a reativação, o sistema cancela e nada é cobrado" | FAQ |
| Nomes reais: Dom Corte, Imperial Barber Club, Nobre Corte, Cavalheiro, Barbearia 013, Old School, Black Beard | `Depoimentos.tsx` — autorizados |

### Não pode — e o motivo de cada um

- **"Reduz no-show em 40 a 70%."** É de "várias fontes" do levantamento, não é
  dado nosso. A landing recusa essa faixa por escrito. Dizer na rua o que o
  site nega é a contradição mais cara que existe aqui.
- **Qualquer número atribuído a uma barbearia nossa.** Os 8 depoimentos têm o
  campo `resultado` **vazio em todos** — de propósito: nenhuma trouxe número
  conferido, e *"número torto é pior que nenhum número"*. Cite o nome e a
  frase; nunca invente o percentual.
- **"Seus dados têm backup."** Não têm: Supabase no plano gratuito, sem backup
  gerenciado — está em `estado-do-projeto.md` como o item que *"pode acabar com
  o negócio num dia"*. Se perguntarem, ver objeção 6.
- **Desconto, cortesia, mês grátis, "condição especial".** É a mesma fronteira
  que o agente de IA respeita (`visao.md`): não é seu para dar, e o sistema não
  registra. Preço combinado na conversa e não cobrado na fatura vira briga no
  primeiro fechamento.
- **Prazo, resultado ou garantia** ("em uma semana sua agenda enche", "se não
  gostar a gente devolve"). Nada disso existe em contrato.

**A justificativa comercial disso:** o modelo de cobrança já é o argumento mais
forte da mesa. Quem paga só pelo que o robô marcou não precisa de estatística
inventada — precisa entender que **o risco é zero**. Exagerar troca um argumento
sólido por um frágil.

---

## 3. Qualificar em 30 segundos

**Procurar** — sinais de que a dor existe agora:

- Instagram com *"chama no direct"* ou *"agende pelo WhatsApp"* na bio
- **2 ou mais barbeiros** — a dor de dividir atenção só existe com movimento
- Demora para responder: mande uma pergunta simples ("bom dia, tem horário
  sábado?") e cronometre. Duas horas de silêncio é o argumento inteiro, e ele
  é *dele*, não seu
- Já usa agendamento online: **não pule** — ele já entendeu o valor da agenda,
  a conversa vira "e quem responde a mensagem?"

**Pular:**

- Barbearia que **não agenda por WhatsApp** (fila por ordem de chegada, só
  balcão). Sem WhatsApp não há produto — o funil de `autosservico.md` é
  explícito: *"sem conectar o WhatsApp, o dono não tem produto nenhum; o CRM é
  uma agenda vazia"*
- Barbeiro sozinho, agenda vazia: o problema dele é cliente, não atendimento —
  e vender a coisa errada custa o cancelamento no mês seguinte
- Quem não é o dono (ver caminho C na seção 8)

---

## 4. WhatsApp

Duas regras que valem mais que o texto: **nada de link na primeira mensagem**
(cai em spam e queima o número), e **uma pergunta só**, sempre a última linha.

### Abertura A — o silêncio dele como prova

> Bom dia, [nome]! Aqui é o [seu nome], do Club Cut.
>
> Mandei uma mensagem pra vocês ontem às 22h perguntando preço de barba, e a
> resposta chegou hoje de manhã. Não é crítica — é o normal de quem tá com a
> máquina na mão.
>
> Eu resolvo exatamente isso: alguém responde e marca na agenda enquanto você
> corta. Posso te explicar em duas linhas?

Funciona porque não é argumento, é o que aconteceu. Só use se **de fato** você
mandou e cronometrou.

### Abertura B — quando não deu para testar antes

> Bom dia, [nome]! [seu nome], do Club Cut.
>
> Pergunta rápida: quantas mensagens de "tem horário hoje?" ficam sem resposta
> quando a barbearia tá cheia?

Pergunta que ele responde de cabeça, e a resposta é sempre desconfortável.

### O que fazer com cada resposta

| Ele responde | Você |
|---|---|
| Um número ("umas 10 por dia") | **Não calcule dinheiro na hora.** "Dez por dia é um barbeiro inteiro só respondendo. É isso que eu tiro de você." → segue pro pitch |
| "Poucas, dou conta" | "Boa. E de madrugada e domingo, quando a mensagem chega e você tá em casa?" |
| "Que que é isso?" | O pitch de três linhas (abaixo) |
| "Quanto custa?" | Vá direto ao preço. **Nunca** desvie — ver objeção 1 |
| Nada, 48h | Um follow-up só (seção 9) |

### O pitch — três linhas, sem a palavra "sistema"

> É um atendente que fica no WhatsApp da barbearia 24h. Cliente manda "tem
> horário sábado?", ele responde na hora, oferece os horários livres do
> barbeiro certo e marca — enquanto você corta.
>
> Você paga **R$ 0,75 por horário que ele marcar**. Só isso. Horário que você
> marca na agenda não é cobrado, e mês que ele não marcar nada é mês sem
> cobrança.
>
> Sete dias com tudo liberado pra você ver funcionando, sem cartão. Quer que eu
> deixe pronto?

---

## 5. Presencial

Três cenas, e a leitura de sala é o script inteiro.

**Ele está com cliente na cadeira.** Isso não é um obstáculo — é a demonstração.
Não fale de produto:

> Vim falar com o dono, mas vejo que tá no meio de um corte. Volto que horas?

Ele responde e você sai. Você acabou de fazer, ao vivo, o que o produto faz:
respeitou o cliente na cadeira. Na volta, comece por ali: *"lembra que eu não
quis te interromper ontem? Seu WhatsApp interrompe."*

**Ele está livre.** Abertura curta, e a demonstração no seu celular:

> [nome]? [seu nome], do Club Cut. Dois minutos, e se não fizer sentido eu saio.
>
> Manda uma mensagem pra esse número aqui como se você fosse cliente. Pergunta
> se tem horário sábado.

Ele mesmo digita. A resposta chega. **Isso vale mais que qualquer folheto**, e
é a única coisa que os concorrentes não conseguem repetir — eles têm
notificação, não conversa.

> Pré-requisito: um número de demonstração com uma barbearia de teste,
> catálogo preenchido e agenda com buracos. Sem isso, não vá. Demonstração que
> trava na frente do dono custa a barbearia inteira.

**Quem atende é o barbeiro/recepção.** Ver caminho C, seção 8.

---

## 6. Ligação

Dez segundos para não desligarem. Diga quem é, de onde, e por que agora:

> [nome]? Aqui é o [seu nome], do Club Cut, de Curitiba. Ligo por causa das
> mensagens que chegam na barbearia quando vocês tão cortando — tem um minuto
> ou ligo mais tarde?

O **"ou ligo mais tarde"** é o que faz funcionar: dá saída, e a saída vira
horário marcado em vez de "não".

Depois, o mesmo pitch de três linhas — mas **termine sempre em WhatsApp**:

> Te mando por WhatsApp o resumo e o link, aí você olha com calma. Esse número
> mesmo?

Ligação não fecha; ligação consegue permissão para o WhatsApp. E aí a mensagem
seguinte já não é fria — ele autorizou.

---

## 7. As objeções reais

**1. "Quanto custa?" / "Tá caro."**
Nunca desvie, e nunca compare com AppBarber. A resposta é o modelo, não o
número:

> Não tem mensalidade. Você paga R$ 0,75 por horário que o atendente marcar.
> Se ele marcar 40 no mês, deu R$ 30. Se marcar zero, você não paga nada.
> Horário que você marca na agenda não conta.

Se insistir na comparação: *"aqueles são agenda — te dão a tela, mas quem
responde a mensagem continua sendo você. Aqui você tá contratando quem
responde."*

**2. "Já tenho sistema."**
Não ataque o concorrente. Divida em dois:

> Ótimo, então a agenda tá resolvida. E quem responde o WhatsApp? Porque o
> lembrete automático que ele manda não é conversa — se o cliente responde
> "dá pra quinta?", quem lê é você.

**3. "IA erra" / "vai falar besteira com meu cliente."**
A objeção mais legítima da lista, e a resposta é a lista do que ele **não**
faz (`visao.md`): não dá desconto, não inventa preço fora do catálogo, não
promete resultado, não fala de química, alergia ou couro cabeludo, e não mexe
em horário de outro cliente. Fora disso, ele chama você e para.

> E tem o histórico: toda conversa fica registrada pra você conferir. Se ele
> fizer besteira, você vê — e me cobra.

Essa objeção **não se vence com promessa**, se vence com os 7 dias.

**4. "Meu cliente gosta de falar comigo."**
Concorde:

> Continua falando. Ele responde "tem horário sábado?" — a parte chata. Quando
> o cliente quer falar com você de verdade, ele te chama, e o atendente sai da
> frente.

**5. "Meu cliente vai saber que é robô?"**
**Diga a verdade, e ela é o diferencial:**

> Vai. A gente não acha certo enganar o seu cliente — o atendente não finge ser
> gente e não usa nome de pessoa.

Concorrente que batiza o robô de "Júlia" perde essa conversa. Está escrito no
`Depoimentos.tsx` como decisão de posicionamento, e o produto respeita.

**6. "E se eu perder meus dados?" / "É seguro?"**
Não prometa backup. O que é verdade:

> Cada barbearia enxerga só o que é dela — isso é garantido no banco, não na
> tela. Termos e política de privacidade estão publicados no site, com registro
> de aceite. Você exporta sua base em CSV quando quiser.

Se ele perguntar de backup diretamente, **não invente**. É item aberto do
projeto; a resposta honesta é "hoje a exportação é sua garantia" — e leve a
pergunta para o backlog.

**7. "Não tenho tempo de aprender."**
> Você não aprende nada. Escaneia um QR code com o WhatsApp da barbearia,
> igual WhatsApp Web, e pronto. Eu deixo o catálogo e os horários já
> preenchidos.

Verdadeiro: `ConvidarBarbearia` cria a barbearia com horário e catálogo padrão.

**8. "Depois eu vejo."**
> Fechado. Só uma coisa: o link que eu mando vale 10 dias, e os 7 dias de teste
> só começam quando você entrar — não corre relógio enquanto você não olhar.

Verdadeiro (`DIAS_DE_VALIDADE_DO_CONVITE`, `admin-invite-salon`), e tira a
pressa da decisão sem tirar o prazo.

---

## 8. O fechamento — e o degrau que derruba tudo depois dele

### O que você faz

1. `/admin/nova-barbearia` → **Convidar barbearia**
2. Nome da barbearia + e-mail do dono. Só isso — horário e catálogo padrão já
   vêm marcados, e ele corrige depois
3. Copie a **mensagem pronta** e o link, e mande

Os 7 dias começam quando ele entra pela primeira vez, não quando você gera.

### O degrau — e por que o script não acaba aqui

O funil de `autosservico.md`:

```
abordagem → cadastro → CONECTAR O WHATSAPP → primeiro agendamento → pagante
```

> *"O degrau do meio é específico deste produto e não existe na maioria dos
> SaaS: sem conectar o WhatsApp, o dono não tem produto nenhum."*

**Quem entrou e não conectou não voltou.** Então a conversa depois do sim tem um
objetivo só, e não é "achou bonito?":

> Entrou? Escaneia o QR na tela de Conexão com o WhatsApp da barbearia — leva
> um minuto e é o que liga tudo. Me chama que eu acompanho.

Se em 24h não conectou, ligue. Não mande mensagem: **ligue**. É o único ponto do
funil onde a ligação vale mais que o WhatsApp, porque o problema costuma ser
medo de desconectar o WhatsApp Web que ele já usa.

---

## 9. Follow-up — e quando parar

| Quando | O quê |
|---|---|
| +48h do silêncio | **Uma** mensagem, curta, sem cobrar resposta: *"[nome], sem pressa. Deixo o teste separado até sexta, é só falar."* |
| +7 dias | Última tentativa, com saída limpa: *"Vou parar de te incomodar. Se um dia o WhatsApp apertar, me chama."* |
| Depois disso | **Para.** Anota a data e volta em 3 meses |

Duas mensagens sem resposta é não. Três é queimar o número e a marca.

**Exceção:** quem entrou no teste e não conectou o WhatsApp não é follow-up de
prospecção, é ativação — e ali você insiste, porque ele já disse sim.

---

## 10. Os caminhos que ninguém previu

A régua do `CLAUDE.md` pede percorrer o que a pessoa faz quando não segue o
roteiro. Estes estão cobertos:

- **A. Não responde nunca.** Seção 9. Duas e para.
- **B. "Manda depois."** Objeção 8 — o prazo do link tira a pressa.
- **C. Quem atende não é o dono.** Não faça o pitch para quem não decide; você
  gasta a única chance. *"Você consegue me dizer o nome do dono e o melhor
  horário pra encontrar ele aqui?"* Nome + horário é a vitória do dia.
- **D. Já tentou outro sistema e desistiu.** É o melhor lead da lista. Pergunte
  **por que largou** e cale a boca — a resposta é o seu script para os
  próximos dez.
- **E. "Quero só a agenda, sem a IA."** Aceite, mas seja honesto sobre a conta:
  sem o atendente ele **não paga nada** e você também não ganha. Vale como
  entrada, e o WhatsApp costuma se vender sozinho na segunda semana.
- **F. Pede desconto.** Não existe (seção 2). E não precisa: *"o desconto já tá
  no modelo — se você não usar, você não paga."*
- **G. Rede com várias unidades.** Não venda unidade por unidade. Uma unidade
  no teste, e a rede entra depois em Configurações — o produto já suporta
  painel único e boleto único da rede.
- **H. Entrou e não conectou o WhatsApp.** Seção 8. Ligação em 24h.
- **I. Entrou, conectou, e o teste venceu sem uso.** Ele recebe aviso 3 dias
  antes e no dia. Se venceu em silêncio, ligue **uma vez** e pergunte o que
  faltou — essa resposta vale mais que a venda.
- **J. Já foi convidado antes.** Confira em `/admin` antes de abordar. Mandar
  segundo convite para quem já tem conta parece descontrole.
- **K. Ele pergunta algo que você não sabe.** *"Não sei, vou confirmar e te
  respondo hoje."* É a mesma fronteira do agente: fora do que está cadastrado,
  não decide — chama e para. Inventar aqui custa o cliente na primeira fatura.

**Fora de cobertura, declarado:** este script não cobre venda para salão de
beleza/estética (o vocabulário e as objeções mudam), não cobre indicação de
cliente existente (não há programa de indicação — foi removido da landing em
02/09 por não existir sistema por trás), e não cobre resposta a anúncio, que é
lead morno e merece roteiro próprio.

---

## 11. O que medir — senão nada disso melhora

O `estado-do-projeto.md` diz que o próximo passo é *"conseguir cinco barbearias
pagando, pelo convite, medindo ativação, retenção e custo real de IA — antes de
gastar com anúncio"*. Uma planilha com cinco colunas resolve:

`data | barbearia | canal (whats/presencial/ligação) | parou onde (sem resposta / não / entrou / conectou / pagou) | motivo do não`

A coluna que interessa é a última. Depois de vinte abordagens ela mostra se o
problema é a lista, a abertura, o preço ou o degrau do WhatsApp — e cada um tem
conserto diferente.

Não vale construir tela para isso agora: cinco colunas numa planilha respondem,
e tela sem dado é trabalho antes da hora.

---

## 12. O limite: quando isto vira automação, muda de assunto

Este documento é para **pessoa falando com pessoa**. Vale registrar a fronteira
antes que alguém a cruze sem perceber:

- **Disparo automático de abordagem fria não existe sem n8n** — regra do
  `CLAUDE.md`: *"nenhuma automação que fale com o cliente existe sem passar por
  aqui"*. E o `marketing.md:199` já separa os dois casos: *"número que nunca
  falou com a barbearia é abordagem fria — outro problema"*.
- **Número que nunca falou com você não pode receber envio em massa.** Não é só
  política da Meta (banimento do número): é base legal de LGPD, e o produto
  cobra opt-out obrigatório das próprias campanhas do dono. Fazer na
  prospecção o que proibimos no produto é insustentável.
- **Envio manual, um a um, de quem você pesquisou e vai atender de verdade** é
  outra coisa, e é o que este documento descreve.

Se um dia a prospecção virar fluxo, ela precisa de: consentimento ou base legal
registrada, opt-out em toda mensagem, origem e data de cada contato guardadas, e
o fluxo no n8n. Nada disso existe hoje — e por isso **não** está prometido aqui.
