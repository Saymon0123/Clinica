# Backlog — o que está aberto

Só o que **não** foi resolvido. O que já foi corrigido mora em
[`historico.md`](historico.md), junto com o motivo e a lição — material que
vale guardar, mas que atrapalhava quem vinha aqui procurar o que fazer.

Separados em 2026-08-16, quando este arquivo passou de 800 linhas e 41% dele
era passado. Separados de novo em 2026-10-09, quando ele tinha passado de 9 mil
linhas: o relato de cada entrega foi para o histórico, e aqui ficou só a ponta
solta, com o mesmo título e a frase "Contexto completo no histórico".

**Regra:** item fechado sai daqui na mesma entrega que o fecha.

Para o retrato de hoje, ver [`estado-do-projeto.md`](estado-do-projeto.md).
Consultável pelo grafo: `graphify query "backlog"`.

---

## Giro geral de 2026-09-10 — o que ficou aberto

- **Caminho HTTP Meta → webhook → RPC nunca testado** (opt-out da 0147 e `entregas_falhadas` da 0152): o `WHATSAPP_APP_SECRET` só existe no cofre. Destrava quando o dono salvar o secret em `~/.clubcut/meta.env`.
- **Emitir a nota fiscal em si** (razão social, endereço e um fornecedor de NFS-e): a 0156 só garante que ninguém passa do teste sem documento.
- **Bloqueio falso na primeira madrugada depois do teste:** das 0h à 1h20 de São Paulo a barbearia aparece bloqueada mesmo com documento, até o job renovar (cron às 04:20 UTC). Resolve adiantando o cron para logo depois da meia-noite de São Paulo.
- **Dívida de rótulo no n8n:** o fluxo `8Qh33uoFm4VqT1eO` (Detalhamento de Uso) funciona em PIX, mas nós, sticky note e descrição ainda falam de boleto e Asaas ("Gerar Boletos", `asaas_payment_id`). Não quebra nada; engana quem abrir.

Contexto completo no histórico, em "Giro geral de 2026-09-10 — o que ficou aberto".

### Decisões esperando o dono (registradas em 10/09)

**Perguntas para a Meta** — nenhuma se responde lendo documentação:
1. **Coexistence está liberada no Brasil?** A página dela não menciona país nenhum. *Silêncio não é liberação.*
2. **A aprovação é Tech Provider ou Solution Partner?** Decide quem paga a Meta: só Solution Partner tem *credit line* para o parceiro pagar (programa separado, com processo *"lengthy"*). Virar Tech Partner **não** dá credit line.

Contexto completo no histórico, em "Decisões esperando o dono (registradas em 10/09)".

### Fase 3 (11/09) — agenda pública e telefone da barbearia

- **Captcha no cadastro aberto continua desligado** (mitigado por e-mail confirmado, uma barbearia por conta e limite por IP): precisa de conta no provedor e mexe no front. Decisão do dono.
- **Informativo:** as permissões padrão do Supabase dão TRUNCATE e TRIGGER a `anon`/`authenticated` em várias tabelas. Nenhuma API alcança isso; endurecer é opcional.

Contexto completo no histórico, em "Fase 3 (11/09) — agenda pública e telefone da barbearia".

### Fase 5 (12/09) — M12: o envio em dobro (migration 0163)

**O lembrete continua sem reserva contra envio em dobro** (a quarta fila do M12). Ele não tem view nem RPC — o fluxo consulta `appointments` direto — e ficou de fora de propósito por ser a funcionalidade mais usada: o pior caso é o cliente receber o mesmo lembrete duas vezes. Fica para PR próprio.

Contexto completo no histórico, em "Fase 5 (12/09) — M12: o envio em dobro (migration 0163)".

### Fase 5 (12/09) — A3: a mensagem do cliente que some (migration 0162)

**A fila de SAÍDA do A3 continua sem retentativa:** a resposta que o `entregarAoN8n` manda também pode se perder. A 0162 cobriu só a entrada.

Contexto completo no histórico, em "Fase 5 (12/09) — A3: a mensagem do cliente que some (migration 0162)".

### Fase 5 no n8n (12/09) — o que foi feito na peça de fora

**Não provado ponta a ponta:** o POST da reentrega (`CRM Salao - Reentrega de Mensagens`) com a credencial de header — a fila estava vazia. Modo de falha seguro (nada enviado, tentativa contada, `auditoria_mensagens` alarma em 15 min), mas a prova de verdade é a primeira mensagem que o agente recusar.

Contexto completo no histórico, em "Fase 5 no n8n (12/09) — o que foi feito na peça de fora".

### Agenda pelo QR, versão 2 — decidida em 11/09, para fazer em etapas

**EM ABERTO, decisão do dono:** a trava de **1 agendamento futuro por pessoa pelo QR** ficou muito mais apertada com a janela de catorze dias — bloqueia por até 14 dias quem marcou para sábado e quer a barba na quinta. Mantida em 1 (nada regride); a edge `agenda-publica` registra a escolha no comentário da trava.

Contexto completo no histórico, em "Agenda pelo QR, versão 2 — decidida em 11/09, para fazer em etapas".

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

**`function_search_path_mutable`** em 3 funções `private` (`telefone_valido`, `destino_whatsapp`, `documento_valido`) — adicionar `SET search_path`. Mexer nelas é arriscado (usadas em muitas views): fazer em leva dedicada com teste. `extension_in_public` (`btree_gist`) não se move: sustenta as exclusion constraints.

Contexto completo no histórico, em "Funções SECURITY DEFINER: auditoria de exposição (2026-09-09)".

## Correção de comportamento

### PostgREST do Supabase Free instável (504) derrubava workflows — mitigado com retry (2026-09-09)

**Falta provar empírico:** ver nos logs do PostgREST se os `Thread killed`/504 caíram depois da subida para o Pro. Se persistirem, o próximo passo é o compute add-on, não o plano. Os retries nos nós Supabase seguem como cinto de segurança.

Contexto completo no histórico, em "PostgREST do Supabase Free instável (504) derrubava workflows — mitigado com retry (2026-09-09)".

