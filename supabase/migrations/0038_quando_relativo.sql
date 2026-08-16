-- "amanha, dia 05/08" dito a meia-noite e meia do dia 05/08.
--
-- O agente copiou o "amanha" de uma mensagem anterior, escrita quando ainda era
-- dia 4. A data estava certa; a palavra, errada — e e a palavra que a pessoa
-- le. Quem recebe isso aparece um dia depois.
--
-- Decidir "hoje / amanha / outro dia" e comparacao de datas: deterministica,
-- barata no banco e traicoeira no modelo, que tende a repetir o que ja escreveu
-- em vez de recalcular. Terceira vez que uma conta de tempo volta como defeito
-- (duracao na 0035, fuso na 0036 e 0037), entao segue o mesmo caminho.
--
-- `quando` sai pronto para ser colado na frase: "hoje as 14:00", "amanha as
-- 14:00", "na quinta (07/08) as 14:00".

-- `drop` antes de criar, e não `create or replace`.
--
-- A view ganha a coluna `quando` **no meio** das existentes, e o Postgres
-- recusa: `cannot change name of view column "servico" to "quando"`
-- (SQLSTATE 42P16). Um `create or replace` só aceita acrescentar colunas no
-- fim, com os mesmos nomes e tipos na mesma ordem.
--
-- Em produção isto foi contornado à mão em 2026-08-05, mas o arquivo ficou com
-- o `create or replace` — e por isso **um banco criado do zero a partir deste
-- repositório falhava aqui**. Era a razão do CI vermelho nos testes de pgTAP,
-- que constroem um banco limpo a cada execução.
drop view if exists public.agendamentos_do_cliente;

create view public.agendamentos_do_cliente
with (security_invoker = on) as
select
  a.id,
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
       = (now() at time zone 'America/Sao_Paulo')::date then 'hoje'
    when (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
       = (now() at time zone 'America/Sao_Paulo')::date + 1 then 'amanha'
    else 'dia ' || to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM')
  end as quando,
  s.nome as servico,
  p.nome as profissional
from public.appointments a
left join public.services s on s.id = a.service_id
left join public.professionals p on p.id = a.professional_id;

comment on view public.agendamentos_do_cliente is
  'Agendamentos do cliente com data, hora e o termo relativo (hoje/amanha/dia DD/MM) ja resolvidos no fuso de Brasilia. Consumida pelo agente de WhatsApp.';

revoke all on public.agendamentos_do_cliente from anon;
grant select on public.agendamentos_do_cliente to authenticated, service_role;
