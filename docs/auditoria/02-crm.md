# Auditoria — Componente CRM (app React/Vite)

**Data:** 2026-09-05. **Escopo:** apenas o front-end em `src/`, `index.html` e a
configuração de build/teste do repositório. Supabase, n8n e Vercel entram só
como interface. Método: leitura de código com âncoras `caminho:linha`, mais
`graphify query` para orientação. Nada foi executado além de comandos de
leitura; nenhum arquivo `.env*` foi aberto.

---

## 1. O que existe hoje

**Stack** (`package.json`): React 19.2, Vite 8.1, TypeScript ~6.0,
react-router-dom 7, @supabase/supabase-js 2, Tailwind 4 (via
`@tailwindcss/postcss`), recharts 3, jspdf, qrcode, motion. Lint com oxlint
(`.oxlintrc.json`: `react/rules-of-hooks` como erro), testes com vitest 4.

**Rotas** (`src/App.tsx:112-184`):

| Rota | Guarda | Tela |
|---|---|---|
| `/login`, `/inicio`, `/sobre`, `/criar-conta`, `/esqueci-senha`, `/redefinir-senha`, `/termos`, `/privacidade` | nenhuma (público) | login, página de vendas, sobre, cadastro aberto, recuperação de senha, jurídico |
| `/convite/:token` | nenhuma — o token é a autorização (`App.tsx:44-46`) | `AceitarConvitePage` |
| `/agendar/:salonId` | nenhuma — QR do balcão (`App.tsx:54`) | `AgendaPublicaPage` |
| `/meu-horario/:token` | nenhuma — token do agendamento | `MeuHorarioPage` |
| `/admin/nova-barbearia` | nenhuma na rota; gate interno por senha validada no servidor (`NovaBarbeariaPage.tsx:13-45`) | painel administrativo do produto |
| `/web` | `RequireAuth` + `RequireManager` (`App.tsx:126-134`) | espelho do WhatsApp |
| `/` (agenda), `/clientes`, `/financeiro`, `/catalogo`, `/equipe`, `/ajuda` | `RequireAuth` via `AppLayout` (`App.tsx:136-147`) | telas do dia a dia |
| `/rede` | + `RequireNetworkOwner` (`App.tsx:148-155`) | painel da rede |
| `/rede/equipe` | redirect para `/equipe` (`App.tsx:158`) | — |
| `/assinatura`, `/conexao`, `/configuracoes` | + `RequireManager` (`App.tsx:159-182`) | cobrança, conexão WhatsApp, configurações |

Todas as telas fora de login+agenda entram por `lazy()` (`App.tsx:14-72`);
o `dist/` de 2026-09-04 confirma um chunk por tela (`dist/assets/`).

**Papéis e contexto**: `AuthProvider` guarda a sessão
(`src/features/auth/AuthContext.tsx`); `SalonProvider` carrega os vínculos de
`user_salons` com join em `salons` (`SalonContext.tsx:89-94`), guarda a unidade
escolhida em `localStorage` (`salaocrm:unidade:${userId}`, `SalonContext.tsx:48-50`)
e deriva os conceitos de permissão num módulo puro e testado
(`src/features/auth/permissoes.ts`: `isManager`, `isOwner`, `ehDonoDesta`,
`podeVerRede`; testes em `permissoes.test.ts`). O menu (`AppLayout.tsx:45-91`)
esconde itens por `somenteGestor`/`somenteDono`, e o `AppLayout` também aplica o
bloqueio de assinatura vencida para todos os papéis (`AppLayout.tsx:234-236`).

**Multi-tenant no front**: as leituras filtram `salon_id` explicitamente
(exemplos: `useAgendaData.ts:42-43`, `useClientsData.ts:17-21`,
`useConversations.ts:26-32`, `useAgentStats.ts:60-98`, `useRedeData.ts:55-73`
com `.in('salon_id', salonIds)`, joins com `!inner` e filtro
`orders.salon_id` em `useServicesData.ts:25-31` e `CaixaSection.tsx:71-75`).
As escritas por `id` (ex.: `CatalogoPage.tsx:82`, `NewClientModal.tsx:58`,
`EquipePage.tsx:259`) confiam na RLS; o CI tem job dedicado de pgTAP que se
declara "o único ponto onde o isolamento entre salões é verificado"
(`.github/workflows/ci.yml`, job `banco`). Canais realtime também filtram por
tenant (`filter: salon_id=eq.${salonId}` em `useConversations.ts:56`,
`useClientsData.ts:52`, `usePendingConversations.ts:45`,
`usePedidosDeHumano.ts:70`).

