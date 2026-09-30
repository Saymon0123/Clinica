-- Os números que dizem se foi um bom período (item 14, parte 1 de 2).
--
-- O Financeiro tem quatro cartões: Faturamento, Clientes atendidos,
-- Agendamentos, Cancelamentos e faltas. **Os quatro são contagem ou soma.**
-- Nenhum é taxa. O CRM conta quanto aconteceu e nunca diz se foi bom.
--
-- Esta RPC traz os ingredientes das três taxas que são DO BARBEIRO -- ocupação
-- da cadeira, taxa de retorno e serviços por atendimento. As três de gestão
-- (ticket médio, % de produto, melhores dias) vêm depois e saem de `orders`,
-- que é outra árvore.
--
-- ## Por que ela devolve ingredientes, e não percentuais
--
-- Porque a tela precisa mostrar o denominador. "Ocupação: 0,9%" sozinho não
-- diz se a cadeira está vazia ou se a jornada está cadastrada errado; já
-- "0,9% -- 8h ocupadas de 828h de jornada" deixa quem conhece a barbearia
-- julgar. Há barbearia que abre domingo, e o sistema não tem como saber se
-- 7 dias por semana é engano ou é o negócio da pessoa -- então ele afirma os
-- fatos que usou e não adivinha. Percentual pronto esconderia isso.
--
-- Como efeito colateral bom, o teste passa a comparar inteiros exatos em vez
-- de float arredondado.

