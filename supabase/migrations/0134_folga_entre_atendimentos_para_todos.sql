-- 0134: a folga entre atendimentos vale para todo mundo (Parte 2, passo 2.8 — achado 21).
--
-- `salons.folga_entre_atendimentos_minutos` (0065) era respeitada por quem
-- passa por `horarios_livres` — o agente do WhatsApp e o QR do balcão — e
-- ignorada por quem grava direto: o CRM encaixava no balcão dentro da folga que
-- o próprio sistema recusa pelo WhatsApp. Duas agendas com regras diferentes
-- para a mesma cadeira.
--
-- A regra vira TRIGGER em `appointments`, e não RPC, porque quatro caminhos
-- criam ou movem agendamento (CRM, agente via PostgREST, edge function do QR,
-- cron de reativação) e a única peça que todos atravessam é a tabela. É a
-- mesma lógica da constraint de sobreposição, que já mora aqui: a folga é a
-- irmã dela.
--
-- O que o trigger NÃO recusa, de propósito:
--   * agendamento no PASSADO — o barbeiro registrando às 15h o corte que fez
--     às 14h é contabilidade, não agenda (a mesma decisão do 1.5);
--   * cancelado, faltou e concluído — não ocupam cadeira;
--   * update que não mexe em horário, barbeiro nem status — marcar lembrete
--     enviado não pode falhar por causa da agenda;
--   * salão com folga zero — aí só a sobreposição importa, e ela é da
--     constraint.
--
-- Levanta 23P01 (o mesmo código da sobreposição) para todo consumidor que já
-- trata "horário ocupado" continuar funcionando sem mudar; a mensagem, em
-- português, é o que diferencia para quem lê a tela — o tradutor do CRM a
-- mostra como veio.
create or replace function public.respeita_folga_entre_atendimentos()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_folga integer;
  v_vizinho record;