### Monitor da WABA (0116) alarma demais e com texto enganoso (2026-09-08)

**Template PAUSED/DISABLED não gera alerta em lugar nenhum** — fora do escopo do monitor do número (0139). Avaliar um alerta próprio.

Contexto completo no histórico, em "Monitor da WABA (0116) alarma demais e com texto enganoso (2026-09-08)".

### Auditoria ganhou 2 alertas de ação rápida (2026-09-08, migration 0140, aplicada)

**Ainda aberto do inventário da auditoria** (sem pressa): alerta de **opt-out subindo** — precisa de volume real de disparos.

E uma revisão sugerida: garantir que todos os caminhos de criação de agendamento tratam o `23P01` da trava de sobreposição sem susto para o cliente.

Contexto completo no histórico, em "Auditoria ganhou 2 alertas de ação rápida (2026-09-08, migration 0140, aplicada)".

### O lembrete pergunta se o cliente confirma, e ninguém registra a resposta

**Não verificado em conversa real** a ferramenta *Confirmar Presenca* do agente: responder "confirmo" a um lembrete e ver `appointments.status` virar `confirmado`.

Contexto completo no histórico, em "O lembrete pergunta se o cliente confirma, e ninguém registra a resposta".

### Mensagem de comissão engana quando não há vendas
No Financeiro, com zero vendas no período, aparece: *"Nenhuma comissão no
período (defina o percentual de comissão do profissional para calcular)"* —
mesmo quando o percentual **está** definido (verificado com a Giova, 60%). A
mensagem atribui à configuração o que na verdade é ausência de venda, e manda
o usuário mexer numa tela que não tem esse ajuste (ver item da comissão).

Caminho: separar as duas causas — sem venda no período vs. profissional sem
percentual.

## Funcionalidade ausente

### Clube de assinatura do cliente final
**A fidelidade foi construída** (migrations 0072–0074): carimbos calculados a
partir de vendas fechadas, resgates e ajustes gravados, recurso `fidelidade`
ligado por barbearia, com tela no cliente, no caixa e nas configurações. O que
falta é só o clube.

O clube ("corte ilimitado por R$ X/mês") é receita recorrente **para o
barbeiro**, o que muda o argumento de venda: o produto deixa de ser custo e vira
faturamento. Aparece na descrição do Trinks e do AppBarber.

### ~~Política de atraso~~ — APOSENTADA em 11/09 (M16)

**A ideia refeita, para quando valer a pena:** o cliente atrasado recebe a pergunta e, se responder "não vou", o horário cancela na hora e a cadeira é liberada; sem resposta, segue a presença deduzida (0153). Precisa de **modelo novo aprovado pela Meta** e de mexer no recebimento de respostas (`whatsapp-webhook`) — é projeto próprio.

Contexto completo no histórico, em "~~Política de atraso~~ — APOSENTADA em 11/09 (M16)".

## Infraestrutura e manutenção

### `~/.clubcut/supabase.env` tem uma SUPABASE_SERVICE_ROLE_KEY que não vale
Achado de passagem em 13/09, ao tentar conferir por REST uma consulta do agente:
a chave do arquivo devolve `Invalid API key`. Tem 88 caracteres e não é JWT
(`eyJ...`) nem chave nova (`sb_secret_...`), então não é só rotação — é outra
coisa gravada no lugar. Nada quebrou por causa disso: o n8n usa a credencial
dele, e as migrations vão pelo MCP. **Quebra quem for escrever script que fala
com o PostgREST** achando que o arquivo serve. Trocar pela chave certa ou apagar
a linha, para não prometer o que não entrega.

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

### Cobertura de testes rasa
Cobertos: `csv`, `appUrl`, contrato de nomeação das instâncias, isolamento
multi-tenant (pgTAP, ainda não executado). Sem cobertura: componentes, hooks
de dados, e todo o fluxo financeiro (caixa, comanda, comissão, meta).

---

## Derivado da visão do produto

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

Da sequência de no-show descrita na visão, falta **pedir confirmação de chegada 10 min antes** *(Pro)* — não existe. (Lembrete, falta deduzida pelo cron da 0153 e pedido de avaliação no Google já existem.)

Contexto completo no histórico, em "Ciclo de no-show e avaliação no Google".

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

## Agente de WhatsApp

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

## Popup de WhatsApp na landing: agente de tira-dúvidas pronto no código, falta ativar (2026-08-22)

### ⚠️ Latência alta quando o agente chama as duas ferramentas (2026-08-22)

- **Em aberto:** achar um modelo `:free` mais rápido que se comporte bem com tool-calling, ou aceitar os ~17s do Nemotron Ultra (`nvidia/nemotron-3-ultra-550b-a55b:free`) como custo da gratuidade no turno que chama `Salvar Pedido de Humano` + `Avisar no Telegram`.
- Se for tentar de novo, espaçar os testes: o rate-limit de rajada da OpenRouter trava rápido em sequência.

Contexto completo no histórico, em "⚠️ Latência alta quando o agente chama as duas ferramentas (2026-08-22)".

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

### O que sobrou da `/sobre` (2026-08-23)

- [ ] **Imagem de ambiente** (`ORIGEM.imagem`): interior de barbearia, bancada, cadeira — nunca rosto atribuído a um nome. Arquivo em `public/`, com largura e altura declaradas.
- [ ] **Bio e link público de cada fundador** (`QUEM_FAZ[].bio` / `.links`): hoje o cartão mostra só nome e cargo.
- [ ] **Foto de cada fundador** (`QUEM_FAZ[].foto`): opcional.

Contexto completo no histórico, em "O que sobrou da `/sobre` (2026-08-23)".

## Lembrete de 1h30 com botões — o que falta

- **Supabase:** criar/conferir o segredo `N8N_LEMBRETE_RESPOSTA_URL` apontando para o webhook `lembrete-resposta-central` do n8n. Sem ele o banco é atualizado mas o cliente não recebe resposta nenhuma ao botão do lembrete. Nenhum registro posterior confirma que foi criado.

