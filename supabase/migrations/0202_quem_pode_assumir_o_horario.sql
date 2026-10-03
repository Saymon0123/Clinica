-- Quem pode assumir o horário.
--
-- Item 18, reformulado pelo dono: *"se hoje o barbeiro informa que dia 20 ele
-- não conseguirá trabalhar, ele tem que ter uma opção de registro para que os
-- agendamentos sejam direcionados a outro barbeiro que irá trabalhar no dia"*.
--
-- ## Metade disso já existe, e eu conferi antes de escrever
--
-- - **Bloquear o dia inteiro** já existe: a 0182 criou o status `bloqueio`, e o
--   `NewAppointmentModal` tem a caixa "dia inteiro" (00:00–23:59) com motivo.
-- - **Trocar o barbeiro de um agendamento** já existe: o
--   `AppointmentDetailModal` grava `professional_id` novo no reagendamento.
-- - E o banco **já impede** o bloqueio por cima de horário marcado: a
--   `appointments_sem_sobreposicao` (EXCLUDE por profissional) levanta 23P01, e
--   a tela já traduz isso como *"Esse intervalo já tem horário marcado para este
--   profissional. Cancele ou remarque antes de bloquear."*
--
-- **O que falta é exatamente a ajuda que essa frase não dá.** Hoje o dono é
-- mandado "cancelar ou remarcar antes" e tem de adivinhar, agendamento por
-- agendamento, qual barbeiro pode pegar: quem trabalha naquele dia, quem faz
-- aquele serviço, e quem está livre naquela hora. Três perguntas que o sistema
-- sabe responder e não responde.
--
-- ## A régua é a mesma de sempre, de propósito
--
-- Candidato é quem aparece no `horarios_livres` **exatamente naquele início**,
-- com a duração do agendamento. Não é uma conta nova: é a mesma função que a
-- agenda pública, o agente e o `agendar_pelo_agente` usam. Isso importa porque
-- existe um trigger (`respeita_folga_entre_atendimentos`, 0134) que recusa com
-- 23P01 quem cai fora da jornada -- se eu calculasse a candidatura por fora,
-- ofereceria gente que o banco depois recusa, e o dono clicaria num nome para
-- receber erro.
--
-- Serviço entra pela régua da 0199: quem faz **todos** os serviços daquele
-- horário, com "lista vazia = faz todos" pelo mesmo motivo de lá.
--
-- ## O que ela NÃO faz
--
-- Não move nada. Mover continua sendo o `update` que a tela já faz, com a
-- EXCLUDE e o trigger da folga como última palavra -- uma função que movesse
-- teria de reproduzir as duas, e duas cópias da mesma regra é como elas
-- divergem.
--
-- E não sugere **outro** horário: se ninguém está livre naquele minuto, a
-- resposta é vazia e a tela precisa dizer isso com clareza, em vez de empurrar
-- um horário que o cliente não escolheu. Avisar o cliente da troca também fica
-- de fora: é mensagem iniciada pela plataforma, e o dono decidiu não usar
-- template por hora.

create or replace function public.quem_pode_assumir(p_appointment_id uuid)
returns table (professional_id uuid, nome text, hora_local text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_salon uuid;
  v_dono_da_cadeira uuid;
  v_inicio timestamptz;
  v_minutos int;
  v_dia date;
  v_servicos uuid[];
begin
  select a.salon_id, a.professional_id, a.data_hora_inicio,
         ceil(extract(epoch from (a.data_hora_fim - a.data_hora_inicio)) / 60.0)::int,
         (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
    into v_salon, v_dono_da_cadeira, v_inicio, v_minutos, v_dia
    from public.appointments a
   where a.id = p_appointment_id
     and a.status not in ('cancelado', 'faltou', 'bloqueio');

  -- Agendamento que não existe, já cancelado, ou que é um bloqueio: nada a
  -- assumir. Silêncio aqui é a resposta certa -- não é erro de chamada.
  if v_salon is null then
    return;
  end if;

  -- Definer ignora RLS: a autorizacao e esta. Gestor da unidade, ou o proprio
  -- barbeiro da cadeira (precedente: 0182, ele fecha a propria agenda e
  -- precisa saber quem cobre).
  if v_salon not in (select private.salon_ids())
     or not (private.is_manager(v_salon)
             or exists (select 1 from public.professionals p
                         where p.id = v_dono_da_cadeira and p.user_id = auth.uid())) then
    raise exception 'So o dono, o gerente ou o barbeiro da cadeira ve quem pode assumir.'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct s.service_id), '{}'::uuid[])
    into v_servicos
    from public.appointment_services s
   where s.appointment_id = p_appointment_id;

  return query
  with faz as (
    -- Quem faz TODOS os servicos daquele horario. Lista vazia conta como "faz
    -- todos", pelo mesmo motivo da 0199: filtrar ao pe da letra faria o
    -- barbeiro desaparecer sem explicacao.
    select p.id, p.nome
      from public.professionals p
     where p.salon_id = v_salon
       and p.ativo
       and p.id <> v_dono_da_cadeira
       and (
         not exists (select 1 from public.professional_services x
                      where x.professional_id = p.id)
         or not exists (
              select 1 from unnest(v_servicos) as sid
               where not exists (select 1 from public.professional_services x
                                  where x.professional_id = p.id
                                    and x.service_id = sid))
       )
  )
  select f.id, f.nome, h.hora_local
    from faz f
    join lateral public.horarios_livres(v_salon, v_dia, v_minutos, f.id) h
      on h.inicio = v_inicio
   order by f.nome;
end;
$function$;

-- O trinco, reposto a mao: funcao nova nasce com execute para `public`. Quem
-- chama e a tela (authenticated); o service_role entra porque o n8n pode
-- precisar da mesma lista no dia em que a fila de espera encostar aqui.
revoke all on function public.quem_pode_assumir(uuid) from public, anon;
grant execute on function public.quem_pode_assumir(uuid) to authenticated, service_role;

comment on function public.quem_pode_assumir(uuid) is
  'Quem pode assumir um agendamento: barbeiros ATIVOS da mesma barbearia, que nao sao o atual, que fazem TODOS os servicos daquele horario (regua da 0199, lista vazia = faz todos) e que aparecem no horarios_livres exatamente naquele inicio, com a duracao do agendamento. Usa horarios_livres de proposito -- calcular candidatura por fora ofereceria gente que o trigger da folga (0134) depois recusa com 23P01. NAO move nada: mover continua sendo o update da tela, com a EXCLUDE e o trigger como ultima palavra. Resposta vazia = ninguem livre naquele minuto, e a tela precisa dizer isso.';
