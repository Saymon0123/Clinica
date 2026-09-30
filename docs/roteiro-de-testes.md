# Roteiro de testes manuais — Club Cut

Gerado em 13/09/2026 lendo o código real (rotas, páginas, modais, edges, crons,
n8n). Entregue por etapas; este arquivo acumula todas.

---

# ETAPA 1 — INVENTÁRIO

## 1.1 Rotas e páginas ([src/App.tsx](../src/App.tsx))

### Públicas (sem login)

| Rota | Arquivo | O que é |
|---|---|---|
| `/inicio` | `src/features/site/VendasPage.tsx` | Landing de vendas. Visitante na raiz `/` cai aqui (redirect do `RequireAuth`) |
| `/sobre` | `src/features/site/SobrePage.tsx` | Página institucional, com contatos de `src/lib/contato.ts` |
| `/login` | `src/features/auth/LoginPage.tsx` | Login e-mail+senha |
| `/criar-conta` | `src/features/onboarding/CriarContaPage.tsx` | Passo 1 do cadastro aberto (signUp + confirmação de e-mail) |
| `/esqueci-senha` | `src/features/auth/ForgotPasswordPage.tsx` | Reset por **código de 6-10 dígitos**, duas etapas na mesma tela |
| `/redefinir-senha` | `src/features/auth/ResetPasswordPage.tsx` | Reset via link de e-mail (fluxo legado; ver "inacessível") |
| `/admin/nova-barbearia` | `src/features/adminTool/NovaBarbeariaPage.tsx` | Painel da operação, atrás de senha (`x-admin-secret`, validada no servidor) |
| `/convite/:token` | `src/features/equipe/AceitarConvitePage.tsx` | Aceite de convite (equipe ou dono) |
| `/agendar/:salonId` | `src/features/agendaPublica/AgendaPublicaPage.tsx` | Agenda pública do QR (14 dias, multi-serviço, `?remarcar=<token>`) |
| `/meu-horario/:token` | `src/features/agendaPublica/MeuHorarioPage.tsx` | O horário marcado do cliente final (ICS, mudar, cancelar) |
| `/termos`, `/privacidade` | `src/features/legal/*` | Conteúdo legal |

### Autenticadas (dentro do `AppLayout`, exceto `/web`)

| Rota | Arquivo | Guarda | Quem entra |
|---|---|---|---|
| `/` | `src/features/agenda/AgendaPage.tsx` | RequireAuth | todos os papéis |
| `/clientes` | `src/features/clientes/ClientesPage.tsx` | RequireAuth | todos (barbeiro vê só os dele — RLS) |
| `/financeiro` | `src/features/financeiro/FinanceiroPage.tsx` | RequireAuth | todos (barbeiro: só o próprio) |
| `/catalogo` | `src/features/catalogo/CatalogoPage.tsx` | RequireAuth | todos (escrita limitada por papel) |
| `/equipe` | `src/features/equipe/EquipePage.tsx` | RequireAuth + tela nega não-gestor | dono/gerente |
| `/ajuda` | `src/features/ajuda/AjudaPage.tsx` | RequireAuth | todos |
| `/rede` | `src/features/rede/RedePage.tsx` | RequireNetworkOwner | dono de 2+ unidades |
| `/rede/equipe` | — | redirect → `/equipe` | — |
| `/assinatura` | `src/features/assinatura/AssinaturaPage.tsx` | RequireManager | dono/gerente |
| `/conexao` | `src/features/conexao/ConexaoPage.tsx` | RequireManager | dono/gerente |
| `/configuracoes` | `src/features/configuracoes/ConfiguracoesPage.tsx` | RequireManager | dono/gerente |
| `/web` | `src/features/whatsappWeb/WhatsAppWebPage.tsx` | RequireAuth + RequireManager, **fora** do AppLayout | dono/gerente |

### Papéis e guardas

- Papéis (`user_salons.role`): `owner` / `gerente` / `barbeiro` ([SalonContext.tsx:7](../src/features/auth/SalonContext.tsx)).
- Derivados em `permissoes.ts`: `isManager` (dono ou gerente da unidade), `isOwner` (dono de alguma), `ehDonoDesta` (dono DA selecionada — é o que RPCs checam), `podeVerRede`/`isNetwork` (dono de 2+).
- `RequireAuth`: sem sessão → `/login` (ou `/inicio` se a rota era `/`).
- `RequireManager`: `!isManager` → `/`. `RequireNetworkOwner`: `!podeVerRede` → `/`.
- Estados do `AppLayout` antes de qualquer rota: erro de carga de vínculos (tela própria com "Tentar de novo"/"Sair"); zero unidades → `CriarBarbeariaPage` (passo 2 do cadastro); dono de rede sem unidade → redirect `/rede`; `assinatura.expirada` → `AcessoBloqueado` em tudo menos `/assinatura`.

## 1.2 Abas e sub-abas

| Página | Abas |
|---|---|
| Catálogo | **Serviços** / **Produtos** / **Pacotes** (pílulas no header) |
| Financeiro | **Visão geral** / **Vendas** + filtro Hoje/Mês com navegação de mês (‹ ›) |
| Financeiro › Visão | seções: cards KPI, gráfico clientes, meta (donut), top serviços, **Caixa** (`#caixa`), Comissões |
| `/web` | **Todas as conversas** / **Solicitou falar com o dono** (com contador); `?tab=precisa_dono`, `?conversa=<id>` |
| Painel admin | **Barbearias** (métricas+lista) / **Nova barbearia** (wizard 5 passos) / **Convidar** |
| Clientes | toggle Semana/Mês (card de novos), ordenação Nome/Última visita |
| Conexão | seção conexão (QR Evolution ou aviso Cloud API legado) + **Desempenho do agente** (Semana/Mês) + Tour |
| Rede | período Semana/Mês; totais, 2 gráficos, comparativo, produção por barbeiro |
| Assinatura | seções: Uso do sistema, Situação + Cancelar, Dados de cobrança, Cobrança da rede (só rede) |

## 1.3 Elementos interativos por tela (CRM)

### Shell — `AppLayout.tsx` + `ProfileMenu.tsx`
- Sidebar (desktop) / barra inferior ≤5 itens + folha **"Mais"** (mobile). Itens filtrados por `somenteGestor`/`somenteDono`/`semUnidade` — **barbeiro vê: Agenda, Financeiro, Clientes, Catálogo, Central de Ajuda**.
- Botão flutuante **WEB** (desktop, só gestor; pulsa vermelho com conversa pendente) → abre `/web` em nova aba.
- `ProfileMenu` (avatar): Painel da rede (só rede) · **Trocar de barbearia** (lista com papel por unidade; persiste em `localStorage salaocrm:unidade:<userId>`) · Central de Ajuda · **Enviar sugestão** (FeedbackModal) · **Sair**. Vira folha inferior no celular.
- `PilhaDeAvisos`: cartões **"Novo agendamento"** (realtime INSERT + som, vida de 15s, máx 3 + "e mais N") e **"<cliente> quer falar com você"** (`PedidoDeHumanoBanner`: Responder → `/web?conversa=id` · Resolvido → grava · Depois → adia local até nova mensagem).
- `AvisoAssinatura`: faixa quando faltam ≤3 dias de teste / vencido; link "Ver assinatura".
- `Tour` (Conexão): abre sozinho na 1ª visita (`localStorage salaocrm:tour:*`), botão `?` flutuante reabre; Esc/Pular/Próximo; passo sem âncora é pulado.
- `ThemeToggle` claro/escuro.

### Agenda — `AgendaPage.tsx`
- `CardAtivacao` (só gestor; some quando completo; **sem dispensar**). Itens ([useAtivacao.ts](../src/features/ativacao/useAtivacao.ts)): assinatura registrada · WhatsApp da barbearia (telefone) · Conectar o WhatsApp · Conferir o catálogo · Jornada da equipe · Comissão — cada um linka para a tela.
- `AvisoDeCancelamentos` (view `cancelamentos_a_avisar`, realtime): "cancelou/mudou de horário", botão **"Ok, vi"** grava `cancelamento_visto_em`.
- Stepper de dia (‹ data ›), `MiniCalendar` lateral (mês ‹ ›, dia clicável, hoje pontuado), card-herói "Reservas" (conta só vivas).
- Grade 06–22h, colunas por profissional (inativo com selo se tem horário no dia), sombras fora da jornada, linha do agora, meia-hora tracejada; auto-scroll para agora/abertura.
- **Clique em slot vazio** → `NewAppointmentModal` (pré: barbeiro+hora). Botão **"Nova reserva"** (2 lugares) → mesmo modal sem pré.
- **Clique em bloco** → `AppointmentDetailModal`.
- **Drag & drop** de bloco (só status vivo, só coluna de profissional ativo; snap 15min; 23P01 → erro traduzido com "fechar").

### `NewAppointmentModal` — campos: Cliente (texto), Telefone (opcional, régua `classificarTelefone`), Profissional (select, só ativos), **Adicionar serviço** (select+botão, multi, 1º = principal, remover por lixeira, duração total), Horário (time). Aviso "horário já passou → nasce concluído". Salvar (dedupe cliente por telefone via RPC `garantir_cliente`; multi-serviço via RPC `definir_servicos_do_agendamento` com rollback; compensação apaga cliente criado se a reserva falhar). Cancelar / X / véu / Esc (confirma descarte se sujo; `Modal.tsx`).

### `AppointmentDetailModal` — status/cliente/serviços (view `servicos_do_agendamento`)/início/fim; **Alterar data/horário** (date+time+barbeiro; não em estado final); **Concluir e cobrar** → `/financeiro?appointmentId=...` (vale também para `faltou`); **Cancelar agendamento** (confirmação inline); **Excluir** (confirmação inline; bloqueado se `concluido`).

### Clientes — `ClientesPage.tsx`
- **Importar** (gestor) → `ImportClientsModal`: file CSV, prévia em baldes (sem nome/telefone inválido/aniversário inválido/repetido no arquivo), **Baixar linhas recusadas**, Importar N (lotes de 50, 23505 = "já cadastrado"), resultado detalhado.
- **Exportar** (gestor, CSV) · **Adicionar** → `NewClientModal` (nome, telefone c/ aviso, aniversário, observação) — o mesmo modal edita.
- Busca nome/telefone (por dígitos), ordenação por Nome/Última visita (45+ dias em vermelho), link WhatsApp na linha (stopPropagation).
- **Clique na linha** → `ClientDetailModal`: editar (lápis) → NewClientModal; **opt-out** "Não enviar mais/Voltar a enviar" (`recusou_contato`); totais (gasto, concluídos); agendamentos recentes (15); `PacotesDoCliente` (view `saldo_de_pacotes`); compras recentes.

### Catálogo — `CatalogoPage.tsx`
- Serviços: **Novo serviço** (qualquer papel) → `NewServiceModal` (nome/duração/preço>0; criar vincula a todos os profissionais ativos); Editar/Desativar-Ativar por linha — barbeiro só no que criou (`podeMexer`), senão cadeado "Da gestão". Realtime recarrega.
- Produtos (gestor): **Novo produto** → `NewProductModal` (preço venda>0; estoque **só por movimento**: inicial na criação, ajuste ± na edição); **Repor** → `ReporEstoqueModal`; Editar; Desativar. Selo "baixo" quando `estoque_atual <= estoque_minimo`.
- Pacotes (gestor): **Novo pacote** → `NewPacoteModal` (itens qtd×serviço, preço, validade; cálculo de economia ao vivo; edição não afeta quem já comprou); Editar/Desativar.

### Financeiro — `FinanceiroPage.tsx` (+ vendas)
- Header: Hoje / ‹ Mês ›; chip **Caixa** (gestor; scroll até `#caixa`); **Exportar** (gestor) → `ExportReportModal` (Hoje/Semana/Mês do que está na tela → CSV).
- Visão: 4 KPIs com spark ("—" sob erro), gráfico novos clientes 12m, **Meta** (Definir/Alterar → `EditGoalModal`; `GoalReachedModal` confete 1×/mês, `localStorage crm_meta_celebrada_*`), Top serviços, **CaixaSection** (troco padrão; conferir gaveta `<details>` e fechar manualmente; abre sozinho na 1ª venda, fecha à meia-noite pelo cron), **Comissões** (gestor: **Fechar comissões** → `FechamentoComissaoModal`: mês, marcar pago/desfazer com confirmação inline; mês encerrado trava desfazer; teto de linhas avisa).
- Vendas: contagem+total do período; **Nova venda** → `NewSaleModal`; clique na linha → `VendaDetalheModal` (**Estornar** via RPC `estornar_venda`, só gestor, confirmação inline).
- Faixa **"Atendimento aguardando cobrança"** (pendência em `localStorage` via `vendaPendente`): Cobrar agora / **Concluir sem cobrar** / Dispensar.

