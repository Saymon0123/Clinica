# Recuperação — como trazer o banco de volta

**Testado de ponta a ponta em 2026-10-03**, contra a produção, com restauração
real num Postgres limpo e comparação das duas pontas. O que está aqui funcionou;
o que não foi testado está marcado como não testado.

> **Por que este arquivo existe.** O `estado-do-projeto.md` listava backup como
> *"o único item que pode acabar com o negócio num dia"* desde agosto, com a
> premissa errada (*"plano gratuito, sem backup gerenciado"* — a organização está
> no **Pro**). Backup existe e é diário. O que não existia era **prova de que dá
> para voltar** — e prova é restaurar, não ter o arquivo.

---

## O que a Supabase guarda sozinha

- Plano **Pro**: backup **diário**, os **últimos 7 dias**, em
  **Database → Backups → Scheduled backups**.
- Horário real medido: ~05:48 UTC, que é **02:48 em São Paulo**.
- **PITR está desligado** (`pitr_enabled: false`). Com isso, a perda máxima num
  desastre é o que entrou **entre 02:48 e o incidente** — até ~24h. Ligar PITR é
  add-on pago; é a única alavanca que diminui esse número.
- A aba **`Restore to new project`** (Beta) clona para um projeto novo, mas
  **custa US$ 9,99**. O roteiro abaixo faz o mesmo de graça, com Docker.
- **Backup de banco não leva arquivo de Storage** (a própria tela avisa). Hoje
  isso não custa nada: o projeto tem **zero buckets**. Passa a custar no dia em
  que a logo por barbearia existir (item 17).

## O que o backup NÃO traz, e precisa de passo próprio

Restaurar o banco **não** devolve o sistema no ar. Faltam:

- as **12 edge functions** (`supabase functions deploy`, ver `CLAUDE.md`);
- os **segredos** do Vault e as variáveis das edges;
- a configuração de **Auth** (URLs, SMTP) e os **fluxos do n8n**;
- senhas de roles customizadas (a Supabase não as guarda no backup diário).

---

## O roteiro testado (de graça, com Docker)

Pré-requisitos: **Docker Desktop aberto** e `~/.clubcut/supabase.env` com
`SUPABASE_DB_URL`. Não precisa de `pg_dump` instalado — ele vem na imagem.

### 1. Tirar o dump da produção (leitura pura)

```bash
set -a; . ~/.clubcut/supabase.env; set +a; export PGURL="$SUPABASE_DB_URL"
docker run --rm -e PGURL postgres:17 \
  pg_dump "$PGURL" --schema=auth --schema=public --schema=private \
  --no-owner --quote-all-identifiers > producao.sql
```

**`--schema=auth` não é opcional, e foi o achado do teste.** Sem ele o dump sai
limpo e a restauração falha em **quatro tabelas**, todas apontando para
`auth.users`:

```
user_salons.user_id          <- o vinculo entre o login e a barbearia
termos_aceites.user_id
notificacoes_vistas.user_id
cash_registers.aberto_por
```

Ou seja: o banco subiria inteiro e **ninguém conseguiria entrar na própria
barbearia**. É o tipo de defeito que só aparece restaurando.

> A URL usa a **porta 5432** (pooler de sessão), e é isso que torna o `pg_dump`
> possível. Pela 6543 (modo transação) não funcionaria.

### 2. Subir um Postgres limpo da mesma versão

```bash
docker run -d --name pg-restauracao -e POSTGRES_PASSWORD=teste \
  -e POSTGRES_DB=clubcut postgres:17
```

### 3. Preparar o alvo

O dump referencia coisas que a Supabase põe e o Postgres de fábrica não tem.
Criar **antes** de restaurar — em especial os papéis, senão a única saída seria
restaurar com `--no-privileges`, que **joga fora justamente os grants**.