Contexto completo no histórico, em "Lembrete de 1h30 com botões — o que falta".

## Primeira conversa real pela Cloud API — 2026-08-22, madrugada

### Duas credenciais quebradas, consertadas pelo dono

- Renomear a credencial SMTP chamada "Authorization" (`Ozsdd8R9j8L9vUJO`), que tem o mesmo nome da Header Auth (`OZEs5UkyhiYZkkan`) — já fez editar a errada.
- Vale considerar: trocar os `httpRequest` de transcrição e visão pelos nós nativos da OpenAI, eliminando credenciais de cabeçalho montadas à mão.

Contexto completo no histórico, em "Duas credenciais quebradas, consertadas pelo dono".

## O agente ofereceu e agendou com barbeiro inexistente — 2026-08-23

### O que isso ensina sobre o desenho

- Vale considerar inverter a trava anti-invenção de `Formatar para WhatsApp`: em vez de remover o que não casa (uma categoria por vez — serviço, barbeiro; preço, endereço e horário de funcionamento seguem sem regra), **só deixar passar lista montada a partir de dado do banco**. Mudança grande, não cabe em remendo.

Contexto completo no histórico, em "O que isso ensina sobre o desenho".

## Rede de barbearias — fase 1 entregue em 2026-08-23

- **Fase 3 — landing:** seção "Para redes" + FAQ de preço por unidade (não existe no site).
- **Fase 4 — papéis:** gerente de rede que vê tudo sem ser dono. Hoje dono da rede = owner em cada unidade.
- **Teste manual pendente:** numa barbearia avulsa, Configurações → Adicionar unidade. Esperado: organização criada, unidade nova com assinatura em trial, seletor de unidades e aba Rede aparecendo.

Contexto completo no histórico, em "Rede de barbearias — fase 1 entregue em 2026-08-23".

## Termos de uso atualizados para o modelo por uso — 2026-08-24

- `TERMOS_EM_REVISAO` continua `true`: a revisão dos Termos por advogado segue pendente.
- Não existe fluxo de re-aceite para usuário já logado quando `VERSAO_DOS_TERMOS` muda — decidir se a versão nova vale só para entradas novas ou se o CRM pede aceite de novo.

Contexto completo no histórico, em "Termos de uso atualizados para o modelo por uso — 2026-08-24".

## Pacotes — Fase 2 e 3 (2026-08-26)

- **Fase 3**: template `pacote_vencendo` (utility: crédito comprado expirando) no lote da submissão à Meta + fluxo n8n de aviso.

Contexto completo no histórico, em "Pacotes — Fase 2 e 3 (2026-08-26)".

## Reativação por agendamento automático — Fase 1 no banco e no CRM (2026-08-27)

- **n8n**: lembrete de 1h antes para quem confirmou a reativação — sai pela janela de 24h aberta pelo clique (grátis) e cai no template de lembrete só se a janela fechou. Hoje o fluxo de Lembretes ignora `origem='reativacao'`.

Contexto completo no histórico, em "Reativação por agendamento automático — Fase 1 no banco e no CRM (2026-08-27)".

### Atualização (2026-09-07): a Meta aprovou 8 templates — e há descasamento com as filas

- **Lembrete** (`lembrete_hoje` aprovado): confirmar o fluxo n8n de lembrete com um teste real antes de dar como pronto, inclusive o clique nos botões.
- Reativação/retorno de 2 etapas (modelo antigo da 0083: `reativacao_convite`, `reativacao_tempo`, `retorno_pedido*`) seguem em rascunho, com as views vazias.

Contexto completo no histórico, em "Atualização (2026-09-07): a Meta aprovou 8 templates — e há descasamento com as filas".

### Como os 3 fluxos disparam de verdade + a reativação pega carona no lembrete (2026-09-07)

- **Teste de envio real ponta a ponta** do fluxo "CRM Salão - Reativação (Convite Automático)" (`Fxc7WGhCoHu7KUe1`): com a fila vazia, o envio e o `marcar_reativacao_enviada` reais ainda não foram exercitados.

Contexto completo no histórico, em "Como os 3 fluxos disparam de verdade + a reativação pega carona no lembrete (2026-09-07)".

## Revisão de código do CRM (2026-08-28) — pendências fora do repositório

- **Edge functions `admin-create-salon` e `admin-invite-salon`**: `listUsers()` sem paginação (ainda no código).
- A conferir: corrida no aceite de convite (`accept-invite`) e erros de update não checados nas edges — sem registro de conserto. Cada correção exige redeploy manual.

Contexto completo no histórico, em "Revisão de código do CRM (2026-08-28) — pendências fora do repositório".

## Revisão de agentes (2026-08-29) — o que ficou aberto

- **Agente n8n:** transcrição/visão sem caminho de erro ("não consegui ouvir o áudio"), testar com mensagem real.
- **Testes** nos fluxos críticos: venda/rollback, pacotes, caixa automático.
- **Edges:** `listUsers()` sem paginação (admin-create/invite-salon); `add-salon-unit` sem rate limit; `criar-minha-barbearia` com maybeSingle sem tratamento; `whatsapp` sem salonId cai em `.limit(1)`; CORS `*` nas funções admin.
- **Banco:** FKs por `salon_id` sem índice; policies duplicadas de SELECT em `user_salons`; `preco_por_uso` executável por authenticated (decidir); `criar_agendamentos_de_reativacao` não checa profissional ativo nem expediente.
- **Frontend:** `window.confirm` na Equipe; busca da Ajuda sem estado vazio; banners sem safe-area-top; erro booleano na Conexão; labels no adminTool; escala de z-index.
- **Popup:** limite contornável por sessionId novo (considerar IP); leads em data table do n8n sem expurgo (LGPD).
- **Infra:** CI Node 22 vs Vercel Node 24; chunks grandes (jspdf ~400kB).

Contexto completo no histórico, em "Revisão de agentes (2026-08-29) — o que ficou aberto".

## Modelo híbrido — Fases 2 e 3 entregues (2026-08-30)

