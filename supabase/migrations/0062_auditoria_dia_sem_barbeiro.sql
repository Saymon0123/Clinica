-- Quarta regra operacional: barbearia aberta num dia em que ninguém trabalha.
--
-- Mudar o horário da barbearia **não** mexe na jornada dos barbeiros, e isso é
-- deliberado — com equipe, cada um tem escala própria, e arrastar o horário do
-- salão sobre todos apagaria combinado.
--
-- Mas para a barbearia de um barbeiro só, que é a maioria, vira armadilha
-- silenciosa: o dono abre o domingo, ninguém consegue agendar por canal nenhum,
-- e nada explica o motivo.
--
-- Aconteceu em 2026-08-16 com o próprio dono do produto, que **sabia** onde
-- mexer e ainda assim precisou de duas edições em telas diferentes. Um cliente
-- conclui que o produto não funciona.
--
-- A tela de Configurações passou a avisar e a oferecer o conserto num clique
-- (`AvisoDeJornada`). Esta regra cobre quem não viu o aviso, ou mexeu antes de
-- ele existir.

create or replace view public.auditoria_operacao
with (security_invoker = on) as

-- 1. Teste grátis atingiu o teto de uso (migration 0052).
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

-- 3. Vence e não há como avisar (migration 0056).
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

-- 4. Barbearia abre num dia sem barbeiro.
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
  -- A barbearia declara que abre nesse dia.
  and s.horario_funcionamento -> dia.chave ? 'abre'
  -- Mas ninguém tem jornada.
  and not exists (
    select 1 from public.professional_schedules ps
    join public.professionals p on p.id = ps.professional_id
    where p.salon_id = s.id and p.ativo and ps.ativo and ps.dia_semana = dia.numero
  )
  -- Só acusa quem TEM barbeiro: barbearia sem nenhum profissional já é coberta
  -- pela regra "configurada pela metade", e dois avisos para o mesmo problema
  -- é ruído.
  and exists (select 1 from public.professionals p where p.salon_id = s.id and p.ativo);

comment on view public.auditoria_operacao is
  'Achados operacionais: teto de uso no trial, WhatsApp caido, vencimento sem canal de aviso e dia aberto sem barbeiro. Alimenta auditoria_pendente.';
