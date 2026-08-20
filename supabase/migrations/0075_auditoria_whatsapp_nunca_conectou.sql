-- Quinta regra: a barbearia esta atendendo, mas o WhatsApp nunca subiu.
--
-- A regra 2 (migration 0053) so acusa WhatsApp que **caiu**: ela exige que a
-- barbearia ja tenha recebido alguma mensagem. Quem nunca terminou de ler o QR
-- fica invisivel -- e no cadastro aberto esse e o caso MAIS comum, nao o mais
-- raro: o dono cria a conta, nao conclui a conexao, e nada avisa ninguem. Ele
-- conclui que o produto nao funciona e some, sem nunca reclamar.
--
-- **Achado em 2026-08-20**, testando o proprio agente: o dono do produto mandou
-- uma mensagem para a El Guardians e nao teve resposta. A instancia estava em
-- `connecting` desde 18/08, a ultima execucao do webhook era de 17/08, e a
-- `auditoria_pendente` estava **vazia** -- com DUAS barbearias atendendo e sem
-- WhatsApp aberto (El Guardians e Barbearia do Samuca).
--
-- Duas horas de carencia para nao gritar durante o onboarding, que e quando
-- `connecting` e estado normal e passageiro.

create or replace view public.auditoria_operacao
with (security_invoker = on) as

-- 1. Teste gratis atingiu o teto de uso (migration 0052).
select
  'trial-no-teto:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD') as chave,
  'Teste gratis atingiu o teto de uso' as tipo,
  'aviso' as gravidade,
  s.id as salon_id,
  now() as ocorrido_em,
  s.nome || ' -- ' || u.recebidas_no_total || ' mensagens no teste, ' ||
    u.recebidas_hoje || ' hoje. O agente parou de responder.' as detalhe
from public.salons s
join public.subscriptions sub on sub.salon_id = s.id
join public.uso_do_agente u on u.salon_id = s.id
where s.ativo
  and sub.status = 'trial'
  and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400)

union all

-- 2. WhatsApp caiu numa barbearia que estava funcionando (migration 0053).
select
  'whatsapp-caiu:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
  'WhatsApp desconectado',
  'grave',
  s.id,
  now(),
  s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') ||
    ' desde ' || to_char(wc.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
    '. Nenhum cliente esta sendo atendido.'
from public.salons s
join public.whatsapp_connections wc on wc.salon_id = s.id
where s.ativo
  and wc.status is distinct from 'open'
  and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
  and exists (
    select 1 from public.whatsapp_messages m
    join public.whatsapp_conversations c on c.id = m.conversation_id
    where c.salon_id = s.id
  )

union all

-- 3. Vence e nao ha como avisar (migration 0056).
select
  'vencimento-sem-canal:' || v.salon_id || ':' || to_char(v.acesso_ate, 'YYYY-MM-DD'),
  'Teste vencendo e sem como avisar',
  'aviso',
  v.salon_id,
  now(),
  v.salao || ' -- o teste acaba ' ||
    case v.dias_restantes when 0 then 'hoje' else 'em ' || v.dias_restantes || ' dias' end ||
    ' e nao ha como avisar automaticamente (' ||
    case when v.instance_name is null then 'WhatsApp desconectado'
         else 'sem telefone cadastrado' end || '). Fale com o dono.'
from public.vencimentos_proximos v
where v.instance_name is null or length(v.destino) < 12

union all

-- 4. Barbearia abre num dia sem barbeiro (migration 0062).
select
  'dia-sem-barbeiro:' || s.id || ':' || dia.chave || ':' || to_char(current_date, 'YYYY-MM-DD'),
  'Barbearia abre num dia sem barbeiro',
  'grave',
  s.id,
  now(),
  s.nome || ' -- abre ' || dia.nome || ' mas nenhum barbeiro tem jornada nesse dia. ' ||
    'Ninguem consegue agendar, nem pelo WhatsApp nem pelo QR.'
from public.salons s
cross join (values
  (0, 'dom', 'domingo'), (1, 'seg', 'segunda'), (2, 'ter', 'terca'),
  (3, 'qua', 'quarta'), (4, 'qui', 'quinta'), (5, 'sex', 'sexta'),
  (6, 'sab', 'sabado')
) as dia(numero, chave, nome)
where s.ativo
  and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
  and s.horario_funcionamento -> dia.chave ? 'abre'
  and not exists (
    select 1 from public.professional_schedules ps
    join public.professionals p on p.id = ps.professional_id
    where p.salon_id = s.id and p.ativo and ps.ativo and ps.dia_semana = dia.numero
  )
  and exists (select 1 from public.professionals p where p.salon_id = s.id and p.ativo)

union all

-- 5. O WhatsApp nunca terminou de conectar.
select
  'whatsapp-nunca-conectou:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
  'WhatsApp nunca terminou de conectar',
  'grave',
  s.id,
  now(),
  s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') ||
    ' desde ' || to_char(wc.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
    ' e essa barbearia NUNCA recebeu uma mensagem. Provavelmente o QR nunca foi ' ||
    'lido ate o fim. O agente nao funciona para ela, e o dono nao tem como saber.'
from public.salons s
join public.whatsapp_connections wc on wc.salon_id = s.id
where s.ativo
  and wc.status is distinct from 'open'
  and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
  and not exists (
    select 1 from public.whatsapp_messages m
    join public.whatsapp_conversations c on c.id = m.conversation_id
    where c.salon_id = s.id
  )
  -- Carencia: `connecting` e estado normal durante o onboarding.
  and wc.updated_at < now() - interval '2 hours';

comment on view public.auditoria_operacao is
  'Achados operacionais: teto de uso no trial, WhatsApp caido, vencimento sem canal de aviso, dia aberto sem barbeiro e WhatsApp que nunca terminou de conectar. Alimenta auditoria_pendente.';