**Feature flags**: o front lê **uma** chave, `agenda_publica`, via
`useRecurso('agenda_publica')` (`QrDoBalcao.tsx:30`), que consulta
`recursos_ativos` filtrando `salon_id` + `recurso` (`useRecurso.ts:53-58`) e
grava pela RPC `definir_agenda_publica` (`QrDoBalcao.tsx:50`). Ela libera o
bloco do QR do balcão dentro de Configurações (`ConfiguracoesPage.tsx:387`).
`salons_com_automacao` **não aparece em `src/`** (grep pelo literal: zero
ocorrências) — é lida do lado do n8n/banco, não do front. As chaves `balcao` e
`trocar_horarios` também não aparecem em `src/` (ver seção 3, item 8).

**Fluxos públicos**: a agenda pública e o link de gestão nunca tocam tabelas —
tudo passa pela edge function `agenda-publica`
(`AgendaPublicaPage.tsx:103,158`; `MeuHorarioPage.tsx:49,67`). O convite passa
por `accept-invite` (`AceitarConvitePage.tsx:49-51,87-93`), com aceite de
termos versionado (`versaoTermos`, linha 91). O cadastro aberto usa o
`supabase.auth.signUp` da plataforma, com anti-enumeração de e-mail
(`CriarContaPage.tsx:14-24,82-85`).

**Variáveis de ambiente do front** (build time, `import.meta.env`):
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.ts:18-19`,
sem fallback por design, com validação de formato em
`src/lib/credenciaisSupabase.ts:23-63`); `VITE_APP_URL` (`src/lib/appUrl.ts:14`,
base dos links de convite e redefinição de senha); `VITE_AGENTE_IA_URL`
(`src/features/site/landing/WhatsAppPopup.tsx:43`). Existe `.env.example` na
raiz (não aberto nesta auditoria).

**Build/deploy**: `vite.config.ts` é mínimo (só o plugin React).
`vercel.json:1-6` usa o formato legado `routes` com `handle: filesystem` +
fallback `/index.html` (rewrite de SPA). O `dist/` construído em 2026-09-04
soma ~2,8 MB; maiores chunks: `CartesianChart-*.js` 338 KB (recharts),
`ErroInline-*.js` 206 KB (chunk compartilhado), `FinanceiroPage-*.js` 88 KB,
`App-*.js` 83 KB.

**Qualidade**: `tsconfig.app.json` com `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch` — **sem `strict`** (ver seção 3). Testes: 28
arquivos `*.test.ts` em `src/` + 2 em `supabase/functions/_shared/` (incluídos
pelo `vitest.config.ts:10`), ~239 blocos `it()/test()` na contagem estática;
só funções puras (`vitest.config.ts:3-4` explica que não há teste de
componente). Há testes-contrato que leem o próprio código-fonte:
`ErroDeCarga.test.ts` (telas não podem mascarar erro de carga),
`botoesDoSistema.test.ts`, `ajudaBateComATela.test.ts`,
`promessaDeCobranca.test.ts`. Fuso fixado em `America/Sao_Paulo` nos testes
(`vitest.config.ts:25`). CI (`.github/workflows/ci.yml`): typecheck + oxlint +
vitest num job, pgTAP noutro.

---

## 2. O que está correto e por quê

- **Guardas de rota honestas com o carregamento.** `RequireAuth`,
  `RequireManager` e `RequireNetworkOwner` mostram skeleton enquanto
  `loading` e só redirecionam depois (`RequireAuth.tsx:10-29`,
  `RequireManager.tsx:19-29`, `RequireNetworkOwner.tsx:16-28`). O
  `SalonProvider` não declara `loading=false` enquanto a sessão restaura
  (`SalonContext.tsx:68-78`) — o bug de rota de gestor inalcançável em refresh
  está documentado e corrigido ali mesmo.
- **Permissão com vocabulário único e testado.** As três noções de "dono"
  (`isOwner`/`ehDonoDesta`/`podeVerRede`) moram num módulo puro
  (`permissoes.ts:28-45`) com teste (`permissoes.test.ts`), e a fonte é
  `user_salons` — a mesma tabela que a RLS consulta (`useSalon.ts:8-11`).
- **Multi-tenant disciplinado nas leituras.** Todos os hooks de dados que
  encontrei filtram `salon_id` (âncoras na seção 1), inclusive nos joins
  (`!inner` + `eq('orders.salon_id', ...)` em `useServicesData.ts:27-28`) e nos
  canais realtime. O `useRecurso` cancela resposta atrasada ao trocar de
  unidade para não ligar recurso na barbearia errada (`useRecurso.ts:74-79`).
- **Fluxo público só por edge function.** Quem chega sem login
  (`/agendar/:salonId`, `/meu-horario/:token`, `/convite/:token`) nunca faz
  query direta; o token é a credencial e a regra fica no servidor
  (`AgendaPublicaPage.tsx:103`, `MeuHorarioPage.tsx:11-14`,
  `AceitarConvitePage.tsx:49`).
- **Credencial errada falha cedo e explica.** `supabase.ts:8-27` recusa
  build/boot sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` e valida formato
  (chave mascarada com `•`, caractere fora de Latin-1, espaço) com mensagens
  específicas (`credenciaisSupabase.ts:23-49`) — lição do incidente de
  2026-08-02 registrada no próprio arquivo.
