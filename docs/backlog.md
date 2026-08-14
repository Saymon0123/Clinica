# Backlog — achados durante testes e auditoria

Registro vivo do que foi identificado mas **não** corrigido, para não se perder
em conversa. Ordenado por risco dentro de cada bloco. Última revisão:
2026-07-29.

Consultável pelo grafo: `graphify query "backlog"` ou `graphify explain "<item>"`.

---

## Segurança

### ~~View `client_package_saldo` é SECURITY DEFINER~~ — RESOLVIDO
Era o único advisor de nível **ERROR** do projeto: a view estava em `public`,
exposta via PostgREST, e por ser SECURITY DEFINER ignorava o RLS de quem
consulta — qualquer usuário autenticado lia saldo de pacote de qualquer salão
com a chave anon.

Resolvido em 2026-08-02 pela `0026`, que removeu a view junto com as tabelas de
pacote (fora do escopo da v1). **Quando os pacotes voltarem na v3, a view precisa
nascer com `security_invoker = on`** — senão o mesmo furo volta com ela.

### ~~Rotacionar `EVOLUTION_API_KEY`~~ — FEITO PELO DONO em 2026-08-09
A chave foi rotacionada. O texto abaixo fica como registro do que motivou.

A chave foi exposta em texto puro num print durante os testes de 2026-07-29, e
ficou no histórico do PowerShell. É a credencial de administração do servidor
Evolution — permite criar, apagar e ler instâncias de WhatsApp de todos os
salões. Trocar no servidor e atualizar o secret no Supabase.

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

### ~~Laço infinito de render remontava as telas sem parar~~ — CORRIGIDO
Achado em 2026-08-02, perseguindo por que a aba WEB não abria a conversa
clicada. O `AuthContext` recriava o objeto `value` e as funções `signIn` /
`signOut` a cada render. O `SalonProvider` usa `signOut` nas dependências do
`carregar`, então cada render gerava um `carregar` novo → o efeito disparava →
`setUnidades` com array novo → render → repete, sem parar.

**Medido em produção: 93 buscas de `whatsapp_conversations` numa única visita.**
Depois da correção: 9.

O pior era colateral. Como o `loading` do salão oscilava junto, o
`RequireManager` alternava entre "Carregando..." e a tela, **desmontando a
página a cada volta**. Em telas sem estado local isso só queimava rede em
silêncio; na aba WEB zerava a conversa selecionada antes de aparecer — dava
para ver a requisição das mensagens saindo com o `conversation_id` certo e a
tela insistindo em "Selecione uma conversa".

`useCallback` e `useMemo` em provider **não são otimização, são correção**:
qualquer consumidor que use a função em lista de dependências entra em laço.

Lição de método junto: eu clicava e lia a tela na mesma chamada, antes de o
React renderizar, e concluí "não seleciona". Um `MutationObserver` mostrou que
estava selecionando o tempo todo. Para verificar efeito de clique em SPA,
observar a mutação — não ler logo depois.

### ~~Aba WEB: agente pausado sem caminho de volta~~ — CORRIGIDO
O botão "Devolver ao agente" só era renderizado com
`tab === 'precisa_dono' && needs_human`. Mas `agent_paused` vira `true` quando o
dono responde por **qualquer** conversa — então responder pela aba "Todas"
silenciava o agente para aquele cliente **sem deixar caminho de volta**. O
cliente mandava mensagem, ninguém respondia, e o dono não ficava sabendo. Pior:
`agent_paused` já vinha do banco e a tela não o usava em lugar nenhum, então o
estado era invisível e irreversível ao mesmo tempo.

Corrigido em 2026-08-02 (fase 1 dos ajustes da aba WEB), junto com a prévia da
última mensagem na lista e o contador de quem aguarda o dono. Verificado em
produção no cenário exato: conversa com `agent_paused = true` e
`needs_human = false`, devolvida ao agente pela aba "Todas".

### ~~Fluxo de lembretes quebrava no primeiro nó, sempre~~ — CORRIGIDO
Descoberto em 2026-08-02, na **primeira execução real**. O filtro
`client_id neq null` do nó Supabase manda a string literal `"null"` para o
PostgREST, que tenta converter para uuid e devolve `400 (22P02)`. A execução
morria no primeiro nó, em toda rodada.

O fluxo estava assim desde que foi criado. A nota anterior dizendo "não
verificado em execução" escondia isto: não era falta de verificação, era um
fluxo que nunca poderia ter funcionado. **Nenhuma revisão de código pegaria** —
só rodar pega.

Corrigido tirando o filtro da consulta e checando `client_id` dentro do nó de
classificação, que roda em JavaScript e trata `null` corretamente.

### ⚠️ Editar workflow no n8n não publica
Pegadinha operacional, ao lado de "migration não está no pipeline". As
alterações via API vão para o **rascunho**; o agendamento ativo continua
rodando a **versão publicada**. Em 2026-08-02 isso custou tempo: corrigi um
defeito, reexecutei, e o erro continuou idêntico — porque o que rodou foi a
versão antiga. Só percebi comparando os parâmetros na saída da execução.

