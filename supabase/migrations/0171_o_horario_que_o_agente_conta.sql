-- 0171: o horário que o agente conta ao cliente.
--
-- O CASO. O cliente escreveu "já tenho um horário marcado e queria falar sobre
-- ele" e o agente respondeu "você já tem um horário agendado, com o barbeiro
-- Saymon às 15:00". O horário de pé era outro: 14/09 às 12:10, Barba + Corte
-- infantil. O 15:00 era um agendamento do dia 10/09 CANCELADO na conversa
-- anterior -- o agente recitou o próprio texto antigo do histórico em vez de
-- olhar a agenda (a execução 25385 registra `tool_calls.requested: 0`).
--
-- Essa parte se conserta no n8n. Mas ao ir conferir a ferramenta que ele
-- DEVERIA ter chamado, ela também estava errada em dois pontos -- e estes são
-- daqui:
--
-- 1. O SERVIÇO ERA SÓ O PRINCIPAL. Desde que a agenda pública passou a aceitar
--    corte + barba num agendamento só, o serviço de verdade mora em
--    `appointment_services`. A view lia `a.service_id`, que guarda apenas o
--    primeiro. O agente diria "Barba" para quem marcou "Barba + Corte
--    infantil" -- e o cliente chega esperando meia hora a menos de cadeira.
--
-- 2. `status <> 'cancelado'` DEIXA PASSAR O QUE JÁ ACABOU. `concluido` e
--    `faltou` também não são horários de pé, e passavam. Rodando a consulta da
--    ferramenta neste banco, ela devolvia DOIS horários para amanhã: 09:00
--    (concluido) e 12:10 (agendado). O agente anunciaria os dois. Um horário
--    inexistente prometido é o pior erro que ele pode cometer.
--
-- A COLUNA `de_pe` existe para a regra morar num lugar só. Quem consome não
-- precisa saber quais status contam -- e não pode errar a lista. É a mesma
-- razão de `cancelamentos_a_avisar` (0168) fixar `in ('agendado','confirmado')`
-- em vez de espalhar a regra pelos chamadores.
--
-- O TRINCO. View recriada no schema `public` nasce com as permissões padrão do
-- Supabase, que incluem `anon`. A 0038 revogou à mão; a 0036 também. Some o
-- revoke e a agenda de qualquer cliente de qualquer barbearia fica a uma
-- chamada REST de distância. O `security_invoker` ainda faria a RLS de
-- `appointments` barrar, mas a última linha de defesa não é para ser a única.
-- Há catraca para isso em `agendamentos_do_cliente.test.sql`.

drop view if exists public.agendamentos_do_cliente;

create view public.agendamentos_do_cliente
with (security_invoker = on) as
select a.id,
       a.salon_id,
       a.client_id,
       a.professional_id,
       a.service_id,
       a.status,
       a.data_hora_inicio,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as data_local,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_local,
       case
         when (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
              = (now() at time zone 'America/Sao_Paulo')::date
           then 'hoje'
         when (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
              = (now() at time zone 'America/Sao_Paulo')::date + 1
           then 'amanha'
         else 'dia ' || to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM')
       end as quando,
       -- Todos os serviços, na ordem em que foram escolhidos. O fallback é o
       -- serviço principal: agendamento criado pelo CRM ou pelo agente não
       -- preenche `appointment_services`.
       coalesce(
         (select string_agg(s2.nome, ' + ' order by asv.ordem)
            from public.appointment_services asv
            join public.services s2 on s2.id = asv.service_id
           where asv.appointment_id = a.id),
         s.nome
       ) as servico,
       p.nome as profissional,
       (a.status in ('agendado', 'confirmado')) as de_pe
  from public.appointments a
  left join public.services s on s.id = a.service_id
  left join public.professionals p on p.id = a.professional_id;

comment on view public.agendamentos_do_cliente is
  'Os horarios de um cliente ja em horario de Sao Paulo, para o agente do WhatsApp nunca converter fuso de cabeca. `servico` soma os servicos de appointment_services (0171); `de_pe` diz o que ainda esta marcado -- filtre por ele, e nao por status, para nao anunciar horario concluido ou faltou.';

revoke all on public.agendamentos_do_cliente from anon;
grant select on public.agendamentos_do_cliente to authenticated, service_role;
