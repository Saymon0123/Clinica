-- A vaga segurada para quem foi chamado.
--
-- Primeira das duas migrations da fila de espera (item 16). Esta entrega **a
-- reserva**; a 0193 entrega a fila que a usa.
--
-- ## Por que a reserva é uma linha de AGENDAMENTO
--
-- Quando a fila chama alguém — "abriu sábado 9h30, quer?" — a vaga tem de parar
-- de ser oferecida **enquanto ele pensa**. Sem isso, o cliente recebe o aviso,
-- responde "quero" três minutos depois e encontra ocupado: é o mesmo muro que a
-- agenda pública nos ensinou a não construir.
--
-- A trava de sobreposição (`appointments_sem_sobreposicao`) e o
-- `horarios_livres` filtram pela MESMA régua: `status not in ('cancelado',
-- 'faltou')`. Então um status novo é respeitado **sozinho** por:
--
-- - o agente de WhatsApp, que pergunta ao `horarios_livres`;
-- - a agenda pública, que pergunta ao mesmo;
-- - a trava do banco, que impede dois clientes na mesma vaga;
-- - a agenda do CRM, que mostra a linha ao dono.
--
-- Guardar a reserva na tabela da fila exigiria ensinar esses quatro lugares a
-- respeitá-la, um por um, e o primeiro esquecido entregaria a vaga duas vezes.
--
-- ## Por que a reserva expirada é APAGADA, e não cancelada
--
-- Cancelar deixaria no histórico do cliente um agendamento que ele nunca fez —
-- e, pior, acionaria a máquina de cancelamento: `cancelado_por`,
-- `cancelamento_visto_em` e o aviso de "cliente que quase foi" (0185). O dono
-- receberia alerta de desistência de alguém que só não respondeu a tempo.
--
-- Quem precisa guardar que a pessoa foi chamada e não respondeu é a FILA, na
-- 0193, não o histórico de atendimentos. A reserva é um bilhete, não uma visita.

alter table public.appointments
  drop constraint appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status = any (array[
    'agendado', 'confirmado', 'concluido', 'cancelado', 'bloqueio', 'faltou',
    -- A vaga está segurada para quem a fila chamou, até `reservada_ate`.
    'reservado'
  ]));

-- `origem` ganha de onde a reserva vem. Sem isto, a linha nasceria com uma
-- origem mentirosa ('crm' ou 'agente'), e o dia em que alguém for contar de
-- onde vêm os agendamentos a fila apareceria como se fosse outra coisa.
alter table public.appointments
  drop constraint appointments_origem_check;

alter table public.appointments
  add constraint appointments_origem_check
  check (origem = any (array['crm', 'agente', 'publico', 'reativacao', 'fila']));

-- `reservada_ate`, no mesmo molde de `envio_reservado_ate`, que já existe aqui
-- para a mesma ideia aplicada a mensagem.
alter table public.appointments
  add column reservada_ate timestamptz;

-- Os dois andam juntos, nos dois sentidos. Reserva sem prazo nunca expiraria e
-- seguraria a vaga para sempre; prazo em agendamento de verdade seria um prazo
-- que ninguém lê, esperando para confundir quem vier depois.
--
-- `is not null` explícito nos dois lados: CHECK só recusa em FALSE, e uma
-- comparação com nulo devolve NULL, que passa. Foi exatamente assim que a trava
-- do ciclo de comissão passou em nulo na 0187.
alter table public.appointments
  add constraint appointments_reserva_com_prazo
  check (
    (status = 'reservado' and reservada_ate is not null)
    or (status <> 'reservado' and reservada_ate is null)
  );

comment on column public.appointments.reservada_ate is
  'Ate quando a vaga fica segurada para quem a fila de espera chamou (0192). Anda junto com status = reservado, nos dois sentidos, por CHECK. Reserva vencida e APAGADA pela expirar_reservas, nao cancelada: cancelar inventaria uma desistencia no historico do cliente.';

------------------------------------------------------------------------------
-- Quem varre as reservas vencidas
------------------------------------------------------------------------------
-- Função, e não um `delete` solto no n8n, por dois motivos: a régua de quando a
-- reserva venceu fica num lugar só, e o número devolvido deixa a varredura
-- auditável — zero por dias seguidos é sinal de que ninguém está varrendo.
--
-- `security definer` porque quem chama é o service_role do n8n e porque a varredura
-- cruza barbearias: ela é do sistema, não de um salão.
create or replace function private.expirar_reservas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_apagadas integer;
begin
  with vencidas as (
    delete from public.appointments
     where status = 'reservado'
       and reservada_ate < now()
    returning id
  )
  select count(*) into v_apagadas from vencidas;
  return v_apagadas;
end;
$function$;

-- O trinco, reposto à mão: função nova nasce com execute para `public`.
revoke all on function private.expirar_reservas() from public, anon, authenticated;
grant execute on function private.expirar_reservas() to service_role;

comment on function private.expirar_reservas() is
  'Apaga as reservas de vaga cujo prazo venceu e devolve quantas. Chamada pelo n8n; a vaga volta a aparecer no horarios_livres no mesmo instante. Apaga em vez de cancelar para nao inventar desistencia no historico do cliente.';
