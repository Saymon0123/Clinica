-- Caixa automatico (2026-08-25).
--
-- O ritual manual de abrir e fechar o caixa todo dia era esquecido -- e caixa
-- esquecido aberto por tres dias torna a conferencia inutil. Decisao do dono:
-- o caixa ABRE SOZINHO na primeira venda do dia (com o troco padrao do salao)
-- e FECHA SOZINHO a meia-noite (America/Sao_Paulo) com o valor esperado.
-- O dono so interage se quiser conferir a gaveta: o fechamento manual com
-- contagem continua existindo, mas e opcional.

alter table public.salons
  add column if not exists troco_padrao numeric not null default 0;
comment on column public.salons.troco_padrao is
  'Troco que fica na gaveta ao comecar o dia. Vira o valor_abertura do caixa aberto automaticamente na primeira venda.';

alter table public.cash_registers
  add column if not exists fechado_automaticamente boolean not null default false;
comment on column public.cash_registers.fechado_automaticamente is
  'true quando o fechamento da meia-noite fechou o caixa com o valor esperado, sem contagem de gaveta. false = alguem contou e fechou a mao.';

-- Valor esperado na gaveta: abertura + dinheiro das comandas fechadas desde
-- entao. Cartao e pix nao passam pela gaveta.
create or replace function public.esperado_no_caixa(p_caixa_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cr.valor_abertura + coalesce((
           select sum(p.valor)
             from public.payments p
             join public.orders o on o.id = p.order_id
            where o.salon_id = cr.salon_id
              and o.status = 'fechada'
              and o.closed_at >= cr.aberto_em
              and p.forma_pagamento = 'dinheiro'
         ), 0)
    from public.cash_registers cr
   where cr.id = p_caixa_id;
$$;
revoke execute on function public.esperado_no_caixa(uuid) from public, anon;
grant execute on function public.esperado_no_caixa(uuid) to authenticated, service_role;

-- Abre o caixa na primeira venda do dia. SECURITY DEFINER porque quem fecha a
-- comanda pode ser o barbeiro, e a RLS de cash_registers e so do gestor -- o
-- caixa nasce pelo sistema, nao pelo papel de quem vendeu.
create or replace function public.abre_caixa_na_venda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon uuid;
  v_caixa public.cash_registers%rowtype;
begin
  select o.salon_id into v_salon from public.orders o where o.id = new.order_id;
  if v_salon is null then
    return new;
  end if;

  select * into v_caixa
    from public.cash_registers
   where salon_id = v_salon and status = 'aberto'
   order by aberto_em desc
   limit 1;

  if found then
    -- Caixa de um dia anterior que ninguem fechou: fecha com o esperado
    -- (sem contagem) e abre o de hoje em seguida.
    if (v_caixa.aberto_em at time zone 'America/Sao_Paulo')::date
       < (now() at time zone 'America/Sao_Paulo')::date then
      update public.cash_registers
         set status = 'fechado',
             fechado_em = now(),
             valor_fechamento = public.esperado_no_caixa(v_caixa.id),
             fechado_automaticamente = true
       where id = v_caixa.id;
    else
      return new; -- caixa de hoje ja aberto, nada a fazer
    end if;
  end if;

  insert into public.cash_registers (salon_id, aberto_por, valor_abertura, status)
  select v_salon, null, s.troco_padrao, 'aberto'
    from public.salons s
   where s.id = v_salon;
  return new;
end;
$$;

drop trigger if exists trg_abre_caixa_na_venda on public.payments;
create trigger trg_abre_caixa_na_venda
  after insert on public.payments
  for each row execute function public.abre_caixa_na_venda();

-- Fechamento da meia-noite: fecha todo caixa aberto de dias anteriores com o
-- valor esperado. Roda 00:05 de Sao Paulo (03:05 UTC).
create or replace function public.fechar_caixas_do_dia()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  update public.cash_registers cr
     set status = 'fechado',
         fechado_em = now(),
         valor_fechamento = public.esperado_no_caixa(cr.id),
         fechado_automaticamente = true
   where cr.status = 'aberto'
     and (cr.aberto_em at time zone 'America/Sao_Paulo')::date
         < (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;
revoke execute on function public.fechar_caixas_do_dia() from public, anon, authenticated;

select cron.schedule(
  'fechamento-diario-do-caixa',
  '5 3 * * *',
  $$select public.fechar_caixas_do_dia()$$
);