### `NewSaleModal` (a comanda) — Cliente (select, opcional) · checkbox **"Avisar quando der tempo de voltar"** (vem marcado) · **Agendamento automático: semanas** (1–8; vazio com pausa mostrada) · cartões de saldo de pacote ("Usar 1 do pacote") e de pacote da própria comanda ("Descontar o de hoje") · **pergunta de vínculo** com horário de hoje do cliente ("Sim, é esse"/hora/"Não, é outra venda" — obrigatória responder) · Profissional (barbeiro só vê a si) · Adicionar item (Serviço/Produto/Pacote, qtd; estoque conferido; preço-zero recusado) · preço editável por item · remover item (pacote leva consumos juntos) · **Dividir pagamento** (linhas forma+valor, última completa o resto; falta/sobra avisada) · Total · Finalizar (comanda fechada + itens + pagamentos + baixa de estoque + comissões + pacotes/consumos + preferências + **conclui o horário vinculado**; rollback completo em falha) · Cancelar (confirma descarte se há itens).

### Equipe — `EquipePage.tsx`
- **Convidar para a equipe** → `ConviteModal` (nome, e-mail, função barbeiro/gerente, comissão %; gera link `/convite/<token>`; 23505 = convite aberto já existe). **Quero atender também** (só dono sem cadeira) → RPC `quero_atender`.
- Convites aguardando: Copiar link · Reenviar/Renovar link (vencido) · **Função** (papel+comissão via RPC `editar_convite`, não para convite de dono) · **Trocar e-mail** (confirm; RPC `trocar_email_do_convite` mata o link antigo) · Cancelar (confirm) · aviso persistente com "Copiar link".
- Membro: select de **função** (barbeiro/gerente/dono; só `ehDonoDesta`; trava "última dona" e auto-rebaixamento confirma; RPC `definir_papel_do_membro`) · **Comissão** (inline, Enter/Esc) · **Horário** → `HorarioBarbeiroModal` (7 dias, aviso "nunca salvo"; RPC `salvar_jornada`) · **Desativar/Ativar** (modal conta horários futuros) · **Tirar** (modal; RPC `tirar_da_equipe` = remove acesso).

### Conexão — `ConexaoPage.tsx`
- **Conectar WhatsApp / Gerar novo QR code** (edge `whatsapp` connect; QR vence em 40s com aviso; poll status 3s, 3 falhas param) · avisos `webhookOk`/`settingsOk` false · **Desconectar este número** (confirmação inline) · bloco legado "Conectado pela API oficial" (só `provedor='cloud_api'` com phone_number_id).
- `AgentDashboard`: Semana/Mês; 6 cards; bloco Reativação (se enviados>0).

### Configurações — `ConfiguracoesPage.tsx`
- Form: nome*, endereço, **WhatsApp da barbearia*** (obrigatório e válido), link Google Review, folga entre atendimentos (0–60), horário de funcionamento por dia (checkbox+abre/fecha; valida vazio e fecha≤abre) → Salvar.
- `AvisoDeJornada`: "abre no dia X e ninguém trabalha" → **Aplicar à jornada** (delete+insert em `professional_schedules`).
- `QrDoBalcao`: **Baixar cartaz em PDF** (gera no navegador), link copiável, **Desativar/Ativar o QR** (RPC `definir_agenda_publica`).
- **Adicionar unidade** (só `ehDonoDesta`) → `NovaUnidadeModal` (nome da rede se 1ª, nome*, endereço, WhatsApp*, copiar catálogo) → edge `add-salon-unit`; ao criar: troca para a unidade e vai à agenda.

### Assinatura — `AssinaturaPage.tsx`
- `UsoDoSistema`: medidor do mês (cobráveis, gerado, lembretes, reativações; "fora da cobrança" p/ interna); **cobrança aberta**: "Pagar com Pix" (QR+copia-e-cola) ou **"Gerar novo Pix"** (vencido; edge `cobrar-uso` ação `reemitir`); histórico de faturas (pago/pagar/acumula).
- Situação (teste/em dia/atrasada/vencida/sem documento) + **Cancelar o uso do sistema** (confirmação inline; edge `asaas` ação `cancelar`).
- `DadosDeCobranca`: CPF/CNPJ (valida local; update `subscriptions` com `.select()` p/ pegar RLS negando); vira linha compacta com "Alterar".
- `CobrancaDaRede` (só rede 2+): uso por unidade + total; **Receber cobrança única** (exige CPF/CNPJ; edge `asaas` `unificar-rede`) / **Voltar a uma por unidade**.
- `AcessoBloqueado` (tela cheia quando expirado): diz se o WhatsApp ainda atende; pede documento (se `sem_documento` e dono) ou manda ver assinatura; Ajuda; Sair.

### Rede — `RedePage.tsx`
- Semana/Mês; **Nova unidade**; 5 totais; gráfico diário; barras por unidade; comparativo (linha com **Abrir** = troca unidade e vai à agenda); produção por barbeiro (rede toda).

### `/web` — `WhatsAppWebPage.tsx`
- Abas Todas/Solicitou o dono (contador); busca; lista (iniciais, prévia, não-lida, badges "Pediu você"/"Agente pausado"); mestre-detalhe no celular (← volta).
- Conversa: barra de contexto do contato (cliente desde, atendimentos, **próximo horário**); **Ver resumo** → `ContextPopup` (1× por resumo, `localStorage`); **Devolver ao agente** (edge `whatsapp` `resume_agent`); thread com dias e blocos; compositor (Enter envia só com mouse; textarea cresce; enviar = edge `whatsapp` `send`, marca `agent_paused`).

### Ajuda — `AjudaPage.tsx`
- Busca; seções com `<details>` (perguntas passo a passo). Conteúdo estático.

### Painel admin — `/admin/nova-barbearia`
- Portão de senha (verificada no servidor; não persiste).
- Barbearias: `MetricasDoProduto` (9 números do funil) + `SalonList` (Atualizar; por linha: Editar → modal nome/endereço/telefone; Power ativa/desativa; status WhatsApp/equipe/agendamentos 30d).
- Nova barbearia: `SalonWizard` 5 passos (Tipo solo/única/rede → Unidades [+ adicionar/remover, dono atende] → Dono [comissão, teste 7d] → Funcionamento → Serviços padrão) → edge `admin-create-salon`; tela de sucesso com campos copiáveis (inclui senha temporária e mensagem WhatsApp pronta).
- Convidar: `ConvidarBarbearia` (nome+e-mail+teste+dono atende) → edge `admin-invite-salon` → link `/convite/<token>` + mensagem pronta.

## 1.4 Páginas do cliente final

### `/agendar/:salonId` — `AgendaPublicaPage.tsx`
Hero (iniciais, nome, pill aberto/fechado por `situacaoAgora`, endereço, chip **Falar com a barbearia** → wa.me) · porta **"Já tem horário marcado?"** · card **"Seu horário neste celular"** (localStorage `clubcut:horarios:<salonId>`, ação `meus_horarios` valida; esquecimento só com resposta do servidor) · serviços como **checkbox multi** (duração somada) · **faixa de 14 dias** (`dias_com_horario`; dias sem vaga desabilitados; cruza `horario_funcionamento`/jornada/relógio) · destaque "próximo horário" · horários por período (manhã/tarde/noite), **nome do barbeiro em cada botão quando há 2+** · form nome+telefone → **Confirmar** (`agendar`) · sucesso: resumo, link `/meu-horario/<token>`, **"Pôr na agenda do celular"** (ICS com VALARM), WhatsApp · modo `?remarcar=<token>`: banner, grade ignora o próprio horário (`p_ignorar_agendamento`), confirma via `remarcar_horario` (mesmo token). Estados: skeleton, erro (`desistiu`), QR desativado (aviso + WhatsApp), sem vaga (motivos de `semHorario.ts`), rate limit.

### `/meu-horario/:token` — `MeuHorarioPage.tsx`
Detalhe (todos os serviços, data/hora, barbeiro, barbearia) · **Mudar o horário** → `/agendar/:salonId?remarcar=<token>` · **Falar com a barbearia** (wa.me) · **Cancelar horário** (confirmação → ação `cancelar_horario`) · estados: carregando, token inválido/expirado, já cancelado.

### `/inicio` — `VendasPage.tsx`
Nav âncoras + menu mobile + "Sobre" + **Entrar**; `Calculadora` e `CalculadoraPreco` (inputs interativos); `FaqAccordion`; CTAs (→ `/criar-conta`); `CtaFixo`; **`WhatsAppPopup`** (agente de tira-dúvidas → webhook n8n `j2g3tdLZTlvs8sdP`, limite 8 perguntas/dia por sessão); link wa.me do `CONTATO`; skip-link.

## 1.5 Integrações e pontos externos

**Edge functions** (`supabase/functions/`, JWT ou segredo próprio):

| Função | Ações / gatilho |
|---|---|
| `agenda-publica` | `consultar` (dias+horários, rate-limit por IP), `agendar`, `meu_horario`, `meus_horarios` (≤5 tokens), `cancelar_horario`, `remarcar_horario`. Anônima; freios `taxa_excedida`, `salons_atendendo`, `recursos_ativos` |
| `whatsapp` | `connect`/`status`/`disconnect`/`send`/`resume_agent` — JWT de usuário; **exige `salonId`** (400 sem) |
| `whatsapp-webhook` | entrada da Cloud API da Meta (botões de opt-out "PARAR", nota de avaliação, respostas de reativação, fila `mensagens_recebidas`) |
| `criar-minha-barbearia` | passo 2 do cadastro aberto |
| `accept-invite` | `check` + aceite (cria conta OU vincula conta existente com senha) |
| `add-salon-unit` | nova unidade / cria a rede |
| `admin-create-salon` | `verify`/`create`/`list`/`toggle_salon`/`update_salon` (header `x-admin-secret`) |
| `admin-invite-salon` | convite de dono à distância |
| `admin-metricas` | funil do produto |
| `cobrar-uso` | fechamento → Pix AbacatePay; ação `reemitir` |
| `abacate-webhook` | eventos de pagamento do AbacatePay |
| `asaas` | `cancelar`, `unificar-rede`, `separar-rede` (nome histórico; paga-se via AbacatePay) |

**n8n** (16 fluxos ativos; nada fala com cliente sem passar por aqui):
`rJO1n7cFeNDIJyB5` Atendimento WhatsApp (o agente; ferramentas Supabase; contexto com horários do cliente) · `DW0nq1Jyp9xeOJwm` Lembretes 1h antes (10min) · `NsHcELIXrETknywa` Avaliação pós-atendimento (30min, template Meta) · `Fxc7WGhCoHu7KUe1` Reativação (30min, reserva de fila) · `Ly82IIUjQXSEfco6` Reentrega de mensagens (5min) · `7yliDoD9AaQp3Qcm` Auditoria do Agente (30min, e-mail) · `eyxshxgS73dd8UVk` Sentinela do webhook (30min) · `vF05VWFrN7ufgi9L` Alerta de estoque baixo · `Dz35hJOz7UJER1Ll` Aviso de fim de teste · `8Qh33uoFm4VqT1eO` Detalhamento de uso (e-mail) · `UqLCK8lElBR7iSze` Uso diário → CRM da Aura · `Fy9aqg14kCkhhNHW` Convite de equipe por e-mail · `BvWc74ctfqDZYmtK` Feedback dos donos · `MCA5cHn52f1k9sSf` Alerta de falha (error workflow) · `j2g3tdLZTlvs8sdP` + `FwP4yby1Z4OisZd4` popups de landing.

**Canais**: conversa cliente↔barbearia = **Evolution** (número da barbearia, QR); mensagens iniciadas pelo sistema = **Cloud API oficial** (número central Club Cut, templates). Pagamento = **AbacatePay** (Pix). E-mail = SMTP próprio (n8n) + e-mails de auth do Supabase. **Sem SMS. Sem storage de imagens no CRM** (mídia do WhatsApp trafega base64 pelo n8n; único upload do CRM é o CSV de clientes, lido no navegador). Sentry (front + edges, tags por salão).

