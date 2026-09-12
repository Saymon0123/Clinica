# Auditoria — Vercel (hospedagem do front)

**Data da auditoria:** 2026-09-05. Somente leitura: MCP da Vercel (tools de consulta), arquivos do repositório e `curl -I` contra os domínios públicos. Nenhuma configuração foi alterada. Valores de variáveis de ambiente não foram lidos nem copiados.

---

## 1. O que existe hoje

- **Time:** "castrocollin01-6426's projects" (`team_70eV1mzGzsJIxZ85ctzsETCf`), plano **hobby** (`list_teams → plan: "hobby"`).
- **Projeto:** `clubcut` (`prj_i51uHJBL2A4fxmSn44iEmTJ0o59Q`), framework **vite**, Node **24.x**, criado em 2026-07-21 (`get_project → createdAt 1784653250826`). O repo local está ligado a ele (`.vercel/project.json:1`).
- **Domínios atribuídos** (`get_project → domains`): `clubcut.space`, `www.clubcut.space`, `clubcut.vercel.app`, `clinica-crm-kappa.vercel.app`, mais os dois aliases internos (`clubcut-castrocollin01-...` e `clubcut-git-main-...`). **O domínio próprio já está no ar**: `https://clubcut.space` responde 200 com certificado válido e `www` redireciona 308 para o apex (curl -I em 2026-09-05).
- **Último deploy de produção:** `dpl_9e55LHzeDm13SifwMN5JMhzFgcst`, **READY**, 2026-09-04 08:15 UTC, branch `main`, commit `aed11dd` "gitignore: .vercel..." (`get_project → latestDeployment`; `list_deployments → meta.githubCommitSha`).
- **Frequência/falha recente:** os 20 deploys mais recentes (janela 2026-09-03 16:57 UTC → 2026-09-04 08:15 UTC) são todos `target: production`, branch `main`; **19 READY, 1 ERROR** (`dpl_A6axfoHSj9VWQVRDxuNUeNeeQLNJ`, 2026-09-03 17:05 UTC). O ERROR foi typecheck no build — `src/features/auth/SalonContext.tsx(164,15): error TS2552: Cannot find name 'permissoes'` (`get_deployment_build_logs → Error: Command "npm run build" exited with 2`) — corrigido no deploy seguinte, ~1 minuto depois.
- **Ligação com GitHub:** repo `Saymon0123/Clinica`, deploys disparados por push em `main` (`get_git_deployment_context → linkedProjects`; `list_deployments → meta.githubDeployment: "1", githubCommitRef: "main"`). O mesmo time tem um segundo projeto, `crm-salao-web` (repo `Saymon0123/crm-salao`), fora do escopo desta auditoria.
- **Proteção de deployment** (`get_project_deployment_protection`): Vercel Authentication (SSO) **habilitada** com `deploymentType: "all_except_custom_domains"`; password protection e trusted IPs desligados. Ou seja: URLs geradas (`clubcut-<hash>-....vercel.app`) e previews exigem login Vercel; só os domínios atribuídos são públicos. O comentário em `src/lib/appUrl.ts:5-9` confirma o comportamento na prática.
- **vercel.json** (`vercel.json:1-6`): apenas o fallback de SPA no formato **legado** `routes` (`handle: filesystem` + `/(.*) → /index.html`). Sem `headers`, sem `redirects`, sem `rewrites`.
- **Runtime:** nenhum erro em 7 dias (`get_runtime_errors → "No runtime errors found"`) e zero linhas de log de função (`get_runtime_logs group_by level → tabela vazia`) — esperado: o projeto é 100% estático, sem serverless/edge functions na Vercel.
- **Web Analytics:** **não habilitado** (`get_web_analytics → 400 web_analytics_not_enabled`).
- **Env vars que o código consome em build time** (grep `import.meta.env` em `src/`): `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.ts:18-19`), `VITE_APP_URL` (`src/lib/appUrl.ts:14`), `VITE_AGENTE_IA_URL` (`src/features/site/landing/WhatsAppPopup.tsx:43`). A lista do lado do painel não pôde ser lida (ver seção 6).

## 2. O que está correto e por quê

