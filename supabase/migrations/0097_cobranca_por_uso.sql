-- Cobranca por uso: o cliente paga por agendamento feito pelo agente no
-- WhatsApp. Fim da assinatura pelo sistema.
--
-- Modelo decidido em 2026-08-23:
--
-- - **Cobra-se o agendamento criado pelo agente** (`origem = 'agente'`), mesmo
--   que seja cancelado depois: o sistema entregou o prometido. Reagendamento
--   nao cobra de novo (e a mesma linha). CRM e QR do balcao nao cobram.
-- - **Preco por faixa de barbeiros ativos**, medidos no ULTIMO dia do periodo.
--   A faixa nao aparece para o cliente -- so o preco unitario dele.
-- - **Lembrete nao cobra** (o agendamento ja pagou). Reativacao nao cobra por
--   mensagem; se ela gerar agendamento, o agendamento cobra como qualquer um.
-- - **Sem minimo e sem franquia gratis** no lancamento.
-- - O fechamento e MENSAL (mes civil), roda DENTRO do banco (pg_cron) e
--   congela numa tabela: fatura fechada nao muda se um agendamento for
--   cancelado depois. O n8n so entrega o e-mail; o boleto e gerado a mao.
-- - Cancelamento gera fatura parcial na hora (ultimo fechamento -> hoje).

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Faixas de preco. Em tabela, nao em constante: quando o preco mudar, muda
-- aqui e todo fechamento novo acompanha. Faturas ja geradas nao mudam, porque
-- congelam o preco na linha.
-- ---------------------------------------------------------------------------
create table if not exists public.faixas_de_uso (
  min_barbeiros integer primary key,
  max_barbeiros integer,
  preco numeric not null
);

alter table public.faixas_de_uso enable row level security;
-- Sem policy de proposito: o cliente ve o PRECO dele (na view e na fatura),
-- nunca a tabela de faixas -- decisao explicita de 2026-08-23.

insert into public.faixas_de_uso (min_barbeiros, max_barbeiros, preco) values
  (1, 3, 0.75), (4, 7, 0.70), (8, 10, 0.65), (11, null, 0.60)
on conflict (min_barbeiros) do update
  set max_barbeiros = excluded.max_barbeiros, preco = excluded.preco;

create or replace function public.preco_por_uso(p_barbeiros integer)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.preco
    from public.faixas_de_uso f
   where greatest(p_barbeiros, 1) >= f.min_barbeiros
     and (f.max_barbeiros is null or greatest(p_barbeiros, 1) <= f.max_barbeiros)
   order by f.min_barbeiros
   limit 1;
$$;

-- Licao da 0095: revogar de PUBLIC, senao anon herda o EXECUTE default.
revoke execute on function public.preco_por_uso(integer) from public, anon;
grant execute on function public.preco_por_uso(integer) to authenticated, service_role;
-- authenticated PODE: devolve so o preco unitario para o dashboard, que e
-- exatamente o que o cliente deve ver. A tabela de faixas continua fechada.

-- ---------------------------------------------------------------------------
-- A fatura congelada.
-- ---------------------------------------------------------------------------
create table if not exists public.faturas_de_uso (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null,
  motivo text not null default 'mensal' check (motivo in ('mensal', 'cancelamento')),
  barbeiros integer not null,
  preco_unitario numeric not null,
  agendamentos integer not null,
  lembretes integer not null default 0,
  reativacoes integer not null default 0,
  valor numeric not null,
  valor_gerado numeric not null default 0,
  detalhe jsonb not null default '[]'::jsonb,
  gerada_em timestamptz not null default now(),
  notificada_em timestamptz,
  unique (salon_id, periodo_inicio, periodo_fim, motivo)
);

comment on table public.faturas_de_uso is
  'Fechamentos de uso congelados. A fatura NAO e uma view ao vivo de proposito: cancelar um agendamento dia 3 nao pode mudar a fatura fechada dia 1. O boleto e gerado a mao a partir do e-mail que o n8n envia; o unique torna o fechamento idempotente.';
comment on column public.faturas_de_uso.detalhe is
  'Uma linha por agendamento cobrado (data, hora, servico, valor do servico, status). E a defesa quando o cliente contestar a contagem.';
comment on column public.faturas_de_uso.valor_gerado is
  'Soma dos precos dos servicos dos agendamentos cobrados. E o argumento de retencao: o agente trouxe R$ X, custou R$ Y.';
comment on column public.faturas_de_uso.notificada_em is
  'Quando o e-mail com o detalhamento saiu para o dono do produto. O n8n marca DEPOIS de enviar; nulo = ainda na fila.';