## 1.6 Jobs automáticos

**pg_cron** (verificado no banco em 13/09):

| Job | Agenda | Efeito |
|---|---|---|
| `cancela-agendamentos-sem-comanda` | */5 min | 15min após o fim sem venda → `faltou` (presença deduzida) |
| `expira-reativacoes` | */15 min | reativação sem resposta expira (`cancelado_por='sistema'`) |
| `cria-reativacoes` | hora :10 | gera fila de reativação (quem topou N semanas) |
| `fechamento-diario-do-caixa` | 03:05 | fecha caixas abertos com o esperado |
| `estende-acesso-sem-debito` | 04:20 | renova acesso de quem não deve |
| `fechamento-mensal-de-uso` | dia 1, 09:00 | fecha faturas de uso |
| `poda-historico-antigo` | 07:30 | poda mensagens/avisos/eventos velhos |

**Gatilhos de banco relevantes ao teste**: `calcula_fim_do_agendamento` (fim = soma dos serviços), `trg_espelha_servico_principal` (principal → `appointment_services` ordem 1), `carimba_cancelamento` (`cancelado_por` deduzido), trigger de estoque 0109 (saldo = movimentos), abertura automática do caixa na 1ª venda, exclusion constraint de sobreposição + folga (23P01), CHECK de telefone (0128), destrava por documento (0156).

## 1.7 Permissões e RLS (verificado no banco)

- **47 de 47 tabelas** do `public` com RLS; **63 policies**.
- Regra por papel (a UI espelha, o banco garante): barbeiro lê só os próprios agendamentos/comissões/clientes que criou-atendeu; lança venda só no próprio nome (`orders: acesso conforme papel`); não lê conversas (`whatsapp_conversations: gestor`); produto/pacote só gestor; `user_salons` sem escrita via PostgREST (RPCs 0122); `salon_invites` sem UPDATE (RPCs 0128).
- Funções `horarios_livres`, `dias_com_horario`, `taxa_excedida`: EXECUTE só `service_role` (catracas em pgTAP).
- **Toda view** do `public` com `security_invoker=on` (catraca `views_com_invoker.test.sql`); `anon` revogado das sensíveis (`agendamentos_do_cliente`, `auditoria_pendente`, cobrança).
- Catracas existentes: `rls_isolamento_entre_saloes.test.sql`, `rls_isolamento_operacao.test.sql`, `tabelas_com_rls.test.sql` (32 arquivos pgTAP, 346 testes no CI).

## 1.8 Implementado mas inacessível / vestigial

1. **`/redefinir-senha`** (`ResetPasswordPage`) — nenhuma tela linka; só alcançável pelo link de e-mail se o template do Supabase ainda mandar `ConfirmationURL`. O fluxo vivo é o código de 6 dígitos em `/esqueci-senha`.
2. **Bloco "API oficial" da Conexão** — só renderiza para `whatsapp_connections.provedor='cloud_api'` com `phone_number_id`; no modelo híbrido atual nenhuma barbearia deveria cair aí.
3. **`salons.atraso_tolerado_minutos`** — coluna viva no banco (padrão 10), **sem UI** desde 11/09 e com o fluxo n8n "Política de Atraso" desligado (comentário em [ConfiguracoesPage.tsx](../src/features/configuracoes/ConfiguracoesPage.tsx)).
4. **`feedbacks`** — o modal grava; nenhuma tela do CRM lê (leitura via n8n "Feedback dos Donos").
5. **Aba Marketing** — citada no CLAUDE.md como história; **não existe** no código atual (nenhum arquivo `src/features/marketing`).
6. **`FwP4yby1Z4OisZd4` (Landing 2 — Fenié Pro)** — fluxo n8n ativo de outra landing, fora deste repositório.
7. Ferramentas do agente citadas no prompt e sem UI no CRM (por design): `Saldo de Pacotes`, `Registrar Avaliacao`, `Confirmar Presenca` — testáveis só pelo WhatsApp.

---

# ETAPA 2 — ÁRVORE DE CAMINHOS

Cada elemento clicável, até a folha. "esperado:" é o que a tela e o banco devem
mostrar. Arquivo de referência no título de cada árvore.

## 2.1 Visitante e cadastro (`VendasPage`, `CriarContaPage`, `CriarBarbeariaPage`)

```
[/] visitante sem sessão
└── Redirect → /inicio (RequireAuth)
    ├── Menu (âncoras) → rola a seção; celular: botão hambúrguer abre/fecha lista
    ├── "Sobre" → /sobre (links de contato: wa.me, mailto, instagram)
    ├── "Entrar" → /login
    ├── Calculadora / CalculadoraPreco → muda valores na tela (nada grava)
    ├── FAQ (details) → abre/fecha
    ├── CTA (fixo e do corpo) → /criar-conta
    └── WhatsAppPopup → conversa com o agente da landing (n8n j2g3tdLZTlvs8sdP)
        ├── 8ª pergunta do dia → esperado: recusa educada (limite por sessão)
        └── quer humano → o front leva ao WhatsApp (sem ferramenta de escalonamento)

[/criar-conta]
└── Formulário e-mail + senha
    ├── e-mail inválido → erro local, nada enviado
    ├── senha < mínimo → erro local
    ├── Criar conta (e-mail novo) → tela "Confira seu e-mail"
    │   ├── "Não recebi o e-mail" → reenvia; repetido em <1min → "Aguarde um minuto"
    │   └── link do e-mail → volta ao app com sessão → / → AppLayout detecta 0 unidades
    │       └── CriarBarbeariaPage (passo 2)
    │           ├── nome vazio / barbearia vazia / telefone vazio ou inválido → erro local
    │           ├── termos desmarcados → "É preciso aceitar os termos"
    │           ├── links termos/privacidade → nova aba (não perde o form)
    │           ├── Criar minha barbearia → edge criar-minha-barbearia → recarrega → Agenda com CardAtivacao
    │           ├── sessão perdida (link abriu noutro navegador) → tela "Entre de novo para continuar"
    │           │   ├── "Entrar de novo" → /login
    │           │   └── "Voltar ao formulário" → volta
    │           └── "Sair desta conta" → login
    └── Criar conta (e-mail JÁ cadastrado) → MESMA tela "Confira seu e-mail"
        (não revela que existe; texto diz "se já tinha conta, é só entrar")

[/esqueci-senha]
├── Etapa e-mail → "Enviar código" → SEMPRE avança (não revela cadastro)
│   └── erro de rate-limit → não avança, "Não foi possível enviar"
└── Etapa código → código + senha + confirmar
    ├── código incompleto → erro local
    ├── código errado/vencido → "Código inválido ou expirado"
    ├── senhas diferentes → erro
    ├── OK → sessão criada → navigate('/')
    └── "Não recebi o código" → volta à etapa e-mail
```

## 2.2 Login e shell (`LoginPage`, `AppLayout`, `ProfileMenu`)

```
[/login]
├── credencial errada → mensagem traduzida (mensagemDeErroDeLogin)
├── OK → /
│   ├── 0 unidades → CriarBarbeariaPage
│   ├── erro ao carregar vínculos → tela "Não foi possível carregar sua barbearia"
│   │   ├── "Tentar de novo" → refaz a consulta
│   │   └── "Sair desta conta" → login
│   ├── dono de rede sem unidade escolhida → /rede
│   └── assinatura expirada → AcessoBloqueado (tudo menos /assinatura)
├── "Esqueci minha senha" → /esqueci-senha
├── olho → mostra/oculta senha
└── "Criar conta grátis" → /criar-conta

[shell logado]
├── Itens do menu → navegam; barbeiro vê 5; troca de rota fecha folha "Mais" e menu do perfil
├── Botão "Mais" (celular, >5 itens) → folha; toque no véu fecha
├── Botão WEB (desktop, gestor) → /web em NOVA aba
├── Avatar (ProfileMenu)
│   ├── "Painel da rede" (só rede) → /rede
│   ├── unidade da lista → selecionarUnidade (persiste) → telas recarregam com a nova
│   ├── "Central de Ajuda" → /ajuda
│   ├── "Enviar sugestão" → FeedbackModal
│   │   ├── tipo Sugestão/Problema/Elogio → muda placeholder
│   │   ├── Enviar vazio → botão desabilitado
│   │   ├── Enviar → insert em feedbacks (com a rota atual) → "Recebido" → fecha sozinho
│   │   └── fechar com texto → confirma descarte
│   └── "Sair" → signOut → /login
├── Cartão "Novo agendamento" (realtime INSERT + som)
│   ├── X → some; sozinho some em 15s; 4º cartão → "e mais N reservas novas"
├── Cartão "quer falar com você"
│   ├── "Responder" → /web?conversa=<id> (nova aba)
│   ├── "Resolvido" → needs_human=false no banco; falha → toast de erro
│   └── "Depois" → some SÓ nesta aba; volta se o cliente mandar nova mensagem
└── Faixa AvisoAssinatura → "Ver assinatura" → /assinatura
```

## 2.3 Agenda (`AgendaPage`)

```
[Agenda]
├── CardAtivacao (gestor, incompleto)
│   └── item pendente → navega à tela que resolve; item feito = riscado; completo → card some
├── AvisoDeCancelamentos
│   └── "Ok, vi" → cancelamento_visto_em = now() → linha sai; UPDATE realtime traz novos
├── ‹ / › do dia e MiniCalendar (dia, ‹ mês ›) → recarrega grade; grade rola à abertura/agora
├── Card "Reservas" → conta só agendado+confirmado+concluido (não cancelado/faltou/bloqueio)
├── Clique em slot vazio (qualquer coluna, hora H)
│   └── Modal "Nova reserva" (barbeiro e H:00 preenchidos) → ver 2.4
├── Botão "Nova reserva" (toolbar; e no aviso de dia vazio) → mesmo modal sem pré
├── Clique em bloco → Modal "Agendamento" → ver 2.5
│   └── bloco cancelado/faltou fica atrás; um novo pode nascer por cima e continua clicável
└── Arrastar bloco (desktop)
    ├── para horário livre (mesma/outra coluna ativa) → UPDATE inicio/fim/professional_id → recarrega
    ├── para cima de outro / dentro da folga → 23P01 → erro com a frase do banco + "fechar"
    ├── para coluna de barbeiro INATIVO → drop não aceito (nada acontece)
    ├── bloco concluído/cancelado/faltou → não arrasta
    └── esperado: NENHUMA confirmação antes de soltar (ver risco R2)
```

## 2.4 Modal "Nova reserva" (`NewAppointmentModal`)

```
[Nova reserva]
├── Nome vazio → "Informe o nome do cliente."
├── Telefone
│   ├── vazio → segue (cliente sem WhatsApp é legítimo; busca por nome ilike)
│   ├── inválido → AVISO_TELEFONE_INVALIDO, não salva
│   └── válido → RPC garantir_cliente (acha por sufixo de 8 dígitos OU cria)
├── Profissional → só ativos; nenhum ativo → Salvar desabilitado
├── Adicionar serviço
│   ├── select vazio → botão desabilitado
│   ├── adicionar 1º → vira "principal"; mesmo serviço some do select (sem duplicar)
│   ├── adicionar 2º+ → duração total soma; lixeira remove
│   └── nenhum serviço → "Adicione ao menos um serviço."
├── Horário no passado (fim < agora) → aviso "vamos registrar como concluído"
│   └── Salvar → status 'concluido' (cron não cancela); aparece cinza-verde na grade
├── Salvar (caminho feliz)
│   ├── grava appointments (fim = duração do principal; RPC definir_servicos recalcula p/ multi)
│   ├── conflito/folga → 23P01 traduzido; multi que não cabe → frase própria "não cabem nesse horário"
│   ├── falha após criar cliente novo → cliente é APAGADO (sem órfão)
│   └── esperado no banco: appointment + appointment_services (1 linha por serviço, principal ordem 1)
├── Cancelar → fecha SEM perguntar (escolha explícita)
└── X / véu / Esc com algo digitado → window.confirm de descarte; salvando → não fecha
```

## 2.5 Modal "Agendamento" (`AppointmentDetailModal`)

