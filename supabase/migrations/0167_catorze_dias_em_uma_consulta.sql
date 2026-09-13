-- 0167: os catorze dias da agenda pública, numa consulta só.
--
-- POR QUE ELA EXISTE. A etapa 2 da agenda pelo QR abre catorze dias no lugar
-- de um, e a faixa de dias na tela precisa dizer quantos horários sobraram em
-- cada um — senão a pessoa toca terça, não acha nada, toca quarta, não acha
-- nada, e desiste no terceiro toque. Um dia que parece disponível e não está é
-- pior que um dia marcado como cheio.
--
-- SEM ISTO seriam catorze chamadas de `horarios_livres` da edge até o banco,
-- catorze idas e voltas de rede por carregamento de página. Aqui é UMA ida, e o
-- banco resolve as catorze internamente.
--
-- O CUSTO, medido em produção antes de escrever (El Guardians, 1 barbeiro,
-- serviço de 40 min): **20,4 ms para os catorze dias**, 1,4 ms por dia,
-- 3968 buffers, tudo em cache. O plano é um Function Scan sobre o
-- generate_series com o subplano rodando 14 vezes.
--
-- NÃO REIMPLEMENTA `horarios_livres`, chama. A regra de quem está livre é
-- difícil (jornada, folga entre atendimentos, horário do salão, sobreposição,
-- âncora no fim de cada atendimento) e já está escrita uma vez. Copiar para
-- ganhar velocidade seria trocar 20 ms por duas versões da verdade.
--
-- O TETO DE DIAS é defesa de porta, não capricho: `p_dias` chega de uma edge
-- que roda sem usuário nenhum. Sem o `least(..., 31)`, alguém pedindo 100 mil
-- dias transformaria esta função numa alavanca de negação de serviço contra o
-- próprio banco. O piso de 1 evita o `generate_series` invertido, que devolve
-- vazio em silêncio.

create or replace function public.dias_com_horario(
  p_salon_id uuid,
  p_de date,
  p_dias integer,
  p_duracao_minutos integer
)
returns table(dia date, livres integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select d::date as dia,
         (select count(*)
            from public.horarios_livres(p_salon_id, d::date, p_duracao_minutos))::integer as livres
    from generate_series(
           p_de,
           p_de + (least(greatest(p_dias, 1), 31) - 1),
           interval '1 day'
         ) d;
$function$;

comment on function public.dias_com_horario(uuid, date, integer, integer) is
  'Quantos horarios livres em cada dia da janela, numa consulta so. Serve a faixa de dias da agenda publica (etapa 2, 14 dias). Chama horarios_livres por dia em vez de reimplementar a regra. p_dias e limitado a 31 porque a edge que chama roda sem usuario nenhum.';

-- O MESMO TRINCO DE `horarios_livres`, conferido antes de escrever: ela tem
-- ACL `postgres=X | service_role=X`, ou seja, `anon` e `authenticated` NÃO a
-- alcançam por `/rest/v1/rpc/`. Função nova nasce com EXECUTE para `public` por
-- padrão do PostgreSQL — sem o revoke abaixo, esta aqui ficaria mais aberta que
-- a função que ela chama, e a agenda de catorze dias de qualquer barbearia
-- viraria uma chamada REST sem edge no meio (sem o freio de taxa, sem a
-- checagem de `salons_atendendo`, sem a checagem de `recursos_ativos`).
revoke execute on function public.dias_com_horario(uuid, date, integer, integer) from public;
revoke execute on function public.dias_com_horario(uuid, date, integer, integer) from anon;
revoke execute on function public.dias_com_horario(uuid, date, integer, integer) from authenticated;
grant execute on function public.dias_com_horario(uuid, date, integer, integer) to service_role;
