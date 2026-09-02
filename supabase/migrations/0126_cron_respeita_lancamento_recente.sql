-- 0126: o cron para de cancelar o que o barbeiro acabou de lançar
--
-- Achado 6 da revisão de 01/09. `cancela_agendamentos_sem_comanda` roda a cada
-- 5 minutos e cancela tudo que passou do fim há mais de 15 minutos, sem olhar
-- QUANDO a linha foi criada. O barbeiro que atende às 14h e registra às 15h
-- (para não perder o histórico) via o lançamento sumir em minutos, sem
-- entender por quê — e a agenda dele passava a mentir sobre o dia.
--
-- A regra continua valendo para o caso que ela existe para resolver: horário
-- marcado de véspera que passou e ninguém fechou comanda. O que muda é a
-- carência: linha recém-criada tem 15 minutos antes de entrar na varredura.
create or replace function public.cancela_agendamentos_sem_comanda()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_qtd integer;
begin
  update public.appointments
     set status = 'cancelado'
   where status in ('agendado', 'confirmado')
     and data_hora_fim < now() - interval '15 minutes'
     -- Carência do lançamento retroativo: registrar um atendimento que já
     -- aconteceu é uso legítimo, e o cron não pode competir com o barbeiro.
     and created_at < now() - interval '15 minutes';
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$function$;