```
[Agendamento]
├── "Alterar data/horário" (some em concluido/cancelado/faltou)
│   ├── data/hora vazias → erro; inválida → erro
│   ├── select de barbeiro (se 2+ ativos)
│   ├── "Salvar nova data" → UPDATE mantendo a duração; 23P01 → frase do banco
│   └── "Voltar" → restaura valores originais
├── "Concluir e cobrar" (some só em concluido/cancelado; PRESENTE em faltou)
│   └── → /financeiro?appointmentId=…&serviceIds=… → abre a comanda vinculada (ver 2.9)
├── "Cancelar agendamento" (só status vivo)
│   ├── 1º toque → confirmação inline "Sim, cancelar"/"Voltar"
│   └── confirmar → status=cancelado → toast "horário voltou a ficar livre"
│       └── esperado no banco: cancelado_por='barbearia' (sessão logada), cancelado_em=now()
├── "Excluir agendamento"
│   ├── status concluido → botão NÃO existe; texto explica (comanda ligada)
│   └── confirmar inline → DELETE; some da grade e do histórico do cliente
└── X/véu/Esc → fecha (modal de leitura, sem confirmação)
```

## 2.6 Clientes (`ClientesPage`, modais)

```
[Clientes]
├── Busca → filtra por nome OU dígitos do telefone; sem resultado → estado vazio de busca
├── Ordenar "Última visita" → mais sumido primeiro, "nunca veio" no fim; 45+ dias em vermelho
├── Link do telefone na linha → abre wa.me em nova aba (não abre a ficha)
├── "Adicionar" → NewClientModal
│   ├── nome vazio → erro; telefone inválido → aviso âmbar e erro só no salvar
│   ├── telefone JÁ cadastrado no salão → 23505 traduzido (índice por sufixo de 8 dígitos)
│   └── salvar OK → lista recarrega
├── Linha → ClientDetailModal
│   ├── lápis → NewClientModal em modo edição (mesmas regras)
│   ├── "Não enviar mais"/"Voltar a enviar" → recusou_contato alterna → sai/entra da reativação
│   ├── histórico: badges por status (inclui "Não veio")
│   └── PacotesDoCliente → barras de saldo; vencido/esgotado esmaecido
├── "Exportar" (gestor) → baixa clientes-AAAA-MM-DD.csv; 0 clientes → botão desabilitado
└── "Importar" (gestor) → ImportClientsModal
    ├── arquivo sem coluna Nome → erro; sem linhas → erro
    ├── prévia → baldes separados (sem nome / tel inválido / aniversário inválido / repetido)
    │   ├── "Baixar linhas recusadas" → CSV com as MESMAS colunas (corrigir e reimportar)
    │   └── todos recusados → botão Importar desabilitado + aviso
    ├── "Importar N clientes" → insere em lotes de 50; duplicado no banco → conta "já tinha cadastro"
    ├── reimportar o MESMO arquivo → onChange dispara (input zerado) e duplicatas viram "já cadastrado"
    └── fechar com arquivo lido e sem importar → confirma "Sair sem importar?"
```

## 2.7 Catálogo (`CatalogoPage`, modais)

```
[Catálogo]
├── Aba Serviços
│   ├── "Novo serviço" (qualquer papel) → nome/duração>0/preço>0; salvar vincula a TODOS os barbeiros ativos
│   ├── Editar (dono do cadastro ou gestor) → mesmo modal
│   ├── Desativar/Ativar → toast; inativo some da agenda pública e da comanda
│   └── barbeiro em serviço alheio → 🔒 "Da gestão" (sem botões)
├── Aba Produtos (só gestor tem ações)
│   ├── "Novo produto" → preço venda>0; estoque inicial vira MOVIMENTO 'entrada'
│   ├── Editar → ajuste ± vira movimento; estoque_atual NUNCA é escrito direto
│   ├── "Repor" → quantidade>0 → movimento 'entrada' → saldo sobe por trigger
│   └── Desativar → some da comanda
├── Aba Pacotes (só gestor)
│   ├── "Novo pacote" → incluir serviço+qtd (repetido → "edite a quantidade"), preço, validade
│   │   └── preço > avulso → aviso "MAIS CARO que o avulso" (deixa salvar)
│   ├── Editar → aviso "vale só para novas vendas"; composição substituída inteira
│   └── Desativar → some da comanda
└── Realtime: venda de outro aparelho atualiza estoque na tela em ~2s
```

## 2.8 Financeiro — Visão (`FinanceiroPage`, `CaixaSection`, `FechamentoComissaoModal`, `ExportReportModal`, `EditGoalModal`)

```
[Financeiro · Visão]
├── Hoje / ‹ Mês › → tudo recarrega; "próximo mês" além do corrente → desabilitado
├── Chip Caixa → rola até #caixa; texto "abre na 1ª venda" quando fechado
├── Meta
│   ├── "Definir/Alterar" → EditGoalModal (>0) → donut atualiza
│   ├── meta batida no mês corrente → GoalReachedModal (confete+som) UMA vez por mês
│   └── pílula "Meta atingida!" → reabre a comemoração
├── Caixa (gestor)
│   ├── fechado: "Troco padrão" → Salvar → vale a partir do próximo caixa
│   └── aberto: Abertura/Em dinheiro/Esperado; "Conferir a gaveta" (details)
│       ├── contagem vazia → "Informe quanto tinha"
│       ├── contagem ≠ esperado → "Sobrando/Faltando R$X"
│       └── "Registrar contagem e fechar o dia" → status fechado, fechado_automaticamente=false
├── Comissões
│   ├── lista por profissional (percentual gravado NA VENDA)
│   └── "Fechar comissões" → modal
│       ├── mês (input month) → recorte na consulta
│       ├── "Marcar como pago" → confirmação inline com valor e N comissões → pago=true
│       ├── "Desfazer" (mês não virado) → confirmação → pago=false
│       ├── mês encerrado → sem Desfazer; rodapé explica
│       └── >TETO_DE_LINHAS → aviso "lista pode estar incompleta"
└── "Exportar" → ExportReportModal (Hoje/Semana/Mês) → CSV 1 linha por item + TOTAL (soma dos PAGAMENTOS)
    └── período sem venda → "Nenhuma venda registrada …" (não baixa arquivo)
```

## 2.9 Vendas e comanda (`VendasSection`, `NewSaleModal`, `VendaDetalheModal`)

```
[Financeiro · Vendas]
├── Faixa "Atendimento aguardando cobrança" (pendência viva em localStorage)
│   ├── "Cobrar agora" → reabre a comanda vinculada
│   ├── "Concluir sem cobrar" → horário vira concluído SEM venda (cortesia)
│   │   ├── horário sumiu → toast "não está mais na agenda", pendência morre
│   │   └── 23P01 (cadeira reocupada) → toast explica, pendência morre
│   └── "Dispensar" → só limpa a faixa (horário vira "não veio" no prazo do cron)
├── "Nova venda" → NewSaleModal
│   ├── Cliente selecionado
│   │   ├── carrega saldos de pacote e preferências (aviso de retorno, semanas)
│   │   ├── tem horário HOJE (agendado/confirmado/faltou) → pergunta de vínculo
│   │   │   ├── "Sim, é esse"/hora específica → vincula; comanda vazia herda os serviços do horário
│   │   │   ├── "Não, é outra venda" → semVinculo registrado
│   │   │   └── NÃO responder → Finalizar recusa: "Responda acima…"
│   │   └── trocar de cliente → itens de pacote do anterior caem; vínculo sugerido cai
│   ├── Adicionar item
│   │   ├── produto acima do estoque → "Estoque insuficiente (disponível: N)"
│   │   ├── item de preço 0 no catálogo → recusado com instrução
│   │   ├── pacote sem cliente → "Escolha o cliente antes"
│   │   └── pacote adicionado → cartão verde "Descontar o de hoje" (consome do pacote da própria comanda)
│   ├── "Usar 1 do pacote" → item a R$0; passa do restante → recusa com o número
│   ├── preço editável por item; remover pacote remove os consumos dele
│   ├── "Dividir pagamento" → 2+ linhas; última auto-completa; falta/sobra → aviso e Finalizar recusa
│   ├── Finalizar → orders(fechada)+order_items+payments+stock_movements+commissions
│   │   +pacotes_do_cliente+pacote_consumos+preferências do cliente+horário→concluído
│   │   ├── qualquer falha → rollback total (comanda apagada, estoque devolvido) + erro
│   │   ├── horário vinculado sumiu/ocupado → mensagem própria mandando desvincular
│   │   └── esperado: caixa ABRE sozinho na 1ª venda do dia
│   └── Cancelar/X com itens → confirma "Descartar esta comanda?"
└── Linha da lista → VendaDetalheModal
    ├── itens, pagamentos ("Pix 30 + Dinheiro 20"), total
    ├── "Estornar venda" (gestor, comanda fechada) → confirmação inline
    │   ├── OK (RPC estornar_venda) → status cancelada; estoque volta; consumo de pacote volta;
    │   │   pacote comprado some; comissão desfeita; badge "Estornada"
    │   └── comissão já paga / já estornada / sem permissão → frase da RPC em português
    └── barbeiro → sem botão de estorno
```

## 2.10 Equipe (`EquipePage`, `HorarioBarbeiroModal`)

```
[Equipe]
├── "Convidar para a equipe"
│   ├── nome/e-mail vazio ou inválido → erro
│   ├── e-mail com convite ABERTO → 23505: "Apague o convite antigo…"
│   └── OK → link exibido + copiar; e-mail sai pela fila do n8n
├── Convite pendente
│   ├── "Copiar link" → clipboard, vira "Link copiado!"
│   ├── "Reenviar" / "Renovar link" (vencido) → mesma RPC com o e-mail atual: prazo +7d, fila de e-mail
│   ├── "Função" (não p/ convite de dono) → papel + comissão (RPC editar_convite)
│   ├── "Trocar e-mail" → confirm nativo (link antigo MORRE) → token novo + aviso persistente com copiar
│   └── "Cancelar" → confirm nativo → DELETE
├── Membro
│   ├── select de função (só dono desta unidade)
│   │   ├── tirar o ÚLTIMO dono → recusado ("ficaria sem dono")
│   │   └── rebaixar a si mesmo → confirm; depois recarrega permissões sem relogin
│   ├── "Comissão" → input inline (0–100; vazio = sem comissão); Enter salva, Esc cancela
│   ├── "Horário" → HorarioBarbeiroModal
│   │   ├── nunca salvo → aviso "Ainda não salvo" (agente não marca nada)
│   │   ├── entrada ≥ saída → erro
│   │   └── Salvar → RPC salvar_jornada (transação; folga = ativo=false)
│   ├── "Desativar" → modal com contagem de horários futuros → some das novas reservas (QR/agente),
│   │   coluna com selo "Inativo" enquanto tiver horário; acesso NÃO muda
│   └── "Tirar" → modal → RPC tirar_da_equipe → login dele deixa de ver a barbearia
└── "Quero atender também" (dono sem cadeira) → RPC quero_atender → vira profissional com
    jornada = horário do salão + todos os serviços
```

## 2.11 Conexão (`ConexaoPage`)

```
[Conexão]
├── "Conectar WhatsApp" → QR na tela
│   ├── 40s sem ler → véu "Este código venceu" → "Gerar novo QR code"
│   ├── ler no celular → poll detecta open → "Conectado e pronto para uso"
│   ├── webhookOk=false → aviso "o atendimento automático não vai responder"
│   └── settingsOk=false → aviso "pode responder em grupos"
├── status falhando 3× → para o poll + erro com instrução
├── "Desconectar este número" → confirmação inline → logout da instância → volta a "Não conectado"
├── (legado) provedor=cloud_api+phone_number_id → cartão "API oficial", sem QR
└── Desempenho do agente → Semana/Mês; bloco Reativação só com enviados>0
```

## 2.12 Configurações (`ConfiguracoesPage`, `QrDoBalcao`, `NovaUnidadeModal`)

