-- O boleto do fechamento passa a nascer sozinho (2026-08-24).
--
-- O fluxo manual tinha dois defeitos: o e-mail nao trazia o externalReference
-- (o dono do produto teria que cacar o UUID a cada boleto) e nao escalava --
-- 50 barbearias virariam a manha do dia 1. Agora a edge function `cobrar-uso`
-- cria a cobranca no Asaas para toda fatura aberta, o dono da barbearia recebe
-- o link por e-mail e ve o boleto no CRM, e o dono do PRODUTO segue recebendo
-- o detalhamento -- muda de executor para supervisor.
--
-- Regras que o schema carrega:
-- - Minimo do Asaas (R$5): grupo abaixo disso nao vira boleto; as faturas
--   ficam abertas e ACUMULAM. Uma cobranca pode cobrir varias faturas, e o
--   `asaas_payment_id` compartilhado registra isso.
-- - Rede com `cobranca_unificada`: as faturas das unidades entram numa
--   cobranca so, com externalReference `rede:<orgId>` -- que o webhook ja usa
--   para estender todas as unidades.
-- - Duas filas de e-mail independentes: `notificada_em` (detalhamento para o
--   dono do produto) e `boleto_notificado_em` (boleto para o dono da
--   barbearia). Fatura abaixo do minimo tem detalhamento sem boleto, e o
--   boleto pode nascer horas depois -- uma fila so perderia e-mails.

alter table public.faturas_de_uso
  add column if not exists asaas_payment_id text,
  add column if not exists boleto_url text,
  add column if not exists boleto_vencimento date,
  add column if not exists boleto_valor numeric,
  add column if not exists boleto_notificado_em timestamptz,
  add column if not exists paga_em timestamptz;

comment on column public.faturas_de_uso.asaas_payment_id is
  'Cobranca no Asaas que cobre esta fatura. VARIAS faturas podem apontar para a MESMA cobranca: e assim que o acumulo de valores abaixo do minimo (R$5) e o boleto unico da rede funcionam.';
comment on column public.faturas_de_uso.boleto_url is
  'Link da fatura no Asaas (boleto/Pix/cartao). E o que o dono ve no CRM e recebe por e-mail.';
comment on column public.faturas_de_uso.boleto_valor is
  'Valor TOTAL da cobranca no Asaas que cobre esta fatura. Difere de `valor` quando o boleto acumula faturas de meses anteriores abaixo do minimo de R$5, ou quando e o boleto unico da rede.';
comment on column public.faturas_de_uso.boleto_notificado_em is
  'Quando o e-mail com o boleto saiu para o DONO DA BARBEARIA. Fila separada de notificada_em (o detalhamento do dono do produto) de proposito: fatura abaixo do minimo tem detalhamento mas nao tem boleto, e o boleto pode nascer horas depois do detalhamento.';
comment on column public.faturas_de_uso.paga_em is
  'Quando o webhook confirmou o pagamento da cobranca que cobre esta fatura. E o que o CRM usa para mostrar pago/em aberto.';

-- O e-mail do dono da barbearia, para o boleto chegar na caixa dele.
-- SECURITY DEFINER porque auth.users nao e acessivel via PostgREST; restrita a
-- service_role -- expor a authenticated viraria oraculo de e-mails, mesma
-- razao da user_id_por_email.
create or replace function public.email_do_dono(p_salon_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.email
    from public.user_salons us
    join auth.users u on u.id = us.user_id
   where us.salon_id = p_salon_id and us.role = 'owner'
   order by u.created_at
   limit 1;
$$;

revoke execute on function public.email_do_dono(uuid) from public, anon, authenticated;

-- A fila do detalhamento ganha o que os e-mails precisam.
drop view if exists public.faturas_a_notificar;
create view public.faturas_a_notificar
with (security_invoker = on) as
select f.id, f.salon_id, s.nome as barbearia,
       o.nome as rede,
       f.periodo_inicio, f.periodo_fim, f.motivo,
       f.barbeiros, f.preco_unitario, f.agendamentos, f.lembretes, f.reativacoes,
       f.valor, f.valor_gerado, f.detalhe, f.gerada_em,
       f.boleto_url, f.boleto_vencimento, f.boleto_valor,
       public.email_do_dono(f.salon_id) as email_do_dono
  from public.faturas_de_uso f
  join public.salons s on s.id = f.salon_id
  left join public.organizations o on o.id = s.organization_id
 where f.notificada_em is null;

revoke all on public.faturas_a_notificar from anon, authenticated;
grant select on public.faturas_a_notificar to service_role;

-- A fila do boleto: uma linha POR COBRANCA, nao por fatura -- o boleto
-- acumulado cobre varias faturas e o dono deve receber UM e-mail, nao tres.
drop view if exists public.boletos_a_enviar;
create view public.boletos_a_enviar
with (security_invoker = on) as
select distinct on (f.asaas_payment_id)
       f.asaas_payment_id,
       f.boleto_url, f.boleto_valor, f.boleto_vencimento,
       f.salon_id,
       s.nome as barbearia,
       o.nome as rede,
       (o.id is not null and o.cobranca_unificada) as unificada,
       public.email_do_dono(f.salon_id) as email_do_dono,
       (select count(*) from public.faturas_de_uso f2
         where f2.asaas_payment_id = f.asaas_payment_id) as faturas_no_boleto,
       f.periodo_inicio, f.periodo_fim, f.agendamentos, f.preco_unitario,
       f.valor, f.valor_gerado, f.lembretes, f.reativacoes, f.motivo
  from public.faturas_de_uso f
  join public.salons s on s.id = f.salon_id
  left join public.organizations o on o.id = s.organization_id
 where f.asaas_payment_id is not null
   and f.boleto_url is not null
   and f.boleto_notificado_em is null
 order by f.asaas_payment_id, f.periodo_fim desc;

revoke all on public.boletos_a_enviar from anon, authenticated;
grant select on public.boletos_a_enviar to service_role;
