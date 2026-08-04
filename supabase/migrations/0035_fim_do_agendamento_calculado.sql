-- O agente reservava a hora cheia para serviços de 50 minutos.
--
-- Ele calculava `data_hora_fim` somando "uma hora" em vez da duração do
-- serviço. Não é cosmético: existe `appointments_sem_sobreposicao`, então os 10
-- minutos a mais **recusam um encaixe legítimo** às 09:50. Em agenda cheia isso
-- é dinheiro perdido, e ninguém desconfiaria — o agendamento está lá, com a
-- hora certa de início.
--
-- A correção tira a conta do modelo. Somar minutos a um horário é exatamente o
-- tipo de tarefa em que um LLM erra em silêncio, e o banco já sabe a duração de
-- cada serviço. Mesmo princípio da view `salons_com_automacao`: a regra vive no
-- dado, não na instrução.
--
-- Preenche apenas quando `data_hora_fim` vem nulo. O CRM continua mandando o
-- fim explícito e segue no comando — o dono pode querer reservar mais tempo do
-- que a duração padrão, e isso não é erro.

create or replace function public.calcula_fim_do_agendamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutos int;
begin
  if new.data_hora_fim is not null then
    return new;
  end if;

  if new.service_id is null then
    raise exception 'Sem service_id nao da para calcular o fim do agendamento; informe data_hora_fim.'
      using errcode = '23502';
  end if;

  select s.duracao_minutos into minutos
    from public.services s where s.id = new.service_id;

  if minutos is null then
    raise exception 'Servico % nao encontrado ou sem duracao.', new.service_id
      using errcode = '23503';
  end if;

  new.data_hora_fim := new.data_hora_inicio + make_interval(mins => minutos);
  return new;
end;
$$;

comment on function public.calcula_fim_do_agendamento is
  'Preenche data_hora_fim com inicio + duracao do servico quando nao informado. Existe para o agente de WhatsApp nao precisar somar minutos.';

-- BEFORE INSERT: dispara antes da checagem de NOT NULL, então a coluna pode
-- chegar vazia do PostgREST sem violar a restrição.
create trigger appointments_calcula_fim
  before insert on public.appointments
  for each row execute function public.calcula_fim_do_agendamento();