begin
  if new.professional_id is null then return new; end if;
  if new.status in ('cancelado', 'faltou', 'concluido') then return new; end if;
  if new.data_hora_inicio <= now() then return new; end if;

  if tg_op = 'UPDATE'
     and new.professional_id = old.professional_id
     and new.data_hora_inicio = old.data_hora_inicio
     and new.data_hora_fim = old.data_hora_fim
     and old.status not in ('cancelado', 'faltou') then
    return new;
  end if;

  select coalesce(s.folga_entre_atendimentos_minutos, 0) into v_folga
    from public.salons s where s.id = new.salon_id;
  if coalesce(v_folga, 0) <= 0 then return new; end if;

  -- Meio-aberto dos dois lados: encostar exatamente na folga é permitido
  -- (14:00–14:40 com folga 10 aceita 14:50), que é o que `horarios_livres`
  -- oferece.
  select a.id, a.data_hora_inicio, a.data_hora_fim into v_vizinho
    from public.appointments a
   where a.professional_id = new.professional_id
     and a.id <> new.id
     and a.status not in ('cancelado', 'faltou')
     and tstzrange(new.data_hora_inicio - make_interval(mins => v_folga),
                   new.data_hora_fim + make_interval(mins => v_folga))
         && tstzrange(a.data_hora_inicio, a.data_hora_fim)
   order by a.data_hora_inicio
   limit 1;

  if found then
    raise exception 'Fica a menos de % minutos de outro atendimento do barbeiro (das % às %). A barbearia exige essa folga entre um e outro.',
      v_folga,
      to_char(v_vizinho.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      to_char(v_vizinho.data_hora_fim at time zone 'America/Sao_Paulo', 'HH24:MI')
      using errcode = '23P01';
  end if;

  return new;
end;
$function$;

-- AFTER, e não BEFORE: `appointments_calcula_fim` é BEFORE e é quem preenche
-- `data_hora_fim`. Num BEFORE a ordem entre os dois seria alfabética — frágil.
drop trigger if exists trg_respeita_folga on public.appointments;
create trigger trg_respeita_folga
  after insert or update on public.appointments
  for each row execute function public.respeita_folga_entre_atendimentos();

comment on function public.respeita_folga_entre_atendimentos() is
  'A folga do salao (folga_entre_atendimentos_minutos) vale para quem grava direto na tabela, nao so para quem passa por horarios_livres. 23P01 com mensagem em portugues. Ignora passado, cancelado/faltou/concluido, update sem mudanca de agenda e folga zero.';

-- O cron de reativação (0113/0120) escolhia o horário testando só a
-- sobreposição, e não tinha `exception`: com o trigger acima, um horário
-- dentro da folga faria a função inteira abortar — e o cron falharia de hora
-- em hora até a colisão sumir. Passa a (1) testar a folga junto com a
-- sobreposição, do mesmo jeito que o trigger, e (2) pular o cliente se ainda
-- assim o insert for recusado, em vez de derrubar a rodada. A lógica de
-- escolha do horário é a mesma de antes: o próximo múltiplo do intervalo do
-- cliente a partir do último atendimento, na janela de 24 a 25 horas.
create or replace function public.criar_agendamentos_de_reativacao()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c record;
  v_alvo timestamptz;
  v_k integer;
  v_criados integer := 0;
  v_novo uuid;
  v_folga interval;
begin
  for v_c in
    select c.id as client_id, c.salon_id, c.reativacao_semanas,
           a.id as ultimo_id, a.professional_id, a.service_id, a.data_hora_inicio,
           (a.data_hora_fim - a.data_hora_inicio) as duracao,
           make_interval(mins => coalesce(s.folga_entre_atendimentos_minutos, 0)) as folga
      from public.clients c
      join public.salons s on s.id = c.salon_id
      join lateral (
        select a.* from public.appointments a
         where a.client_id = c.id and a.status = 'concluido'
           and a.service_id is not null
         order by a.data_hora_inicio desc
         limit 1
      ) a on true
     where c.reativacao_semanas is not null
       and c.reativacao_pausada_em is null
       and not c.recusou_contato
       and c.telefone_norm is not null
  loop
    v_k := greatest(1, ceil(extract(epoch from (now() - v_c.data_hora_inicio))
                            / extract(epoch from (v_c.reativacao_semanas * interval '7 days')))::integer);
    v_alvo := v_c.data_hora_inicio + v_k * (v_c.reativacao_semanas * interval '7 days');
    v_folga := v_c.folga;

    continue when v_alvo < now() + interval '24 hours' or v_alvo >= now() + interval '25 hours';

    continue when exists (
      select 1 from public.appointments a
       where a.client_id = v_c.client_id
         and a.status in ('agendado', 'confirmado')
         and a.data_hora_inicio > now()
    );

    -- Sobreposição E folga, com a mesma conta do trigger.
    continue when exists (
      select 1 from public.appointments a
       where a.professional_id = v_c.professional_id
         and a.status in ('agendado', 'confirmado', 'bloqueio')
         and a.data_hora_inicio < v_alvo + v_c.duracao + v_folga
         and a.data_hora_fim > v_alvo - v_folga
    );

    begin
      insert into public.appointments
        (salon_id, client_id, professional_id, service_id,
         data_hora_inicio, data_hora_fim, status, origem)
      values
        (v_c.salon_id, v_c.client_id, v_c.professional_id, v_c.service_id,
         v_alvo, v_alvo + v_c.duracao, 'agendado', 'reativacao')
      returning id into v_novo;

      insert into public.appointment_services (appointment_id, service_id, ordem)
      select v_novo, asv.service_id, asv.ordem
        from public.appointment_services asv
       where asv.appointment_id = v_c.ultimo_id
      on conflict do nothing;

      v_criados := v_criados + 1;
    exception when others then
      -- Cadeira ocupada entre a checagem e o insert (sobreposição, folga):
      -- este cliente fica para a próxima rodada; os outros seguem.
      raise notice 'Reativacao pulada para o cliente %: %', v_c.client_id, sqlerrm;
    end;
  end loop;
  return v_criados;
end;
$function$;