alter table public.faturas_de_uso enable row level security;

-- O dono da barbearia le as proprias faturas (historico no dashboard).
-- Escrita: so service_role, via funcoes de fechamento.
drop policy if exists "faturas_de_uso: dono le" on public.faturas_de_uso;
create policy "faturas_de_uso: dono le" on public.faturas_de_uso
  for select using (
    exists (
      select 1 from public.user_salons us
       where us.salon_id = faturas_de_uso.salon_id
         and us.user_id = (select auth.uid())
         and us.role = 'owner'
    )
  );

-- reativacao_envios nao tinha policy de SELECT: qualquer view invoker por cima
-- mostraria zero em silencio para o dono. Dono le o que e da barbearia dele.
drop policy if exists "reativacao_envios: dono le" on public.reativacao_envios;
create policy "reativacao_envios: dono le" on public.reativacao_envios
  for select using (salon_id in (select private.salon_ids()));

-- ---------------------------------------------------------------------------
-- O fechamento de um periodo.
-- ---------------------------------------------------------------------------
create or replace function public.gerar_fatura_de_uso(
  p_salon_id uuid,
  p_inicio date,
  p_fim date,
  p_motivo text default 'mensal'
)
returns public.faturas_de_uso
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_barbeiros integer;
  v_preco numeric;
  v_agendamentos integer;
  v_lembretes integer;
  v_reativacoes integer;
  v_valor_gerado numeric;
  v_detalhe jsonb;
  v_fatura public.faturas_de_uso;