- **Erro ≠ vazio, em todo lugar que olhei.** `SalonContext` distingue "falhou
  carregar" de "não tem barbearia" (`SalonContext.tsx:114-121`,
  `AppLayout.tsx:191-216`); `useAssinatura` distingue falha de RPC de
  "barbearia sem assinatura" (`useAssinatura.ts:90-111`); `EquipePage` idem
  (`EquipePage.tsx:127-135`); e o teste-contrato `ErroDeCarga.test.ts` trava a
  regressão nas telas listadas.
- **Sessão vencida tratada onde o dano era maior.** JWT expirado em aba parada
  dispara `refreshSession` e, se o refresh token também venceu, `signOut` —
  em vez de mentir "sua conta não tem salão" (`SalonContext.tsx:98-112`).
- **Flag desligada por padrão.** `useRecurso` mantém `ativo=false` durante o
  carregamento e em erro de rede (`useRecurso.ts:12-15,61-68`) — falha não
  liga funcionalidade.
- **Bloqueio de assinatura cobre todos os papéis, aviso só o gestor.**
  `AppLayout.tsx:136-140,234-236` e `useAssinatura.ts:70-84` (situação via RPC
  `situacao_do_acesso`, que qualquer vínculo pode chamar; CPF só do dono).
- **Cadastro aberto sem atalho perigoso.** `signUp` da plataforma com
  `emailRedirectTo`, reenvio de confirmação para o beco "não recebi o e-mail",
  e resposta idêntica quando o e-mail já existe (`CriarContaPage.tsx:14-24,
  40-55, 82-85`).
- **Split por rota real.** `App.tsx:14-72` + chunks individuais no `dist/`;
  o bundle inicial é login + agenda, como o comentário promete.
- **CI cobre as quatro frentes que o repositório controla**: typecheck, lint,
  vitest e pgTAP (`.github/workflows/ci.yml`), com o isolamento entre tenants
  verificado no job de banco — coerente com a escolha de confiar na RLS para
  escrita por `id`.

---

## 3. O que está errado ou incompleto

1. **ALTO — TypeScript sem `strict`.**
   Evidência: `tsconfig.app.json:2-24` não tem `"strict"` (nem
   `strictNullChecks`/`noImplicitAny`); `tsconfig.node.json` idem.
   Impacto: o typecheck verde do CI (`npm run typecheck`) não pega `null`/
   `undefined` indevidos nem `any` implícito — justamente a classe de erro mais
   comum em telas cheias de `data ?? []` e casts `as` (ex.:
   `SalonContext.tsx:124`, `EquipePage.tsx:136-138`). Num app que movimenta
   venda e cobrança, isso é uma rede de segurança desligada.
   Correção sugerida: ligar `"strict": true` e corrigir por módulo (começando
   por `lib/` e `features/auth`), ou no mínimo `strictNullChecks`.