**Depois de alterar qualquer fluxo, publicar.** E conferir o resultado pela
execução, não pelo editor.

### ~~Confirmação de chegada (10 min antes)~~ — VERIFICADA EM PRODUÇÃO
Feita e testada em 2026-08-02, no mesmo fluxo do lembrete. O ciclo completo foi
validado num **mesmo agendamento**: lembrete enviado a 59 minutos, **nenhuma
resposta do cliente**, confirmação enviada a 10 minutos, e as rodadas seguintes
não reenviaram nada. Era o caso que mais importava — quem não responde ao
lembrete é justamente quem tem mais chance de faltar.

São **duas mensagens separadas**, com perguntas diferentes:

- **~1h antes** — lembra do horário e pergunta se confirma que vem
- **~10 min antes** — pergunta se está a caminho, para o barbeiro saber do
  atraso antes de a cadeira ficar vazia

Como foi feito, e por quê: **uma consulta só**, cobrindo de 5 a 65 minutos, e um
nó `Classificar Envio` que decide o que cabe a cada agendamento. Duas consultas
separadas exigiriam duplicar o fluxo inteiro, porque todo o resto referencia o nó
de busca pelo nome. A classificação roda **antes** das consultas de
cliente/profissional/serviço — no meio da janela (15–55 min) não há mensagem a
enviar, e classificar depois desperdiçaria seis buscas por agendamento em cada
rodada de 10 minutos.

`appointments.confirmacao_enviada` (migration `0027`) é marcador próprio: usar
`lembrete_enviado` faria a confirmação nunca sair, porque o lembrete de 1h marca
o campo bem antes.

**Nunca executou.** Continua valendo o plano de ativação em
[`estado-do-projeto.md`](estado-do-projeto.md) — e agora o teste precisa cobrir
os dois disparos, não só um.

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

### ~~Fluxo de lembretes: 4 defeitos que impediam ativar~~ — CORRIGIDO
Aplicados em 2026-08-02, com o fluxo ainda inativo:

1. **Instância desconectada.** `Buscar Instância do Salão` filtrava só por
   `salon_id` e o IF checava apenas que `instance_name` existia. Passou a exigir
   `status = 'open'`. Sem isso, salão com WhatsApp caído marcava
   `lembrete_enviado = true` e tentava enviar por uma instância morta — dois dos
   três salões estavam assim.
2. **Falha derrubava o lote.** O nó de envio não tratava erro e, como o
   processamento é um a um em loop, um erro abortava a execução inteira: os
   agendamentos seguintes daquele ciclo ficavam sem lembrete. Agora usa
   `continueErrorOutput`, com a saída de erro voltando para o loop.
3. **Barbearia suspensa continuava mandando.** O fluxo principal tem "Barbearia
   Ativa?"; este não tinha. Adicionados `Buscar Salão (Lembrete)` e
   `Barbearia Ativa? (Lembrete)`.
4. **Cliente sem telefone.** Sem conversa e sem telefone, o número montado virava
   literalmente `55`. O IF de pulo (renomeado para `Pular Lembrete?`) passou a
   pular também nesse caso.

**Ainda não executou uma vez.** A primeira execução real continua sendo a
validação — ver o plano de ativação em [`estado-do-projeto.md`](estado-do-projeto.md).

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

## Serviço de e-mail — SMTP próprio configurado, falta domínio
Era o SMTP embutido do Supabase (`noreply@mail.app.supabase.io`), limitado a
poucas mensagens por hora. **Resolvido em 2026-08-02:** o dono configurou SMTP
próprio em *Authentication → Emails → SMTP Settings*, com endereço de remetente
próprio. Os logs de auth registram `env GOTRUE_RATE_LIMIT_EMAIL_SENT changed` em
02/08 00:53, e os `/recover` seguintes pararam de dar `429 email rate limit
exceeded`.

> ⚠️ Esta seção **não é verificável pelo MCP** — não há ferramenta que leia a
> configuração de Auth do Supabase (conferido no catálogo e em `get_project`).
> O estado acima veio do dono. Não reportar como defeito sem perguntar.

Continua em pé o `429: For security purposes, you can only request this after N
seconds`: é o intervalo mínimo **por endereço**, independente do SMTP, e some só
ajustando *Authentication → Rate Limits*.

O que falta é **domínio próprio**: o remetente ainda é um endereço pessoal e o
CRM vive num subdomínio da Vercel. Comprar o domínio resolve de uma vez o
remetente, a URL do CRM, o `VITE_APP_URL` e o Site URL do Supabase — e é o
momento natural de aplicar o nome novo do projeto.

### ~~Lista de URLs permitidas e Site URL errados~~ — CORRIGIDO PELO DONO
Em 2026-08-02 o Site URL estava como `https://clinica-crm-kappa.vercel.app/login`
(com caminho) e as duas Redirect URLs apareciam coladas numa entrada só
(`.../**ehttp://localhost:5173/**`, "Total URLs: 1"). **O dono corrigiu**: Site
URL sem o caminho e as URLs separadas, uma por linha. Mesma ressalva do item
acima — não dá para conferir pelo MCP.

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