```
[Configurações]
├── Salvar
│   ├── nome vazio → erro
│   ├── dia aberto sem abre/fecha → erro nomeando o dia
│   ├── fecha ≤ abre → erro nomeando o dia
│   ├── WhatsApp vazio → erro (é o botão "Falar com a barbearia" do QR)
│   ├── WhatsApp inválido → AVISO_TELEFONE_FORMATO
│   └── OK → "Salvo"; nome mudou → recarrega unidades (menu/título acompanham)
├── AvisoDeJornada (aparece se um dia aberto não tem NINGUÉM na jornada)
│   ├── "Aplicar à jornada de X / dos N barbeiros" → cria as linhas → aviso vira "Jornada aplicada"
│   └── ignorar → nada muda (escala manual na Equipe)
├── QR do balcão
│   ├── "Baixar cartaz em PDF" → PDF A4 gerado no navegador (QR + link em texto)
│   ├── "Desativar o QR" → RPC → bloco vira "está desativado" + explicação do que o cliente vê
│   └── "Ativar o QR do balcão" → volta
└── "Adicionar unidade" (só dono desta)
    ├── 1ª unidade da rede → campo extra "Nome da rede"
    ├── nome/WhatsApp obrigatórios → erros locais
    └── Criar → edge add-salon-unit → recarrega, SELECIONA a nova unidade e vai à Agenda dela
```

## 2.13 Assinatura (`AssinaturaPage` e filhos)

```
[Assinatura]
├── Uso do sistema
│   ├── barbearia interna (cobravel=false) → texto "fora da cobrança"
│   ├── cobrança aberta com Pix válido → "Pagar com Pix" → QR + copia-e-cola (botão Copiar)
│   ├── Pix VENCIDO → "Gerar novo Pix" → edge cobrar-uso reemitir
│   │   ├── OK → recarrega com código novo (mesmo valor/prazo)
│   │   └── recusa (já pago / ainda válido / sem permissão / limite) → frase da edge
│   └── histórico: pago / Pagar / Gerar novo Pix / "acumula"
├── Situação: teste (dias restantes) / em dia / atrasada / vencida / teste sem documento
├── "Cancelar o uso do sistema" → confirmação inline → edge asaas 'cancelar'
│   └── esperado: fatura parcial gerada na hora; acesso segue até o fim do pago
├── Dados de cobrança → CPF/CNPJ validado local → update subscriptions
│   ├── RLS nega (não-dono) → "Você não tem permissão…" (o .select() pega o update sem linha)
│   └── preenchido → vira linha compacta com "Alterar"
└── Cobrança da rede (dono de 2+)
    ├── "Receber uma cobrança única" → exige documento válido → edge asaas unificar-rede
    └── "Voltar a uma cobrança por unidade" → separar-rede

[AcessoBloqueado] (tela cheia, acesso vencido)
├── diz se o WhatsApp AINDA atende (e até quando) ou que também parou
├── sem_documento + dono → formulário de CPF/CNPJ ali mesmo → salvar DESTRAVA na hora
├── gestor (outros casos) → "Ver assinatura"; barbeiro → "avise o dono"
└── "Ajuda" / "Sair desta conta"
```

## 2.14 Rede (`RedePage`)

```
[Rede]
├── Semana/Mês → totais, gráficos, comparativo e produção recarregam
├── "Nova unidade" → NovaUnidadeModal (2.12); dono sem unidade escolhida usa a 1ª própria como origem
├── Comparativo → linha da unidade → "Abrir" → seleciona a unidade e vai à Agenda dela
└── gerente/barbeiro em /rede → redirect / (guard); dono de 1 unidade → texto explicativo
```

## 2.15 `/web` (`WhatsAppWebPage`)

```
[/web]
├── Abas Todas / "Solicitou falar com o dono" (badge com contagem)
├── Busca → filtra por nome/telefone; conversa aberta não some da thread ao filtrar
├── Conversa da lista → abre thread; marca last_opened_at (não-lida apaga)
│   ├── needs_human com resumo novo → ContextPopup (1× por texto de resumo)
│   ├── barra de contexto: cliente desde / atendimentos / PRÓXIMO horário
│   ├── "Ver resumo" → reabre o popup
│   ├── "Devolver ao agente" (aparece se pausado OU pediu dono) → edge resume_agent
│   │   └── esperado: agent_paused=false, needs_human=false; agente volta a responder
│   ├── digitar + Enter (mouse) ou botão enviar → edge send → mensagem sai pelo número da barbearia
│   │   └── esperado: agent_paused=true (o dono assumiu); erro → linha vermelha
│   └── celular: ← volta à lista
└── Vazios: sem conversas → CTA "Ver a conexão do WhatsApp"; aba dono vazia → texto próprio
```

## 2.16 Painel admin (`/admin/nova-barbearia`)

```
[Portão] senha → verify no servidor → errada: "Senha incorreta"; F5 → pede de novo (não persiste)
[Barbearias] funil (9 números) + lista
├── "Atualizar" → recarrega
├── Editar → modal nome/endereço/telefone → salvar
└── Power → ativa/desativa a barbearia (desativada: salons_atendendo derruba QR e agente)
[Nova barbearia] wizard Tipo→Unidades→Dono→Funcionamento→Serviços
├── validações por passo (nome, endereço, e-mail, telefone válido em algum lugar, ≥1 serviço)
├── rede → múltiplas unidades (+/lixeira), "dono atende" por unidade
└── Cadastrar → tela de sucesso com login/senha temporária/mensagem prontos p/ copiar → "Cadastrar outra"
[Convidar] nome+e-mail (+teste, +dono atende) → link /convite/<token> + mensagem pronta
```

## 2.17 Convite (`/convite/:token`)

```
[Convite]
├── token inexistente/vencido/já usado → "Convite indisponível" + motivo + link login
├── conta NOVA → cria senha (2×), termos obrigatórios → "Criar minha conta" → tela pronto → login
├── conta EXISTENTE → digita a senha ATUAL (sem repetição) → "Entrar e aceitar convite"
│   └── senha errada → erro da edge (não vincula)
├── convite de DONO → pede o nome; barbearia sem WhatsApp → pede o WhatsApp
└── termos/privacidade → nova aba (não perde o form)
```

## 2.18 Agenda pública (`/agendar/:salonId`) — cliente final

```
[/agendar/:salonId]
├── salonId inexistente OU barbearia desativada OU fora de salons_atendendo → aviso com WhatsApp (se houver)
├── QR desativado (recurso) → "agenda desligada" + botão WhatsApp
├── erro de rede → estado desistiu (avatar neutro + tentar de novo)
├── hero → chip "Falar com a barbearia" → wa.me com o telefone do salão
├── "Já tem horário marcado?" → explica o link guardado; com horários no aparelho → lista
├── card "Seu horário neste celular" → toque → /meu-horario/<token>
│   └── tokens são validados no servidor (meus_horarios); cancelado/vencido some SÓ com resposta
├── serviços (checkbox, multi) → duração total muda os horários oferecidos
├── faixa de 14 dias → dia sem vaga desabilitado; "próximo horário" destacado
├── período manhã/tarde/noite → botão de horário (nome do barbeiro quando 2+)
├── nome + telefone → validação; Confirmar → action agendar
│   ├── OK → tela de sucesso: resumo, link /meu-horario, "Pôr na agenda do celular" (.ics), WhatsApp
│   ├── horário tomado no meio → erro pedindo outro horário (lista recarrega)
│   └── rate limit (40/5min por IP) → recusa educada
└── ?remarcar=<token>
    ├── banner "mudando o horário de …"; grade IGNORA o próprio horário
    ├── confirmar → action remarcar_horario → MESMO token continua valendo
    │   └── esperado no banco: remarcado_pelo_cliente_em preenchido → aviso na Agenda do CRM
    └── token inválido → cai no fluxo normal com aviso
```

## 2.19 Meu horário (`/meu-horario/:token`)

```
[/meu-horario/:token]
├── token válido → serviços (todos), data/hora, barbeiro, barbearia
│   ├── "Mudar o horário" → /agendar/:salonId?remarcar=<token>
│   ├── "Pôr na agenda do celular" → baixa .ics (alarme 1h antes)
│   ├── "Falar com a barbearia" → wa.me
│   └── "Cancelar horário" → confirmação → action cancelar_horario
│       └── esperado: status=cancelado, cancelado_por='cliente' → aviso na Agenda do CRM
└── token inválido/expirado/cancelado → tela própria + WhatsApp da barbearia
```

---

# ETAPA 3 — ROTEIRO DE TESTE (sequencial, do zero)

Comece com base vazia (ou uma barbearia nova só deste teste). O estado de cada
linha alimenta a seguinte. Marque ☐→✅/❌ na coluna Status. "Banco" = consulta
no SQL editor do Supabase; "Externo" = o que deve disparar fora do CRM.

## Bloco 1 — Onboarding (cadastro aberto)

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 1.1 | Landing | navegador anônimo | Abrir `/` | Redireciona para `/inicio` (página de vendas), sem pedir login | — | — | ☐ |
| 1.2 | Popup da landing | em `/inicio` | Abrir o popup de WhatsApp, fazer 2 perguntas sobre o produto | Respostas coerentes; na 9ª pergunta do dia, recusa por limite | — | execução no n8n (fluxo do popup) | ☐ |
| 1.3 | Criar conta | e-mail nunca usado | `/criar-conta` → e-mail + senha ≥ mínimo → Criar conta | Tela "Confira seu e-mail" | `auth.users` com o e-mail, não confirmado | e-mail de confirmação do Supabase | ☐ |
| 1.4 | E-mail duplicado | conta de 1.3 existe | Repetir 1.3 com o MESMO e-mail | MESMA tela "Confira seu e-mail" (não revela que já existe) | sem usuário novo | — | ☐ |
| 1.5 | Reenviar confirmação | tela de 1.3 aberta | "Não recebi o e-mail" 2× seguidas | 1ª reenvia; 2ª imediata → "Aguarde um minuto" | — | 2º e-mail só após o intervalo | ☐ |
| 1.6 | Confirmar e cair no passo 2 | e-mail recebido | Abrir o link do e-mail | Entra logado e cai em "Vamos criar sua barbearia" (não na Agenda) | — | — | ☐ |
| 1.7 | Validações do passo 2 | tela de 1.6 | Tentar criar: sem nome; sem barbearia; telefone `123`; sem aceitar termos | Quatro erros claros, um por vez; nada criado | `salons` sem linha nova | — | ☐ |
| 1.8 | Criar a barbearia | 1.7 corrigido | Preencher nome, barbearia, WhatsApp válido, aceitar termos → Criar | Cai na Agenda com o card "Falta pouco para começar" | `salons` nova; `user_salons` role=owner; `subscriptions` em teste; `professionals` com o dono; aceite de termos registrado | — | ☐ |
| 1.9 | Sessão perdida no passo 2 | conta confirmada, sem sessão | Abrir o link de confirmação em OUTRO navegador e tentar criar | Tela "Entre de novo para continuar" (não um 401 cru) | — | — | ☐ |
| 1.10 | Esqueci a senha | conta de 1.8 | Sair → `/esqueci-senha` → e-mail → código recebido → senha nova | Entra direto na Agenda com a senha nova | — | e-mail com código | ☐ |
| 1.11 | Código errado | etapa do código | Digitar código inválido | "Código inválido ou expirado", senha não muda | — | — | ☐ |

## Bloco 2 — Configuração inicial

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 2.1 | Checklist de ativação | 1.8 | Ler o card na Agenda | Lista itens pendentes (WhatsApp, catálogo, jornada, comissão…); cada um navega à tela certa; sem botão de dispensar | — | — | ☐ |
| 2.2 | Horário de funcionamento | `/configuracoes` | Marcar seg–sáb 09–19; salvar | "Salvo"; erro se deixar dia aberto sem hora ou fecha≤abre | `salons.horario_funcionamento` | — | ☐ |
| 2.3 | Aviso de jornada | 2.2 salvo; abrir um dia novo (ex.: domingo) | Salvar com domingo aberto | Aviso "a barbearia abre e ninguém trabalha: domingo" → "Aplicar à jornada" cria as linhas | `professional_schedules` ganha o dia | — | ☐ |
| 2.4 | Telefone obrigatório | `/configuracoes` | Apagar o WhatsApp e salvar | Recusa: é o botão "Falar com a barbearia" do QR | telefone intacto | — | ☐ |
| 2.5 | Catálogo — serviço | `/catalogo` | Novo serviço "Corte" 40min R$45; depois "Barba" 30min R$30 | Aparecem ativos; preço 0 recusado | `services` 2 linhas; `professional_services` vinculando | — | ☐ |
| 2.6 | Catálogo — produto | aba Produtos | Novo produto "Pomada" venda 35, estoque inicial 10 | Estoque 10 | `products` + `stock_movements` 1 entrada de 10 | — | ☐ |
| 2.7 | Repor estoque | 2.6 | Repor +5 | Estoque 15; movimento gravado | `stock_movements` entrada 5, motivo reposição | — | ☐ |
| 2.8 | Pacote | aba Pacotes | Novo pacote "5 cortes" = 5× Corte, R$180, validade 90d | Card mostra economia vs avulso (R$225) | `pacotes` + `pacote_itens` | — | ☐ |
| 2.9 | Jornada do barbeiro | `/equipe` → Horário | Abrir o modal do dono: aviso "Ainda não salvo" se nunca salvou → Salvar | Aviso some; folga = dia desmarcado | `professional_schedules` 7 linhas (folga com ativo=false) | — | ☐ |
| 2.10 | Convite de equipe | `/equipe` | Convidar "Rafa" barbeiro 50% → copiar link → abrir o link em anônimo → criar senha, aceitar termos | Conta criada; Rafa aparece na Equipe como Barbeiro | `salon_invites.usado_em`; `user_salons` role=barbeiro; `professionals` Rafa | e-mail do convite (fila n8n) | ☐ |