2. **ALTO — Venda é uma "transação" de 8 passos feita no cliente.**
   Evidência: `NewSaleModal.tsx:483-675` — insert em `orders`, depois
   `order_items`, `payments`, `stock_movements`, `commissions`,
   `pacotes_do_cliente`, `pacote_consumos`, update em `clients` e em
   `appointments`, com rollback manual no `catch`
   (`NewSaleModal.tsx:665-675`).
   Impacto: fechar a aba, perder rede ou travar o celular entre o passo 1 e o
   fim deixa uma comanda `status='fechada'` meio-escrita no banco (o rollback
   só roda se o `catch` rodar); o próprio rollback são duas chamadas que também
   podem falhar. Financeiro e comissão passam a mostrar uma venda que não
   existiu. O estorno já é RPC (`estornar_venda`,
   `VendaDetalheModal.tsx:184`) — a venda não.
   Correção sugerida: mover o fechamento da comanda para uma RPC transacional
   (`registrar_venda`) e deixar o modal só montar o payload.

3. **MÉDIO — Guarda de gestor inconsistente entre rota e tela.**
   Evidência: `/equipe` não tem `RequireManager` na rota (`App.tsx:146`); a
   proteção é um `if (!isManager)` dentro da página
   (`EquipePage.tsx:471-477`). Já `/assinatura`, `/conexao` e `/configuracoes`
   têm guarda na rota (`App.tsx:159-182`) — e `ConfiguracoesPage.tsx:173`
   ainda repete o check por dentro.
   Impacto: não vaza dado (RLS + check interno), mas o padrão é exatamente o
   que causou o bug documentado no próprio `RequireManager.tsx:6-15` (rota
   alcançável por URL parecendo defeito); além disso as queries da EquipePage
   disparam mesmo para barbeiro (`EquipePage.tsx:107-144` roda no effect antes
   do return condicional).
   Correção sugerida: envolver `/equipe` em `RequireManager` como as demais, e
   padronizar (guarda na rota; check interno vira redundância consciente).

4. **MÉDIO — Painel admin com segredo compartilhado guardado no navegador.**
   Evidência: `/admin/nova-barbearia` é rota pública (`App.tsx:119`); a senha é
   validada no servidor (bom — `NovaBarbeariaPage.tsx:27-31`), mas fica em
   `sessionStorage` na chave `admin_tool_secret` (`NovaBarbeariaPage.tsx:11,37`)
   e viaja em toda chamada como header `x-admin-secret`
   (`SalonList.tsx:35-70`, `SalonWizard.tsx:148`, `ConvidarBarbearia.tsx:65`,
   `MetricasDoProduto.tsx:57`).
   Impacto: é o poder de criar/listar barbearias e ver métricas do produto
   inteiro atrás de um único segredo estático, legível por qualquer script na
   página (XSS) ou por quem usar o mesmo navegador; não expira nem rotaciona
   pelo front.
   Correção sugerida: transformar o admin em papel de usuário autenticado
   (claim/tabela de admins checada na edge function) e aposentar o header; no
   mínimo, deixar o segredo só em memória (state) e nunca em storage.

5. **MÉDIO — `vercel.json` no formato legado e sem headers de segurança.**
   Evidência: `vercel.json:1-6` usa `routes` (legado) só com o fallback de SPA;
   não há `headers` (CSP, `X-Frame-Options`/`frame-ancestors`, HSTS,
   `X-Content-Type-Options`) — e na Vercel `routes` não pode coexistir com
   `headers`/`rewrites` modernos, então o formato atual bloqueia a adição.
   Impacto: app de gestão com dinheiro e dados de clientes servido sem
   nenhuma política anti-clickjacking/anti-injeção que headers dariam de
   graça; o item 4 (XSS → segredo admin) fica mais barato de explorar.
   Correção sugerida: migrar para `rewrites` + `headers` no `vercel.json`.

6. **BAIXO — Dependência morta: `@tanstack/react-query`.**
   Evidência: `package.json:18` declara; grep em `src/` não encontra nenhum
   uso (`tanstack|react-query|useQuery`: zero arquivos).
   Impacto: peso no `npm ci`, ruído para quem lê o package.json (sugere um
   padrão de data-fetching que o app não usa).
   Correção sugerida: remover — ou adotá-la de fato nos hooks de dados, que
   hoje reimplementam cache/reload à mão.

7. **BAIXO — Erro engolido no caixa.**
   Evidência: `CaixaSection.tsx:46-56` — o `Promise.all` desestrutura
   `{ data: salao }` da consulta de `salons.troco_padrao` sem ler `error`; só
   a consulta de `cash_registers` é checada.
   Impacto: se a leitura do troco falhar, a tela assume silenciosamente o
   default anterior — o contrário da regra "erro não pode parecer dado" que o
   resto do arquivo segue.
   Correção sugerida: checar o `error` da segunda consulta e logar/avisar.