create or replace function public.desempenho_do_periodo(
  p_salon_id uuid,
  p_de date,
  p_ate date,
  p_professional_id uuid default null
)
returns table (
  minutos_jornada numeric,
  minutos_ocupados numeric,
  atendimentos integer,
  servicos integer,
  clientes integer,
  clientes_que_voltaram integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prof uuid;
begin
  -- A porta. O vínculo é conferido AQUI DENTRO, nunca na tela: esta função é
  -- `definer` e passa por cima da RLS, então ela é a única coisa entre o
  -- pedido e os números de outra barbearia.
  if not (p_salon_id in (select private.salon_ids())) then
    raise exception 'Sem acesso a esta barbearia.' using errcode = '42501';
  end if;

  if private.is_manager(p_salon_id) then
    -- Gestor mede o salão inteiro, ou uma cadeira se pedir.
    v_prof := p_professional_id;
  else
    -- Barbeiro mede a PRÓPRIA cadeira, mesmo que peça outra. Ignorar o
    -- parâmetro é de propósito: devolver erro contaria a ele que a outra
    -- cadeira existe e que o pedido chegou perto.
    select p.id into v_prof
      from public.professionals p
     where p.salon_id = p_salon_id
       and p.id in (select private.my_professional_ids())
     limit 1;
    if v_prof is null then
      raise exception 'Sem cadeira nesta barbearia.' using errcode = '42501';
    end if;
  end if;

  return query
  with tz as (select 'America/Sao_Paulo'::text as z),
  dias as (
    select d::date as dia
      from generate_series(p_de, p_ate, interval '1 day') d
  ),
  cadeiras as (
    select p.id
      from public.professionals p
     where p.salon_id = p_salon_id
       and p.ativo
       and (v_prof is null or p.id = v_prof)
  ),
  -- Cada dia de jornada vira uma janela concreta, CORTADA EM `now()`.
  --
  -- Sem esse corte, a ocupação do mês em curso é uma mentira que assusta: no
  -- dia 5 de 30, dividir pelo mês inteiro dá 17% e parece desastre. O que se
  -- pode cobrar do barbeiro é a hora que já passou.
  janelas as (
    select c.id as professional_id,
           ((dias.dia + ps.hora_inicio) at time zone tz.z) as abre,
           least((dias.dia + ps.hora_fim) at time zone tz.z, now()) as fecha
      from dias
      cross join tz
      join cadeiras c on true
      join public.professional_schedules ps
        on ps.professional_id = c.id
       and ps.ativo
       and ps.dia_semana = extract(dow from dias.dia)
  ),
  jornada as (
    select coalesce(sum(greatest(extract(epoch from (fecha - abre)) / 60, 0)), 0) as minutos
      from janelas
  ),
  -- BLOQUEIO SAI DO DENOMINADOR (0182). Ele não é hora vaga que o barbeiro
  -- deixou de vender -- é hora em que ele não estava disponível. Somá-lo à
  -- jornada puniria justamente quem usa a ferramenta para avisar que sai.
  -- Conta-se a interseção, porque um bloqueio pode começar antes de abrir ou
  -- terminar depois de fechar.
  bloqueado as (
    select coalesce(sum(greatest(
             extract(epoch from (
               least(a.data_hora_fim, j.fecha) - greatest(a.data_hora_inicio, j.abre)
             )) / 60, 0)), 0) as minutos
      from janelas j
      join public.appointments a
        on a.professional_id = j.professional_id
       and a.status = 'bloqueio'
       and a.data_hora_inicio < j.fecha
       and a.data_hora_fim > j.abre
  ),
  -- Numerador: o tempo em que a cadeira de fato trabalhou. Cancelado e falta
  -- ficam de FORA de propósito -- a cadeira esteve vazia, e é essa perda que a
  -- ocupação existe para mostrar.
  concluidos as (
    select a.id, a.client_id, a.data_hora_inicio, a.data_hora_fim
      from public.appointments a
      join cadeiras c on c.id = a.professional_id
     cross join tz
     where a.salon_id = p_salon_id
       and a.status = 'concluido'
       and (a.data_hora_inicio at time zone tz.z)::date between p_de and p_ate
  ),
  ocupado as (
    select coalesce(sum(extract(epoch from (data_hora_fim - data_hora_inicio)) / 60), 0) as minutos,
           count(*)::int as n
      from concluidos
  ),
  -- `greatest(n, 1)`: agendamento anterior à 0120 pode não ter linha em
  -- `appointment_services`, e contá-lo como zero serviço afundaria a média de
  -- quem tem histórico antigo.
  itens as (
    select coalesce(sum(greatest(x.n, 1)), 0)::int as total
      from (
        select c.id, count(asv.*) as n
          from concluidos c
          left join public.appointment_services asv on asv.appointment_id = c.id
         group by c.id
      ) x
  ),
  -- `n_clientes`, e não `clientes`: o nome do parâmetro de SAÍDA desta função
  -- também é `clientes`, e o plpgsql levanta 42702 ("could refer to either a
  -- PL/pgSQL variable or a table column") quando os dois se encontram.
  quantos as (
    select count(distinct client_id)::int as n_clientes
      from concluidos where client_id is not null
  ),
  -- TAXA DE RETORNO: de quem foi atendido no período, quantos têm OUTRO
  -- horário depois deste -- já cumprido ou ainda marcado.
  --
  -- Mede as duas coisas que interessam com a mesma régua: o cliente que
  -- remarcou no balcão antes de sair (o que o barbeiro controla) e o que
  -- voltou por conta própria. Cancelado não conta como volta.
  retorno as (
    select count(distinct c.client_id)::int as voltaram
      from concluidos c
     where c.client_id is not null
       and exists (
         select 1
           from public.appointments a2
          where a2.client_id = c.client_id
            and a2.salon_id = p_salon_id
            and a2.status <> 'cancelado'
            and a2.id <> c.id
            and a2.data_hora_inicio > c.data_hora_inicio
       )
  )
  select
    greatest((select minutos from jornada) - (select minutos from bloqueado), 0),
    (select minutos from ocupado),
    (select n from ocupado),
    (select total from itens),
    (select n_clientes from quantos),
    (select voltaram from retorno);
end;
$function$;

-- O trinco, reposto à mão: função nova nasce com EXECUTE para `public`.
-- Quem chama é o CRM com o usuário logado, então `authenticated` entra -- e é
-- seguro porque a própria função confere o vínculo na primeira linha.
revoke all on function public.desempenho_do_periodo(uuid, date, date, uuid)
  from public, anon;
grant execute on function public.desempenho_do_periodo(uuid, date, date, uuid)
  to authenticated, service_role;