## Bloco 3 — Agenda

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 3.1 | Reserva pelo slot | 2.x pronto | Clicar num quadrado vazio de amanhã 10:00 do Rafa → cliente "João" + telefone novo → Corte → Salvar | Bloco 10:00–10:40 na coluna do Rafa | `appointments` (fim=+40min); `clients` João; `appointment_services` 1 linha | cartão "Novo agendamento" + som nos outros aparelhos logados | ☐ |
| 3.2 | Multi-serviço | 3.1 | Nova reserva João amanhã 14:00 → Corte + Barba | Bloco 14:00–15:10 (70min somados) | `appointment_services` 2 linhas na ordem; `data_hora_fim` +70min | — | ☐ |
| 3.3 | Conflito | 3.2 | Tentar reservar Rafa amanhã 14:30 | Recusa 23P01 com frase clara; nada criado | sem linha nova | — | ☐ |
| 3.4 | Folga entre atendimentos | Configurações: folga 10min | Tentar reservar amanhã 15:15 (10:40+ colaria) | Recusa citando a folga; com folga 0 passa | — | — | ☐ |
| 3.5 | Cliente duplicado por telefone | 3.1 | Nova reserva com nome "Joao Silva" e o MESMO telefone | NÃO cria cliente novo (casa pelo telefone) | `clients` continua 1 João | — | ☐ |
| 3.6 | Lançamento retroativo | horário de hoje já passado | Nova reserva hoje numa hora que já passou | Aviso "vamos registrar como concluído"; bloco verde | `status='concluido'` direto | cron NÃO cancela | ☐ |
| 3.7 | Drag & drop | 3.1 | Arrastar o bloco das 10:00 para 11:00 | Move com snap de 15min; para cima de outro → erro traduzido e bloco volta | horários atualizados | — | ☐ |
| 3.8 | Alterar pelo modal | 3.2 | Abrir o bloco → Alterar data/horário → outro dia + outro barbeiro | Salva mantendo a duração | professional_id/data novos | — | ☐ |
| 3.9 | Cancelar | 3.1 | Abrir bloco → Cancelar → confirmar | Bloco riscado; horário liberado (dá para criar outro por cima) | `status=cancelado`, `cancelado_por='barbearia'` | — | ☐ |
| 3.10 | Excluir | 3.9 | Abrir o cancelado → Excluir → confirmar | Some da grade e do histórico do cliente | linha apagada | — | ☐ |
| 3.11 | Excluir concluído | 3.6 | Abrir o concluído | NÃO há botão excluir; texto explica (comanda) | — | — | ☐ |
| 3.12 | Presença deduzida | reserva para daqui ~30min, sem venda | Esperar 15min após o fim SEM lançar venda | Vira "não veio" sozinho (bloco riscado "não veio") | `status='faltou'` pelo cron | cron `cancela-agendamentos-sem-comanda` | ☐ |
| 3.13 | Corrigir a falta | 3.12 | Abrir o "não veio" → Concluir e cobrar → fechar a venda | Volta a concluído; comanda registrada | status=concluido; orders | — | ☐ |
| 3.14 | Barbeiro inativo com horário | Rafa com reserva futura | Equipe → Desativar Rafa (modal diz o nº de horários) | Coluna dele permanece com selo "Inativo"; não recebe reserva nova (slot/QR/agente); drop de drag não aceita | `professionals.ativo=false` | agente e QR deixam de oferecê-lo | ☐ |

## Bloco 4 — Clientes

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 4.1 | Adicionar | — | Adicionar "Maria" com telefone válido e aniversário | Na lista; telefone vira link wa.me | `clients` | — | ☐ |
| 4.2 | Telefone repetido | 4.1 | Adicionar "Maria 2" com o MESMO telefone | Recusa 23505 traduzida ("já cadastrado") | sem duplicata | — | ☐ |
| 4.3 | Telefone inválido | — | Adicionar com telefone "9999" | Aviso âmbar no campo; salvar recusa | — | — | ☐ |
| 4.4 | Editar | 4.1 | Ficha → lápis → mudar observação | Salvo; ficha atualiza | update em clients | — | ☐ |
| 4.5 | Opt-out | 4.1 | Ficha → "Não enviar mais" | Vira "Não quer receber convites"; reativação/campanha param; lembrete de horário continua | `recusou_contato=true` | some da fila de reativação | ☐ |
| 4.6 | Importar CSV | arquivo com 6 linhas: 2 boas, 1 sem nome, 1 tel inválido, 1 aniversário 31/02, 1 repetida | Importar → conferir prévia → confirmar | Prévia: "2 prontos" + 4 baldes separados; resultado igual à promessa; "Baixar recusadas" traz as 4 | 2 inserts | — | ☐ |
| 4.7 | Reimportar corrigido | 4.6 | Corrigir o CSV baixado e reimportar o mesmo arquivo | onChange dispara; boas entram, repetidas viram "já tinha cadastro" | — | — | ☐ |
| 4.8 | Exportar | 4.x | Exportar | CSV baixa com todos os campos | — | — | ☐ |

## Bloco 5 — Financeiro, vendas e caixa

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 5.1 | Troco padrão | caixa fechado | Financeiro → Caixa → troco 50 → salvar | "Vale a partir do próximo caixa" | `salons.troco_padrao=50` | — | ☐ |
| 5.2 | Concluir e cobrar | reserva de hoje (3.x) | Agenda → bloco → Concluir e cobrar | Cai na aba Vendas com a comanda aberta, serviços do horário pré-lançados e faixa verde "Venda do horário das HH:MM" | — | — | ☐ |
| 5.3 | Primeira venda abre o caixa | 5.1 e 5.2 | Finalizar a venda (Pix) | Toast "Venda registrada"; chip vira "Caixa aberto"; horário concluído | `orders` fechada; `cash_registers` aberto com 50; appointment concluido | — | ☐ |
| 5.4 | Pergunta de vínculo | cliente com horário HOJE | Nova venda → escolher esse cliente | Pergunta "é do horário das HH:MM?"; Finalizar sem responder → recusa | — | — | ☐ |
| 5.5 | Venda com produto | estoque 15 | Vender 2 Pomadas | Estoque 13; tentar vender 20 → "Estoque insuficiente (disponível: 13)" | `stock_movements` saída 2 | tela do Catálogo atualiza sozinha (realtime) | ☐ |
| 5.6 | Pagamento dividido | comanda R$80 | Dividir: Pix 50 + Dinheiro 30; testar 50+20 | Última linha auto-completa; falta/sobra bloqueia Finalizar | `payments` 2 linhas | — | ☐ |
| 5.7 | Desconto por item | comanda aberta | Editar o preço do serviço de 45 → 40 | Total recalcula; catálogo NÃO muda | order_item com 40 | — | ☐ |
| 5.8 | Vender pacote + descontar o de hoje | 2.8 | Vender "5 cortes" para Maria e usar "Descontar o de hoje" | Item pacote R$180 + item Corte R$0; comissão só sobre o pacote | `pacotes_do_cliente` + `pacote_consumos` | — | ☐ |
| 5.9 | Usar saldo de pacote | 5.8 em dia seguinte | Nova venda Maria → "Usar 1 do pacote" | Corte a R$0; saldo cai (4 de 5); passar do saldo → recusa com número | consumo novo | — | ☐ |
| 5.10 | Comissão | Rafa 50% | Venda de serviço do Rafa R$45 | Comissões do período mostram R$22,50 | `commissions` valor 22.50 | — | ☐ |
| 5.11 | Estorno | 5.5 | Abrir a venda → Estornar → confirmar | Badge "Estornada"; estoque volta (15); comissão desfeita; saldo de pacote volta se havia consumo | orders cancelada; movimentos revertidos | — | ☐ |
| 5.12 | Fechar comissões | 5.10 | Fechar comissões → Marcar como pago → Desfazer | Confirmações inline; desfazer devolve para "a pagar"; mês virado não desfaz | `commissions.pago` | — | ☐ |
| 5.13 | Conferir a gaveta | caixa aberto | Contagem = esperado → fechar; reabrir dia seguinte | "Bateu certinho"; divergência mostra sobra/falta | `cash_registers` fechado manual | fechamento automático 03:05 se não conferir | ☐ |
| 5.14 | Meta | — | Definir meta 500 → vender até passar | Donut enche; confete UMA vez; revisitar o mês não repete | `salons.meta_faturamento_mensal` | — | ☐ |
| 5.15 | Exportar relatório | mês com vendas | Exportar → Mês | CSV com 1 linha por item; TOTAL = soma dos pagamentos = card Faturamento | — | — | ☐ |
| 5.16 | Cobrança pendente sobrevive | 5.2 sem finalizar | Fechar o modal → F5 → voltar ao Financeiro | Faixa "Atendimento aguardando cobrança" com nome e hora; Cobrar agora reabre; Concluir sem cobrar conclui sem venda | — | — | ☐ |

## Bloco 6 — Integrações (QR, agente, mensagens, cobrança)

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 6.1 | Conectar WhatsApp | celular da barbearia em mãos | Conexão → Conectar → ler o QR em <40s | "Conectado e pronto"; sem avisos amarelos | `whatsapp_connections` open | instância Evolution + webhook apontado ao n8n | ☐ |
| 6.2 | QR vencido | 6.1, sem ler | Esperar 40s | Véu "Este código venceu" → Gerar novo | — | — | ☐ |
| 6.3 | Agente atende | 6.1 | De OUTRO número: "quero cortar amanhã às 15" | Agente lista horários reais e marca; reserva aparece na Agenda em segundos + cartão/som | appointment origem='agente' | execução no fluxo Atendimento | ☐ |
| 6.4 | Agente sabe o horário do cliente | 6.3 | Mesmo número: "já tenho horário, qual é mesmo?" | Responde DIA + HORA + serviços corretos (contexto lido do banco, não do histórico) | — | execução com contexto | ☐ |
| 6.5 | Pedir o dono | 6.3 | "quero falar com o dono" | Banner em qualquer tela do CRM + aba do /web com contagem; resumo do agente ao abrir | needs_human=true | — | ☐ |
| 6.6 | Responder e devolver | 6.5 | Responder pelo /web; depois "Devolver ao agente" | Sua mensagem chega ao cliente; agente fica mudo enquanto pausado e volta ao devolver | agent_paused alterna | Evolution envia | ☐ |
| 6.7 | QR do balcão ponta a ponta | QR ativo | Celular anônimo → `/agendar/<salonId>` → 2 serviços → dia+hora → confirmar | Sucesso com link; reserva na Agenda; duração somada | origem='publico'; token gerado | — | ☐ |
| 6.8 | Lembrete 1h antes | reserva daqui a ~1h com telefone real | Aguardar a janela | Mensagem de confirmação chega pelo número CENTRAL com o nome da barbearia; não duplica | `lembrete_enviado` marcado | template Meta via Cloud API | ☐ |
| 6.9 | Cliente cancela pelo link | 6.7 | `/meu-horario/<token>` → Cancelar | Aviso na Agenda "cancelou sozinho" até "Ok, vi" | cancelado_por='cliente' | — | ☐ |
| 6.10 | Cliente remarca pelo link | 6.7 | Meu horário → Mudar o horário → outro dia | Mesmo token segue valendo; aviso "mudou de horário" na Agenda | remarcado_pelo_cliente_em | — | ☐ |
| 6.11 | Avaliação pós-atendimento | venda concluída c/ telefone real | Aguardar o ciclo (30min) | Pedido de nota chega; responder 5 → agradecimento + link do Google (se configurado) | avaliação registrada | fluxo Avaliação + template | ☐ |
| 6.12 | Reativação | venda com "semanas = 1" (para encurtar, ajustar a data no banco) | Aguardar o ciclo | Convite chega pelo central; "confirmar" cria a reserva; silêncio expira sozinho | fila de reativação; appointment novo | fluxo Reativação | ☐ |
| 6.13 | Pix do fechamento | fatura fechada com documento salvo | Assinatura → Pagar com Pix | QR + copia-e-cola; pagar → acesso estendido via webhook | fatura paga_em | AbacatePay + webhook | ☐ |
| 6.14 | Pix vencido | 6.13 com código expirado | "Gerar novo Pix" | Código novo, mesmo valor/prazo; recusas com frase clara | pix novo registrado | cobrar-uso reemitir | ☐ |

