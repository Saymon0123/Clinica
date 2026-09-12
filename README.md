# Clínica — CRM para barbearias e salões

CRM multi-tenant para barbearias e salões: agenda, clientes, financeiro
(caixa/comanda/comissões), catálogo de produtos e serviços, equipe, assinatura
e cobrança por uso, e atendimento por WhatsApp com agente de IA.

## Stack

- React + Vite + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth + edge functions em Deno)
- React Router
- n8n, fora deste repositório, para tudo que fala com o cliente final

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencher com as credenciais do projeto Supabase
npm run dev
```

Não há fallback para as credenciais do Supabase: sem `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` definidas, a aplicação falha ao iniciar em vez de
conectar silenciosamente no projeto errado.

## Testes

```bash
npm run typecheck   # tsc -b — cobre src/ e o vite.config.ts
npm run lint        # oxlint
npm test            # vitest — funções puras de src/ e de supabase/functions/_shared
npm run test:db     # pgTAP — políticas de RLS (requer Docker)
```

`npm run test:db` sobe o Postgres local do Supabase, aplica as migrations e roda
`supabase/tests/`. É o único lugar onde o isolamento entre salões é verificado —
sem ele, uma regressão nas políticas de RLS passa despercebida.

O CI (`.github/workflows/ci.yml`) roda a cada push e PR e vai além dos dois:

| Job | O que faz |
|---|---|
| Typecheck, lint e testes de unidade | os quatro comandos acima, menos o `test:db`, mais `deno check` sobre as edge functions — que o `tsc -b` não alcança |
| Testes de RLS (pgTAP) | o `test:db`, contra um banco criado do zero |
| Segredos no codigo (gitleaks) | varre a árvore em busca de credencial commitada |
| Vulnerabilidade nas dependencias (npm audit) | não trava o merge de propósito: aviso novo nasce do mundo lá fora, não do PR |

O CodeQL roda à parte (`.github/workflows/codeql.yml`), na `main` e toda semana —
nunca em PR, porque achado dele precisa de triagem e viraria atraso.

## Estrutura

```
src/
  features/    # um diretório por módulo: agenda, clientes, financeiro, vendas,
               # catalogo, equipe, rede, assinatura, whatsappWeb, site, auth,
               # adminTool, entre outros
  components/  # UI compartilhada (layout, cards, etc.)
  lib/         # cliente Supabase e helpers
supabase/
  migrations/  # o schema inteiro, em ordem; aplicadas À MÃO em produção
  functions/   # edge functions em Deno; `_shared/` é o código comum entre elas
  tests/       # pgTAP
```

As migrations **não estão no pipeline de deploy**: subir código não aplica
migration. Quem aplica em produção é uma pessoa, à mão.

## Arquitetura

SPA React falando direto com o Postgres do Supabase — não há backend próprio.
A autorização mora inteiramente no banco, via RLS: **toda tabela do schema
`public` tem RLS habilitado**, com políticas por papel (dono da rede / gerente /
barbeiro). Não é uma contagem que envelhece: é um invariante, e quebrá-lo é
regressão. As políticas foram crescendo desde a `0002` e hoje estão espalhadas
por dezenas de migrations.

As edge functions cobrem o que RLS não alcança: criação de salão e de unidade,
convite de equipe, a agenda pública (que atende quem não tem login), o webhook
do WhatsApp, a cobrança por uso e o webhook do pagamento. Todas passam por
`_shared/sentry.ts`, que captura o erro e fecha cada requisição com uma linha de
log dizendo função, status, duração e **de qual barbearia** ela era.

Cada módulo em `src/features/` segue a mesma forma: `XPage.tsx` + modais +
`types.ts` + um hook `useXData.ts` que concentra o acesso ao Supabase. O escopo
multi-tenant vem de `useSalon()` (`src/features/auth/`), do qual todas as
páginas dependem.

Este repositório é **uma de cinco peças** — CRM, Supabase, Vercel, GitHub e n8n.
Nenhuma automação que fale com o cliente final existe sem passar pelo n8n. O
[`CLAUDE.md`](CLAUDE.md) explica por que isso está escrito em todo lugar.

## Status

Em produção. Módulos implementados: agenda, clientes (com importação CSV),
financeiro (caixa, comandas, comissões, metas), vendas, catálogo, equipe e
convites, rede/multi-unidade, agenda pública, assinatura e cobrança por uso, e
atendimento WhatsApp com agente de IA.

A integração com o n8n é descrita em [docs/n8n-integration.md](docs/n8n-integration.md).
O que está aberto mora em [docs/backlog.md](docs/backlog.md).

Pendências conhecidas:
- **Cobertura de testes desigual.** Funções puras e o isolamento multi-tenant
  são bem cobertos; hooks de dados e a maior parte dos componentes, não.
- **O fluxo do n8n atua com `service_role`, que ignora RLS.** O filtro por
  `salon_id` depende inteiramente do fluxo externo; o banco não protege contra
  gravação no salão errado.
- **As edge functions não têm teste próprio.** O `deno check` do CI garante que
  elas compilam; que elas fazem a coisa certa, ninguém verifica automaticamente.
