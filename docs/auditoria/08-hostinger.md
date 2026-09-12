# Auditoria — Hostinger (domínio, DNS, VPS, e-mail, assinaturas)

**Data da auditoria:** 2026-09-05. Somente leitura, via MCP da Hostinger.
Toda afirmação cita a consulta no formato "tool → resultado". Nenhuma escrita
foi executada.

---

## 1. O que existe hoje

**Domínio** — `domains_getDomainListV1` → 1 domínio na conta: `clubcut.space`,
ativo, registrado em 2026-09-04, expira em **2027-09-04**.
`domains_getDomainDetailsV1` → privacidade WHOIS **ligada**, lock de
transferência **ligado**, trava de 60 dias pós-registro até 2026-11-03,
nameservers `atlas.dns-parking.com` / `hyperion.dns-parking.com` (DNS da
própria Hostinger — a zona é gerenciável pelo painel/API).

Isto contradiz — para melhor — o `docs/estado-do-projeto.md` (2026-08-16), que
ainda lista "Domínio próprio" como pendência bloqueante. O
`docs/backlog.md` (seção "Domínio próprio: clubcut.space (2026-09-04)") e o
commit `4f9d51a` ("Backlog: o dominio proprio entra no ar") já registram a
compra.

**DNS** — `DNS_getDNSRecordsV1(clubcut.space)` → 10 conjuntos de registros:

| Tipo | Nome | Valor | Função |
|---|---|---|---|
| A | `@` | `216.198.79.1` | **Vercel** (apex) |
| CNAME | `www` | `5686dea13e78b272.vercel-dns-017.com.` | **Vercel** (próprio do projeto) |
| MX | `@` | `5 mx1.hostinger.com` / `10 mx2.hostinger.com` | e-mail Hostinger |
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | SPF |
| CNAME | `hostingermail-a/b/c._domainkey` | `*.dkim.mail.hostinger.com` | DKIM (3 chaves) |
| TXT | `_dmarc` | `v=DMARC1; p=none` | DMARC em modo observação |
| CNAME | `autodiscover` / `autoconfig` | `*.mail.hostinger.com` | clientes de e-mail |

