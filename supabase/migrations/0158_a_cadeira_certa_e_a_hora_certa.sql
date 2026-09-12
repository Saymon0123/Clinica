-- 0158: a cadeira certa e a hora certa (Fase 4 — achados A8, M4, M5 e M16).
--
-- Os quatro achados moram no mesmo lugar: o que o sistema diz ao cliente sem
-- ninguém mandar. Nenhum deles aparece numa tela do dono — aparecem no celular
-- de quem não pediu nada, e é por isso que ninguém percebeu.
--
--   A8  A reativação reservava a cadeira sem olhar a régua da casa: barbeiro
--       que saiu da equipe, dia de folga, barbearia fechada, serviço tirado do
--       catálogo, barbearia com acesso bloqueado. Passa a escolher o horário
--       com `horarios_livres`, a MESMA régua do QR do balcão e do agente.
--   M4  Não havia hora para falar: comanda fechada às 21h40 virava "como foi
--       seu atendimento?" às 23h40. Passa a existir uma janela, 9h às 20h.
--   M5  A avaliação era pedida a quem só comprou pomada. Passa a exigir que a
--       comanda tenha de fato um serviço.
--   M16 A "Política de Atraso" nunca foi publicada (fluxo do n8n desligado
--       desde 23/08, template em rascunho). É aposentada inteira aqui.
--
-- O lembrete do horário marcado NÃO entra na janela de silêncio: ele depende da
-- hora do atendimento, e um corte às 8h precisa do aviso às 7h.

-- ---------------------------------------------------------------------------
-- 1) M4 — a janela de silêncio
-- ---------------------------------------------------------------------------
-- Mora numa função, e não copiada no WHERE de cada fila, porque é uma regra só
-- e vai ser lida por quem escrever a próxima fila. O parâmetro existe para o
-- teste: com `now()` embutido não dá para provar o comportamento das 23h40.
--
-- Por que nada se perde: as duas filas têm janela de elegibilidade de 24 horas
-- (avaliação: de 2h a 26h depois de fechar a comanda; reativação: de 2h a 26h
-- antes do horário). Uma janela de 24 horas sempre cruza a faixa das 9h às 20h,
-- em qualquer dia. O que a janela faz é adiar, nunca cancelar.
create or replace function private.hora_de_falar(p_quando timestamptz default now())
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select (p_quando at time zone 'America/Sao_Paulo')::time >= time '09:00'
     and (p_quando at time zone 'America/Sao_Paulo')::time <  time '20:00';
$$;

comment on function private.hora_de_falar(timestamptz) is
  'Janela em que a plataforma fala com o cliente por conta propria: 9h as 20h de Brasilia, todos os dias. Fora dela a fila espera a manha seguinte, e nada se perde porque as filas aceitam ate 26h de atraso. O lembrete do horario marcado nao passa por aqui: depende da hora do atendimento.';

-- ---------------------------------------------------------------------------
-- 2) M5 + M4 — a avaliação só de quem foi atendido, e em hora decente
-- ---------------------------------------------------------------------------
-- `o.status = 'fechada'` sozinho quer dizer "alguém pagou alguma coisa". Pomada
-- no balcão fecha comanda igual a um corte. A pergunta "como foi seu
-- atendimento?" chegava para quem não teve atendimento nenhum — e um "podia
-- melhorar" virava alerta grave de nota baixa sobre um corte que não houve.
--
-- Dois testes, e não um: o item de serviço prova que houve serviço (o crédito
-- de pacote consumido também entra aqui, porque é gravado como `servico` com
-- preço zero); e o agendamento, quando existe, não pode estar cancelado nem
-- marcado como falta.
create or replace view public.avaliacoes_a_pedir
with (security_invoker = on) as
select o.id as order_id,
       o.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       private.destino_whatsapp(coalesce(c.telefone, '')) as destino,
       'cloud_api'::text as provedor,
       rem.phone_number_id,
       t.nome_meta as template,
       t.idioma as template_idioma,
       jsonb_build_array(split_part(c.nome, ' ', 1), s.nome) as template_parametros
  from public.orders o
  join public.clients c on c.id = o.client_id
  join public.salons s on s.id = o.salon_id
  join public.salons_com_automacao sa on sa.id = o.salon_id
  join lateral (
    select r.phone_number_id from public.remetentes_oficiais r
     where r.ativo
     order by (r.phone_number_id = s.remetente_phone_number_id) desc, r.criado_em
     limit 1
  ) rem on true
  join public.whatsapp_templates t
    on t.chave = 'avaliacao_pos_atendimento' and t.status = 'aprovado' and t.ativo
 where o.status = 'fechada'
   and o.closed_at >= now() - interval '26 hours'
   and o.closed_at <= now() - interval '2 hours'
   and not c.recusou_contato
   and length(private.destino_whatsapp(coalesce(c.telefone, ''))) >= 12
   and (c.avaliacao_pedida_em is null or c.avaliacao_pedida_em < now() - interval '56 days')
   and private.hora_de_falar()
   and exists (
     select 1 from public.order_items oi
      where oi.order_id = o.id and oi.tipo = 'servico'
   )
   and (o.appointment_id is null or exists (
     select 1 from public.appointments ap
      where ap.id = o.appointment_id and ap.status not in ('cancelado', 'faltou')
   ));