8. **BAIXO — Docs divergem do código (balcão e testes).**
   Evidência: `docs/estado-do-projeto.md:70-74` (atualizado 2026-08-16) diz
   que estão prontos "adiantar quem espera (`trocar_horarios`)" e "a faixa
   'No balcão' na agenda… atrás da chave `balcao`". No código: nenhuma
   ocorrência de `trocar_horarios` ou da chave `balcao` em `src/`, e o
   comentário em `AgendaPage.tsx:381-384` registra que "a faixa do balcão
   (chegou/não veio) saiu em 2026-08-25" (a decisão passou ao banco, via
   `cancela_agendamentos_sem_comanda`). Os campos `chegou_em`/`iniciado_em`
   ainda são lidos (`useAgendaData.ts:53`), mas sem UI de check-in. O mesmo
   doc cita "133 testes"; a contagem estática hoje é ~239 blocos `it()/test()`.
   Impacto: quem planeja pela doc acha que existe tela de check-in e RPC de
   adiantar acionáveis pelo CRM — não existem no front.
   Correção sugerida: atualizar o `estado-do-projeto.md` (é doc do dono;
   registro aqui a divergência, sem tocar).

9. **BAIXO — `/login` não redireciona quem já está logado.**
   Evidência: `LoginPage.tsx:7-33` não consulta `user` para redirecionar; só
   navega após submit.
   Impacto: usuário autenticado que abre `/login` (favorito, histórico) vê o
   formulário de novo — inofensivo, mas confuso.
   Correção sugerida: `if (user) return <Navigate to="/" replace />`.

---

## 4. O que ainda não quebrou mas vai virar problema em produção

- **Conversas sem paginação.** `useConversations.ts:5-15` carrega **todas** as
  conversas do salão e o próprio comentário fixa o limite: "se um dia passar de
  alguns milhares, isto vira paginação". `useAgentStats.ts:60-85` é pior: puxa
  todos os ids de conversa e faz `.in('conversation_id', ids)` — com centenas
  de conversas a URL da query PostgREST cresce até estourar limite de request.
  Vai doer na primeira barbearia movimentada de verdade.
- **Domínio embutido no HTML.** `index.html:35,41,47,58` fixa
  `https://clubcut.vercel.app` em canonical, `og:url` e `og:image`. Quando o
  domínio próprio chegar (pendência declarada em
  `docs/estado-do-projeto.md:42-44`), além de setar `VITE_APP_URL` e
  redeployar (o Vite embute em build time, `CLAUDE.md` tabela Vercel), o
  `index.html` precisa ser editado — canonical apontando para o vercel.app
  sabotaria o SEO do domínio novo em silêncio.
- **Renovação de sessão só no SalonContext.** `sessaoExpirou` é tratado apenas
  em `SalonContext.tsx:98-112`; os hooks de página (agenda, financeiro, etc.)
  apenas mostram erro. Aba de agenda deixada aberta o dia todo numa barbearia
  vai exibir "não foi possível carregar" até um refresh manual — degradação
  aceitável hoje, chamado de suporte amanhã.
- **Custo de realtime por aba.** Cada aba do CRM abre 3-4 canais
  (`useClientsData.ts:48-59`, `useConversations.ts:52-63`,
  `usePendingConversations.ts:41-52`, `usePedidosDeHumano.ts:66-73`). No plano
  gratuito do Supabase o teto de conexões realtime chega rápido com dezenas de
  barbearias × múltiplas abas/dispositivos.
- **recharts pesa 338 KB** (`dist/assets/CartesianChart-*.js`) para os
  gráficos do Financeiro — no celular do dono em 4G é o chunk que mais atrasa
  a tela; um sparkline próprio ou import seletivo cortaria isso.
- **Rotação da anon key exige redeploy.** Como `VITE_SUPABASE_ANON_KEY` entra
  em build time (`supabase.ts:19`; `CLAUDE.md`, linha da Vercel), trocar a
  chave no Supabase (incidente, rotação de rotina) deixa o app quebrado até
  alguém redeployar — vale procedimento escrito.
- **Segredo admin único** (item 4 da seção 3): rotacionar significa avisar
  todo mundo que o usa; sem trilha de quem fez o quê no painel admin.