### ~~Wizard de criação não pede comissão nem jornada~~ — JÁ ESTAVA CORRIGIDO
Reaberto em 2026-08-09 para consertar, e a verificação mostrou que **já estava
feito**: o wizard pede a comissão do dono (`SalonWizard.tsx:448`) e
`admin-create-salon` grava a jornada derivada do horário de funcionamento
(`jornadaDoHorario`, linha 74). O que envelheceu foi este registro.

Conferido no dado real: **Samuel Rocha**, cadastrada em 05/08, nasceu com 6
linhas de jornada e comissão definida.

O que sobrou era **dado legado** das barbearias de 31/07, anteriores à correção.
São José dos Pinhais estava com zero jornada — exatamente o que a regra 5 da
auditoria acusa — e foi preenchida com a mesma regra da edge function, para o
legado não divergir do que nasce hoje.

**Pendência de decisão, não de código:** um profissional em São José e um em
Curitiba seguem com `comissao_percentual` nulo, e o Financeiro deles calcula
zero. É combinado comercial — o dono define na aba Equipe.

Lição de método: item de backlog descreve o dia em que foi escrito, não o de
hoje. Conferir no código antes de reabrir — eu quase reconstruí o que já existia.

### Pacotes de crédito e planos não têm interface
7 tabelas com RLS e policies completas (`packages`, `package_items`,
`client_packages`, `client_package_credits`, `package_usages`, `plans`,
`subscriptions`) e **zero** referências em `src/`. Não podem ser testados pelo
CRM.

### ~~Preço dos planos: `visao.md` e banco discordam~~ — CORRIGIDO
O banco tinha Básico R$ 97 e Pro R$ 197; a [`visao.md`](visao.md) dizia R$ 197 e
R$ 299. O dono confirmou em 2026-08-02 que a visão é a fonte de verdade, e
`plans.preco_unidade` foi corrigido.

Ficou uma ponta: **`preco_unidade_rede` continua em R$ 77 e R$ 157**, valores
proporcionais aos preços antigos (davam ~80% do preço de unidade; agora são 39%
e 53%). Rede é v2 e não há cliente, então não urge — mas é preço, e precisa de
decisão antes de a rede voltar.

Aprendizado que fica: `subscriptions.valor` é **congelado no cadastro** de
propósito, então mudar `plans` não alcança quem já assinou. Foi preciso um
`update` explícito nas assinaturas existentes. Com cliente real, isso é uma
decisão comercial (respeitar o preço antigo ou reajustar), não um detalhe
técnico.

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

## Lembrete só para quem já conversou

 — o fluxo de lembretes enviava para clientes que **nunca** haviam
trocado mensagem com a barbearia, montando o número a partir do cadastro
(). Isso é conversa fria saindo de um número automatizado, que
é o comportamento que mais aciona bloqueio de número pela Meta.

Corrigido no : sem conversa, sem lembrete. O envio também
deixou de ter o fallback — agora só usa o  da conversa.

**Troca consciente:** perde-se alcance (cliente cadastrado na mão nunca recebe
lembrete até escrever uma vez) e ganha-se a segurança do número da barbearia,
que é o ativo mais caro dela. Se o número cair, ela não perde o CRM — perde o
canal de vendas.

Ficou um ramo morto:  não é mais alcançado. Mantido
para não mexer nas ligações; sai numa limpeza.

## Trocar o domínio do CRM

`2026-08-05` — o endereço atual é `clinica-crm-kappa.vercel.app`, e "clinica" confunde
o dono de barbearia no primeiro contato. Nome candidato: **Cadeira Cheia**
(`cadeiracheia.com` estava livre; o `.com.br` é no Registro.br, que a Vercel não
registra).

**Nada disso é feito pelo MCP** — nem a Vercel (a conexão não enxerga o projeto,
e não há ferramenta de renomear nem de variável de ambiente) nem a config de
Auth e os secrets do Supabase. É tudo painel.

Ordem que evita janela com convite quebrado — os dois endereços funcionam ao
mesmo tempo durante a troca, porque a Vercel mantém o antigo como apelido:

1. Supabase → Authentication → URL Configuration: **adicionar** o domínio novo
   em Redirect URLs, mantendo o antigo
2. Vercel → Settings → General → Project Name: renomear
3. Supabase → secret `APP_URL` (usado pela `admin-create-salon` no e-mail de
   boas-vindas do dono novo)
4. Vercel → `VITE_APP_URL` **e redeploy** — o Vite embute em build time, mudar a
   variável sozinha não faz efeito
5. Conferir de fora: domínio novo servindo, login, convite e redefinição de senha
6. Só então remover o domínio antigo das Redirect URLs

No código, o fallback em `admin-create-salon/index.ts:6` aponta para o domínio
antigo. Hoje não é usado (o secret existe), mas vira armadilha silenciosa se o
secret sumir — atualizar junto.

Se um domínio próprio (`.com.br`) estiver próximo, vale fazer **uma vez só**: são
exatamente os mesmos seis passos.