comment on view public.avaliacoes_a_pedir is
  'Fila da avaliacao pos-atendimento. So sai quem teve servico de verdade na comanda (M5) e so dentro da janela de 9h as 20h (M4).';

-- ---------------------------------------------------------------------------
-- 3) A8 — a reativação passa a usar a régua da casa
-- ---------------------------------------------------------------------------
-- O que havia: o horário alvo era o múltiplo do intervalo do cliente a partir
-- do último atendimento, e as únicas travas eram a janela de 24-25h, "cliente
-- sem horário futuro" e sobreposição + folga. Zero consulta ao horário de
-- funcionamento, à jornada do barbeiro, a `professionals.ativo`, a
-- `services.ativo` — réguas que existem e que o resto do sistema usa. O
-- resultado no celular do cliente era "reservei seu horário com o João", com o
-- João fora da equipe há meses, num domingo em que a barbearia não abre.
--
-- O que passa a haver: o alvo continua sendo o mesmo; quem decide se ele existe
-- é `horarios_livres`, a função que o QR do balcão e o agente já usam. Ela
-- olha jornada, barbeiro ativo, horário do salão, sobreposição e folga num
-- lugar só. Do que ela devolver, escolhe-se o horário mais perto do alvo, no
-- mesmo dia, até 1 hora de diferença — decidido em 11/09/2026. Uma hora porque
-- é o limite em que ainda é "o seu horário de sempre"; passou disso, é outro
-- convite, e esse é um convite que ninguém pediu.
--
-- Trocar de barbeiro é a exceção, não a regra: só quando o de sempre saiu da
-- equipe. Barbeiro cheio ou de folga naquele dia não vira "marquei com outro" —
-- o cliente fica para o próximo ciclo, com o barbeiro dele.
--
-- E a barbearia entra na conta: `salons_com_automacao` era a única régua que
-- esta fila não fazia. Barbearia com acesso bloqueado seguia disparando
-- template COBRADO, pelo número central, em nome dela. A conta é da plataforma.
create or replace function public.criar_agendamentos_de_reativacao()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c record;
  v_alvo timestamptz;
  v_dia date;
  v_duracao_min integer;
  v_k integer;
  v_criados integer := 0;
  v_novo uuid;
  v_inicio timestamptz;
  v_prof uuid;
  v_barbeiro_saiu boolean;