- **Saymon**: no painel da Meta (app → Webhooks → WhatsApp Business Account), assinar os campos `phone_number_quality_update` e `account_update` — sem isso a Meta não envia os eventos que o monitor de qualidade escuta. Eventos de template e de nome já chegam; o de qualidade não foi confirmado.

Contexto completo no histórico, em "Modelo híbrido — Fases 2 e 3 entregues (2026-08-30)".

## Verificação completa do híbrido (2026-08-31) — corrigido na hora

- Criar/conferir o segredo `N8N_LEMBRETE_RESPOSTA_URL` nas edge functions apontando para `https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/lembrete-resposta-central` (sem ele, a resposta dos botões de lembrete não chega ao cliente).
- Testes de borda: evento de status da Meta não deve virar linha em `eventos_da_waba`; reconferir o escape de HTML do detalhe no e-mail da auditoria com o campo `qualidade-waba`.

Contexto completo no histórico, em "Verificação completa do híbrido (2026-08-31) — corrigido na hora".

## Trio da realidade do balcão — itens 14, 12 e 16 entregues (2026-08-31)

- Mostrar média/lista de avaliações no CRM (dashboard).
- Link de gestão do horário também na confirmação do agente.
- Teste real do ciclo de avaliação.

Contexto completo no histórico, em "Trio da realidade do balcão — itens 14, 12 e 16 entregues (2026-08-31)".

## Correções de rota — avaliação e UX de serviços (2026-09-01)

- A ferramenta "Registrar Avaliação" do agente continua existindo para quem responder por texto no número da barbearia (caminho secundário) — avaliar se vale manter depois de ver o uso real.

Contexto completo no histórico, em "Correções de rota — avaliação e UX de serviços (2026-09-01)".

## Achados do passo 1.9 (2026-09-01) — abertos

Encontrados enquanto o telefone do cliente ganhava régua única (migration
0128). Nenhum deles é do escopo do passo, e por isso ficam aqui em vez de
sumir no chat.

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

### Cliente duplicado quando o telefone fica em branco na Agenda
Sem telefone, `NewAppointmentModal` procura o cliente pelo **nome** — e essa
busca passa pela RLS de leitura, que pode esconder um cliente cadastrado por
outro barbeiro. Não achando, cria outro. O índice único não barra, porque sem
telefone `telefone_norm` é nulo. É o resto do achado 11: a RPC `garantir_cliente`
resolveu o caminho com telefone, o caminho sem telefone continua aberto.

---

## Achados do passo 2.1 — a cadeia de cobrança (2026-09-02)

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

### Mensagens fixas que ainda não passam pelo tradutor
O 4.5 converteu agenda, equipe, configurações, meta e fechamento. Ficaram com
frase fixa após erro do banco: `CaixaSection` (troco e fechar caixa),
`CobrancaDaRede` (ações), `useVendasData` e `ExportReportModal` (carga),
`NovaUnidadeModal`. Próxima varredura: todo `setErro('Não foi possível…')`
que tenha um `error` do supabase à mão passa por `traduzirErroDoBanco`.

## Central de Ajuda desatualizada e produção zerada (2026-09-03)

### Sentry no CRM — código pronto, falta a conta e a Vercel (2026-09-06)

- (dono) confirmar no painel o issue "Teste controlado do Sentry — Club Cut" e se o alerta chegou por e-mail.
- (dono, cosmético) `SENTRY_ORG` na Vercel está `club-cut.sentry.io`; o certo é só `club-cut`.
- (dono, cosmético) projeto no Sentry com slug/plataforma **react-native**; se renomear para React, atualizar `SENTRY_PROJECT` na Vercel junto.
- Integração com Slack quando existir.

Contexto completo no histórico, em "Sentry no CRM — código pronto, falta a conta e a Vercel (2026-09-06)".

### Cobrança migrada de Asaas para AbacatePay (PIX) — EM ANDAMENTO (2026-09-10)

- **O caminho do HMAC provavelmente nunca valida:** `abacate-webhook` confere `X-Webhook-Signature` com o segredo compartilhado, mas a doc do AbacatePay diz que a assinatura se verifica com a chave pública deles; quem sustenta a autenticação é o `?webhookSecret=`. Conferir contra um evento real e corrigir o verificador.
- **O segredo do webhook aparece em texto claro nos logs da edge**, por vir na URL. Resolver junto com o item anterior.
- Ainda sem prova ponta a ponta: nenhum evento real do AbacatePay chegou; a primeira cobrança real é a prova.

Contexto completo no histórico, em "Cobrança migrada de Asaas para AbacatePay (PIX) — EM ANDAMENTO (2026-09-10)".

## M11 — a varredura que não existia, e o typecheck que faltava nas edges (2026-09-12)

- **Tipos gerados do banco** (`supabase gen types typescript`). Enquanto não vierem, `ClienteAdmin` em `_shared/supabase.ts` tem `any` no lugar de `Database`; quando vierem, muda uma linha.

Contexto completo no histórico, em "M11 — a varredura que não existia, e o typecheck que faltava nas edges (2026-09-12)".

## A senha do painel administrativo saiu do navegador (2026-09-12)

- Se a conveniência de continuar destravado fizer falta, o caminho **não** é voltar a gravar a senha: é o `verify` devolver um token curto e assinado e os três edges do painel (`admin-create-salon`, `admin-invite-salon`, `admin-metricas`) passarem a aceitá-lo. Mexe em edge e exige publicação; só vale se o incômodo aparecer.

Contexto completo no histórico, em "A senha do painel administrativo saiu do navegador (2026-09-12)".

## Estado da auditoria de 10/09 depois deste dia

Da auditoria de 10/09, segue aberto (escolha, não esquecimento):

- **M14** — o parecer só existe no laptop (decisão do dono).
- **As metades adiadas:** a fila de SAÍDA do A3 (`entregarAoN8n` sem retentativa) e o lembrete do M12 (quarta fila, sem view nem RPC).
- **Os dois achados do webhook do AbacatePay** (11/09): o HMAC que provavelmente nunca valida e o segredo em texto claro no log por vir na URL.
- **O POST da reentrega no n8n** com a credencial de header, nunca exercitado.
- **A limpeza do commit `6ce8584`** no GitHub (o parecer vazado em 11/09).