- **QR do balcão validado só em domingo.** `docs/estado-do-projeto.md:58-60`
  admite que a lista real de um dia útil, com dois barbeiros e agenda cheia,
  nunca foi vista — a tela `AgendaPublicaPage` até prevê o volume
  (`PRIMEIROS=12`, "ver mais", `AgendaPublicaPage.tsx:26-28,73-78`), mas é
  hipótese, não observação.

---

## 5. Interfaces

### O que o CRM ENTREGA para os outros componentes

- **URLs públicas que outros sistemas emitem/imprimem** (contratos de rota,
  `App.tsx:113-124`):
  - `/agendar/:salonId` — impressa no QR do balcão (`QrDoBalcao.tsx`).
  - `/meu-horario/:token` — devolvida pela edge `agenda-publica` no campo
    `tokenGestao` e mostrada ao cliente (`AgendaPublicaPage.tsx:158,186`).
  - `/convite/:token` — montada por `urlDoConvite` sobre `VITE_APP_URL`
    (`appUrl.ts:18-20`); o e-mail sai pela fila do n8n
    (`EquipePage.tsx:311-312`, comentário).
  - `/redefinir-senha` — destino do link de e-mail do Supabase Auth
    (`appUrl.ts:22-24`; desvio de fallback em `App.tsx:82-104`).
  - `/inicio`, `/termos`, `/privacidade` — página de vendas e jurídico.
- **Metadados de compartilhamento** (`index.html:30-58`) — o link do produto no
  WhatsApp depende deles.

### O que o CRM CONSOME dos outros componentes

- **Supabase Auth**: `signInWithPassword`, `signUp` (com `emailRedirectTo`),
  `resend`, `getSession`, `onAuthStateChange`, `refreshSession`, `signOut`
  (`AuthContext.tsx`, `CriarContaPage.tsx`, `SalonContext.tsx`).
- **Tabelas via PostgREST (RLS aplica o tenant nas escritas)**: `user_salons`,
  `salons`, `professionals`, `professional_schedules`, `professional_services`,
  `services`, `products`, `stock_movements`, `orders`, `order_items`,
  `payments`, `commissions`, `pacotes`, `pacote_itens`, `pacotes_do_cliente`,
  `pacote_consumos`, `clients`, `appointments`, `appointment_services`,
  `servicos_do_agendamento`, `salon_invites`, `subscriptions`,
  `organizations`, `whatsapp_connections`, `whatsapp_conversations`,
  `whatsapp_messages`, `cash_registers`, `feedbacks`, `recursos_ativos`
  (âncoras principais na seção 1; lista completa via grep de `.from('` em
  `src/`).
- **Views**: `clientes_com_ultima_visita` (`useClientsData.ts:18`),
  `saldo_de_pacotes` (`PacotesDoCliente.tsx:40`, `NewSaleModal.tsx:156`),
  `uso_do_sistema_no_mes` (`UsoDoSistema.tsx:67`, `CobrancaDaRede.tsx:61`),
  `faturas_de_uso` (`UsoDoSistema.tsx:69`), `agendamentos_cobraveis`
  (`useAgentStats.ts:90`), `reativacao_resumo` (`useAgentStats.ts:95`).
- **RPCs**: `situacao_do_acesso` (`useAssinatura.ts:82`),
  `definir_agenda_publica` (`QrDoBalcao.tsx:50`), `salvar_jornada`
  (`HorarioBarbeiroModal.tsx:94`), `definir_papel_do_membro`
  (`EquipePage.tsx:173`), `tirar_da_equipe` (`EquipePage.tsx:209`),
  `trocar_email_do_convite` (`EquipePage.tsx:322`), `editar_convite`
  (`EquipePage.tsx:413`), `quero_atender` (`EquipePage.tsx:1183`),
  `estornar_venda` (`VendaDetalheModal.tsx:184`), `clientes_por_mes`
  (`useFinanceiroData.ts:215`), `garantir_cliente`
  (`NewAppointmentModal.tsx:140`), `definir_servicos_do_agendamento`
  (`NewAppointmentModal.tsx:213`).