begin
  for v_c in
    select c.id as client_id, c.salon_id, c.reativacao_semanas,
           a.id as ultimo_id, a.professional_id, a.service_id, a.data_hora_inicio,
           (a.data_hora_fim - a.data_hora_inicio) as duracao
      from public.clients c
      join public.salons_com_automacao sa on sa.id = c.salon_id
      join lateral (
        select a.* from public.appointments a
         where a.client_id = c.id and a.status = 'concluido'
           and a.service_id is not null
         order by a.data_hora_inicio desc
         limit 1
      ) a on true
      join public.services sv on sv.id = a.service_id and sv.ativo
     where c.reativacao_semanas is not null
       and c.reativacao_pausada_em is null
       and not c.recusou_contato
       and c.telefone_norm is not null
  loop
    v_k := greatest(1, ceil(extract(epoch from (now() - v_c.data_hora_inicio))
                            / extract(epoch from (v_c.reativacao_semanas * interval '7 days')))::integer);
    v_alvo := v_c.data_hora_inicio + v_k * (v_c.reativacao_semanas * interval '7 days');

    continue when v_alvo < now() + interval '24 hours' or v_alvo >= now() + interval '25 hours';

    continue when exists (
      select 1 from public.appointments a
       where a.client_id = v_c.client_id
         and a.status in ('agendado', 'confirmado')
         and a.data_hora_inicio > now()
    );

    v_dia := (v_alvo at time zone 'America/Sao_Paulo')::date;
    v_duracao_min := greatest(1, ceil(extract(epoch from v_c.duracao) / 60)::integer);

    v_barbeiro_saiu := v_c.professional_id is null or not exists (
      select 1 from public.professionals p
       where p.id = v_c.professional_id and p.ativo
    );

    v_inicio := null;
    v_prof := null;

    select hl.inicio, hl.professional_id
      into v_inicio, v_prof
      from public.horarios_livres(
             v_c.salon_id, v_dia, v_duracao_min,
             case when v_barbeiro_saiu then null else v_c.professional_id end) hl
     where hl.inicio >= v_alvo - interval '1 hour'
       and hl.inicio <= v_alvo + interval '1 hour'
     order by abs(extract(epoch from (hl.inicio - v_alvo))), hl.inicio
     limit 1;

    -- Nada livre a até uma hora do horário de sempre: este cliente fica para o
    -- próximo ciclo. Convite fora da hora dele é convite de outra pessoa.
    continue when v_inicio is null;

    begin
      insert into public.appointments
        (salon_id, client_id, professional_id, service_id,
         data_hora_inicio, data_hora_fim, status, origem)
      values
        (v_c.salon_id, v_c.client_id, v_prof, v_c.service_id,
         v_inicio, v_inicio + v_c.duracao, 'agendado', 'reativacao')
      returning id into v_novo;

      insert into public.appointment_services (appointment_id, service_id, ordem)
      select v_novo, asv.service_id, asv.ordem
        from public.appointment_services asv
       where asv.appointment_id = v_c.ultimo_id
      on conflict do nothing;

      v_criados := v_criados + 1;
    exception when others then
      -- Cadeira ocupada entre a consulta e o insert: este cliente fica para a
      -- próxima rodada; os outros seguem.
      raise notice 'Reativacao pulada para o cliente %: %', v_c.client_id, sqlerrm;
    end;
  end loop;
  return v_criados;
end;
$function$;

comment on function public.criar_agendamentos_de_reativacao() is
  'Reserva a cadeira da reativacao usando horarios_livres — a mesma regua do QR e do agente: jornada, barbeiro ativo, horario do salao, sobreposicao e folga. Pega o livre mais perto do horario de sempre, no mesmo dia, ate 1h de diferenca. Troca de barbeiro so quando o de sempre saiu da equipe. So roda para barbearia em salons_com_automacao.';

-- ---------------------------------------------------------------------------
-- 4) A8 — a cadeira que ninguém soube que existia
-- ---------------------------------------------------------------------------
-- A expiração só soltava a cadeira de quem RECEBEU o convite e não respondeu
-- (`confirmacao_enviada`). A reserva que nunca chegou a ser enviada — porque o
-- barbeiro saiu, porque a barbearia perdeu o acesso, porque o cliente marcou
-- sozinho no meio do caminho — ficava `agendado` para sempre, ocupando a agenda
-- de uma barbearia que nem sabia que ela existia. Hoje não há nenhuma em
-- produção; sem esta trava, a primeira aparece e nunca mais sai.
--
-- O corte é 2 horas porque é onde a fila `reativacoes_a_enviar` para de
-- oferecer a linha: passou disso e ainda não foi enviada, não vai mais ser.
-- Ninguém é pausado por isso: pausa é castigo de quem não respondeu, e aqui
-- não houve pergunta.
create or replace function public.expira_reativacoes_sem_resposta()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total integer;
  v_soltas integer;
begin
  with expiradas as (
    update public.appointments a
       set status = 'cancelado'
     where a.origem = 'reativacao'
       and a.status = 'agendado'
       and a.confirmacao_enviada
       and a.lembrete_respondido_em is null
       and a.data_hora_inicio < now() + interval '3 hours'
    returning a.client_id
  ),
  pausados as (
    update public.clients c
       set reativacao_pausada_em = now(),
           reativacao_pausa_motivo = 'sem_resposta'
     where c.id in (select client_id from expiradas)
       and c.reativacao_pausada_em is null
       and c.reativacao_sem_resposta >= 2
    returning c.id
  )
  select count(*) into v_total from expiradas;

  update public.appointments a
     set status = 'cancelado'
   where a.origem = 'reativacao'
     and a.status = 'agendado'
     and not a.confirmacao_enviada
     and a.data_hora_inicio < now() + interval '2 hours';
  get diagnostics v_soltas = row_count;

  return v_total + v_soltas;
end;
$function$;