Contexto completo no histórico, em "Estado da auditoria de 10/09 depois deste dia".

## A primeira cobrança real — e os dois defeitos que só ela revelou (2026-09-12)

### O caminho inteiro, verificado em produção

- **Recalcular o mínimo de cobrança** (`COBRANCA_MINIMA`, padrão 5) com a taxa real do AbacatePay em mãos: `platformFee` de R$ 0,80 numa cobrança de R$ 1,50; a R$ 5 a taxa pesaria 16%.

Contexto completo no histórico, em "O caminho inteiro, verificado em produção".

## O cron que para em silêncio — alarme aplicado (2026-09-12)

- **Decisão de negócio:** a folga do `acesso_ate` continua de um dia. Subir para `hoje + 3` daria três dias de resiliência contra cron parado, ao custo de três dias a mais de acesso para quem deve (somados aos 7 do vencimento). Com o alarme da 0165, um dia passa a ser defensável.

Contexto completo no histórico, em "O cron que para em silêncio — alarme aplicado (2026-09-12)".

## Uma regra para cancelar, e o nono dígito do WhatsApp (2026-09-13)

### Fica aberto

- **O agente ainda não usa `pode_cancelar`** (PR 3 do plano de 13/09) — a `agenda-publica` já usa; falta conferir se o cancelar do agente no n8n passou pela mesma régua de 30 minutos.

Contexto completo no histórico, em "Fica aberto" (de "Uma regra para cancelar, e o nono dígito do WhatsApp").

## O aviso do canal não oficial — camadas 3 e 4 pendentes (2026-09-14)

- **Central de Ajuda** — pergunta nova "O WhatsApp da minha barbearia pode ser bloqueado?", explicando os dois canais, por que o híbrido protege o número, o risco real do espelhado e o que fazer se acontecer. Quando existir, o link "Entenda os dois canais" da Conexão pode apontar para ela em vez dos termos.

Contexto completo no histórico, em "O aviso do canal não oficial — camadas 3 e 4 pendentes (2026-09-14)".

## O nome "Club Cut" rejeitado pela Meta — motivo verificado (2026-09-14)

- **A foto do perfil (logo)** do número oficial — pela WhatsApp Manager, ação do dono.

Contexto completo no histórico, em "O nome "Club Cut" rejeitado pela Meta — motivo verificado (2026-09-14)".

## O agente solta a gravata — modelo e voz (2026-09-20)

- **Teste vivo** do agente com o tom novo na rodada (Bloco 7 — precisa parear a Evolution).
- **Comparar o custo real por conversa** no painel da OpenAI depois da troca gpt-4o-mini → gpt-4o (estimado ~R$ 0,10 por mensagem).

Contexto completo no histórico, em "O agente solta a gravata — modelo e voz (2026-09-20)".

## Pacotes, parte B — o agente conta o saldo ao marcar (2026-09-21)

- **Prova de execução real** do nó `Saldo de Pacotes (Contexto)` e do aviso de saldo pelo agente: a API do n8n omite credenciais na leitura, então só o primeiro teste do Bloco 7 (com a Evolution pareada) confirma.

Contexto completo no histórico, em "Pacotes, parte B — o agente conta o saldo ao marcar (2026-09-21)".

## Os filtros de campanha em lote na lista de Clientes (2026-09-21)

- **Filtro "aniversariantes do mês"** na lista de Clientes: o campo `clients.aniversario` já existe (usado no export CSV), então fica barato quando o dono quiser.

Contexto completo no histórico, em "Os filtros de campanha em lote na lista de Clientes (2026-09-21)".

## Rodada, achado nº 3 — o e-mail que falha em silêncio (2026-09-21)

### O alarme que faltava (2026-09-29)

- **E-mail que falha sem fila por trás** (alertas de auditoria) continua invisível: o alarme da 0181 só cobre `feedbacks` e `salon_invites`. O caminho seria a saída de erro do n8n gravar em `entregas_falhadas`.
- **A mensagem do cadastro mente:** `CriarContaPage` mostra "Tente novamente em instantes" para qualquer erro do `signUp`. Distinguir falha de envio de e-mail (pede "fale com a gente") do erro passageiro, e mandar esse caso ao Sentry com destaque.

Contexto completo no histórico, em "O alarme que faltava (2026-09-29)".

## O bloco de funcionalidades: o que entra e o que não (2026-09-30)

- **Entra e ainda não foi feito: 19 — depósito contra falta.**
- **Em espera: 17 — logo e cor por barbearia.** O dono quer testar antes. Levantamento pronto: não existe bucket de storage (subir logo exige a camada inteira), e cor deve ser paleta de 6 a 8 opções com os dez valores conferidos, não seletor livre.

Contexto completo no histórico, em "O bloco de funcionalidades: o que entra e o que não (2026-09-30)".

## Item 13 — o barbeiro fecha a própria agenda (2026-09-30, migration 0182)

- **Conferência visual do bloqueio em tela logada de barbeiro** — provado no banco (11 asserções pgTAP) e em teste de unidade, mas não visto na tela. É do dono.

Contexto completo no histórico, em "Item 13 — o barbeiro fecha a própria agenda (2026-09-30, migration 0182)".

## Item 14, parte 2 de 2 — de onde vem o dinheiro (2026-09-30, migration 0184)

### O item 14 está fechado

Faltam a conferência visual (do dono) e, se ele quiser, um seletor de cadeira
no Financeiro para o gestor medir um barbeiro específico — hoje ele vê o salão
inteiro, e o barbeiro vê só a própria cadeira.

## Parecer: o projeto avisa de erro? (2026-09-30)

### O buraco: todo alarme sai pelo mesmo cano