- **Edge functions** (nome + ação/headers):
  - `whatsapp` — `action: connect | status | disconnect` (`ConexaoPage.tsx:30-35`),
    `send` (`WhatsAppWebPage.tsx:171-173`), `resume_agent`
    (`WhatsAppWebPage.tsx:193-195`, `usePedidosDeHumano.ts:94-98`); corpo leva
    `salonId` sempre.
  - `agenda-publica` — `acao: consultar | agendar | meu_horario |
    cancelar_horario` (`AgendaPublicaPage.tsx:103,158`;
    `MeuHorarioPage.tsx:49,67`); devolve `whatsappBarbearia` até em resposta de
    erro (contrato do campo `corpo`, `invokeFunction.ts:11-22`).
  - `accept-invite` — `action: 'check'` e aceite com `token, senha, nome,
    versaoTermos` (`AceitarConvitePage.tsx:49-51,87-93`).
  - `admin-create-salon` — header `x-admin-secret`; `action: 'verify'` e ações
    de lista/criação (`NovaBarbeariaPage.tsx:27-31`, `SalonList.tsx:35-70`,
    `SalonWizard.tsx:148`).
  - `admin-metricas`, `admin-invite-salon` — mesmo header
    (`MetricasDoProduto.tsx:57`, `ConvidarBarbearia.tsx:65`).
  - `criar-minha-barbearia` (`CriarBarbeariaPage.tsx:78`), `add-salon-unit`
    (`NovaUnidadeModal.tsx:60-61`).
  - `asaas` — `acao: cancelar` (`CancelarUso.tsx:21-25`),
    `separar-rede | unificar-rede` (`CobrancaDaRede.tsx:108-116`).
- **Realtime (postgres_changes)**: `whatsapp_conversations` e
  `whatsapp_messages` (filtros por `salon_id`/`conversation_id`,
  `useConversations.ts:52-59`, `useMessages.ts:39-46`), `clients`
  (`useClientsData.ts:48-55`).
- **Vercel**: rewrite de SPA (`vercel.json`) e as variáveis `VITE_*` embutidas
  no build — variável nova exige redeploy (`CLAUDE.md`, tabela das cinco
  peças).
- **n8n**: nenhum contato direto do front; o contrato é indireto — o CRM grava
  `salon_invites` e o convite é enviado pela fila de e-mail do n8n
  (`EquipePage.tsx:311-312`), e `needs_human`/`agent_paused` em
  `whatsapp_conversations` são o aperto de mão com o agente (o n8n nunca toca
  `agent_paused`; o front só o zera pela edge `whatsapp`,
  `usePedidosDeHumano.ts:79-98`).

---

## 6. NÃO VERIFICADO

- **O outro lado dos contratos.** RLS, RPCs, views e edge functions foram
  tratados como caixa-preta (têm auditor próprio). Afirmações do front sobre o
  servidor — ex.: "RLS `whatsapp_conversations: gestor` exige
  `private.is_manager`" (`RequireManager.tsx:9-10`) ou "o UPDATE direto em
  `salon_invites` foi revogado na 0128" (`EquipePage.tsx:92-93`) — foram
  citadas, não confirmadas.
- **Valores de configuração.** Por regra, nenhum `.env*` foi aberto; não sei
  quais `VITE_*` estão de fato definidas na Vercel (produção/preview), nem se
  `VITE_APP_URL` aponta para o endereço certo. O dono precisa conferir no
  painel da Vercel.
- **Execução de build e testes.** Não rodei `vite build`, `tsc`, `oxlint` nem
  `vitest` (autorização era só leitura). Os números de bundle vêm do `dist/`
  commitado/presente, gerado em 2026-09-04 — pode não refletir o HEAD atual
  (`git log -1`: 2026-09-04). A contagem "~239 testes" é estática (grep de
  `it(`/`test(`), não uma execução.
- **Estado do CI hoje.** `gh run list` exigiria rede/credencial; não executei.
  O dono confere com o comando da própria doc
  (`docs/estado-do-projeto.md:85-88`).
- **Comportamento visual** (celular, tema escuro, os quatro estados ao vivo):
  auditoria foi de código, sem rodar o app — as garantias citadas vêm de
  testes-contrato e comentários, não de observação da tela.
- **`graphify query`** funcionou, mas com resultados truncados pelo orçamento
  de tokens (aviso do CLI); usei-o para orientação e confirmei tudo que está
  no relatório lendo os arquivos citados. Aviso do CLI: "skill is from
  graphify 0.9.28, package is 0.9.29" — não rodei `graphify install` nem
  `update` (proibidos/fora do escopo).