comment on function public.expira_reativacoes_sem_resposta() is
  'Solta a cadeira da reativacao em dois casos: convite enviado e sem resposta (pausa o cliente na segunda vez) e reserva que nunca chegou a ser enviada (nao pausa ninguem — nao houve pergunta).';

-- ---------------------------------------------------------------------------
-- 5) A8 + M4 — a fila da reativação
-- ---------------------------------------------------------------------------
-- Três buracos, todos no mesmo WHERE:
--   * não repetia a exclusão "cliente com horário futuro" que o cron faz. Quem
--     marcou sozinho de manhã recebia o convite à tarde e ocupava DUAS
--     cadeiras — horários disjuntos não violam constraint nenhuma;
--   * `left join professionals` sem `p.ativo`: mandava o nome de quem saiu;
--   * era a única fila sem `salons_com_automacao`.
-- A linha cujo barbeiro saiu entre a reserva e o envio some daqui e é solta
-- pela expiração acima — em vez de virar uma mensagem com o nome errado.
create or replace view public.reativacoes_a_enviar
with (security_invoker = on) as
select a.id as appointment_id,
       a.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       c.telefone_norm,
       c.reativacao_sem_resposta,
       p.nome as barbeiro,
       to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'DD/MM') as data,
       to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI') as hora,
       private.destino_whatsapp(c.telefone) as destino
  from public.appointments a
  join public.clients c on c.id = a.client_id
  join public.salons s on s.id = a.salon_id
  join public.salons_com_automacao sa on sa.id = a.salon_id
  join public.professionals p on p.id = a.professional_id and p.ativo
 where a.origem = 'reativacao'
   and a.status = 'agendado'
   and not a.confirmacao_enviada
   and a.data_hora_inicio >= now() + interval '2 hours'
   and a.data_hora_inicio <= now() + interval '26 hours'
   and not c.recusou_contato
   and c.reativacao_pausada_em is null
   and private.destino_whatsapp(c.telefone) is not null
   and private.hora_de_falar()
   and not exists (
     select 1 from public.appointments o
      where o.client_id = c.id
        and o.id <> a.id
        and o.status in ('agendado', 'confirmado')
        and o.data_hora_inicio > now()
   );

comment on view public.reativacoes_a_enviar is
  'Fila do convite de reativacao. Barbearia com automacao, barbeiro ainda na equipe, cliente sem outro horario futuro, e dentro da janela de 9h as 20h.';

-- ---------------------------------------------------------------------------
-- 6) M16 — a Política de Atraso é aposentada
-- ---------------------------------------------------------------------------
-- O fluxo `67oZqGOIoKO6pAeQ` no n8n nunca foi publicado e está parado desde
-- 23/08; o template `atraso_esta_vindo` nunca saiu de rascunho na Meta. Ou
-- seja: a view era lida por ninguém e a mensagem não podia ser enviada nem se
-- alguém a lesse. O "Atraso tolerado" já saiu da tela de Configurações em
-- 11/09 — o dono ajustava um número sem efeito.
--
-- O desenho também não sobreviveu: ele foi feito para o barbeiro decidir na
-- faixa do balcão, que saiu em 25/08. A ideia refeita — o cliente responde
-- "não vou" e a cadeira é liberada na hora — fica registrada no backlog e
-- precisa de template novo aprovado pela Meta e de mexer no webhook. É projeto
-- próprio, não sobra desta migration.
--
-- `atraso_perguntado_em` também some do SELECT da agenda no CRM: a coluna era
-- lida e nunca desenhada em lugar nenhum.
drop view if exists public.atrasos_para_perguntar;
alter table public.appointments drop column if exists atraso_perguntado_em;
alter table public.salons drop column if exists atraso_tolerado_minutos;
delete from public.whatsapp_templates where chave = 'atraso_esta_vindo';

-- ---------------------------------------------------------------------------
-- 7) A reativação de duas etapas que nunca teve consumidor
-- ---------------------------------------------------------------------------
-- `clientes_para_reativar` é o desenho antigo (0077/0083/0089/0115): a fila
-- montava template e parâmetros por conta própria, e nenhum dos workflows do
-- n8n a lê — a auditoria conferiu os JSONs de todos eles. O modelo vigente é o
-- da 0113: o banco reserva a cadeira e `reativacoes_a_enviar` manda o convite.
-- Duas filas para a mesma coisa, uma delas morta, é a próxima pessoa lendo a
-- errada.
--
-- A gêmea `clientes_para_avisar_retorno` está no mesmo estado e fica de pé até
-- o dono decidir — ela não foi aprovada para apagar junto.
drop view if exists public.clientes_para_reativar;