- **Todo alarme sai pelo mesmo SMTP** (`canal_de_alertas.provedor = 'email'` e o Error Workflow usa a mesma credencial). WhatsApp foi recusado pelo dono em 30/09: falta um segundo canal que não seja e-mail nem WhatsApp, ou um dead-man's switch externo.
- **Não verificado:** se o Sentry tem regra de alerta configurada. Conferir antes de prospectar.

Contexto completo no histórico, em "O buraco: todo alarme sai pelo mesmo cano".

## Item 5 — "Uso e cobrança", e quanto o sistema custou do que entrou (2026-09-30, migration 0190)

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

## O barbeiro duplicado: o convite liga à cadeira que já existe (2026-10-01, migration 0191)

### O que NÃO foi provado

- **Prova humana do aceite ligado:** criar um convite ligado a um dos quatro barbeiros sem login, aceitar, e conferir que a Equipe segue com quatro pessoas e que a cadeira passou a ter função. Teste de dois minutos que só o dono pode fazer.

Contexto completo no histórico, em "O que NÃO foi provado" (de "O barbeiro duplicado: o convite liga à cadeira que já existe").

## Os tres templates da fila de espera, submetidos a Meta (2026-10-01, migrations 0193/0194/0195)

### O que separou um do outro, e e util para os proximos

A família `retorno_pedido*` (seis rascunhos) pede `utility` com o argumento "você pediu para que te avisássemos", sem transação viva, e **nunca foi submetida**. A chance de voltar `marketing` é alta: submeter uma antes das seis.

Contexto completo no histórico, em "O que separou um do outro, e e util para os proximos".

## As mudancas da Meta de 01/10/2026, conferidas na fonte primaria (2026-10-01)

### A armadilha que ninguem tinha registrado

> *"Caso voce nao tenha uma forma de pagamento para sua conta do WhatsApp
> Business, a Meta entregara mensagens de servico dentro do nivel gratuito
> compartilhado, mas **nao as entregara depois que o nivel gratuito for usado**."*

Isso nao e custo, e **queda de servico**. Passadas as 1.000, as respostas ao
cliente simplesmente param de ser entregues. Combinado com o Error Workflow que
nunca funcionou e o SMTP quebrado, para em silencio.

## FALSO ALARME: o canal oficial NAO esta bloqueado (2026-10-01)

`code_verification_status: EXPIRED` no número central segue sem conclusão: não se sabe quando expirou nem se atrapalha algo (o envio funcionou em 16/09 e no teste de 01/10). Re-verificar o número quando der; não tratar como falha até um envio falhar.

Contexto completo no histórico, em "FALSO ALARME: o canal oficial NAO esta bloqueado (2026-10-01)".

## Por que as mensagens saiam sem cartao, e o teste de entrega (2026-10-01)

### Ainda nao medido

O custo e a categoria da mensagem do teste -- que e a **primeira sob a tarifa
nova**. O `pricing_analytics` de hoje ainda vem vazio; a Meta atrasa horas.
Conferir depois: ela deve aparecer como REGULAR/UTILITY, porque saiu fora de
janela.

---

## A checagem no n8n: ramo que so ESCREVE (2026-10-01)

### Ainda nao verificado

A primeira execucao do ramo. A proxima rodada natural e dentro de 30 min; esta
rodando um observador na `auditoria_canal_oficial` para ver o alarme
`canal-sem-checagem` dar lugar ao que a leitura disser. **Nao executei o fluxo a
mao de proposito:** isso dispararia o e-mail da auditoria, e o SMTP esta quebrado
desde agosto -- eu trocaria uma verificacao por uma execucao com erro no historico.


---

## O teste da conversa do agente, sem mandar mensagem para ninguem (2026-10-01)

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

## 2026-10-02 — O agente pergunta as vagas (0198), e um vazamento de WhatsApp

### O teto da OpenAI continua sendo o bloqueador

A segunda rodada do teste caiu com `Limit 30000, Used 24895, Requested 8544` —
ou seja, **8,5 mil tokens por chamada do modelo**. Com 2 chamadas por mensagem
isso cabe; com 3 não cabe. Nada do que foi feito aqui remove o teto: só subir o
tier da conta (US$ 50 pagos levam a Tier 2) remove.

---

## 2026-10-02 — A voz do dono no prompt, e o id que o modelo inventa

### Sobras conhecidas

- `whatsapp_connections.status` continua `open` para a El Corte com a instância fechada na Evolution: a tela de Conexão mente até algo ressincronizar.

Contexto completo no histórico, em "Sobras conhecidas".

## 2026-10-02 (tarde) — As duas regras que cobriam so o caminho previsto

### NAO resolvido: ele pede permissao quando o cliente dita o horario

Quando o cliente dita dia, hora e barbeiro de primeira, o agente confere a disponibilidade e **pergunta** "vou agendar pra ti?" em vez de marcar. Três tentativas de prompt falharam; a decisão foi aceitar por hora (custa uma mensagem e é seguro). Revisitar quando a conta da OpenAI subir de tier e der para testar um modelo que obedeça instrução procedural melhor.

Contexto completo no histórico, em "NAO resolvido: ele pede permissao quando o cliente dita o horario".

## 2026-10-02 (noite) — O onboarding do barbeiro, fechado (item 20)

### O que fica em aberto

- **A primeira entrada do barbeiro não foi percorrida com os olhos**: não existe conta de barbeiro nesta base. Falta um convite de barbeiro para um e-mail do dono.
- **A trava na escrita** (recusar agendamento com barbeiro que não faz o serviço, em `agendar_pelo_agente` ou num trigger em `appointments` cobrindo as quatro portas) continua de fora; agora é possível, porque existe controle para arrumar o dado.

Contexto completo no histórico, em "O que fica em aberto".

## 2026-10-02 — O barbeiro que não vem no dia 20 (item 18)

### O que fica em aberto

- **O cliente não é avisado da troca de barbeiro**, e a tela diz isso ("Quem conta é você"). O aviso automático é mensagem iniciada pela plataforma e depende de template; o dono decidiu não usar por hora. O molde mais próximo é o `imprevisto_na_barbearia`.

Contexto completo no histórico, em "O que fica em aberto" (item 18, 2026-10-02).