begin
  -- Idempotente: rodar duas vezes nao gera duas faturas. Devolve a existente.
  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  if found then
    return v_fatura;
  end if;

  -- Barbeiros ativos AGORA. Para o fechamento mensal rodando no dia 1, "agora"
  -- e a madrugada seguinte ao ultimo dia -- a regra combinada.
  select count(*) into v_barbeiros
    from public.professionals p
   where p.salon_id = p_salon_id and p.ativo;

  v_preco := public.preco_por_uso(v_barbeiros);

  -- O que cobra: criado pelo AGENTE dentro do periodo (fuso de Brasilia).
  -- `status <> 'bloqueio'` por higiene; cancelado COBRA, por decisao explicita
  -- (o sistema entregou o prometido). Reagendar nao duplica: e a mesma linha,
  -- e o created_at nao muda.
  select count(*),
         coalesce(sum(s.preco), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'data', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'hora', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
               'servico', coalesce(s.nome, '—'),
               'valor_servico', coalesce(s.preco, 0),
               'status', a.status
             )
             order by a.created_at
           ),
           '[]'::jsonb
         )
    into v_agendamentos, v_valor_gerado, v_detalhe
    from public.appointments a
    left join public.services s on s.id = a.service_id
   where a.salon_id = p_salon_id
     and a.origem = 'agente'
     and a.status <> 'bloqueio'
     and (a.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  -- Lembrete nao cobra; conta para o detalhamento. A data do envio e
  -- aproximada pela data do horario marcado: o lembrete sai 1h30 antes, entao
  -- as duas caem no mesmo dia.
  select count(*) into v_lembretes
    from public.appointments a
   where a.salon_id = p_salon_id and a.lembrete_enviado
     and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(*) into v_reativacoes
    from public.reativacao_envios r
   where r.salon_id = p_salon_id
     and (r.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  insert into public.faturas_de_uso (
    salon_id, periodo_inicio, periodo_fim, motivo, barbeiros, preco_unitario,
    agendamentos, lembretes, reativacoes, valor, valor_gerado, detalhe
  ) values (
    p_salon_id, p_inicio, p_fim, p_motivo, v_barbeiros, coalesce(v_preco, 0.75),
    v_agendamentos, v_lembretes, v_reativacoes,
    round(coalesce(v_preco, 0.75) * v_agendamentos, 2), v_valor_gerado, v_detalhe
  )
  on conflict (salon_id, periodo_inicio, periodo_fim, motivo) do nothing;

  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  return v_fatura;
end;
$$;

revoke execute on function public.gerar_fatura_de_uso(uuid, date, date, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O fechamento mensal de todas as barbearias. Chamado pelo pg_cron no dia 1.
-- ---------------------------------------------------------------------------
create or replace function public.fechar_mes_de_uso()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := (date_trunc('month', v_hoje) - interval '1 month')::date;
  v_fim date := (date_trunc('month', v_hoje) - interval '1 day')::date;
  v_salon record;
  v_total integer := 0;
begin
  for v_salon in select id from public.salons where ativo loop
    perform public.gerar_fatura_de_uso(v_salon.id, v_inicio, v_fim, 'mensal');
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.fechar_mes_de_uso() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fatura parcial de cancelamento: do primeiro dia ainda nao faturado ate hoje.
-- Quem chama e a edge function `asaas`, na acao de cancelar.
-- ---------------------------------------------------------------------------
create or replace function public.gerar_fatura_de_cancelamento(p_salon_id uuid)
returns public.faturas_de_uso
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
begin
  -- Primeiro dia nao coberto por fatura anterior; sem fatura nenhuma, o mes
  -- corrente. E o "periodo entre vencimento e cancelamento" da decisao.
  select coalesce(max(periodo_fim) + 1, date_trunc('month', v_hoje)::date)
    into v_inicio
    from public.faturas_de_uso
   where salon_id = p_salon_id;

  if v_inicio > v_hoje then
    v_inicio := v_hoje;
  end if;

  return public.gerar_fatura_de_uso(p_salon_id, v_inicio, v_hoje, 'cancelamento');
end;
$$;

revoke execute on function public.gerar_fatura_de_cancelamento(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O agendador. 09:00 UTC = 06:00 em Brasilia, dia 1 de cada mes.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('fechamento-mensal-de-uso');
exception when others then
  null; -- primeiro agendamento: nada a remover
end;
$$;
select cron.schedule('fechamento-mensal-de-uso', '0 9 1 * *', 'select public.fechar_mes_de_uso()');

-- ---------------------------------------------------------------------------
-- O dashboard do cliente: o mes corrente, ao vivo.
-- Invoker: cada dono ve so o que a RLS das tabelas de baixo permite.
-- ---------------------------------------------------------------------------
drop view if exists public.uso_do_sistema_no_mes;
create view public.uso_do_sistema_no_mes
with (security_invoker = on) as
with periodo as (
  select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as inicio,
         (now() at time zone 'America/Sao_Paulo')::date as fim
)
select s.id as salon_id,
       s.nome as barbearia,
       p.inicio as periodo_inicio,
       p.fim as periodo_fim,
       (select count(*) from public.professionals pr where pr.salon_id = s.id and pr.ativo) as barbeiros,
       public.preco_por_uso(
         (select count(*)::int from public.professionals pr where pr.salon_id = s.id and pr.ativo)
       ) as preco_unitario,
       (select count(*) from public.appointments a
         where a.salon_id = s.id and a.origem = 'agente' and a.status <> 'bloqueio'
           and (a.created_at at time zone 'America/Sao_Paulo')::date >= p.inicio) as agendamentos,
       (select coalesce(sum(sv.preco), 0) from public.appointments a
         left join public.services sv on sv.id = a.service_id
         where a.salon_id = s.id and a.origem = 'agente' and a.status <> 'bloqueio'
           and (a.created_at at time zone 'America/Sao_Paulo')::date >= p.inicio) as valor_gerado,
       (select count(*) from public.appointments a
         where a.salon_id = s.id and a.lembrete_enviado
           and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date >= p.inicio
           and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date <= p.fim) as lembretes,
       (select count(*) from public.reativacao_envios r
         where r.salon_id = s.id
           and (r.criado_em at time zone 'America/Sao_Paulo')::date >= p.inicio) as reativacoes
  from public.salons s
  cross join periodo p;

comment on view public.uso_do_sistema_no_mes is
  'O medidor do mes corrente, ao vivo, para o dashboard do cliente. Mostra o preco unitario da barbearia, nunca a tabela de faixas. A fatura fechada NAO sai daqui -- sai de faturas_de_uso, congelada.';

revoke all on public.uso_do_sistema_no_mes from anon;
grant select on public.uso_do_sistema_no_mes to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A fila do notificador (n8n). View em vez de filtro `is null` no proprio n8n:
-- o no do Supabase manda a string "null" ao PostgREST e quebra -- ja mordeu
-- duas vezes neste projeto.
-- ---------------------------------------------------------------------------
drop view if exists public.faturas_a_notificar;
create view public.faturas_a_notificar
with (security_invoker = on) as
select f.id, f.salon_id, s.nome as barbearia,
       o.nome as rede,
       f.periodo_inicio, f.periodo_fim, f.motivo,
       f.barbeiros, f.preco_unitario, f.agendamentos, f.lembretes, f.reativacoes,
       f.valor, f.valor_gerado, f.detalhe, f.gerada_em
  from public.faturas_de_uso f
  join public.salons s on s.id = f.salon_id
  left join public.organizations o on o.id = s.organization_id
 where f.notificada_em is null;

revoke all on public.faturas_a_notificar from anon, authenticated;
grant select on public.faturas_a_notificar to service_role;
