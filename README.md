# Clínica — CRM para barbearias e salões

CRM multi-tenant para barbearias e salões: agenda, clientes, financeiro
(caixa/comanda/comissões), catálogo de produtos e serviços, equipe e
atendimento por WhatsApp com agente de IA.

## Stack

- React + Vite + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth)
- React Router, TanStack Query

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
npm run typecheck   # tsc -b
npm run lint        # oxlint
npm test            # vitest — funções puras de src/lib
npm run test:db     # pgTAP — políticas de RLS (requer Docker)
```

`npm run test:db` sobe o Postgres local do Supabase, aplica as migrations e roda
`supabase/tests/`. É o único lugar onde o isolamento entre salões é verificado —
sem ele, uma regressão nas políticas de RLS passa despercebida. Os dois níveis
rodam no CI a cada push e PR (`.github/workflows/ci.yml`).

## Estrutura

```
src/
  features/    # agenda, clientes, financeiro, vendas, catalogo, equipe,
               # rede, conexao, whatsappWeb, auth, adminTool
  components/  # UI compartilhada (layout, cards, etc.)
  lib/         # cliente Supabase e helpers
supabase/
  migrations/  # schema do banco (20 migrations)
  functions/   # edge functions: admin-create-salon, accept-invite,
               # add-salon-unit, whatsapp
```

## Arquitetura

SPA React falando direto com o Postgres do Supabase — não há backend próprio.
A autorização mora inteiramente no banco, via RLS: as 21 tabelas têm RLS
habilitado e políticas por papel (dono da rede / gerente / barbeiro), definidas
em `0014`–`0020`. As edge functions cobrem só o que RLS não alcança (criação de
salão, convite de equipe, ponte com a Evolution API).

Cada módulo em `src/features/` segue a mesma forma: `XPage.tsx` + modais +
`types.ts` + um hook `useXData.ts` que concentra o acesso ao Supabase. O escopo
multi-tenant vem de `useSalon()` (`src/features/auth/`), do qual todas as
páginas dependem.

## Status

Em produção. Módulos implementados: agenda, clientes (com importação CSV),
financeiro (caixa, comandas, comissões, metas), vendas, catálogo, equipe e
convites, rede/multi-unidade, e atendimento WhatsApp com agente de IA.

A integração com o n8n é descrita em [docs/n8n-integration.md](docs/n8n-integration.md).

Pendências conhecidas:
- Cobertura de testes ainda rasa: unidades de `src/lib` e o isolamento
  multi-tenant em pgTAP. Componentes e hooks de dados não têm teste.
- O fluxo do n8n atua com `service_role`, que ignora RLS. O filtro por
  `salon_id` depende inteiramente do fluxo externo; o banco não protege contra
  gravação no salão errado.
