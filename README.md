# Clínica — CRM para salões pequenos

MVP de um CRM simplificado para salões de beleza pequenos: agenda, clientes,
financeiro (caixa/comanda), estoque e profissionais.

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

## Estrutura

```
src/
  features/    # agenda, clientes, financeiro, estoque, profissionais, auth
  components/  # UI compartilhada (layout, etc.)
  lib/         # cliente Supabase e helpers
supabase/
  migrations/  # schema do banco
```

## Status

Scaffold inicial: estrutura de projeto, autenticação (login via Supabase Auth,
rotas protegidas) e páginas placeholder por módulo. Schema inicial do banco em
`supabase/migrations/0001_init.sql`.

Pendências conhecidas:
- Políticas de RLS (Row Level Security) ainda não escritas — tabelas estão com
  RLS habilitado e sem políticas, ou seja, bloqueadas por padrão até o fluxo
  de cadastro do salão/vínculo usuário→salão ser implementado.
- Cadastro de novo salão (onboarding) ainda não existe — hoje só há tela de
  login, assumindo que o usuário já foi criado no Supabase Auth.