## 2026-10-03 — O backup foi restaurado pela primeira vez, e faltava um schema

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

## 2026-10-04 — A folga que não colide, construída (0213)

### Achado de segurança, no caminho: `TRUNCATE` para `authenticated`

`authenticated` tem `TRUNCATE` (que ignora RLS) em 74 relações além da `dias_de_folga`, `appointments` e `clients` entre elas. Pela dedução registrada, não é alcançável pelo PostgREST: é privilégio desnecessário, não buraco aberto. Fechar é decisão do dono, num `revoke` por tabela, cuidando de papel que dependa de `REFERENCES`.

Contexto completo no histórico, em "Achado de segurança, no caminho: `TRUNCATE` para `authenticated`".

### O que falta da folga

O `quem_pode_assumir` ainda diz "ninguém está livre nesse horário" quando o salão tem **um barbeiro só**: a frase sugere coincidência de agenda, e a verdade é "você é o único". O botão de folga dá a saída, mas a frase continua imprecisa.

Contexto completo no histórico, em "O que falta da folga".

### A folga agora sai pelo mesmo lugar por onde se vê (05/10)

O bloqueio de dia inteiro num dia **vazio** passa e a vaga some (`horarios_livres` devolve zero), mas `diasFechados` não contém o dia, e a agenda pública marca **"lotado"** em vez de "fechado". Pré-existente à 0213. Conserto natural: a edge contar bloqueio de dia inteiro como dia sem ninguém, ou o CRM marcar folga junto quando o bloqueio cobre o dia todo. Fica como decisão de desenho.

Contexto completo no histórico, em "A folga agora sai pelo mesmo lugar por onde se vê (05/10)".

## 2026-10-05 — Meta: o nome de exibição e o template do imprevisto

### Verificação do acesso (Provedor de Tecnologia): prazo **04/12/2026**

Segundo e terceiro prints. São **duas** verificações diferentes, e o painel
mostra as duas juntas:

1. **Verificação da empresa** — confirma que a empresa existe. **Feita** em
   21/08/2026.
2. **Verificação do acesso** — confirma que a empresa é **Provedor de
   Tecnologia**, exigida de quem usa a API para alcançar ativos e dados de
   **outras** empresas. É exatamente o caso do Club Cut: um número central da
   Aura AI atendendo o cliente final de várias barbearias.

O status diz "Verificado", mas ao abrir os detalhes há um formulário com aviso:
*"Para evitar restrições a **1 app**, essa ação precisa ser concluída até
**04/12/2026**."*

**O app é o `1054189290929803`** — o mesmo por onde passa o webhook da WABA e o
envio pela Cloud API. Restrição nele é a integração de WhatsApp parando. **É
bomba de tempo com data, e entra na lista do `relatorio-tecnico.md §Bombas de
tempo`.**

As três perguntas e a resposta certa para este projeto:

1. *Quais opções descrevem melhor a sua empresa?* → **Plataforma de SaaS**.
2. *Como usará a plataforma de dados para ativar um produto ou serviço em nome
   dos seus clientes?* → rascunho redigido para o dono revisar (abaixo).
3. *Gerencia vários portfólios empresariais?* → **Não**, hoje. Há um portfólio
   só, e as barbearias não têm portfólio próprio — o número é central. Se um dia
   o Club Cut usar Embedded Signup com WABA por barbearia, a resposta muda.

**Rascunho da resposta 2** (linguagem simples, como o formulário pede):

> A Aura AI desenvolve e opera o Club Cut (clubcut.space), um sistema de
> agendamento para barbearias. As barbearias que contratam o Club Cut nos
> autorizam a atender os clientes delas pelo WhatsApp: o sistema responde às
> mensagens, marca, remarca e cancela horários na agenda da barbearia e envia
> lembretes dos horários já marcados. Usamos os dados da plataforma do WhatsApp
> — mensagens recebidas, status de entrega e o identificador do contato — apenas
> para manter essa conversa de agendamento e registrar o atendimento no painel da
> própria barbearia. Cada barbearia enxerga somente os próprios clientes e
> horários.

Tudo nele é verificável no produto: o agente atende, marca, remarca e cancela; o
lembrete existe; e o isolamento por barbearia é a RLS por `salon_id`.

### O perfil do WhatsApp passou a dizer 'Aura AI' (05/10)

Faltam duas das cinco grafias, e nenhuma é nossa: o Instagram (`@auraiagency`, decisão do dono) e o site da empresa (`AuraStudio`, do sócio).

Contexto completo no histórico, em "O perfil do WhatsApp passou a dizer 'Aura AI' (05/10)".

## 2026-10-05 — A fila adiada, e o buraco que o inventário achou

### O que FALTA, e depende de decisão do dono

Tirar as três ferramentas e o bloco do prompt do agente. Hoje ele continua
oferecendo a fila e recebendo a recusa da 0214 — honesto, mas desperdiça uma ida
ao banco e uma volta de conversa. O que sai, e como repor, está em
[`a-fila-no-agente.md`](a-fila-no-agente.md).

---

## 2026-10-05 — O aviso do imprevisto ganhou motor próprio (0215)

### O fluxo do n8n do aviso (05/10)

O fluxo `CRM Salão - Aviso de Imprevisto (Folga)` (`R4PMPsM96cVDF09b`) existe e segue **inativo de propósito** (conferido no n8n em 09/10). Para ligar, nesta ordem:

1. `update public.whatsapp_templates set ativo = true where chave = 'horario_cancelado_pela_barbearia';`
2. Ativar o workflow `R4PMPsM96cVDF09b`.

As credenciais não foram provadas pelo `test_workflow`: a primeira execução real é quem diz.

Contexto completo no histórico, em "O fluxo do n8n do aviso (05/10)".

### O lint caiu de 281 para 276 sozinho, e o motivo é bom (06/10)