- **Deploy de produção saudável e com rede de segurança.** O build da Vercel roda `tsc -b && vite build` (`package.json:8`), então erro de tipo **derruba o deploy, não a produção**: o único ERROR dos últimos 20 ficou em ERROR e o deploy READY anterior continuou servindo (`list_deployments → estados`). O gatilho por push em `main` bate com o que o `CLAUDE.md` (linha 12) declara.
- **Previews e URLs geradas não expõem o app.** `get_project_deployment_protection → ssoProtection.enabled: true, all_except_custom_domains`. Para um CRM multi-tenant com dados reais, é a configuração certa: cada deploy gera uma URL, e nenhuma delas é pública.
- **Domínio próprio corretamente ligado.** Apex canônico com `www` em 308 para `https://clubcut.space/` (curl -I → `Location: https://clubcut.space/`), HSTS presente (`Strict-Transport-Security: max-age=63072000`), servido de `gru1` (São Paulo) — latência boa para o público-alvo.
- **Fallback de SPA funciona.** `vercel.json:3-4` entrega `handle: filesystem` antes do catch-all, então assets existentes são servidos e qualquer rota do React Router cai em `/index.html`. É o comportamento necessário para `react-router-dom` (`package.json:25`).
- **Env vars críticas falham alto, não baixo.** `src/lib/supabase.ts:8-16` lança erro se `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` faltarem no build — um deploy sem elas quebra visivelmente em vez de conectar no projeto errado. `VITE_APP_URL` tem fallback deliberado para `window.location.origin` (`src/lib/appUrl.ts:16`) com o racional documentado.
- **Nenhum erro de runtime em produção** nos últimos 7 dias (`get_runtime_errors`) — coerente com uma arquitetura em que a Vercel só serve estático e toda a lógica mora no Supabase.

## 3. O que está errado ou incompleto

