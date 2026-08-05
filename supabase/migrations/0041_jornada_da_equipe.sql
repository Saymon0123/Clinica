-- Com dois barbeiros, o agente consultou a jornada **do primeiro** e marcou com
-- ele, sem nunca olhar o segundo nem perguntar a preferência. Pior: marcou o
-- Rafael às 12:00 numa quarta, sendo que ele só entra às 13:00.
--
-- A ferramenta antiga pedia um `professional_id` por vez, então enxergar a
-- equipe inteira exigia o modelo lembrar de repetir a chamada para cada
-- barbeiro — e comparar as janelas de cabeça. Ele não faz.
--
-- Esta view devolve a agenda de **todos** os barbeiros ativos numa consulta só,
-- filtrando por dia da semana. O agente passa a ver, de uma vez, quem trabalha
-- naquele dia e em que faixa. Não sobra comparação para ele errar.
--
-- `dia_semana` segue a convenção do Postgres e do JS: 0=domingo ... 6=sábado.

create or replace view public.jornada_da_equipe
with (security_invoker = on) as
select
  p.salon_id,
  ps.professional_id,
  p.nome as profissional,
  ps.dia_semana,
  to_char(ps.hora_inicio, 'HH24:MI') as entra,
  to_char(ps.hora_fim, 'HH24:MI') as sai
from public.professional_schedules ps
join public.professionals p on p.id = ps.professional_id
where ps.ativo and p.ativo;

comment on view public.jornada_da_equipe is
  'Jornada de todos os barbeiros ativos do salao, por dia da semana (0=domingo). Consumida pelo agente para enxergar a equipe inteira numa consulta so, em vez de um barbeiro por vez.';

revoke all on public.jornada_da_equipe from anon;
grant select on public.jornada_da_equipe to authenticated, service_role;