Cinco avisos `react(purity)` de `new Date()` durante o render, pré-existentes, que o oxlint 1.86 passou a flagrar: `MiniCalendar.tsx:36`, `AgendaPublicaPage.tsx:782`, `FechamentoComissaoModal.tsx:122`, `VendasPage.tsx:1158` (rodapé, inofensivo) e `WhatsAppWebPage.tsx:160`. Merecem um olhar quando alguém passar por ali — não silenciar.

Contexto completo no histórico, em "O lint caiu de 281 para 276 sozinho, e o motivo é bom (06/10)".

### Giro completo de back e front (06/10)

Abertos do giro de 06/10:

- **Aviso de fim de teste nunca sai** (ALTO): `fim_de_teste` em rascunho; submeter `fim_do_teste_gratis` à Meta e só depois marcar `aprovado`.
- **Templates da fila recategorizados como MARKETING** (`vaga_ja_preenchida`, `espera_encerrada`): reavaliar quando a fila voltar.
- **Seis linhas `ativo = true` de template inexistente**; **deploy antigo `crm-salao-web` no ar** (e outros projetos parados na Vercel).
- **`authenticated` com TRUNCATE em 74 tabelas**; **cinco funções `private.*` sem `search_path`**; `notificacoes_vistas` reavaliando `auth.uid()` por linha; 7 índices sem uso, 18 FKs sem índice.
- Apagar `DIAS_DE_VALIDADE_DO_CONVITE` (`src/lib/planos.ts:27`) e o template `hello_world`. Não verificado: Sentry (exige autorização do dono) e o `errorWorkflow` dos 16 fluxos ativos.

Contexto completo no histórico, em "Giro completo de back e front (06/10)".

### O pedido de dono deixou de morrer com o CRM fechado (0216, 06/10)

Para LIGAR o e-mail ao dono quando o cliente pede uma pessoa: ativar o workflow `CRM Salão - Aviso de Pedido de Dono` (`tlkSsBL5clXvuuDT`), que segue **inativo** (conferido no n8n em 09/10). O motor e o prazo de devolução da 0216 já estão no ar.

Contexto completo no histórico, em "O pedido de dono deixou de morrer com o CRM fechado (0216, 06/10)".

### Duas telas rolavam de lado no celular (07/10)

Alvos de toque abaixo dos 44px da regra da casa, pré-existentes e no casco do app: o sino (34x34), o interruptor de tema (56x32), as setas do seletor de período (28x28) e um botão de 24x24 na agenda. Mexe em toda tela e merece uma passada própria.

Contexto completo no histórico, em "Duas telas rolavam de lado no celular (07/10)".

### Nome de exibição na Meta: o recurso reabriu a análise (07/10 e 08/10)

O nome do número central foi recusado **quatro vezes com o mesmo código**,
`BIZ_COMMERCE_VIOLATION_OTHER`: `Club_Cut` (08/09), `Club Cut` (14/09),
`Club Cut - Aura IA` (19/09) e `Aura IA - Club Cut` (06/10). Quatro formatos, um
motivo só: o bloqueio é a avaliação do **negócio**, não a grafia — e trocar a
grafia de novo é queimar tentativa.

**Onde o motivo mora.** Nem o WhatsApp Manager nem a Graph API mostram: ele chega
pelo webhook `phone_number_name_update` e fica gravado em
`public.eventos_da_waba`. Foi assim que as quatro recusas apareceram.

**Descartado:** a verificação de Tech Provider. Ela já está **verificada** no
portfólio, então não é ela que trava o nome.

**O recurso**, enviado em 07/10 pelo Suporte Direto ("Appeal Display Name
Rejection"), perguntou o ponto exato da política. A resposta veio por **chat**,
no painel lateral do caso, e não como comentário:

- **O suporte não enxerga o ponto da política** de um
  `BIZ_COMMERCE_VIOLATION_OTHER`. A pergunta principal ficou sem resposta, e
  nenhum chamado vai responder.
- **A análise foi reaberta.** Conferido na Graph API em 08/10:
  `new_display_name` = **"Aura IA - Club Cut"**, `new_name_status` =
  `PENDING_REVIEW` (na véspera era `DECLINED`). Prazo dito: 1 a 2 dias úteis.
- **Mandar outra variação reinicia a análise.** Se for aprovado, o nome que o
  cliente vê é "Aura IA - Club Cut", e não "Club Cut".

**Um caso anterior morreu por silêncio.** O de 20/09 recebeu da Meta, em 25/09,
um pedido de "informações adicionais" sem dizer quais, e foi fechado por
inatividade em 27/09. Caso fechado não reabre. A lista do Suporte Direto
esconde os fechados no filtro padrão — por isso ele passou despercebido.

**Pendente (fora do repositório):**
- **Aguardar a decisão**, que chega pelo webhook em `eventos_da_waba`. Não
  reenviar variação enquanto estiver em análise.
- **Site da AURA** (aurastudioai.com.br, que é o site cadastrado no portfólio
  verificado e portanto o que o revisor usa para ligar o nome à empresa): ele
  escreve o produto como **"ClubCut"**, junto, e linka para
  `clubcut.vercel.app/inicio`. O certo é **"Club Cut"** e **clubcut.space** —
  mesma grafia e mesmo endereço do nome pedido e do perfil comercial do número.

### A agenda pública em passos (0218, 08/10)

- **Token da CLI do Supabase**: o dono gerar um novo antes do próximo deploy pela CLI (o atual foi recusado em 08/10).
- **Primeira marcação de verdade** pela edge publicada, cobrindo o modo remarcar: barrada em 08/10; falta o dono decidir se marca ele mesmo pelo celular ou aprova a ação.
- **Remarcar abre em hoje**, e não no dia do próximo horário do barbeiro atual.
- **n8n:** o agente usar a régua do "qualquer um" quando o cliente não tem preferência — decisão do dono.
- **`agendar_pelo_agente` e `remarcar_pelo_cliente` não conferem quem faz o quê**: barbeiro pedido pelo nome que não faz o serviço passa.
- **Caminho antigo do `consultar`** (sem `versao: 2`) pode sair depois de alguns dias da tela nova no ar.

Contexto completo no histórico, em "A agenda pública em passos (0218, 08/10)".
