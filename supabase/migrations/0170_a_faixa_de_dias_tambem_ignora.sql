-- 0170: a faixa de dias também ignora o agendamento que está sendo movido.
--
-- A 0169 ensinou `horarios_livres` a ignorar um agendamento, para quem remarca
-- não ser bloqueado por si mesmo. Mas a FAIXA DE DIAS conta pela
-- `dias_com_horario`, que chama `horarios_livres` sem esse parâmetro — e na
-- tela de remarcar os dois números discordariam:
--
--   a faixa diria   "quinta · 54 livres"
--   a grade mostraria 61 horários naquela quinta
--
-- São ~7 horários de diferença num corte de 40 minutos: os que o próprio
-- agendamento esconde de si. Dois números sobre a mesma coisa, na mesma tela,
-- e o menor é o errado — quem compara os dias para achar o mais vazio decide
-- pelo número que mente.
--
-- Mesmo `drop` e recriação da 0169, pelo mesmo motivo: parâmetro novo com
-- padrão vira sobrecarga, e a chamada de quatro argumentos fica ambígua.
--
-- O TRINCO é reposto à mão de novo, e agora já existe teste para ele
-- (`remarcar_sem_bloquear_a_si_mesmo.test.sql`) — a assinatura muda aqui, e o
-- teste muda junto.

drop function if exists public.dias_com_horario(uuid, date, integer, integer);

create or replace function public.dias_com_horario(
  p_salon_id uuid,
  p_de date,
  p_dias integer,
  p_duracao_minutos integer,
  p_ignorar_agendamento uuid default null
)
returns table(dia date, livres integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select d::date as dia,
         (select count(*)
            from public.horarios_livres(
                   p_salon_id, d::date, p_duracao_minutos, null, p_ignorar_agendamento))::integer as livres
    from generate_series(
           p_de,
           p_de + (least(greatest(p_dias, 1), 31) - 1),
           interval '1 day'
         ) d;
$function$;

comment on function public.dias_com_horario(uuid, date, integer, integer, uuid) is
  'Quantos horarios livres em cada dia da janela, numa consulta so. Serve a faixa de dias da agenda publica. p_ignorar_agendamento (0170) mantem a faixa e a grade contando a MESMA coisa na tela de remarcar. p_dias e limitado a 31 porque a edge que chama roda sem usuario nenhum.';

revoke execute on function public.dias_com_horario(uuid, date, integer, integer, uuid) from public;
revoke execute on function public.dias_com_horario(uuid, date, integer, integer, uuid) from anon;
revoke execute on function public.dias_com_horario(uuid, date, integer, integer, uuid) from authenticated;
grant execute on function public.dias_com_horario(uuid, date, integer, integer, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- O aviso da Agenda passa a contar a REMARCAÇÃO, não só o cancelamento
-- ---------------------------------------------------------------------------
-- A etapa 6 tapou o buraco do cancelamento silencioso. Remarcar abre o mesmo
-- buraco pela outra porta: a cadeira das 10:00 esvaziou e ninguém contou — a
-- diferença é que ela reapareceu às 15:00, o que o barbeiro também precisa
-- saber.
--
-- `remarcado_pelo_cliente_em` (0169) já é preenchido pela edge; faltava a view
-- olhar para ele. O `tipo` diz à tela qual frase usar: "cancelou" e "mudou de
-- horário" são notícias diferentes.
drop view if exists public.cancelamentos_a_avisar;
create view public.cancelamentos_a_avisar
with (security_invoker = on) as
select a.id,
       a.salon_id,
       case when a.status = 'cancelado' then 'cancelou' else 'remarcou' end as tipo,
       a.data_hora_inicio,
       coalesce(a.cancelado_em, a.remarcado_pelo_cliente_em) as mexido_em,
       c.nome as cliente,
       c.telefone as cliente_telefone,
       p.nome as barbeiro,
       (select string_agg(s.nome, ' + ' order by asv.ordem)
          from public.appointment_services asv
          join public.services s on s.id = asv.service_id
         where asv.appointment_id = a.id) as servicos,
       a.data_hora_inicio > now() as ainda_da_para_encaixar
  from public.appointments a
  left join public.clients c on c.id = a.client_id
  left join public.professionals p on p.id = a.professional_id
 where a.cancelamento_visto_em is null
   and (
     -- cancelado pelo cliente
     (a.status = 'cancelado' and a.cancelado_por = 'cliente'
      and a.cancelado_em >= now() - interval '7 days')
     or
     -- remarcado pelo cliente, e ainda de pé (remarcado e depois cancelado
     -- aparece uma vez só, como cancelamento -- que é a notícia mais recente)
     (a.status in ('agendado', 'confirmado') and a.remarcado_pelo_cliente_em is not null
      and a.remarcado_pelo_cliente_em >= now() - interval '7 days')
   );

comment on view public.cancelamentos_a_avisar is
  'O que o CLIENTE mexeu sozinho e a barbearia ainda nao viu, dos ultimos 7 dias: cancelou (0168) ou remarcou (0170). Alimenta o aviso da Agenda. O CRM da ciencia gravando cancelamento_visto_em.';

grant select on public.cancelamentos_a_avisar to authenticated;
