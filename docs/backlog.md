# Backlog — o que está aberto

Só o que **não** foi resolvido. O que já foi corrigido mora em
[`historico.md`](historico.md), junto com o motivo e a lição — material que
vale guardar, mas que atrapalhava quem vinha aqui procurar o que fazer.

Separados em 2026-08-16, quando este arquivo passou de 800 linhas e 41% dele
era passado.

Para o retrato de hoje, ver [`estado-do-projeto.md`](estado-do-projeto.md).
Consultável pelo grafo: `graphify query "backlog"`.

---

## Giro geral de 2026-09-10 — o que ficou aberto

Auditoria do projeto inteiro (5 frentes em paralelo + verificação direta no banco,
n8n e endpoints). Parecer completo em `docs/auditoria/00-giro-2026-09-10.md` —
**untracked de propósito: o repositório é público e o documento descreve falhas
ainda abertas.** Placar: 5 críticos, 16 altos, 17 médios, 3 achados refutados.

**Fechados neste mesmo dia** (PR "corrige-cobranca-critica"): o webhook que
engolia erro de UPDATE e perdia pagamento em silêncio; pagar a fatura de
cancelamento ressuscitando quem cancelou; a corrida do `cobrar-uso` gravando por
cima de outra execução; as 3 views de cobrança sem `security_invoker`; e o texto
que ainda prometia boleto e cartão (incluindo a política de privacidade nomeando
o Asaas como operador).

**Ainda aberto, por ordem de dor:**

1. ~~**PIX vencido nunca é reemitido**~~ — **RESOLVIDO em 10/09** (migration 0146 +
   botão "Gerar novo Pix" na aba Assinatura). A raiz era amarrar a validade do QR
   ao prazo da dívida; agora se separam: o QR é renovável e `cobranca_vence_em`
   não anda (senão o botão viraria "adiar o bloqueio para sempre"). Os ids
   antigos ficam em `pix_anteriores` e o webhook procura neles, então pagar o
   código velho depois de reemitir continua funcionando — testado.
2. ~~**Opt-out de LGPD é coluna morta**~~ — **RESOLVIDO em 10/09** (migration 0147).
   RPC `marcar_opt_out` + reconhecimento no `whatsapp-webhook` (botão "Nao quero
   mais receber" **e** "PARAR" digitado) + chave na ficha do cliente, que é o que
   `docs/marketing.md:195` já afirmava existir. O matcher mora em
   `supabase/functions/_shared/optOut.ts` com 9 testes de catraca.

   **CORREÇÃO (mesmo dia):** eu escrevi aqui, e no PR #90, que "o fluxo do n8n
   ainda não trata `acao: 'opt_out'`". **Era falso, e eu não tinha conferido.**
   Fui ler o fluxo `DW0nq1Jyp9xeOJwm`: o nó `É Reagendar Central?` só desvia
   quando a ação é `reagendar_central`; **tudo o mais cai em "Usar Resposta
   Pronta"**, que manda o campo `resposta` verbatim pelo número central. A
   confirmação do opt-out **já era enviada** desde o deploy, sem mudança nenhuma.
   Declarar pendência sem verificar é o mesmo pecado de declarar pronto sem
   verificar.

   **Não testado:** o caminho HTTP completo (Meta → webhook → RPC). O
   `WHATSAPP_APP_SECRET` só existe no cofre do Supabase e não pode ser lido de
   volta, então não dá para assinar um payload válido daqui. Testados à parte: o
   matcher (9 testes) e a RPC (com DDI, formatado, repetido, curto, vazio, nulo).
   O elo não coberto são as 3 linhas que ligam um ao outro.
3. ~~**Texto livre no número central morre em `console.error`**~~ — **RESOLVIDO
   em 10/09** (migration 0148). A RPC `barbearia_para_contato_central` descobre a
   qual barbearia apontar — pelo wamid da mensagem respondida (preciso) ou pelo
   atendimento mais recente do telefone (palpite ancorado) — e o webhook responde
   com o WhatsApp dela. Devolve zero linhas quando não dá para saber, e aí a
   resposta é genérica: **nunca um salão arbitrário, mas também nunca silêncio.**
   Freio de 3/h por telefone, senão dois auto-respondedores viram loop.

   *Nenhuma mudança de fluxo foi precisa no n8n* — o mesmo "Usar Resposta Pronta"
   serve. Só ajustei `Buscar Conversa (Resposta Lembrete)` para
   `onError: continueRegularOutput`: ele filtra `salon_id eq {{...}}` e, com
   `salon_id` nulo, o nó Supabase manda a **string `"null"`** ao PostgREST — a
   armadilha que este projeto já documentou como "mordeu duas vezes". A mensagem
   era enviada (o envio vem antes), mas o log falhava, tentava 4 vezes e
   disparava e-mail de alerta a cada opt-out. Registrar não pode derrubar quem
   já entregou.
4. ~~**Mensagem de cliente se perde quando o n8n falha**~~ — **RESOLVIDO em
   12/09** (migration 0162, "A3: a mensagem do cliente que some"), e esta
   entrada ficou **desatualizada por um dia**: ela continuou dizendo "falta a
   fila na entrada" depois de a fila existir.

   Conferido em 13/09: a tabela `mensagens_recebidas` e a view
   `mensagens_a_entregar` existem em produção, e o fluxo **"CRM Salao -
   Reentrega de Mensagens"** está ativo, rodando a cada 5 min. É exatamente o
   padrão de fila que este item pedia.

   **A lição é do backlog, não do código:** item marcado como aberto depois de
   fechado custa o mesmo que achado não registrado — alguém trabalha duas vezes,
   ou decide com base no que já não é verdade. Fechar tem de ser tão obrigatório
   quanto abrir.
   *(A metade do `.ok` foi resolvida em 10/09 — ver o item 4-b abaixo.)*

   **4-b.** ~~3 dos 4 POSTs ao n8n não checam `.ok`~~ — **RESOLVIDO em 10/09.**
   Os cinco POSTs de resposta passaram a usar um helper único, `entregarAoN8n`,
   que confere o status e manda ao Sentry quando falha — mais um `try/catch`
   que faltava: queda de rede subia a exceção e derrubava o processamento das
   **outras** mensagens do mesmo lote.

   Por que doía: quando o POST falhava, **o banco já tinha gravado e não dava
   para desfazer** — `responder_lembrete` casa por wamid e consome a
   idempotência ali. Clicar de novo devolvia `'repetido'` com `resposta: null`,
   e o silêncio virava definitivo. E o Sentry não via, porque 500 do n8n não é
   `throw`. O mais caro dos três levava junto o `avisar_dono` de **nota baixa**.

   Isto **não recupera** a mensagem — converte invisível em visível. A
   recuperação é a fila do item 4.
5. ~~**O lembrete chega depois que o cancelamento já travou**~~ — **RESOLVIDO em
   10/09.** O piso caiu de **2h para 30 min** (decisão do dono). O lembrete
   dispara a T-85..100min e agora cabe folgado dentro da janela em que dá para
   cancelar. Some também a assimetria: pelo botão do WhatsApp já dava, pelo link
   não. Provado nos três pontos — 180min cancela, **90min cancela** (era o caso
   recusado), 10min recusa com a frase nova.
6. ~~**Ninguém confirma agendamento ao cliente**~~ — **NÃO É PRECISO** (decisão
   do dono, 10/09), e a auditoria errou a conclusão:
   - `origem='agente'` → **o agente já confirma** na conversa, logo após marcar
   - `origem='crm'` → o cliente está **no balcão**, ouviu do barbeiro
   - `origem='publico'` (QR) → `AgendaPublicaPage.tsx:211-237` **já mostra**
     "Horário marcado!" com hora, profissional, serviço e o link de gestão
   - **aviso de cancelamento pela barbearia:** sem, por ora — quem perde o
     horário se resolve no balcão

   Custo de template evitado: **R$ 0,00** contra os ~R$ 4,90/mês por barbearia
   média que a versão por WhatsApp custaria. E vale registrar o que a conta
   revelou: `agendamentos_cobraveis` só fatura `agente` e `reativacao`
   confirmada — QR e balcão geram **R$ 0,00** de receita, então confirmá-los por
   template seria custo puro, e **quanto mais o QR desse certo, pior ficaria**.

   **Ficou em aberto na tela do QR:** ela não diz "hoje" em lugar nenhum, e o
   "salve nos favoritos ou tire um print" é frágil — quem fecha a aba perde o
   link de cancelar.

   **E uma pergunta de produto que o dono levantou:** o QR só marca para **hoje**,
   e a regra mora no servidor (`agenda-publica:242` e `:337`, `p_data: hoje` em
   São Paulo), não só na tela. Quem escaneia às 19h com a agenda cheia não
   consegue marcar para amanhã — vai embora. Foi decisão deliberada (superfície
   de abuso), mas vale reabrir: é o canal de captação do balcão funcionando meio
   período.
7. ~~**`faltou` não tem botão**~~ — **RESOLVIDO em 11/09 (migration 0153, "plano
   C" escolhido pelo dono).** A presença **continua deduzida** — a decisão de
   25/08 fica: o barbeiro não marca nada. O que mudou é o que o cron
   `cancela_agendamentos_sem_comanda` escreve: **`faltou`**, e não mais
   `cancelado`. A exceção é a reativação que o cliente **nunca aceitou**, que
   segue `cancelado` — foi o sistema que reservou, e sem o "sim" dele não é
   falta. Com isso a pausa após 2 faltas finalmente dispara.

   Como a falta agora é **dedução**, ela precisa de correção barata — e a
   correção é a própria venda:
   - **"Nova venda" pergunta**, ao escolher o cliente: *"João tem horário hoje às
     14:00 com Rafael. Esta venda é desse atendimento?"* "Sim" vincula, traz os
     serviços do horário e passa a venda para o barbeiro dele; "Não, é outra
     venda" segue solta. **A venda não sai sem resposta**, porque as duas
     omissões custam caro: concluir o horário das 16h com a venda de um produto
     às 10h, ou deixar como falta quem veio.
   - **"Concluir e cobrar" vale para `faltou`** — antes sumia junto com remarcar
     e cancelar. "Concluir sem cobrar" também corrige.
   - **O trigger da reativação desconta:** `faltou → concluido` desfaz a pausa
     que *aquela* falta causou (mesmo `now()` no carimbo), e nunca a pausa pedida
     pelo cliente; e a falta não sobrescreve pausa que já existia.
   - **Cadeira já ocupada** (a falta liberou o horário e alguém foi lançado nele):
     as travas recusam a correção com 23P01, e a tela explica e oferece
     "Desvincular", em vez do "tente novamente" que falharia para sempre.

   **Provado duas vezes:** no CI, por `supabase/tests/presenca_deduzida.test.sql`
   (14 asserções, banco criado do zero) e 8 testes de unidade da regra e do texto
   (`vinculoDeHorario.test.ts`); e **contra o banco de produção**, antes do
   merge, num ensaio que criou barbearia, clientes e horários de mentira, rodou
   a migration e o cron, e terminou em `raise exception` — tudo desfeito, e
   conferido depois (0 linhas do ensaio, funções antigas intactas). Resultado
   do ensaio: 6 horários varridos; balcão e agente viraram `faltou`; a
   reativação nunca aceita, `cancelado`; futuro, recente e concluído intocados;
   duas faltas pausaram o cliente e a correção despausou; a pausa pedida pelo
   cliente sobreviveu às duas; e a correção com cadeira ocupada devolveu 23P01.

   **O n8n não precisou mudar** — conferido nos 83 nós do agente: as consultas
   que filtram `status neq cancelado` só olham horário futuro, e falta é sempre
   passado. Nenhum fluxo lê `faltou` (o template `retorno_faltou` existe só em
   `docs/templates-para-a-meta.md`).

   **A Ajuda mentia, e deixou de mentir.** Prometia que "se você fechar a comanda
   depois, ele volta a ficar como concluído automaticamente". Não voltava: venda
   lançada por "Nova venda" não tinha vínculo nenhum com o horário. Agora é
   verdade, e o texto diz como fazer.

   **Efeito nos números:** resolvido no mesmo dia. No Financeiro e na Rede o
   card virou "Cancelamentos e faltas" (ver os achados do plano C, abaixo), e a
   soma é o número de antes — a comparação entre meses continua valendo. Só o
   card de cancelamentos do **agente**, na Conexão, cai: lá a falta de um
   horário que o agente marcou não é mérito nem culpa dele. **Agendamentos**
   passa a contar quem faltou (antes a falta virava cancelado e saía da conta).

   **Em produção desde 11/09, 05:00 UTC**, registrada no histórico de
   migrations; a execução do cron das 05:05 já rodou com a função nova, sem
   erro.

   **Testado pelo dono no navegador em 11/09** (a pergunta da "Nova venda").
8. ~~**`main` não é protegida**~~ — **RESOLVIDO em 10/09.** Regra ativa e
   **provada**: um `git push` direto na `main` volta com
   `GH006: Protected branch update failed`, citando "must be made through a pull
   request" e "2 of 2 required status checks are expected".

   O que está ligado:
   - **Checks obrigatórios:** `Typecheck, lint e testes de unidade` e
     `Testes de RLS (pgTAP)`. O Vercel **não** entra de propósito — é um status
     de deploy, e uma indisponibilidade dele travaria merge sem relação com
     qualidade de código.
   - **`enforce_admins: true`.** Sem isso a regra seria decorativa: você é o
     único colaborador e é admin, então poderia empurrar direto e o achado
     continuaria valendo.
   - **PR obrigatório com 0 aprovações.** Zero porque o GitHub não deixa ninguém
     aprovar o próprio PR — exigir 1 travaria você para sempre.
   - **`strict: false`** (não exige branch atualizada com a `main`): com um dev
     só, forçaria rebase a cada merge sem ganho real.
   - Force push e apagar a branch: bloqueados.

   **O que muda no seu dia:** não dá mais para `git push` na `main`. Toda mudança
   passa por branch + PR + CI verde. Para uma emergência, desligar em
   *Settings → Branches* (ou `gh api -X DELETE repos/:owner/:repo/branches/main/protection`)
   e religar depois — a fricção de ter que desligar é justamente o ponto.

   ~~**Continua aberto:** não há scanner de dependência no CI.~~ — **RESOLVIDO em
   12/09**: entraram `npm audit`, gitleaks, CodeQL e dependabot, mais um
   `deno check` para as edge functions, que não passavam por typecheck nenhum.
   Detalhe adiante, em *"M11 — a varredura que não existia"*.
9. ~~**Isolamento multi-tenant testado em 3 tabelas de 54**~~ — **RESOLVIDO em
   10/09** (`rls_isolamento_operacao.test.sql`, 22 asserções sobre 13 tabelas,
   incluindo as cinco **sem `salon_id`**, cujo isolamento depende do join ao
   pai). Rodou contra um banco criado do zero no CI e **nenhum vazamento
   apareceu**. Faltam as três filhas de pacote — está registrado adiante.

11. ~~**Erros da Meta são invisíveis por construção**~~ — **RESOLVIDO em 10/09**
    (migration 0152). O `if (valor.statuses?.length) continue` dos dois ramos
    virou registro: `failed` grava em `entregas_falhadas` (PK no wamid, então
    reentrega da Meta não conta duas vezes), o salão sai do wamid do lembrete ou
    do pedido de avaliação, e a view `auditoria_entrega` entra na fila
    `auditoria_pendente` **agrupada por número, não por mensagem** — cinco
    clientes com telefone errado virariam cinquenta avisos, e aviso demais é o
    mesmo que aviso nenhum.

    O dono lê, por exemplo: *"Joao da Silva (5541987654321) não recebeu 2
    mensagem(ns): o número não tem WhatsApp ou não pode receber. Confira o
    telefone na ficha do cliente."*

    Códigos de **conta** (131031, 133000/4/5/6, 368, 131056) não viram aviso ao
    dono — o problema não é o telefone do cliente dele. Esses sobem ao Sentry.

    **Escopo, como combinado:** o dono levantou que a janela de 24h deixa de ser
    grátis em 01/10 e que o 131047 perde relevância. Concordo — na prática todo
    texto livre do sistema responde a algo que o cliente acabou de fazer, com a
    janela aberta. O valor está no resto: **número inválido, bloqueio pelo
    cliente e template pausado por qualidade** não dependem de janela nenhuma.
    *(Correção de fato registrada: a janela não deixa de existir em outubro — ela
    é regra de PERMISSÃO, não de preço. Fora dela só passa template. Outubro
    muda o preço de quem está dentro.)*

    **Não testado:** o caminho HTTP (Meta → webhook → RPC), pela mesma razão de
    sempre — o `WHATSAPP_APP_SECRET` só existe no cofre e não dá para assinar
    payload daqui. Testadas as duas pontas: 7 casos sobre a RPC e a view.

    **Destrava quando** o dono salvar o secret em `~/.clubcut/meta.env`
    (combinado em 11/09; ele avisa quando salvar).

12. ~~**A agenda do dono não recarrega**~~ — **RESOLVIDO em 11/09.** O único
    canal Realtime que existia era o do aviso de reserva nova, no `AppLayout`:
    só `INSERT`, e sem falar com a tela da agenda. O cliente cancelava e a grade
    não mudava; o cliente marcava pelo QR, o aviso tocava e sumia, e a grade
    também não mudava — o barbeiro encaixava alguém e levava "já existe um
    agendamento nesse horário" num horário que a tela dele mostrava livre.
    Agora `useAgendaData` tem canal próprio (`INSERT` e `UPDATE`), recarga
    silenciosa que não pisca a tela, e duas redes para o que o Realtime não pega:
    ao reconectar (WebSocket caiu, eventos do intervalo perdidos) e ao voltar
    para o app.

    **Provado com experimento real contra produção:** dois canais, um filtrado
    na barbearia do teste e outro em outra; um agendamento que nasceu, foi
    cancelado e foi apagado. O canal da barbearia recebeu `["INSERT","UPDATE"]`;
    o da outra recebeu **`[]`**. O `UPDATE` chegando é o caso do cancelamento; o
    canal vazio prova que **não há vazamento entre barbearias** — nem do DELETE.

    **Sem `DELETE`, de propósito:** com REPLICA IDENTITY padrão o `old` só traz
    a chave primária, e o experimento confirmou que o DELETE filtrado **não
    chega** (em vez de vazar). Exclusão só nasce na própria tela — o "excluir de
    vez" do bloco cancelado e o rollback do cadastro que falha no meio —, e as
    duas já recarregam. Nenhuma função do banco apaga agendamento.

    **De quebra, uma trava que a mudança tornou necessária:** cada carga ganha
    um número e só a mais recente escreve na tela. Sem isso, uma resposta
    atrasada mostraria os horários do dia anterior sob o título do dia novo. A
    corrida já existia ao clicar rápido entre dias; o Realtime multiplicou as
    cargas concorrentes.

13. ~~**Erro de carga sem volta, e o vazio mente**~~ — **RESOLVIDO em 11/09.**
    Agenda, Vendas e WhatsApp trocaram o `ErroInline` (banner sem botão) pelo
    `ErroDeCarga` com "Tentar de novo" — o `reload` dos hooks estava
    desestruturado nas três telas e nunca era ligado. E vazios e contadores
    passaram a exigir `!error`: com a rede caída a Agenda dizia "Nenhum
    profissional cadastrado" numa barbearia com cinco barbeiros, e Vendas
    mostrava **"0 vendas · R$ 0,00"** — exatamente a mentira que o
    `ErroDeCarga` foi escrito para eliminar. Os `ErroInline` de **ação**
    (reagendar, enviar, retomar) ficaram: são outro tipo de erro.

    **Não verificado no navegador:** as três telas exigem login, e eu não entro
    com credencial de ninguém. A verificação foi typecheck, lint, leitura do
    fluxo e o experimento de Realtime acima.

    **Testado pelo dono no navegador em 11/09.**
10. ~~**Sem CPF/CNPJ = uso ilimitado sem bloqueio**~~ — **RESOLVIDO em 11/09
    (migration 0156), com o desenho decidido.** Era assim: o bloqueio olhava
    `cobranca_vence_em`, que só existe quando há cobrança.

    **DESENHO DECIDIDO (10/09):** o dono determinou trabalhar com **"emite nota
    fiscal = SIM"**. Isso escolhe o desenho: o documento **não** para de
    bloquear; ele muda **o que** bloqueia. Hoje o portão está na frente da
    *cobrança* (a receita evapora e a barbearia usa de graça); passa a ficar na
    frente do *acesso*. Documento exigido antes do fim do teste — o gancho
    natural é o fluxo "Aviso de Fim de Teste", que já dispara 3 dias antes e no
    dia — e sem ele o acesso é bloqueado como qualquer inadimplência.

    **Ressalva registrada:** eu levantei que a régua do MEI é *quem recebe*, não
    faturamento — MEI é dispensado para pessoa física e **obrigado** para pessoa
    jurídica, e barbearia com CNPJ é PJ. Os R$ 81.000 são o teto para permanecer
    MEI, não gatilho de NF. **Não sou contador**; a decisão de trabalhar com
    "SIM" é do dono e é a conservadora — se o contador disser o contrário,
    o desenho volta a ser o outro.

    Também faltam **razão social e endereço** para emitir: `salons.nome` é nome
    fantasia. A maioria das APIs de NFS-e resolve isso a partir do CNPJ na
    Receita; para tomador **CPF** não há de onde puxar, e `salons.endereco` é
    opcional hoje.

    **E o AbacatePay não ajuda em nada aqui** — verificado em 10/09: não tem
    NFS-e, e o `customerId` sequer se liga a cobrança `transparents` (a API
    engole campo desconhecido e devolve sucesso; provado com campo inventado).
    Nota fiscal exige fornecedor de outra categoria.

    **Como ficou (0156):** a renovação diária (`estender_acesso_sem_debito`,
    agora uma casca de `private.estender_acesso`) passou a exigir documento
    **válido** de quem paga — o da rede quando a cobrança é unificada, senão o
    da assinatura, a mesma escolha do `cobrar-uso`. Terminou o teste sem ele,
    o acesso não renova e bloqueia como inadimplência: CRM trancado, WhatsApp
    nos 3 dias de sempre. A tela de bloqueio pede o CPF ou CNPJ ali mesmo — só
    ao dono da unidade, que é quem a policy deixa gravar; o resto da equipe lê
    "avise o dono" —, e gatilhos em `subscriptions` e `organizations`
    destravam **na hora** em que o documento chega. `situacao_do_acesso` passou
    a dizer o motivo do bloqueio (`sem_documento`, `cobranca_vencida`,
    `cancelada`, `vencido`), e a faixa dos 3 últimos dias e a aba Assinatura
    pedem o documento antes de travar. Termos e Ajuda dizem a regra.

    **O gancho do WhatsApp não existia:** o "Aviso de Fim de Teste" nunca
    enviou nada, porque o modelo `fim_do_teste_gratis` segue **rascunho** na
    Meta e a view só manda com modelo aprovado. A Ajuda prometia esse aviso e
    deixou de prometer; o texto proposto do modelo, em
    `docs/templates-para-a-meta.md`, já pede o documento, para quando for
    submetido. Até lá, o aviso é só dentro do CRM.

    **Continua para depois:** emitir a nota em si (razão social, endereço e um
    fornecedor de NFS-e). A 0156 só garante que ninguém passa do teste sem
    documento.

    **Achado de passagem:** na primeira madrugada depois do teste, das 0h à
    1h20 de São Paulo (o cron roda às 04:20 UTC), a barbearia aparece bloqueada
    mesmo com documento, até o job renovar. É anterior à 0156; resolve
    adiantando o cron para logo depois da meia-noite de São Paulo.

**Dívida de rótulo no n8n (10/09):** o fluxo `8Qh33uoFm4VqT1eO` (Detalhamento de
Uso) foi migrado para PIX no funcional — lê `cobrancas_a_enviar`, grava
`abacate_pix_id`/`cobranca_notificada_em`, e o e-mail já manda copia-e-cola. Mas
os **nomes e as notas continuam do Asaas**: nós "Gerar Boletos", "Buscar Boletos
a Enviar", "Enviar Boleto ao Dono", "Marcar Boleto Enviado"; o sticky note diz "o
boleto é gerado À MÃO no Asaas"; a descrição do workflow idem; e notas citam
`asaas_payment_id`, coluna que não existe mais. Não quebra nada — engana quem
abrir. Sobrou da minha própria passada de n8n em 09/09.

*Conferido em 10/09, para não virar boato:* o nó "Gerar Boletos" **está
chamando `cobrar-uso` com a credencial certa** — a execução 22239 devolveu
`{"cobrancas":0,...}`, corpo real da função, não 401. Vale saber que o
`SUPABASE_SERVICE_ROLE_KEY` que a função enxerga é a chave **secret nova**, não a
`service_role` legada: chamar com a legada devolve 401.

### Decisões esperando o dono (registradas em 10/09)

Estavam só no chat. Pela regra da casa, o que não está aqui some do radar.

**Perguntas para a Meta** — nenhuma se responde lendo documentação; já procurei.
1. **Coexistence está liberada no Brasil?** A página dela não menciona país
   nenhum, nem para liberar nem para restringir. *Silêncio não é liberação.*
   (A restrição "Brazil or India" que aparece na doc é sobre criar WABA pelo Meta
   Business Suite — não toca Embedded Signup nem Coexistence. Já verificado.)
2. **A aprovação é Tech Provider ou Solution Partner?** Decide quem paga a Meta.
   Tech Provider = o cliente põe o cartão dele. Só Solution Partner tem *credit
   line* para o parceiro pagar — e é programa separado, com pré-requisito de ser
   Meta Business Partner e processo que a própria Meta chama de *"lengthy"*.
   **Virar Tech Partner NÃO dá credit line** (só treinamento, analytics e client
   matching); é armadilha fácil de cair.
3. **Como a franquia de 1.000 mensagens de serviço/mês se comporta num modelo de
   parceiro?** É **por número**: no modelo de número central atual, são 1.000
   para a plataforma inteira; com número por barbearia, 1.000 cada. A partir de
   **01/10/2026** serviço e utility dentro da janela passam a ser cobrados
   (confirmado em quatro BSPs; a página de preços da Meta ainda não refletia).

**Pré-requisito de produção — RESOLVIDO em 10/09 (migration 0151)**
- ~~A corrida do `cobrar-uso` é sinalizada, não impedida~~ → **impedida**. A
  ordem inverteu: `cobranca_reservada_em` é reivindicada **antes** de chamar o
  AbacatePay. Quem não consegue reservar nem chega a chamar a API, então o
  segundo PIX **nunca nasce**. Reivindicação parcial não serve — se o grupo tem
  3 faturas e só 2 foram pegas, a outra execução está com a terceira e vai
  cobrar o grupo inteiro; solta o que pegou e sai.
  Reserva órfã (processo morto entre reservar e gravar) é reciclada em 10 min,
  senão trocaríamos cobrança dupla por cobrança nenhuma, que é pior.

  **Provado sob concorrência real contra produção:** duas execuções disparadas
  ao mesmo tempo contra a mesma fatura. Uma gravou o PIX; a outra deixou no log
  `grupo pulado: outra execucao esta com ele ... 0 de 1` — ou seja, listou a
  fatura, tentou reservar, pegou zero, e **saiu antes de chamar o AbacatePay**.
  Um único `abacate_pix_id` no banco e reserva solta no fim.

**Teste de dois minutos que só o dono faz — FEITO em 11/09**
4. ~~De um número que nunca falou com a barbearia, mandar "oi" para o número dela.~~
   **Chegaram duas respostas?** Se sim, confirma que a saudação/ausência do app
   WhatsApp Business está duplicando com o agente da Evolution — e vira item de
   checklist de ativação. Se chegar só uma, o dispositivo vinculado já suprime o
   app e o problema é menor do que eu descrevi. *Não verifiquei; é dedução.*

   **O dono fez o teste em 11/09, e deu certo.**

**Escolhas minhas na migration 0149 — DECIDIDAS pelo dono em 10/09, migration 0150**
5. ~~`payments.valor >= 0`~~ → **`> 0`**. O dono confirmou que **não existe
   brinde nem cortesia** no produto. A janela que eu tinha deixado aberta não era
   corrupção de dado — era erro humano passando despercebido: comanda marcada
   como paga com R$ 0, caixa fechando certo, e dinheiro nenhum entrando.
6. ~~Convite vencido bloqueia reconvite~~ → **poda automática, 30 dias após o
   vencimento**. Ninguém precisa se preocupar. Entrou na
   `poda_historico_antigo`, que passou de **mensal para diária** — no ritmo
   mensal, "30 dias após o vencimento" viraria 30 a 60 na prática. Convite
   **aceito nunca é apagado**: é histórico de quem entrou na equipe.

**Cobertura que ficou faltando no A16 — RESOLVIDO em 11/09**
7. ~~Três tabelas **sem `salon_id`** ficaram de fora do
   `rls_isolamento_operacao.test.sql`~~: `pacote_itens`, `pacote_consumos` e
   `pacote_do_cliente_itens` entraram no mesmo arquivo, com o mesmo roteiro das
   outras: o dono do A enxerga só o que é dele, a escrita cruzada é barrada, e o
   espelho confere o lado do B. 7 asserções novas, 29 no arquivo.

**Faltas viraram dado com a 0153 — onde o dono quer ver o número?** (11/09) —
**DECIDIDO no mesmo dia:** o 4º card do Financeiro virou "Cancelamentos e
faltas", com a divisão ao lado do número ("3 cancelados · 2 não vieram"), e a
Rede ganhou o mesmo tratamento. A soma é o número que o card mostrava antes,
então a comparação entre meses continua valendo. Um 5º card ficaria sozinho
numa linha (a grade é de 4).
8. A falta aparece na **agenda** ("não veio", riscado) e no **histórico do
   cliente**, mas não existe como número em lugar nenhum: Financeiro, Rede e o
   resumo da reativação só contam cancelamentos. A 0063 chamou a falta de
   "justamente o número que interessa ao dono". Opções: um card "Não vieram" no
   Financeiro (o dado já vem na consulta que existe), uma coluna no resumo da
   reativação, ou nada por enquanto.

### Médios fechados em 11/09 (Fase 2)

- ~~**M6 — preço fantasma na comanda**~~ — a linha da comanda usava o índice
  como `key`. **Reproduzido** com React 19.2.7 e jsdom: itens A=10, B=20, C=30,
  remove o A → **B mostra 10 e C mostra 20**; com id estável, B mostra 20 e C
  mostra 30. Pior do que a auditoria descreveu: não era só a primeira linha —
  **toda linha abaixo da removida** passava a mostrar o preço da de cima. O
  valor gravado sempre esteve certo (vem do estado, não da caixa); o que mentia
  era o que o barbeiro lia, na tela que fecha dinheiro. Conserto: `chave`
  **obrigatória** no `SaleItemDraft`, gerada nos cinco pontos que criam item —
  obrigatória para o TypeScript recusar o próximo ponto que esquecer.
- ~~**M7 — tela de falha do boot ilegível no escuro**~~ — a caixa herdava o
  fundo do tema. Contraste recalculado à mão: **2,86:1** e **3,23:1** no escuro;
  com fundo branco próprio, **6,47:1** e **5,74:1**. Cor fixa e não token: a
  tela de falha não pode depender de mais nada estar de pé.
- ~~**M15 — `settingsOk` descartado pela tela**~~ — a edge sempre devolveu; a
  `ConexaoPage` não declarava o campo e jogava fora. Agora avisa, no mesmo
  padrão do aviso de webhook, que o agente pode responder em grupos.
- ~~**M9 — `/meu-horario` no fuso do navegador, e check verde para quem
  faltou**~~ — adiantado da Fase 3 e fechado junto com o A7: o mesmo PR passou a
  escrever `faltou`, e deixar a página como estava seria mostrar "Horário
  marcado ✓" a quem ficou como falta. Cada estado ganhou título próprio
  ("Atendimento concluído", "Horário cancelado", "Este horário já passou"), e
  todos terminam no botão de marcar de novo pelo WhatsApp. `faltou` diz "já
  passou", e não "você não veio", de propósito: a falta é deduzida e pode estar
  errada. Data e hora no fuso de São Paulo.

### Achados novos do plano C (11/09)

1. ~~**ALTO — uma venda qualquer desfaz o "não quero mais" da reativação.**~~
   **RESOLVIDO em 11/09 (migration 0154).** O
   passo 7 da `NewSaleModal` zera `reativacao_pausada_em` sempre que o campo
   "corta a cada quantas semanas?" está preenchido — e ele vem **preenchido
   sozinho** com o valor salvo do cliente. Quem tocou "Cancelar" no convite
   ouviu *"não vou mais reservar horário automático para você"*
   (`responder_lembrete`), mas `reativacao_semanas` não é apagado: na próxima
   visita, se o barbeiro não esvaziar o campo, a venda religa a reserva
   automática. Consentimento desfeito sem ninguém decidir — e mensagem para
   quem pediu para parar é o caminho do bloqueio. O opt-out de LGPD
   (`recusou_contato`) não é afetado. Vai com o A8 (Fase 4): a tela precisa
   mostrar que o cliente pediu para parar, e religar tem de ser escolha
   explícita.

   **Como ficou:** "Cancelar" no convite agora apaga também as semanas — a
   frase que o cliente ouviu vira verdade literal. Toda pausa grava o motivo
   (`reativacao_pausa_motivo`: `pediu_para_parar`, `faltas`, `sem_resposta`),
   e na "Nova venda" o campo de cliente pausado começa **vazio**, com a frase
   do motivo no lugar do número — em alerta quando foi o cliente que pediu
   ("Em 12/08, ele pediu pelo WhatsApp para não reservarmos mais. Só preencha
   se ele pedir de novo."). Preencher continua sendo o opt-in, e agora é
   sempre escolha de quem está no balcão. Antecipado da Fase 4 por ser
   promessa ao cliente sendo quebrada. Coberto por
   `pausa_da_reativacao.test.sql` (15 asserções) e 3 testes de unidade do texto.
   **Em produção desde 11/09, 05:40 UTC** — aplicada ANTES do merge, como a
   ordem exigia (a tela nova lê a coluna nova), e conferida: coluna, CHECK,
   três funções e registro no histórico. Site no ar às 05:41.
2. ~~**Qualquer venda salva apaga a "cobrança pendente"**~~ — **RESOLVIDO em
   11/09.** Era assim: qualquer venda apagava a pendência, mesmo a de outro
   cliente (`VendasSection → onVendaSalva → limparVendaPendente`, sem olhar o
   vínculo). O horário que esperava cobrança perde a faixa e vira "não veio" 15
   minutos depois do fim. É anterior ao plano C; ele só tornou mais comum ter
   duas vendas no expediente com uma pendência aberta.

   **Como ficou:** a venda devolve o horário que concluiu, e
   `quitarVendaPendente` só apaga a pendência se for DAQUELE horário (4 testes
   de unidade). A faixa ganhou "Dispensar", para quando o horário deixou de
   fazer sentido — antes ela só sumia cobrando, concluindo ou fechando o
   navegador.
3. ~~**Configuração que não faz nada**~~ — **RESOLVIDO em 11/09: o campo saiu
   da tela.** Era assim: o "atraso tolerado" de Configurações só
   alimenta a view `atrasos_para_perguntar`, lida pelo fluxo "Política de
   Atraso" do n8n (`67oZqGOIoKO6pAeQ`), que está **desligado**. O dono ajusta um
   número sem efeito. O comentário do código dizia que o campo também
   controlava o botão "Não veio" da faixa do balcão, que saiu em 25/08 —
   corrigido no plano C. Ligar o fluxo ou esconder o campo é decisão do dono.

   **Como ficou:** o dono escolheu esconder. A coluna
   `atraso_tolerado_minutos` fica no banco (padrão 10). Ligar o fluxo não é
   opção como ele está: foi desenhado para o barbeiro decidir na faixa do
   balcão, que não existe mais — ver a seção da política de atraso, adiante.

### Fase 3 (11/09) — agenda pública e telefone da barbearia

Estes três achados do giro não estavam neste backlog — só no parecer
(`docs/auditoria/`, fora do repositório). Registrados aqui ao serem resolvidos.

- ~~**A12 — barbearia atrasada no pagamento virava "Barbearia não
  encontrada"**~~ — **RESOLVIDO em 11/09.** `salons_atendendo` junta três
  situações (desativada, teste estourado, pagamento atrasado), e a
  `agenda-publica` tratava as três como link errado: o cliente de pé no balcão,
  com o cartaz na frente, lia "confira o link". Agora, quando a barbearia existe
  mas não está atendendo, a resposta é neutra — "não está marcando horário por
  aqui agora" — com o nome dela e o botão do WhatsApp. Quem escaneou não fica
  sabendo qual das três é (situação de cobrança é assunto da barbearia).
  "Não encontrada" ficou só para o id que não existe.
- ~~**M8 — quatro causas de agenda vazia, uma frase só, e ela mentia**~~ —
  **RESOLVIDO em 11/09.** "Tente outro serviço acima" era dito também a quem
  abria o link às 23h, no dia de folga e na barbearia sem serviço nenhum — em
  que o seletor nem tinha opção. A edge devolve `motivoVazio`
  (`sem_servicos`, `fechado_hoje`, `expediente_acabou`, `lotado`), calculado
  por `_shared/semHorario.ts` com as mesmas regras de `horarios_livres` (dia
  mal preenchido é fechado; dia sem ninguém de jornada também), e a tela diz
  cada uma. Trocar de serviço só é sugerido quando existe um mais curto; sem
  WhatsApp cadastrado, a frase não promete botão. 10 testes de unidade.
- ~~**A11 — telefone da barbearia opcional derrubava toda a saída de
  emergência**~~ — **RESOLVIDO em 11/09 (migration 0155).** O WhatsApp da
  barbearia é o botão "Falar com a barbearia" do QR e do link do horário; sem
  ele, todo "não dá" da agenda pública virava beco. Cinco portas criam ou
  editam barbearia, e agora todas exigem o número (10 a 13 dígitos, a régua do
  telefone do cliente): o cadastro aberto (a tela pedia, o servidor aceitava
  vazio), a nova unidade, o painel administrativo (o da unidade ou, na falta, o
  do dono) e Configurações (não dá mais para apagar). O convite pelo painel
  criava a barbearia **sem telefone nenhum, sempre**: agora o aceite do dono
  pede o WhatsApp quando ela ainda não tem, e o grava também na ficha dele — é
  por ela que o aviso de fim de teste o encontra. No banco,
  `salons_telefone_valido` garante o formato quando existe; NOT NULL não dá,
  porque o convite cria a barbearia antes de o dono aparecer. A barbearia de
  antes da regra ganha um item no checklist de ativação, só enquanto falta.
  Coberto por `telefone_da_barbearia.test.sql` (5 asserções) e 5 testes de
  unidade (a régua das edges e a frase do erro do banco).

  **E o cadastro mentia:** o campo dizia "Não vai para seus clientes" sobre o
  número que é justamente o do botão do QR. Agora diz a verdade — os clientes
  veem este número —, e o aviso ao dono continua indo para a ficha dele.

  **Em produção em 11/09:** o site entrou pelo merge do #105; as quatro edges
  (`criar-minha-barbearia`, `add-salon-unit`, `admin-create-salon`,
  `accept-invite`) foram publicadas pela CLI **depois** do site, porque o
  `accept-invite` novo exige o campo que só a tela nova manda; a 0155 entrou
  por último (`20260911064812`), com a única barbearia já de telefone válido,
  e a CHECK nasceu validada. Conferido no bundle servido: `pedeTelefone`,
  `salons_telefone_valido`, "Cadastrar o WhatsApp" e "WhatsApp da unidade".

  **Testado pelo dono no navegador em 11/09.**

**~~Buraco da própria auditoria~~ — REVISÃO FEITA em 11/09.** A frente de
segurança/multi-tenant que morreu no limite de sessão foi refeita, com escopo
apertado: autorização por objeto nas 12 edges, nas RPCs, nas views e nas regras
de acesso (policies), mais a configuração de login.

- **Conferido e bom:** RLS em todas as tabelas; nenhum bucket de arquivos; as 12
  RPCs privilegiadas que a equipe pode chamar conferem a barbearia de quem chama
  (a única que não confere, `preco_por_uso`, só lê a tabela de preços), e
  nenhuma é chamável sem login. Nas edges, cada ação confere dono ou gerente da
  barbearia **filtrando por quem chamou**: `asaas`, `add-salon-unit`,
  `cobrar-uso` nas duas portas, `whatsapp` ao enviar e ao devolver ao agente, e
  `criar-minha-barbearia` com e-mail confirmado, uma barbearia por conta e
  limite por IP. `accept-invite` exige a senha de quem já tem conta, com limite
  de tentativas; as funções do painel comparam a senha em tempo constante; os
  webhooks usam HMAC; e os dois webhooks do n8n (agente e resposta do lembrete)
  exigem o cabeçalho secreto desde 06/09 — conferido nos fluxos publicados.
  Nenhuma porta de XSS no CRM, e nenhum segredo real nos arquivos do repositório
  (o único token com cara de JWT é falso, de teste). O domínio antigo da Vercel
  na lista de retorno do login continua nosso.
- **`auditoria_pendente` sem invoker — corrigido (0157).** Regressão da 0152
  (minha): o `create or replace` descartou o `security_invoker`. **Não vazou** —
  provado com uma falha de entrega de mentira num ensaio desfeito: sem login e
  logado de outra barbearia, a consulta é barrada, porque as views de dentro
  rodam com as permissões de quem consulta. Nova catraca:
  `views_com_invoker.test.sql` reprova qualquer view sem invoker.
- **`admin-metricas` só existia em produção — versionada.** Fora do
  repositório, ela comparava a senha do painel com `!==` e não tinha limite de
  tentativas nem Sentry. Entrou no repo com as travas das outras duas funções do
  painel.
- **Decisões do dono (configuração de login, não é código):**
  - a proteção contra senhas vazadas está desligada — o projeto já é **Pro**,
    então é um clique;
  - trocar a senha não pede login recente: uma sessão roubada troca a senha e
    fica com a conta;
  - a lista de endereços de retorno do login tem uma entrada corrompida
    (`...vercel.app/**ehttp://localhost:5173/**`) e aceita `localhost` em
    produção;
  - não há captcha no cadastro aberto (mitigado por e-mail confirmado, uma
    barbearia por conta e limite de cadastros por IP).
- **Informativo:** as permissões padrão do Supabase dão TRUNCATE e TRIGGER a
  quem está sem login ou logado em várias tabelas. Nenhuma API alcança isso — a
  RLS não cobre TRUNCATE, mas a API não o expõe. Endurecer é opcional.

**Refutado, para não voltar como boato:** `x-forwarded-for` **não** é
falsificável aqui. Testado com dois POSTs carregando IPs de documentação (RFC
5737): ambos foram contados em `controle_de_taxa` sob o IP real. A Supabase
sobrescreve o cabeçalho.

### Fase 4 (11/09) — a cadeira certa e a hora certa

Quatro achados do giro que só aparecem no celular do cliente: uma reserva com um
barbeiro que saiu, num dia em que a barbearia não abre; "como foi seu
atendimento?" às 23h40; a mesma pergunta para quem só comprou pomada. O dono não
vê nenhum deles — nenhum seria pego por um teste de tela. Migration **0158**,
coberta por `cadeira_certa_e_hora_certa.test.sql` (29 asserções).

- ~~**A8 — a reativação reservava cadeira sem olhar a régua da casa**~~ —
  **RESOLVIDO em 11/09.** `criar_agendamentos_de_reativacao` só travava por
  janela de 24-25h, "cliente sem horário futuro" e sobreposição + folga: zero
  consulta a horário de funcionamento, jornada, `professionals.ativo` ou
  `services.ativo`. Agora quem escolhe o horário é `horarios_livres` — a **mesma
  régua do QR do balcão e do agente** —, e dela se pega o livre mais perto do
  horário de sempre, **no mesmo dia, até 1 hora de diferença** (decidido pelo
  dono em 11/09). Trocar de barbeiro só quando o de sempre **saiu da equipe**:
  barbeiro cheio ou de folga naquele dia não vira "marquei com outro", o cliente
  fica para o próximo ciclo. A fila `reativacoes_a_enviar` ganhou as três travas
  que faltavam: `salons_com_automacao` (era a única fila sem ela — barbearia
  bloqueada seguia disparando template **cobrado** em nome dela, na conta da
  plataforma), barbeiro ainda ativo (mandava o nome de quem saiu) e a exclusão
  de quem já tem horário futuro (quem marcava sozinho de manhã recebia o convite
  à tarde e ocupava **duas** cadeiras).
- ~~**A cadeira que ninguém soube que existia**~~ — **achado novo, encontrado ao
  corrigir o A8.** `expira_reativacoes_sem_resposta` só soltava a cadeira de
  quem **recebeu** o convite (`confirmacao_enviada`). A reserva que nunca chegou
  a ser enviada — barbeiro saiu, barbearia perdeu o acesso, cliente marcou
  sozinho no meio do caminho — ficava `agendado` para sempre numa agenda que não
  sabia dela. Passou a ser solta quando cruza as 2 horas, que é onde a fila para
  de oferecê-la. Ninguém é pausado por isso: não houve pergunta. Em produção não
  havia nenhuma (0 reativações); sem a trava, a primeira apareceria e não sairia
  mais.
- ~~**M4 — nenhuma janela de silêncio**~~ — **RESOLVIDO em 11/09.** Comanda
  fechada às 21h40 virava "como foi seu atendimento?" às 23h40. A regra mora em
  `private.hora_de_falar()`: **9h às 20h de Brasília, todos os dias** (decidido
  pelo dono em 11/09), e as duas filas que falam por conta própria passam por
  ela. **Nada se perde:** as duas janelas de elegibilidade têm 24 horas e uma
  janela de 24 horas sempre cruza a faixa das 9h às 20h — a mensagem é adiada,
  nunca cancelada. **O lembrete do horário marcado fica de fora de propósito:**
  ele depende da hora do atendimento, e um corte às 8h precisa do aviso às 7h.
- ~~**M5 — avaliação pedida a quem só comprou pomada**~~ — **RESOLVIDO em
  11/09.** `avaliacoes_a_pedir` filtrava só `orders.status = 'fechada'`, que quer
  dizer "alguém pagou alguma coisa": um "podia melhorar" virava alerta **grave**
  de nota baixa sobre um corte que não houve. Agora exige item de serviço na
  comanda (o crédito de pacote consumido entra, porque é gravado como `servico`
  com preço zero) e, quando há agendamento ligado, que ele não esteja cancelado
  nem marcado como falta.
- ~~**`clientes_para_reativar`**~~ — **apagada em 11/09** (aprovado pelo dono).
  Fila do desenho antigo (0077/0083/0089/0115), sem consumidor em nenhum dos
  workflows do n8n — a auditoria conferiu os JSONs de todos. O modelo vigente é
  o da 0113. A gêmea
  `clientes_para_avisar_retorno` saiu logo em seguida, na **0159**, quando o
  dono aprovou — mesmo estado, mesma ausência de consumidor.

**Pendente fora do repositório:** aplicar a 0158 em produção à mão (migration
não está no pipeline). O n8n **não muda**: "Avaliação Pós-Atendimento" e
"Reativação (Convite Automático)" leem as mesmas views, que passam a devolver
menos linhas. O fluxo da política de atraso já foi arquivado.

### Barbearia fora da cobrança — decidido em 12/09 (migration 0160)

A El Guardians é a barbearia de teste do próprio dono, dentro do banco de
produção. Ela sai do teste grátis em **19/09**, e a partir daí o fechamento do
dia 1º geraria fatura — com o AbacatePay já em produção, **PIX de verdade
cobrando o dono dele mesmo**. Decisão: fica fora da cobrança.

`salons.cobravel` (padrão **true**) e a trava dentro de `gerar_fatura_de_uso`,
que é a porta única de criação de fatura desde a 0130 — o fechamento mensal e a
fatura de cancelamento passam os dois por ali, então a regra não precisa ser
escrita duas vezes. As duas saídas fáceis foram recusadas de propósito: desligar
o cron tira a cobrança de todo mundo, e empurrar `trial_ate` para 2030 deixa no
banco um "teste grátis de quatro anos" que a próxima pessoa lê como bug.

**O acesso não muda:** barbearia fora da cobrança continua sujeita ao documento
(0156) e ao cron de acesso. O que ela não tem é fatura.

**A tela conta a verdade:** `uso_do_sistema_no_mes` devolve `cobravel`, e a aba
Assinatura troca "você paga X por agendamento" por "esta barbearia está fora da
cobrança" — senão prometeria uma cobrança que nunca chega. Coberto por
`barbearia_fora_da_cobranca.test.sql` (6 asserções), sendo a primeira que o
padrão é **cobrar**: é ela que impede a próxima barbearia de entrar de graça por
esquecimento.

### Fase 5 (12/09) — M12: o envio em dobro (migration 0163)

**O buraco.** As filas são lidas pelo n8n, enviadas, e só então marcadas. Entre
ler e marcar não havia reserva: `for update skip locked` aparecia **zero vezes**
nas 162 migrations. Duas execuções sobrepostas do mesmo fluxo — uma que passou
dos 30 min do Schedule, ou uma rodada à mão — mandavam duas vezes para a mesma
pessoa.

**Na reativação não era só incômodo:** `marcar_reativacao_enviada` soma 1 em
`reativacao_sem_resposta`, e a pausa automática dispara em 2. O envio duplicado
**pausava a reativação de um cliente que respondeu normalmente** — o sistema
decidia sozinho parar de convidar alguém por causa de um defeito nosso, e
ninguém ficava sabendo. O `on conflict (message_id)` da avaliação não protegia
disso: o wamid é diferente a cada envio.

**A reserva com prazo.** `orders.envio_reservado_ate` e
`appointments.envio_reservado_ate`; as filas escondem o que está reservado; quem
vai enviar chama `reservar_avaliacoes` / `reservar_reativacoes`, que reservam e
devolvem só o que conseguiram. **5 minutos**, decidido pelo dono — é o prazo que
faz execução morta devolver a linha sozinha, e precisa ser maior que o envio mais
lento, senão a linha volta para a fila e sai em dobro do mesmo jeito.

**A trava é o `UPDATE ... RETURNING`, não o `skip locked`:** duas transações não
atualizam a mesma linha ao mesmo tempo — a segunda espera, re-avalia o `where`
(que agora tem reserva no futuro) e volta com zero linhas. O `skip locked` seria
otimização, não correção, e ficou de fora para ter menos mágica no código que
decide se um cliente recebe mensagem.

**Fora de propósito: o LEMBRETE.** Ele não tem view nem RPC — o fluxo consulta
`appointments` direto — e é a funcionalidade mais usada do produto. Mexer nele no
mesmo PR que mexe em dois fluxos vivos multiplica o risco: o pior caso dele é o
cliente receber o mesmo lembrete duas vezes, enquanto o da reativação é ser
silenciado para sempre. Fica para PR próprio.

**Pendente no n8n:** dois fluxos precisam trocar o `SELECT` na view pela chamada
da RPC de reserva — "Avaliação Pós-Atendimento" e "Reativação (Convite
Automático)". Enquanto não trocarem, nada quebra: as views continuam existindo e
funcionando; o que não existe ainda é a proteção.

Coberto por `o_envio_em_dobro.test.sql` (9 asserções).

### Fase 5 (12/09) — A3: a mensagem do cliente que some (migration 0162)

**O buraco.** O `whatsapp-webhook` não gravava a mensagem recebida em lugar
nenhum — zero escritas de `whatsapp_messages` no arquivo. Ele autentica,
descobre de quem é e faz `POST` ao n8n; quem grava o histórico é o n8n, depois.
Desde a Fase 1 ele **confere** o `.ok` e avisa o Sentry (isso era o A10), mas
conferir não é guardar: com o n8n fora do ar, o cliente escreveu e ninguém nunca
vai saber o que ele escreveu.

E a Meta não salva: respondemos 200 **sempre**, de propósito, porque falha
repetida faz ela desativar o webhook do aplicativo inteiro — uma barbearia com
problema calaria todas. A única retentativa possível é a nossa, e não existia.

**A fila, no padrão da 0104.** `mensagens_recebidas` guarda a mensagem **antes**
do envio; `entregue_em` é marcado **depois**. O `message_id` da Meta é a chave
primária, o que dá idempotência de graça — e resolve de lambuja a reentrega da
Meta virando segunda resposta do agente. A linha guarda o **payload inteiro**,
então quem reentrega devolve o mesmo corpo, e mensagem antiga sai no formato que
o agente daquele dia esperava.

**Limites de propósito:** 24 horas (fora da janela da Meta não dá para responder
texto livre) e 5 tentativas (passou disso não é intermitência, é a mensagem).
Retenção de 90 dias na `poda_historico_antigo`, como a `entregas_falhadas`:
isto é livro de entrega, não histórico de conversa.

**O alarme:** `auditoria_mensagens` — mensagem parada há mais de 15 minutos quer
dizer agente mudo agora, com gente esperando. View nova e pequena, unida em
`auditoria_pendente`, em vez de mais um bloco dentro da `auditoria_operacao`, que
tem seis uniões e ~120 linhas: reescrever aquela inteira para acrescentar um caso
é o tipo de transcrição que já custou o `security_invoker` na 0152.

**O que ficou de fora, dito com todas as letras:** esta é a fila de **entrada**.
A fila de **saída** — a resposta que o `entregarAoN8n` manda e que também pode se
perder — continua sem retentativa. É a outra metade do A3.

**Pendente no n8n:** o fluxo de reentrega ainda não existe. Ele lê
`mensagens_a_entregar`, faz POST no webhook do agente com a credencial
`n8n webhook token` (já existe, `httpHeaderAuth`) e chama
`marcar_mensagem_entregue` ou `marcar_tentativa_de_entrega`. **Só faz sentido
depois da 0162 aplicada em produção** — antes disso a view não existe e o fluxo
erraria a cada rodada.

Coberto por `a_mensagem_nao_se_perde.test.sql` (11 asserções).


### Fase 5 (12/09) — A14: o mês que some (migration 0161)

**O buraco.** `fechar_mes_de_uso` sempre faturou "o mês anterior e só ele", e
`gerar_fatura_de_uso` só empurra o início para frente. Falhou o `pg_cron` num dia
1º, aquele mês **nunca mais era faturado** — a receita evaporava em silêncio, e
a auditoria não via, porque ela olha faturas que existem e uma fatura que nunca
nasceu é invisível.

**O agravante, achado ao corrigir.** O laço não tinha `exception`: uma barbearia
que levantasse erro abortava a rodada inteira, e **todas as depois dela na fila
perdiam o mês junto**. Mesma falha que a 0134 corrigiu no cron da reativação.

**O terceiro defeito, achado no ensaio.** `if gerar_fatura_de_uso(...) is not
null` — num registro composto, `IS NOT NULL` só é verdadeiro quando **todas** as
colunas são não-nulas, e fatura nova tem `paga_em` e `abacate_pix_id` nulas por
definição. **O contador sempre devolveu zero**, mesmo criando faturas. Ninguém
percebeu porque o número só aparece no retorno do cron, que ninguém lê.

**Os três consertos:** janela por barbearia (do dia seguinte ao último dia
faturado, ou ao fim do teste para quem nunca teve fatura), cada barbearia no seu
`begin/exception` com ordem determinística, e o contador olhando `v_fatura.id`.
Buraco antigo é recuperado sozinho na rodada seguinte, **numa fatura só** —
decidido pelo dono em 12/09; o `detalhe` lista agendamento por agendamento,
então o extrato segue auditável dia a dia.

**E o alarme para o que não existe:** um quarto caso em `auditoria_cobranca` —
"o último dia faturado está a mais de 35 dias" —, que já é unida em
`auditoria_pendente` e já é lida pelo fluxo "Auditoria do Agente" do n8n, que
manda e-mail. **Nada muda no n8n:** o alerta novo pega carona no canal que já
funciona. 35 e não 31 porque, no caminho normal, no fim de um mês o último dia
faturado já está a 30 dias — abaixo disso o alarme não distingue um mês comum de
um fechamento perdido.

Coberto por `o_mes_que_some.test.sql` (9 asserções), com a falha injetada em
`preco_por_uso` dentro da própria transação do teste — é assim que se prova que
uma barbearia quebrada não derruba a que vem depois dela na fila.


### Fase 5 no n8n (12/09) — o que foi feito na peça de fora

**Fluxo novo: `CRM Salao - Reentrega de Mensagens`** (`Ly82IIUjQXSEfco6`, ativo).
A cada 5 min lê `mensagens_a_entregar`, faz POST no **mesmo** webhook do agente
(`/webhook/salao-atendimento`) com o **mesmo corpo** — a coluna `payload` guarda
o JSON exato que a edge mandou — e marca o desfecho: `marcar_mensagem_entregue`
no sucesso, `marcar_tentativa_de_entrega` na falha. Sem laço: o nó HTTP já roda
por item, e fila vazia simplesmente não executa o resto. Credenciais reusadas
(`Supabase account` e `n8n webhook token`), nenhum segredo novo. Error workflow e
fuso de São Paulo ligados como nos outros.

**Fluxo mudado: `Reativação (Convite Automático)`** (`Fxc7WGhCoHu7KUe1`). O nó
que fazia `SELECT` na view virou `Reservar Fila de Reativacao`, um POST em
`rpc/reservar_reativacoes`. É a metade do M12 que vive fora do banco.

**Uma dúvida que o teste resolveu, e que quase virou defeito:** o nó do Supabase
devolve N itens; um nó HTTP devolveria **1 item contendo um array**, e aí o Code
node de rotação receberia um array em vez de uma linha. Rodei o fluxo à mão com
a fila vazia e o retorno foi `body: []` → **zero itens**, não um item vazio:
o nó HTTP quebra array de topo em itens, igual ao do Supabase. Sem esse teste eu
teria publicado uma quebra silenciosa no fluxo que fala com cliente.

**Avaliação Pós-Atendimento:** ficou de fora num primeiro momento, a pedido do
dono, até a revisão dos caminhos de mensagem. A revisão saiu no mesmo dia e
decidiu manter a avaliação — então o nó dela também virou
`rpc/reservar_avaliacoes`, com o **nome mantido** de propósito: `Marcar Avaliacao
Pedida` referencia `$("Buscar Avaliacoes a Pedir").item.json`, e renomear
quebraria a marcação. **O M12 está completo nas duas filas.**

**O que ainda não foi provado ponta a ponta:** o POST da reentrega com a
credencial de header. A fila está vazia, então não houve o que reentregar. O modo
de falha é seguro — se a credencial estiver errada, nada é enviado, a tentativa é
contada e `auditoria_mensagens` alarma em 15 minutos —, mas a prova de verdade é
a primeira mensagem que o agente recusar.

### Caminho das mensagens: revisão de custo — decidido em 12/09

O dono levantou a dúvida de custo do envio pela API oficial. Levantamento feito,
e a decisão foi **manter tudo como está**. O que o levantamento apurou:

**Só cinco fluxos falam por WhatsApp**; os outros nove mandam e-mail. Dos cinco,
quatro mandam **template pela oficial** (lembrete, avaliação, reativação, aviso
de fim de teste ao dono) e um responde dentro da conversa (o agente, por Evolution
ou oficial conforme o provedor da barbearia).

**Os 8 templates aprovados são TODOS `utility`** — e não é suposição: a Meta
devolveu `categoria_meta = 'utility'` nos oito. Os três de categoria `marketing`
(`reativacao_convite`, `reativacao_tempo`, `reativacao_aniversario`) seguem em
rascunho e inativos, nunca submetidos. **Nada está sendo cobrado na tarifa cara.**

**A conversa do agente não é o custo.** Resposta dentro da janela de 24h é
mensagem de serviço; a cobrança da Meta é por template entregue. Quanto mais o
agente conversa, mais se fatura e menos proporcionalmente se gasta.

**A assimetria que o levantamento achou, e que fica registrada como aceita:** o
lembrete vai para **todo** agendamento (`crm`, `publico`, `agente`), mas só o
`agente` é cobrável (`agendamentos_cobraveis`, 0136) — mais a reativação
confirmada, que nem recebe lembrete. Ou seja, **paga-se o lembrete de agendamento
que não gera receita**. Numa barbearia que usa muito o CRM e pouco o agente, o
lembrete é custo puro, e ele é de longe o maior volume. O dono conhece o número e
decidiu manter assim.

**As quatro decisões, em 12/09:**

1. **Envio pela oficial, resposta pela não oficial** — a regra híbrida de 01/09
   continua valendo. Mandar lembrete pela Evolution zeraria o maior custo, mas o
   disparo proativo em massa pelo número **do cliente**, numa ponte não oficial,
   é o caminho clássico para o número dele ser banido. O risco não é da
   plataforma, é do dono da barbearia.
2. **O lembrete continua indo para todo agendamento**, cobrável ou não.
3. **A avaliação continua sendo enviada.**
4. **Regra permanente: buscar sempre deixar os templates como `utility`.**
   `marketing` custa perto de 9x mais e a Meta classifica por intenção, não pelo
   que se pede. A `templates_recategorizados` é a catraca que avisa quando ela
   discorda.

**O que não deu para medir:** volume real. `whatsapp_messages` tem 22 linhas no
total, todas de teste — com 0 barbearias reais, qualquer custo apresentado seria
invenção com cara de planilha. O dono dispensou o modelo por já ter a ordem de
grandeza.

**Não verificado:** a tabela de preços no painel da Meta. A categoria dos
templates foi lida do banco (veio da Meta); as tarifas e a regra de janela aberta
são conhecimento geral e mudam — conferir no WhatsApp Manager antes de qualquer
decisão de dinheiro.

### Agenda pelo QR, versão 2 — decidida em 11/09, para fazer em etapas

O dono achou a página "muito vazia, pouco profissional" e quer que o cliente
ache, remarque e cancele o próprio horário sem falar com a barbearia. Decidido
por ele em 11/09:

1. **Achar o horário, em duas camadas.** "Seus horários neste celular": quem
   marca pelo QR guarda o link de gestão no aparelho (`localStorage`) e o vê no
   topo ao voltar. "Já tenho horário": a pessoa digita o WhatsApp e o link vai
   **para aquele WhatsApp**; a tela responde igual com ou sem horário, com
   limite por número e por IP (o freio `taxaExcedida` já existe na edge).
   **Nunca** mostrar horários só porque alguém digitou um telefone: seria ler
   a agenda de qualquer pessoa sabendo o número dela.
2. **14 dias** para marcar e remarcar. Hoje é só o mesmo dia, e a regra mora
   na edge (`agenda-publica` confere que o horário é um dos livres de hoje).
3. **Etapas bem separadas**, um PR por vez, cada uma testada em produção pelo
   dono antes da próxima.
4. **Protótipo navegável antes do código**, para aprovar o desenho.

Protótipo aprovado pelo dono em 12/09. Etapas:

> **Testado em produção pelo dono em 13/09**, com agendamentos reais na El
> Guardians — etapas 1 e 2, a seleção múltipla e o botão novo. A prova que
> faltava: `14/09 10:00 → 11:10`, **70 min reservados**, 2 serviços gravados
> (Barba 30 + Corte masculino 40), R$ 80. `minutos_reservados` igual a
> `soma_das_duracoes` é o que diz que a cadeira não será vendida duas vezes. O
> combo das 09:00 foi ainda `concluido` pelo CRM, então o caminho do dinheiro
> para um agendamento nascido no QR também rodou.
>
> **Observação de comportamento, não de código:** havendo um serviço chamado
> "Corte + barba" (60 min, R$70) e a opção de marcar os dois avulsos (70 min,
> R$80), o dono clicou no combo sem pensar. O cliente vai fazer igual — o que é
> bom: mais barato para ele, mais rápido para a cadeira. Se a barbearia quiser
> garantir o preço do combo, o caminho é o catálogo, não o código.

1. ~~**Cara de barbearia**~~ — **FEITA em 13/09**. Iniciais, nome, "aberto
   agora", endereço e WhatsApp no lugar do ícone do Club Cut (que desceu para o
   rodapé); serviços em cartões com preço e duração; próximo horário livre em
   destaque e o resto por manhã/tarde/noite; quadro de funcionamento; esqueleto
   no carregamento; duas colunas no computador. Sem endereço cadastrado, a
   linha some — é o caso da El Guardians, cujo `endereco` é nulo.

   **Sem migration:** `endereco` e `horario_funcionamento` já existiam em
   `salons` E na view `salons_atendendo`; só faltava a edge devolvê-los. Os
   campos entraram AO LADO de `salao` (string), e não trocando o seu tipo,
   porque a edge sobe antes de a Vercel terminar o build — nesse intervalo a
   tela antiga ignora campo a mais, mas quebraria com campo de tipo trocado.

   Três coisas foram derrubadas junto, e vale o registro: o **"ver mais N
   horários"** (o corte em 12 existia porque o mais cedo ficava enterrado, e o
   destaque do próximo resolve isso sem esconder a noite); o **fuso do
   aparelho** (a pílula lê o horário em `America/Sao_Paulo`, como a RPC e a
   edge — e o teste que prova isso precisa trocar o fuso do processo, senão
   passa por acidente); e o **avatar com iniciais da frase de espera**, que
   desenhava um selo verde escrito "CA" de "Carregando...".
2. ~~**14 dias**~~ — **FEITA em 13/09**. A edge aceita `data`, valida a janela
   **nos dois caminhos** e devolve a faixa dos catorze dias com a contagem de
   vagas de cada um (migration 0167, `dias_com_horario`: uma consulta, 20 ms).
   Na tela, faixa rolável com "fechado / lotado / encerrado / N livres", título
   por dia, e o vazio virou porta — "Ver quinta-feira" no lugar de "chame a
   barbearia".

   **O que isto reverteu:** o comentário da edge dizia "agendar para outro dia
   … viraria uma porta aberta na rua". Piora a superfície de quem quer encher a
   agenda (de 1 dia para 14) e torna público o formato da agenda — nunca de
   quem é cada horário ocupado, só o que está livre. Continuam segurando: 8
   agendamentos por IP/10 min, `TETO_POR_HORA` por barbearia, 1 agendamento
   futuro aberto por pessoa. **Entrou junto** um freio de taxa no `consultar`
   (40/5 min), que era a única ação da função sem limite nenhum — descuido
   barato quando custava uma consulta, alavanca depois de passar a custar 20.

   **A data sai do `inicio`, nunca de um campo à parte**, senão bastaria pedir
   `data: hoje` com `inicio` em 2027 para escrever 2027 no banco. Conferido
   contra produção: 30 dias → 400, ontem → 400, data inexistente → 400, lixo →
   400, e amanhã às 03:00 → **409** (a janela deixou passar; quem barrou foi a
   revalidação do horário) — sem escrever nada.

   **EM ABERTO, decisão do dono:** a trava de **1 agendamento futuro por pessoa
   pelo QR** ficou muito mais apertada. Antes durava horas; agora bloqueia por
   catorze dias quem marcou para sábado e quer a barba na quinta. Mantida em 1
   (nada regride). A resposta boa provavelmente é a **etapa 4**: quem já tem
   horário o vê e remarca, e "você já marcou" deixa de ser um não.
3. ~~**Seu horário neste celular**~~ — **FEITA em 13/09.** O aparelho guarda o
   token no `localStorage` ao marcar (`guardados.ts`) e, ao voltar ao link da
   barbearia, o horário aparece num cartão no topo, com "Ver ou cancelar" e
   "Pôr na agenda" (`.ics`, `calendario.ts`). Aposentou o **"salve nos
   favoritos ou tire um print"** da tela de sucesso, que era o sistema pedindo
   à pessoa que fizesse o trabalho dele.

   **Ação nova na edge, `meus_horarios`**, que resolve todos os tokens numa
   chamada só. Um token por chamada esbarraria no freio de gestão (12 por 10
   min), que existe para encarecer o martelo — não para punir quem tem dois
   horários e recarrega a página.

   **A regra mais perigosa mora em `tokensAEsquecer`, com teste:** "o servidor
   não respondeu" (rede, 429, 500) **não é** "nenhum está de pé". Sem essa
   distinção, um soluço de conexão apagaria os horários guardados para sempre,
   e a pessoa só descobriria ao chegar na barbearia.

   **Não verificado por mim:** o que cada celular FAZ ao receber o `.ics`. O
   conteúdo do arquivo está conferido (`DTSTART`/`DTEND` batendo com a duração
   somada, alarme 1h antes, dobra de linha em 75 bytes); o gesto de cada
   aparelho só o telefone de verdade responde.
4. ~~**Remarcar pelo link**~~ — **FEITA em 13/09** (servidor: migration 0169 +
   ação `remarcar_horario`, PR #152; tela: PR #153). Mesmo agendamento, **mesmo
   token** (o link guardado no celular continua valendo), lembrete refeito,
   piso de 30 minutos sobre o horário ATUAL. **Reverte uma decisão escrita:**
   o comentário de `MeuHorarioPage.tsx` dizia que remarcar ia para o WhatsApp
   de propósito ("reagendar é conversa"); com a janela de catorze dias isso
   virou atrito, não cuidado.

   **A parte difícil não era a regra, era `horarios_livres`.** Ela esconde todo
   horário que colide com um agendamento de pé — e o agendamento que está sendo
   movido é um deles. Quem quisesse sair das 14:00 para as 14:10 não veria as
   14:10: ele mesmo bloqueava. `p_ignorar_agendamento` resolve nos dois pontos
   em que a função olha os agendamentos (a âncora no fim do atendimento e a
   sobreposição).

   **Precisou DERRUBAR e recriar a função**, não `create or replace`: parâmetro
   novo com padrão vira sobrecarga, e aí toda chamada de quatro argumentos fica
   ambígua e a agenda pública inteira para. Conferido antes de mexer que só a
   edge e `dias_com_horario` chamam, e depois de aplicar que a edge antiga (com
   4 argumentos) continua respondendo.

   **O trinco virou teste.** Função recriada nasce com EXECUTE para `public`;
   sem o revoke, a agenda de qualquer barbearia sairia por REST sem a edge no
   meio. Nenhum teste cobria grants de `horarios_livres` nem de
   `dias_com_horario` — agora cobre.

   **A TELA FICOU PRONTA no mesmo dia (migration 0170).** `/meu-horario` ganhou
   "Mudar o horário", que leva à agenda pública em modo remarcar
   (`/agendar/:salonId?remarcar=<token>`) — reaproveitando a faixa de catorze
   dias, a grade por período e o destaque do próximo horário, em vez de manter
   duas cópias que envelheceriam em ritmos diferentes. Os serviços viram resumo
   somente-leitura ("Mantendo: Corte + Barba"), e a confirmação **não pede nome
   nem telefone**: quem abriu o link já é o dono, e o token prova.

   **A 0170 existe por causa de dois números que discordavam.** A faixa de dias
   conta pela `dias_com_horario`, que chamava `horarios_livres` sem o
   `p_ignorar_agendamento`: na tela de remarcar a faixa diria "35 livres" e a
   grade mostraria 48, no mesmo dia, na mesma tela. São ~13 horários de
   diferença, e o menor é o errado — quem compara os dias para achar o mais
   vazio decidiria pelo número que mente. Conferido em produção depois:
   **35/35 no modo normal, 48/48 no modo remarcar.**

   **O aviso do CRM passou a contar a remarcação** (mesma view, agora com
   `tipo`): cancelar e remarcar são notícias diferentes — uma libera a cadeira,
   a outra a move —, e o título separa as duas em vez de dizer "3 mudanças",
   que obrigaria o dono a ler a lista para saber se sobrou buraco.

   **Não verificado por mim:** o aviso renderizado no CRM (não faço login). O
   dado está provado: remarcar pela tela gravou `tipo = 'remarcou'` com o
   horário novo na view.
5. ~~**Já tenho horário**~~ — **CANCELADA em 13/09, por decisão do dono.**
   **Não peça o modelo à Meta.** Foi substituída por um botão "Já tem horário
   marcado?" no topo da agenda pública, que abre o WhatsApp **da barbearia**
   com a mensagem já digitada.

   O desenho original mandava o link de gestão para o WhatsApp do cliente, e
   por isso dependia de modelo aprovado pela Meta: quem inicia a conversa seria
   a plataforma, pelo número central. O dono recusou, com um argumento que eu
   não tinha valorizado — **a mensagem chegaria de um número que o cliente não
   conhece, com um link, logo depois de ele digitar o telefone numa página.
   Isso tem cara de golpe**, e número denunciado na Meta é problema para todas
   as barbearias de uma vez.

   **O que se perde, registrado de propósito:** a pessoa não cancela sozinha —
   alguém da barbearia tem de ler e agir. Isso contraria a frase que abre este
   plano ("sem falar com a barbearia"). Quem entrega aquilo para a maioria é a
   **etapa 3**; esta porta é para quem trocou de aparelho.

   **NUNCA mostrar o horário na própria tela** depois de a pessoa digitar o
   telefone, nem no aviso de "você já tem um horário". É a ideia que parece
   óbvia e é a perigosa: eu digito o SEU telefone, preencho qualquer nome, e
   recebo o link que cancela o SEU horário. Se reaparecer, recuse.
6. ~~**Aviso para a barbearia** quando o cliente cancela sozinho~~ — **FEITA em
   13/09** (migration 0168). Canal escolhido pelo dono: **dentro do CRM**, sem
   WhatsApp — não gasta template, não depende da Meta e não some no meio do
   caminho. Um aviso no topo da Agenda lista o que o cliente cancelou e a
   barbearia ainda não viu, com "Ok, vi".

   **A decisão que sustenta tudo:** quem cancelou é **inferido de
   `auth.uid()`** dentro de `carimba_cancelamento`, não marcado em cada
   chamador. Sessão logada (só o CRM tem) é a barbearia; edge, n8n e pg_cron
   são o cliente. Marcar um a um faria o próximo caminho — ou o que eu não
   encontrei — nascer sem marca, e **um aviso que falha em silêncio é pior que
   não ter aviso**, porque o dono passa a confiar nele. A única exceção é
   explícita: o cron de reativação marca `'sistema'`, senão o convite que
   venceu sem resposta viraria "o cliente cancelou" todo dia e o aviso viraria
   ruído.

   Os 8 cancelamentos anteriores ficaram **sem marca de propósito**: backfill
   inventaria um culpado e encheria o aviso no primeiro dia.

   **Não verificado por mim:** o aviso na tela. Não faço login no CRM. O que
   está provado em produção (em transação desfeita): a inferência nos dois
   sentidos, que a barbearia não é avisada do que ela mesma cancelou, que dar
   ciência remove, que ressuscitar limpa o carimbo inteiro — e que **outro
   usuário não vê o cancelamento alheio**.

   **Remarcar sozinho** (etapa 4) ainda não existe, então o aviso hoje só fala
   de cancelamento. Quando a 4 entrar, ela precisa alimentar este mesmo aviso.

**Fora da lista de etapas, pedida pelo dono em 13/09 e FEITA no mesmo dia:**
**vários serviços num agendamento só pelo QR.** Era a "fase 2" que a migration
0120 já deixava escrita — `appointment_services`, o trigger que soma as
durações e a RPC do CRM existem desde agosto; faltava ligar a agenda pública.
**Sem migration.** Escopo decidido pelo dono: só o QR (o agente do WhatsApp
segue com um serviço), e soma pura, sem detectar combo mais barato.

A decisão que impede overbooking: a edge manda `data_hora_fim` **já somado** no
insert. O trigger só soma a tabela filha quando ela existe, e num INSERT ela
ainda está vazia — ele cairia no serviço principal e reservaria 40 min num
corte+barba de 70. Ensaiado em produção nos dois sentidos: sem o conserto, um
segundo agendamento aos 45 min **entrava**; com ele, a trava de sobreposição
recusa.

**Ainda com UM serviço:** o agente do WhatsApp. É o risco que a própria 0120
nomeou — quem calcula a duração lá é a IA.

### Achado (13/09): nó morto no fluxo de lembretes

`CRM Salão - Lembretes de Agendamento` (`DW0nq1Jyp9xeOJwm`) tem um nó **"Buscar
Serviço"** que consulta `services` pelo `service_id` do agendamento — e
**nenhum outro nó consome a saída dele**. O texto do lembrete é "Oi, {nome}!
Seu horário na *{salão}* é hoje às {HH:MM}, com {barbeiro}. Você vem?", e os 4
parâmetros do template da Meta são nome, salão, hora e barbeiro. Uma consulta
ao banco por lembrete enviado, para nada. Descoberto ao conferir se a seleção
múltipla exigia mexer no n8n (não exigia, justamente por isso). Tirar é seguro,
mas mexer em fluxo que fala com cliente pede janela própria.

Depois: logo e Instagram. `salons` não tem nenhum dos dois; pedem colunas novas
e envio de imagem. Até lá, entram as iniciais.

## Segurança

### Funções SECURITY DEFINER: auditoria de exposição (2026-09-09)
Advisors 0028/0029 apontaram funções `SECURITY DEFINER` executáveis por `anon`/`authenticated`. Auditado a fundo:
- **2 triggers expostos** (`marca_o_fim_do_teste`, `respeita_folga_entre_atendimentos`, ambos
  `RETURNS trigger`) tinham EXECUTE herdado de `public` → chamáveis via `/rest/v1/rpc/`. O CRM não os
  usa (grep vazio). **TRANCADOS** (migration 0143: revoke execute de public/anon/authenticated).
  Revogar não afeta os triggers, que rodam pelo mecanismo de trigger.
- **12 RPCs de gestão** executáveis por `authenticated` (`definir_papel_do_membro`, `editar_convite`,
  `tirar_da_equipe`, `trocar_email_do_convite`, `estornar_venda`, `definir_agenda_publica`,
  `definir_servicos_do_agendamento`, `garantir_cliente`, `quero_atender`, `salvar_jornada`,
  `situacao_do_acesso`): **TODAS validam o tenant do chamador** (`private.salon_ids()` /
  `private.is_manager()` / `auth.uid()`+role) — **sem IDOR**. O WARN do advisor é esperado (é o
  padrão de RPC de gestão com verificação interna); manter como está.
- **Ainda aberto (menor):** `function_search_path_mutable` em 3 funções `private` (`telefone_valido`,
  `destino_whatsapp`, `documento_valido`) — adicionar `SET search_path`; mexer nelas é arriscado
  (usadas em muitas views), fazer em leva dedicada com teste. `extension_in_public` (`btree_gist`,
  não mover — sustenta as exclusion constraints) e `leaked_password_protection` (exige Pro) seguem.

### ~~Proteção contra senhas vazadas desativada~~ — LIGADA em 12/09

Ligada pela API de gerenciamento junto com outras duas travas da revisão de segurança, aprovadas
pelo dono: **re-autenticação para trocar senha** (uma sessão roubada trocava a senha e ficava com a
conta) e a **limpeza da lista de endereços de retorno do login** — saiu a entrada corrompida
`...vercel.app/**ehttp://localhost:5173/**`, sobraram quatro. O `localhost:5173` ficou de propósito:
tirar quebra o login no `npm run dev` e o risco prático é baixo. O captcha continua desligado: precisa
de conta no provedor e mexe no front.

**Testado pelo dono em 12/09: "esqueci minha senha" continua funcionando** com a re-autenticação
ligada, como o código previa — os dois caminhos trocam a senha logo depois de criar sessão nova
(código por e-mail em `ForgotPasswordPage`, link em `ResetPasswordPage`), e sessão de segundos atrás
é o que a regra considera login recente.

O texto abaixo é o registro de quando estava desligado.

### Como era antes: exigia plano Pro
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

### PostgREST do Supabase Free instável (504) derrubava workflows — mitigado com retry (2026-09-09)
Vários workflows agendados falharam com `Gateway timed out` (504) ao ler o Supabase, gerando e-mails
do error workflow (que funcionou como esperado). Diagnóstico pelos logs: **não é query lenta nem bug
nosso** — banco vazio responde instantâneo, `pg_stat_activity` limpo (sem vazamento de conexão). É o
**PostgREST do Free tier** (pool de 10) com "Warp server error: Thread killed by timeout manager"
(437×/24h) e reinicializando o pool ~17×/24h → janelas intermitentes de 504. Os nós Supabase não
tinham retry, então cada blip derrubava o workflow inteiro.
**Mitigação (feita):** `retryOnFail` (maxTries 4, waitBetweenTries 5000ms) nos nós Supabase de TODOS
os 10 workflows agendados que leem o banco — Avaliação, Convite, Reativação, Lembrete (16 nós),
Aviso de Fim de Teste, Detalhamento de Uso, Auditoria do Agente, Uso Aura, Sentinela, Estoque
(~25 nós no total). Absorve os blips; os e-mails falsos param. Republicados. (O nó `Gerar Boletos`
do Detalhamento ficou fora do template — é edge function idempotente, não PostgREST; mantido em 2/3000.)
**Cura raiz (decisão do dono):** o Free tier instável é teto para produção — com barbearias reais,
esses 504 derrubariam lembretes/agente na cara do cliente. **Supabase Pro** (compute dedicado,
PostgREST estável, pool maior) resolve na origem. Junto do Vercel Pro, é o passo de infra rumo à produção.
**Pro CONFIRMADO (2026-09-09):** `get_organization` → `plan: pro` (org `psiyojfncbwxjtibuiug`).
Ressalva honesta: subir o *plano* não redimensiona o *compute* sozinho — a cura do "Thread killed" é a
instância maior, às vezes add-on à parte, e o MCP não expõe o tamanho do compute. Falta **provar
empírico**: ver nos logs do PostgREST se os `Thread killed`/504 caíram após o upgrade; se persistirem, o
próximo passo é o compute add-on, não o plano. Os retries seguem como cinto de segurança de qualquer jeito.
**Pendente:** reversionar os 10 workflows no `clubcut-backups` (backup ficou defasado sem o retry).

### Nome verificado do número central RECUSADO pela Meta (2026-09-08)
`name_status: DECLINED`, motivo `BIZ_COMMERCE_VIOLATION_OTHER`, no número central
+55 41 8475-4172 (`phone_number_id 1288009817732005`). **Não é banimento nem queda de
nota** (verificado na Graph API): o número está `CONNECTED`, `quality_rating: GREEN`,
`account_mode: LIVE`, `throughput STANDARD` — envia normal. Impacto: sem nome verificado
aprovado, o cliente vê o número em vez de "Club Cut" com selo — **branding/confiança, não
entrega**. Também `code_verification_status: EXPIRED` (re-verificar o número quando puder).
**RESOLVIDO/EM ANÁLISE (2026-09-09):** a causa **NÃO** era verificação do negócio — ao vivo,
`business_verification_status: verified` e `account_review_status: APPROVED` (o palpite de 08/09 estava
errado). O motivo detalhado no WhatsApp Manager era o **nome submetido `Club_Cut` com underscore**, que
viola as Diretrizes de nome de exibição do WhatsApp. Re-submetido como **`Club Cut`** (espaço, `✓` verde
de formato) + site `clubcut.space` no motivo; status virou **"Em análise"**. Quando aprovar, o cliente
passa a ver "Club Cut" no lugar do número. Resíduo menor: `code_verification_status: EXPIRED`
(re-verificar o número um dia).

### Monitor da WABA (0116) alarma demais e com texto enganoso (2026-09-08)
A view `auditoria_operacao` (ramo `qualidade-waba`, migration 0116) gera alerta **grave**
para **qualquer** linha de `eventos_da_waba`, com o texto fixo "Nota baixa degrada o alcance
da plataforma inteira". Mas `eventos_da_waba` recebe TODO evento administrativo da Meta —
inclusive `message_template_status_update` **APPROVED**. Em 08/09 os 8 templates aprovados
dispararam 8 alertas "graves" de "nota baixa" (falso positivo), e a rejeição do nome virou um
9º — todos com o mesmo texto errado, sendo que a nota real está GREEN. **Corrigir** (migration
nova + aplicar à mão): classificar por `e.campo`/`decision` — `phone_number_quality_update` com
queda = grave (o caso que a 0116 queria pegar); `phone_number_name_update` DECLINED = aviso de
branding; restrição de conta (`account_update`) = grave; `message_template_status_update` = ignorar.
**RESOLVIDO em 2026-09-08 (migration 0139, aplicada):** o ramo `qualidade-waba` classifica por
`campo`/`decision` — quality_update com queda = grave, conta com ban/restrição = grave, nome recusado
= aviso de branding, eventos de template = ignorados. Verificado: os 8 templates sumiram dos alertas
e a rejeição do nome virou 1 aviso com texto correto. Resta um follow-up menor: template PAUSED/DISABLED
não gera alerta em lugar nenhum (fora do escopo do monitor do número; avaliar um alerta próprio depois).

### Auditoria ganhou 2 alertas de ação rápida (2026-09-08, migration 0140, aplicada)
Depois do inventário do que a auditoria cobria, os dois erros mais silenciosos e caros viraram alerta:
- **Agente mudo** (`auditoria_atendimento`, `grave`): conversa cuja última mensagem é do cliente e
  ficou > 15 min sem resposta (agente não pausado, barbearia atendendo). É a falha que já deixou o
  agente mudo por semanas. Chave = id da mensagem final → some quando o agente responde.
- **Cobrança travada** (`auditoria_cobranca`): B1 fatura com CPF ≥ R$5 aberta > 2d sem boleto =
  `grave` (Asaas recusando / cobrar-uso falhou); B2 sem CPF/CNPJ > 3d = `aviso`; B3 boleto vencido
  > 3d e não pago = `aviso`.
Ambas entram na `auditoria_pendente` (o n8n "Auditoria do Agente" manda ao canal; sem mudança no n8n).
Lógica testada com cenários (12/12 PASS).

**`agent_paused` esquecido — FEITO (2026-09-08, migration 0141, aplicada).** Ramo `dono-sumiu` da
`auditoria_atendimento` (`aviso`): conversa com `agent_paused=true` cuja última mensagem é do cliente
há > 60 min (folga maior que os 15 do agente; gravidade menor porque o dono já sabe da conversa).
Fecha a lacuna que o agente-mudo deixava aberta. Lógica testada (6/6 PASS).

**Overbooking NÃO é buraco:** o banco já impede por exclusion constraint —
`appointments_sem_sobreposicao` (mesmo profissional) e `appointments_cliente_sem_sobreposicao`
(mesmo cliente), ambas `EXCLUDE USING gist` sobre `tstzrange` fora de cancelado/faltou. O que caberia
ali é um code review garantindo que todos os caminhos de criação tratam o erro `23P01` sem susto pro
cliente — não um alerta.

**Comanda aberta esquecida — FEITO (2026-09-09, migration 0142, aplicada).** View
`auditoria_comanda` (`aviso`): comanda `aberta` cujo caixa já fechou (órfã) **ou** aberta num dia
anterior; só barbearia atendendo, janela de 30 dias. Nenhum cron fecha comanda (só caixa e
agendamento), então a venda ficava pendurada em silêncio. Lógica testada (7/7 PASS).

**Ainda aberto do inventário** (sem pressa): opt-out subindo (precisa de volume real de disparos) e
"webhook do Asaas parado" (inviável de detectar só pelo banco — fora por ora).

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

### ~~`whatsapp/index.ts` escolhe salão arbitrário sem `salonId`~~ — RESOLVIDO em 13/09
Quando `body.salonId` não vinha, a consulta fazia `.limit(1).maybeSingle()` e
pegava um vínculo qualquer — sem `order by`, então nem sempre o mesmo. O
comentário três linhas acima explicava por que isso era errado; o `else` fazia
exatamente isso.

**A idade é a parte interessante:** o fallback nasceu em **26/07/2026**, no
commit *"Conexao do WhatsApp respeita a unidade selecionada"* — o commit que
**consertou** este bug na tela e guardou o comportamento antigo no `else`, por
precaução. Ficou 49 dias. Meio conserto que preserva o defeito "por segurança"
é o defeito com data marcada.

**Alcance real, medido lendo as cinco ações:** `send` e `resume_agent` já
comparavam `conversation.salon_id !== salonId` e devolviam 404 — nunca houve
vazamento entre inquilinos. Quem machucava eram `connect`, `status` e
`disconnect`, que agem sobre `instanceNameFor(salonId)`: **`disconnect` derruba
o WhatsApp de uma unidade que está atendendo** enquanto o dono acha que desligou
outra, e as três gravam `whatsapp_connections` do salão errado.

**Resolvido exigindo o salão** (`_shared/salaoDoPedido.ts`, 400 sem ele): não
existe fallback seguro para "qual unidade?", e ambiguidade em ação destrutiva se
resolve recusando. Os três chamadores do CRM já mandavam `salonId` desde 26/07 e
todos têm `if (!salonId) return` antes — nenhum quebra. Edge redeployada (v51).

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

### "Pediu para falar com o dono" não entra no sino de notificações — 2026-09-14
O sino (migration 0173) mostra o que o cliente fez sozinho: marcou, mudou,
cancelou. O quarto evento que gera aviso efêmero — **pediu o dono** — ficou de
fora porque `whatsapp_conversations` guarda só o booleano `needs_human`, sem
carimbo de QUANDO o pedido aconteceu. Para entrar: coluna
`needs_human_em timestamptz` preenchida pelo agente (n8n, ferramenta Chamar o
Dono) e um quarto ramo na view `notificacoes_do_salao`. Sem o carimbo, o
histórico mentiria a hora.


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

### ~~Política de atraso~~ — APOSENTADA em 11/09 (M16)

`CRM Salao - Politica de Atraso` (id `67oZqGOIoKO6pAeQ`) nunca foi publicado,
estava parado desde 23/08, e o template `atraso_esta_vindo` nunca saiu de
rascunho na Meta — a view era lida por ninguém e a mensagem não podia ser
enviada nem se alguém a lesse. O desenho também não sobreviveu: ele previa o
barbeiro decidindo na faixa do balcão, que saiu em 25/08, e o campo "Atraso
tolerado" já tinha saído de Configurações em 11/09 (achado 3 do plano C).

**Aposentado inteiro:** fluxo arquivado no n8n; `atrasos_para_perguntar`,
`appointments.atraso_perguntado_em`, `salons.atraso_tolerado_minutos` e a linha
do template saíram na migration 0158; o `atraso_perguntado_em` saiu do SELECT da
agenda no CRM, onde era lido e nunca desenhado. `n8n-politica-de-atraso.md`
ficou como registro do que foi.

**A ideia refeita, para quando valer a pena:** o cliente atrasado recebe a
pergunta e, se responder "não vou", o horário cancela na hora e a cadeira é
liberada; sem resposta, segue a presença deduzida (0153). Precisa de **modelo
novo aprovado pela Meta** e de mexer no recebimento de respostas
(`whatsapp-webhook`) — é projeto próprio, não sobra de outra entrega.

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

### `~/.clubcut/supabase.env` tem uma SUPABASE_SERVICE_ROLE_KEY que não vale
Achado de passagem em 13/09, ao tentar conferir por REST uma consulta do agente:
a chave do arquivo devolve `Invalid API key`. Tem 88 caracteres e não é JWT
(`eyJ...`) nem chave nova (`sb_secret_...`), então não é só rotação — é outra
coisa gravada no lugar. Nada quebrou por causa disso: o n8n usa a credencial
dele, e as migrations vão pelo MCP. **Quebra quem for escrever script que fala
com o PostgREST** achando que o arquivo serve. Trocar pela chave certa ou apagar
a linha, para não prometer o que não entrega.


### ~~Template de e-mail do Supabase ainda diz "14 dias"~~ — RESOLVIDO em 11/09
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

**Resolvido em 11/09, com o ok do dono:** aplicado pela API de gerenciamento do
Supabase, só no corpo do e-mail de confirmação, trocando "14 dias" por "7 dias" e
nada mais. Conferido depois da troca: o texto no ar é idêntico ao esperado, com
os acentos intactos. Nenhum dos outros modelos e assuntos cita prazo.


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

**0145 a 0152 ficaram fora do histórico (achado de 11/09, corrigido no mesmo
dia).** Foram aplicadas à mão como SQL solto em 10/09 — por mim —, e o
histórico parava na `cobranca_pix_abacatepay` (0144). Conferido objeto por
objeto que todas estão no banco; as oito foram registradas depois em
`supabase_migrations.schema_migrations`, com versão = hora do commit que criou
o arquivo (aproximação: a hora exata da aplicação não ficou em lugar nenhum) e
`created_by = 'registro_retroativo'`. Desde a 0153, migration vai pelo
`apply_migration`, que registra sozinho.

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

### O agente contou um horário que não existia mais — 2026-09-13
O cliente escreveu *"já tenho um horário marcado e queria falar sobre ele"* e o
agente respondeu **"você já tem um horário agendado, com o barbeiro Saymon às
15:00"**. O horário de pé era **14/09 às 12:10, Barba + Corte infantil**. O
15:00 era um agendamento do dia 10/09 que o próprio cliente havia **cancelado**
na conversa anterior.

A execução `25385` mostra a causa em uma linha: `ai.agent.tool_calls.requested:
0`. **Ele não consultou nada.** Recitou o texto que ele mesmo escrevera dias
antes, que continua no histórico da conversa. O prompt já mandava conferir
(`E. O QUE VOCÊ MESMO DISSE ANTES NÃO É PROVA`) — mandar não bastou, porque a
regra dependia de o modelo *decidir* chamar a ferramenta.

Ao abrir a ferramenta que ele deveria ter chamado, ela também estava errada:

- **O serviço era só o principal.** A view lia `a.service_id`; desde o corte +
  barba num agendamento só, o serviço de verdade mora em `appointment_services`.
  Diria "Barba" para quem marcou "Barba + Corte infantil".
- **`status <> 'cancelado'` deixava passar `concluido` e `faltou`.** Na conta
  real deste banco, a consulta devolvia **dois** horários para o mesmo amanhã, e
  um deles não existia mais.

**Corrigido em 13/09** (migration 0171 + n8n `rJO1n7cFeNDIJyB5`, versão ativa
`8e9ec722`):

- A view soma `appointment_services` e ganhou `de_pe`, que é `agendado` ou
  `confirmado` — a regra num lugar só, em vez de espalhada pelos chamadores.
- Nó novo **Horarios do Cliente (Contexto)**: os horários do cliente passam a ir
  no CONTEXTO, como já vão o calendário, o catálogo e os barbeiros. Com o fato à
  vista, não há o que lembrar errado — e não depende de o modelo decidir chamar
  ferramenta. **Esta é a correção; o resto é higiene.**
- Prompt: o item E passou a dizer *qual* fonte vence quando o histórico e a
  agenda discordam.

**A lição, que já é a terceira vez:** fato que o agente não pode inventar não
mora numa ferramenta, mora no contexto. Foi assim com o calendário (ele
anunciava sábado como segunda), com o catálogo (ofereceu "Corte com máquina e
tesoura", que não existe) e agora com a agenda do próprio cliente.


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

### Atualização (2026-09-07): a Meta aprovou 8 templates — e há descasamento com as filas
**Fato (verificado na Graph API + banco, não deduzido):** a Meta **aprovou os 8
templates** submetidos em 06/09, todos `UTILITY`/`pt_BR`. `status` reconciliado no
banco (`em_analise`→`aprovado`), `categoria_meta='utility'` (sem recategorização —
custo ~R$0,04 preservado). Chaves aprovadas: `avaliacao_pos_atendimento`,
`lembrete_confirmacao`, `lembrete_amanha`, `lembrete_hoje`, `reativacao`,
`reativacao_barbeiro`, `reativacao_horario_livre` (nome_meta `agendamento_sugerido`,
`agendamento_sugerido_barbeiro`, `horario_reservado`), `retorno_intervalo`.
Verificar: `scratchpad/check_meta_templates.py`.

**O que a aprovação destravou — e o que NÃO destravou.** A trava de disparo mora nas
views que fazem `join whatsapp_templates ... status='aprovado' and ativo`:
- ✅ **Avaliação** (`avaliacoes_a_pedir` → `avaliacao_pos_atendimento`): ponta a ponta
  — template + view + fluxo n8n já existem. **Único caminho realmente destravado.**
- ❌ **Reativação/retorno de 2 etapas** (`clientes_para_reativar` → `reativacao_convite`
  + `reativacao_tempo`; `clientes_para_avisar_retorno` → `retorno_pedido` +
  `retorno_pedido_segunda`): as 4 chaves seguem **rascunho** → views vazias. É o
  modelo antigo (0083); os templates aprovados não são os que essas views consomem.
- ❌ **Reativação por agendamento automático (0113, modelo vigente)**: a fila
  `reativacoes_a_enviar` não trava por template, mas o **fluxo n8n de disparo não
  existe** (já registrado acima). Descasamento extra de nome: aqui se previa
  `agendamento_automatico_v2…v10`; o aprovado é `agendamento_sugerido*`/
  `horario_reservado`. **Decidir a nomenclatura única antes de construir o fluxo.**
- ❌ **Atraso** (`atraso_esta_vindo`) e **fim de teste** (`fim_de_teste`): rascunho →
  `atrasos_para_perguntar` / `vencimentos_a_avisar` seguem vazias.
- ❓ **Lembrete** (`lembrete_hoje/amanha/confirmacao` aprovados): não há view de fila
  que trave por template; o disparo usa outro caminho (provável `nome_meta` fixo no
  n8n). Aprovar na Meta faz o envio funcionar — **confirmar o fluxo n8n de lembrete
  com um teste real** antes de dar como pronto.

**CRM:** não lê `whatsapp_templates` (grep vazio em `src/`) — a aprovação não mudou tela.

### Como os 3 fluxos disparam de verdade + a reativação pega carona no lembrete (2026-09-07)
Mapeado nas funções do banco + nodes do n8n + edge `whatsapp-webhook`:
- **Lembrete** (workflow `DW0nq1Jyp9xeOJwm`, Schedule 10min): busca appointments entre
  `now+85min` e `now+100min` (~1h30 antes), status ≠ cancelado/concluído/bloqueio,
  **sem filtrar `origem`**. Envia o template **`lembrete_hoje`** (chave fixa no node) pelo
  número central (Cloud API). `lembrete_amanha`/`lembrete_confirmacao` aprovados NÃO são usados.
  Grava só `lembrete_enviado` + `lembrete_message_id`.
- **Avaliação** (workflow `NsHcELIXrETknywa`, Schedule 30min): view `avaliacoes_a_pedir`
  (orders fechadas 2–26h atrás, não avaliado há 8 semanas), template `avaliacao_pos_atendimento`,
  Cloud API central; `marcar_avaliacao_pedida` guarda o wamid.
- **Resposta (ambos)**: o clique no botão chega na edge `whatsapp-webhook`, que chama
  `responder_lembrete` e, se não for lembrete, `responder_avaliacao` — **o banco decide pelo
  wamid** (`context.id`), nunca pelo texto, e devolve a resposta pronta que o n8n só entrega.

**Achado — a reativação hoje "pega carona" no lembrete, e isso quebra a expiração/pausa.**
Não existe fluxo que consuma `reativacoes_a_enviar` (janela 2–26h antes) nem que chame
`marcar_reativacao_enviada`. O horário de reativação (criado pelo cron `cria-reativacoes` 24–25h
antes) só é avisado quando o **lembrete** o pega ~1h30 antes. Consequências (dedução verificada
no código):
1. O cliente é avisado **1h30 antes** de um horário que **não pediu** — tarde para reorganizar o
   dia, e com texto de lembrete ("seu horário é hoje… você vem?"), não de reativação.
2. `marcar_reativacao_enviada` nunca roda → `confirmacao_enviada` fica `false` →
   `expira_reativacoes_sem_resposta` (que exige `confirmacao_enviada`) **não cancela** a reserva
   sem resposta, e `reativacao_sem_resposta` nunca incrementa → a **pausa após 2 silêncios** nunca
   dispara. (Sobra só a pausa por 2 no-shows, via trigger `trg_reativacao_pos_atendimento`.)
3. A **resposta** funciona (`responder_lembrete` trata `origem='reativacao'`: Sim confirma+cobra;
   Cancelar cancela+pausa; Reagendar cancela a reserva+entrega ao agente). É o envio e o
   "sem resposta" que estão furados, não a resposta.
Construir o fluxo dedicado de reativação (varrer `reativacoes_a_enviar`, enviar 2–26h antes,
chamar `marcar_reativacao_enviada`) resolve os três de uma vez.

**RESOLVIDO em 2026-09-08.** Construído o workflow n8n **"CRM Salão - Reativação (Convite
Automático)"** (`Fxc7WGhCoHu7KUe1`, **ativo**, Schedule 30min, errorWorkflow ligado): remetente
central → `reativacoes_a_enviar` → Code de **rotação** (3 variantes por `reativacao_sem_resposta %
3`; `reativacao_barbeiro` só com barbeiro; fallback "nossa equipe") → **gate** `whatsapp_templates`
aprovado → envio pelo número central (Cloud API) → `marcar_reativacao_enviada` **só no sucesso**
(`onError=continueErrorOutput`). É esse marcar que liga `confirmacao_enviada` e **destrava a
expiração/pausa automática** que estava furada. Rotação + fallback testados nos 4 casos (exec
20769). O Lembrete (`DW0nq1Jyp9xeOJwm`) passou a **ignorar `origem='reativacao'`** (1 linha no
`Classificar Envio`) e foi **republicado** → acabou o envio duplo. Resposta segue por
`responder_lembrete` (ramo reativação) na edge `whatsapp-webhook`. **Versionado** no
`clubcut-backups` (commit `ce47816`: `reativacao-convite.json` novo + `lembretes-agendamento.json`,
que de quebra trouxe o fix Meta #2 que faltava no backup). **Pendência única:** teste de envio real
ponta a ponta — hoje a fila está vazia (1 barbearia, 0 clientes), então o envio/RPC reais não foram
exercitados (usam o mesmo node/cred/remetente do lembrete e da avaliação, já provados em produção).

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

### El Guardians desvinculada do número oficial (2026-09-01)
Diagnóstico: a aba Conexão mostrava "API oficial" para a El Guardians porque
ela ainda tinha `provedor = 'cloud_api'` — e o phone_number_id dela era o MESMO
que virou remetente central. Efeito escondido: `salon_por_phone_number_id`
resolvia o número central para a El Guardians, então o ramo central do webhook
nunca rodava e texto solto de cliente de OUTRA barbearia cairia na conversa
dela. Corrigido: linha da El Guardians voltou para evolution sem
phone_number_id (verificado: central_resolve_salao = null; nenhum salão em
cloud_api). Blindagem no CRM: o bloco "oficial" agora exige phone_number_id
próprio, e o texto passou a explicar o híbrido.
Pendente do Saymon: parear o QR da El Guardians e testar conversa (texto +
áudio) — é o teste que valida o ramo Evolution e o ramo central de uma vez.

---

## Achados do passo 1.9 (2026-09-01) — abertos

Encontrados enquanto o telefone do cliente ganhava régua única (migration
0128). Nenhum deles é do escopo do passo, e por isso ficam aqui em vez de
sumir no chat.

### ✅ RESOLVIDO em 02/09 — o `'55' ||` das views de disparo
Estava em cinco views (`avaliacoes_a_pedir`, `clientes_para_reativar`,
`clientes_para_avisar_retorno`, `atrasos_para_perguntar`, `vencimentos_proximos`)
e produzia destino de 14 dígitos para todo cliente cadastrado pelo agente.
Migration 0129: a régua virou `private.destino_whatsapp`, e um teste pgTAP varre
o schema inteiro atrás da concatenação — view nova escrita do jeito antigo
derruba o CI. `reativacoes_a_enviar` ganhou a coluna `destino`, que não tinha.

**Nenhuma mensagem torta chegou a sair:** todos os templates ainda estão em
`rascunho`, então as filas nunca tiveram linha. O conserto entrou antes do
primeiro envio.

O que sobrou desta família está logo abaixo.

### ⚠️ n8n: o link de "Remarcar" do lembrete monta `wa.me/55` às cegas
Único lugar fora do banco que ainda monta destino por conta própria. No fluxo
**CRM Salão - Lembretes de Agendamento** (id `DW0nq1Jyp9xeOJwm`, **ativo**), nó
`Montar Texto de Reagendamento`:

```
'https://wa.me/55' + $json.telefone.replace(/\D/g,'')
```

`$json.telefone` é o telefone da **barbearia**. Medido em 02/09:

| barbearia | telefone | link que o cliente recebe |
|---|---|---|
| Barbearia do Samuca | `5541987275895` | `wa.me/555541987275895` ❌ |
| Gusta Barber | `1924u192` | `wa.me/551924192` ❌ |
| Curitiba / São José | (vazio) | `wa.me/55` ❌ |
| El Guardians | `41984729754` | `wa.me/5541984729754` ✓ |

Este é o único da família que **já chega ao cliente**: o lembrete está ativo, e
quem responde "Remarcar" recebe um link morto. A correção é aplicar a mesma
régua no expression e cair na frase de reserva ("é só chamar no WhatsApp de
sempre") quando não houver destino válido — o ternário para isso já existe no nó.

### `salons.telefone` não tem régua nenhuma
A 0128 trancou `clients.telefone` em 10–13 dígitos. O telefone da **barbearia**
continua aceitando qualquer coisa: "Gusta Barber" está com `1924u192` gravado, e
a aba Configurações não valida o campo. É o mesmo defeito de uma casa ao lado, e
alimenta o link de remarcar acima, o `whatsappBarbearia` da página de gestão do
horário e o rodapé de mensagens.

### Fixo de 10 dígitos vira destino de WhatsApp
`private.destino_whatsapp` aceita 10 dígitos e devolve 12, porque foi decidido
preservar o comportamento de hoje. Mas telefone fixo não tem WhatsApp: pelo
canal oficial isso é um template cobrado que nunca chega. Distinguir fixo de
celular antigo pelo primeiro dígito depois do DDD é heurística, e errar nela
significa deixar de falar com um cliente de verdade — por isso ficou de fora do
conserto. Decidir com dado na mão quando houver volume.

### O fechamento de comanda engole o erro ao gravar preferência de aviso
`src/features/vendas/NewSaleModal.tsx` (~linha 551) grava em `clients` o opt-in
de aviso de retorno e as preferências de reativação, e trata a falha com
`console.error('Preferência de aviso não salvou:', avisoError)`. A venda fecha
normalmente e o registro de consentimento — que é o que distingue "foi avisado"
de "nunca ouviu falar", exigência de LGPD — simplesmente não grava, sem nada na
tela. Defeito silencioso.

### n8n: a fila de convites precisa deduplicar por token, não por convite
Com a 0128, trocar o e-mail de um convite zera `email_enviado_em` e o convite
volta para `convites_a_enviar`. Se o fluxo que lê essa view deduplicar por `id`
do convite ou por e-mail, o reenvio é barrado como "já mandei esse" e o
convidado novo não recebe nada — exatamente o defeito que a 0128 veio corrigir,
só que uma peça adiante. **A chave certa é o `token`.** Conferir no n8n.

Junto disso: o corpo do e-mail deveria dizer que este link substitui qualquer
anterior.

### ⚠️ Ordem de aplicação: migration antes do deploy abre janela de quebra
Aconteceu neste passo, e é para não repetir. A 0128 foi aplicada à mão em
produção **antes** do commit. Entre a aplicação e o push, duas coisas ficaram
quebradas para quem estivesse usando o CRM:

- **"Trocar e-mail do convite"** respondia erro sempre: o `revoke update` já
  valia e o código no ar ainda fazia `update` direto (a RPC só existia na
  árvore de trabalho).
- **Agenda pública** com telefone de 14 dígitos passava pelos dois filtros de
  piso, batia na CHECK nova e devolvia 500 genérico, derrubando o horário que
  a pessoa já tinha escolhido.

A regra que faltava: **quando a migration APERTA uma regra, o código que a
antecipa tem de estar no ar primeiro.** Afrouxar pode ir antes; apertar vai
depois. E a edge function é a única das cinco peças que não sobe no push —
`supabase functions deploy <nome>` é comando à mão, e o `.github/workflows/ci.yml`
não faz deploy de função nenhuma.

### Cliente duplicado quando o telefone fica em branco na Agenda
Sem telefone, `NewAppointmentModal` procura o cliente pelo **nome** — e essa
busca passa pela RLS de leitura, que pode esconder um cliente cadastrado por
outro barbeiro. Não achando, cria outro. O índice único não barra, porque sem
telefone `telefone_norm` é nulo. É o resto do achado 11: a RPC `garantir_cliente`
resolveu o caminho com telefone, o caminho sem telefone continua aberto.

---

## Achados do passo 2.1 — a cadeia de cobrança (2026-09-02)

### ⚠️ Dívida invisível: fatura com valor e sem boleto emitido não bloqueia ninguém
A regra nova de acesso (`estender_acesso_sem_debito`, migration 0130) só segura
o acesso quando existe fatura **vencida** em aberto — e uma fatura só vence se
alguém emitiu o boleto, que hoje é feito **à mão** a partir do e-mail de
detalhamento.

A escolha é deliberada: o defeito que o passo consertou era o oposto — quem usou
pouco demais para gerar boleto ficava bloqueado devendo nada, e em 02/09 as
**seis** faturas da base estavam com `boleto_vencimento` nulo. Entre punir quem
não deve e deixar passar quem deve, punir quem não deve é pior.

Mas o outro lado ficou aberto: se a operação esquecer de emitir o boleto de uma
fatura com valor, aquela barbearia usa o sistema de graça e nada avisa. Falta um
alerta para a operação — fatura com `valor > 0`, `paga_em` nulo e
`boleto_vencimento` nulo há mais de N dias. É trabalho de n8n (o mesmo fluxo que
já manda o detalhamento), não do banco.

### O `atendimento_ate` tem duas fórmulas no projeto
`estender_acesso_sem_debito` grava `acesso_ate + 7`, seguindo o que o teste de
gating usa. Mas as views de bloqueio calculam `coalesce(atendimento_ate,
acesso_ate + 3)` — folga de 3 dias quando a coluna é nula. São dois números para
a mesma ideia ("quanto tempo o WhatsApp continua depois do acesso vencer"), e
qual vale depende de a coluna estar preenchida ou não. Unificar quando alguém
mexer nessa área.

---

## Achados do passo 2.2 — acesso, status e saída (2026-09-03)

### O "hoje" do bloqueio e o "hoje" das views não são o mesmo relógio
`situacao_do_acesso` (0131) decide "bloqueado" e "atendendo" pela data de
**São Paulo**: às 22h do último dia pago, o UTC já virou, e dizer "venceu" para
quem ainda tem duas horas é tirar o que ele pagou. As views `salons_atendendo` e
`salons_com_automacao` usam `current_date`, que no Supabase é **UTC**. Entre
21h e 0h (horário de Brasília) as duas podem discordar por algumas horas —
janela pequena, mas é o mesmo tipo de "duas verdades" que o achado 20 fechou
para a régua dos 3 dias. Quando alguém mexer nas views, trocar por
`(now() at time zone 'America/Sao_Paulo')::date`, que é o que a cobrança
(`fechar_mes_de_uso`) já usa.

---

## Achados do passo 2.8 — folga entre atendimentos (2026-09-03)

### O QR chama de "acabou de ser pego" o que pode ser folga
`agenda-publica/index.ts` mapeia qualquer `23P01` no insert para "Esse horario
acabou de ser pego. Escolha outro." Desde a 0134 a folga entre atendimentos
também levanta `23P01` (com a explicação em português na mensagem). Pelo QR
isso só acontece em corrida — a lista oferecida já respeita a folga —, mas
quando acontecer a frase vai dizer "pego" para um horário que só encostou em
outro. O conserto é o mesmo das telas do CRM: mostrar a mensagem do banco
quando ela vier em português, e cair na frase fixa só sem ela.

---

## Achados do passo 3.4 — carregando, vazio e erro (2026-09-03)

### "Tentar de novo" na Rede não recarrega a produção por barbeiro
O banner de erro da aba Rede chama `recarregar` de `useRedeData`. A produção
por barbeiro vem de `useProducaoBarbeiros`, que não expõe reload — só refaz a
consulta quando o período muda. Se só ela falhar, o botão não a alcança; o
caminho hoje é trocar o período e voltar. Quando alguém mexer no hook, expor o
`recarregar` e ligar os dois no mesmo botão.

### Sob erro, o gráfico de clientes e a barra de meta do Financeiro ficam vazios
Os cards e o total da meta viraram "—", e as listas calam o vazio. O gráfico
de crescimento de clientes (`data.clientsGrowth`) e a barra de progresso da
meta não afirmam número nenhum, mas desenham uma área vazia e uma barra em
zero debaixo do banner. Não é um "R$ 0,00", mas é o mesmo tipo de silêncio;
o conserto é o mesmo das listas da Rede: "não foi possível carregar" no lugar.

### `carregar` da Cobrança da rede deixa `carregando` preso se a guarda mudar
`CobrancaDaRede.carregar` retorna cedo quando não há `organizationId` ou há
menos de duas unidades próprias, sem baixar `carregando`. Hoje é inalcançável
porque o componente devolve `null` exatamente nessas condições (linha do
`if (!isNetwork || ...) return null`). Se a guarda de renderização for
afrouxada um dia, a tela vira esqueleto para sempre.

---

## Achados dos passos 3.5 a 3.10 — Parte 3 (2026-09-03)

### O QR da Evolution não diz quando vence
`ConexaoPage` marca o código como vencido aos 40 s por estimativa
(`QR_VALIDADE_MS`); a Evolution não devolve a validade. Se a API expuser o
prazo, a edge function `whatsapp` (action `connect`) deve repassá-lo e a tela
usar o número real em vez da estimativa.

### O teto do fechamento de comissão
`FechamentoComissaoModal` pede 1000 linhas e avisa quando bate no teto. A
saída definitiva é uma RPC que agrupe por profissional no banco; por ora,
salão com mais de 1000 comissões no mês fecha por quinzena. (A produção por
barbeiro da Rede sem reload já está registrada no 3.4.)

### Exportar: o nome do pacote é atribuído por ordem
Item de pacote em `order_items` não guarda o modelo; o export (e o detalhe da
venda) casa os itens com `pacotes_do_cliente` na ordem de criação. Comanda
com dois pacotes diferentes pode trocar os nomes entre si. Corrige-se
guardando `pacote_id` em `order_items` (migration) — o mesmo defeito do
`VendaDetalheModal`.

### Sistema visual: o que ficou de fora do 3.10
- `botoesDoSistema.test.ts` é uma catraca (teto por tela), não zero: abas,
  seletores de período e ícones de fechar ainda são botões à mão. A varredura
  "volta vazia" do roteiro exige converter esses restantes (AgendaPage 6,
  FinanceiroPage 10, EquipePage 10, ClientesPage 4, os demais 0 a 3).
- D6 inteiro segue aberto: `.btn-ghost` com uso único, badges ok/marca iguais
  no escuro, sombras de camada flutuante, `<CardHeader>`/`<Segmentado>`/
  `<FolhaInferior>`, `jsx-a11y` no oxlint, `viewport-fit=cover`.
- A pilha de avisos (z-50) fica por cima de modais (também z-50, por ordem no
  DOM): um "novo agendamento" pode cobrir o topo de um modal aberto por 15 s.

---

## Achados da Parte 4 — divergências de caminho (2026-09-03)

### Regra de "cobrável" e o n8n
`agendamentos_cobraveis` (0136) é lida pela view do mês, pela fatura e pelo
painel da Conexão. O n8n não lê nenhuma das três; se um dia o agente precisar
dizer "quantos agendamentos este mês", ler da view, não recontar.

### ~~Senha mínima no painel do Supabase Auth~~ — RESOLVIDO em 04/09/2026
O CRM exige 8 em todas as telas (`lib/senha.ts`). O mínimo do Auth ficou em 8
também; antes a API aceitava o que a tela recusava. Ajustado pelo dono no
painel (Authentication → Providers → Email → Minimum password length).

Foi tratado como urgente, e não como faxina, por um motivo que separa este
item dos outros dois do mesmo bloco: **ele piorava com o tempo.** Instância
órfã e cliente no Asaas custam o mesmo para limpar hoje ou daqui a meio ano;
o mínimo de senha, não — toda conta criada enquanto ele estava em 6 ficava
com senha fraca permitida, e subir o ajuste depois não corrige quem já entrou.

Não há ferramenta MCP que leia configuração de Auth do Supabase, então isto
está registrado pela palavra do dono, não por verificação. O jeito de provar
é tentar criar conta com 7 caracteres e ver a API recusar.

### Mensagens fixas que ainda não passam pelo tradutor
O 4.5 converteu agenda, equipe, configurações, meta e fechamento. Ficaram com
frase fixa após erro do banco: `CaixaSection` (troco e fechar caixa),
`CobrancaDaRede` (ações), `useVendasData` e `ExportReportModal` (carga),
`NovaUnidadeModal`. Próxima varredura: todo `setErro('Não foi possível…')`
que tenha um `error` do supabase à mão passa por `traduzirErroDoBanco`.

### Estoque: o backfill da 0137 não encontrou nada
Em produção, nenhum produto tinha saldo diferente da soma dos movimentos na
hora da migração (03/09). A view `estoque_conferido` fica para conferir a
qualquer hora: `select * from estoque_conferido where diferenca <> 0` deve
voltar vazio para sempre.

### Lição de processo: commit depois do heredoc
No 4.3 o typecheck falhou e o commit rodou mesmo assim, porque a linha do
`git commit` veio DEPOIS do terminador do heredoc anterior — vira um comando
separado, fora do `&&`. Produção ficou com um `ReferenceError` por alguns
minutos (`21f359b` corrigiu). Regra: uma cadeia por comando, commit só depois
de ver as checagens verdes, e toda troca por script com `assert` na contagem
(a inserção do import falhou em silêncio por causa de um `\r`).

## Central de Ajuda desatualizada e produção zerada (2026-09-03)

### A Central de Ajuda parou em 31/08 e ficou 45 commits atrás
`AjudaPage.tsx` diz na própria abertura que "quando uma tela mudar de
comportamento, o tutorial correspondente muda JUNTO, no mesmo commit". A regra
não foi seguida em nenhum passo de 1.1 a 4.6. Último commit que tocou o arquivo:
`70bc18a` (31/08).

Funcionalidade nova que a ajuda não menciona: estornar venda e detalhe da
comanda (0127); dividir pagamento e editar preço do item na venda (3.7);
vários serviços no mesmo agendamento (0120); avaliação pós-atendimento
(0118/0121); cancelar e remarcar pelo link do próprio horário (0118,
`/meu-horario/:token`); "Quero atender" (0133); "Conversas" no menu (3.6);
desfazer comissão paga (3.7); renovar link e editar convite (3.8).

Texto que hoje contradiz a tela: cadastro de produto diz "estoque atual"
(virou "Estoque inicial" ao criar e "Ajuste de estoque" ao editar, 4.4);
exportar diz "Esta semana ou Este mês" (são três opções, e o mês segue a tela,
3.7); desativar barbeiro não avisa que agora mostra os horários futuros (3.8);
teste grátis passou de 14 para 7 dias e a ajuda não fala de teste.

### Produção zerada a pedido de Saymon
Para testar a jornada desde o cadastro, foram apagadas as 6 contas (inclusive
a dele) e as 6 barbearias, com tudo que pendurava nelas. Backup das 485 linhas
fora do repositório, em `~/Documents/clubcut-backups/` — não entra no git
porque tem e-mail, telefone e conversa de WhatsApp, e o repositório é público.

Duas lições da execução. A cascata de `salons` não basta: `appointment_services
.service_id` e `order_items.service_id` referenciam `services` com "no action",
então apagar `salons` chega em `services` antes de limpar quem aponta para ele
(23503). O caminho que funciona é das folhas para a raiz, explicitamente. E a
ordem entre `salons` e `auth.users` importa: `cash_registers.aberto_por`
referencia `auth.users` com "no action", então salão primeiro, usuário depois.

### Instâncias órfãs na Evolution (fora do repositório)
Apagar a barbearia no banco não remove a instância no servidor Evolution.
Ficaram 5 instâncias `salon-<uuid>`, uma delas com status `open`. O script
`scripts/evolution-remover-instancias.mjs` fecha essa ponta, mas exige
`EVOLUTION_API_URL` e `EVOLUTION_API_KEY`, que só existem nos secrets da edge
function e na credencial do n8n. Sem args ele lista e não altera nada.
Também ficaram 2 clientes no Asaas (`cus_000192278757`, `cus_000194207151`).

### ~~Descrição errada no workflow de avaliação do n8n~~ — RESOLVIDO em 04/09
`CRM Salão - Avaliação Pós-Atendimento` (`NsHcELIXrETknywa`) tinha descrição
"pede nota via Evolution API", mas o nó de envio é `n8n-nodes-base.whatsApp`,
o oficial da Meta — como manda a regra de 01/09 e como o próprio sticky note
do fluxo já explicava. Era a descrição que estava velha, não o fluxo.

Corrigida pelo MCP do n8n, com operação só de metadados: os 6 nós, as
conexões e o estado ativo ficaram intactos. A descrição agora diz que o envio
sai pelo número central na API oficial, com template aprovado, e termina com
"NÃO usa Evolution" — a frase existe para quem só lê a lista de workflows não
repetir a confusão.

### Teste com relógio diferente do da função (2026-09-04)
`cadeia_de_cobranca.test.sql` quebrou o CI num commit que só mexia em
documentação. A causa: `estender_acesso_sem_debito` trabalha em
`America/Sao_Paulo` e grava `acesso_ate = hoje_SP + 1`, enquanto a asserção
comparava com `current_date`, que no runner é UTC. Entre 21h e meia-noite de
Brasília as duas datas divergem em um dia e o `>` vira falso. Corrigido com um
`pg_temp.hoje()` no próprio teste.

A armadilha só morde onde a comparação tem **margem zero**. Os outros três
testes que usam `current_date` (`gating_de_plano`, `folga_entre_atendimentos`,
`situacao_do_acesso`) comparam com folga de dias, e o último já traz um
comentário explicando o caso. Regra para o próximo: se a asserção compara com
o resultado de uma função que usa `America/Sao_Paulo`, o teste tem que usar o
mesmo relógio, não `current_date`.

### Domínio próprio: clubcut.space (2026-09-04)
Comprados na Hostinger em 04/09: o domínio `clubcut.space` (R$ 182,08/ano,
auto-renovação ligada, vence 04/09/2027) e a caixa `contato@clubcut.space`
(Starter Business Email, R$ 11,99/mês, 1 assento).

Fica registrado que `clubcut.com.br` continuava disponível a R$ 39,99 no
primeiro ano e R$ 64,99 na renovação — quase um terço do `.space` ao longo de
três anos (R$ 169,97 contra R$ 546,24). A restrição do Registro.br é
`requires_cpf_or_cnpj`. Decisão do dono em 04/09: fica o `.space` por ora.

**O que segura o domínio hoje:** nada. O `A @` aponta para `2.57.91.91`, a
página de estacionamento da Hostinger. O DNS de e-mail (MX, SPF, DKIM,
autodiscover) já veio completo e correto — **não mexer nesses registros**.

**Onde `clubcut.vercel.app` está escrito** (inventário fechado em 04/09):
- `supabase/functions/admin-create-salon/index.ts:10` — fallback de `APP_URL`
- `supabase/functions/admin-invite-salon/index.ts:26` — fallback de `APP_URL`
- n8n `CRM Salao - Convite de Equipe por Email` (`Fy9aqg14kCkhhNHW`), nó
  `Montar Email do Convite`: `const link = 'https://clubcut.vercel.app/convite/'`
  — **fixo, sem variável de ambiente que sobreponha**
- Nada nas migrations: as views montam texto sem URL do app.

**A ordem importa, pelo mesmo motivo das migrations.** O allow-list do Supabase
Auth precisa aceitar o domínio novo ANTES de `VITE_APP_URL` mudar. Invertendo,
`emailRedirectTo` aponta para endereço não autorizado e o Supabase cai
silenciosamente no Site URL — o mesmo fluxo implícito que já custou uma
investigação inteira.

1. ~~(dono) adicionar `clubcut.space` e `www.clubcut.space` ao projeto~~ FEITO
2. ~~(Claude) gravar no DNS da Hostinger os registros que a Vercel pedir~~ FEITO
3. ~~esperar a Vercel validar e emitir o certificado~~ FEITO
4. (dono) Supabase Auth: incluir `https://clubcut.space/**` no allow-list,
   **sem remover** o `clubcut.vercel.app`
5. (dono) Supabase Auth: trocar o Site URL
6. (dono) Vercel: `VITE_APP_URL=https://clubcut.space` em Production
7. (dono) Supabase: secret `APP_URL=https://clubcut.space` das edge functions
8. ~~(Claude) commit para disparar o build~~ FEITO (4f9d51a)
9. ~~(Claude) trocar o link fixo no workflow de convite do n8n~~ FEITO
10. testar: cadastro, convite de equipe, QR do balcão — PENDENTE, exige o dono

**Ferramentas que não existem** (registrado para não prometer de novo): não há
MCP da Vercel para variável de ambiente nem para adicionar domínio, e não há
MCP do Supabase para secret nem para configuração de Auth. Os passos 1, 4, 5,
6 e 7 são no painel, na mão.

**Passos 1 a 3, fechados em 04/09 07:26.** Registros que a Vercel pediu e que
foram gravados na Hostinger (o CNAME é próprio do projeto — o genérico
`cname.vercel-dns.com` teria falhado):

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `5686dea13e78b272.vercel-dns-017.com.` |

O `overwrite` da API da Hostinger só apaga registros que batem em nome E tipo,
então MX, SPF, DKIM, DMARC, autodiscover e autoconfig sobreviveram intactos —
conferido relendo a zona e, de fora, pelo DNS público do Google.

**Canônico: o apex.** A Vercel monta com `www` canônico por padrão; foi
invertido a pedido do dono em 04/09. Hoje `clubcut.space` responde 200 e
`www.clubcut.space` devolve 308 para ele. O motivo não é técnico e sim de
produto: o endereço vai impresso no cartaz do balcão, onde quatro caracteres a
menos contam, e o retorno do login deixa de ter um salto de redirecionamento
no meio — justo o fluxo implícito que já custou uma investigação.

**`clubcut.vercel.app` não morre** quando o domínio novo entra — a Vercel
mantém os domínios antigos. Nada quebra durante a troca e os links já enviados
continuam abrindo. É por isso que o passo 9 pode esperar sem risco.

### Convite de equipe sai do Gmail pessoal (2026-09-04)
O nó `Enviar Convite` do workflow de convite manda com
`fromEmail: Club Cut <castrocollin01@gmail.com>`. Com `contato@clubcut.space`
comprado no mesmo dia, o remetente natural passa a ser esse. Exige criar a
credencial SMTP da Hostinger no n8n, o que é ação no painel.

**Ressalva antes de fazer:** `.space` tem reputação pior nos filtros de spam
que um domínio estabelecido, e trocar um remetente `@gmail.com` — que carrega
a reputação do Google — por `@clubcut.space` recém-registrado pode **piorar** a
entrega no curto prazo. O DMARC está em `p=none`, que só observa e não protege.
Medir a entrega antes de trocar, não depois de os convites sumirem no spam.

### Editar nó no n8n pelo MCP cria RASCUNHO, não publica (2026-09-04)
`update_workflow` respondeu `appliedOperations: 1`, `validationWarnings: []`,
e mesmo assim o fluxo continuou executando o código antigo. A resposta do
`get_workflow_details` mostra por quê: há dois campos, e eles divergiam.

- `versionId` — o rascunho recém-salvo, já com `clubcut.space`
- `activeVersionId` — a versão que **roda**, ainda com `clubcut.vercel.app`

O fluxo estava `active: true` e dispara a cada 10 minutos, então teria
continuado mandando convite com o link velho por tempo indeterminado. Resolvido
com `publish_workflow(workflowId, versionId)`, que move o `activeVersionId`.

**A regra:** depois de mexer em nó pelo MCP, comparar `versionId` com
`activeVersionId`. Iguais, está no ar. Diferentes, é rascunho e falta publicar.
"Aplicado com sucesso" na resposta da ferramenta não quer dizer "em produção".

Metadados são outra história: a correção de descrição de 04/09 no fluxo de
avaliação (`NsHcELIXrETknywa`) valeu na hora, sem publicar — descrição não é
versionada junto com os nós. A armadilha é só para mudança de nó.

### VITE_APP_URL: como conferir sem acesso ao painel (2026-09-04)
Não existe ferramenta MCP para ler variável de ambiente da Vercel, mas o Vite
embute o valor como literal no bundle, então dá para provar de fora.

Só que o `appUrl` mora num chunk carregado sob demanda: procurar nos assets que
o `index.html` referencia dá **falso negativo**. É preciso seguir o grafo de
imports de forma transitiva — 42 chunks na primeira camada contra 96 no total.
O valor apareceu em `appUrl-<hash>.js` como
``var e = `https://clubcut.space`.replace(/\/+$/,``)``.

### Avaliação geral das 8 peças (2026-09-04) — leitura, nada alterado
Varredura peça por peça a pedido do dono. Estado medido, com o que não deu
para verificar marcado como tal. Vira os dois relatórios (raio-X e aula).

**Supabase** — 138 migrations, 45 tabelas (todas com RLS ativo, 63 policies),
39 views, 236 funções public + 8 private, 20 triggers, 7 cron jobs ativos,
12 edge functions, 14 testes pgTAP. Advisor de segurança: 0 ERROR, ~30 WARN
(SECURITY DEFINER exposto — esperado, cada uma checa dono por dentro),
12 INFO (RLS sem policy — tabelas de service_role, falham fechado).
Performance: 124 avisos, todos INFO/WARN (95 multiple_permissive_policies,
19 unindexed_foreign_keys, 10 unused_index) — dívida de escala, não bug.
Leaked password protection: DESLIGADO (é um clique).

**Meta / WABA** — WABA 975811062135581 "Club Cut": account_review APPROVED,
business_verification **verified**, ownership SELF. Número +55 41 8475-4172:
quality GREEN, code VERIFIED, throughput STANDARD. App 1054189290929803
inscrito no webhook da WABA. **name_status: DECLINED** — o nome de exibição
"Club Cut" foi recusado pela Meta; reenviar. **Templates: 1 na Meta
(hello_world) contra 25 rascunho no Postgres — os 25 nunca foram submetidos.**
messaging_limit_tier e config de webhook do app não são legíveis com
whatsapp_business_management (o segundo pede App Secret); ficam sem verificar.

**VPS Hostinger** — KVM 2 (2 vCPU, 8 GB, 100 GB), Ubuntu 24 + Docker +
Traefik. 3 projetos: evolution-api-8lfe (api+postgres+redis), n8n-m5uf,
traefik. **firewall_group_id: null e lista de firewalls vazia.** Evolution
(:32770) e n8n (:32769) publicados em 0.0.0.0 — contornam o Traefik, expostos
por HTTP puro sem firewall. É o achado de segurança mais concreto.

**n8n** — 13 workflows, 12 ativos. 8.819 execuções no total; as 80 mais
recentes **todas success**, zero falha. Feedback dos donos e lembretes rodam
de 5 em 5 min; avaliação e uso a cada 30 min.

**Asaas** — edge `asaas` e `asaas-webhook` com fallback
`https://api-sandbox.asaas.com`. Se o secret ASAAS_BASE_URL não estiver
sobrescrevendo para produção, a cobrança está em SANDBOX. **Não verificável
por aqui** (não há MCP para secret do Supabase); confirmar no painel. Webhook
protegido por token no header `asaas-access-token`.

**Vercel** — projeto clubcut, framework vite, domínio clubcut.space (apex
canônico), VITE_APP_URL confirmado. Plano Hobby.

**Evolution** — sobe (3 contêineres, up 3 dias). Não-oficial por desenho
(0115): conversa do cliente sai pelo número real da barbearia; plataforma
manda lembrete/reativação/aviso pelo número central na Cloud API.

**CRM** — React/Vite, 22 features, 24 rotas, 30 arquivos de teste, ~31k
linhas. Fala com o backend por 12 RPC e 3 edge (admin-create-salon,
criar-minha-barbearia, whatsapp).

**Integração ponta a ponta — o furo:** a base de mensageria está saudável
(número GREEN, webhook assinado por HMAC, trava de template no banco), mas
**as automações iniciadas pela empresa estão mudas** porque os 25 templates
seguem em rascunho na Meta. O n8n roda verde só porque as views devolvem
vazio — falha fechado, por desenho. Submeter os templates destrava a cadeia.

### Backup do Supabase automatizado e cifrado (Tier 0 / item 2) — FEITO em 2026-09-05
Decisão do dono: pg_dump agendado em vez de plano pago. Host = **GitHub Actions**,
não o laptop (fica desligado, ambiente frágil) nem o VPS (o SPOF sem firewall).

- Repo **privado** `Saymon0123/clubcut-backups`, workflow `.github/workflows/backup.yml`:
  diário 06:00 UTC + manual. `pg_dump 17 -Fc` → conta salons/subscriptions/
  whatsapp_templates/services na origem → **restaura num Postgres 17 de serviço e
  confere as contagens** (não bateu = nada commitado; o GitHub e-mail o dono) →
  cifra AES256 (gpg) → commita `dumps/clubcut-*.dump.gpg`, mantém os últimos 30.
- Segredos no repo: `SUPABASE_DB_URL` (Session pooler, :5432) e `BACKUP_PASSPHRASE`.
  A passphrase (64 hex) está em `C:\Users\saymon\.clubcut\backup-passphrase.txt`
  e no Google Password Manager. **Perdê-la = perder os backups** (sem recuperação).
- 1º run (34005123312) verde: dump 997.747 bytes, contagens 1/1/25/4 ok, cifrado
  318.214 bytes, commitado. Há também um dump manual verificado em
  `C:\Users\saymon\Documents\clubcut-backups\` (fora do repo).
- Cobre o banco Supabase inteiro (esquema, dados, funções, RLS, auth.users). **NÃO**
  cobre n8n/Evolution (VPS, backup semanal próprio) nem config de painéis.
- Ferramenta: a máquina não tinha pg_dump nem daemon do Docker; instalei `pg_dump 17`
  no WSL rodando como **root** e com `Acquire::ForceIPv4=true` — o `sudo` pedia senha
  sem TTY e o mirror do Ubuntu resolvia só IPv6, os dois travavam o apt.

### Correções à auditoria, verificadas com as chaves que ela não tinha (2026-09-05)
A auditoria dos 9 docs foi somente-leitura, sem chaves de Meta/Evolution/Asaas. Com
elas em mãos, três achados mudam:

- **B1/A1 — REFUTADO.** A auditoria supôs que o webhook do agente apontava para URL
  errada (real com UUID vs doc sem UUID). Medido: a URL **viva registrada** no n8n é a
  **sem UUID** (`/webhook/salao-atendimento` → "not registered for GET, did you mean
  POST") — exatamente a da doc; a **com UUID** do triggerInfo responde "not registered",
  igual a um path inexistente. Se o secret seguiu a doc, aponta **certo**. O "zero
  tráfego desde 23/08" é mais provável ser instância desconectada. Falta só ler o webhook
  carimbado na instância (após parear o QR) para fechar de vez.
- **B2 — confirmado da fonte:** o webhook do agente não tem autenticação nenhuma.
- **A7 — REFUTADO.** `fetchInstances` na Evolution = **0 instâncias**. Não há órfãs no
  servidor (a auditoria supôs que provavelmente havia).
- **D2 — SEGUE ABERTO, por limite de escopo:** a API key do Asaas só responde
  `/v3/finance/balance` (customers/subscriptions/payments = 401). Não consigo inventariar
  recorrências órfãs; é no painel. Saldo = 0 é indício fraco, não prova.

### Agente de WhatsApp vivo de novo — a causa era o secret N8N_WEBHOOK_URL (2026-09-06)
Tier 0 / item 1 fechado. O agente estava mudo desde 23/08 porque o webhook
carimbado na instância Evolution apontava para o **host da própria Evolution**
(`https://evolution-api-8lfe...`), não para o n8n.

- **Causa-raiz:** o secret `N8N_WEBHOOK_URL` (edge `whatsapp`) estava com valor
  errado — a URL da Evolution. A edge carimba fielmente o que está no secret.
  **NÃO** era bug de código, **NÃO** era a questão do UUID que a auditoria (B1) e
  eu supusemos — corrige as duas hipóteses. Provado no teste-conserto: o
  `/webhook/set` da Evolution 2.3.7 só aceita o formato **aninhado**
  `{"webhook":{...}}` (o formato "topo" dá HTTP 400), e aninhado é exatamente o
  que a edge manda ([whatsapp/index.ts:141-149](supabase/functions/whatsapp/index.ts)).
- **Conserto durável:** o dono corrigiu o secret para
  `https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/salao-atendimento`. Antes disso
  eu havia remendado a instância via API para poder testar.
- **Prova ponta a ponta** (execução 18761, webhook, success, 23s): mensagem do
  cliente gravada (`in`/`cliente`), agente gpt-4o-mini respondeu com os **preços do
  catálogo real** (validação anti-alucinação funcionando), resposta gravada
  (`out`/`agente`) e enviada pela Evolution ao número de teste; **o dono confirmou
  o recebimento** no celular. `whatsapp_messages` tem o par in/out.
- A prova do re-stamp (secret novo aplicado num `connect`) fica para o próximo
  reconectar; até lá a instância está correta pelo remendo. O alerta de "zero
  mensagens" (Tier 2) é o que protege contra um re-break silencioso.

**FOLLOW-UPS abertos:**
- `webhookBase64: true` **não é honrado** pela Evolution 2.3.7 no `/webhook/set`
  (fica `false` mesmo com HTTP 201). Áudio e imagem chegam vazios ao agente; **só
  texto funciona**. Investigar (nome do campo na 2.3.7 ou env global tipo
  `WEBHOOK_BASE64`).
- O webhook do agente segue **sem autenticação** (B2 = Tier 1 / item 4).

### Item 6 (Tier 2) — observabilidade de falha silenciosa: FEITO (2026-09-06)
Depois de 2 semanas de agente morto sem ninguem saber, duas pecas novas no n8n
(so o n8n muda; CRM/Supabase/Vercel/GitHub: nada). Reusam o canal_de_alertas
(castrocollin01@gmail.com) e a credencial SMTP ja existente.

**1. Error workflow** — `CRM Salao - Alerta de Falha (Error Workflow)`
(`MCA5cHn52f1k9sSf`), ativo. Error Trigger -> monta e-mail (workflow, no que
falhou, erro, link da execucao) -> envia. Ligado via setting `errorWorkflow` a
**9 fluxos ativos**: agente, lembretes, avaliacao, auditoria, feedback, fim de
teste, convite, estoque, landing. Logica testada com erro simulado
(test_workflow, execucao 18774); SMTP e a credencial que 6 fluxos ja usam.
Descoberta util: `setWorkflowSettings` aplica no nivel do workflow **sem
republicar os nos** (versionId inalterado) — o agente foi ligado com risco zero,
sem tocar no aviso pre-existente do no do modelo OpenAI.

**2. Sentinela do webhook** — `CRM Salao - Sentinela do Webhook (Evolution)`
(`eyxshxgS73dd8UVk`), ativa, cron 30min. Le conexoes Evolution `open` no
Supabase, chama `/webhook/find` em cada instancia e **alerta por e-mail se a URL
nao for a do n8n** (ou estiver desabilitada). Pega o exato bug do secret
`N8N_WEBHOOK_URL` errado ANTES de o agente ficar mudo — e quase nao da falso
positivo (checa config, nao trafego). Testada nos dois ramos: webhook correto ->
silencio (execucao real 18779, `Avaliar Webhooks` vazio); webhook errado ->
monta o alerta certo (18780, chega ao no de envio). base64 NAO entra na regra
(a Evolution 2.3.7 nao honra, ficaria sempre gritando).

**Deixados de fora, de proposito:**
- Error workflow NAO ligado aos 3 fluxos com rascunho divergente (Detalhamento
  `8Qh33uoFm4VqT1eO`, Aura `UqLCK8lElBR7iSze`, Landing 2 `FwP4yby1Z4OisZd4`):
  publicar empurraria o draft quebrado. Resolver o rascunho de cada um primeiro.
- Politica de Atraso (`67oZqGOIoKO6pAeQ`) esta desligada, nao ligada.

**Follow-ups que seguem abertos:** base64/midia (audio e imagem quebrados, so
texto), webhook do agente sem autenticacao (Tier 1 / item 4), e os workflows do
n8n sem export versionado no repo (E4 / Tier 5).

### Item 4 (Tier 1) — autenticar a entrada do agente (B2): FEITO (2026-09-06)
O webhook do agente aceitava POST de qualquer um (so precisava da URL, que esta
no repo publico). Fechado com um header compartilhado `X-Webhook-Token`: quem
manda mensagem ao n8n carimba o header; o n8n so aceita se bater (403 se nao).
Segredo em `~/.clubcut/n8n-webhook-token.txt` (local), secret `N8N_WEBHOOK_TOKEN`
no Supabase, credencial `n8n webhook token` (`nA0Eg7E99SJb37s3`) no n8n.

**Supabase (edges):** `whatsapp` (v38) e `whatsapp-webhook` (v16) redeployadas
mandando o header em todo POST ao n8n. Deploy pela **CLI do Supabase** (`npx
supabase functions deploy --use-api`), do disco, **sem Docker e sem transcricao**
— o jeito seguro pra editar a joia. De brinde, o `verify_jwt` das 12 funcoes
passou a viver no `config.toml` (conserta o **E7**: antes so existia no painel, e
um deploy desatento calaria a Meta/Asaas/agenda). 4 estao como `false` de
proposito (whatsapp-webhook, asaas-webhook, agenda-publica, admin-create-salon).

**n8n:** `headerAuth` ligado e publicado nos webhooks do **agente**
(`salao-atendimento`, `rJO1n7cFeNDIJyB5`) e do **lembrete**
(`lembrete-resposta-central`, `DW0nq1Jyp9xeOJwm`), ambos apontando pra credencial
`nA0Eg7E99SJb37s3`.

**Evolution:** instancia El Guardians (`salon-4748d5b4-...`) carimbada com o
header via `/webhook/set` (persiste no `/webhook/find`). O script de backfill
`scripts/evolution-aplicar-config.mjs` foi alinhado: manda o header e **aborta**
se rodar sem `N8N_WEBHOOK_TOKEN` (senao derrubaria a auth em silencio).

**Sentinela reforcada** (`eyxshxgS73dd8UVk`): alem de URL+enabled, agora tambem
alerta se a instancia perder o header de auth. Testada: silencio no estado real
(exec 18826, vazio) e alerta certo no simulado sem header (exec 18827 — "sem
header de auth (X-Webhook-Token)").

**Provas:** agente sem header -> 403; com o header do arquivo -> 200 (exec 18812,
success, sem erro). Lembrete sem header -> 403. Checagem verde (typecheck/lint,
265 testes).

**Caminho residual:** editar o webhook **a mao no painel da Evolution** e apagar
o header deixaria o agente mudo — agora coberto pela sentinela (avisa em ate
30min). Os caminhos automaticos (edge no /conexao, script de backfill) preservam
o header.

**Segue aberto:** base64/midia (Evolution 2.3.7); caminho Cloud/Meta do
whatsapp-webhook so tera trafego real quando houver salao `cloud_api` (hoje so
El Guardians, que e Evolution).

### Midia do agente (audio + imagem) na Evolution: FEITO (2026-09-06)
So texto funcionava; audio e imagem chegavam vazios. Consertado 100% no n8n
(agente `rJO1n7cFeNDIJyB5`) — CRM/Supabase/Vercel/GitHub: nada. Provado com midia
real: audio transcrito ("Boa tarde, tudo bem?") e recebido pelo dono; imagem
descrita ("homem com cabelo curto e barba bem cuidada") e respondida. Ambos
roteados e enviados pela Evolution.

Foram **3 bugs** (2 pre-existentes, so expostos quando a midia passou a chegar):
1. **base64 ausente** (o alvo): a Evolution 2.3.7 nao manda `base64` no webhook.
   Os code nodes "Audio/Imagem Base64 -> Binario" passaram a buscar sob demanda
   via `POST {server_url}/chat/getBase64FromMediaMessage/{instance}` com
   `{message:{key:{id:message_id}}}` — server_url e apikey vem do proprio payload
   do webhook.
2. **roteamento perdia o provedor**: Whisper/Visao (httpRequest) apagam o json;
   `provedor`/`instance_name` sumiam e o "Rotear Envio" caia na Cloud (erro Graph
   "Object 'messages' does not exist"). Adicionados ao "Converge Texto Final".
3. **Visao lia base64 do binario** (`$binary.data.data` = undefined em filesystem
   mode): o code node poe o base64 no json e o "Descrever Imagem (Visao)" le
   `$json.media_base64` (fallback pro binario). Audio nao sofria (Whisper consome
   o binario direto).

Detalhe em [[base64-midia-evolution]] na memoria. **Aberto:** caminho Cloud/Meta
de midia nao testado (sem salao cloud); fluxos n8n sem export versionado (E4).

### Firewall da VPS (E2 / Tier 1): FEITO (2026-09-06)
A VPS `1833354` (srv1833354, Ubuntu 24.04 Docker+Traefik) estava **sem firewall**.
Antes, so 22/80/443 expostas (Traefik concentra tudo; bancos e portas de servico
ja fechados). Criado o firewall Hostinger **`clubcut-vps` (id 357132)**, default
**DROP**, com ACCEPT em **TCP 22 (SSH), 80, 443 e ICMP** (source any). Ganho: se
subir um Postgres/Redis/n8n numa porta exposta por engano, o firewall barra.

Pos-ativacao (aplicado pelo Saymon no painel — a ativacao via API foi bloqueada
pelo classificador do Claude Code por ser acao de risco): confirmado
`firewall_group_id=357132` na VM; 22/80/443 seguem abertas; webhook do agente
403; Evolution e n8n 200; ping ~14ms. Nada do que funcionava caiu.

SSH ficou **aberto a qualquer origem** (decisao do Saymon; zero risco de lockout).
Detalhes e como abrir/desativar porta em [[firewall-vps-hostinger]]. **Aberto:**
restringir SSH a IP fixo no futuro, se quiser.

### E4 (Tier 5) — workflows do n8n versionados: FEITO (2026-09-06)
Os 15 workflows do n8n so existiam no n8n (sem backup em codigo). Exportados como
JSON (a versao **publicada** de cada) para o repo **PRIVADO `clubcut-backups`**,
pasta `n8n-workflows/` — NAO no Clinica (publico): exports carregam hosts internos
e risco de PII. Verificado por subagente: **sem segredo hardcoded, sem PII, sem
pinData**; auth toda por referencia de credencial (nao valores). E um **snapshot
manual** — reexportar via `get_workflow_details` pra atualizar. Commit
`51f586e` em clubcut-backups.

**Achado (confirma o item 6):** 3 workflows ativos com **draft divergente**
(editor com alteracoes nao publicadas): Detalhamento de Uso, Uso Diario Aura,
Landing 2 — os mesmos 3 que ficaram fora do error workflow. Vale resolver
(publicar ou descartar o draft de cada) e entao liga-los ao error workflow.
`politica-de-atraso` esta inativo (sem versao publicada).

### 3 drafts divergentes + observabilidade completa (M5 / A2 / B8): FEITO (2026-09-06)
Os 3 fluxos com rascunho != publicado foram resolvidos. O rascunho de cada um era
versao ANTIGA, sem melhoria — o de `Detalhamento de Uso` ate REGREDIA (perdia
`emailFormat:html`, o e-mail viraria texto cru, e o `batchSize:1` dos loops).
Descartados com `restore(activeVersion) + publish`, mantendo o publicado; agora
`versionId==activeVersionId` nos 3. Com o rascunho fora do caminho, o error
workflow (`MCA5cHn52f1k9sSf`) foi ligado aos 3 (Detalhamento, Uso Diario Aura,
Landing 2) via `setWorkflowSettings` — **todos os fluxos ativos agora alertam
falha por e-mail**. Placar da auditoria levantado: dos 83 defeitos §3, os
CRITICOS estao fechados (menos templates, em analise na Meta); ficam ~12 ALTOS e
a maioria dos MEDIOS/BAIXOS abertos (nenhum critico).

### Sentry no CRM — código pronto, falta a conta e a Vercel (2026-09-06)
Monitoramento de erro/performance do **front** (o n8n já tem o error workflow;
isto cobre a peça que ainda era cega: o navegador do cliente e do dono).
Mapa das cinco peças: **CRM** muda (abaixo), **Vercel** tem pendência manual,
**Supabase/GitHub/n8n: nada** — commit dispara deploy como sempre.

O que entrou no código (`@sentry/react` 10.73.0, `@sentry/vite-plugin` 5.4.0):
- `src/lib/sentry.ts` — init desligado sem `VITE_SENTRY_DSN` (dev local segue
  sem Sentry, sem aviso no console). Traces em 10%; replay só em sessão com
  erro (plano gratuito tem 50/mês) e com `maskAllText` — nome e telefone de
  cliente não saem do navegador (LGPD).
- `src/main.tsx` — `iniciarSentry()` antes de tudo; `Sentry.ErrorBoundary`
  global com a tela `src/components/ErroInesperado.tsx` (antes, erro de render
  era tela branca); `mostrarFalhaDeConfiguracao` agora também reporta.
- `src/App.tsx` — `withSentryReactRouterV7Routing(Routes)`: transação vira
  `/agendar/:salonId`, não uma URL por barbearia.
- `vite.config.ts` — upload de source map **só quando `SENTRY_AUTH_TOKEN`
  existe no build**; sobe e apaga os `.map` do dist (não vazam no deploy).
  Sem o token, build idêntico ao de antes.

**NO AR desde 06/09 (commit bb0985a).** Conta criada (org `club-cut`),
variáveis na Vercel, deploy verde, 196 source maps subiram no build e um erro
de teste disparado em produção saiu do navegador para o ingest do Sentry
(5 envelopes medidos por resource timing). Na verificação das variáveis foi
achada e removida uma `VITE_` órfã que continha o **auth token como Config**
— teria ido para o bundle público no build. Se quiser rigor máximo, revogar
esse token e gerar outro (nunca chegou a um deploy; risco baixo).

**Pendências que restam:**
1. (dono) confirmar no painel o issue "Teste controlado do Sentry — Club Cut"
   em *Issues* e resolvê-lo; conferir se o alerta chegou por e-mail.
2. (dono, cosmético) `SENTRY_ORG` na Vercel está `club-cut.sentry.io`; o certo
   é só `club-cut`. Funciona hoje porque o token embute a org (o build avisou
   com WARN), mas quebraria com um token futuro sem org embutida.
3. (dono, cosmético) o projeto no Sentry ficou com slug/plataforma
   **react-native** (escolhido na criação). Funciona — evento e source map
   caem no mesmo projeto — mas as dicas do painel serão de RN. Se renomear
   para React em *Settings → Projects*, **atualizar `SENTRY_PROJECT` na
   Vercel junto** (o DSN não muda).
4. Integração com Slack quando existir.

**Ressalva do npm local:** o allow-scripts do npm bloqueou o postinstall do
`@sentry/cli` (baixa o binário que faz upload de source map). No build da
Vercel isso não existe; para testar upload **local** um dia, rodar
`npm approve-scripts @sentry/cli` antes.

### Sentry nas edge functions (passo 2) — FEITO (2026-09-06)
As 11 edge functions agora reportam ao mesmo Sentry do CRM (org `club-cut`),
`environment: edge-functions`, tag `funcao` por função. Peças: **Supabase**
(código + secret `SENTRY_DSN` + redeploy das 11 pela CLI `--use-api`),
**GitHub** (commit), CRM/Vercel/n8n: nada.

Desenho, em `supabase/functions/_shared/sentry.ts`:
- `capturarErro(erro, funcao, detalhes?)` — plantado nos 7 catch-alls
  operacionais (accept-invite, admin-create-salon, admin-invite-salon,
  asaas-webhook, criar-minha-barbearia, whatsapp, **whatsapp-webhook** — o
  engolir mais perigoso: devolve 200 pra Meta e a mensagem sumia sem rastro),
  no "n8n recusou a mensagem" (a classe de falha do agente mudo) e no
  `erroFatura` do cancelamento (falha silenciosa de dinheiro). O `flush(2000)`
  é obrigatório: o isolate congela após a resposta, evento sem flush se perde.
  Custa até 2s, só no caminho de erro.
- `comSentry(nome, handler)` — última rede em todas as 11, para o que estourar
  fora dos try/catch. Captura e relança; a resposta 500 não muda.
- Sem `SENTRY_DSN` tudo vira no-op (mesmo contrato do front).
- `defaultIntegrations: false`: o Edge Runtime não expõe tudo que o SDK Deno
  espera. Catches de "corpo inválido" (400) ficaram de fora de propósito —
  erro de quem chama, viraria ruído.

Verificação: função descartável `sentry-teste` provou os 2 caminhos ANTES das
reais (flush `true` = entrega confirmada; estouro = 500 com captura) e foi
apagada (servidor + disco). Depois do deploy das 11: smoke em 5 funções com
respostas idênticas às de antes (400/401/403 esperados). Lint e 265 testes ok.

**Achado no caminho:** `admin-metricas` está no config.toml e registrada no
projeto, mas **não tem código no repositório** — o deploy em massa
(`functions deploy` sem nome) QUEBRA por causa dela. Decidir: recuperar o
código do painel e versionar, ou apagar do config.toml e do projeto. Até lá,
deploy sempre por nome.

**Segue fora do Sentry:** banco (RPCs/triggers/cron — pgTAP e advisors),
n8n (error workflow próprio). E o caminho feliz Cloud API do whatsapp-webhook
continua sem tráfego real (sem salão cloud) — a instrumentação lá só vai
falar quando houver.

### Uptime do VPS vigiado de fora — FEITO (2026-09-07)
O buraco era estrutural: error workflow e sentinela moram NO VPS — se ele cai,
os alarmes caem juntos e os crons param em silêncio. Fechado com o **1 monitor
de uptime que o plano gratuito do Sentry inclui** (checagem externa), criado
pelo dono no painel (Monitors → Uptime):

- Alvo: `https://n8n-m5uf.srv1833354.hstgr.cloud/healthz` (respondia
  `200 {"status":"ok"}` na verificação) — passa por Traefik no VPS, então uma
  checagem prova VPS + Traefik + n8n de uma vez. GET, 1 min, timeout 5s,
  assertions 200–299, issue após 3 falhas consecutivas (~3-4 min de latência
  de detecção), environment `vps`.
- O alerta de e-mail do projeto `react-native` cobre o issue de downtime — não
  foi preciso regra nova.

Mapa de quedas depois disto: VPS inteiro → uptime monitor grita; só a
Evolution (n8n vivo) → a sentinela deve quebrar ao consultá-la e o error
workflow avisa em ≤30min (**deduzido do desenho, ramo não testado**); só o
n8n → uptime monitor; site/CRM → Sentry do front; Supabase e Vercel →
gerenciados. Mais monitores de uptime (Evolution direto, clubcut.space)
custariam pay-as-you-go — decidir só se doer.

### Rumo a producao — DMARC, bug Meta #2, e-mail profissional (2026-09-07)
Tres cercas pra virar produto vendavel (pedido "o que da pra adiantar hoje"):
- **DMARC** de clubcut.space: `p=none` -> **`p=quarantine`**
  (`rua=mailto:contato@clubcut.space`); SPF + DKIM (Hostinger) ja estavam OK.
  Menos spoofing e menos chance de spam.
- **Bug Meta #2** (auditoria 05-meta #2): o lembrete lia o `phone_number_id` em
  `conexoes_ativas` (conexao Evolution do salao, que nao tem phone da Cloud API)
  -> nunca enviava no hibrido. Corrigido: o no "Buscar Instancia do Salao"
  (fluxo `DW0nq1Jyp9xeOJwm`) agora le `remetentes_oficiais` (numero central).
  Publicado. Teste ponta-a-ponta espera um template de lembrete APROVAR na Meta.
- **E-mail profissional**: os 8 nos `emailSend` do n8n (7 fluxos) saiam de
  castrocollin01@gmail (pessoal, ~500/dia, risco de spam). Credencial SMTP
  (`Ozsdd8R9j8L9vUJO`) migrada pro Hostinger (contato@clubcut.space) e o
  remetente trocado nos 8 nos; 7 fluxos republicados. Provado: envio real
  `250 queued`, `from contato@clubcut.space`. O **Auth do Supabase** tambem foi
  migrado pra Custom SMTP Hostinger (remove o limite baixo do SMTP padrao).
  Config Meta em [[config-meta-whatsapp-oficial]].

### Dois issues do Sentry corrigidos + integração de commit religada (2026-09-09)
Vieram do painel do Sentry (org `club-cut`, projeto `react-native`), os dois no
navegador do usuário final. Peças: **CRM** muda; Supabase/Vercel-env/n8n nada; o
próprio deploy do merge cura o segundo em produção. PR #82, merge `d86c883`,
deploy verde, 271 testes.

- **REACT-NATIVE-3** (`crypto.randomUUID is not a function`): a função só existe
  do Chrome 92 / Safari 15.4 pra cima. Visitante em navegador antigo — ou bot se
  anunciando como Chrome 79 — estourava no `WhatsAppPopup` e a landing inteira
  caía no ErrorBoundary. Helper `gerarId()` novo (`src/lib/id.ts`): randomUUID →
  UUID v4 por `getRandomValues` → id não-cripto. Trocado nos 3 usos (WhatsAppPopup
  ×2, NewSaleModal ×1), com `id.test.ts` cobrindo os caminhos.
- **REACT-NATIVE-4** (`Failed to fetch dynamically imported module`): chunk velho
  depois de deploy (hash muda, aba antiga busca arquivo que saiu do ar). O
  `import()` das ~20 páginas passa por `importarComRecarga` (`App.tsx`): recarrega
  a aba UMA vez (trava em sessionStorage contra loop) pra pegar o `index.html`
  novo; se ainda falhar, sobe pro ErrorBoundary. `sentry.ts` ganhou `ignoreErrors`
  do padrão. **Não conserta a aba já quebrada — protege os próximos deploys.**

**Achado no caminho — o auto-close por commit estava quebrado.** Pus
`Fixes REACT-NATIVE-3/4` no commit, mas os issues **não** fecharam sozinhos.
Investigando pelo MCP: os releases existem (um por deploy, versionados pelo SHA),
mas os recentes vêm com `lastCommit: null` — inclusive o `d86c883` do fix. Só o
**primeiro** release do Sentry (`bb0985a`, 06/09) tem commit anexado. Ou seja: a
associação release→commit **funcionou uma vez e caiu** — a integração
GitHub↔Sentry desconectou (ou o repo saiu dela). Sem commit no release, o Sentry
nunca lê a mensagem, e o `Fixes` não resolve. O código já está certo: o
`@sentry/vite-plugin` tem `setCommits` default `{ auto: true }` — ele tenta a cada
build e o `errorHandler` engole a falha quando não há repo conectado. **Nada a
mudar no `vite.config.ts`.** Os dois issues foram resolvidos **à mão** pelo MCP
(`resolvedInNextRelease`, reabre só se o bundle novo reproduzir).

- (dono, FEITO 09/09) reconectou a integração GitHub no Sentry (Settings →
  Integrations → GitHub, repo `Saymon0123/Clinica`). **Não dá pra fazer pelo
  MCP** (o conector só lê integrações) nem por mim (é autorização do GitHub App,
  OAuth do dono).
- (FEITO 09/09) o release novo `fbbb852` (deploy do PR #83) voltou **com commit
  anexado** — `lastCommit` preenchido e cada commit marcado `Repository:
  Saymon0123/Clinica`, prova de que o Sentry lê o repo conectado. Auto-close por
  `Fixes SHORT-ID` volta a valer pros próximos. Releases antigos não voltam atrás;
  a associação é feita na hora do build.

### Cobrança migrada de Asaas para AbacatePay (PIX) — EM ANDAMENTO (2026-09-10)
Decisão do dono: abandonar o Asaas (reprovado, nunca foi ao ar) e usar o **AbacatePay**
(API v2, PIX). Como o Asaas nunca cobrou ninguém (produção zerada), foi reconstrução da
camada, sem migrar dado vivo. Decisões: **PIX-only**, **7 dias** de prazo pra pagar antes
de travar (`cobranca_vence_em`), pagar **quita o ciclo** (sem "+1 mês"; o cron
`estender_acesso_sem_debito` rege o acesso), "atrasada" **derivada** (PIX não emite evento
de vencimento).

**Contrato AbacatePay confirmado no ar (sandbox):** chave é **v2**; `POST
/v2/transparents/create {method:"PIX",data:{amount(centavos),expiresIn,description,externalId}}`
→ `{data:{id:"pix_char_…",brCode,brCodeBase64,status:"PENDING"}}`; `GET
/v2/transparents/check?id=`; `POST /v2/transparents/simulate-payment?id=` (devMode). Webhook
por **HMAC-SHA256** no header `X-Webhook-Signature` (o painel remove o `?webhookSecret=` da
URL); payload do pagamento: `event:"transparent.completed"`, id em **`data.transparent.id`**.
Correções que só o teste real pegou: `customer` não é campo do PIX transparente; o id do PIX
não é `data.id`. **`llms.txt` deles erra vários pontos — a doc/o sandbox mandam.**

**Feito e deployado:** migration `0144` (troca colunas boleto/asaas→pix/cobranca em
`faturas_de_uso`; `asaas_eventos`→`cobranca_eventos`; `boletos_a_enviar`→`cobrancas_a_enviar`;
`estender_acesso_sem_debito` usa `cobranca_vence_em`; `auditoria_cobranca` por REPLACE p/ não
derrubar `auditoria_pendente`). Edges: `cobrar-uso` (cria PIX), `abacate-webhook` novo (HMAC,
verify_jwt=false, registrado no AbacatePay), `asaas` limpo (sem recorrência; ainda com esse
nome por compat com CancelarUso/CobrancaDaRede). CRM: `UsoDoSistema.tsx` mostra QR+copia-e-cola.
`config.toml` + secrets `ABACATE_*` no Supabase. pgTAP ajustado.

**FEITO depois (2026-09-10):** (a) **n8n** atualizado e publicado — "Detalhamento de Uso" lê
`cobrancas_a_enviar` (era `boletos_a_enviar`, que parou de existir e errava toda hora), o e-mail do
dono manda o **copia-e-cola do Pix**, e "Marcar" usa `abacate_pix_id`/`cobranca_notificada_em`; o
"Uso diário pra Aura" troca `boleto_vencimento`→`cobranca_vence_em`. (b) **Teste full ponta a ponta
passou** (fatura de teste → PIX → simulate-payment → webhook marcou paga + reabriu acesso, sem "+1
mês"). (c) **Limpeza**: edge `asaas-webhook` deployada apagada e secrets `ASAAS_*` removidos (só
`ABACATE_*` restam). Renomear a edge `asaas`→`cobranca` segue opcional.

**PRODUÇÃO LIGADA em 12/09.** O dono salvou a chave de produção; o resto foi feito e conferido:

- **`ABACATE_API_KEY`** trocada pela de produção (`abc_prod…`). A chave foi validada **antes** da
  troca, por contraste: uma chave inventada recebe 401 da API, a dele recebe 400 num id inexistente
  — ou seja, autentica. Depois da troca, o hash do secret no Supabase bate com o do arquivo.
- **`ABACATE_BASE_URL`** já estava certa (`https://api.abacatepay.com/v2`), conferida por hash.
- **Webhook de produção registrado pela API**, não pelo painel. O dono cadastrou primeiro à mão, e
  ficou certo (URL, os dois eventos, `devMode:false`) — mas **a API do AbacatePay não devolve o
  segredo** nem na listagem nem no `get`, então não havia como provar que o valor digitado era igual
  ao nosso. E o erro seria silencioso do pior jeito: cliente paga, o webhook leva 401, o acesso não
  abre, ninguém percebe. Então foi refeito por `POST /webhooks/create` com o nosso segredo exato
  (criado antes, apagado o antigo depois, para não haver janela sem webhook). Sobrou **um** webhook:
  `webh_prod_Z1PZWHT6LbSGnKBfnrfR2gmc`, `devMode:false`, eventos `transparent.completed` e
  `transparent.refunded`.
- **`ABACATE_WEBHOOK_SECRET` rotacionado** (48 caracteres). O valor antigo não estava em nenhum
  arquivo do dono e o Supabase só devolve o resumo criptográfico — não dava para reusar. O novo vive
  em `~/.clubcut/abacatepay.env` e no secret do Supabase, conferido por hash. O webhook de sandbox
  parou de valer por causa disso; não havia cobrança pendente.
- **Provado na porta:** com o segredo certo a edge responde 200 e não grava nada
  (`{"ok":true,"ignorado":"sem id ou evento"}`); com segredo errado, 401.

**Ainda sem prova ponta a ponta:** nenhum evento real do AbacatePay chegou — o painel não tem botão
de teste e um teste de verdade criaria cobrança com dinheiro. A primeira cobrança real é a prova.

**Dois achados abertos deste dia:**

1. **O caminho do HMAC provavelmente nunca valida.** `abacate-webhook` confere
   `X-Webhook-Signature` como HMAC-SHA256 do corpo com o **segredo compartilhado**; a documentação
   do AbacatePay diz que a assinatura se verifica com a **chave pública deles**. Como a edge aceita
   `?webhookSecret=` OU o HMAC, e o sandbox passou ponta a ponta, quem está sustentando a
   autenticação é a query. A "defesa em profundidade" que o comentário do código promete é, na
   prática, uma camada só. Conferir contra um evento real e corrigir o verificador.
2. **O segredo do webhook aparece em texto claro nos logs da edge**, porque vem na URL. É o desenho
   do AbacatePay, não nosso, e os logs são só de quem administra o projeto — mas é um segredo
   guardado em log. Resolver junto com o item 1: HMAC no header não tem esse problema.

**Cobrança real a partir de 20/09:** a El Guardians (barbearia de teste do dono) sai do teste em
19/09, e o fechamento do dia 1º passa a gerar **PIX de verdade** para ele mesmo. Decidir antes se o
`fechamento-mensal-de-uso` fica de pé para ela.

---

## M11 — a varredura que não existia, e o typecheck que faltava nas edges (2026-09-12)

PR "CI: a varredura que nao existia". **Nenhuma migration, nenhum deploy** — a
mudança é toda de CI e de tipo.

**O achado era menor do que parecia; o buraco, maior.** O parecer registrou
`react-router@7.18.1` com duas falhas ALTAS em produção. O CVE é do modo RSC,
que este SPA em Vite não usa — risco prático baixo. O que importava era o
motivo de a versão estar lá: **não havia varredura nenhuma**. Nem `npm audit`,
nem gitleaks, nem CodeQL, nem dependabot. Não passou por decisão; passou por
ninguém ter olhado. `react-router` foi a 7.18.3 (dentro do `^7.18.1` que já
estava no `package.json`, então só o lock mudou) e o `npm audit fix` levou
`browserslist`, `nanoid` e `postcss` junto. `npm audit` acusa **0**, com as
dependências de desenvolvimento incluídas.

**As quatro travas, e o rigor de cada uma é diferente de propósito:**

| Trava | Quando | Trava o merge? | Por quê |
|---|---|---|---|
| gitleaks | todo PR | job próprio | Determinística, sobre os arquivos **deste** PR |
| `npm audit` | todo PR | **não** | Aviso novo nasce do mundo lá fora, não do PR |
| CodeQL | `main` + semanal | nunca em PR | Precisa de triagem; em PR viraria atraso |
| dependabot | segunda de manhã | — | Agrupado, teto de 3 PRs |

O gitleaks varre a **árvore como ela está** (`--no-git`), não o histórico: assim
o resultado depende só do que o commit traz, nunca de um segredo antigo já
removido do topo. Check que fica vermelho por motivo histórico é check que se
aprende a ignorar. E `--redact`, porque o log de CI de repositório público é
público — sem ele, o segredo achado seria impresso de novo.

**O buraco que não estava no parecer: as edge functions não eram verificadas por
nada.** O `tsc -b` cobre `src` e o `vite.config.ts`, e mais nada. As doze
funções que rodam em Deno ficavam fora de qualquer typecheck, e erro de tipo
nelas só apareceria em produção, na primeira requisição que passasse pela linha
errada. Agora `deno check --node-modules-dir=none supabase/functions/*/index.ts`
entra no job que **já é obrigatório** na `main`. O `--node-modules-dir=none` não
é detalhe: sem ele o Deno vê o `package.json` do CRM na raiz e procura as
dependências npm das edges no `node_modules` do front, onde nunca estiveram —
com `none`, resolve pelo cache próprio, que é o que o runtime da Supabase faz.

**E ele achou coisa na primeira vez que rodou: 28 erros, com uma causa só.**
`ReturnType<typeof createClient>` era a anotação de `admin` em **onze lugares,
sete arquivos**. A armadilha: `createClient` é um `const` de tipo genérico, e
`ReturnType` sobre assinatura genérica instancia os parâmetros pelas
**restrições**, não pelos **padrões**. `Database` vira `unknown` em vez de
`any`, e daí `SchemaName` vira `never`. Com o schema `never` o mapa de funções
do banco fica vazio — por isso `admin.rpc('taxa_excedida', {...})` reclamava que
o segundo argumento deveria ser `undefined`: para o compilador não existia RPC
nenhuma para chamar.

A anotação não protegia nada. Ela **desligava** a checagem justamente onde mais
importava (toda chamada de RPC, toda leitura de linha) e ainda brigava com o
cliente de verdade. Agora existe um tipo só, `ClienteAdmin`, em
`_shared/supabase.ts`, com o porquê escrito ao lado.

**Por que não precisou publicar edge nenhuma:** a mudança é só de tipo, e
TypeScript some na compilação — o `import type` é apagado pelo empacotador, o
JavaScript que roda é idêntico. O repositório fica à frente do que está
publicado só no código-fonte, nunca no comportamento; o arquivo novo viaja junto
na próxima publicação que houver por outro motivo.

**Único achado do gitleaks no repositório inteiro:** o JWT de mentira em
`credenciaisSupabase.test.ts:5`, que existe para testar o FORMATO da chave (o
payload decodifica para `{"iss":"supabase","ref":"abc"}` e a assinatura é a
string `assinatura_qualquer-123`). Ganhou `// gitleaks:allow` e um comentário
dizendo por que é seguro — e avisando que deixa de ser se alguém colar ali uma
chave real.

**Fica aberto:**

1. **Tornar "Segredos no codigo (gitleaks)" checagem obrigatória da `main`.** É
   mudança na proteção do branch e é decisão do dono; hoje o job aparece
   vermelho no PR mas não impede o merge. Um comando:
   `gh api -X PATCH repos/:owner/:repo/branches/main/protection/required_status_checks -f 'contexts[]=Segredos no codigo (gitleaks)'`
2. **Tipos gerados do banco** (`supabase gen types typescript`). Enquanto não
   vierem, `ClienteAdmin` tem `any` no lugar de `Database` — honesto quanto ao
   que o cliente é hoje, mas é `any`. Quando vierem, muda **uma linha**.
3. **Primeira triagem do CodeQL.** Ele só roda depois que isto entrar na `main`;
   o que achar espera na aba Security e ninguém olhou ainda.

---

## A senha do painel administrativo saiu do navegador (2026-09-12)

**Achado pelo CodeQL, na primeira vez que ele rodou** — duas horas depois de
entrar no CI. É o primeiro achado que a varredura nova produziu, e ele é real.

`js/clear-text-storage-of-sensitive-data`, ALTO, em
`NovaBarbeariaPage.tsx:37`: a senha que libera o painel administrativo era
gravada **em texto claro** no `sessionStorage`, sob a chave `admin_tool_secret`,
e lida de volta para o painel continuar destravado depois de recarregar a
página.

**Por que era grave de verdade, e não pedantismo de ferramenta:**
`/admin/nova-barbearia` é uma rota **pública** — fica ao lado de `/login`,
`/criar-conta` e `/agendar/:salonId` no `App.tsx`. E `sessionStorage` pertence à
**origem inteira**, não à tela que escreveu. Ou seja: um XSS em qualquer página
do CRM, na mesma aba, lia a senha que cria barbearia. A revisão de segurança de
11/09 passou por essa tela e não pegou.

**A correção:** a senha vive só na memória do componente. O preço é recarregar a
página pedir a senha de novo — pequeno, porque o formulário da `SalonWizard` já
não sobrevivia ao recarregamento de qualquer jeito. E o painel agora **apaga** a
chave antiga ao montar: sem isso, quem já tinha usado continuaria com a senha em
claro na aba até fechá-la, e a correção não alcançaria justamente quem já foi
exposto.

**O que não mudou, e é o que segura de verdade:** cada chamada manda a senha no
header `x-admin-secret` e o edge confere no servidor, em comparação de tempo
constante. O portão da tela é conveniência; a tranca é lá. Provado na hora: com
senha errada, o edge responde 401 e a tela diz "Senha incorreta".

**Catraca:** `segredoNaoPersiste.test.ts`, quatro asserções. Uma é larga de
propósito — *nenhum* arquivo da pasta grava em storage — porque a regressão
provável não é maldade, é alguém achando ruim digitar a senha depois de um F5 e
"consertando" do jeito óbvio. O teste foi verificado ao contrário: reintroduzido
o `setItem`, duas asserções ficam vermelhas.

**Segundo alerta do CodeQL, conferido e descartado:** `vendaPendente.ts:34`.
`SalePrefill` é só UUID (`appointmentId`, `clientId`, `professionalId`,
`serviceId`) mais `horaLocal` e `clienteNome`. Nenhuma credencial; a heurística
tropeçou no nome do cliente.

**Fica aberto:** se a conveniência de continuar destravado fizer falta, o
caminho certo **não** é voltar a gravar a senha — é o `verify` devolver um token
curto e assinado e os três edges do painel (`admin-create-salon`,
`admin-invite-salon`, `admin-metricas`) passarem a aceitá-lo. Mexe em edge
function e exige publicação; só vale a pena se o incômodo aparecer.

---

## M3 — o log passa a dizer de qual barbearia foi a requisição (2026-09-12)

PR #128, **aplicado**: as 12 edge functions publicadas em produção.

**Metade do achado estava errada, e só deu para saber medindo.** O M3 dizia
*"zero log estruturado: 0 ocorrências de `request_id` nas edges"*. O grep estava
certo; a conclusão, não. Consultando os logs de produção:

- toda linha que sai de um `console.*` **já** vem carimbada com `request_id` e
  `execution_id` pela plataforma — a correlação existia, só não no código;
- `function_edge_logs` **já** grava `execution_time_ms` e o status de cada
  chamada. O p95 que o parecer deu por inexistente foi calculado em dois
  minutos: `cobrar-uso` p50 519 ms / p95 619 ms; `agenda-publica` p95 2255 ms.

Eu ia construir um sistema de `request_id` com `AsyncLocalStorage`. Teria criado
um **segundo id competindo com o da plataforma** — pior do que não ter nenhum.
Fica a lição, que é a mesma de sempre: o parecer aponta onde olhar, não o que
concluir.

**O buraco de verdade era o outro item do mesmo achado:** *"de ~56 linhas de
log, uma carrega salonId"*. Esse era real — dava para juntar as linhas de uma
chamada, e não dava para perguntar "o que aconteceu com a barbearia X hoje?".

**A saída foi uma linha por requisição, não oitenta edições.** O pedido original
era `salon_id` em toda linha; medindo, eram 80 sítios em 12 arquivos, cada um
exigindo julgar escopo. Como a plataforma já carimba `request_id` em todas, uma
linha de fim com o salão responde a mesma pergunta por um join — e as 80 linhas
que já existiam ganharam inquilino **sem nenhuma ser reescrita**.

**Provado em produção, não deduzido.** Uma chamada real à `agenda-publica`:

    fim agenda-publica status=404 ms=110 salao=ffffffff-…-0000000000aa req=01a094ce-7f87-73e3-bdef-71dfca8ba93d

O `req=` bate **exatamente** com o `sb-request-id` do header da resposta e com a
coluna `request_id` do log. Isso era a única dedução que restava no desenho — a
função de fato recebe o `sb-request-id` no header da requisição — e agora é
medição. E a consulta de duas etapas devolveu todas as linhas daquela
requisição, inclusive o `booted` da plataforma, que não sabe o que é barbearia.

**Três decisões que valem estar escritas:**

1. **O `ctx` é por invocação, nunca de módulo.** O mesmo isolate atende
   requisições concorrentes; estado compartilhado atribuiria o salão de uma
   chamada à linha de outra — errado em silêncio.
2. **Dois salões diferentes viram `varios`, não "o último".** O `cobrar-uso`
   fecha a conta de todas de uma vez, um webhook do AbacatePay pode quitar
   faturas de mais de uma, e um POST da Meta traz mensagens de barbearias
   diferentes porque o número central atende todas. Ficar com o último seria uma
   mentira plausível.
3. **A linha sai no `finally`** — a requisição que levanta é justamente a que se
   quer achar depois. `salao=-` quando a função caiu antes de saber de quem era,
   e aí o hífen é a verdade, não uma omissão.

O `capturarErro` ganhou o `request_id` como **tag** do Sentry, ligando a issue às
linhas do log. `admin-metricas` é a única que não marca salão, e está certo: mede
o produto inteiro. Ela foi publicada junto porque importa o `sentry.ts`, que
mudou.

**Fica aberto do M3 original:** os alertas continuam indo para **um e-mail só,
sem escalonamento** — falha às 3h espera até de manhã. É decisão de operação, não
de código, e não foi tocada.

---

## M10 — o limitador vira um só, com política declarada por porta (2026-09-12)

PR #131, **aplicado**: 8 edge functions publicadas. Era o **último achado de
código** da auditoria de 10/09.

**A lista do parecer já estava desatualizada.** Ele dizia que faltava limitador
em `whatsapp-webhook`, `abacate-webhook`, `whatsapp`, `cobrar-uso` e
`add-salon-unit`; conferindo, `whatsapp-webhook` e `cobrar-uso` já tinham
ganhado, e o `criar-minha-barbearia` — que não estava na lista — tinha o buraco
mais interessante.

**Sete cópias.** `taxaExcedida` estava copiado literalmente em sete edges e
`ipDe` em cinco. Conferido por hash: ainda idênticos, só a formatação da
assinatura divergia em duas. Sete cópias é **uma edição** de distância de
deixarem de ser idênticas — e aí o limite de um caminho muda e o do outro não,
sem ninguém perceber. Agora é `_shared/limite.ts`.

**Falhava aberto em todas, por omissão.** O conserto não foi escolher um lado: foi
**tirar o padrão**. `seFalhar` não tem valor default, então nenhuma porta nova
pode herdar a decisão errada em silêncio. As nove chamadas declaram:

| Política | Chave | Por quê |
|---|---|---|
| bloqueia | `admin:<ip>` ×3 | guarda a senha do painel; limitador fora = força bruta livre |
| bloqueia | `invite-senha:<token>` | idem, a senha do convite |
| bloqueia | `reemitir:<salão>` | mexe com dinheiro |
| bloqueia | `central-fora:<telefone>` | laço de auto-respondedor que a **Meta cobra** e depois pune |
| deixa-passar | `agenda:<ip>`, `gestao:<ip>` | travar = cliente final não consegue marcar |
| deixa-passar | `invite:<ip>` | travaria um barbeiro legítimo de entrar na equipe |

**A regra:** porta de cliente final deixa passar; porta de senha, dinheiro ou
laço caro bloqueia. O `central-fora` é o que prova que política global estaria
errada — não guarda credencial nenhuma e mesmo assim tem que bloquear.

**Um vizinho do mesmo defeito.** O `criar-minha-barbearia` tinha o limite dentro
de um `if (ip)`: **sem cabeçalho de IP, o limite inteiro era pulado** — cadastro
ilimitado. Na prática a Cloudflare sempre põe o header, e "na prática sempre vem"
é a aposta que o achado existe para desfazer. O conserto separou o IP do LIMITE
(sempre existe) do IP do REGISTRO gravado em `termos_aceites`, que é
consentimento com peso legal — ali nulo continua nulo, porque escrever `'sem-ip'`
seria inventar dado num documento que existe para ser confiável.

**Dois detalhes que quase passaram:**

1. Escrevi `'desconhecido'` como fallback do `ipDe`. As cinco cópias usavam
   `'sem-ip'`, e **essa string entra na chave do limite** — trocar zeraria os
   contadores em voo e juntaria numa chave nova quem hoje está separado.
   Mudança de comportamento disfarçada de limpeza.
2. O `oxlint` pegou 5 importações órfãs de `ClienteAdmin`, deixadas ao remover as
   cópias locais.

**Descoberto ao verificar em produção, e vale saber:** funções com
`verify_jwt: true` (as do painel administrativo) **não produzem linha de fim para
chamada não autorizada** — o gateway recusa no JWT antes do nosso código rodar.
Essas rejeições só aparecem em `function_edge_logs`. Provado: a mesma chamada sem
a chave anon dá 401 sem linha; com a chave, dá
`fim admin-metricas status=401 ms=74 salao=- req=…`.

**Fica aberto do M10:** nada. As portas que não têm limitador
(`abacate-webhook`, `asaas`, `add-salon-unit`, `whatsapp`) foram avaliadas e
deixadas de fora com motivo: as três últimas exigem login, e no webhook de
pagamento um limite por IP arriscaria derrubar notificação de pagamento real —
o que se quer limitar ali é a tentativa RECUSADA, e isso é outro desenho.

---

## Estado da auditoria de 10/09 depois deste dia

**Fechados hoje (12/09):** A3, A14, M12 (Fase 5), M11 + o typecheck das edges,
M3, M13, M10, mais a senha do painel administrativo em texto claro — que não
estava no parecer e veio do CodeQL, que também só existe por causa do M11.

**Segue aberto, e é escolha e não esquecimento:**

- **M14** — o parecer só existe no laptop (decisão do dono).
- **As metades adiadas:** a fila de SAÍDA do A3 (`entregarAoN8n` sem
  retentativa) e o lembrete do M12 (quarta fila, sem view nem RPC).
- **Os dois achados do webhook do AbacatePay** (11/09): o caminho do HMAC que
  provavelmente nunca valida, e o segredo em texto claro no log por vir na URL.
- **O POST da reentrega no n8n** com a credencial de header, nunca exercitado.
- **Do M3:** alerta ainda vai para um e-mail só, sem escalonamento.
- **`@tanstack/react-query`** é dependência de produção e não é importado por
  nenhum arquivo de `src/` — entra no bundle sem servir a nada.
- **A limpeza do commit `6ce8584`** no GitHub (o parecer vazado em 11/09).

---

## A primeira cobrança real — e os dois defeitos que só ela revelou (2026-09-12)

**R$ 1,50 cobrados e pagos de verdade.** Primeira vez que a cadeia de cobrança
roda ponta a ponta em produção, desde que existe.

O objetivo era testar. O valor saiu de uso real: 2 agendamentos feitos pelo
agente × R$ 0,75. Nenhum dado foi inventado para chegar lá.

### O que a tentativa revelou, e a leitura de código não tinha revelado

**1. `cobrar-uso` não podia ser chamado por ninguém.** Ele comparava o
`Authorization` com o `SUPABASE_SERVICE_ROLE_KEY` injetado pela plataforma — e
esse valor deixou de ser qualquer chave que o projeto exibe. Conferido por
resumo SHA-256, uma a uma: service_role legada, secret nova, anon legada,
publishable. Nenhuma bate. O Supabase migrou este projeto para o formato novo
(a prova: o `SUPABASE_ANON_KEY` injetado virou a chave *publishable*) e o valor
de service_role ficou de uma rotação anterior — **irrecuperável**, porque chave
rotacionada não é exibida em lugar nenhum.

**2. E nada o chamava.** Sem cron, e nenhum dos 16 fluxos do n8n — apesar de o
comentário no topo do arquivo afirmar que "roda pelo n8n a cada hora". A fatura
nascia pelo `pg_cron` e ficava parada. **Os dois defeitos escondiam um ao
outro:** ninguém notava o 401 porque ninguém chamava.

Consertado no PR #135: a autenticação passa a usar um segredo **nosso**
(`COBRAR_USO_TOKEN`, em `x-cobrar-token`), gerado e guardado em
`~/.clubcut/cobrar-uso.env`. O `Authorization` continua levando um JWT, então o
`verify_jwt` do portão segue ligado. Sem o segredo, ninguém entra — falhar
fechado é a única opção defensável numa porta que cria cobrança.

Junto, o mínimo de cobrança virou configurável (`COBRANCA_MINIMA`, padrão 5).
É regra de negócio, não constante técnica — e era o que faltava para testar com
R$1,50 sem publicar número temporário nem inventar agendamento no banco.

### O caminho inteiro, verificado em produção

| Etapa | Resultado |
|---|---|
| `gerar_fatura_de_uso` | fatura de R$1,50, período 09/09 |
| `cobrar-uso` | `{cobrancas: 1, faturasCobertas: 1}` |
| AbacatePay | PIX `pix_char_h4EpP5DDt2qTJBqamGKez3ad`, `devMode: false` |
| Pagamento | evento real `transparent.completed`, `status: PAID`, `amount: 150` |
| `abacate-webhook` | `paga_em` gravado às 11:42 |
| Acesso | `status: ativa`, `acesso_ate: hoje+1`, `atendimento_ate: hoje+8` |
| Auditoria | 0 alertas de cobrança |

**Um susto que não era defeito:** o `acesso_ate` caiu de 19/09 para 13/09 ao
pagar, e parecia que pagar encurtava o acesso. Não é. O acesso é uma **licença
rolante de 1 dia**, renovada todo dia pelo cron `estende-acesso-sem-debito`
enquanto não houver dívida vencida. O 19/09 era a data do teste, que tinha
acabado; o 13/09 é o modelo normal. Conferido lendo `private.estender_acesso`
antes de acusar.

**Mas fica a observação:** a folga do acesso é de **um dia**. Se o cron das 4h20
falhar dois dias seguidos, toda barbearia pagante perde o acesso ao CRM — e não
há alarme para cron que para de rodar. O `atendimento_ate` tem 8 dias de folga;
o acesso, um. A assimetria é proposital (o agente continua atendendo enquanto o
CRM bloqueia), mas a margem é fina.

**A taxa do AbacatePay apareceu:** `platformFee: 80` numa cobrança de 150, ou
seja **R$ 0,80 de R$ 1,50**. É o componente fixo dominando um valor minúsculo —
a R$5 ele pesaria 16%, e o mínimo de R$5 existe justamente por isso. Vale
recalcular o mínimo com a taxa real em mãos.

### Estado devolvido

El Guardians voltou ao teste: `cobravel = false`, `status = trial`,
`trial_ate = 19/09` **e `acesso_ate = 19/09`**. O acesso teve de voltar junto —
durante o teste o cron não renova (a condição dele é `trial_ate < hoje`), então
devolver só o trial travaria a barbearia no dia seguinte. `COBRANCA_MINIMA` de
volta para 5, confirmado por resumo.

A fatura paga **fica** como registro histórico. É real e foi paga.

### ~~Fica aberto, e é o maior de todos~~ — RESOLVIDO no mesmo dia

**`cobrar-uso` estava sem quem o chamasse.** O PR #135 o tornou *chamável*; o
fluxo **`CRM Salao - Cobrar Uso (a cada hora)`** (n8n, `0pZb1pFH57a0v0jn`) o
tornou *chamado*. Publicado e ativo em 12/09.

- Dispara aos **:10 de cada hora**. A fatura nasce no dia 1º às 9h; num disparo
  diário, uma falha naquele dia atrasaria a cobrança em 24h com o prazo de
  vencimento já correndo. De hora em hora, uma falha custa 60 minutos e as
  tentativas seguintes consertam sozinhas.
- Autentica com `x-cobrar-token` **por credencial** (Header Auth, criada pelo
  dono na interface) e `Authorization` com a chave anon, que é pública — está no
  bundle do site. O segredo não fica no corpo do fluxo.
- **Sem `onError: continueRegularOutput` de propósito:** o erro precisa subir
  para o `errorWorkflow` (Alerta de Falha) mandar e-mail. Engolir o erro
  apagaria justamente o aviso.
- Retentativa 2× com 30s, porque a função é idempotente por desenho.

**A criação caiu na armadilha conhecida:** o n8n **não anexa credencial em nó
HTTP Request** criado por API (`"HTTP Request nodes were skipped during
credential auto-assignment"`). Foi preciso um `setNodeCredential` depois. Quem
criar outro fluxo com HTTP Request vai bater nisso de novo.

**Testado antes de publicar**, que é o que faltou no fluxo de reentrega: execução
manual devolveu `success` com `{cobrancas: 0, faturasCobertas: 0}` — o esperado
sem fatura aberta, e prova de que a credencial autentica (um 401 apareceria como
erro).

**O que ainda não foi exercido:** o fluxo nunca rodou com fatura de verdade na
fila. A primeira prova disso é o fechamento do dia 1º de outubro.

---

## O cron que para em silêncio — alarme aplicado (2026-09-12)

Migration 0165, **aplicada**. PR #138. Nenhum deploy de edge, nenhuma mudança no n8n.

**Sete rotinas automáticas sustentam o produto, e nenhuma avisava quando parava.**
A auditoria olha DADO errado; um cron que deixa de rodar não produz dado nenhum
para olhar. É o mesmo ponto cego da 0161 ("uma fatura que nunca nasceu é
invisível"), uma camada acima.

**O caso que motivou**, achado ao acompanhar a primeira cobrança real:
`estende-acesso-sem-debito` roda às 4h20 e escreve `acesso_ate = hoje + 1` — a
folga é de **um dia**. Duas falhas seguidas tiram o CRM de toda barbearia
pagante, de uma vez e em silêncio, e o dono descobre pelo cliente reclamando.

A tolerância sai do próprio `schedule`: 4 ciclos para as de minuto, 3h para as de
hora, 26h para as diárias, 32 dias para a mensal. Folgadas de propósito — alarme
que dispara por atraso normal do agendador vira ruído, e ruído se aprende a
ignorar. Cadência não prevista cai em 26h: melhor errar avisando demais.

**Função `private` e não a view direto:** o schema `cron` é do postgres e o
`service_role` não tem USAGE nele. Uma view `security_invoker` — e todas são,
desde a 0157, com catraca — quebraria ao ser lida pelo n8n. Décimo membro de
`auditoria_pendente`, com as colunas listadas uma a uma em vez de `select *`.

**Verificado em produção depois de aplicar:** `service_role` lê a view, 0 alarmes
falsos com os 7 crons saudáveis, os 2 alertas anteriores intactos, 0 views sem
invoker, e a função inalcançável para `authenticated` e `anon`.

**Duas idas ao CI por defeitos que só existem no pgTAP**, e vale registrar porque
vão se repetir:

1. **`select like(a, b, c)` não parseia** — `like` é palavra reservada no
   Postgres. Usar `ok(... like ...)`. Mesma família do `is(smallint, integer)`
   que derrubou o teste da 0163.
2. **`permission denied for sequence runid_seq`** — o usuário do
   `supabase test db` não é superusuário e não pode usar o default de
   `cron.job_run_details.runid`. Passar o `runid` na mão.

O ensaio contra produção usa SQL puro e **não exercita o pgTAP** — é por isso que
esses dois só aparecem no CI. O ensaio continua valendo (ele prova a lógica
contra o schema real); só não substitui o CI.

**Fica aberto, e é decisão de negócio:** a folga de um dia continua sendo de um
dia. O alarme avisa; não amplia a margem. Subir `acesso_ate` para `hoje + 3`
daria três dias de resiliência ao custo de três dias a mais de acesso para quem
deve, somados aos 7 do vencimento. Com o alarme no lugar, um dia passa a ser
defensável — sem ele era temerário.

---

## Correção de um erro meu: o `cobrar-uso` sempre teve chamador (2026-09-12)

Eu afirmei, e registrei acima, que **nada** chamava o `cobrar-uso`. Estava errado,
e a correção importa mais que o erro.

**O fluxo "Detalhamento de Uso" sempre teve um nó `Gerar Boletos`** que chama a
edge de hora em hora, logo antes de montar o e-mail — posição certa, para o
detalhamento já sair com o copia-e-cola do Pix. Eu procurei por nome e descrição
dos 16 fluxos e não olhei dentro dos nós.

**Por que ninguém percebeu, e é o achado de verdade.** Esse nó autenticava com a
credencial do Supabase, que manda a chave **anon** no `Authorization` — e a nota
do próprio nó dizia *"a funcao e idempotente, e por isso o token anon basta como
gatilho"*. Não bastava: o `chamadorAutorizado` compara com um segredo. O nó vinha
levando **401 duas vezes por hora** (`maxTries: 2`), e o
`onError: continueRegularOutput` apagava o erro antes que virasse alerta.

Confirmado no log de borda: `user_agent: n8n`, origem Hostinger, 401 a cada hora
cheia, por todo o período consultável.

Ou seja: não era ausência de chamador. Era **um chamador mudo** — que é pior,
porque a ausência se descobre procurando e o silêncio não se descobre de jeito
nenhum.

**O que foi feito:**

1. O nó `Gerar Boletos` passou a usar `x-cobrar-token` pela credencial, com a
   anon no `Authorization` só para satisfazer o `verify_jwt` do portão. Testado:
   devolve `{cobrancas: 0}` em vez de 401.
2. A nota do nó foi reescrita — ela dizia exatamente a frase que causou o bug, e
   induziria o próximo a refazê-lo.
3. **O fluxo que eu tinha criado hoje (`Cobrar Uso (a cada hora)`) foi despublicado
   e arquivado.** Ele duplicava uma chamada que já existia, em posição pior.

**O `continueRegularOutput` continua**, e de propósito: se o AbacatePay estiver
fora, o detalhamento ainda sai (sem o Pix) e a cobrança nasce no ciclo seguinte.
A falha não fica invisível — `auditoria_cobranca` acusa `cobranca-travada` quando
uma fatura passa 2 dias sem Pix. Dois dias de atraso é aceitável num ciclo mensal;
silêncio permanente não era.

**Terceira vez no dia que o n8n ignorou credencial em nó HTTP Request** criado ou
recriado por API — inclusive quando passada dentro do próprio `addNode`. Sempre
exige um `setNodeCredential` em seguida.

**A lição, que vale mais que o conserto:** procurei o chamador por nome e
descrição, não pelo conteúdo dos nós, e concluí ausência a partir de uma busca
rasa. A evidência que me corrigiu não veio de ler o n8n de novo — veio de **olhar
o log de borda** e ver 401 de hora em hora que eu não sabia explicar.

---

## Uma regra para cancelar, e o nono dígito do WhatsApp (2026-09-13)

Dois consertos irmãos, achados um dentro do outro.

### Três portas, três regras para cancelar — PR #141, aplicado

O cliente cancela o próprio horário por três caminhos, e cada um decidia sozinho
quando era tarde demais:

| Porta | Regra até 13/09 |
|---|---|
| Link público (`agenda-publica`) | 30 minutos |
| Botão do lembrete (`responder_lembrete`) | só `> agora` — cancelava faltando 1 min |
| Agente no WhatsApp | nenhuma |

O comentário da `agenda-publica` já dizia isso em 10/09 — *"mesma ação, duas
portas, duas regras"* — e o conserto daquele dia cobriu **uma**. A ironia: a mais
frouxa era a **mais usada**, porque o lembrete chega 85 a 100 min antes com o
botão de cancelar dentro dele.

`private.pode_cancelar` passa a ser o único lugar onde os 30 minutos existem. O
botão do lembrete já respeita; a `agenda-publica` e o agente vêm depois, um PR
cada.

**O propósito da regra decidiu o desenho.** Ela não existe para impedir o
cancelamento — o comentário da edge é explícito: *"quem cancela dentro dos 30 min
ia faltar de qualquer jeito; a diferença é o barbeiro ficar sabendo"*. Então,
dentro da janela, a função **não cancela e responde**, mandando falar com a
barbearia. O horário fica de pé e o barbeiro descobre pela conversa.

**Vale só para cancelar** (decisão do dono, 13/09). Confirmar em cima da hora é
inofensivo e segue livre — travar isso faria quem avisa que vem parecer que não
avisou.

**O detalhe que quase escapou:** a recusa **não** marca `lembrete_respondido_em`.
Se marcasse, o toque seguinte cairia no ramo `'repetido'` e a pessoa ficaria sem
resposta nenhuma — pior que a recusa. Há uma asserção só para isso.

Ensaiado contra produção, 7 de 7. 8 asserções em pgTAP, uma no limite exato de 30
minutos: se alguém trocar o `>=` por `>`, é ela que cai.

### O nono dígito — PR #142, aplicado e publicado

O número do WhatsApp era montado em **cinco lugares, com três regras**, e nenhum
sabia do nono dígito.

**O caso estava em produção:** o telefone da El Guardians é `(41) 9847-2975` —
dez dígitos. O botão "Falar com a barbearia" dela apontava para um número que não
existe. Ninguém percebeu porque **link quebrado não dá erro, só não abre**.

A regra: depois do DDD, celular antigo tem 8 dígitos começando em 6–9; fixo
começa em 2–5 (faixa da Anatel). **Fixo não ganha o 9** — WhatsApp Business roda
em fixo, e inventar um dígito quebraria quem cadastrou certo. E **DDD 55 não é
DDI 55**: Santa Maria é DDD 55, então o DDI só é descascado quando o total tem 12
ou 13 dígitos.

Gêmeas em `src/lib/telefone.ts` e `supabase/functions/_shared/whatsapp.ts`, com
os mesmos casos. **Não mexe no `telefone_norm`** e não precisa: os últimos 8
dígitos são imunes ao nono.

Provado em produção depois de publicar: a `agenda-publica` devolve
`5541998472975` para a El Guardians, onde antes devolvia `554198472975`.

**Uma asserção antiga foi trocada de propósito:** o teste esperava
`554187275895` intacto, mas isso é um celular sem o nono — a asserção protegia um
link morto.

### Fica aberto

1. ~~**O nó `Montar Texto de Reagendamento` do n8n**~~ — **FECHADO em 13/09.** O
   quinto lugar era o pior dos cinco, e estava vivo: quem tocava em "Reagendar"
   no lembrete recebia do agente um `wa.me` que **não abria**. Com o telefone da
   El Guardians (`(41) 9847-2975`) saía `554198472975`, sem o nono; com um
   número já cadastrado com DDI sairia `5555…`; e com um campo sem dígito
   nenhum saía **`wa.me/55`** — link para lugar nenhum, porque a condição era
   só `telefone ? link : texto`.

   O nó passou a aplicar a mesma regra de `_shared/whatsapp.ts` (descasca o DDI
   só com 12 ou 13 dígitos, põe o nono quando o resto começa em 6-9, não inventa
   nono em fixo) e, **quando o número não serve, cai no texto genérico em vez de
   montar um link morto** — que é o comportamento das outras quatro portas.

   Conferido antes de publicar, comparando as duas regras nos sete casos reais.
   **Publicado** (versão ativa `820a43f1`) e lido de volta: editar por API vai
   para o rascunho, e o agendamento ativo continua rodando o publicado.
2. **A `agenda-publica` e o agente** ainda não usam `pode_cancelar` (PRs 2 e 3
   do plano de 13/09).
3. **O cadastro da El Guardians segue com dez dígitos.** O link agora é montado
   certo, mas arrumar na origem, pela tela de Configurações, é um minuto.

## O aviso do canal não oficial — camadas 3 e 4 pendentes (2026-09-14)

O produto passou a dizer com todas as letras que o pareamento por QR é uma
conexão espelhada (como o WhatsApp Web), **não oficial nem endossada pela
Meta**. Entrou em duas camadas: a cláusula 8 dos termos foi reescrita
(`VERSAO_DOS_TERMOS` → `2026-09-14`, com o banco zerado ninguém precisou
re-aceitar) e o card da aba Conexão ganhou duas frases discretas no ponto
exato da decisão — com link "Entenda os dois canais" para os termos.

**Fica aberto** (camadas recomendadas e ainda não feitas):

1. **Central de Ajuda** — pergunta nova "O WhatsApp da minha barbearia pode
   ser bloqueado?", explicando os dois canais, por que o híbrido protege o
   número (tudo que nós iniciamos sai pelo oficial), o risco real do espelhado
   e o que fazer se acontecer. Hoje o link do card da Conexão aponta para os
   termos; quando esta entrada existir, pode apontar para ela.
2. **Política de Privacidade** — não diz por onde as conversas dos clientes
   da barbearia trafegam (infraestrutura do Club Cut). Uma frase fecha a
   lacuna de LGPD.

## O nome "Club Cut" rejeitado pela Meta — motivo verificado (2026-09-14)

O dono enviou o nome de exibição do número oficial (+55 41 8475-4172) para
análise e a Meta recusou. Verificado em duas fontes:

- **Webhook** (`eventos_da_waba`): `phone_number_name_update` com
  `decision: REJECTED` e `rejection_reason: BIZ_COMMERCE_VIOLATION_OTHER` —
  **duas vezes**: `Club_Cut` em 08/09 e `Club Cut` em 14/09 às 21:30 UTC.
- **Graph API**: `name_status: DECLINED`, `new_name_status: NONE`. O número
  segue `CONNECTED`, qualidade `GREEN` — só o nome foi recusado; quem recebe
  mensagem vê o número cru em vez de "Club Cut".

**Por que o revisor recusou** (política de comércio, não o formato do nome):
ele não consegue ligar "Club Cut" a um negócio identificável. O que ele vê:

1. O portfólio do negócio se chama **MB001** — nada liga MB001 a "Club Cut".
2. O perfil comercial do número está **vazio**: sem site, sem descrição, sem
   e-mail, sem foto, `vertical: OTHER`.

**A peça que faltava (dono, 14/09):** a empresa VERIFICADA na Análise de
empresa é **"Aura IA"** — "MB001" é só o apelido do portfólio. A diretriz de
nome de exibição exige relação clara com o negócio verificado e, quando o nome
não a mostra por si, manda indicá-la no próprio nome ("by [BUSINESS NAME]").
"Club Cut" sozinho + perfil vazio + nada público ligando a Aura IA = a recusa.

**Feito em 14/09 (3º envio, com o terreno preparado):**

1. ✅ Perfil comercial preenchido via API: site **`https://clubcut.space`**
   (domínio próprio, revelado pelo dono em 14/09 — responde 200 com a
   landing), about e descrição dizendo "um produto Aura IA", e-mail
   **contato@clubcut.space**, `vertical: BEAUTY`. (Primeira tentativa saiu
   com mojibake — o shell do Windows mandou os acentos em codepage errada;
   refeito com `--data-binary @arquivo.json` UTF-8 e conferido byte a byte.
   Segunda correção: eu tinha usado vercel.app e o e-mail da Aura; o dono
   corrigiu para o domínio e e-mail próprios.)
2. ✅ Nome reenviado via API (`new_display_name`): **"Club Cut - Aura IA"**,
   com o nome verificado dentro, como a diretriz manda ("by [BUSINESS
   NAME]"). Estado: `new_name_status: PENDING_REVIEW`. A decisão chega pelo
   webhook `phone_number_name_update` em `eventos_da_waba`.

**Fica aberto:**

1. A foto do perfil (logo) — pela WhatsApp Manager, ação do dono.
2. Alinhamentos que tiram atrito de revisões futuras: renomear o apelido do
   portfólio (MB001) e o rodapé público — a landing diz "um produto **Aura
   Studio**" e a verificação diz "**Aura IA**"; quem cruzar vê dois nomes.
3. Se rejeitar de novo: apelar pelo formulário de suporte da Meta (tópico
   "WABiz: Phone Number & Registration"), anexando documento do negócio.
4. **Alinhar o produto ao domínio próprio** (`clubcut.space`) — varredura
   completa em 15/09, estado VERIFICADO ao vivo:
   - ✅ Vercel `VITE_APP_URL`, QR do balcão, convite/redefinição do front,
     Auth do Supabase (site URL, allow-list, SMTP `contato@clubcut.space`),
     n8n (convite ativo com link novo + 8 remetentes), templates da Meta e
     views: **tudo já no domínio/e-mail novos**. Secret `APP_URL` existe
     desde 04/09 (valor ilegível por digest; presumido certo pela data).
   - ❌ `index.html` 35/41/47/58: canonical, `og:url` e `og:image` (2×) em
     `clubcut.vercel.app` — o preview de link compartilhado mostra o domínio
     de infra.
   - ❌ About do repositório no GitHub: homepage
     `https://clinica-crm-kappa.vercel.app` (o domínio mais antigo de todos,
     num repo público).
   - ❌ `src/lib/contato.ts`: `contato@aurastudioai.com.br` / `@auraiagency`
     (miolo do PR #85; o substituto natural é `contato@clubcut.space`).
   - ⚠️ Fallbacks das edges `admin-create-salon`/`admin-invite-salon` ainda
     dizem vercel.app — adormecidos (o secret existe), trocar por coerência.
   - ⚠️ `docs/estado-do-projeto.md:42` diz "ainda em clubcut.vercel.app" —
     doc desatualizado.
   - ~~Observação de marca~~ — RESOLVIDA em 15/09, decisão do dono: a marca
     é **Aura IA** (a grafia verificada na Meta). Rodapé da landing e
     comentários trocados. E no caminho caiu uma mentira institucional: a
     razão social exibida na /sobre era "Aura Studio Ltda.", mas o CNPJ
     67.127.614/0001-00 é **MEI** — registro real "67.127.614 Samuel Rocha
     Almeida dos Santos" (BrasilAPI, situação ATIVA, Curitiba/PR). A ficha
     passou a mostrar o nome do cadastro; "Aura IA Ltda." não existe e não
     foi inventada.

**Achado paralelo a confirmar:** `health_status` da WABA diz
`can_send_message: BLOCKED` no nível do **APP** `1054189290929803` (erro
141011, "faltam permissões de mensagem"). O token de gestão daqui não envia
mesmo (só `whatsapp_business_management`, por desenho) — a dúvida é qual token
o n8n usa nos disparos. Os testes até hoje foram para o número do próprio
dono (admin do app), que em modo dev passa mesmo sem acesso avançado; cliente
real pode ficar sem lembrete. Verificar no primeiro lembrete da rodada de
testes (execução do n8n acusa 141011 se for o caso).

## Rodada de testes, achado nº 1 — o crash dos dois sinos (2026-09-15)

O teste 1.x (primeiro cadastro) derrubou o shell na primeira tela: error
boundary, recarregar não resolvia. Sentry REACT-NATIVE-7: "cannot add
postgres_changes callbacks after subscribe()". Causa: o sino (merge de
14/09) montado DUAS vezes no AppLayout (celular + sidebar), cada um abrindo
canal realtime de MESMO nome — o supabase-js devolve o mesmo canal para o
mesmo tópico e o segundo assinante derruba o app. Ninguém tinha logado com
barbearia desde o merge (banco zerado no mesmo dia), então o primeiro
render real foi o do dono. Corrigido na hora (regra: defeito de teste se
conserta dentro do teste) no PR #166: NotificacoesProvider (um estado para
os dois sinos) + sufixo useId no tópico; catraca em
dois_sinos_um_canal.test.tsx, verificada ao contrário. O cadastro em si
funcionou inteiro — conta, confirmação e a barbearia El Corte intactos.

## O teste que só falhava à noite (2026-09-15)

O CI do PR #167 (só documentação) caiu no pgTAP: teste 5 de
`o_horario_que_o_agente_conta` esperava "amanha" e recebeu "dia 17/09".
Rodada às 00:15 UTC = 21:15 em São Paulo — a janela em que `current_date`
(UTC, no runner) já virou e o relógio de São Paulo ainda não. A fixture
marcava "amanhã" no relógio errado e o rótulo `quando` da view responde no
relógio de SP. Latente desde o PR #154; nunca tinha rodado CI nessa janela.
Consertado no próprio #167 com `pg_temp.amanha_sp()` (o padrão da
`folga_entre_atendimentos`), e a asserção de `data_local` acompanhou. Prova
ao vivo: o rerun aconteceu DENTRO da mesma janela noturna — vermelho antes,
verde depois, mesmíssimo horário. Varredura nos outros testes: só este
acoplava fixture UTC a rótulo SP; os demais usam `current_date` dos dois
lados da mesma comparação (autoconsistentes) ou com margem de dias.

## O agente solta a gravata — modelo e voz (2026-09-20)

O dono achou o agente "engessado" e a leitura da systemMessage ativa deu
razão pela metade: 95% cerca, 5% voz, rodando em gpt-4o-mini sem ajuste — e
as cercas são cicatrizes que FICAM. Mudanças publicadas no n8n (workflow
`rJO1n7cFeNDIJyB5`, versão ativa `7c431343`, conferida byte a byte por sha):

1. **Modelo: gpt-4o-mini → gpt-4o.** Custo estimado ~R$0,10/mensagem
   (~R$0,30 numa conversa de 3) contra ~R$0,02/conversa no mini — centavos
   contra a cobrança por agendamento em reais. Medir no uso real.
2. **Prompt em duas camadas**: persona nova na abertura ("papo de balcão"),
   COMO VOCE SOA ganhou instrução positiva + 3 exemplos de tom (cada um
   amarrado às cercas: "afirmar só depois da ferramenta"), regra de responder
   cumprimento antes de pedir dado, exemplo do passo 1 deixou de ser
   interrogatório, e reclamação ganhou UMA frase de acolhimento antes de
   chamar o dono. **Cercas intactas**: prova por reversão — desfazendo as 4
   trocas, o texto volta ao original byte a byte.

Método (lições aplicadas): patch por script com assert de ocorrência única,
nunca redigitação; publish + conferência de versionId == activeVersionId; a
extração revelou que o prompt usa CRLF e a normalização para LF foi
deliberada e uniforme. Fica aberto: teste vivo na rodada (Bloco 7 — precisa
parear a Evolution) e comparar o custo real por conversa no painel da OpenAI.

## Meta: terceira recusa do nome e chamado aberto (2026-09-19/20)

"Club Cut - Aura IA" rejeitado em 19/09 13:30 UTC — mesmo código
(BIZ_COMMERCE_VIOLATION_OTHER) das outras duas, JÁ com perfil comercial
preenchido e forma composta da diretriz. Três grafias, um código: o bloqueio
é a avaliação do negócio, não a string. Chamado aberto no Direct Support em
20/09 (Request Type "Change Display Name (non Official Business Account)",
WABA 975811062135581) pedindo o motivo específico; Cartão CNPJ/CCMEI como
anexo. Regra até a resposta: NÃO reenviar 4ª variação. Hipótese a sondar só
se o suporte devolver genérico: cláusulas de AI Provider dos termos do
WhatsApp Business (o site vende IA que atende terceiros).

## Pacotes, parte B — o agente conta o saldo ao marcar (2026-09-21)

Das tres lacunas do mapa de pacotes (dono pediu o desenho em 20/09), a B
entrou: cliente com pacote agora OUVE do agente, na confirmacao do horario,
que tem credito daquele servico e quantos restam.

Como (workflow `rJO1n7cFeNDIJyB5`, versao ativa `f2cc2730`, tudo conferido
byte a byte apos publish):
- No novo `Saldo de Pacotes (Contexto)` lendo `saldo_de_pacotes_por_telefone`
  (salon + telefone + vencido=false), com o trio executeOnce +
  alwaysOutputData + continueRegularOutput, em serie na cadeia de contexto
  (Horarios -> Saldo -> Montar Contexto).
- Assignment 12 `saldo_de_pacotes` no Montar Contexto; linha nova no
  [CONTEXTO INTERNO]: "SALDO DE PACOTES DELE (lido agora; NENHUM = nao tem
  pacote)". E a 4a vez que a licao "fato no contexto, nao na ferramenta"
  paga (calendario, catalogo, agenda do cliente, agora pacotes).
- Prompt: cerca DINHEIRO passou a aceitar o CONTEXTO como fonte legitima do
  saldo (senao a regra nova conflitava com a cerca), e AVALIACAO E PACOTES
  ganhou a regra proativa: ao confirmar horario cujo servico casa com o
  saldo, COPIAR o numero de restantes ("voce tem 3 cortes no pacote - e so
  usar um nesse horario"); NAO fazer conta do depois (o debito e no balcao);
  NENHUM = nao tocar no assunto; saldo de outro servico nao promete
  cobertura; o aviso nunca vira venda.

Fica aberto: prova de execucao real (a API do n8n omite credenciais na
leitura; o addNode passou a credencial e foi aceito - o primeiro teste do
Bloco 7 confirma), e as partes A (chip de pacote no modal e detalhe da
Agenda) e C (aviso "usar pacote?" no caixa), desenhadas em 20/09,
aguardando ordem do dono.

## Pacotes, parte A — a Agenda enxerga o pacote (2026-09-21)

O detalhe do agendamento ganhou a linha "Pacote": saldo vigente do cliente,
com o que casa com o servico do horario PRIMEIRO e em verde, e o aviso "da
para usar no Concluir e cobrar" — visivel exatamente no trampolim do caixa,
que era onde o barbeiro so descobria o credito se reparasse.

Ajuste de desenho contra o plano de 20/09, pelo motivo certo: o chip NAO
entrou no modal de CRIAR agendamento — ali o cliente e nome livre + telefone,
resolvido so no submit (as vezes por cima da RLS, via garantir_cliente).
Chip ali seria chute por nome digitado, o "supor" que o produto proibe. O
lugar com identidade conhecida e o detalhe.

Miolo: `src/features/pacotes/` novo (helpers puros + hook), catraca com 8
testes (singular/plural, vencimento por corte de string sem Date, vencido e
zerado nunca passam, ordenacao por cobertura). RLS conferida ao vivo:
policies "membros leem" da 0112 cobrem barbeiro — zero migration. Erro e
vazio ficam mudos por decisao (saldo e apoio; nunca trava o detalhe).

Fica aberto: parte C (o caixa cutuca o consumo), desenhada em 20/09.

## Pacotes, parte C — o caixa cutuca o consumo (2026-09-21)

A leitura do caixa mudou o desenho para melhor: a caixinha de saldos com
"Usar 1 do pacote" JA existia abaixo do cliente — a lacuna real era ela ser
passiva. Dava para ter o Corte COBRADO na comanda com "restam 3" escrito
logo acima e finalizar assim: quem pagou adiantado pagava de novo.

Agora cada linha COBRADA que casa com saldo disponivel ganha um aviso
warning inline com "Usar o pacote neste item": a linha vira consumo no lugar
(preco 0, vinculo viaPacote, sem comissionar de novo); quantidade > 1 solta
uma unidade e mantem o resto cobrado. A conta de disponibilidade e a mesma
do botao existente (desconta consumos da propria comanda), senao a sugestao
mandaria o barbeiro para a trava de erro.

Miolo: `sugestaoDePacote.ts` puro (generico, sem cast) + 6 testes de
catraca; handler `trocarItemParaPacote` no NewSaleModal. Dinheiro continua
decisao humana — um clique, mas impossivel de nao ver.

Com A + B + C entregues, o plano de pacotes de 20/09 fecha. Prova visual das
tres pontas: rodada do dono (Agenda e caixa no proximo login; agente ao
parear a Evolution no Bloco 7).

## Rodada, achado nº 2 — a comanda zerada não fechava (2026-09-21)

Primeiro uso REAL de pacote (20/09, ~15h): o dono vendeu o pacote, abriu
outra comanda para o mesmo cliente, usou "Usar 1 do pacote" e finalizou —
"Não foi possível completar a venda. Nada foi salvo". Diagnóstico pelos
logs da API: orders 201, order_items 201, **payments 400** às 17:59:59Z.
Causa: comanda que fecha em R$ 0,00 (consumo cobrindo tudo) com linha única
de pagamento virava `payment` de R$ 0,00 — e o CHECK `payments_valor_positivo
(valor > 0)` derrubava tudo no rollback. O CHECK está certo; faltava o
cliente saber que **zero a receber = zero linhas de pagamento**.

Fix em `pagamentosDaComanda`: total zero devolve lista vazia; valor digitado
com total zero é recusado com o motivo ("o pacote já cobriu tudo") em vez de
engolir o número. Catraca: 2 testes novos (10/10 no arquivo). Defeito
pré-existia às partes A/C (mergeadas só hoje) — o fluxo antigo nunca tinha
sido usado com comanda 100% coberta.

## Métricas de campanha, lote 1 de 3 — última visita, ritmo, situação (2026-09-21)

O dono aprovou as 8 métricas da ficha (de 3 em 3). A fundação veio junto com
o lote 1 e serve os três lotes:

**RPC `metricas_do_cliente` (0174, DEFINER, aplicada + ensaiada 14/14):** a
RLS de appointments mostra ao barbeiro só os horários DELE — métrica no
navegador daria "sumiu há 40 dias" para quem veio há 3 com outro barbeiro, e
campanha por número enviesado é campanha errada. O definer valida o vínculo
por dentro (padrão situacao_do_acesso), devolve agregados iguais para todo
papel, dias no fuso de SP, mediana via percentile_cont, nulls para cliente
novo (nunca NaN), linha NENHUMA para quem é de outro salão, anon sem execute.
Catraca pgTAP com 14 asserções — inclusive "barbeiro vê os MESMOS números".
A RPC já devolve TODOS os campos dos 3 lotes; os lotes 2 e 3 são só CRM.

**UI do lote 1:** faixa de 3 cards na ficha (Última visita / Ritmo /
Situação), com "Em dia" verde e "Atrasado há N dias" âmbar — atrasado é
passar do ritmo PRÓPRIO do cliente, não de número fixo. Erro da RPC fica
mudo (achado 31); sem histórico, travessão. 8 testes vitest dos helpers.

Ficam: lote 2 (ticket médio, serviço de sempre + produto, faltas/cancels) e
lote 3 (pacote saldo/vencimento via useSaldoDePacotes, última nota).

## Métricas de campanha, lote 2 de 3 — ticket, hábito, confiabilidade (2026-09-21)

Só CRM (a RPC 0174 já devolvia os campos): segunda faixa de cards na ficha —
**Ticket médio** (por comanda fechada), **Serviço de sempre** com o gancho de
produto ("nunca levou produto" é oportunidade de campanha, não defeito;
detalhe em cinza de propósito) e **Faltas e cancelamentos** ("Nenhum" em
verde quando o histórico existe e está limpo — a proteção de campanha começa
por dar nome ao comportamento). Travessão em tudo que não tem dado; 5 testes
novos dos helpers. Fica: lote 3 (pacote saldo/vencimento + última nota).

## Métricas de campanha, lote 3 de 3 — pacote e última nota (2026-09-21)

Fecha as 8 métricas aprovadas. Só CRM: card **Pacote** na ficha reusando o
hook e o rótulo da parte A ("Sem pacote ativo" é DADO, não ausência — é o
alvo da venda; com saldo, "Corte: 3 restantes (vence 12/10)") e card
**Última nota** ("5 de 5" verde = pedir indicação; 3 para baixo âmbar = caso
de dono, não de campanha; data por corte de string). +2 testes (487).
Com A+B+C de pacotes e os 3 lotes de métricas, a ficha virou painel de
campanha; o próximo passo natural (não pedido) segue sendo filtros em lote
na lista de Clientes.

## Os filtros de campanha em lote na lista de Clientes (2026-09-21)

Onde as métricas viram campanha de verdade. Chips na lista — **Todos /
Atrasados / Pacote vencendo / Nunca levou produto** — cada um com a CONTAGEM
do lote, compostos com a busca por nome/telefone.

**RPC `metricas_para_filtros` (0175, DEFINER, ensaiada de primeira e
aplicada):** a irmã em lote da 0174 — uma linha por cliente do salão, mesmo
motivo (número de campanha não depende de quem abriu a lista), o trinco no
WHERE (salão fora dos vínculos = linha nenhuma), `pacote_vence_em_dias`
calculado no SERVIDOR no fuso de SP (o filtro não faz conta de data no
aparelho). Catraca pgTAP com 9 asserções.

**Réguas dos filtros = as da ficha** (senão lista e ficha discordariam):
atrasado é o situacaoDoCiclo; pacote vencendo exige saldo + janela de 30
dias; "nunca levou produto" só mira quem JÁ tem comanda fechada. Chips só
aparecem com o mapa carregado (erro = some, não mente — achado 31); estado
vazio com filtro ativo diz a verdade ("ninguém se encaixa") em vez de
mandar buscar outro nome. 7 testes vitest.

Correção de rota: eu tinha dito que aniversário não existia no cadastro —
existe (clients.aniversario, usado no export CSV). Filtro "aniversariantes
do mês" fica barato quando o dono quiser.

## Rodada, achado nº 3 — o e-mail que falha em silêncio (2026-09-21)

O dono enviou um feedback de teste pelo CRM (20/09 15:08) e ele não chegou
em lugar nenhum. O funil provou-se saudável até a última porta: gravado no
banco, listado em `feedbacks_pendentes`, o n8n rodando a cada 5 min e
ACHANDO o item, e-mail montado — e o nó "Avisar por E-mail" caindo com
**535 authentication failed**: a credencial SMTP da Hostinger
(contato@clubcut.space, `Ozsdd8R9j8L9vUJO`) parou de autenticar. Como o nó
tem saída de erro (onError continua) e o "marcar" só roda depois do envio,
a execução fecha "success" e o robô falha EM SILÊNCIO a cada 5 minutos
desde então. Nada se perdeu: o desenho "marca só depois de enviar" segura
o item na fila — assim que a credencial voltar, o próximo ciclo entrega.

**Raio de alcance:** a mesma credencial serve os 8 nós emailSend de 7
fluxos (migração de 07/09) — convite de equipe, auditoria, alertas. E o
**Auth do Supabase** usa a mesma caixa via Custom SMTP: sem erro nos logs
das últimas 24h, mas também sem tráfego — o próximo convite/reset quebra
igual se a senha for a mesma. Suspeita de causa: senha da caixa trocada ou
bloqueio da Hostinger por ~290 tentativas falhas (1/5min × 24h).

**Nuance provada em 21/09:** o "convite que chegou" NAO refuta a queda - o
dono copiou o LINK na tela e o convite foi aceito 44s depois de criado
(email_enviado_em null; o robo de 10min nem chegou a rodar). E
list_credentials confirma: existe UMA credencial SMTP ("SMTP Hostinger",
Ozsdd8R9j8L9vUJO) para os 8 nos - a queda e de TODOS os e-mails da
plataforma desde 20/09 15:08.

**Ação (dono, senha não passa pelo chat):** conferir a senha da caixa no
painel da Hostinger → atualizar a credencial SMTP no n8n (Credenciais →
SMTP Hostinger) → o ciclo seguinte entrega o feedback preso e marca
`notificado_em` sozinho → conferir também o Custom SMTP do Auth no painel
do Supabase. Fica aberto pensar um ALARME para "erro repetido na saída de
erro" — o silêncio de 24h só quebrou porque o dono testou.

### O prognóstico se cumpriu, e era pior (2026-09-24)

Acima ficou escrito em 21/09: "o **Auth do Supabase** usa a mesma caixa via
Custom SMTP: sem erro nos logs das últimas 24h, mas também sem tráfego — o
próximo convite/reset quebra igual se a senha for a mesma". O dono foi criar
uma barbearia em 24/09 às 23:03 e levou **"Não foi possível criar a conta
agora"**. Os `auth_logs` provam a mesma causa, sem intermediário:

    path=/signup  status=500
    erro=535 "5.7.8 Error: authentication failed: (reason unavailable)"

**O agravante que não estava previsto:** não é só o e-mail que não sai. O
GoTrue trata a falha de envio da confirmação como falha da operação inteira
e devolve **500** — a conta **não é criada**. Prova independente: o último
registro em `auth.users` é de **20/09 15:04**, minutos antes de o SMTP cair
às 15:08. Desde então **ninguém consegue se cadastrar no Club Cut**, e isso
inclui qualquer pessoa que chegue pelo site. O que continua funcionando é o
login de quem já tem conta (`/token` 200 no mesmo minuto da falha).

Portanto a senha da caixa não destrava só "os e-mails": ela destrava a
**porta de entrada do produto**. Três saídas, em ordem de preferência:

1. **Trocar/conferir a senha na Hostinger** e atualizar nos DOIS lugares
   (Supabase → Auth → SMTP, e n8n → credencial "SMTP Hostinger"). Resolve
   cadastro, reset de senha, convite de equipe, feedback e alertas de uma vez.
2. **SMTP padrão do Supabase** como ponte: volta a cadastrar hoje, mas tem
   teto baixo de envios por hora e remetente genérico — tapa-buraco, não fim.
3. **Desligar a confirmação de e-mail** no Auth: faz o cadastro voltar na
   hora, e é a pior das três — sem confirmar o endereço, qualquer um cria
   conta com o e-mail de outra pessoa. Só com o dono decidindo, e com data
   para voltar atrás.

**RESOLVIDO em 24/09 23:23**, e com prova tripla: conta nova criada e
**confirmada** (o e-mail de confirmação chegou e o link foi clicado), e o
feedback preso desde 20/09 15:08 entregue sozinho às 23:25 pelo ciclo
seguinte do n8n — exatamente como o desenho "marca só depois de enviar"
prometia. Fila zerada.

### O alarme que faltava (2026-09-29)

Quatro dias de silêncio não foram culpa da Hostinger: foram de não haver
quem gritasse. O alarme entrou pela migration **0181**, e a decisão que o
define é esta: **ele não pode ser um e-mail**. `canal_de_alertas` está com
`provedor = 'email'` e a fila `auditoria_pendente` é despachada por e-mail
— um aviso de "os e-mails não estão saindo" mandado por e-mail só chega
quando já não é preciso. O mesmo vale para WhatsApp, que depende da
Evolution pareada e de template aprovado pela Meta.

Então o aviso vai para **a tela do CRM**, que é onde o dono olha todo dia e
que não depende de terceiro nenhum.

- **Detecção pelo sintoma, não pela causa** (o mesmo princípio da 0165 com
  os crons): não se pergunta ao n8n se ele falhou, porque ele acha que não
  falhou. Olha-se a fila que devia esvaziar e não esvaziou —
  `feedbacks.notificado_em` (ciclo de 5 min) e `salon_invites.email_enviado_em`
  (10 min). Tolerância de **20 minutos**, folgada de propósito: alarme que
  dispara no atraso normal do agendador vira ruído, e ruído se ignora.
- **Fica de fora** o convite já aceito pelo link copiado na tela e o convite
  vencido: nos dois o e-mail deixou de importar, e cobrá-lo seria um alarme
  que nunca se apaga.
- **Por salão, e a frase é de cliente.** Quem abre o CRM é dono de
  barbearia, não administrador de servidor: a faixa diz que *o convite dele*
  não saiu e oferece a saída que existe hoje (copiar o link em Equipe),
  em vez de anunciar "SMTP 535". Só o gestor vê — barbeiro não tem o que
  fazer com convite preso.
- **Some sozinha** quando a fila esvazia, e não tem botão de fechar: o
  problema não é da pessoa e não desaparece por ela mandar sumir.
- Erro na consulta deixa a faixa **muda** (achado 31): anunciar "seu e-mail
  não saiu" por causa de uma rede instável é pior que o silêncio.

pgTAP com 10 asserts, incluindo o isolamento entre barbearias. Fica aberto:
o alarme cobre as duas filas que marcam a hora do envio; um nó de e-mail que
falhe sem fila por trás (alertas de auditoria) continua invisível, e para
esse o caminho seria a saída de erro do n8n gravar em `entregas_falhadas`.

**A mentira da tela, que é nossa e não da Hostinger:** `CriarContaPage`
mostra "Tente novamente em instantes" para QUALQUER erro do `signUp`. Aqui
tentar de novo nunca vai funcionar — a pessoa tenta, tenta e desiste sem
que ninguém fique sabendo. Vale distinguir a falha de envio de e-mail (que
pede "fale com a gente") do erro passageiro, e mandar esse caso para o
Sentry com destaque: a porta de entrada fechada por quatro dias só foi
descoberta porque o dono resolveu testar.

## A visão do barbeiro no Financeiro: comissão, não faturamento (2026-09-21)

Pedido do dono: barbeiro não vê faturamento — nem o próprio — só a comissão
sobre os atendimentos dele. A verificação antes do bisturi mostrou que a
RLS já estava certa (orders = gestor OU professional_id meu; commissions =
só as minhas), então nada vazava por REST — era mudança de tela mesmo:

- O card-herói do barbeiro virou **"Sua comissão"** (soma das linhas que a
  RLS já limita a ele), sem spark nem variação — comissão por dia não
  existe no hook e número inventado é pior que card simples. O card
  "Faturamento" sai da lista dele; atendidos/agendamentos/cancelamentos
  (dele) ficam.
- **"Serviços mais vendidos · por faturamento"** passou a ser só de gestor.
- O que já era só de gestor continua (meta, caixa, exportar, fechar
  comissões); a aba Vendas segue mostrando as comandas DELE (operacional).

Prova visual pendente de um login de barbeiro (convite por e-mail está
travado pelo SMTP — achado nº 3 —, mas o dono pode copiar o link do convite
na tela de Equipe).

## O Financeiro desce ao dia (2026-09-21)

Pedido do dono: o filtro tinha só "Hoje" e mês navegável — agora o lado
"Dia" anda de um em um (chevrons) e salta para QUALQUER data (calendário
nativo embutido na pílula), com rótulo humano ("sáb, 20/09" — o dia da
semana é o que responde "qual dia tem mais movimento"). O badge de variação
compara com o dia imediatamente anterior; o spark são os 7 dias até o
escolhido; o donut da meta olha o mês DO DIA até ele; a aba Vendas
acompanha o dia (com FIM de período — o "hoje" antigo podia ficar aberto,
um dia passado não). Datas parseadas por partes, LOCAIS — new Date('YYYY-
MM-DD') seria UTC e voltaria um dia no Brasil. Entrar no lado Dia com um
mês passado navegado começa no último dia daquele mês, não salta para hoje.

A catraca de botões (D5) pegou os 3 botões novos e a saída foi a certa: o
seletor inteiro virou componente próprio (SeletorDePeriodo.tsx, teto 6
medido) e o teto da página DESCEU de 10 para 7. computePeriods foi exportada
e ganhou 6 testes (virada de mês inclusa).

## O cliente mexe no próprio horário (2026-09-21, em quatro fases)

Pedido do dono, aprovado com ordem: "ele agenda um corte e dai 10 minutos
após... lembra que vai fazer tambem a sobrancelha... manda msg e não
consegue adicionar nem nada". Verificado antes: o agente n8n só tem criar
(UM serviço — service_id singular), cancelar e confirmar presença; o prompt
ensina "reagendar = cancelar + criar", que conta um cancelamento FALSO nas
métricas de campanha; a agenda pública remarca e cancela pelo link de
gestão, mas trava a lista de serviços de propósito (linha 677 da edge).

**Fase 1 — FEITA (migration 0176, aplicada em produção após ensaio com
rollback; pgTAP com 28 asserts):** três RPCs security definer, só
service_role, retorno jsonb {ok/motivo/sugestões} para o agente conversar
a recusa:
- `alterar_servicos_pelo_cliente(ag, servicos[], client_id|token)` — troca
  a lista, recalcula o fim, e A TRAVA de sobreposição (0063) decide se
  cabe (recusa desfaz tudo por subtransação). Réguas do cliente: 30min de
  piso (0166), serviço ativo, não passa da jornada nem do fechamento.
- `remarcar_pelo_cliente(ag, novo_inicio, client_id, prof?)` — remarcação
  DE VERDADE (mesmo agendamento, mesmo token de gestão), vaga validada por
  horarios_livres (0169, régua única com a agenda pública), lembrete
  rearmado, carimbo remarcado_pelo_cliente_em.
- `agendar_pelo_agente(salon, client, prof, servicos[], inicio)` — criação
  com VÁRIOS serviços e vaga validada ANTES de gravar (o insert antigo do
  agente só era barrado pela trava crua: sem jornada, fechamento, folga).

**Fase 1b — FEITA (migration 0177):** percorrendo os caminhos antes de
escrever a tela apareceu um beco: serviço que a barbearia INATIVOU e que
ainda está num agendamento futuro fazia a lista inteira ser recusada
(22023 → 500 genérico), e o cliente não conseguia nem acrescentar a
sobrancelha. Defeito CONFIRMADO em produção com ensaio antes de corrigir.
A regra virou "pode MANTER o que saiu do cardápio, não pode ACRESCENTAR".
+2 asserts no pgTAP (30 no total).

**Fase 2 — FEITA (n8n, workflow rJO1n7cFeNDIJyB5, publicado):** o nó
`Criar Agendamento` (supabaseTool, um serviço só) virou httpRequestTool
para `/rest/v1/rpc/agendar_pelo_agente` com lista de serviços; nasceram
`Remarcar Agendamento` e `Alterar Servicos do Agendamento`. Credencial
por referência (Supabase account), três conexões ai_tool conferidas. O
prompt mudou em 7 pontos (patch por script com assert de ocorrência única
e prova por reversão; sha256 conferido contra o que o n8n gravou):
serviços em lista, seção "CANCELAR, REMARCAR E MUDAR OS SERVICOS" com o
exemplo da sobrancelha e a regra da LISTA COMPLETA, e `ok:false` +
`sugestoes_no_dia` como linguagem de recusa.

**Fase 3 — FEITA (edge + CRM):** ações `catalogo` e `alterar_servicos` na
edge `agenda-publica` (autorizadas por token, mesmo freio de 12/10min),
`appointment_services` passou a devolver o `id` do serviço, e o link de
gestão ganhou o editor: catálogo carregado SOB DEMANDA, total ao vivo,
serviço fora do cardápio marcado como tal, e a recusa da RPC mostrada em
frase de gente. Verificado ponta a ponta no navegador (claro e escuro,
375px): adicionar sobrancelha levou o fim de 10:40 para 11:15 com o corte
seguindo principal; com um vizinho colado, a recusa apareceu explicada e
NADA mudou no banco. `aria-label` nos checkboxes veio de um defeito visto
na árvore de acessibilidade durante o teste (liam "caixa de seleção" sem
o nome do serviço).

**Fase 4 — FEITA (migration 0178 + n8n + CRM):** produto não entra em
agendamento nem se vende pelo chat — vira RECADO. A diferença que decidiu
o desenho: serviço ocupa cadeira (precisa de validação de vaga), produto é
estoque e dinheiro (exigiria cobrar pelo chat e prometer prateleira). O
agente ANOTA; o barbeiro lê e lança no balcão.

- **Banco:** `appointments.recado_do_cliente` + `recado_em`, CHECK de 280,
  RPC `anotar_recado_pelo_cliente` (de pé, futuro, e SEM o piso de 30min —
  de propósito: avisar em cima da hora AJUDA o barbeiro, esticar a cadeira
  atrapalha; recado vazio apaga; acima de 280 volta {ok:false} para o
  agente resumir em vez de truncar mentindo). A view
  `agendamentos_do_cliente` foi recriada por inteiro com a coluna `recado`
  (drop+create: coluna nova no meio levanta 42P16, e `replace` perde em
  silêncio o `security_invoker` e os revokes). pgTAP com 19 asserts.
- **n8n:** nó `Produtos para Contexto` (products ativos, com o trio
  executeOnce+alwaysOutputData+onError) entrou na cadeia de contexto; o
  campo `produtos` e o `RECADO JA ANOTADO` dentro de
  `horarios_do_cliente` — fato no CONTEXTO, não em ferramenta que o agente
  esquece de chamar. Ferramenta `Anotar Recado no Horario` e a seção
  "PRODUTO: VOCE NAO VENDE, VOCE ANOTA" no prompt (patch com prova por
  reversão; os dois sha256 conferidos contra o que o n8n gravou). Publicado.
- **CRM:** faixa "O cliente pediu" no topo do detalhe do agendamento (fora
  da lista de campos — é a única informação que exige AÇÃO antes de
  atender), ponto de recado no card da grade (e no aria-label, senão leitor
  de tela não veria), e o recado viaja no prefill até a comanda do
  "Concluir e cobrar", que é onde o produto se resolve.
- **Agenda pública:** o link de gestão mostra "Você pediu: ..." — sem isso,
  quem pedia pela conversa abria o link e não encontrava sinal nenhum do
  pedido, e a única saída era perguntar de novo.

Verificado ponta a ponta: a RPC pelo caminho REST que o n8n usa (HTTP 200,
ok:true), o recado aparecendo na tela pública com o texto gravado, e a
query exata da agenda devolvendo o campo para o barbeiro.

## O bloco de funcionalidades: o que entra e o que não (2026-09-30)

Depois das doze correções da visão do barbeiro (PRs #188 e #189), o dono
decidiu item a item o que vira funcionalidade. Registrado aqui porque decisão
que não é escrita volta como pergunta.

**Entram, nesta ordem:** 13 (bloquear horário), 14 (os números que faltam),
16 (fila de espera), 18 (pedido de folga), 19 (depósito contra falta),
20 (onboarding do barbeiro).

**Não entra: 15 — ficha técnica do corte.** Decisão do dono, sem prazo para
revisão.

**Em espera: 17 — logo e cor por barbearia.** O dono quer testar algumas coisas
antes. O levantamento já está feito e fica aqui para não ser refeito:

- A agenda pública **já** mostra as iniciais e o nome da barbearia, não a marca
  do produto. O que não é personalizado é o verde (`--primary`), a ausência de
  logo, e o cartaz do balcão, que sai com as cores e as listras do Club Cut
  fixas no código.
- **Não existe nenhum bucket de storage no projeto** — zero buckets, zero
  arquivos, conferido no painel. Subir uma logo significa construir a camada
  inteira: bucket, policy em `storage.objects` por pasta de salão, validação de
  tipo e tamanho nos dois lados, o "ainda não tem logo", trocar e remover. E o
  cartaz tem 11 KB justamente porque não embute nada.
- **A cor não é um valor, são dez**: `primary`, `hover`, `foreground`, `soft` e
  `soft-foreground`, em dois temas — e no escuro o primário é mais claro e o
  texto em cima dele vira preto. Seletor de cor livre publicaria botão ilegível
  com a cara de defeito da barbearia. O desenho que funciona é uma **paleta de
  6 a 8 cores prontas**, cada uma com os dez valores já conferidos.
- Decisão de produto embutida: o rodapé `Agenda por Club Cut` é a distribuição.
  Quanto mais a barbearia assume a página, mais essa linha é a única coisa que
  diz que o produto existe.

**Fechadas sem trabalho** (o comportamento de hoje, agora confirmado):
o barbeiro **pode** cancelar e excluir agendamento sem trava; e o **Catálogo
fica** no menu dele, como consulta de preço e estoque.

## O `npm audit` vermelho: descartado com o motivo escrito (2026-09-30)

`undici` e `brace-expansion`, ambos por baixo do `jsdom`. Decisão do dono:
descartar o `npm audit fix`.

A prova de que não prejudica: `npm audit --omit=dev` acusa **zero
vulnerabilidades**. Nada disso chega no navegador do cliente — é dependência de
teste.

**O que a decisão custava — e foi resolvido no mesmo dia.** O comentário do
próprio `ci.yml` dizia *"a árvore está limpa hoje, então qualquer vermelho aqui
é notícia de verdade"*. Essa premissa morreu com o `undici`: o job ficaria
vermelho para sempre, e alarme que nunca apaga para de ser alarme — a próxima
vulnerabilidade **de produção** apareceria no mesmo vermelho que já se aprendeu
a ignorar.

O dono aprovou a troca, e o comando passou a ser `npm audit --omit=dev
--audit-level=high`. Fica verde hoje (`found 0 vulnerabilities`, conferido) e
vermelho só quando algo alcançar o navegador do cliente. O job segue **fora**
das checagens obrigatórias: aviso novo nasce do mundo lá fora, não do que o PR
mudou, e travar merge por isso ensina a ignorar o vermelho — que é o mesmo
defeito por outro caminho.

A dívida de desenvolvimento não sumiu; ela deixou de gritar no lugar errado.
Quando `npm audit fix` couber num PR, entra sozinho.

## Item 13 — o barbeiro fecha a própria agenda (2026-09-30, migration 0182)

O status `bloqueio` existia no CHECK de `appointments` desde sempre, o tipo do
CRM o conhecia, o modal de detalhe já o desenhava em cinza e a contagem de
reservas vivas já o ignorava. Faltava **criar** um: o `NewAppointmentModal`
gravava `agendado` ou `concluido`, e por isso havia **zero** linhas com esse
status no banco. Uma porta inteira construída e nunca aberta — o barbeiro
marcava o almoço como reserva no nome de um cliente inventado.

**Abrir a porta não precisaria de migration.** A trava de exclusão
`appointments_sem_sobreposicao` não isenta `bloqueio`, então no instante em que
a linha existe o banco recusa agendamento em cima dela nas três portas (CRM,
link público, agente). `client_id` e `service_id` já aceitavam nulo, e a RLS já
limitava o barbeiro à própria cadeira.

**O que exigiu migration foi a folga.** `folga_entre_atendimentos_minutos`
existe para o barbeiro respirar entre dois clientes, e o bloqueio *é* a
respiração. Sem correção, a primeira tentativa já falhava: com folga de 10 (o
valor do salão de teste), bloquear o almoço das 12h com um corte terminando às
12h era recusado com "fica a menos de 10 minutos de outro atendimento" — frase
que o barbeiro leria como defeito.

A régua vale nos dois lados, e por isso **duas funções mudaram juntas**: o
gatilho `respeita_folga_entre_atendimentos` (decide se a linha entra) e
`horarios_livres` (decide o que o cliente enxerga). Mexer só no gatilho deixaria
o CRM aceitando 13:00 enquanto o link público escondia até 13:10.

Em `horarios_livres` a folga **mudou de lado**: antes alargava o candidato e
media contra o vizinho; como agora depende de *quem* é o vizinho, passou para o
lado dele. É equivalente — alargar A em f e medir contra B é a mesma pergunta
que alargar B em f e medir contra A.

**De quebra, dois defeitos que só apareceram andando pelos lados:**

- A Agenda desenhava `{client_nome ?? 'Cliente'}`: um bloqueio apareceria como
  "12:00 · Cliente", e o leitor de tela diria "12:00, cliente" para uma hora em
  que não há ninguém.
- O detalhe abriria um almoço com "Confirmar", "Cliente chegou", "Concluir" e
  "Cobrar" — o mesmo defeito que a lista de Vendas acabou de perder no item 10,
  repetido noutra tela. Ganhou saída própria, com uma ação só.

**O "dia inteiro"** entrou junto, por um checkbox: ele cobre a maior parte do
item 18 (pedido de folga) para uma equipe de três. O que sobraria do 18 é o
fluxo de *pedir e o dono aprovar*, que é gestão de gente e não agenda — vale
reavaliar se ainda se justifica.

**Peças:** CRM (modal, agenda, detalhe) e Supabase (0182). Vercel, n8n e as
edges: **nada** — a trava do banco e a `horarios_livres` já atendem as duas
portas do cliente sem uma linha nova.

**Não verificado em tela logada:** entrar como barbeiro exigiria criar conta ou
digitar senha. Provado no banco (11 asserções pgTAP, ensaiadas contra o schema
real com rollback antes de aplicar) e em teste de unidade (10 asserções no
módulo puro da janela). A conferência visual é do dono.

## Item 14, parte 1 de 2 — as três taxas do barbeiro (2026-09-30, migration 0183)

O Financeiro tinha quatro cartões: Faturamento, Clientes atendidos,
Agendamentos, Cancelamentos e faltas. **Os quatro são contagem ou soma.**
Nenhum era taxa — o CRM contava *quanto* aconteceu e nunca dizia *se foi bom*.

Entraram as três que são do barbeiro: **ocupação da cadeira**, **clientes que
voltam** e **serviços por atendimento**. As três de gestão (ticket médio, % de
produto, melhores dias) ficam para a parte 2: saem de `orders`, que é outra
árvore de consultas.

### A decisão que veio de uma pergunta ao dono

O primeiro cálculo contra os dados reais deu **0,93% de ocupação** em setembro.
O número estava certo: 460 minutos atendidos contra 49.680 de jornada — porque
os três profissionais estão cadastrados com **7 dias por semana, 64 horas**.

Eu ia escrever um aviso dizendo que sete dias "provavelmente é engano". O dono
corrigiu: **há barbearia que abre domingo de verdade**, e o sistema não tem como
saber se aquilo é erro de cadastro ou é o negócio da pessoa.

Daí a forma de tudo: a RPC devolve **ingredientes, não percentuais**, e a tela
mostra o denominador — `0,9% · 7h40 atendendo de 828h de jornada`. Quem abre
domingo lê 828h e confirma; quem cadastrou errado lê 828h e vê o próprio erro.
O sistema afirma os fatos que usou e deixa o julgamento com quem conhece a
barbearia. Aviso fica só para **ausência** de fato: sem jornada cadastrada a
taxa é `—`, nunca `0%` — "0%" acusaria o barbeiro de uma preguiça que é, na
verdade, um campo em branco em Equipe.

### As réguas que ficaram dentro do cálculo

- **Bloqueio sai do denominador.** Não é hora vaga que ele deixou de vender, é
  hora em que não estava disponível. Somá-la puniria justamente quem usa o
  bloqueio (0182) para avisar que sai.
- **A janela é cortada em `now()`.** Sem isso, a ocupação do mês em curso é uma
  mentira que assusta: no dia 5 de 30, dividir pelo mês inteiro dá 17%.
- **Cancelado e falta ficam fora do numerador** — a cadeira esteve vazia, e é
  essa perda que a ocupação existe para mostrar.
- **Cancelado não é "voltou"** na taxa de retorno.
- **A ocupação não é cortada em 100%.** Encaixe fora do expediente é permitido
  de propósito no projeto; "110%" não é defeito, é a notícia de que ele atende
  fora da jornada que cadastrou.
- **O barbeiro mede a própria cadeira**, mesmo passando outra no parâmetro. O
  parâmetro é ignorado, não recusado: devolver erro contaria a ele que a outra
  cadeira existe e que o pedido chegou perto.
- **A comparação com o período anterior mostra direção, nunca tamanho.** A
  diferença entre dois percentuais se mede em pontos, e escrever "+20%" ao sair
  de 10% para 12% seria mentira; como "ponto percentual" é jargão que ninguém
  usa cortando cabelo, a tela mostra a seta e o valor anterior por extenso
  ("antes 10,0%"). Meio ponto de zona morta impede seta verde por 12,01%
  contra 12,00%.

### Peças

CRM (RPC nova consumida por hook próprio + seção no Financeiro) e Supabase
(0183). Vercel, n8n e edges: nada.

**Hook separado de propósito:** `useFinanceiroData` faz oito consultas soltas;
juntar as taxas ali faria uma falha delas derrubar o faturamento junto.

**Sob erro a seção some inteira**, e o gate entrou no tripwire de
`ErroDeCarga.test.ts` — provado por reversão: tirando o gate, o teste quebra.

### O que falta

Parte 2 do item 14: ticket médio, % de produto na venda e melhores dias. E a
conferência visual, que é do dono — entrar como barbeiro exigiria criar conta.

## Item 14, parte 2 de 2 — de onde vem o dinheiro (2026-09-30, migration 0184)

Fecha o item 14 com as três de **gestão**: ticket médio, quanto da venda é
produto e qual o melhor dia da semana. O barbeiro não vê nenhuma — todas saem
de faturamento, e faturamento é do dono (decisão de 21/09). A RPC recusa com
42501, e o hook nem dispara a chamada: erro no console dele seria erro que não
é problema dele.

### A armadilha: existem DUAS bases de faturamento nesta tela

O cartão "Faturamento" **não soma os itens da comanda — ele soma
`payments.valor`.** As duas contas divergem sempre que houver desconto, pacote
cobrindo item ou pagamento parcial. Hoje, com 6 comandas fechadas, elas batem
por sorte (R$ 685 nas duas), e foi por pouco que isso não passou batido.

A régua que ficou:

- **Ticket médio sai de `payments`** — mesma base do cartão, para o dono poder
  dividir o que vê na tela e chegar no mesmo número. Se saísse dos itens, a
  tela mostraria dois números que se contradizem e ninguém saberia em qual crer.
- **A composição sai dos itens**, porque `payments` não sabe *o que* foi
  comprado, só quanto entrou. Por isso cada linha escreve "em N comandas" ou
  "de R$ X vendidos", e nunca um "do faturamento" genérico que seria mentira em
  metade dos casos.

A fixture do pgTAP tem um **desconto de propósito** (comanda de R$ 100 paga com
R$ 70) justamente para os dois números saírem diferentes: 450 de faturamento
contra 480 de vendido. Se um dia alguém "simplificar" a função para uma base
só, é ali que aparece.

### E são três tipos, não dois

`order_items.tipo` aceita `servico`, `produto` e **`pacote`**. "Quanto é
produto" sem o pacote no denominador daria número inflado — hoje o pacote é
R$ 180 de R$ 685, mais de um quarto do que foi vendido.

### O melhor dia cala quando não tem o que dizer

Sete dias da semana repartindo seis vendas dão um "vencedor" com duas, e
"terça é o seu melhor dia" nesse caso não é relatório: é ruído com cara de
conselho, do tipo que faz alguém remarcar a escala da equipe por nada. O cartão
exige **10 comandas no período e 3 no dia vencedor**; abaixo disso diz "poucas
vendas no período para apontar um dia". Não é estatística — é um piso contra
dizer bobagem.

O melhor dia também é medido **pelo dinheiro, não pela contagem**: três barbas
não fazem um sábado melhor que uma quinta com dois pacotes.

### Peças

CRM (RPC + hook + seção no Financeiro) e Supabase (0184). Vercel, n8n e edges:
nada.

Sob erro a seção some, e o gate entrou no tripwire de `ErroDeCarga.test.ts` —
provado por reversão, como o da parte 1.

### O item 14 está fechado

Faltam a conferência visual (do dono) e, se ele quiser, um seletor de cadeira
no Financeiro para o gestor medir um barbeiro específico — hoje ele vê o salão
inteiro, e o barbeiro vê só a própria cadeira.
## Parecer: o projeto avisa de erro? (2026-09-30)

Pedido antes de começar a prospectar: "de todo ângulo, eu fico sabendo do erro
antes ou ao mesmo tempo que o barbeiro?". Percorrido ângulo por ângulo.

**O que está de pé, conferido:** Sentry no CRM (`@sentry/react` com
`VITE_SENTRY_DSN` presente na Vercel em produção); `comSentry` nas **12** edge
functions, sem exceção; 7 crons do banco rodando no prazo, com
`crons_atrasados()` vigiando os vigias; 12 views de auditoria + fila
`auditoria_pendente` + dedup em `auditoria_avisos`; 16 workflows n8n **todos
ativos**, incluindo a sentinela que confere o webhook da Evolution de 30 em 30
minutos; e o CI completo.

### O buraco: todo alarme sai pelo mesmo cano

**`canal_de_alertas.provedor = 'email'`, e o "Alerta de Falha (Error Workflow)"
usa a MESMA credencial SMTP dos fluxos que ele vigia** (`SMTP Hostinger`,
`Ozsdd8R9j8L9vUJO`).

Não é hipótese. Entre 20 e 24/09 houve **332 execuções com erro** no n8n, todas
com `535 authentication failed`. A cada 30 minutos a "Auditoria do Agente"
detectava problema, tentava avisar, falhava — e o Error Workflow falhava atrás
dela, pelo mesmo motivo.

**O Error Workflow tem 166 execuções e ZERO sucessos.** Ele só é chamado quando
algo quebra, então toda vez que foi necessário estava quebrado pela mesma causa
que deveria denunciar. Foi assim que o cadastro ficou quatro dias fora sem
ninguém saber: o dono descobriu porque foi tentar criar uma conta.

**A resposta à pergunta:** erro de tela, de edge, cron parado, webhook torto e
agente mudo — o dono sabe antes. **Qualquer coisa que quebre o envio de e-mail
— ele não sabe nunca**, e o cliente descobre na hora.

**Saída proposta e RECUSADA pelo dono (30/09):** mandar o alarme de último
recurso por WhatsApp, deixando os dois canais independentes. Ele não quer
receber por WhatsApp. **Segue aberto** — precisa de um segundo canal que não
seja e-mail nem WhatsApp, ou de um dead-man's switch externo.

**Não verificado:** se o Sentry tem *regra de alerta* configurada. Sem regra ele
coleta e fica quieto, e o painel vira arquivo morto. O MCP do Sentry pede
autorização que não havia. **Conferir antes de prospectar.**

## O aviso de cliente novo (2026-09-30, migration 0185)

Até aqui uma barbearia podia se cadastrar e **ninguém ficava sabendo**: a edge
`criar-minha-barbearia` cria tudo e não conta para lugar nenhum. O dado existia
na `metricas_do_produto` (painel administrativo), mas painel é coisa que se
abre, e quem prospecta precisa ser procurado.

Duas chaves novas entram na `auditoria_pendente`, que o n8n já drena de 30 em 30
minutos por e-mail — sem workflow novo, sem canal novo:

- **`barbearia-nova`** — nome, telefone e o nome do **dono** (via
  `user_salons.role='owner'`; o `limit 1` cru trazia o primeiro profissional da
  lista, que num salão de três cadeiras é outra pessoa).
- **`conta-sem-barbearia`** — conta criada há mais de **3 horas** que não virou
  barbearia. Uma hora pegaria quem só foi jantar; 24 avisariam quando a pessoa
  já esqueceu. Os dois casos reais de setembro desistiram em 3 minutos.

Barbeiro com convite aberto fica de fora: sem essa exceção, todo convite
pendente viraria alarme falso.

### O defeito que o ensaio pegou, e que teria sido grave

A primeira versão lia `auth.users` direto na view. As views de auditoria são
`security_invoker`, e **o `service_role` — que é quem drena a fila pelo n8n —
não tem leitura em `auth.users`**. Em produção isso levantaria "permission
denied" *dentro* da `auditoria_pendente` e, como ela é um `UNION ALL`,
**derrubaria os outros dez alarmes junto**: ficaria pior do que antes de existir.

A saída é a que a `auditoria_crons` já usa para chegar em `cron.job`: função
`security definer` em `private`, com `execute` só para `service_role`.

**Ressalva:** estes avisos saem pelo mesmo SMTP de todo o resto. Não resolvem a
cegueira acima — resolvem só "tenho cliente novo?".

**Peças:** Supabase (0185). CRM, Vercel, n8n e edges: nada.

## A agenda ocupa a tela, e a ativação sai da frente (2026-09-30)

Dois pedidos do dono ao abrir o CRM: o cartão de ativação devia ser menor e
flutuante, e a grade da agenda devia ocupar mais espaço.

### A agenda não era pequena — era desperdiçada

`HOUR_START = 6` e `HOUR_END = 22`: a grade desenhava **dezesseis horas** para
toda barbearia. Numa que abre 09:00–19:00 isso é **mais de um terço da altura
em horas que ela nunca usa**.

Eu tinha oferecido ao dono uma escolha entre "ver o dia inteiro sem rolar" e
"blocos maiores com rolagem". A escolha era falsa: encolhendo a janela para o
expediente do dia, os mesmos pixels servem menos horas e dão as duas coisas.

A conta saiu para `janelaDaGrade` (módulo puro, 9 asserções). Ela abraça a
jornada com uma hora de folga de cada lado **e estica para caber horário fora
do expediente** — encaixe fora da jornada é permitido de propósito neste
projeto, e um horário das 20h numa barbearia que fecha às 19h ficaria desenhado
fora da área visível: existindo no banco e invisível na tela.

Sem jornada nem horário (barbearia nova, domingo sem ninguém), cai em 8h–20h —
generoso e já quatro horas menor que o antigo.

### O cartão de ativação virou pílula

Flutuante no canto superior direito, recolhido por padrão, âmbar enquanto falta
algo. O estado fica no `localStorage`, com try/catch: aba anônima devolve
recolhido, que é o padrão seguro porque não cobre nada.

Continua **sem botão de dispensar**, e isso é de propósito: recolher é diferente
de sumir. Com o WhatsApp desconectado o produto não faz nada, e esconder isso
não ajuda ninguém — o jeito de tirar da tela é resolver.

### Dois "está faltando" que eram da amostra, não do CRM

Registrados porque custaram investigação:

- **Arrastar na agenda** funciona e sempre funcionou (`handleDrop` muda cadeira
  E horário, com encaixe de 15 em 15 minutos). O dono não conseguiu porque a
  amostra de 30/09 tinha os 28 horários do dia **todos finalizados**, e bloco
  finalizado não arrasta de propósito. Corrigido nos dados.
- **Promover/rebaixar** existe (`trocarPapel`, com RPC e trava de último dono).
  O seletor some quando o membro **não tem login** — e as quatro cadeiras
  fictícias não têm conta. Some em SILÊNCIO, que é o mesmo defeito dos itens 8
  e 10: deveria aparecer desabilitado dizendo "só depois que ele aceitar o
  convite". **Em aberto.**

## Item 3 — o dia de fechar a comissão (2026-09-30, migration 0186)

Pedido do dono: poder definir um dia de fechamento da comissão, e o Financeiro
avisar que chegou a hora de pagar.

O modal de fechamento (`FechamentoComissaoModal`) **já existia e funcionava** —
faltava alguém avisar. O ciclo dependia de o dono lembrar sozinho, e barbeiro
cobrando comissão atrasada é a conversa mais azeda que existe numa barbearia.

### A régua que precisava estar certa porque é dinheiro

Com fechamento no dia 5 e hoje dia 20, a comissão do atendimento do dia 10
**não está atrasada** — ela pertence ao próximo fechamento. Somá-la no aviso
faria o dono pagar adiantado ou, pior, desconfiar do número e parar de confiar
na tela.

Então a view `comissoes_a_pagar` conta apenas trabalho feito **até o fechamento
vigente** — a ocorrência mais recente do dia escolhido, deste mês se o dia já
passou, do anterior se ainda não chegou. Provado com os dados da amostra: de
R$ 14.246,75 não pagos, a faixa mostra **R$ 4.798,75**; os R$ 9.448 restantes
são trabalho posterior a 05/09 e ficam para o próximo ciclo.

### Por que a data é parâmetro, e não `now()` dentro da view

`private.fechamento_vigente(dia, hoje)` existe para o pgTAP **testar fevereiro
e a virada de ano sem viajar no tempo**. Expressão enterrada numa view que lê
`now()` só se testa no dia em que o calendário colabora. São 7 das 12 asserções.

O dia aceita 1 a 31 e é **aparado pelo último dia do mês**: quem escolhe 31
fecha dia 28 em fevereiro. Travar o campo em 28 seria mais simples e mentiria
para quem fecha no último dia do mês.

### A faixa

Mostra **quanto e para quem** — "Comissão fechada em 05/09: R$ 4.798,75 a pagar"
e, embaixo, nome e valor de cada barbeiro. Ponto vermelho sem número obrigaria
a abrir o modal só para descobrir se é urgente.

Fica **acima das abas**: é dinheiro com data, e a pessoa não deve ter de escolher
uma aba para descobrir que está devendo. **Só gestor** — o barbeiro já vê a
comissão dele nos cartões, e dizer a ele "você tem R$ X para receber" numa faixa
de alerta é decisão de negócio do dono, não efeito colateral desta tela. **Sob
erro de carga some**, com o gate no tripwire do `ErroDeCarga` e provado por
reversão.

**Peças:** CRM (campo em Configurações + faixa no Financeiro) e Supabase (0186).
Vercel e n8n: nada.

### O ciclo semanal, que eu tinha deixado de fora (0187 e 0188)

A 0186 entregou **só o mensal** (dia do mês). Foi suposição minha, não
conferida: o dono perguntou em seguida se dava para definir o dia da semana, e
**barbearia pagando o barbeiro toda semana é mais comum que por mês** — quem
trabalha de cadeira costuma receber na segunda ou na quarta, não no dia 5.

A 0187 acrescentou `ciclo_comissao` ('semanal' | 'mensal'), com o significado do
dia vindo dele: 0 a 6 no semanal (domingo a sábado, a mesma régua do
`extract(dow)` e de `professional_schedules`), 1 a 31 no mensal.

**Duas colunas e não uma** porque `dia_fechamento_comissao` sozinho ficaria com
dois significados e nada no banco diria qual vale. Com o ciclo ao lado, um CHECK
só garante que o par faz sentido.

### O CHECK que passava em nulo (0188)

A trava que a 0187 escreveu **deixava entrar ciclo sem dia** — e dia sem ciclo.
Lógica de três valores:

    (ciclo is null and dia is null)         -> false
    (ciclo = 'mensal'  and dia between ...) -> false
    (ciclo = 'semanal' and dia between ...) -> true and NULL  =  NULL
    false or false or NULL                  =  NULL

E **CHECK só recusa em FALSE**: NULL deixa a linha entrar. Era preciso exigir
`is not null` nos dois campos de forma explícita, em vez de confiar que uma
comparação com nulo devolvesse falso. Pego pelo ensaio, antes de a tela existir.

De quebra, a regra da 0188 também recusa ciclo inventado ('xpto'), que a
anterior aceitava pelo mesmo caminho — a validação do enum saiu de graça.

**Três migrations para um pedido** porque 0186 e 0187 já estavam aplicadas em
produção quando os defeitos apareceram, e migration aplicada não se reescreve.


---

## A lateral que fugia, e o botão que ela passou a esconder (2026-09-30)

O dono rolava a página e o rodapé da barra lateral — nome, papel, sino, tema —
ia embora. A causa não era o rodapé: era a **coluna inteira**. O `<aside>` é um
flex item de uma linha e esticava até o fim do **documento**, não da tela. O
rodapé estava sempre no pé da página; só parecia fixo quando a página era curta.

Corrigido com `md:sticky md:top-0 md:h-[100dvh] md:self-start`, o mesmo desenho
que a coluna da agenda pública já usava — o `<nav class="flex-1 overflow-y-auto">`
que já existia passou a rolar por dentro.

**O que a correção quebraria, e que foi corrigido junto:** `position: sticky`
cria contexto de empilhamento. Sem `z-index`, a coluna passaria a pintar antes
do `<main>` por ordem de DOM, e a folha do perfil (`z-40`, dentro dela) perderia
para o botão de reabrir o tour (`z-30`, fora). É a mesma lição que o header do
celular já carregava escrita. Daí o `md:z-40` — e Modal (z-50), Toast (z-60) e
Tour (z-62) continuam por cima, como devem.

**E a colisão que a correção tornaria permanente:** o botão do tour é
`fixed md:bottom-6 left-4` — ele pousa em cima do rodapé da lateral. Antes isso
só acontecia com a página rolada até o fim; com a coluna presa na janela,
passaria a acontecer sempre. O botão foi para `md:left-[16rem]` (15rem da coluna
+ 1rem de folga). No celular não há lateral, e `left-4` continua valendo.

Provado com as seis classes conferidas no CSS compilado, porque o Tailwind não
reclama de classe que não sabe gerar — ele simplesmente não gera nada, igual à
lição dos tokens `-soft`.

---

## Item 5 — "Uso e cobrança", e quanto o sistema custou do que entrou (2026-09-30, migration 0190)

**Duas decisões que o dono não tomou, declaradas aqui:**

1. A aba **"Assinatura" virou "Uso e cobrança"**. Não existe mensalidade neste
   produto desde 24/08 — o dono paga por agendamento que o agente marcou. O nome
   antigo fazia a aba parecer um contrato a vencer em vez de um medidor. **A rota
   segue `/assinatura`**: ela é o destino do desvio de acesso bloqueado e do link
   que o dono recebe quando vence, e trocar a URL quebraria os dois.
2. A comparação é contra o **faturamento real** da barbearia (`sum(payments)` das
   comandas fechadas), não contra o "gerado pra você" que já estava na tela. São
   perguntas diferentes: "gerado" é a contribuição do agente; "% do faturamento"
   é a resposta para *isto é caro?*, que é a que o dono tem.

O rename foi atrás de **cinco textos da Ajuda**, do `hint` do painel do agente e
do cartão de ativação, todos mandando o dono "na aba **Assinatura**". Ajuda que
manda procurar o que não existe mais é pior que Ajuda nenhuma.

### O que a migration 0190 faz

`faturamento` na view `uso_do_sistema_no_mes`, na **mesma janela** do custo
(`date_trunc('month')` no relógio de São Paulo, cortada em hoje). No banco, e não
numa segunda consulta da tela, porque o percentual só é honesto se as duas pontas
vierem da mesma janela — e `new Date('YYYY-MM-DD')` em JavaScript é UTC, que no
Brasil volta um dia. Na virada do mês o numerador e o denominador falariam de
meses diferentes sem nada acusar.

### Dois achados do ensaio

- **View nova nasce com `select` para `anon`.** O `drop` + `create` devolve o
  privilégio pelo padrão do schema, e a view que estava no ar **não o tinha**. É
  inerte (como `anon`, `private.salon_ids()` volta vazio e a RLS não devolve
  linha), mas o estado mudaria calado. É a mesma armadilha do `create function`,
  agora documentada para view: o ensaio compara os grants antes e depois, um a
  um, e o `revoke all ... from anon` está no fim da migration. **Vale como
  regra:** toda recriação de view confere os grants contra os de antes.
- **O relógio de São Paulo já estava no dia seguinte.** O ensaio devolveu
  faturamento ZERO e um assert exigindo "maior que zero" denunciou: em São Paulo
  já era 01/10 às 00h49, enquanto a máquina de quem escrevia marcava 30/09. A
  view estava certa; o ensaio é que não provava nada. Sem esse assert eu teria
  dito "aplicado e conferido" sobre uma janela vazia.

### O que fica em aberto (decisão do dono)

- **No dia 1º o medidor mostra o mês vazio.** É o comportamento correto de um
  medidor mensal — e é o que a El Corte mostra agora mesmo: R$ 0, enquanto
  setembro fechou com R$ 35.341. A linha da proporção simplesmente não aparece
  (custo zero cala, por desenho). **Pergunta aberta:** quer que, quando o mês
  corrente ainda estiver vazio, a tela mostre a proporção do **mês fechado
  anterior**, rotulada como tal? Daria trabalho de verdade: `faturas_de_uso`
  congela `valor` e `valor_gerado`, mas não o faturamento da barbearia.
- **`PrivacidadePage` ainda diz "cobrança da assinatura por Pix".** Não mexi: é
  texto legal, e redação de documento legal é decisão dele, não minha.

### A catraca

`contaDoMes.ts` (módulo puro, 11 asserts) com a régua do arredondamento: nunca
"0%" quando o mês custou algo — o piso é "menos de 0,1%" —, vírgula e não ponto,
e a casa decimal só quando ela diz algo. E custo **acima** do faturamento é dito
na cara, sem verde: pintar 12% de boa notícia seria agrado na tela do preço.
`o_que_o_sistema_custou_do_que_entrou.test.sql` (7 asserts, rodado contra
produção) guarda a **janela**: comanda do mês passado fora, comanda aberta fora,
comanda sem pagamento fora, e cada barbearia somando a própria.


---

## Item 6 — o seletor de promover que sumia em silêncio (2026-09-30)

Na aba Equipe, o seletor de função (Barbeiro / Gerente / Dono) **desaparecia**
para alguns membros, sem nada explicando. A causa: dois motivos muito diferentes
caíam no mesmo `return null`.

```
if (!ehDonoDesta || !vinculo) return null
```

- `!ehDonoDesta` — quem olha é gerente. **Esconder está certo**: não é da conta
  dele, e a função já aparece como texto no subtítulo.
- `!vinculo` — o membro **não tem acesso ao sistema**. O dono *pode* promover,
  mas não existe quem promover. Sumir aqui é defeito: ele não tem como
  distinguir um seletor que nunca existiu de um que desapareceu.

Agora o segundo caso aparece **desabilitado, escrito "Sem acesso"** — a coluna
não dança de linha em linha, e a palavra liga o seletor morto à tarja do nome.

### O defeito que estava escondido atrás dele

A tarja "Sem acesso" olhava `!m.user_id`; o seletor olhava `!vinculo`. **Dois
critérios diferentes para a mesma pergunta** — e eles divergem num caso real:

`tirar_da_equipe` apaga a linha de `user_salons` e desativa o profissional, mas
**não limpa `professionals.user_id`**. Quem foi tirado da equipe fica com
`user_id` gravado e sem vínculo nenhum:

| O que a tela mostrava | O que era verdade |
|---|---|
| tarja "Inativo", **nenhuma** tarja "Sem acesso" | sem acesso ao sistema |
| nenhum seletor de função | sem função nenhuma |

E se o dono o **reativasse** no botão de ligar, a linha voltava com aparência
**perfeitamente normal**: sem "Inativo", sem "Sem acesso", sem seletor — e com
cadeira na agenda, sendo oferecido pelo agente no WhatsApp. Agora o critério é
um só: **tem vínculo ou não tem**, calculado uma vez por linha e usado nos
quatro lugares (tarja, subtítulo, seletor, botão de tirar).

O subtítulo também deixou de ficar mudo: sem vínculo ele diz **"Só atende na
agenda, sem login"** em vez de só a comissão, como se o papel fosse óbvio.

### Por que "Sem acesso" NÃO é um erro

Os quatro barbeiros da El Corte estão todos sem login — eles foram criados
direto no banco na amostra de demonstração. E isso é legítimo: barbeiro que
ocupa cadeira, aparece na agenda e é oferecido pelo agente, sem usar o CRM, é um
caso de uso real de barbearia. A tela passou a **dizer o estado** em vez de
sugerir conserto.

### ACHADO ADJACENTE, decisão do dono: convidar cria um barbeiro DUPLICADO

`accept-invite` faz **`insert`** em `professionals` — ele nunca procura um
profissional sem login para ligar ao convite. Então, hoje:

> O dono tem "João" na agenda, sem login. Convida João por e-mail para dar
> acesso a ele. João aceita. **Resultado: dois "João" na Equipe e duas cadeiras
> na agenda** — a antiga com todo o histórico, comissão e horários, e a nova
> vazia com o login.

**Foi por isso que o texto do seletor desabilitado não diz "convide a pessoa".**
Mandar o dono convidar seria mandá-lo direto para a duplicata — conselho pior
que silêncio. A tela diz o estado e para aí.

**O que falta decidir (não decidi sozinho):** qual é a régua de ligação. Por
nome é frágil (dois Joões, grafia diferente). Por telefone é mais firme —
`professionals.telefone` existe —, mas nem todo profissional tem um. E há a
pergunta de produto: ao ligar, o histórico vai todo para o profissional antigo,
ou o novo nasce zerado? Exige mexer no `accept-invite` (edge function, deploy
pela CLI, fora do pipeline da Vercel) e um pgTAP novo.

**Risco de agora:** ele está prestes a mostrar o sistema para clientes com os
quatro barbeiros sem login. Se tentar dar acesso a um deles durante uma demo,
vai aparecer um barbeiro repetido na tela.


---

## O barbeiro duplicado: o convite liga à cadeira que já existe (2026-10-01, migration 0191)

Achado ao consertar o item 6. `accept-invite` fazia **`insert`** em
`professionals`, sempre. Barbeiro que já ocupa cadeira sem login — ele atende,
aparece na agenda, é oferecido pelo agente no WhatsApp, e nunca abre o CRM — ao
receber acesso virava um **segundo** profissional:

> O dono tem "João" na agenda. Convida João por e-mail. João aceita. **Dois
> "João" na Equipe e duas cadeiras na agenda:** a antiga com todo o histórico,
> comissão e horários; a nova vazia com o login.

### A régua, que era a decisão em aberto

**Escolha explícita do dono no convite**, não casamento automático. Um campo novo
no modal — *"Essa pessoa já está na agenda?"* — e `salon_invites.professional_id`.

Por que não adivinhar:

- **Por nome** erra com dois Joões e com grafia diferente.
- **Por telefone** parece firme, mas nem todo profissional tem telefone, e número
  reaproveitado ligaria a pessoa errada.

E **ligação errada é pior que duplicata**: ela entrega o histórico, a comissão e a
agenda de alguém para outra pessoa. Duplicata o dono vê e conserta; ligação errada
ele não vê. Quem sabe se o "João" da agenda é o do `joao@gmail.com` é ele, e ele
já está olhando a lista quando cria o convite.

### As três travas, todas no banco

| Trava | O que impede |
|---|---|
| **FK composta** `(professional_id, salon_id) → (id, salon_id)` | apontar o convite para a cadeira de **outra barbearia** |
| **Índice único parcial** (`professional_id is not null and usado_em is null`) | dois convites **em aberto** disputando a mesma cadeira. O convite usado sai do índice: a cadeira precisa poder ser religada depois |
| **`on delete set null (professional_id)`** | o delete falhar. Sem o **recorte de coluna** o Postgres tentaria anular `salon_id`, que é `not null`, e o dono não conseguiria apagar um barbeiro com convite. Recorte existe desde o PG 15; o banco é 17.6, conferido |

### O que quase virou destruição de dados

O `catch` do `accept-invite` faz `delete from professionals`. Isso era seguro
enquanto o profissional era sempre recém-inserido. Com a ligação, uma falha
transitória apagaria a cadeira de uma **pessoa real** — e
`appointments.professional_id` e `commissions.professional_id` são
**`on delete cascade`**: iria embora o histórico inteiro dela.

O rollback agora **desliga** (`user_id = null`, `ativo` de volta ao que era) em
vez de apagar, e isso vale também no caminho do `deleteUser`, senão a linha
ficaria apontando para um login apagado.

Dois cuidados do mesmo tipo: na cadeira ligada, os serviços entram **só os que
faltam** (`professional_services` tem `UNIQUE (professional_id, service_id)` —
conferido; reinserir levantaria 23505 e derrubaria o aceite no catch) e a jornada
só é derivada **se ela não tiver nenhuma**, senão o expediente real de quem já
trabalha seria sobrescrito pelo horário da barbearia.

### Dois falsos alarmes meus, para registro

- **"anon lê todos os tokens de convite"** — ERRADO, e eu quase reportei. Vi
  `qual: true` para `{anon,authenticated}` e SELECT de tabela e deduzi. A policy é
  **RESTRICTIVE**: ela não concede nada, só proíbe `role = 'owner'` na escrita. A
  única PERMISSIVE exige `is_manager(salon_id)`. Provado com `set role anon`:
  **zero linha**.
- **"o grant de SELECT da coluna nova precisa entrar"** — não precisava: nesta
  tabela o SELECT é de tabela. Só o INSERT é por coluna, e esse sim era
  obrigatório.

### O que NÃO foi provado

**Não testei o aceite ponta a ponta.** Aceitar um convite cria conta e digita
senha, e isso eu não faço. O que ficou provado:

- a função no ar responde HTTP 200 lendo o convite com a coluna nova (ação
  `check`, que não cria nada) — convite de prova criado e apagado;
- o **efeito no banco** do caminho da ligação, ensaiado em produção com a cadeira
  real do Diego Matos: **4 profissionais e não 5**, 528 agendamentos, 7 jornadas e
  8 serviços intactos, e desligar não custou nada;
- as três travas, por pgTAP 7/7 contra produção.

**Falta a prova humana:** criar um convite ligado a um dos quatro barbeiros,
aceitar, e conferir que a Equipe segue com quatro pessoas e que a cadeira passou a
ter função. É o teste de dois minutos que só o dono pode fazer.


---

## Item 4 — importar planilha com colunas a mais (2026-10-01)

A régua acordada era "lê o que entende e **ignora o resto dizendo na cara o que
ignorou**". O que existia era a primeira metade: a importação achava quatro
colunas e descartava todas as outras **sem uma palavra**.

> O dono exporta do sistema antigo com Nome, Telefone, Email, CPF, Endereço,
> Última visita e Total gasto. Importa, lê "197 clientes importados" e acredita
> que veio tudo. Descobre meses depois, quando precisa do e-mail de alguém.

Agora a prévia mostra **O que o sistema leu** — campo por campo, dizendo de qual
coluna saiu — e, abaixo, o que fica de fora, **pelo nome**.

### O segundo defeito, do mesmo tronco

O casamento de títulos era **exato**. Uma planilha com `Nome Completo` levava
*"O arquivo precisa ter uma coluna Nome"* — tendo a coluna na cara. `Nome do
Cliente`, `Telefone 1` e `Data Nascimento` caíam igual, e são justamente os
títulos que um export de sistema de barbearia traz.

**A chave é que um conserta o outro.** Casar de forma generosa sozinho é
arriscado: `Nome do barbeiro` viraria nome de cliente sem ninguém ver. O que
torna a generosidade segura é **a tela mostrar o que foi usado para quê** — com o
mapeamento à vista, palpite errado é coisa que o dono corrige antes de clicar.
Por isso as duas coisas moram no mesmo módulo: quem casar sem mostrar
reintroduz o risco.

E o erro de "não achei o nome" deixou de ser beco sem saída: ele agora **lista os
títulos que vieram no arquivo**, então o dono vê qual renomear.

### Ignorar Email e CPF é correto, e isso foi conferido

`clients` tem exatamente quatro campos importáveis: `nome`, `telefone`,
`aniversario`, `observacao`. Todo o resto da tabela é estado do sistema
(reativação, opt-out, carimbos). Então não há onde guardar e-mail, CPF ou
endereço — a frase da tela ("o cadastro do cliente não tem onde guardar esses
dados") é verdade verificada, não desculpa.

**Deliberadamente NÃO foi feito:** jogar as colunas ignoradas dentro da
`observacao`. Seria dado de verdade preservado, mas CPF e endereço num campo de
texto livre que o barbeiro lê é pior que a perda.

### Os caminhos cobertos

| Caminho | O que acontece |
|---|---|
| colunas a mais | ditas pelo nome, até 4 e "e mais N" |
| `Nome Completo`, `Telefone 1` | reconhecidos |
| `Sobrenome`, `Nomeado` | **não** casam com `nome` — o palpite exige o título começar no candidato e terminar ali |
| `Telefone` e `Celular` juntos | vale `Telefone`; `Celular` entra nas ignoradas, onde é visto |
| dois títulos iguais | o segundo vai para as ignoradas |
| coluna sem título (`;` sobrando) | contada, não nomeada — "ignorei a coluna ''" não ajuda |
| nenhuma coluna de nome | erro **lista os títulos do arquivo** |
| só as quatro conhecidas | mostra as quatro, e nada em "fica de fora" |

**Fora:** nada foi feito para preservar os dados ignorados, por decisão acima.

### O bug que o teste pegou, e que vale mais que a feature

A segunda passada do casamento usava
`new RegExp(` + "`" + `^${candidato}` + "`" + `)` dentro de template literal. O limite de palavra
precisava de escape DUPLO e ficou com um só, virando o caractere **backspace** —
**a passada inteira nunca casou nada**. E treze dos catorze testes passaram
verdes em cima desse código morto, porque `Nome Completo` já casava na passada
EXATA: só o caso `Telefone 1` a exercitava.

Trocado por comparação de string, que não tem escape para errar. É a terceira vez
que escape duplo em regex dentro de heredoc/template me custa tempo neste
projeto.


---

## Os tres templates da fila de espera, submetidos a Meta (2026-10-01, migrations 0193/0194/0195)

O dono perguntou se dava para montar o aviso da fila como `utility` em vez de
`marketing`, "ja que o cliente solicita que avisemos". Resposta: **o pedido do
cliente nao decide**. A regra de 12/09 ja dizia que a Meta classifica por
intencao, e a submissao de hoje provou de forma incomoda quanto isso e verdade.

### Uma entrada na fila tem tres fins, e cada um ganhou template

| chave | nome_meta | o que diz | a Meta deu |
|---|---|---|---|
| `fila_vaga_abriu` | `vaga_que_voce_pediu` | abriu o horario pedido, reservado por X min, confirma? | **utility** |
| `fila_vaga_perdida` | `vaga_ja_preenchida` | o horario avisado foi preenchido; voce segue na espera | **marketing** |
| `fila_espera_encerrada` | `espera_encerrada` | o periodo pedido passou sem vaga; espera encerrada | **marketing** |

Ids na Meta: `1401421392139416`, `2213231590076636`, `1754010445665149`. Todos
`PENDING` na analise, e `ativo = false` no banco — nada envia.

> **Em 03/10 os tres sairam para `APPROVED`**, com as categorias desta tabela
> confirmadas. Ver "Os tres templates da fila foram aprovados, e o banco nao
> sabia", no fim do arquivo. `ativo` segue `false`.

### A armadilha que quase passou: a resposta da CRIACAO mente

O `POST` de criacao devolveu `category: UTILITY` **nos tres**. Minutos depois, o
`GET` da lista da WABA mostrou dois como `MARKETING`. A resposta da criacao ecoa
a categoria **pedida**; a real vem depois.

Eu ia relatar "os tres saíram utility" com base nela. So nao relatei porque fui
ler de volta. Virou regra em `docs/templates-para-a-meta.md`, com o curl.

### O que separou um do outro, e e util para os proximos

`utility` exige **transacao em curso**. O aprovado fala de uma vaga concreta,
reservada, e pede confirmacao — ha algo acontecendo. Os dois recategorizados
avisam que **nada** aconteceu: vaga perdida, espera encerrada. Aviso sem
transacao viva a Meta le como reengajamento, **mesmo com o cliente tendo pedido e
mesmo sem uma palavra de oferta no texto**. O botao "Quero esperar de novo"
provavelmente nao ajudou.

Vale notar que a familia `retorno_pedido*` (seis rascunhos) usa exatamente o
argumento "voce pediu para que te avisassemos" e pede `utility` — e **nunca foi
submetida**. Pelo que se viu hoje, a chance de ela voltar como `marketing` e alta,
porque nenhuma delas tem transacao viva. Submeter uma antes das seis.

### O que fica para o dono decidir

Os dois `marketing` **nao estao perdidos, estao caros** (~9x). Tres saidas, e a
escolha e dele:

1. **Deixar como esta e nao usar.** O caso da vaga perdida se resolve de graca:
   quando o cliente responde "quero" atrasado, a resposta dele abre a janela de
   24h e a recusa sai como texto livre **pelo numero CENTRAL, na Cloud API** —
   nao pela Evolution. Perde-se so o aviso proativo.

   **Correcao de 01/10, apontada pelo dono.** Eu havia escrito "pela Evolution",
   e estava errado: o cliente responde ao template, entao a resposta dele chega
   no numero CENTRAL. A Evolution e outro numero e nao tem como responder aquela
   conversa. O caminho certo e o que o projeto ja faz em `responder_lembrete`:
   resposta livre pelo proprio numero central, dentro da janela de 24h que a
   mensagem dele abriu. **Mas de graca nao e mais** -- ver a secao do 01/10
   abaixo: mensagem de servico passou a ser cobrada hoje.

   E se a conversa precisar do agente, o padrao tambem ja existe:
   `reagendar_central`. O comentario do `whatsapp-webhook` diz com estas
   palavras -- "Reagendar no numero central NAO vai ao agente: o agente mora no
   numero da barbearia (Evolution)" -- e a saida e o central responder com o
   `wa.me` da barbearia, mudando a conversa para onde o agente esta.
2. **Reescrever e resubmeter** amarrando a uma transacao viva — por exemplo, a
   vaga perdida citando a reserva que venceu. Palpite, e resubmissao errada gasta
   reputacao da WABA.
3. **Pagar marketing** nesses dois, que sao de baixo volume por natureza.

**Nao apaguei nenhum dos dois da WABA**: apagar e acao irreversivel no ativo dele,
e os dois estao inertes (`ativo = false`, e as views de envio filtram por
`aprovado`).

### A lacuna de estado que apareceu no caminho (0195)

`whatsapp_templates.status` so conhecia `rascunho` e `aprovado`. Entre os dois ha
um terceiro que dura dias: **submetido, esperando analise**. Sem ele, template
enviado para aprovacao era indistinguivel de template que ninguem tocou — e foi
sobre essa ambiguidade que a auditoria apurou "nenhum dos 25 foi submetido".
Entrou `em_analise` e a coluna `meta_template_id`, para perguntar o estado de um
template direto em vez de casar por nome.

### Um falso alarme meu, verificado antes de virar alarme

`whatsapp_templates` da INSERT e UPDATE **de tabela** para `anon`, o que parece
grave. Nao e: a RLS esta ligada e **sem nenhuma policy**, o estado mais fechado
possivel. Medido como `anon`: select devolve 0 linhas, update afeta **0**, insert
e recusado com 42501, e o corpo do `lembrete_hoje` ficou intacto. Segundo falso
alarme desta sessao evitado por medir linhas afetadas em vez de concluir de
"nao deu erro".


---

## As mudancas da Meta de 01/10/2026, conferidas na fonte primaria (2026-10-01)

O dono pediu para revisar o que muda em outubro na regra da janela de 24h. Lido
na pagina oficial de precos (`developers.facebook.com/docs/whatsapp/pricing`,
**atualizada em 28/09/2026**), nao em BSP nem em blog.

**Isto FECHA a lacuna L17 do `relatorio-tecnico.md`** ("Tarifas Meta
pos-01/10/2026 no Brasil -- doc baseado em fontes secundarias"). O que estava
registrado estava certo; agora esta confirmado e completo.

### A regra da janela NAO mudou. O preco mudou.

Palavras da Meta: *"Nao ha alteracao no momento em que a mensagem de servico pode
ser enviada. Ela ainda pode ser enviada apenas em uma janela de atendimento ao
cliente de 24 horas que e aberta e redefinida a cada mensagem do usuario."*

O que mudou a partir de **01/10/2026**:

| Mudanca | Antes | Agora |
|---|---|---|
| **Mensagem de servico** (texto livre dentro da janela) | gratuita desde 01/11/2024 | **cobrada**, a mesma taxa de utility/auth, por mercado |
| **Template utility em resposta ao usuario** (dentro da janela) | gratuito desde 01/07/2025 | **cobrado** |
| **Franquia** | nao existia para servico | **1.000 mensagens de servico entregues/mes, POR NUMERO** |

Detalhes que importam:

- A franquia **nao acumula**: 1.000 em outubro, 1.000 em novembro, o que sobrar
  morre.
- Entrega individual consome 1 unidade; envio em grupo consome **1 por
  destinatario**.
- O unico tipo de servico que segue gratuito para todos e **mensagem de reacao**,
  e ela nao conta na franquia.
- **O Brasil NAO esta nas listas de aumento nem de reducao.** A taxa BRL de
  utility/auth nao mudou; o que e novo no Brasil e servico passar a custar o mesmo
  que utility.
- Os niveis de volume agregam no nivel do **portfolio empresarial**, por par
  mercado-categoria (Brasil-utility, Brasil-auth...), nao por numero.

### A armadilha que ninguem tinha registrado

> *"Caso voce nao tenha uma forma de pagamento para sua conta do WhatsApp
> Business, a Meta entregara mensagens de servico dentro do nivel gratuito
> compartilhado, mas **nao as entregara depois que o nivel gratuito for usado**."*

Isso nao e custo, e **queda de servico**. Passadas as 1.000, as respostas ao
cliente simplesmente param de ser entregues. Combinado com o Error Workflow que
nunca funcionou e o SMTP quebrado, para em silencio.

### O que isso faz com o modelo hibrido deste projeto

**A franquia e POR NUMERO, e o projeto usa UM numero central para todas as
barbearias.** Entao 1.000 mensagens de servico por mes para a plataforma inteira,
nao por barbearia. O backlog ja previa; a fonte primaria confirma.

E corrige, pela segunda vez, a frase da saida 1 do template `vaga_ja_preenchida`:
a resposta livre pelo central dentro da janela **nao e mais gratuita**. Primeira
correcao foi o canal (Evolution -> central); esta e o preco.

O lembrete (`lembrete_hoje`), que e o maior volume, e template utility enviado
FORA da janela -- ja era cobrado, nao muda nada. Quem muda de lado e o
`responder_lembrete`: a resposta livre que ele devolve era gratuita e agora conta
na franquia.

---

## FALSO ALARME: o canal oficial NAO esta bloqueado (2026-10-01)

**A secao abaixo nasceu errada e fica aqui corrigida, nao apagada** -- o erro de
leitura vale mais guardado que escondido.

Eu li `GET /{waba}?fields=health_status` e reportei o canal como bloqueado. O
dono respondeu que em teste ele RECEBEU lembrete no numero dele pelo central. Ele
estava certo.

**O que eu li errado:** o `health_status` e relativo ao **App do token que faz a
chamada**. O token de `~/.clubcut/meta.env` e SYSTEM_USER do App Club Cut com
escopos `whatsapp_business_management` e `public_profile` -- **sem**
`whatsapp_business_messaging`. Conferido em `/debug_token`. Ou seja: o 141011
descrevia com precisao **o meu token**, que gerencia template e nao envia. Era a
resposta certa para a pergunta errada. E e provavelmente proposito de quem o
criou: menor privilegio para um token de catalogo.

**A prova de que envia:** `analytics` da propria WABA, de 01/06 a 01/10 --
14 mensagens, **100% entregues**, nenhuma falha:

| dia | enviadas | entregues |
|---|---|---|
| 22/08 | 2 | 2 |
| 23/08 | 8 | 8 |
| 10, 11, 13/09 | 1 cada | 1 cada |
| **16/09** | 1 | 1 |

**Por que silencio desde 17/09:** o fluxo `CRM Salao - Lembretes de Agendamento`
esta ATIVO, roda a cada 10 min, 1.318 execucoes todas `success` e cada uma dura
~80ms -- o tempo de consultar, nao achar nada e sair. Nao ha o que enviar.

**E nao vai achar: isso fui eu.** Os 130 agendamentos futuros da amostra estao
todos com `lembrete_enviado = true`, porque foi assim que eu os gerei.

**E o flag deve FICAR.** Os 120 clientes da amostra tem DDD **(39)**, que nao
existe no Brasil -- foi a garantia estrutural pedida pelo dono para nenhuma
mensagem escapar para numero de verdade. Limpar o flag faria o sistema tentar 130
envios para numero invalido, e envio para numero invalido derruba a nota de
qualidade do numero, que hoje esta **GREEN**. Para ver lembrete disparar numa
demonstracao, o caminho e **um** agendamento com o numero real dele na hora.

**Fica em aberto, sem conclusao:** `code_verification_status: EXPIRED` no numero
central. Nao sei quando expirou nem se atrapalha algo -- em 16/09 o envio
funcionava. Nao e para tratar como falha ate alguem tentar enviar e falhar.

**O que o episodio deixa de verdade:** nada no sistema olha o `health_status`, e
quando eu olhei, interpretei pelo token errado. Uma checagem na auditoria diaria
precisa usar um token COM escopo de envio, senao ela vai gritar bloqueio todo dia
pelo mesmo motivo que eu gritei.

<details><summary>O alarme original, preservado</summary>

## ~~O canal oficial esta BLOQUEADO para enviar~~ (lido errado)

Achado ao conferir a conta por causa da mudanca de tarifa, e vale mais que ela.
`GET /{waba}?fields=health_status` devolve:

```
can_send_message: BLOCKED
  WABA     975811062135581 -> AVAILABLE
  BUSINESS 334664782986386 -> AVAILABLE
  APP      1054189290929803 -> BLOCKED
     141011 The App does not have the required permissions to send/receive messages
     solucao da propria Meta: "Add the WhatsApp Business Messaging to your app."
```

E o numero central (`+55 41 8475-4172`, "Club Cut", CLOUD_API, qualidade **GREEN**,
throughput STANDARD) esta com **`code_verification_status: EXPIRED`**.

**Consequencia:** os tres templates da fila, mesmo aprovados, nao enviam. Nem o
lembrete, nem a avaliacao, nem o aviso de fim de teste. A WABA esta `ACTIVE` e
`APPROVED` e a qualidade esta verde -- isto nao e punicao, e **configuracao que
falta no App**.

**Para o dono fazer:** adicionar o produto *WhatsApp Business Messaging* ao App
1054189290929803 no painel de desenvolvedores, e reverificar o codigo do numero.
Nao mexi: e configuracao de app e de numero dele, fora do alcance do que foi
autorizado.

**Por que isso nao apareceu antes:** criar template e operacao de WABA e passou
sem erro -- os tres foram aceitos. Enviar e operacao de App. Ninguem tentou
enviar desde que o App perdeu a permissao, e nada no sistema olha o
`health_status`. O monitor cego que o relatorio tecnico ja apontava.

</details>


---

## Por que as mensagens saiam sem cartao, e o teste de entrega (2026-10-01)

O dono informou que **nao tem forma de pagamento na Meta** e mesmo assim recebeu
lembrete. Resposta tirada do `pricing_analytics` da propria WABA -- nao do
`conversation_analytics`, que nao devolve mais nada desde que o modelo por
conversa foi aposentado em julho/2025:

| Mes | pricing_type | categoria | volume | custo |
|---|---|---|---|---|
| agosto | FREE_CUSTOMER_SERVICE | SERVICE | 10 | R$ 0 |
| setembro | FREE_CUSTOMER_SERVICE | UTILITY | 3 | R$ 0 |
| setembro | REGULAR | UTILITY | 1 | **R$ 0,035** |

**Treze das catorze eram gratuitas**, e as duas gratuidades usadas **acabaram em
01/10**: servico dentro da janela e utility em resposta dentro da janela. A
decima quarta custou tres centavos e meio -- valor que a Meta entrega e acumula
sem exigir cartao adiantado.

Ou seja: nao e que nao haja cobranca. E que a conta era de R$ 0,035.

### O teste de entrega, autorizado pelo dono para o numero DELE

Fixtures com id `fade...` para apagar sem duvida: cliente, conversa e um
agendamento 90 min a frente. A execucao das 07:00:59 UTC durou **2,07s** contra
os ~80ms das rodadas vazias, e gravou:

- `lembrete_enviado = true`
- `lembrete_message_id = wamid.HBgMNTU0MTg0NzI5NzU0...`
- texto: "Oi, Saymon! Seu horario na *El Corte* e hoje as 05:27, com Diego Matos. Voce vem?"

O wamid decodifica para **554184729754** -- a Meta resolveu o numero e tirou o
nono digito, normalizacao brasileira padrao. **O canal oficial envia.** Confirma
em definitivo que o alarme de bloqueio era erro de leitura meu.

### O SEGUNDO motivo do silencio, achado montando o teste

O fluxo de lembrete exige uma linha em `whatsapp_conversations` -- o numero de
destino sai **dela**, nao da ficha do cliente -- e pula quem nunca escreveu
(decisao de 14/08). A tabela esta **vazia**. Entao, alem dos 130 futuros com
`lembrete_enviado = true`, **nenhum cliente da amostra receberia lembrete de
qualquer forma**. Dois motivos independentes, e o teste precisou vencer os dois.

Para demonstrar, o caminho e o mesmo do teste: um agendamento com o numero real
mais uma conversa para aquele numero.

### Ainda nao medido

O custo e a categoria da mensagem do teste -- que e a **primeira sob a tarifa
nova**. O `pricing_analytics` de hoje ainda vem vazio; a Meta atrasa horas.
Conferir depois: ela deve aparecer como REGULAR/UTILITY, porque saiu fora de
janela.

---

## A checagem de saude do canal, ligada (2026-10-01, migration 0196)

Pedido do dono depois do meu falso alarme. Tres casos na view
`auditoria_canal_oficial`, membro novo da `auditoria_pendente`:

| caso | gravidade |
|---|---|
| token que envia leu `pode_enviar <> AVAILABLE` | **grave** |
| leitura veio de token SEM escopo de envio | **aviso** -- o defeito e da CHECAGEM |
| nenhuma leitura em 26h, ou nunca | **grave** |

O segundo caso e o meu erro virando teste: sem ele a checagem gritaria bloqueio
todo dia, para sempre, pelo motivo errado -- e esconderia o bloqueio de verdade.

### Dois defeitos que o ensaio pegou antes de aplicar

1. **`distinct on` nao deterministico.** Duas leituras no mesmo instante
   (`now()` nao anda dentro de uma transacao) deixavam a view escolher
   arbitrariamente, e ela podia reportar a leitura ANTIGA como atual. Chave
   trocada por sequencial, com `id desc` no desempate.
2. **O pior:** recriar `auditoria_pendente` perdia o `security_invoker` (que eu
   esqueci de redigitar) **e** devolvia todos os privilegios para `anon` e
   `authenticated` pelo padrao do schema. Essa view cruza os achados de TODAS as
   barbearias: seria view de DONO, sem RLS, legivel anonimamente. As duas metades
   da armadilha do CLAUDE.md na mesma migration, e o assert de grants acusou.

pgTAP 11/11 contra producao. O alarme `canal-sem-checagem` esta ativo agora,
cobrando a primeira leitura -- a checagem funcionando antes de existir quem a
alimente.

### O que falta, e o desenho decidido

O no no n8n. Ele tem de usar **a mesma credencial que envia**, e a prova de que
usa sai sem nenhuma chamada extra e sem expor token: o `health_status` de um
token sem escopo de envio traz o App bloqueado **com erro 141011**
especificamente. Entao a regra do no e:

- APP bloqueado com **141011** -> `token_envia = false` (checagem cega)
- bloqueado por **qualquer outro motivo** -> `token_envia = true` (bloqueio real)
- tudo AVAILABLE -> `token_envia = true`

Os nos entram pendurados no gatilho da auditoria existente, em ramo PARALELO: a
checagem so ESCREVE a leitura, e quem avisa o dono continua sendo o caminho que
le `auditoria_pendente`. Desacoplados pelo banco, como todo o resto deste
projeto.


---

## O n8n nao alcanca `private` (2026-10-01, migration 0197)

As duas RPCs que eu criei PARA o n8n chamar nasceram em `private`:
`expirar_reservas` (0192) e `registrar_saude_do_canal` (0196). **Nenhuma das duas
era alcancavel por ele.**

O PostgREST so procura funcao no schema exposto. Pelo REST:

    PGRST202 -- Searched for the function public.registrar_saude_do_canal
                ... but no matches were found in the schema cache.

Enquanto `responder_lembrete`, que o n8n chama todo dia, esta em `public` e
responde 200. Conferido nas duas pontas.

**Por que nenhum ensaio acusou:** eles chamam pelo banco, onde `private` e
alcancavel. O pgTAP tambem. **So a chamada pelo caminho REAL revela** -- a mesma
licao do webhook do n8n em 11/09, quando a URL do `triggerInfo` nao era a URL de
verdade. Virou regra no CLAUDE.md, com o `notify pgrst, 'reload schema'`.

Corrigido por fachada em `public` (migration aplicada nao se reescreve), e a
fachada tem merito proprio: a implementacao segue em `private`, fora do alcance de
quem nao deve chamar, e o exposto e exatamente a assinatura do n8n. Provado pelo
caminho do n8n: 200 na varredura, 204 no registro, e **42501 para `anon`**.

---

## A checagem no n8n: ramo que so ESCREVE (2026-10-01)

Quatro nos pendurados no gatilho de 30 min da `CRM Salao - Auditoria do Agente`,
em ramo PARALELO ao do e-mail:

    Buscar Remetentes Oficiais -> Ler Saude da WABA -> Derivar Leitura -> Registrar

A checagem **nao avisa ninguem**: quem avisa e o ramo que le `auditoria_pendente`,
onde `auditoria_canal_oficial` ja e membro. Desacoplados pelo banco.

**A credencial e a MESMA dos nos de envio** (`WhatsApp account`,
`ZyNCe33Xa40SCApz`), e e esse o ponto inteiro: `health_status` e relativo ao App
do token que chama.

**Como o no sabe se o token enxerga envio, sem chamada extra e sem expor token:**
um token sem `whatsapp_business_messaging` devolve o App BLOCKED com o erro
**141011** especificamente. Entao:

- APP bloqueado com 141011 -> `token_envia = false` (checagem cega)
- bloqueado por outro motivo -> `token_envia = true` (bloqueio real)
- tudo AVAILABLE -> `token_envia = true`

**Dois cuidados de falha:** `onError: continueRegularOutput` nos dois HTTP, porque
queda da Meta ou do Supabase nao pode derrubar o e-mail da auditoria que corre em
paralelo. E o no de codigo devolve `null` quando a leitura nao serve -- sem linha
nova, a view alarma "sem checagem ha 26h". **Falha vira ausencia, e ausencia vira
alarme**, em vez de verde falso.

### Duas coisas que quase passaram

1. **O update ficou como RASCUNHO.** O `activeVersionId` continuava o antigo: o
   fluxo no ar era o de antes. Precisou `publish_workflow`. Editar fluxo pelo MCP
   e publicar sao passos separados, e nada avisa.
2. **A credencial dos nos HTTP nao entrou** pelo `addNode` -- o proprio MCP
   avisou ("skipped during credential auto-assignment"). Precisou de
   `setNodeCredential` numa chamada propria.

### Ainda nao verificado

A primeira execucao do ramo. A proxima rodada natural e dentro de 30 min; esta
rodando um observador na `auditoria_canal_oficial` para ver o alarme
`canal-sem-checagem` dar lugar ao que a leitura disser. **Nao executei o fluxo a
mao de proposito:** isso dispararia o e-mail da auditoria, e o SMTP esta quebrado
desde agosto -- eu trocaria uma verificacao por uma execucao com erro no historico.


---

## O WhatsApp pessoal do dono virou respondedor automatico (2026-10-01)

O dono conectou o WhatsApp PESSOAL dele na Evolution para testarmos a conversa do
agente, com a instrucao "nao envie mensagem para ninguem". Antes de testar,
verifiquei a corrente -- e ela estava fechada e armada:

- instancia Evolution `open`, perfil **"Saymon"**
- webhook `enabled` para `/webhook/salao-atendimento`, evento `MESSAGES_UPSERT`
- fluxo do agente **ativo**

**Nao existe porta filtrando o remetente.** Li as treze portas do caminho de
entrada, uma a uma: mensagem propria, provedor, tipo, instancia configurada,
conversa existe (ela CRIA para remetente novo), debounce, agente pausado, tipo
suportado, barbearia atendendo, roteamento -> envio. Nenhuma pergunta quem
mandou, e isso e por desenho: o agente existe para atender desconhecido, que e
cliente novo.

Consequencia: **qualquer contato pessoal dele que escrevesse recebia resposta de
barbearia.** Exatamente o que a instrucao proibia -- so que nao por mim, e sim
pelo sistema, ja ligado.

**O teste era impossivel sem violar a instrucao.** Toda mensagem que chega gera
uma saindo, e a porta `Ignorar Mensagem Propria?` fecha ate o atalho de ele ser os
dois lados: mensagem dele para ele mesmo e descartada.

**Decisao do dono, perguntado:** desligar o agente. Feito -- `active: false`,
conferido. Reversivel num clique.

### A varredura dos outros 15 fluxos ativos

Nenhum outro fala pela Evolution. Lembrete, avaliacao, reativacao e aviso de fim
de teste saem todos pelo numero CENTRAL, por desenho (a descricao do fluxo de
avaliacao diz com todas as letras: "NAO usa Evolution: conversa iniciada por nos
sai sempre pelo oficial"). O resto e e-mail.

E as quatro filas de envio estao **vazias**: `avaliacoes_a_pedir`,
`vencimentos_a_avisar`, `mensagens_a_entregar`, `reativacoes_a_enviar`.

### As quatro travas da amostra, todas conferidas

1. os 120 clientes tem DDD **(39)**, que nao existe no Brasil
2. os 120 tem **`recusou_contato = true`**
3. os 130 agendamentos futuros tem `lembrete_enviado = true`
4. `whatsapp_conversations` esta **vazia**, e e ela que da o numero de destino do
   lembrete

Qualquer uma sozinha ja impediria; sao quatro.

### Para o teste acontecer

O dono precisa de um **segundo numero** escrevendo para o numero conectado. A
trava de allowlist (filtro de remetente logo depois do webhook) esta desenhada e
pronta para aplicar quando ele disser qual numero liberar: todos os outros ficam
sem resposta automatica, e a conversa normal dele nao muda -- a Evolution copia a
mensagem, nao a consome.


---

## O teste da conversa do agente, sem mandar mensagem para ninguem (2026-10-01)

Ideia do dono, e ela resolve o impasse: simular a entrada pelo webhook e
DESABILITAR os nos de saida. O fluxo roda inteiro -- contexto, agente,
ferramentas, escrita no banco -- e nada sai.

Quatro nos desabilitados: `Responder pela Cloud API`, `Responder Padrao pela
Cloud API`, `Responder pela Evolution (Agente)` e `(Padrao)`. Nesse estado o
agente fica MAIS seguro que ligado normalmente: mensagem real de um contato e
lida e registrada, e ninguem recebe resposta.

**Simulei o formato REAL da Evolution**, nao o conveniente. Antes de disparar
conferi uma suspeita que teria invalidado o teste: o webhook espera payload plano
(`body.contact_phone`) e a Evolution manda `remoteJid`. Existe um no
`Adaptar Payload (Provedor)` entre os dois que reconhece as duas formas -- a
suspeita era infundada, e so olhando deu para saber.

### Turno 1: funcionou

> CLIENTE: Oi! Voces atendem sabado de manha? Queria cortar o cabelo.
>
> AGENTE: Oi! Atendemos sim. Me diz teu nome e se prefere so o *Corte masculino*
> ou algum outro do nosso catalogo. Ai ja te passo os horarios de sabado.

Consultou o catalogo (citou servico real), pediu o nome porque era cliente novo,
e nao despejou horario antes de saber o servico. 21 segundos.

### Turno 2: caiu, e NAO foi o corte de envio

    OpenAI: Rate limit reached for gpt-4o
    TPM: Limit 30000, Used 24656, Requested 12681. Try again in 14.674s.

**Esse e o achado que importa, e ele e de capacidade.** Cada turno do agente pede
~12,7 mil tokens, porque o contexto que o fluxo monta e grande -- da para ver na
lista de nos: cliente cadastrado, catalogo, barbeiros, horarios do cliente, saldo
de pacotes, produtos, historico da conversa.

Com teto de 30 mil TPM na organizacao, isso da **cerca de DUAS mensagens por
minuto para a plataforma inteira** -- nao por barbearia. Duas conversas
simultaneas ja raspam o teto.

### E o modo de falha e silencio

- o cliente escreveu e **nao recebe resposta nenhuma**
- `mensagens_a_entregar` ficou em **0**: a fila de reentrega NAO recupera este
  caso (ela cobre mensagem que nao chegou ao agente; aqui ela chegou e o agente
  falhou)
- e quem avisaria e o Error Workflow, que nunca funcionou

**Isso e bloqueador de prospeccao.** Nao e um defeito de codigo: e teto de conta
na OpenAI mais um contexto caro. As saidas, em ordem de esforco: subir o tier da
conta OpenAI; encolher o contexto (produtos e saldo de pacotes entram em TODO
turno, inclusive quando a conversa nao fala de produto); ou modelo mais barato
para os turnos simples.

### O que o agente escreveu antes de cair

Ele chamou a ferramenta `Criar Cliente` e criou "Pedro" -- entao a ferramenta de
escrita funciona. Zero agendamento (nao chegou la). Tudo apagado depois: 120
clientes, todos DDD (39), zero conversa, zero mensagem.

### Estado em que ficou

Agente **desligado** (como o dono escolheu) e os quatro nos de envio **devolvidos
ao normal** no rascunho. A ordem importou: desliguei ANTES de reabilitar os
envios, para nao existir nenhum instante com o agente ativo e a saida aberta.

---

## 2026-10-02 — O agente pergunta as vagas (0198), e um vazamento de WhatsApp

### Primeiro o incidente, porque é o que importa

Em **01/10 às 16:54 e 16:55 (SP)** o agente respondeu, **como barbearia**, a uma
pessoa real que escreveu para o WhatsApp **pessoal do dono** (`554187275895`,
"Samuel Rocha"). Duas mensagens saíram. O dono havia conectado o número dele na
Evolution para os testes e o agente foi religado a pedido dele em 01/10 07:39Z;
o número continuou conectado, e a conversa caiu no fluxo como se fosse cliente.

Está tudo registrado em `whatsapp_messages` (conversa
`52e3b731-54a4-40f7-942e-738962ba8fb2`) e nas execuções 45127–45134 do workflow
`rJO1n7cFeNDIJyB5`.

**O que foi feito na hora:** os quatro nós de envio (`Responder pela Cloud API`,
`Responder Padrao pela Cloud API`, `Responder pela Evolution (Agente)`,
`Responder pela Evolution (Padrão)`) foram **desligados e publicados** — o agente
continua lendo, pensando e gravando, mas **não sai mensagem para ninguém**. E a
conversa com aquele contato ficou com `agent_paused = true`.

**Pendente (decisão do dono):** religar os envios **só depois** que o número
pessoal sair da Evolution. Enquanto o número estiver conectado e os envios
ligados, qualquer contato pessoal dele recebe atendimento de barbearia.

A lição não é "faltou aviso" — o aviso foi dado. É que **número pessoal
conectado + agente ativo é uma combinação que não deve existir nem por uma
janela**, porque o custo cai em cima de terceiros que nunca pediram nada.

### A migration 0198, e por que ela não era "mais uma RPC"

O agente montava a lista de horários no **modelo**: `Listar Profissionais
Ativos` + `Jornada da Equipe no Dia` + `Verificar Disponibilidade` e então
procurava os buracos de cabeça. Isso ignorava folga entre atendimentos, bloqueio
do barbeiro (0182), fechamento da loja e a vaga `reservado` (0192) — e cobrava
**quatro voltas ao modelo por mensagem**.

A `horarios_livres` já respondia isso inteiro, com `professional_id`,
`profissional` e `hora_local`. Faltava uma coisa só: ela pede **duração em
minutos**, e o agente conhece serviços, não minutos. A `0198` fecha esse vão —
`horarios_livres_pelo_agente(salon, data, service_ids[], professional_id)` soma a
duração com o **mesmo bloco do `agendar_pelo_agente`** e devolve as horas
agrupadas por barbeiro. Dia sem vaga devolve o próximo dia que tem.

**Medido** (execução 45551 contra 44571): o nó do modelo caiu de **4x para 2x**
por mensagem, e uma ferramenta só rodou no lugar de quatro. A resposta ficou:
"10:40 com Vinícius Prado, 10:50 com Diego Matos, 13:40 com Thiago Bastos,
17:50 com Rafael Nogueira".

### Dois defeitos que só o teste de verdade mostrou

1. **O agente inventou o id do serviço.** Na primeira rodada mandou
   `service_ids_csv = "corte_masculino"` e o Postgres recusou (`invalid input
   syntax for type uuid`). O prompt mandava pegar o id em `Listar Servicos
   Ativos`, e ele não chamou. É o padrão já conhecido da casa: **fato que o
   agente precisa em toda conversa tem de estar no CONTEXTO, não atrás de uma
   ferramenta.** O `catalogo` do contexto passou a trazer `id=` ao lado do nome e
   do preço, e o prompt passou a mandar copiar dali.
2. **`horas_no_proximo_dia` repetia a mesma hora.** O ensaio devolveu
   "09:00, 09:00, 09:00, 09:00, 09:10, 09:10": as seis primeiras *vagas* eram a
   mesma hora em quatro barbeiros. Virou `distinct` antes do `limit`.

### Contradições que sobraram no prompt, para o passo 2

- A linha "Informe preco e **duracao** copiando do CATALOGO" briga com "Nunca
  diga a duracao ao cliente" — e o catálogo do contexto nunca teve duração.
- O prompt cresceu de 18.503 para 18.956 caracteres neste passo. O corte de
  verdade é o passo 2, junto com os exemplos de voz do dono.

### O teto da OpenAI continua sendo o bloqueador

A segunda rodada do teste caiu com `Limit 30000, Used 24895, Requested 8544` —
ou seja, **8,5 mil tokens por chamada do modelo**. Com 2 chamadas por mensagem
isso cabe; com 3 não cabe. Nada do que foi feito aqui remove o teto: só subir o
tier da conta (US$ 50 pagos levam a Tier 2) remove.

---

## 2026-10-02 — A voz do dono no prompt, e o id que o modelo inventa

### O que entrou

O prompt do agente foi reescrito com os **exemplos do proprio dono** como voz da
casa (os oito que ele devolveu em 01/10) e cortado de **18.956 para 14.865
caracteres** — 22% menor, com um script que confere **45 regras** uma a uma antes
de publicar, porque corte de prompt feito no olho perde regra sem ninguem notar.

A medida que justificou o corte: o erro de limite da OpenAI mostrou **8.544
tokens por chamada do modelo**, e o prompt sozinho era ~5.000 deles. Ja o
"contexto condicional" que estava no plano valia ~150 tokens (**menos de 2%**) e
**saiu do plano** — complicava o fluxo para nada.

Correcao do typo do dono: no exemplo 3 ele escreveu "Pode ser 15:30" e confirmou
"marcado para as 15:00". Como exemplo literal isso ensinaria o agente a mudar a
hora na confirmacao, que e o pior erro possivel aqui. Foi para 15:30.

### O defeito do id, que apareceu TRES vezes seguidas

O agente mandou, em chamadas diferentes, tres `professional_id` **inventados** —
`cc568809-...`, `7f50279f-...`, `2d84a6fe-...` — todos com cara de uuid de
verdade, nenhum existente. O `agendar_pelo_agente` recusou os tres com 42501
("Profissional nao e deste salao ou esta inativo") e **nada foi marcado**: a
tranca do banco fez o trabalho dela.

Mas a causa nao era o modelo ser teimoso. **A lista de barbeiros era calculada no
`Montar Contexto do Cliente` e nunca entrava no prompt.** O no montava a variavel
`barbeiros`, e a expressao `text` do `Agente de Atendimento` — que monta o
[CONTEXTO INTERNO] — nunca a referenciava. O modelo nao tinha de onde ler o id, e
chutava.

Isso ficou escondido enquanto `Listar Profissionais Ativos` existia como
ferramenta: ela devolvia os ids. Aposentar a ferramenta (0198) tirou a muleta e
expos o buraco.

Entraram tres coisas, nesta ordem de causa:
1. um bloco **[BARBEIROS]** no `text` do agente, com `id=` ao lado de cada nome;
2. `id=` tambem no CATALOGO (que resolveu o irmao desse defeito, o
   `"corte_masculino"`);
3. o parametro `p_professional_id` **saiu** da ferramenta `Horarios Livres`: ela
   devolve todos os barbeiros do dia e o agente filtra pelo nome na resposta.
   Parametro que o modelo preenche com uuid e superficie de alucinacao; tirar o
   parametro tira a superficie.

### Provado ponta a ponta

Cliente: *"isso, marca ai pra mim: Corte masculino amanha 13:40 com o Thiago"*.
Agente: *"Fechado, Gustavo! Te vejo amanha as 13:40 para o Corte masculino com o
Thiago. Qualquer coisa, e so chamar!"* — e o agendamento gravado com
`origem = 'agente'`, Thiago Bastos, 13:40-14:20, com `token_gestao`. Apagado
depois, junto com as conversas de teste.

Os quatro nos de envio ficaram **desligados durante todos os testes** e foram
religados ao final, com o numero pessoal do dono ja fora da Evolution
(`state: close`, conferido).

### Um erro meu que vale ficar escrito

Numa das edicoes eu reescrevi o `jsonBody` do `Criar Agendamento` e **removi sem
querer** o `.split(',').map(...).filter(...)` do `p_service_ids` — o que mandaria
uma string onde a RPC espera `uuid[]`. Peguei relendo o parametro inteiro antes
de culpar o modelo. Licao: ao trocar a DESCRICAO de um `$fromAI`, o alvo e a
string da descricao, nao a expressao em volta dela.

### Sobras conhecidas

- O agente ainda gasta uma mensagem perguntando "vou marcar pra voce?" quando o
  cliente ja pediu para marcar. A regra "escolher um horario JA E a confirmacao"
  esta no prompt; ele obedece quando o horario vem da lista dele, e hesita quando
  o cliente dita hora e barbeiro de primeira.
- `whatsapp_connections.status` continua `open` para a El Corte com a instancia
  fechada na Evolution: a tela de Conexao mente ate algo ressincronizar.
- Com "dar um tapa no corte" o agente assumiu *Corte masculino* em vez de mostrar
  os tres servicos com a palavra corte. A regra manda mostrar; a voz do dono
  (exemplo 1) manda assumir e perguntar so sobre servico extra. **Decisao do
  dono**, pendente.

---

## 2026-10-02 (tarde) — As duas regras que cobriam so o caminho previsto

As duas sobras do passo 2 eram o MESMO defeito: regra escrita para o caminho que
quem escreveu imaginou, deixando o modelo improvisar quando o cliente chega por
outra porta. E a regua 1 da casa aplicada ao prompt.

### Resolvido: o servico que o cliente nao detalha

A regra dizia "'quero agendar um corte' NAO diz o servico: mostre os que
servem". So que perguntar "qual dos tres cortes?" em todo pedido e formulario,
nao atendimento -- e o exemplo 1 do proprio dono assume o corte e pergunta so
sobre servico EXTRA.

A regra virou: **assuma o corte comum e DIGA o nome do que assumiu na mesma
mensagem** ("Pro *Corte masculino* amanha, tenho esses horarios"). Assim a
correcao sai de graca, porque o nome esta na frente do cliente. Pergunta so com
sinal de ambiguidade real: crianca ("pro meu filho"), barba junto, ou duvida
dele.

**Conferido em execucao de verdade**: "da pra marcar um corte amanha" ->
"Pro *Corte masculino* amanha...". Sem pergunta extra.

### NAO resolvido: ele pede permissao quando o cliente dita o horario

Quando o cliente dita dia, hora e barbeiro de primeira ("da pra marcar um corte
amanha 14:00 com o Thiago?"), o agente consulta a disponibilidade, confirma que
existe... e **pergunta** "vou agendar pra ti, beleza?" em vez de marcar.

**Tres tentativas, todas falharam:**
1. regra no prompt ("escolher um horario JA E a confirmacao") -- nao cobria quem
   dita de primeira;
2. regra ampliada ("pedido de marcar E a confirmacao, venha de onde vier...
   nunca pergunte 'vou marcar pra voce?'") -- ignorada;
3. a instrucao movida para a **descricao da ferramenta** `Criar Agendamento`
   ("CHAME ASSIM QUE o cliente pedir um horario concreto... nao pergunte
   permissao e nao confira disponibilidade antes") -- tambem ignorada. Ele
   continuou conferindo antes e perguntando depois.

**Diagnostico:** nao e redacao, e limite de obediencia do gpt-4o a instrucao
procedural negativa. Parar de insistir foi decisao consciente (regra das duas
tentativas).

**O que custa, medido:** UMA mensagem a mais, so no caminho em que o cliente ja
sabe a hora que quer. No caminho normal (o agente lista, o cliente escolhe) ele
marca direto -- isso esta provado. E o comportamento e SEGURO: ele nunca marca o
que o cliente nao confirmou.

**Decisao: aceitar por hora.** Revisitar quando a conta da OpenAI subir de tier e
der para testar um modelo que obedece instrucao procedural melhor. As saidas
descartadas, com o motivo: tirar a ferramenta de consulta (quebraria o caminho de
listar horarios) e detectar "marca + dia + hora" por codigo antes do agente
(fragil em linguagem natural, trabalho grande para economizar uma mensagem).

As duas regras novas ficaram no prompt de qualquer jeito: a do servico porque
funciona, e a de marcar porque esta certa mesmo sem ser obedecida sempre.

---

## 2026-10-02 (noite) — O onboarding do barbeiro, fechado (item 20)

O item 20 não era tour: era **confirmação**. O `accept-invite` entrega a cadeira
configurada por suposição — todos os serviços ativos ligados e a jornada
derivada do horário de funcionamento da barbearia — e nada na tela distinguia
"ele confirmou" de "ninguém olhou".

### O que foi medido antes de construir

- `professional_services` estava **populada e ninguém a lia** (0199 consertou a
  leitura).
- Não existia controle de serviço em lugar nenhum do produto, apesar de o
  comentário do `accept-invite` mandar "ajustar depois na aba Equipe".
- Os quatro barbeiros da El Corte faziam os oito serviços, inclusive
  "Luzes / platinado" a R$160.
- **Nenhum dos quatro tem login** (`user_id` em branco): ninguém nunca aceitou
  um convite como barbeiro nesta base.

### As quatro peças

| | onde | marca de "alguém escolheu" |
|---|---|---|
| leitura do vínculo | 0199, `horarios_livres_pelo_agente` | — |
| trocar a lista | 0200, `salvar_servicos_do_barbeiro` | `servicos_confirmados_em` |
| jornada | 0201, `salvar_jornada` | `jornada_confirmada_em` |
| telas | `ServicosBarbeiroModal` + `CardDoBarbeiro` | as duas acima |

A 0201 fechou um vão da 0200: eu dei a marca para a lista de serviços e **não**
para a jornada, que tem o mesmo problema. Sem ela o cartão mostraria a jornada
como pronta no primeiro segundo.

O stamp mora na RPC e não num trigger de propósito: trigger marcaria também o
insert do `accept-invite`, que é justamente o que não conta como escolha.

### Duas restrições reais que moldaram o cartão

1. **O barbeiro não tem a rota `/equipe`** (`somenteGestor` no AppLayout). O
   cartão abre os modais ali mesmo, na Agenda — levar para `/equipe` seria
   levar para uma tela que não abre para ele.
2. **Só aparece para quem não é gestor.** O dono costuma ter cadeira também, e
   veria dois cartões flutuantes no mesmo canto, um por cima do outro.

### O tripwire dos botões cobrou, duas vezes

O botão de Serviços na aba Equipe estourou o teto da `EquipePage` (11 para um
teto de 10). A saída da casa não é afrouxar o teste: as **cinco** ações da linha
eram o mesmo dialeto escrito cinco vezes e saíram para o `AcaoDaLinha`. O teto
da tela desceu de 10 para 6, e os componentes novos nasceram medidos
(`AcaoDaLinha` 1, `CardDoBarbeiro` 1, `ServicosBarbeiroModal` 0).

### O que fica em aberto

- **A primeira entrada não foi percorrida com os olhos.** Não existe conta de
  barbeiro nesta base. Para testar de verdade falta um convite de barbeiro para
  um e-mail do dono.
- **A trava na ESCRITA** (recusar agendamento com barbeiro que não faz o
  serviço, em `agendar_pelo_agente` ou num trigger em `appointments` cobrindo as
  quatro portas) continua de fora, de propósito: agora que existe controle para
  arrumar o dado, ela passou a ser possível — antes travaria a agenda de alguém
  sem o dono ter onde consertar.
- O `accept-invite` continua ligando todos os serviços. Isso agora é **padrão
  honesto** (a marca diz que ninguém escolheu), não mais um chute invisível.

---

## 2026-10-02 — O barbeiro que não vem no dia 20 (item 18)

O item, nas palavras do dono: *"se hoje o barbeiro informa que dia 20 ele não
conseguirá trabalhar, ele tem que ter uma opção de registro para que os
agendamentos sejam direcionados a outro barbeiro que irá trabalhar no dia"*.

### Metade já existia, e isso mudou o tamanho do item

Conferido antes de escrever qualquer coisa:

- **Bloquear o dia inteiro**: existe desde a 0182 — caixa "dia inteiro"
  (00:00–23:59) com motivo, no `NewAppointmentModal`.
- **Trocar o barbeiro de um agendamento**: existe no `AppointmentDetailModal`,
  que grava `professional_id` novo no reagendamento.
- **O banco já impedia** bloquear por cima de horário marcado: a
  `appointments_sem_sobreposicao` levanta 23P01, e a tela já traduzia como
  *"Esse intervalo já tem horário marcado para este profissional. Cancele ou
  remarque antes de bloquear."*

Ou seja: o item não era construir o registro da falta. Era **fechar o beco sem
saída que aquela frase cria** — o dono era mandado resolver e tinha de
adivinhar, agendamento por agendamento, quem trabalha naquele dia, faz aquele
serviço e está livre naquela hora. Três perguntas que o sistema sabia responder
e não respondia.

### O que entrou (0202 + `ConflitosDoBloqueio`)

`quem_pode_assumir(appointment_id)` responde as três. Usa o `horarios_livres`
**de propósito**: candidatura calculada por fora ofereceria gente que o trigger
da folga (0134) depois recusa com 23P01 — o dono clicaria num nome para levar
erro, que é pior do que não ter lista. Serviço entra pela régua da 0199.

Ela **não move nada**. Mover continua sendo o `update` da tela, com a EXCLUDE e
o trigger como última palavra: uma função que movesse teria de reproduzir as
duas, e duas cópias da mesma regra é como elas divergem.

Na tela, o 23P01 deixou de ser frase morta e passou a abrir o painel. Quando a
lista esvazia, o bloqueio é tentado na hora.

### Quatro lições do schema, cobradas pelo ensaio

A fixture do ensaio caiu quatro vezes, e **nenhuma** foi a função:

1. `trg_espelha_servico_principal` **já** grava o serviço principal em
   `appointment_services` — inserir de novo levanta 23505.
2. `bloqueio` não leva `client_id`: a EXCLUDE por **cliente** também conta esse
   status, e o mesmo cliente no mesmo minuto é recusado.
3. A "vítima" do teste de ocupado tem de sair da **própria resposta da função**:
   supor quem estava livre bateu na agenda real da El Corte.
4. O Supabase devolve relação embutida como **array** mesmo quando é
   uma-para-uma (`clients(nome)`) — o typecheck pegou antes de virar
   `undefined` na tela.

Nas duas rodadas anteriores (itens 20 e 0200) eu usei o CI como test runner e
reprovei duas vezes. Desta vez a fixture do pgTAP foi rodada contra o banco real
antes do push, e o CI passou de primeira.

### O que fica em aberto

- **O cliente não é avisado da troca**, e a tela diz isso (*"Quem conta é
  você"*). O aviso automático é mensagem iniciada pela plataforma e depende de
  template aprovado, que o dono decidiu não usar por hora. Quando usar, o molde
  mais próximo é o rascunho `imprevisto_na_barbearia`.
- **Ninguém livre naquele minuto** devolve lista vazia, e a tela manda falar com
  o cliente. Sugerir outro horário seria decidir pelo cliente; é aqui que a fila
  de espera (item 16) encosta.
- Nenhuma tela foi vista com os olhos em nenhum dos dois itens: não existe conta
  de teste com login neste ambiente.

---

## 2026-10-03 — A fila de espera, completa menos o aviso (item 16)

O item, do bloco decidido em 30/09: quem liga e não tem horário hoje vai embora
sem nada. A fila guarda o pedido e chama quando a vaga abre.

Entrou em `0203`-`0208`, sobre a reserva que a `0192` já tinha criado. A tela do
dono vai junto, e no n8n três ferramentas (`Entrar na Fila`, `Sair da Fila`,
`Confirmar Vaga da Fila`) mais um nó de contexto (`Fila do Cliente`). O aviso
automático **não** — o porquê está no fim.

### A decisão de projeto que dispensou o evento

A vaga abre de cinco formas: cancelamento, bloqueio removido, agendamento
movido, horário de funcionamento esticado, e reserva da própria fila vencendo.
Reagir a cada uma significaria cinco gatilhos, cada um com a mesma pergunta
embutida e cada um podendo divergir dos outros.

A `0205` **pergunta** em vez de reagir: `private.chamar_proximos_da_fila` roda a
varredura e faz uma pergunta só — *existe vaga que caiba nesta inscrição?* — pelo
`horarios_livres`, que é a mesma régua da agenda pública e do agente. As cinco
formas viram uma. O preço é a latência da varredura, que para "te aviso quando
abrir" não é preço nenhum.

A fachada `public.rodar_a_fila(limite)` existe porque o n8n só alcança `public`
(regra da `0197`).

### Duas coisas que eu desenhei erradas

**1. O CHECK proibia a frase mais comum do cliente.** A `0203` exigia as duas
pontas da janela de hora, com este comentário meu: *"ou a janela inteira, ou
nenhuma: só uma das pontas é um filtro que ninguém sabe ler"*. No teste, alguém
disse *"só consigo antes das 9"*. O agente leu certo, montou
`hora_de: null, hora_ate: '09:00'` — a tradução exata da frase — e o banco
recusou com 23514.

*"Antes das 9"* e *"depois das 18"* são as duas restrições que cliente mais diz.
E o mais revelador: a função que procura a vaga **já** tratava as pontas de forma
independente (`v_f.hora_de is null or ...`). Eu escrevi o código certo e a trava
errada, sem perceber que uma proibia o que a outra sabia fazer. A `0208`
afrouxou, nulo passou a significar **ponta aberta**, e a asserção do pgTAP que
guardava a regra errada virou o oposto.

**2. A fila sabia chamar e ninguém sabia dizer sim.** Esse apareceu *escrevendo a
instrução do agente*, não testando. Eu ia escrever *"se ele tiver vaga segurada,
confirme com Criar Agendamento"* — e isso criaria um **segundo** agendamento no
mesmo minuto para o mesmo cliente, que a `appointments_cliente_sem_sobreposicao`
recusaria com 23P01. O cliente diria "quero" e ouviria que não deu, com a vaga
dele na mão.

Nasceu a `0207`. O buraco não apareceu no ensaio nem no pgTAP porque os dois
testavam a **chamada**; escrever o passo a passo em português é que encontrou o
caminho de volta.

### Duas de fluxo, que só a conversa de verdade mostrou

**3. O nó de contexto novo matou a conversa.** O `Fila do Cliente` devolveu zero
linhas (o cliente não estava na fila) e **o n8n para o ramo quando um nó não
emite nada** — o agente nunca rodou. Todo nó de contexto irmão tem
`alwaysOutputData: true` e `onError: continueRegularOutput`; o meu não tinha
nenhum dos dois. Terceira vez que um nó de contexto com zero linhas custa uma
rodada.

**4. O agente foi mais cuidadoso que a minha regra.** Pedi domingo (fechado) e
ele respondeu *"a gente não atende aos domingos, que tal outro dia?"* em vez de
oferecer a fila — **o que está certo**: vaga nunca abre em dia fechado, e a fila
seria um telefone que nunca toca. Minha regra dizia só "dia sem vaga, ofereça a
fila". Corrigida para distinguir dia **cheio** de dia **fechado**.

### Três armadilhas de schema, cobradas pelo ensaio

1. `returns table (... appointment_id ...)` **sombreia a coluna** de mesmo nome:
   o `on conflict (appointment_id, ...)` levantou 42702. Renomear o OUT exigiu
   `drop function` antes (42P13).
2. A reserva nascia com a duração do serviço **principal** (40 min em vez de 70),
   liberando meia hora que não existe. `data_hora_fim` passou a ser explícito.
3. `status` e `reservada_ate` mudam na **mesma instrução**: o CHECK
   `appointments_reserva_com_prazo` exige prazo quando `reservado` e exige a
   ausência dele quando não. Mexer num sem o outro levanta 23514.

### O que a fila diz, e o que ela não promete

Nunca diz posição na fila nem quantos estão na frente. O agente não sabe: a
ordem depende do que cada um aceita, e número inventado é promessa que não se
cumpre. A inscrição também não garante horário, e o agente diz isso —
*"te aviso na hora que abrir"* é verdade, *"já está quase marcado"* não é.

Provado ponta a ponta na conversa: *"me avisa se abrir qualquer coisa essa semana
antes das 9"* virou `de 03/10 a 09/10`, `até 09:00`, Corte masculino, qualquer
barbeiro, `esperando` — com os quatro nós de envio desligados durante o teste e o
rastro apagado depois.

### O que fica em aberto

- **O aviso automático não existe**, e é a única peça que falta.
  **ATUALIZADO no mesmo dia:** os três templates foram **aprovados** pela Meta
  (`fila_vaga_abriu` como `utility`, os outros dois como `marketing`) — ver a
  entrada "Os três templates da fila foram aprovados, e o banco não sabia", no
  fim deste arquivo. O aviso deixou de depender da Meta; falta decidir quais
  ligar. Os três seguem `ativo = false`. Enquanto isso quem chama é o dono, pela
  tela — que mostra o telefone e diz, com letra, que o cliente não foi avisado.
- **`rodar_a_fila` não tem quem a chame, e isso é de propósito até o aviso
  existir.** Conferido na `devolver_chamados_sem_resposta`: chamada sem resposta
  grava `chamadas + 1` e **na segunda encerra a inscrição**. Com o varredor
  ligado e nenhum aviso saindo, o sistema chamaria alguém que não sabe que foi
  chamado, prenderia a vaga dele 30 minutos, repetiria, e **encerraria a
  inscrição de quem nunca foi contatado** — dando a vaga a mais ninguém no meio
  tempo. O agendamento no n8n só pode nascer junto do envio; a função está
  pronta e testada, e até lá roda à mão.
- **Nenhuma tela foi vista com os olhos.** Mesmo motivo dos itens 20 e 18: não
  existe conta de teste com login neste ambiente.
- Sem o aviso, a reserva de 30 minutos é um risco pequeno e aceito: ela segura
  um horário para alguém que ainda não sabe que foi chamado. Quando o template
  entrar, o prazo passa a valer de verdade e o número deve ser revisto.

---

## 2026-10-03 — Os três templates da fila foram aprovados, e o banco não sabia

Eu ia reportar ao dono que o aviso da fila seguia travado na Meta, com base na
submissão de 01/10. Fui conferir antes de afirmar, e **os três estão
`APPROVED`** — o `GET` da WABA de produção:

```
espera_encerrada        APPROVED  MARKETING
vaga_ja_preenchida      APPROVED  MARKETING
vaga_que_voce_pediu     APPROVED  UTILITY
```

O banco ainda dizia `em_analise` nos três. Dois dias de atraso bastaram para o
ledger passar a mentir, e **a mentira era a que mais custa**: ela diz "não dá
para fazer" sobre algo que já dá.

### O que isso muda no item 16

O aviso automático **deixou de depender da Meta**. O que falta é decisão sobre
quais dos três ligar, e são três coisas diferentes:

| template | a Meta deu | o que diz |
|---|---|---|
| `fila_vaga_abriu` | **utility** | abriu a vaga que você pediu, segurada por X min, confirma? |
| `fila_vaga_perdida` | marketing | a vaga avisada foi preenchida; você segue na espera |
| `fila_espera_encerrada` | marketing | o período pedido passou sem vaga; espera encerrada |

**O aviso que a fila precisa é o primeiro, e ele é `utility`.** Os outros dois
são cortesia — avisam que *nada* aconteceu — e `marketing` custa ~9x e conta
como reengajamento. Dá para ligar a fila inteira com o `utility` só, e decidir
os dois depois sem bloquear nada.

### O trinco, conferido antes de escrever no banco

A 0195 diz, com letra: *"só `aprovado` envia: as views de envio filtram por
ele"*. Então marcar `status = 'aprovado'` **não é anotação**, é mexer na porta.
Medido antes:

- as duas views de envio (`avaliacoes_a_pedir`, `vencimentos_a_avisar`) filtram
  `ativo` **e** `aprovado` — as duas condições, não uma;
- **nenhuma view de envio lê os templates da fila**, porque o remetente da fila
  não existe ainda;
- ensaio com `DO` + `raise exception`: 3 linhas mexidas, `ativo=true` entre os da
  fila = **0**, e as duas views de envio inalteradas (0 → 0).

Só então o `update` foi aplicado. `ativo` segue `false` nos três: ligar envio é
decisão do dono, não efeito colateral de arrumar um status.

### A lição, que é a mesma de sempre com outra roupa

Estado que vive fora do repositório (Meta, n8n, painel) **envelhece sem avisar**,
e o banco não é fonte de verdade sobre ele — é cópia, com a data em que foi
tirada. `status = 'em_analise'` parecia fato e era lembrança. A regra
*"verificar na ferramenta antes de qualquer afirmação"* já existe; o que faltava
era aplicá-la também ao que **eu mesmo** escrevi dois dias antes.

---

## 2026-10-03 — A ponte do botão da fila (0209), e como o sistema sabe de qual barbearia

O dono levantou o incômodo certo: *"o número que vai enviar a mensagem da fila é
o da nossa empresa; não fica estranho ele estar em contato com o número da
barbearia e receber o aviso de outro número?"*

### A resposta curta: fica, e já é assim — mas o problema real era maior

Medido antes de responder: `remetentes_oficiais` tem **uma linha só**
(`phone_number_id 1288009817732005`, WABA Club Cut), e o nó que o fluxo de
lembretes usa a lê com `ativo = true, limit 1` e **sem filtro de salão**. O
lembrete de cliente de qualquer barbearia já sai do número central — 1.855
agendamentos com `lembrete_enviado`, de 01/07 a 07/10. A divisão não seria criada
pela fila; ela já existe.

E o projeto já tinha batido nisso: há comentário no `whatsapp-webhook` dizendo
que *"Reagendar no número central NÃO vai ao agente: o agente mora no número da
barbearia (Evolution)"*, com uma ponte (`wa.me`) construída para aquele caso.

**O que estava de fato quebrado:** o clique no aviso da fila morreria. A edge
tentava `responder_lembrete`, tentava `responder_avaliacao`, testava opt-out, e
terminava em `console.error('clique no numero central sem lembrete nem
avaliacao')`. O cliente apertaria "Sim" no horário que pediu, **nada voltaria**,
e a vaga ficaria presa 30 minutos antes de ser dada a outro — pior do que nunca
ter avisado.

**Decisão do dono:** manter o envio pelo número central e **construir a ponte**.

### Como o sistema sabe de qual barbearia, com 10 barbearias

Pelo **wamid**, não pelo telefone. É o mecanismo que a `responder_lembrete` usa
desde sempre:

```sql
select * into v_ag from public.appointments where lembrete_message_id = p_message_id;
```

Cada mensagem enviada tem id próprio; no clique, a Meta manda `context.id` = o
wamid da mensagem respondida. Esse id aponta para **uma** linha, e o `salon_id`
vem de carona. Telefone não serviria: a mesma pessoa pode ser cliente de duas
barbearias, com dois avisos — só o wamid desempata. Está escrito no código da
edge: *"o banco resolve tudo, inclusive de qual barbearia é o agendamento"*.

A 0209 repete esse molde para a fila, com `fila_avisos.message_id` (mesma forma
do `avaliacao_pedidos.message_id`). **Tabela, e não coluna**, porque a mesma
inscrição é chamada mais de uma vez: com coluna, o aviso novo sobrescreve o
anterior e quem apertar num aviso **antigo** cai outra vez no `console.error`.

### Os três botões são os que a Meta aprovou

`vaga_que_voce_pediu` saiu com `Sim`, `Esse nao serve`, `Sair da espera`
(QUICK_REPLY, confirmado no `GET` da WABA). Botão novo exige submissão nova,
então a régua casa com esses três e mais nada — e o que não casa devolve
`atendido = false`, que é o que deixa o opt-out de LGPD seguir funcionando.
`"Sair da espera"` não colide com ele: o `ehPedidoDeSaida` compara a **mensagem
inteira** contra um conjunto exato.

### Um defeito que a ponte criaria, achado antes de criar

`Esse nao serve` devolve a vaga e mantém a inscrição esperando. Só isso seria um
**laço**: a `chamar_proximos_da_fila` seleciona `status = 'esperando'` **sem
carência nenhuma** (conferido no código), então a varredura seguinte ofereceria o
MESMO horário — e cada oferta é um template pago.

Regra nova: **nunca oferecer o mesmo início duas vezes à mesma inscrição**, por
`not exists` no `fila_avisos`. É a informação que o cliente deu virando regra, em
vez de um relógio arbitrário. Medido no ensaio: recusou 09:00, a chamada seguinte
veio 09:10.

E `chamadas` **não sobe** na recusa. O contador é de chamada **perdida**, e duas
encerram a inscrição; queimar ficha de quem respondeu encerraria a espera de quem
está participando — o mesmo dano de ligar a varredura sem aviso.

### Duas armadilhas de verificação, que valem mais que a feature

1. **O arquivo da migration e a produção divergiam.** Antes de emendar a
   `chamar_proximos_da_fila` eu comparei `prosrc` com o arquivo da 0205: 4.077
   caracteres contra 5.365. A diferença era só **comentário e espaço** (a versão
   aplicada no dia tinha ido sem comentários), provado normalizando os dois —
   mas eu só souberia disso conferindo. Retipar 160 linhas de memória é como
   cláusula some calada. A recriação da 0209 devolveu os comentários ao banco.
2. **`lower()` do Postgres não baixa acentuada maiúscula; o do Python baixa.**
   Minha receita de comparação usava `lower()` nos dois lados e acusou
   divergência falsa em `responder_vaga_da_fila` (`'ÁÀÂÃ...'` dentro do
   `translate`). Sem `lower()`, os três corpos batem. **A ferramenta de
   comparação também mente** — quando ela acusa, o primeiro suspeito é ela.

### O que ainda falta (e é só isto)

- **O remetente do aviso.** `rodar_a_fila` e `registrar_aviso_da_fila` estão
  prontas e testadas; falta o fluxo no n8n que varre, envia o
  `vaga_que_voce_pediu` e grava o wamid logo depois (molde do
  `Guardar wamid do Lembrete`). **A resposta não precisa de nada no n8n**: o
  `entregarAoN8n` posta sempre na mesma URL e o `Usar Resposta Pronta` manda
  `resposta` verbatim.
- O varredor segue desligado até o aviso existir, pelo motivo já registrado:
  chamar quem não é avisado encerra a inscrição de quem nunca soube.
- Os dois templates `marketing` (`vaga_ja_preenchida`, `espera_encerrada`)
  seguem `ativo = false`. A fila inteira funciona com o `utility` sozinho.

---

## 2026-10-03 — O remetente do aviso (0210 + fluxo no n8n): o item 16 fechado

Última peça do item 16. A fila agora tem as cinco: fundação (0192), a fila e as
portas (0203-0204), a chamada (0205), a tela do dono, o agente (0206-0208), a
ponte do botão (0209) e o remetente — **criado inativo, de propósito.**

### O destino saiu da régua que já existia (0210)

Escrevendo o fluxo eu precisei do telefone para mandar o template, e a
`chamar_proximos_da_fila` devolvia `c.telefone` **cru**. Fui ver como o fluxo de
Reativação monta o dele e achei `private.destino_whatsapp`: 10-11 dígitos ganham
o `55`, 12-13 passam como estão, qualquer outra coisa vira **nulo**. Montar
número no fluxo seria a segunda cópia da regra, e o comentário dela diz o defeito
que isso produz: *"somar outro 55 aqui"*.

Medido no ensaio: `41999990210 → 5541999990210`, e `554187275895` intacto.

### O nulo abriu um furo, e o furo não era o que eu supunha

Minha primeira fixture usou `'123'` como telefone ruim e **o banco recusou**: o
CHECK `clients_telefone_valido` já barra lixo na porta. Mas ele é
`telefone IS NULL OR private.telefone_valido(telefone)` — **nulo passa de
propósito**. Então o caso alcançável é cliente **sem** telefone: hoje 0 de 120, e
nada impede o próximo cadastro de vir sem número.

E sumir só do envio não bastaria: a inscrição seria chamada do mesmo jeito,
prendendo um horário por 30 minutos para quem nunca receberia o aviso, e duas
varreduras depois a `devolver_chamados_sem_resposta` encerraria a inscrição em
silêncio. Agora **quem não tem destino montável não é chamado** — fica
`esperando`, na tela do dono, que liga à mão.

`drop` + `create` porque acrescentar coluna em `returns table` muda a assinatura
(42P13, a mesma lição do `reserva_id`). `rodar_a_fila` não mudou: o `to_jsonb(c)`
da fachada pegou a coluna nova sozinho.

### O fluxo: `CRM Salão - Fila de Espera (Aviso de Vaga)` (`97Q7LLEdoI9uxS3Q`)

Molde do fluxo de Reativação, com **uma diferença deliberada: o gate do template
vem ANTES da varredura.**

No Reativação, o `Buscar Template Aprovado` fica depois de ler a fila — lá isso
é inofensivo, porque ler não muda nada. Aqui mudaria: `rodar_a_fila` **cria
reserva** e marca `chamado`. Com o gate depois, uma varredura com envio bloqueado
chamaria gente que nunca receberia aviso e, em duas rodadas, encerraria a
inscrição de quem nunca soube — o dano que já está registrado acima. Com o gate
antes, **`whatsapp_templates.ativo` é um interruptor só para as duas coisas**:
sem ele, nem varre nem envia.

### Dois trincos independentes, e o que ligar

O fluxo nasceu **inativo** (`active: false`, `activeVersionId: null`, conferido
lendo de volta) e o template segue `ativo = false`. Para ligar, nesta ordem:

1. `update public.whatsapp_templates set ativo = true where chave = 'fila_vaga_abriu';`
2. ativar o workflow no n8n.

Faltando qualquer uma, nada sai.

### O que ficou verificado, e o que não

**Verificado:** ensaio da 0210 em produção dentro de transação (só quem tem
destino é chamado; quem não tem fica `esperando/0`; destino normalizado nos dois
formatos); migration aplicada e o arquivo conferido contra `prosrc` por md5;
`destino text` no `pg_get_function_result`; ACL só para `service_role`; o fluxo
lido de volta nó a nó, com o gate antes da varredura e a saída de **erro** do
envio voltando ao loop (sem ela, uma falha de envio travaria o resto da rodada).

**Não verificado:** o fluxo **nunca rodou**. Tentei uma execução manual — segura,
porque o gate barra e a fila está vazia — e o sistema de permissões recusou, por
ser um fluxo que pode mandar WhatsApp. Não contornei. Então o gate está provado
**por leitura das ligações, não por execução**, e a primeira rodada de verdade
será a do dono.

**Também não verificado:** nenhuma mensagem desta fila jamais saiu, então o
caminho Meta → cliente → botão → edge → n8n → cliente não foi exercido ponta a
ponta em nenhum momento.

---

## 2026-10-03 — O backup foi restaurado pela primeira vez, e faltava um schema

O item estava aberto desde agosto como *"o único que pode acabar com o negócio
num dia"*, com a premissa **errada**: *"Supabase no plano gratuito, sem backup
gerenciado"*. A organização está no **Pro**, com **7 backups físicos diários**
(27/09 a 03/10, ~05:48 UTC = 02:48 SP), todos `COMPLETED`.

O que faltava não era backup: era **prova de que dá para voltar**.

### O caminho oficial custa US$ 9,99, e o de graça provou mais

A aba `Restore to new project` (Beta) clona para um projeto novo e **é paga**.
O dono não podia pagar agora, então o teste foi feito com Docker: `pg_dump` da
produção, Postgres 17 limpo num contêiner, restauração e comparação. Custo zero.

E vale dizer que o caminho de graça prova a coisa **mais** útil: não que o botão
da Supabase funciona (isso é infraestrutura deles), mas que **nós conseguimos
reconstruir a partir de um arquivo nosso** — garantia que não depende de pagar
nem de eles estarem no ar.

### O achado: sem `--schema=auth`, quatro tabelas perdem tudo

Primeira tentativa, dumpando só `public` + `private`: **17 erros**, e quatro
deles eram violação de chave estrangeira contra `auth.users`:

```
user_salons.user_id          <- o vinculo entre o login e a barbearia
termos_aceites.user_id
notificacoes_vistas.user_id
cash_registers.aberto_por
```

O banco subiria inteiro e **ninguém conseguiria entrar na própria barbearia**.
Um dump que "deu certo" e uma restauração que parece completa — e o sistema
inutilizável. **Só restaurando isso aparece.**

Com `--schema=auth` incluído: **1 erro**, e é `schema "public" already exists`,
inofensivo.

### A comparação, e por que ela inclui os grants

As duas pontas idênticas — 51 tabelas, **10.456 linhas**, 288 funções, 51 com
RLS, 66 policies, e os **dois md5 batendo**: contagens e **grants por coluna**.

O md5 dos grants está na receita de propósito: `salons` dá UPDATE **por coluna** e
`salon_invites` dá INSERT **por coluna**. Uma restauração que trouxesse as linhas
e perdesse esses privilégios **pareceria certa** e derrubaria telas inteiras — é a
lição de 30/09 (o dono não salvava o horário de funcionamento) voltando por outra
porta.

Também por isso os papéis (`anon`, `authenticated`, `service_role`,
`supabase_admin`…) são criados **antes** de restaurar: sem eles a única saída
seria `--no-privileges`, que joga fora exatamente o que importa medir.

### O roteiro virou arquivo

[`docs/recuperacao.md`](recuperacao.md), com os comandos, o preparo do alvo (os
papéis, `btree_gist` para as travas EXCLUDE, `extensions.gen_random_bytes`, os
stubs de `cron`), o SQL da comparação e os números medidos.

### O que continua sem prova, agora nomeado

- **PITR desligado** (`pitr_enabled: false`): a perda máxima num desastre é o que
  entrou entre 02:48 e o incidente, até ~24h. É add-on pago, e é a única alavanca
  que diminui esse número.
- **O botão `Restore` da Supabase nunca foi usado** — e restaurar por cima da
  produção derruba o projeto durante o processo, então não é coisa de testar por
  curiosidade.
- **A volta completa nunca foi ensaiada junta**: banco + 12 edges + segredos do
  Vault + configuração de Auth + fluxos do n8n. O roteiro cobre a primeira parte.
- **Backup de banco não leva Storage** (a tela avisa). Hoje custa zero — o
  projeto tem zero buckets. Passa a custar quando a logo por barbearia existir
  (item 17).

### Higiene

O dump leva nome e telefone dos 120 clientes e, com `auth`, os **hashes de
senha**. Ficou na pasta temporária da sessão, **fora do repositório** (que é
público), e o contêiner foi removido ao fim — conferido.
## 2026-10-03 — O painel do item 18 nunca funcionou, e o dono achou na primeira tela

O dono abriu a Agenda com o login de teste, tentou bloquear o dia inteiro de um
barbeiro que tinha horários, e viu isto:

> **Tem 0 horários marcados nesse dia.** Passe cada um para outro barbeiro ou
> cancele. Só depois o dia pode ser bloqueado.
>
> ⚠ Não foi possível ler os horários desse dia.

Dois defeitos meus na mesma tela, e eu tinha entregue o item 18 dizendo que a
frase morta virara painel.

### 1. A consulta falhava SEMPRE (PGRST201)

```js
.select('id, data_hora_inicio, clients(nome), services(nome)')
```

Existem **dois** caminhos de `appointments` para `services` — a FK direta
(`appointments_service_id_fkey`) e a tabela de junção (`appointment_services`).
O PostgREST não escolhe sozinho: devolve **PGRST201**. Não é intermitente, não
depende de dado, não aparece só em produção: **o painel nunca leu nada, nenhuma
vez.**

Reproduzido pelo caminho real (REST com a chave de serviço) antes de qualquer
conserto. Com `services!appointments_service_id_fkey(nome)`, volta certo.

**E a regra já estava escrita no próprio repositório**, num comentário do
`useAgendaData.ts` desde a 0120: *"é OBRIGATÓRIO"*. Todos os outros cinco lugares
usam a FK nomeada. Eu escrevi o sexto errado. **Comentário não segura regra.**

### 2. Erro de leitura e contagem apareciam juntos

O aviso com a contagem renderizava **incondicionalmente**; sob erro, `conflitos`
era `[]` e a tela dizia *"Tem 0 horários"* — pedindo uma ação sobre um número que
ninguém conseguiu ler — com o erro logo abaixo. É a mesma família do *"R$ 0,00
para quem só está sem rede"*, que o `ErroDeCarga.test.ts` existe para impedir.

O componente estava **fora** daquele tripwire, porque ele cobria as cinco
*páginas* (que usam o banner `ErroDeCarga`) e este é um *painel* de modal (usa
`ErroInline`). A classe de defeito é a mesma; a catraca não alcançava.

Agora `erroLeitura` é estado separado de `erro` (ação), e sob erro de leitura o
painel **sai cedo**: só o erro e um "Tentar de novo". A lista também é limpa —
lista velha embaixo de um erro é a mesma mentira.

### As duas catracas que nasceram disso

- **`src/lib/servicoEmbutido.test.ts`** — varre todo `src` por `import.meta.glob`
  (arquivo novo entra sozinho, sem lista para alguém esquecer de atualizar) e
  reprova qualquer `services(` dentro de um select de `appointments`. **Provada
  nos dois sentidos:** passa com o conserto e **reprova quando o defeito é
  reintroduzido de propósito** — teste que não pode falhar não testa nada.
  Ignora comentários, senão acusaria o próprio arquivo que documenta a lição.
- **Bloco novo no `ErroDeCarga.test.ts`** para os *painéis*: `ConflitosDoBloqueio`
  e `FilaDeEspera` precisam do `return` cedo sob erro de leitura.

### O que isto diz sobre as outras entregas

`FilaDeEspera` foi conferida no mesmo dia: a consulta dela é **válida** (um
caminho só de `fila_de_espera` para cada relação, medido pelo REST) e o estado de
erro dela **já saía cedo**. O defeito era só do painel de conflitos.

Mas a lição maior é outra, e vale mais que as duas catracas: **os itens 20, 18 e
16 foram entregues com "verificado por leitura", porque não havia login de
teste.** O primeiro item que foi aberto por olhos humanos tinha um defeito de
100% de reprodução. Ler o código prova que ele faz o que está escrito; não prova
que o que está escrito funciona.

---

## 2026-10-03 — A reserva vencida não tinha quem a apagasse (0211)

Achado por acaso, conferindo o `cron.job` antes de inserir uma inscrição de teste
para o dono revisar o item 16: **nada chamava `expirar_reservas`.** Nenhum dos
sete jobs, nenhuma tela, nenhuma edge, nenhum fluxo do n8n — procurado nos
quatro.

E a história explica como passou: a `private.expirar_reservas` nasceu na **0192**,
a **0197** criou a fachada `public.expirar_reservas` **justamente para o n8n
poder chamá-la**, e o chamador nunca foi construído. Cada peça assumiu que a
outra ligaria o fio. Código morto cuja ausência quebrava a fila inteira.

### O que estava quebrado, e eram três coisas ao mesmo tempo

A `devolver_chamados_sem_resposta` diz no próprio comentário que reconhece quem
não respondeu pela **ausência** da reserva (`chamado` com `appointment_id` nulo,
pela FK `on delete set null`). Sem ninguém apagando:

1. quem fosse chamado e não respondesse ficaria `chamado` **para sempre** — nunca
   voltaria para a fila, nunca seria chamado de novo, nunca encerraria;
2. a reserva ficaria `reservado` **para sempre**, e a `horarios_livres` **não olha
   `reservada_ate`** (conferido) — o horário ficaria bloqueado para todo mundo:
   agenda pública, agente e CRM;
3. e se a pessoa respondesse "Sim" depois do prazo, a `confirmar_vaga_da_fila`
   recusaria com *"O prazo da reserva venceu"* — perderia a vaga, a vaga seguiria
   bloqueada, e ela seguiria presa.

**O prazo de 30 minutos era decorativo: ninguém o fazia valer.**

Nada disso mordeu porque o remetente está desligado e não havia reserva viva.
Mordia no dia em que fosse ligado — e esse dia é o dono apertar dois
interruptores.

### O conserto

`rodar_a_fila` ganhou a expiração como **primeiro** passo, e passou de três para
quatro. A ordem agora importa duas vezes: apagar a reserva **antes** de devolver
(é a ausência dela que sinaliza "não respondeu"), e devolver **antes** de chamar
(a que chama só enxerga `esperando`).

Dentro do tique, e não num job novo, de propósito: quem agenda o remetente agenda
tudo. **Um job separado seria uma segunda coisa para alguém lembrar de ligar — e
foi exatamente esquecer de ligar que criou este defeito.**

A `horarios_livres` **não** mudou. Ela é a régua que a agenda pública, o agente e
o CRM usam, e mexer nela para cobrir atraso de varredura seria tratar o sintoma
no lugar mais caro do sistema. Com o tique a cada 10 minutos, uma reserva fica no
máximo ~10 minutos vencida.

### Medido, não deduzido

O ensaio provou o defeito **e** o conserto na mesma transação: com a reserva
vencida e **sem** expirar, a inscrição ficou presa em `chamado` e a reserva
continuou existindo; com o tique novo, `reservas_expiradas=1`, a reserva sumiu, a
pessoa foi devolvida (`devolvidas=1`) e chamada de novo. Duas asserções novas no
`a_fila_que_chama.test.sql` (12 → 14).

### A forma do achado vale mais que o achado

Isto não apareceu testando a fila, nem lendo a 0205. Apareceu porque eu fui
**conferir o cron antes de inserir dado de teste** — uma checagem lateral, feita
por cautela, sobre uma coisa que eu não suspeitava. É o terceiro defeito do dia
achado assim: a régua do destino (0210) veio de precisar do telefone, e o PGRST201
veio do dono abrir a tela.

---

## 2026-10-04 — Dois achados do dono na revisão: o cancelamento e o dia inteiro

### 1. Cancelar uma vaga segurada era recusado (0212)

O dono tentou apagar a inscrição de teste pela tela do agendamento e levou
*"Essa operação não é permitida porque deixaria um dado inválido"* — o CHECK
`appointments_reserva_com_prazo` (0192):

```
(status = 'reservado' AND reservada_ate IS NOT NULL)
OR (status <> 'reservado' AND reservada_ate IS NULL)
```

A tela faz `update appointments set status = 'cancelado'` e mais nada. Medido,
não deduzido: com só o status, **23514**; com os dois campos juntos, passa.

**E eu já sabia disso.** Está escrito na 0207, onde a `confirmar_vaga_da_fila`
muda os dois na mesma instrução *"porque o CHECK exige o par"*. Tratei o caso da
fila e deixei os outros — e os outros são cancelar (dois botões), faltar,
concluir e remarcar, por quatro portas.

O conserto não foi na tela: foi um gatilho `before insert or update` que zera
`reservada_ate` sempre que a linha não está em `reservado`. Caller por caller é a
forma de errar o próximo; **o próximo já existia e ninguém tinha visto**, porque
a fila nunca tivera uma reserva viva numa tela de verdade. O CHECK continua sendo
a garantia; o gatilho é quem a cumpre.

Ensaio em produção, cinco pontos: reserva viva mantém o prazo, cancelar só com o
status passa, `faltou` passa, `agendado` passa, e nascer `agendado` com prazo é
normalizado em vez de recusado. pgTAP da 0192: 10 → 13.

### 2. "Dia inteiro" deixava as 23:59 abertas

O dono: *"clico em dia todo e ainda assim é possível realizar um agendamento
para aquele dia"*.

Primeiro a investigação derrubou a hipótese óbvia: o `DIA_INTEIRO` está certo
(`00:00`–`23:59`), o modal usa a janela certa, e a trava de sobreposição do banco
**inclui** `bloqueio`. Então medi.

Com um bloqueio de dia inteiro num dia sem nada marcado, os horários livres
caíram de **59 para 1** — não para zero. O que sobrava era exatamente o que
**começa às 23:59**.

A causa é o intervalo do banco ser `[início, fim)`: um bloqueio que **termina**
às 23:59 não se sobrepõe a um horário que **começa** às 23:59. O dia inteiro
precisa terminar na meia-noite **seguinte**.

`fimDoDiaInteiro` foi para o módulo puro `janelaDeBloqueio.ts` — e não ficou
dentro do componente — justamente para poder ser testada: quatro testes novos,
incluindo virada de mês e de ano, e um que afirma que o fim passa das 23:59. Usa
`setDate`, não soma de 24h em milissegundos: virada de fuso é com o calendário.

Nos campos da tela o fim continua 23:59. *"Termina à meia-noite do dia seguinte"*
é verdade de banco, não frase para quem está marcando uma folga.

### O que os dois têm em comum

Nenhum dos dois apareceu em teste automático, e os dois estavam em código que eu
tinha declarado pronto. **Os dois precisaram de um humano abrindo a tela** — o
primeiro dia em que isso aconteceu rendeu três defeitos (este, o PGRST201 e o
dia inteiro), todos de reprodução garantida.

---

## 2026-10-04 — O "dia inteiro" que só falhava quando havia agendamento

O conserto anterior (fim na meia-noite seguinte) estava certo e **não era o
defeito que o dono via**. Ele voltou com a observação que resolveu tudo:

> *"se o barbeiro não tem nenhum agendamento no dia, o bloqueio funciona para o
> dia todo"* — a falha era só quando havia agendamento e ele passava para outro
> barbeiro pelo painel.

Essa fronteira é a assinatura de um **fechamento congelado**, e era:

```ts
const limparConflitoETentarDeNovo = useCallback(() => {
  setConflito(null)
  void salvarBloqueio()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

Lista de dependências vazia guarda a `salvarBloqueio` do **primeiro render** —
quando `diaInteiro` ainda é `false` e `time`/`horaFim` são os valores de abertura
do modal. Dia vazio salva direto, com o fechamento atual, e funciona. Dia com
agendamento passa pelo painel, e o reenvio automático vem por aqui: **bloqueio de
60 minutos no horário clicado**, com a caixa marcada na tela.

Confirmado nos dados: as duas linhas que ele gerou testando eram `10:00–11:00` e
`09:00–10:00`, **60 minutos cada**.

### O comentário que me convenceu era falso

Junto do `eslint-disable` havia esta justificativa, minha:

> *a identidade precisa ser estável porque vai como prop para o painel, e
> `salvarBloqueio` lê o estado fresco a cada chamada*

**A segunda metade é mentira.** `salvarBloqueio` é recriada a cada render; a que
o `useCallback` guardou é a do primeiro, e ela lê o estado daquele render. O
defeito passou por revisão porque o comentário explicava com segurança uma coisa
que não acontece.

### As duas defesas se anularam

Eu havia construído, no `ConflitosDoBloqueio`, uma `onVazioRef` **exatamente**
para o pai poder passar função nova a cada render sem disparar laço de consulta.
E então memoizei no pai assim mesmo. A defesa de lá tornava o `useCallback`
dispensável; o `useCallback` tornava a defesa de lá inútil. Duas proteções, zero
proteção.

O conserto é a função comum. A catraca (`janelaDeBloqueio.test.ts`) afirma duas
coisas sobre a fonte do modal: que o reenvio **não** é memoizado e que o arquivo
**não** silencia `exhaustive-deps` — e foi provada nos dois sentidos, passando com
o conserto e reprovando com o defeito reintroduzido.

A catraca é por arquivo de propósito: suprimir `exhaustive-deps` tem uso legítimo
em efeito de montagem, e sete arquivos do projeto o fazem. Neste, não — é
justamente o aviso que teria evitado isto.

### Um aviso de lint que apareceu junto, e não é meu

Removido o `useCallback`, o oxlint passou a analisar o componente e acusou
`Date.now()` durante o render (`react(purity)`), numa linha **pré-existente e
intocada** (`horarioJaPassou`). O aviso está certo sobre o código; o
comportamento não mudou. Fica registrado em vez de silenciado — silenciar aviso
foi o que criou o defeito acima.

---

## 2026-10-04 — A folga do barbeiro: o desenho fechado com o dono

Pergunta dele, depois de o bloqueio de dia inteiro funcionar: **e numa barbearia
de um barbeiro só?** E a seguir, o caso que quebra tudo: *"hoje é dia 4, surge um
imprevisto, no dia 7 ele não pode trabalhar — e tem 10 agendamentos"*.

### O que o levantamento mostrou

- O `quem_pode_assumir` procura *"outros barbeiros ativos do salão"*. Com um
  barbeiro só, a resposta é **sempre vazia, por definição** — e a frase da tela
  (*"ninguém está livre nesse horário"*) sugere coincidência de agendas, quando a
  verdade é "você é o único".
- A agenda pública separa "fechado" de "lotado" pela **jornada semanal**, não
  pelos bloqueios. O dia de folga do barbeiro solo apareceria como **lotado** —
  e o cliente espera uma desistência que não pode existir.
- **Não existe conceito de dia fechado por data**: `horario_funcionamento` é só
  por dia da semana.
- Mas **o cliente já sabe remarcar sozinho**: a edge `agenda-publica` tem
  `remarcar_horario` e `cancelar_horario` pelo `token_gestao` (0176), e a página
  já mostra o WhatsApp da barbearia.

### O problema real não era mover 10 pessoas

Era que **o dia 7 continua enchendo enquanto ele tenta esvaziá-lo.** O bloqueio é
recusado enquanto houver agendamento no caminho (23P01), e nesse meio tempo a
agenda pública e o agente seguem oferecendo o dia — porque nada disse a eles que
ele fechou. Hoje **"fechar para novos" e "resolver os que existem" são a mesma
ação**, e só com antecedência isso aparece.

### O desenho aprovado

1. **Folga que não colide** — uma linha (barbeiro + dia) que o `horarios_livres`
   subtrai, **sem** ser agendamento. O dia para de ser oferecido no instante em
   que é marcado, nas quatro portas, e os agendamentos existentes continuam lá
   para serem resolvidos com calma. O bloqueio de hoje segue servindo para o caso
   pequeno (almoço, duas horas, dia já vazio).
2. **Aviso escalonado**, do horário **mais cedo para o mais tarde** (decisão do
   dono). É a fila de espera ao contrário, e reusa o mesmo motor: prazo por
   pessoa, e o seguinte é avisado quando o anterior resolve.
3. **Um aviso só** (decisão do dono): quem não remarca perde o horário sem novo
   aviso. *"Ele foi avisado e pedido para que alterasse."*
4. **No prazo final, quem não respondeu é cancelado** — o dia esvazia e a folga
   se completa.
5. Quem abrir o link e **não achar vaga** entra na **fila de espera** para os dias
   seguintes, em vez de sair de mãos vazias.

### O template, e por que ele ficou com UM botão

O dono queria três: link da agenda, WhatsApp e cancelar. A pesquisa na Meta
derrubou dois deles — e as regras estão agora em
[`templates-para-a-meta.md`](templates-para-a-meta.md):

- **botão de URL não pode apontar para o WhatsApp** (`error_subcode 2388081`,
  medido tentando);
- **misturar resposta rápida com outro tipo quebra o WhatsApp Web** — a pessoa no
  desktop não consegue usar a mensagem.

Então ficou **um botão de URL** (`Ver horários` → `/meu-horario/{{token}}`), com
cancelar e WhatsApp na própria página, que já os tem. O rodapé diz *"se preferir,
responda esta mensagem"* — o número central roteia pela 0148.

`imprevisto_na_barbearia`, id `27718933454446964`, **`PENDING` e `UTILITY`
confirmado pelo GET**. Tem argumento de categoria muito mais forte que os da
fila: há transação em curso (um agendamento existente mudando).

**Um erro meu no caminho:** submeti primeiro sem acentos, apaguei para corrigir, e
a Meta bloqueou o nome por mais de dois minutos (dizendo "menos de um"). Tive que
criar com outro nome — acabou sendo o `imprevisto_na_barbearia` que o projeto já
planejava. Conferir o texto antes de submeter custa segundos; apagar custa o nome.

### O que falta

A implementação, nesta ordem: a **folga que não colide** (migration, mexe no
`horarios_livres`), depois o aviso escalonado sobre o motor da fila, depois a
fila como rede para quem não acha vaga. E a aprovação da Meta, que não depende
de nós.

---

## 2026-10-04 — A folga que não colide, construída (0213)

A parte 1 do desenho acima, de ponta a ponta: tabela, régua, catraca, agenda
pública, agente e CRM.

### O que foi feito

**`public.dias_de_folga`** (barbeiro + data, motivo até 60, uma por barbeiro por
dia). Fora de `appointments` de propósito: a folga precisa **conviver** com os
agendamentos do dia, e agendamento nenhum convive com outro — a
`appointments_sem_sobreposicao` os separa por definição. É isso que o bloqueio
não consegue fazer.

**O filtro entrou na `jornada`**, dentro de `horarios_livres`, e não num
`not exists` no fim. `na_grade` (a grade de 10 em 10) e `apos_atendimento` (o
encaixe depois de um atendimento) **nascem as duas da `jornada`**: tirando o
barbeiro de lá, ele desaparece das duas de uma vez e não sobra caminho por onde
uma vaga escape.

Uma linha fechou **seis portas**, porque todas passam pela mesma régua —
`agendar_pelo_agente`, `remarcar_pelo_cliente` e `quem_pode_assumir` como trava
de recusa, não como sugestão; `dias_com_horario`, `criar_agendamentos_de_reativacao`
e `chamar_proximos_da_fila` por herança.

### Medido em produção, pelo caminho real

Ensaio em transação (9 asserções) antes de aplicar, e depois a prova de ponta a
ponta com os cinco barbeiros da El Corte de folga em 07/10 — fixture criada,
medida e apagada, com a agenda conferida de volta nos 182 horários:

| Medida | Sem folga | Com folga |
|---|---|---|
| `horarios` do dia | 182 | **0** |
| `diasFechados` | `[]` | `['2026-10-07']` |
| `diasDeTrabalho` | `[0..6]` | **`[0..6]`, inalterado** |
| `motivoVazio` | — | **`fechado_hoje`** |
| dia seguinte | — | 283 (não vazou) |

E o agente, na RPC que o n8n chama de verdade:

```json
{"ok": false, "motivo": "Nao ha horario livre nesse dia.",
 "proximo_dia_com_vaga": "08/10", "horas_no_proximo_dia": "09:00, 09:10, ..."}
```

Ele recusa **e já oferece o próximo dia com vaga**, de graça: a função já fazia
isso, e herdou a folga pela régua única.

### "Fechado", não "lotado" — e sem valor novo no fio

Esta pendência estava anotada como *"um quinto valor em `MotivoSemHorario`"*.
**Não precisou.** `motivoSemHorario` já recebia `alguemTrabalhaHoje`, e
`fechado_hoje` já significava "fechado no dia escolhido". O que estava errado era
o **cálculo**: o booleano vinha de `diasDeTrabalho`, que é por dia da semana — o
barbeiro de folga numa quarta continua tendo jornada de quarta.

A edge passou a cruzar jornada com folga por data (`trabalhaNoDia`) e a mandar
`diasFechados` como campo **novo e opcional**, que a tela lê com `?? []`. Valor
novo no enum obrigaria tela e edge a subirem juntas, e elas não sobem: a edge
publica na hora, a Vercel termina o build minutos depois. Nesse vão a tela antiga
cairia no `default` e diria *"não sobrou horário"* num dia de folga — o próprio
comentário do `semHorario.ts` avisava disso, e foi o que evitou o erro.

### O CRM: nenhuma UI nova, porque a linguagem já existia

O botão **"Marcar folga nesse dia"** entrou no `ConflitosDoBloqueio`, que é
exatamente onde o dono bateu no muro. Aparece **só quando o bloqueio é de dia
inteiro** (`onFolga` ausente no resto): folga de duas horas não existe, e
oferecê-la num bloqueio de almoço fecharia o dia por engano.

E para a folga **aparecer** na agenda, a resposta estava escrita no próprio
código: *"`null` na jornada é folga"* (`AgendaPage.tsx`). O `useAgendaData` passou
a sobrescrever a jornada com `null` para quem está de folga, e a coluna inteira
fica cinza — o visual que já existia. Sem isto o dono marcaria a folga, a agenda
ficaria idêntica e ele concluiria que não funcionou.

A folga **pesa mais** que a jornada da semana, e por isso é aplicada depois no
mapa. Os agendamentos continuam desenhados por cima do cinza, que é a figura
certa: dia fechado, e estes aqui para resolver.

### Achado de segurança, no caminho: `TRUNCATE` para `authenticated`

Conferindo os grants da tabela nova, ela nasceu com **sete** privilégios para
`authenticated`, não os quatro concedidos — `REFERENCES`, `TRIGGER` e
`TRUNCATE` vieram do padrão do schema. **`TRUNCATE` ignora RLS.**

- **Medido:** `authenticated` tem `TRUNCATE` em **75 relações** deste banco,
  `appointments` e `clients` entre elas.
- **Deduzido, não medido:** não é alcançável pelo PostgREST — os verbos REST
  viram só DML, e `authenticated` não é papel de login, é assumido por `set role`
  depois do JWT. Então é **privilégio desnecessário, não buraco aberto**.

Na `dias_de_folga` ficou `revoke all` antes do `grant`, e o pgTAP guarda isso.
**As outras 74 são decisão do dono**, porque é mexer no grant de todo o banco:
dá para fazer num `revoke` por tabela, e o risco é algum papel depender de
`REFERENCES` para FK em migration futura.

### Catraca

`a_folga_que_nao_colide.test.sql`, 13 asserções. As duas primeiras são um par e
valem o arquivo: a 1 prova que **o bloqueio é recusado com 23P01** no dia com
agendamento, a 2 prova que **a folga entra no mesmo dia com os mesmos dois
agendamentos de pé**. Se alguém "simplificar" a folga para um agendamento de dia
inteiro, a 2 cai e a mensagem diz por quê.

A 3 existe porque a 4 sozinha não mediria nada — "zero vagas depois da folga" só
significa algo se havia vaga antes. É a lição da asserção de expiração que passou
medindo zero em 03/10.

### O deno check cobrou de novo

`npm run typecheck` passou verde e `deno check` reprovou: `dias` sai de um
`rpc()` sem tipo gerado, e o `any` implícito só aparece lá. Terceira vez que esse
comando pega algo que o `tsc` do projeto não vê.

### O que falta da folga

1. **O aviso escalonado** sobre o motor da fila — do horário mais cedo para o
   mais tarde, um aviso só, prazo por pessoa, e cancelamento automático no fim.
   Depende do template `imprevisto_na_barbearia` sair de `PENDING` na Meta.
2. **A fila como rede** para quem abrir o link e não achar vaga.
3. **Remover** a folga pela tela: hoje só entra. Marcar errado exige SQL, e isso
   não serve. É a primeira coisa a fazer no próximo passo.
4. O `quem_pode_assumir` ainda diz *"ninguém está livre nesse horário"* quando o
   salão tem **um barbeiro só** — a frase sugere coincidência de agenda, e a
   verdade é "você é o único". O botão de folga agora dá a saída, mas a frase
   continua imprecisa.
