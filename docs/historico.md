# Histórico — o que já foi resolvido

Cada item aqui foi um defeito real ou uma decisão tomada, com o motivo e o que
se aprendeu. Saiu do [`backlog.md`](backlog.md) em 2026-08-16 para ele voltar
a ser uma lista de trabalho.

Não é arquivo morto: é onde se procura *"por que isso é assim?"* antes de mexer
em algo que parece estranho. Boa parte do que está aqui foi descoberto rodando,
não lendo.

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

## Infraestrutura e manutenção

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

## Cobrança pelo Asaas

### ~~Primeiro pagamento real do projeto~~ — FEITO em 2026-08-16

Percorrido o caminho inteiro, do zero, com dinheiro de verdade: cadastro aberto
pela página de vendas, e-mail confirmado, barbearia criada, assinatura,
pagamento no cartão e **acesso liberado pelo webhook, sem intervenção manual**.

O que o webhook fez sozinho: `pendente` → `ativa`, `acesso_ate` um mês à
frente do pagamento, e `atendimento_ate` três dias depois — a carência do
WhatsApp aplicada automaticamente.

**Pix e boleto estavam bloqueados** na conta do Asaas (conta de produção nova,
pendente de análise). O cartão passou. Vale saber que o primeiro meio a liberar
foi o cartão, não o Pix.