## Bloco 7 — Permissões por papel

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 7.1 | Menu do barbeiro | logar como Rafa | Conferir o menu | Só Agenda, Financeiro, Clientes, Catálogo, Ajuda; sem botão WEB | — | — | ☐ |
| 7.2 | URLs de gestor | Rafa | Digitar `/equipe`, `/conexao`, `/configuracoes`, `/assinatura`, `/web`, `/rede` | Todas voltam para `/` (ou recusam na tela); nada renderiza dados | — | — | ☐ |
| 7.3 | Agenda do barbeiro | Rafa | Abrir a Agenda | Vê a grade; RLS decide o que ele lê — anotar o que aparece | — | — | ☐ |
| 7.4 | Clientes do barbeiro | Rafa | Abrir Clientes | Só clientes que ele criou/atendeu; sem Importar/Exportar | RLS | — | ☐ |
| 7.5 | Financeiro do barbeiro | Rafa | Abrir Financeiro | Subtítulo "Seus atendimentos e sua comissão"; números só dele; sem caixa/meta/fechar comissões/exportar | RLS | — | ☐ |
| 7.6 | Venda no nome do outro | Rafa | Nova venda | Seletor de profissional só mostra o próprio Rafa | policy orders | — | ☐ |
| 7.7 | Catálogo do barbeiro | Rafa | Criar um serviço; tentar editar um da gestão | Cria o dele; nos outros vê 🔒 "Da gestão"; Produtos/Pacotes sem ações | RLS/created_by | — | ☐ |
| 7.8 | Estorno do barbeiro | venda dele | Abrir a venda | SEM botão Estornar (e a RPC recusaria) | RPC 42501 | — | ☐ |
| 7.9 | Gerente | promover Rafa a gerente | Repetir 7.2 | Agora entra em Equipe/Conexão/Configurações/Assinatura/web; segue sem /rede; não muda função de ninguém (select some) | user_salons role | — | ☐ |
| 7.10 | Último dono | Equipe | Tentar rebaixar o único dono | Recusa "ficaria sem dono" (na tela e na RPC) | — | — | ☐ |

## Bloco 8 — Multi-tenant e rede

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 8.1 | Segunda barbearia | outra conta (B) | Repetir bloco 1 com outro e-mail | Barbearia B independente | — | — | ☐ |
| 8.2 | Isolamento visual | A e B com dados | Logado em A: conferir Agenda/Clientes/Financeiro/web | NADA de B aparece em lista nenhuma | RLS | — | ☐ |
| 8.3 | ID alheio na URL | logado em A | Abrir `/agendar/<salonId de B>` (público — deve funcionar) e tentar dados de B nas telas internas trocando IDs onde houver | Público de B funciona (é público); telas internas nunca mostram B | — | — | ☐ |
| 8.4 | REST com anon | ver Etapa 5 | Chamadas diretas ao PostgREST | Tabelas negadas; views sensíveis negadas a anon | RLS/grants | — | ☐ |
| 8.5 | Virar rede | conta A | Configurações → Adicionar unidade (nome da rede + unidade 2) | Aba Rede aparece; seletor de unidades no avatar; entra na unidade nova | organizations; salons 2 | — | ☐ |
| 8.6 | Troca de unidade | 8.5 | Alternar unidades pelo avatar | Agenda/Clientes/etc. trocam TODOS os dados; título da aba muda; escolha sobrevive ao F5 | — | — | ☐ |
| 8.7 | Rede — comparativo | vendas nas 2 | `/rede` | Totais = soma; "Abrir" troca a unidade; produção por barbeiro cruza unidades | — | — | ☐ |
| 8.8 | Cobrança única | 8.5 | Assinatura → Cobrança da rede → unificar (com CPF/CNPJ) | Preferência salva; sem documento → recusa clara | organizations.cobranca_unificada | — | ☐ |
| 8.9 | Conexão por unidade | 8.5 | Conectar o WhatsApp da unidade 2 | QR/instância PRÓPRIOS (`salon-<id>`); desconectar a 2 não afeta a 1 | whatsapp_connections por salão | Evolution 2 instâncias | ☐ |
| 8.10 | Convite multi-conta | dono de A convidado como barbeiro em B | Aceitar o convite com a conta existente | Digita a senha ATUAL; B aparece no seletor com papel "Barbeiro" | user_salons 2 linhas | — | ☐ |

## Bloco 9 — Sino de notificações (adicionado em 14/09)

| # | Fluxo | Pré-condição | Passo a passo | Resultado esperado | Banco | Externo | Status |
|---|---|---|---|---|---|---|---|
| 9.1 | Sino aparece | logado, unidade escolhida | Olhar o cabeçalho (celular) / rodapé da sidebar (desktop) | Ícone de sino; sem badge quando não há nada novo | — | — | ☐ |
| 9.2 | Badge conta | marcar um horário pelo QR (6.7) SEM abrir o sino | Badge vermelho "1" aparece sozinho (realtime) | `notificacoes_do_salao` 1 linha | — | ☐ |
| 9.3 | Abrir zera e marca | 9.2 | Abrir o sino | Painel lista o evento com pontinho; badge some; fechar e reabrir → sem pontinho | `notificacoes_vistas.visto_em` gravado | — | ☐ |
| 9.4 | Histórico sobrevive | 9.3 | Esperar o cartão de 15s sumir, navegar, voltar, F5 | O evento continua no sino (7 dias) | — | — | ☐ |
| 9.5 | Cancelou/remarcou | cliente cancela e remarca pelo link (6.9/6.10) | Abrir o sino | Um item "cancelou o horário" (era …) e um "mudou o horário" (agora é …) | tipos cancelou/remarcou | — | ☐ |
| 9.6 | O que o dono faz não notifica | criar reserva pela própria Agenda | Sino | NÃO aparece (origem crm) | — | — | ☐ |
| 9.7 | Por pessoa | dono abre o sino; logar como barbeiro | Sino do barbeiro | Badge do barbeiro é dele (não zerou com a leitura do dono) e a lista só tem horários DELE | `notificacoes_vistas` 1 linha por pessoa | — | ☐ |
| 9.8 | Vazio e erro | barbearia nova / rede desligada | Abrir o sino | Vazio explica ("fica registrado por 7 dias"); sem rede → erro com "Tentar de novo", nunca lista zerada mentindo | — | — | ☐ |

---

# ETAPA 4 — CASOS NEGATIVOS E DE BORDA

Executar depois do roteiro (ou junto, quando a linha citar). Referências entre
parênteses apontam a linha do Bloco correspondente.

**Entradas hostis**
- Nome de cliente com 300 caracteres, emoji, `<script>alert(1)</script>`, aspas — em: Novo cliente, Nova reserva, comanda, convite, nome da barbearia. Esperado: grava como texto, telas e e-mails não executam nada, layout não estoura (truncate).
- Telefones: `123`, letra no meio, 14+ dígitos, com máscara `(41) 98727-5895` vs sem — a régua é uma só (10–13 dígitos) em toda porta (2.4, 4.3); duplicidade casa por sufixo de 8 dígitos.
- CSV: separador `;`, BOM, linha em branco no meio (o número da linha exibido deve ser o do Excel), 500 linhas (lotes de 50), coluna Nome ausente.
- CPF/CNPJ: dígito verificador errado → recusa local (Assinatura/Cobrança da rede).
- Datas: aniversário 31/02 (import recusa); mês de fevereiro no Financeiro; reserva na virada do dia (23:40 +40min).

**Concorrência e duplo clique**
- Duplo clique em: Salvar reserva, Finalizar venda, Marcar como pago, Power do barbeiro. Esperado: 1 registro só (botões desabilitam com `submitting`/`salvandoMembro`); conferir no banco a contagem.
- Dois aparelhos marcando o MESMO horário (um pela Agenda, outro pelo QR): o segundo recebe 23P01/erro educado, nunca dois registros (exclusion constraint).
- Estornar a mesma venda em dois aparelhos: o segundo recebe "já estornada".
- Editar o pacote enquanto um cliente o compra na comanda: a venda congela a composição do momento (`pacote_do_cliente_itens`).

**Rede caída / serviços fora**
- Derrubar a internet e abrir Agenda/Clientes/Financeiro/Rede/web: esperado banner "Tentar de novo" e traço "—" nos números — NUNCA "0 reservas/R$ 0,00/lista vazia" (foi defeito real, achado 31).
- Sessão expirada com a aba aberta há horas: renovação silenciosa; se o refresh token venceu → volta ao login, sem tela de "sem barbearia".
- n8n fora do ar + cliente manda WhatsApp: mensagem entra na fila e é reentregue em até 5min (Bloco 6/Etapa 6); 5 tentativas ou 24h tiram da fila.
- Evolution desconectada: agente mudo; Sentinela avisa por e-mail em até 30min; conectar de novo reaponta o webhook.
- Edge `whatsapp` sem `salonId` (chamada manual): 400 "É preciso dizer em qual salão mexer" — nunca mexe numa unidade aleatória.

**Navegação abrupta**
- F5 com modal aberto: comanda → pendência sobrevive na faixa (5.16); demais modais → estado se perde sem gravar nada pela metade (conferir banco).
- Voltar do navegador no meio do wizard admin / do convite: nada criado até o submit final.
- Fechar por véu/Esc com formulário sujo: TODOS os modais de escrita perguntam antes (Modal.confirmarFechamento); "Cancelar" explícito não pergunta.
- Deploy no meio do uso (chunk velho): a página se recarrega UMA vez sozinha e segue (App.tsx `importarComRecarga`).

**Apagar o que está em uso**
- Desativar serviço com reserva futura: reserva existente fica; some das novas portas (comanda/QR/agente).
- Desativar produto com estoque: histórico intacto.
- Desativar barbeiro com agenda cheia (3.14); Tirar da equipe: histórico e comissões ficam, acesso morre.
- Excluir agendamento concluído: bloqueado com explicação (3.11).
- Cancelar → recriar → cancelar o mesmo horário 3×: cada ciclo carimba certo (`cancelado_por`), avisos do CRM não duplicam.
- Remarcar pelo link várias vezes seguidas: mesmo token sempre; grade nunca é bloqueada pelo próprio horário.

**Listas vazias e grandes**
- Barbearia recém-criada: TODA tela deve ter estado vazio com ação (Agenda→Equipe, Clientes→Adicionar, Vendas, Conversas→Conexão…).
- 200+ clientes (via import): busca continua fluida; export completo.
- Mês com >TETO de comissões: aviso de lista incompleta aparece (5.12).
- Grade com 5+ barbeiros no celular: scroll lateral mantém a régua de horas e os nomes fixos.

**Fuso e relógio**
- Agenda pública SEMPRE em America/Sao_Paulo (fixado no servidor); testar com o celular em outro fuso: horários não mudam.
- CRM usa o relógio do aparelho: anotar divergências se o computador estiver em outro fuso (risco R6).
- Reserva 23:50 → cron de "não veio" só após o fim; virada de mês no Financeiro entre 21h e 0h do dia 31 (comemoração não pode repetir).

---

