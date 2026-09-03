-- 0136: um número só para "agendamento do agente" (Parte 4, passo 4.1).
--
-- Eram três contas para a mesma coisa. O painel da Conexão excluía cancelados
-- (só `origem = 'agente'`); a view `uso_do_sistema_no_mes` incluía cancelados
-- mas ignorava a reativação; a fatura (`gerar_fatura_de_uso`, 0130) incluía
-- cancelados E a reativação confirmada, e somava o valor pelos serviços
-- combinados enquanto a view somava só o serviço principal. Confirmado em
-- produção: um salão mostrava 1 num lugar e 2 no outro, e o hint da tela
-- culpava "o fechamento do mês" — o que era falso.
--
-- A verdade é o que se cobra, e ela passa a morar num lugar só: a view
-- `agendamentos_cobraveis`. Cobrável = o agente marcou, ou o sistema marcou
-- pela reativação e o cliente confirmou; bloqueio de horário nunca; cancelado
-- depois CONTA — o trabalho de marcar foi feito. O dia de referência é o da
-- criação, em São Paulo. A view do mês, a fatura e o painel leem daqui.
drop view if exists public.agendamentos_cobraveis;
create view public.agendamentos_cobraveis
with (security_invoker = on) as
select a.id,
       a.salon_id,
       a.created_at,
       (a.created_at at time zone 'America/Sao_Paulo')::date as dia_de_criacao,
       a.data_hora_inicio,
       a.status,
       a.origem,
       a.professional_id,
       a.client_id,
       -- Serviços combinados (0120) quando existem; senão o serviço principal.
       -- A fatura só olhava os combinados e a view só o principal: agora é uma
       -- soma só, com a mesma queda para o caso antigo.
       coalesce(sv.total, s0.preco, 0) as valor_servico,
       coalesce(sv.nomes, s0.nome) as servicos
  from public.appointments a
  left join public.services s0 on s0.id = a.service_id
  left join lateral (
    select sum(s.preco) as total,
           string_agg(s.nome, ' + ' order by asv.ordem) as nomes
      from public.appointment_services asv
      join public.services s on s.id = asv.service_id
     where asv.appointment_id = a.id
  ) sv on true
 where (a.origem = 'agente'
        or (a.origem = 'reativacao' and a.reativacao_confirmada_em is not null))
   and a.status <> 'bloqueio';

comment on view public.agendamentos_cobraveis is
  'A regra unica de "agendamento cobravel": agente, ou reativacao confirmada pelo cliente; nunca bloqueio; cancelado conta. Dia de referencia = criacao em Sao Paulo. Le-se daqui na view do mes, na fatura e no painel da Conexao.';

grant select on public.agendamentos_cobraveis to authenticated;
-- As default privileges do projeto dao acesso a anon em view nova; a view
-- do mes nunca teve. Mesma regra aqui.
revoke all on public.agendamentos_cobraveis from anon;

-- A view do mês corrente passa a ler da regra única. Derrubada antes de
-- recriar (regra da casa) e com security_invoker de novo, que não sobrevive
-- ao drop.
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
       (select count(*) from public.agendamentos_cobraveis c
         where c.salon_id = s.id and c.dia_de_criacao >= p.inicio) as agendamentos,
       (select coalesce(sum(c.valor_servico), 0) from public.agendamentos_cobraveis c
         where c.salon_id = s.id and c.dia_de_criacao >= p.inicio) as valor_gerado,
       (select count(*) from public.appointments a
         where a.salon_id = s.id and a.lembrete_enviado
           and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date >= p.inicio
           and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date <= p.fim) as lembretes,
       (select count(*) from public.reativacao_envios r
         where r.salon_id = s.id
           and (r.criado_em at time zone 'America/Sao_Paulo')::date >= p.inicio) as reativacoes
  from public.salons s
  cross join periodo p;

grant select on public.uso_do_sistema_no_mes to authenticated;
revoke all on public.uso_do_sistema_no_mes from anon;

-- A fatura lê da mesma regra. O resto da função (recorte do teste grátis, do
-- último período faturado, idempotência) é o da 0130, intacto.
create or replace function public.gerar_fatura_de_uso(p_salon_id uuid, p_inicio date, p_fim date, p_motivo text default 'mensal')
returns public.faturas_de_uso
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_barbeiros integer;
  v_preco numeric;
  v_agendamentos integer;
  v_lembretes integer;
  v_reativacoes integer;
  v_valor_gerado numeric;
  v_detalhe jsonb;
  v_fatura public.faturas_de_uso;
  v_trial_ate date;
  v_ultimo_faturado date;
begin
  select s.trial_ate into v_trial_ate
    from public.subscriptions s where s.salon_id = p_salon_id;
  if v_trial_ate is not null and p_inicio <= v_trial_ate then
    p_inicio := v_trial_ate + 1;
  end if;

  select max(f.periodo_fim) into v_ultimo_faturado
    from public.faturas_de_uso f where f.salon_id = p_salon_id;
  if v_ultimo_faturado is not null and p_inicio <= v_ultimo_faturado then
    p_inicio := v_ultimo_faturado + 1;
  end if;

  if p_inicio > p_fim then
    return null;
  end if;

  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  if found then
    return v_fatura;
  end if;

  select count(*) into v_barbeiros
    from public.professionals p
   where p.salon_id = p_salon_id and p.ativo;

  v_preco := public.preco_por_uso(v_barbeiros);

  -- A regra de "cobrável" mora na view agendamentos_cobraveis (0136).
  select count(*),
         coalesce(sum(c.valor_servico), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'data', to_char(c.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'hora', to_char(c.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
               'servico', coalesce(c.servicos, '—'),
               'valor_servico', c.valor_servico,
               'status', c.status
             )
             order by c.created_at
           ),
           '[]'::jsonb
         )
    into v_agendamentos, v_valor_gerado, v_detalhe
    from public.agendamentos_cobraveis c
   where c.salon_id = p_salon_id
     and c.dia_de_criacao between p_inicio and p_fim;

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
$function$;