| # | Severidade | Problema | Evidência | Impacto prático | Correção sugerida |
|---|---|---|---|---|---|
| 3.1 | **ALTO** | Assets com hash servidos **sem cache imutável**: `Cache-Control: public, max-age=0, must-revalidate` até em `/assets/index-fBlawo2a.js` | curl -I no bundle em `clubcut.space` (2026-09-05); `vercel.json:2` usa o formato legado `routes` | Todo retorno ao app revalida cada chunk (o commit `d8c3884` conta 42 chunks na primeira camada, 96 no total) — round-trips desnecessários a cada visita, app mais lento no celular e mais requests contra a cota do plano Hobby. O nome do arquivo já carrega o hash; ele nunca muda de conteúdo | Trocar `routes` por `rewrites` (`{"source": "/(.*)", "destination": "/index.html"}`) — o formato moderno restaura o comportamento padrão do framework — e/ou declarar `headers` com `max-age=31536000, immutable` para `/assets/(.*)` |
| 3.2 | **ALTO** | **Nenhum header de segurança além de HSTS**: sem `Content-Security-Policy`, sem `X-Frame-Options`/`frame-ancestors`, sem `X-Content-Type-Options`, sem `Referrer-Policy`, sem `Permissions-Policy` | curl -I nos 4 domínios (2026-09-05); `vercel.json:1-6` não tem bloco `headers` | O CRM (com sessão de dono/gestor) pode ser embutido em iframe de terceiro (clickjacking sobre botões de cobrança/equipe); sem CSP, um XSS que passe pelo React roda sem segunda linha de defesa e pode exfiltrar o token de sessão do Supabase | Adicionar bloco `headers` no `vercel.json`: no mínimo `X-Frame-Options: DENY` (ou CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; CSP completa como passo seguinte, testada em Report-Only primeiro. Atenção: `headers` não convive com `routes` legado — depende do 3.1 |
| 3.3 | MÉDIO | Dois domínios antigos continuam servindo o app completo com 200, sem redirecionar: `clubcut.vercel.app` e `clinica-crm-kappa.vercel.app` | curl -I (2026-09-05) → ambos `HTTP/1.1 200`; `get_project → domains` | Três origens públicas para o mesmo app: links antigos, QR impressos e favoritos nunca migram; a landing indexa em duplicidade; e todo lugar que valida origem (allow-list do Supabase Auth, n8n) precisa carregar a lista tripla para sempre | Quando a transição do domínio terminar, redirecionar 308 os dois `*.vercel.app` para `clubcut.space` (bloco `redirects` no `vercel.json` com `has: host`, ou removendo o domínio extra `clinica-crm-kappa` do projeto) |
| 3.4 | MÉDIO | `docs/estado-do-projeto.md` está desatualizado em relação ao painel: diz "Domínio próprio — ainda em clubcut.vercel.app. Falta o endereço e o registrador" | `docs/estado-do-projeto.md:42-43` (atualizado 2026-08-16) vs `get_project → domains` contendo `clubcut.space` e o commit `4f9d51a` (2026-09-04) que registra os passos 1–3 fechados | O próprio doc se define como a fonte do que está pendente; quem o ler planeja trabalho já feito. Esta auditoria quase partiu da premissa errada | Atualizar a seção 2 do doc: domínio no ar, restando o que o commit `d8c3884` aponta (passo 10, teste ponta a ponta) |
| 3.5 | MÉDIO | Não há como confirmar que as 4 env vars que o código consome existem no painel com escopo certo — e o MCP não expõe leitura de env vars | `get_project` não retorna env vars; nenhuma tool de listagem no conjunto autorizado; nomes do lado do código em `src/lib/supabase.ts:18-19`, `src/lib/appUrl.ts:14`, `src/features/site/landing/WhatsAppPopup.tsx:43` | `VITE_SUPABASE_*` provadamente existem em Production (o build READY não lançou o erro de `required()`). Mas `VITE_APP_URL` e `VITE_AGENTE_IA_URL` têm fallback silencioso: se faltarem, convite/reset de senha herdam a origem da aba (`appUrl.ts:16`) e o popup do agente fica sem URL — sem nenhum erro de build | Dono confere no painel (Settings → Environment Variables) que os 4 nomes existem em **Production**, e lembrar a regra do `CLAUDE.md:11`: mudar valor exige redeploy |
| 3.6 | BAIXO | Web Analytics desligado enquanto a meta declarada é "medir ativação, retenção" | `get_web_analytics → 400 web_analytics_not_enabled`; `docs/estado-do-projeto.md:66-67` | Nenhuma medição de tráfego/funil no front (landing → cadastro). Se a medição é toda via banco, é decisão válida — mas hoje não está escrita em lugar nenhum | Ou habilitar Web Analytics no painel (tem tier gratuito), ou registrar no doc que a medição é 100% via Supabase |

## 4. O que ainda não quebrou mas vai virar problema em produção

- **Plano Hobby para um SaaS cobrado (ALTO).** `list_teams → plan: "hobby"`. Os termos do plano Hobby da Vercel restringem-no a uso **pessoal e não comercial**; o Club Cut cobra assinatura (docs/estado-do-projeto.md:19-26). Além do risco de política (suspensão/aviso da Vercel a qualquer momento), o Hobby tem teto de banda (100 GB/mês) e nenhum SLA. Com 5+ barbearias pagando — a meta da seção 3 do estado-do-projeto — migrar para o plano Pro deixa de ser opcional. *(Uso de banda atual: não verificável por tool — ver seção 6.)*
- **Cache `max-age=0` escala mal (reforço do 3.1).** Cada visita nova revalida ~100 arquivos. Hoje são duas barbearias; com dezenas de donos/barbeiros abrindo a agenda várias vezes ao dia, isso vira volume de requests e lentidão percebida — e no Hobby, requests contam contra limites de fair use.
- **Deploy de produção não é gateado pelo CI do GitHub.** Todos os pushes em `main` disparam produção direto (`list_deployments → 20/20 target production`); o CI (typecheck, lint, vitest, pgTAP — `CLAUDE.md:12`) roda em paralelo, não antes. O build da Vercel só repete o typecheck (`package.json:8`) — vitest e pgTAP **não** bloqueiam deploy. O commit `21f359b` documenta exatamente esse buraco ("o push passou porque o commit era um comando separado da cadeia de checagens"). Um teste vermelho com typecheck verde chega em produção. Mitigação futura: "Ignored Build Step" condicionado ao CI, ou deploy por branch + promoção.
- **Três origens públicas permanentes (reforço do 3.3).** Cada verificador de origem novo (edge function, n8n, allow-list de Auth) nasce tendo que conhecer `clubcut.space`, `clubcut.vercel.app` e `clinica-crm-kappa.vercel.app`. O commit `d8c3884` já registrou um incidente dessa família (n8n mandando link de `vercel.app` depois da troca). Quanto mais tempo os três viverem, mais lugares terão a lista incompleta.
- **Repo do GitHub é público** (`list_deployments → meta.githubRepoVisibility: "public"`). Não é um problema da Vercel em si — front é público por natureza no bundle — mas as mensagens de commit expostas detalham regras de cobrança, incidentes e decisões internas. Encaminhado como observação para o auditor do componente GitHub.
- **Node 24.x fixado no projeto** (`get_project → nodeVersion: "24.x"`): hoje atual; quando a Vercel descontinuar a versão, o build para. Sem ação agora — só ciência de que essa configuração mora no painel, não no repo.

## 5. Interfaces: o que ENTREGA e o que CONSOME

**ENTREGA:**

| Contrato | Detalhe | Fonte |
|---|---|---|
| `https://clubcut.space` | Origem canônica do app (200, HSTS, servida de `gru1`) | curl -I; `get_project → domains` |
| `https://www.clubcut.space` | 308 → `https://clubcut.space/` | curl -I → `Location` |
| `https://clubcut.vercel.app` | 200, app completo (origem legada ativa) | curl -I |
| `https://clinica-crm-kappa.vercel.app` | 200, app completo (origem legada ativa) | curl -I |
| Fallback SPA `/(.*) → /index.html` | Toda rota do React Router responde 200 com o shell | `vercel.json:3-4` |
| URLs de deployment `clubcut-<hash>-castrocollin01-6426s-projects.vercel.app` | Atrás de Vercel Authentication — **não** são interface pública | `get_project_deployment_protection` |
| Headers efetivos | `Cache-Control: public, max-age=0, must-revalidate` (tudo, inclusive assets), `Strict-Transport-Security` | curl -I |

**CONSOME:**

| Contrato | Detalhe | Fonte |
|---|---|---|
| GitHub `Saymon0123/Clinica`, branch `main` | Push dispara build+deploy de produção | `get_git_deployment_context`; `list_deployments → meta` |
| `npm run build` = `tsc -b && vite build`, Node 24.x | Pipeline de build na Vercel | `package.json:8`; `get_project → nodeVersion` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Obrigatórias em build time (build falha sem elas) | `src/lib/supabase.ts:8-19` |
| `VITE_APP_URL` | Opcional com fallback para origin; alimenta links de convite e reset de senha | `src/lib/appUrl.ts:14-24` |
| `VITE_AGENTE_IA_URL` | Opcional; alimenta o popup da landing | `src/features/site/landing/WhatsAppPopup.tsx:43` |
| DNS `clubcut.space` (A no apex, CNAME no www) hospedado na Hostinger | A resolução do domínio canônico depende de zona externa à Vercel | commit `4f9d51a` (via `list_deployments → meta.githubCommitMessage`) |

*(O runtime do app consome Supabase direto do navegador — interface do componente Supabase, não da Vercel.)*

## 6. NÃO VERIFICADO

| Item | Motivo | O que o dono precisa fornecer |
|---|---|---|
| Nomes e escopo (Production/Preview) das env vars no painel | O conjunto de tools autorizado não tem leitura de env vars; `get_project` não as retorna | Print ou lista de **nomes** (sem valores) de Settings → Environment Variables, com o escopo de cada uma |
| Conteúdo de `.env*` locais (inclusive `.env.example`) | Regra da auditoria proíbe abrir `.env*`; a lista de nomes esperados veio do grep em `src/` | Nada — a comparação painel × código fecha com o item acima |
| "Preview deployments habilitados?" como configuração explícita | Não há tool de leitura das settings de git integration; os 20 deploys listados são todos de produção (`main`), o que não prova a configuração | Print de Settings → Git (Preview Deployments / branch tracking) |
| Gating do deploy por CI ("Ignored Build Step" / required checks) | Mesma limitação acima; o observado (deploy dispara direto no push) é inferência do comportamento | Print de Settings → Git → Ignored Build Step |
| Configuração de domínio primário/redirect no painel (www → apex foi **observado** via curl, não lido como config) | Sem tool de leitura de configuração de domínios | Print de Settings → Domains (qual é o primary e quais redirecionam) |
| Uso de banda/requests do mês (relevante pelos limites do Hobby) | Sem tool de usage/billing no conjunto autorizado | Print de Usage no dashboard do time |
| Web Analytics | `get_web_analytics` falhou: `400 web_analytics_not_enabled` (registrado, não repetido) | Decisão: habilitar ou declarar que a medição é via banco |