```sql
create role anon nologin; create role authenticated nologin;
create role service_role nologin; create role supabase_admin nologin;
create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;
create role authenticator nologin; create role dashboard_user nologin;

create schema if not exists extensions;
create schema if not exists cron;

create extension if not exists btree_gist with schema public;   -- as travas EXCLUDE
create extension if not exists pgcrypto with schema extensions; -- extensions.gen_random_bytes
create extension if not exists "uuid-ossp" with schema extensions;

-- pg_cron nao existe no Postgres de fabrica; as duas tabelas sao so referencia.
create table cron.job (jobid bigint primary key, jobname text, schedule text,
                       command text, active boolean);
create table cron.job_run_details (runid bigint primary key, jobid bigint,
                       status text, start_time timestamptz, end_time timestamptz);
```

### 4. Restaurar

```bash
docker exec -i pg-restauracao psql -U postgres -d clubcut \
  -v ON_ERROR_STOP=0 -q < producao.sql 2> restore-erros.txt
grep -cE '^ERROR' restore-erros.txt
```

**Resultado esperado: 1 erro**, e só este — `schema "public" already exists`,
inofensivo (o dump tenta criar o `public`, que já existe). Qualquer outro erro é
notícia.

### 5. Comparar as duas pontas

Rodar o mesmo SQL nos dois e conferir que a linha é idêntica. Comparar tabela a
tabela à mão é onde se deixa passar justamente o que divergiu.

```sql
with contagens as (
  select c.relname,
         (xpath('/row/cnt/text()', query_to_xml(
            format('select count(*) as cnt from public.%I', c.relname),
            false, true, '')))[1]::text::bigint as linhas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
), grants_col as (
  select table_name||':'||privilege_type||':'||grantee||':'||column_name as g
    from information_schema.column_privileges
   where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
)
select
  (select count(*) from contagens)                                   as tabelas,
  (select sum(linhas) from contagens)                                as linhas_totais,
  (select md5(string_agg(relname||'='||linhas, ',' order by relname))
     from contagens)                                                 as md5_contagens,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private'))                         as funcoes,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as tabelas_com_rls,
  (select count(*) from pg_policies where schemaname='public')       as policies,
  (select md5(string_agg(g, ',' order by g)) from grants_col)        as md5_grants_por_coluna;
```

**O md5 dos grants por coluna é o que mais importa aqui**, e por isso está na
lista: `salons` dá UPDATE **por coluna** e `salon_invites` dá INSERT **por
coluna**. Uma restauração que trouxesse as linhas e perdesse esses privilégios
pareceria certa e derrubaria telas inteiras.

**Medido em 03/10**, com o dump tirado minutos antes — as duas pontas idênticas:

| | produção | restaurado |
|---|---|---|
| tabelas | 51 | 51 |
| linhas totais | 10.456 | 10.456 |
| md5 das contagens | `2f349184c2d8139d7394a42cffc7a697` | igual |
| funções | 288 | 288 |
| tabelas com RLS | 51 | 51 |
| policies | 66 | 66 |
| md5 dos grants por coluna | `6160c2cc9f5f50bd1a65811ed2d83ce2` | igual |

### 6. Limpar

```bash
docker rm -f pg-restauracao
```

E **apagar o dump** ou guardá-lo em lugar seguro: ele leva nome e telefone de
todos os clientes e, com `--schema=auth`, os **hashes de senha**. Nunca entra no
repositório — ele é público.

---

## O que continua sem prova

- **O botão `Restore` da própria Supabase nunca foi usado.** Este roteiro prova
  que *você* consegue reconstruir a partir de um arquivo seu, que é a garantia
  que não depende de pagar nem de eles estarem no ar. O caminho deles segue não
  exercitado, e restaurar por cima da produção **derruba o projeto durante o
  processo** — não é coisa para testar por curiosidade.
- **A volta completa do sistema** (banco + edges + segredos + n8n) nunca foi
  ensaiada junta. Este roteiro cobre a primeira parte.
