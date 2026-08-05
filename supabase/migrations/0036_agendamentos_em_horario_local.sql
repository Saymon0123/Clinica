-- O agente informou "17:30" para um agendamento das 14:30.
--
-- As ferramentas devolvem `timestamptz`, que o PostgREST serializa em UTC
-- (`2026-08-05T17:30:00+00:00`). Cabia ao modelo converter para o fuso de
-- Brasília antes de falar com o cliente. Ele acerta às vezes e erra às vezes —
-- e errar aqui manda a pessoa à barbearia três horas fora do horário.
--
-- Converter fuso é da mesma família de "somar a duração do serviço": conta
-- determinística que um LLM faz mal e erra em silêncio. Vai para o banco, como
-- a duração foi na 0035.
--
-- A view entrega o horário **já escrito** em português, pronto para ser
-- repetido na mensagem. O `id` continua ali para cancelar, e os timestamps
-- crus permanecem para quem precise deles.
--
-- ⚠️ O fuso está fixo em America/Sao_Paulo. O schema não tem fuso por salão —
-- limitação já registrada no backlog. Uma barbearia fora do horário de Brasília
-- vai precisar disso antes de entrar.

create or replace view public.agendamentos_do_cliente
with (security_invoker = on) as
select
  a.id,
  a.salon_id,
  a.client_id,
  a.professional_id,
  a.service_id,
  a.status,
  a.data_hora_inicio,
  -- Pré-formatado para o agente repetir sem fazer conta nem conversão.
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as data_local,
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_local,
  s.nome as servico,
  p.nome as profissional
from public.appointments a
left join public.services s on s.id = a.service_id
left join public.professionals p on p.id = a.professional_id;

comment on view public.agendamentos_do_cliente is
  'Agendamentos com data e hora ja convertidas para o fuso de Brasilia, em texto. Consumida pelo agente de WhatsApp para nao precisar converter UTC.';

revoke all on public.agendamentos_do_cliente from anon;
grant select on public.agendamentos_do_cliente to authenticated, service_role;