Ou seja: **o site já aponta para a Vercel** (apex e www) e o e-mail está
completo (MX + SPF + DKIM + DMARC). `DNS_getDNSSnapshotListV1` → 2 snapshots
de zona, ambos de 2026-09-04 ("Hostinger mail activated" e "Zone records
update request") — há ponto de restauração anterior à edição manual.

**VPS** — `VPS_getVirtualMachinesV1` → 1 VM: **`srv1833354.hstgr.cloud`**
(id 1833354), plano **KVM 2** (2 vCPU, 8 GB RAM, 100 GB disco, 8 TB
banda/mês), template "Ubuntu 24.04 with Docker and Traefik", estado
`running`, criada em 2026-07-16, datacenter no Brasil (backups em
`node2551-br-asc-1-pbs`). **`firewall_group_id: null`** — nenhum firewall
anexado.

`VPS_getProjectListV1(1833354)` → 3 projetos Docker Compose, todos rodando:

- **`evolution-api-8lfe`** — 3 containers: `api` (evoapicloud/evolution-api,
  porta **32770 publicada em 0.0.0.0**), `postgres:15` (interno),
  `redis` (interno). Up 4 dias.
- **`n8n-m5uf`** — 1 container n8n, porta **32769 publicada em 0.0.0.0**.
  Up 7 semanas. É o host dos 13 workflows citados nos docs
  (`n8n-m5uf.srv1833354.hstgr.cloud`).
- **`traefik`** — reverse proxy, sem portas listadas no compose (usa rede do
  host/entrypoints próprios). Up 7 semanas.

`VPS_getMetricsV1(1833354, 2026-08-29 → 2026-09-05)` → CPU média **~0,7%**
(pico 2,8%), RAM **~1,5 GB de 8 GB (~19%)**, disco **~7,4 GB de 100 GB
(~7%)**, uptime contínuo ~51 dias, tráfego desprezível frente aos 8 TB.
A VM está folgada; a Evolution é só uma fração da carga.

`VPS_getBackupsV1(1833354)` → **2 backups automáticos** (2026-08-27 e
2026-09-03, ~7,2 GB cada, restore estimado em 30 min) — cadência semanal,
gerenciada pela Hostinger. `VPS_getSnapshotV1(1833354)` → registro zerado
(id 0): **nenhum snapshot manual existe**.

**E-mail** — `mail_listOrdersV1` → 1 plano: **Starter Business Email**
(`business_s_v2`, order `ORff050d8dfc7f2e0fac3d3b621416`), ativo, 1 assento,
atrelado a `clubcut.space`, expira 2026-10-04 (ciclo mensal).
`mail_listMailboxesV1` → 1 mailbox: **`contato@clubcut.space`**, ativa,
IMAP/POP3/SMTP (entrada e saída) habilitados, 2 mensagens, 48 KB de 5 GB
usados, criada em 2026-09-04. Sem forwarders, aliases ou catch-all.

**Assinaturas** — `billing_getSubscriptionListV1` → 3, todas ativas e com
**auto-renovação ligada**:

| Assinatura | Ciclo | Valor | Próxima cobrança |
|---|---|---|---|
| KVM 2 (`16BR5TVPVEZJK3Ddp`) | mensal | R$ 108,99 | **2026-09-16** |
| Starter Business Email (`6oqPYVUERv8JB5d`) | mensal | R$ 11,99 | 2026-10-04 |
| .SPACE Domain (`AzyqDBVUEQolU9Vk`) | anual | R$ 182,08 | 2027-08-08 |

`billing_getPaymentMethodListV1` → cartão de crédito padrão, válido (expira
em 2034), não suspenso; há um segundo método (NuPay) sem relevância.

**Hospedagem compartilhada** — `hosting_listWebsitesV1` → vazio. Não há
website hospedado na Hostinger; o front é 100% Vercel, como os docs dizem.

---

## 2. O que está correto e por quê

- **O domínio existe, está protegido e pago por 1 ano.**
  `domains_getDomainDetailsV1` → privacidade WHOIS e lock ligados, expiração
  2027-09-04, e `billing_getSubscriptionListV1` → auto-renew ligado com
  cartão válido no arquivo. O item "falta o endereço e o registrador" do
  `estado-do-projeto.md` está resolvido de fato.
- **O DNS do site já aponta para a Vercel do jeito certo.**
  `DNS_getDNSRecordsV1` → A `@` → `216.198.79.1` e CNAME `www` → CNAME
  próprio do projeto (`5686dea13e78b272.vercel-dns-017.com`), exatamente os
  valores que o backlog registra como pedidos pela Vercel (passos 1–3
  fechados em 04/09). O backlog confirma de fora: apex responde 200, www
  devolve 308 para o apex.
- **O DNS de e-mail veio completo.** MX duplo, SPF, DKIM com 3 chaves e
  autodiscover/autoconfig — o pacote padrão do Hostinger Mail, intacto após a
  edição manual (o backlog registra a conferência; a zona lida hoje bate).
- **Há snapshots de zona DNS** (`DNS_getDNSSnapshotListV1` → 2) — dá para
  restaurar a zona a antes da edição de 04/09 se algo se perder.
- **A VM está saudável e folgada.** `VPS_getMetricsV1` → CPU <1%, RAM ~19%,
  disco ~7%, uptime contínuo de ~51 dias. O plano KVM 2 comporta com sobra a
  carga atual (Evolution + n8n + Traefik) e o crescimento próximo.
- **Backups semanais automáticos existem e são recentes**
  (`VPS_getBackupsV1` → 2026-09-03) — não é o ideal (ver seção 3), mas não é
  zero.
- **Nenhuma assinatura à deriva:** as 3 têm auto-renew ligado e método de
  pagamento válido — o risco clássico de "domínio expirou em silêncio" está
  coberto no nível do painel.

---

## 3. O que está errado ou incompleto

### CRÍTICO — VPS sem firewall nenhum, com Evolution e n8n publicados direto na internet
- **Evidência:** `VPS_getVirtualMachinesV1` → `firewall_group_id: null`;
  `VPS_getFirewallListV1` → lista vazia (total 0 — não existe sequer um
  firewall criado na conta); `VPS_getProjectListV1` → Evolution API com
  porta 32770 e n8n com porta 32769 **publicadas em 0.0.0.0**, fora do
  Traefik.
- **Impacto prático:** os dois serviços ficam alcançáveis por HTTP puro em
  portas altas, contornando o TLS do Traefik. A Evolution guarda as sessões
  de WhatsApp de barbearias reais; o n8n guarda credenciais de SMTP,
  OpenRouter, Telegram e Supabase, e 13 workflows de produção. Qualquer
  autenticação que exista nesses serviços trafega em claro nessas portas, e
  um scanner de internet os encontra em horas. O próprio backlog
  (avaliação de 2026-09-04) já apontou isso como "o achado de segurança mais
  concreto" — e continua exatamente igual.
- **Correção sugerida (não aplicada):** criar um firewall no painel liberando
  só 80/443 (Traefik) e 22 (restrito ao IP do dono), anexá-lo à VM; em
  paralelo, remover o publish `0.0.0.0` das portas 32770/32769 nos
  docker-compose e deixar Evolution e n8n atrás do Traefik, que já resolve
  TLS. (Alternativa mínima: bind em `127.0.0.1`.)

### ALTO — Nenhum snapshot manual; backup só semanal e nunca testado
- **Evidência:** `VPS_getSnapshotV1` → registro zerado (nenhum snapshot);
  `VPS_getBackupsV1` → 2 backups com 7 dias de intervalo (27/08 e 03/09).
- **Impacto prático:** entre backups há uma janela de até 7 dias de perda
  para tudo que vive na VM — workflows do n8n (que os docs mostram serem
  editados quase diariamente), execuções, credenciais, sessões da Evolution.
  E nenhum restore foi ensaiado: o tempo estimado de 30 min é teórico. O dado
  de negócio (Supabase) não mora aqui, mas a operação de mensageria inteira
  sim.
- **Correção sugerida (não aplicada):** criar um snapshot antes de qualquer
  mexida grande na VM (é 1 ação no painel; a Hostinger mantém 1 por VM) e
  exportar os workflows do n8n para o repositório com regularidade — o
  backup semanal vira então a segunda linha, não a única.

### MÉDIO — DMARC em `p=none`
- **Evidência:** `DNS_getDNSRecordsV1` → TXT `_dmarc` = `"v=DMARC1; p=none"`.
- **Impacto prático:** modo observação — qualquer um pode enviar e-mail
  se passando por `@clubcut.space` sem que os provedores rejeitem. O backlog
  já planeja mover o remetente dos convites para `contato@clubcut.space`;
  fazer isso com DMARC frouxo num TLD `.space` recém-registrado é a
  combinação que mais cai em spam.
- **Correção sugerida (não aplicada):** manter `p=none` só enquanto se
  observa (idealmente com `rua=` para receber relatórios), e subir para
  `p=quarantine` depois que o volume legítimo estiver mapeado. Não trocar o
  remetente dos convites antes disso (a ressalva do próprio backlog).

### MÉDIO — Documentação desencontrada sobre o estado do domínio
- **Evidência:** `docs/estado-do-projeto.md` (atualizado 2026-08-16) lista
  "Domínio próprio — ainda em clubcut.vercel.app" como item que **bloqueia
  crescer**; `domains_getDomainListV1` + `DNS_getDNSRecordsV1` mostram
  domínio comprado e apontado desde 2026-09-04. Dentro do próprio
  `backlog.md`, o checklist do go-live mantém o passo 6 (`VITE_APP_URL`)
  como pendente enquanto a "Avaliação geral das 8 peças", no mesmo arquivo,
  diz "VITE_APP_URL confirmado".
- **Impacto prático:** quem abrir o `estado-do-projeto.md` — que é o
  retrato oficial — planeja em cima de uma pendência que não existe mais, o
  exato modo de falha que o cabeçalho do backlog documenta ("item de backlog
  envelhece").
- **Correção sugerida (não aplicada):** atualizar o `estado-do-projeto.md`
  e riscar no checklist do backlog os passos comprovadamente feitos,
  deixando explícito o que resta (4, 5, 7 e 10 — todos fora da Hostinger).

### BAIXO — `clubcut.com.br` continua livre para terceiros
- **Evidência:** `domains_getDomainListV1` → só `clubcut.space` na conta. O
  backlog registra a decisão do dono (04/09) de ficar no `.space`, com o
  `.com.br` disponível a R$ 39,99.
- **Impacto prático:** registro defensivo não feito — um terceiro (ou
  concorrente) pode registrar `clubcut.com.br`, que é o TLD que um público
  brasileiro digita por instinto.
- **Correção sugerida (não aplicada):** decisão de negócio, não defeito;
  fica o registro de que o risco é de captura do nome, não só de custo.

### BAIXO — Método de pagamento secundário (NuPay) com expiração imediata
- **Evidência:** `billing_getPaymentMethodListV1` → NuPay expira em
  2026-09-05 (hoje); o cartão padrão segue válido até 2034.
- **Impacto prático:** nenhum enquanto o cartão padrão existir; vale só como
  aviso de que a redundância de pagamento é zero.
- **Correção sugerida (não aplicada):** nada a fazer agora; se o cartão for
  trocado/cancelado um dia, as 3 renovações dependem dele.

---

## 4. O que ainda não quebrou mas vai virar problema em produção

- **Renovação do VPS em 11 dias (2026-09-16, R$ 108,99).** Auto-renew ligado
  e cartão válido (`billing_getSubscriptionListV1` +
  `billing_getPaymentMethodListV1`) — deve passar sozinha, mas é a primeira
  cobrança relevante depois desta auditoria e toda a mensageria mora nessa
  VM. Falhou o cartão, a Hostinger suspende e WhatsApp + n8n param juntos.
- **Custo recorrente consolidado da Hostinger:** R$ 108,99 + R$ 11,99 por
  mês + R$ 182,08 por ano ≈ **R$ 1.634/ano** antes de qualquer cliente pagar
  além das duas barbearias reais. Não é problema hoje; é o número a vigiar
  contra a meta de "cinco barbearias pagando".
- **Trava de 60 dias do domínio até 2026-11-03**
  (`domains_getDomainDetailsV1` → `60_days_lock_expires_at`): se a decisão
  do `.com.br` mudar e envolver transferência/migração de registrador, ela
  não anda antes dessa data.
- **Backup semanal como única linha de defesa da VM** (detalhado na seção 3)
  — vira incidente no dia em que um compose for editado errado ou o disco
  corromper num dia 6 do ciclo.
- **Reputação do `.space` no e-mail:** quando o remetente dos convites migrar
  do Gmail para `contato@clubcut.space` (plano já registrado no backlog), a
  entrega pode piorar no curto prazo — domínio novo, TLD barato, DMARC
  `p=none`. Medir antes de trocar, como o próprio backlog recomenda.
- **O plano de e-mail é mensal (expira 2026-10-04).** Auto-renew cobre, mas
  qualquer falha de cobrança derruba a caixa `contato@` — que até aqui tem 2
  mensagens e nenhum papel operacional, mas está prestes a virar remetente
  oficial.

---

## 5. Interfaces: o que ENTREGA e o que CONSOME

**ENTREGA (contratos que outros componentes consomem):**

| Contrato (nome exato) | Consumidor |
|---|---|
| Domínio `clubcut.space` (NS `atlas.dns-parking.com` / `hyperion.dns-parking.com`) | Vercel (site), Hostinger Mail, Supabase Auth (redirects — pendente lá) |
| Registro A `@` → `216.198.79.1` e CNAME `www` → `5686dea13e78b272.vercel-dns-017.com.` | Projeto **clubcut** na Vercel (apex canônico) |
| MX `mx1/mx2.hostinger.com` + SPF + DKIM (`hostingermail-a/b/c._domainkey`) + `_dmarc` | Entrega/recebimento da caixa `contato@clubcut.space` |
| Mailbox `contato@clubcut.space` (order `ORff050d8dfc7f2e0fac3d3b621416`, plano `business_s_v2`, SMTP out habilitado) | n8n — futuro remetente do convite de equipe (hoje ainda Gmail pessoal, ver backlog) |
| VM `srv1833354.hstgr.cloud` (id 1833354, KVM 2) | Hospeda os 3 projetos Docker abaixo |
| Projeto `n8n-m5uf` (container `n8n-m5uf-n8n-1`, URL `n8n-m5uf.srv1833354.hstgr.cloud` via Traefik) | Landing (popup `VITE_AGENTE_IA_URL`), Supabase (webhooks planejados, ex. `N8N_LEMBRETE_RESPOSTA_URL`), toda a automação |
| Projeto `evolution-api-8lfe` (containers `api` + `postgres:15` + `redis`) | Agente de WhatsApp das barbearias (auditor próprio; aqui só como carga da VM) |
| Projeto `traefik` (container `traefik-traefik-1`) | TLS/roteamento dos dois acima |

**CONSOME:**

| Contrato (nome exato) | Fornecedor |
|---|---|
| Assinatura `16BR5TVPVEZJK3Ddp` (KVM 2, mensal) | Cobrança Hostinger → cartão padrão |
| Assinatura `AzyqDBVUEQolU9Vk` (.SPACE, anual) | Cobrança Hostinger → cartão padrão |
| Assinatura `6oqPYVUERv8JB5d` (Starter Business Email, mensal) | Cobrança Hostinger → cartão padrão |
| Alvos DNS da Vercel (`216.198.79.1`, `5686dea13e78b272.vercel-dns-017.com`) | Vercel — se o projeto mudar, a Vercel emite novos valores e a zona precisa acompanhar |
| Backups automáticos em `node2551-br-asc-1-pbs` | Infra da Hostinger (semanal, não configurável no plano atual) |

---

## 6. NÃO VERIFICADO

- **Firewall de sistema operacional (ufw/iptables) dentro da VM.** O MCP só
  enxerga o firewall do painel (inexistente). Pode haver regra dentro do
  Ubuntu mitigando as portas 32770/32769 — só o dono confirma, via SSH
  (`sudo ufw status` / `iptables -L`). Enquanto não confirmar, vale o pior
  caso da seção 3.
- **Se Evolution e n8n exigem autenticação nas portas publicadas.** Testar
  exigiria acesso ativo de fora do painel, fora do escopo de leitura desta
  auditoria (e a Evolution tem auditor próprio). O dono pode testar de
  qualquer rede externa: `http://srv1833354.hstgr.cloud:32769` e `:32770`.
- **Relação entre `contato@clubcut.space` e a entrega do e-mail de
  cadastro.** O cadastro sai pelo Supabase Auth, e nenhuma consulta da
  Hostinger mostra essa cadeia. O painel só prova que a caixa existe, com
  SMTP habilitado e 2 mensagens. Se o plano for usar SMTP customizado no
  Supabase com essa caixa, isso é configuração no painel do Supabase — o
  dono precisa dizer qual é a intenção.
- **Passos 4, 5, 7 e 10 do go-live do domínio** (allow-list e Site URL no
  Supabase Auth, secret `APP_URL` das edge functions, teste ponta a ponta) —
  vivem nos painéis do Supabase/Vercel, ilegíveis daqui. O backlog os lista
  como pendentes; o painel da Hostinger não pode confirmar nem negar.
- **Interpretação do `VPS_getSnapshotV1`:** a resposta veio com todos os
  campos zerados (id 0), lida aqui como "nenhum snapshot". A API não
  devolve um marcador explícito de ausência.
- **Consumo mensal exato de banda vs 8 TB:** `VPS_getMetricsV1` devolve
  amostras de ~30 min, não o agregado do ciclo. As amostras (KB–MB) indicam
  uso ordens de grandeza abaixo do teto, mas o total fechado do mês só o
  painel mostra.
- **Nenhuma escrita pareceu necessária** durante a auditoria; não há item
  registrado por esse motivo.