# ETAPA 5 — MULTI-TENANT E PERMISSÕES (crítico)

Monte DUAS barbearias (A e B) com donos diferentes + 1 barbeiro em A. Papéis ×
telas já estão no Bloco 7; aqui é o que NÃO se vê pela interface.

**5.1 O que provar**
1. Nenhuma lista de A mostra linha de B (Agenda, Clientes, Financeiro, Catálogo, Equipe, /web, avisos realtime, exportações CSV).
2. Realtime não vaza: com A aberto, criar agendamento em B → NENHUM cartão/som em A (os canais filtram `salon_id=eq.`).
3. Aviso de cancelamento de B não aparece na Agenda de A (view com `security_invoker`).

**5.2 Direto na API (a parte que esconde botão não cobre)**
Pegue a URL do projeto e a chave `anon` (públicas — estão no bundle do site) e o
`access_token` de um usuário logado (DevTools → localStorage `sb-…-auth-token`).

```bash
URL="https://<ref>.supabase.co"; ANON="<anon key>"; TOK="<access_token do barbeiro de A>"

# 1. anon lendo tabela: esperado []
curl -s "$URL/rest/v1/clients?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

# 2. anon lendo views sensíveis: esperado erro de permissão (42501), não linhas
curl -s "$URL/rest/v1/agendamentos_do_cliente?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
curl -s "$URL/rest/v1/auditoria_pendente?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

# 3. usuário de A pedindo dados de B explicitamente: esperado []
curl -s "$URL/rest/v1/appointments?salon_id=eq.<SALON_B>&select=*" -H "apikey: $ANON" -H "Authorization: Bearer $TOK"
curl -s "$URL/rest/v1/clients?salon_id=eq.<SALON_B>&select=*" -H "apikey: $ANON" -H "Authorization: Bearer $TOK"
curl -s "$URL/rest/v1/whatsapp_conversations?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $TOK"   # barbeiro: [] mesmo em A

# 4. escrita cruzada: esperado erro/0 linhas
curl -s -X POST "$URL/rest/v1/appointments" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" -d '{"salon_id":"<SALON_B>", …}'
curl -s -X PATCH "$URL/rest/v1/user_salons?id=eq.<meu vinculo>" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" -d '{"role":"owner"}'          # escrita revogada (RPC-only)
curl -s -X PATCH "$URL/rest/v1/salon_invites?id=eq.<convite>" …      # idem

# 5. funções internas: esperado 42501 para anon E authenticated
curl -s -X POST "$URL/rest/v1/rpc/horarios_livres" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" -d '{"p_salon_id":"<A>","p_data":"2026-09-20","p_duracao_minutos":30}'
```

**5.3 Portas anônimas com freio**
- `agenda-publica` `consultar` 41× em 5min do mesmo IP → a partir do limite, recusa educada.
- `meus_horarios` com token chutado → simplesmente omitido (sem erro que confirme existência).
- Painel admin com senha errada → recusa; sem a senha nenhuma ação (`list/create/toggle`) responde.

**5.4 Rede**
- Dono de A+B (rede) vê as duas; um GERENTE da unidade A: sem `/rede`, sem cobrança da rede, sem trocar função.
- `add-salon-unit` chamado por não-dono (via curl) → recusa.

**Regra de ouro**: cada bloqueio deve existir no BANCO (curl falha), não só no
menu. Qualquer curl que devolva linha de outro tenant é achado crítico.

---

# ETAPA 6 — INTEGRAÇÕES PONTA A PONTA

| Integração | Como testar | Como verificar | Se falhar |
|---|---|---|---|
| Agente (Evolution→n8n) | mensagem de nº desconhecido: fluxo completo de marcar (6.3) | resposta no WhatsApp; `appointments origem='agente'`; execução verde no n8n | mensagem cai em `mensagens_recebidas`; fluxo **Reentrega** tenta a cada 5min (5×/24h); erro dispara o **error workflow** (e-mail) |
| Contexto do agente | perguntar "qual meu horário?" após remarcar/cancelar | resposta = estado atual do banco (nunca o histórico da conversa) | ver bloco `[CONTEXTO INTERNO]` na execução: linha HORARIOS deve refletir o banco |
| Lembrete 1h | reserva ~1h à frente (6.8) | mensagem do nº central; `lembrete_enviado=true`; sem duplicata em 2 ciclos | template rejeitado/quality → checar WABA no Meta Business; erro → e-mail de falha |
| Confirmação de presença | responder "confirmo" ao lembrete | status vira `confirmado` na Agenda | ferramenta Confirmar Presenca na execução do agente |
| Cancelou/remarcou pelo link | 6.9/6.10 | aviso na Agenda até "Ok, vi"; `cancelado_por`/`remarcado_pelo_cliente_em` | realtime fora → aviso aparece ao recarregar (fallback é a consulta) |
| Avaliação | 6.11; responder nota 5 e depois nota ≤3 | 5 → link do Google; ≤3 → dono avisado (needs_human/resumo) | fluxo Avaliação: só marca enviado após sucesso |
| Reativação | 6.12; testar também "não quero mais" | opt-out para TUDO de marketing; silêncio expira (`cancelado_por='sistema'`) | fila com reserva de 5min impede envio duplo |
| Opt-out "PARAR" | responder PARAR ao nº central | `recusou_contato=true`; ficha mostra "Não quer receber convites" | matcher no whatsapp-webhook |
| AbacatePay | pagar o Pix de teste (6.13) | webhook estende `acesso_ate`; fatura `paga_em`; pagar 2× não duplica (`cobranca_eventos`) | webhook responde erro → AbacatePay reenvia; conferir logs da edge |
| E-mail (SMTP) | forçar 1 achado de auditoria OU derrubar um fluxo | e-mail chega 1× (auditoria marca `auditoria_avisos`); erro → e-mail do error workflow | Sentinela do webhook cobre a Evolution desapontada |
| Sentry | forçar um erro de front (ex.: URL inválida em prod) | evento no painel com tag do salão | — |
| Uso → CRM Aura | aguardar o job diário | janela de 3 dias reenviada; upsert lá não duplica | — |

---

# ETAPA 7 — SAÍDA FINAL

## 7.1 Checklist enxuto (imprimir e marcar)

**Onboarding** ☐ landing ☐ criar conta ☐ e-mail duplicado ☐ reenviar ☐ confirmar ☐ criar barbearia ☐ validações ☐ sessão perdida ☐ esqueci senha
**Config** ☐ horário ☐ aviso de jornada ☐ telefone obrigatório ☐ serviço ☐ produto ☐ repor ☐ pacote ☐ jornada barbeiro ☐ convite equipe
**Agenda** ☐ reserva slot ☐ multi-serviço ☐ conflito ☐ folga ☐ dedupe telefone ☐ retroativo ☐ drag ☐ alterar ☐ cancelar ☐ excluir ☐ concluído não exclui ☐ "não veio" pelo cron ☐ corrigir falta ☐ barbeiro inativo
**Clientes** ☐ adicionar ☐ duplicado ☐ inválido ☐ editar ☐ opt-out ☐ importar ☐ reimportar ☐ exportar
**Financeiro** ☐ troco ☐ concluir-e-cobrar ☐ caixa abre ☐ vínculo obrigatório ☐ produto/estoque ☐ dividir pagamento ☐ desconto ☐ pacote+desconto hoje ☐ usar saldo ☐ comissão ☐ estorno ☐ fechar comissões ☐ gaveta ☐ meta ☐ exportar ☐ pendência sobrevive
**Integrações** ☐ conectar ☐ QR vencido ☐ agente marca ☐ agente sabe o horário ☐ pedir dono ☐ responder/devolver ☐ QR público ☐ lembrete ☐ cancelar link ☐ remarcar link ☐ avaliação ☐ reativação ☐ pix ☐ pix vencido
**Permissões** ☐ menu barbeiro ☐ URLs barram ☐ agenda ☐ clientes ☐ financeiro ☐ venda só no nome ☐ catálogo ☐ sem estorno ☐ gerente ☐ último dono
**Multi-tenant** ☐ isolamento visual ☐ realtime não vaza ☐ curls anon ☐ curls cruzados ☐ RPCs travadas ☐ virar rede ☐ trocar unidade ☐ comparativo ☐ cobrança única ☐ 2 instâncias WhatsApp

## 7.2 Os 10 pontos mais prováveis de quebrar (olhando o código)

1. **Drag & drop reagenda sem confirmação e sem olhar a jornada** ([AgendaPage.tsx:270](../src/features/agenda/AgendaPage.tsx)) — um arrasto acidental muda horário/barbeiro na hora; a sombra "fora da jornada" é só visual, o drop grava. Cliente não é avisado (não há mensagem de remarcação pela barbearia).
2. **Horário fora da grade 06–22h fica invisível** — `minutesSinceStart` posiciona por offset fixo; reserva às 05:00 (digitável no modal) renderiza acima do topo. Testar 3.x com 05:00 e 22:30.
3. **Comanda não é transacional** ([NewSaleModal.tsx:606-869](../src/features/vendas/NewSaleModal.tsx)) — são 8+ escritas sequenciais com compensação manual; fechar o navegador no meio pode deixar comanda com itens sem pagamento. O rollback cobre erro de API, não abandono.
4. **Pendência de cobrança vive em `localStorage`** ([vendaPendente](../src/lib/vendaPendente.ts)) — trocar de aparelho/navegador perde a faixa e o horário vira "não veio" 15min depois, mesmo atendido.
5. **`concluirSemCobrar`/vínculo dependem de janela de 15min do cron** — atraso em lançar a venda + cron `*/5` = corrida real; testar 3.12/5.16 perto do limite.
6. **Fuso do CRM é o do aparelho; o público é America/Sao_Paulo fixo** — computador em outro fuso mostra horários deslocados na grade vs QR (toLocaleString sem timeZone em toda a Agenda/Financeiro).
7. **Realtime é o único gatilho de vários avisos** (novo agendamento, cancelamentos, catálogo) — conexão websocket caída = silêncio sem indicador; só o F5 salva.
8. **Import: qualquer erro ≠23505 vira "falharam" sem detalhe na tela** — RLS/rede no meio do lote deixa importação parcial; o dono não sabe QUAIS linhas entraram (só o CSV de recusadas da PRÉVIA existe, não do resultado).
9. **Caixa "esperado" soma pagamentos por `orders.closed_at >= aberto_em`** ([CaixaSection.tsx](../src/features/financeiro/CaixaSection.tsx)) — estorno APÓS abrir o caixa não subtrai (estorno muda status, não cria pagamento negativo); conferência da gaveta pode "faltar" sem culpa de ninguém. Testar: venda dinheiro → estornar → conferir esperado.
10. **Duas fontes de verdade para "serviços do agendamento"** — `service_id` (principal) vs `appointment_services`; qualquer caminho novo que leia só o principal repete o defeito da view do agente (corrigido em 0171). Vigiar em telas novas e no export.

## 7.3 Lacunas (o que um barbeiro sentiria falta)

- **Bloquear horário/folga pontual**: o status `bloqueio` existe no código, mas NENHUMA tela cria um bloqueio (almoço, médico, férias). Jornada é semanal fixa, sem exceção por data.
- **Horário de almoço**: `professional_schedules` é uma faixa única por dia — não há intervalo no meio do expediente.
- **Feriados**: nada fecha um dia específico; só desmarcar o dia da semana inteiro.
- **Remarcação avisada pelo lado da barbearia**: arrastar/alterar não manda mensagem ao cliente.
- **Recorrência manual** ("toda quinta às 19h") — só existe via reativação automática pós-venda.
- **Lista de espera** para horário cheio.
- **Busca na Agenda** por nome de cliente (achar "o horário do João" exige rolar).
- **Despesas/saídas do caixa** (sangria, compra) — o caixa só soma vendas em dinheiro.
- **Relatório de comissão exportável** por barbeiro (o export é de vendas).
- **Aniversariantes**: o campo existe e nada o usa (campanha/aviso).
- **Impressão/compartilhamento de comanda** para o cliente.
- **Notificação push/som com o app fechado** — os avisos dependem da aba aberta.

---

*Documento completo — Etapas 1 a 7. Qualquer ❌ encontrado: anotar a linha (ex.: 5.11), o que aconteceu e print; o arquivo/componente de cada fluxo está na Etapa 1/2 para localizar o código.*

