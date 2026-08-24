-- Base para as metricas corretas do Financeiro (2026-08-24).
--
-- Dois defeitos conceituais da tela:
-- 1. "Cancelamentos" contava pela data do AGENDAMENTO, nao do cancelamento:
--    um horario de setembro cancelado hoje so aparecia na metrica em setembro.
--    A coluna `cancelado_em` e carimbada por trigger -- e nao pelo app --
--    porque o agente do WhatsApp e o n8n tambem cancelam.
-- 2. O grafico de clientes baixava a tabela `clients` INTEIRA para o navegador
--    so para contar por mes. A RPC devolve 12 linhas.

alter table public.appointments
  add column if not exists cancelado_em timestamptz;

comment on column public.appointments.cancelado_em is
  'Quando o status virou cancelado, carimbado por trigger (o app, o agente do WhatsApp e o n8n cancelam por caminhos diferentes). Nulo se nunca foi cancelado ou se foi reativado depois.';

create or replace function public.carimba_cancelamento()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelado' and (old.status is distinct from 'cancelado') then
    new.cancelado_em := now();
  elsif new.status is distinct from 'cancelado' then
    -- Reativado: o cancelamento deixou de existir, a metrica nao deve conta-lo.
    new.cancelado_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_carimba_cancelamento on public.appointments;
create trigger trg_carimba_cancelamento
  before update of status on public.appointments
  for each row execute function public.carimba_cancelamento();

-- Historico: sem registro de quando cancelaram, a melhor aproximacao e a data
-- do proprio horario -- mantem os numeros antigos iguais ao que a tela mostrava.
update public.appointments
   set cancelado_em = data_hora_inicio
 where status = 'cancelado' and cancelado_em is null;

-- Clientes por mes: 12 linhas em vez da tabela inteira. SECURITY INVOKER de
-- proposito -- a RLS de `clients` decide o que o usuario enxerga.
create or replace function public.clientes_por_mes(p_salon_id uuid)
returns table (mes date, novos integer, total integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with meses as (
    select date_trunc('month', now())::date - (interval '1 month' * g) as inicio
      from generate_series(11, 0, -1) as g
  )
  select m.inicio::date as mes,
         count(c.id) filter (
           where date_trunc('month', c.created_at)::date = m.inicio
         )::integer as novos,
         count(c.id) filter (
           where c.created_at < m.inicio + interval '1 month'
         )::integer as total
    from meses m
    left join public.clients c on c.salon_id = p_salon_id
   group by m.inicio
   order by m.inicio;
$$;

revoke execute on function public.clientes_por_mes(uuid) from public, anon;
grant execute on function public.clientes_por_mes(uuid) to authenticated, service_role;
