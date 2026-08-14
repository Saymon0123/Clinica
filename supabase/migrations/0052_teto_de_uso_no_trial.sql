-- Teto de uso do agente durante o teste grátis.
--
-- Com cadastro aberto e trial sem cartão, qualquer pessoa liga o agente de IA
-- sem nenhum compromisso. No uso normal isso é barato: o agente roda em
-- gpt-4o-mini, e uma conversa que termina em agendamento custa por volta de
-- R$ 0,11. O problema não é o uso — é o **abuso**, que não tem teto nenhum:
-- um laço de mensagens ou cinquenta contas falsas gastam sem limite.
--
-- A trava vai para `salons_atendendo`, que já é a fonte de verdade de quem o
-- agente atende. Um lugar só, e nenhuma automação futura precisa lembrar de
-- repetir a regra.
--
-- **Só vale para `trial`.** Quem paga nunca é limitado: o teto existe para
-- conter risco de quem não assumiu compromisso nenhum, e cortar o atendimento
-- de um cliente pagante por volume seria punir justamente o melhor caso.

-- Conta apenas mensagens RECEBIDAS: é cada uma delas que dispara uma rodada do
-- agente, e é aí que o custo acontece. Contar as enviadas dobraria o número
-- sem relação com gasto.
create or replace view public.uso_do_agente
with (security_invoker = on) as
select c.salon_id,
       count(*) filter (where m.direction = 'in') as recebidas_no_total,
       count(*) filter (where m.direction = 'in' and m.created_at >= current_date) as recebidas_hoje
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
group by c.salon_id;

comment on view public.uso_do_agente is
  'Mensagens recebidas por salao -- cada uma dispara uma rodada do agente, e e onde o custo acontece.';

create index if not exists idx_whatsapp_messages_conversa_direcao
  on public.whatsapp_messages (conversation_id, direction);

create or replace view public.salons_atendendo
with (security_invoker = on) as
select s.*
from public.salons s
left join public.subscriptions sub on sub.salon_id = s.id
where s.ativo
  and (
    sub.salon_id is null
    -- `atendimento_ate` é gravado pelo webhook na confirmação do pagamento.
    -- Em teste ele é nulo, e aí o prazo sai de `acesso_ate` + a tolerância.
    or coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= current_date
  )
  and (
    -- Pagante, cancelado, sem assinatura: sem teto. A trava é só do teste.
    sub.status is distinct from 'trial'
    or not exists (
      select 1
      from public.uso_do_agente u
      where u.salon_id = s.id
        -- 2.000 recebidas no teste inteiro. Uma barbearia movimentada gasta
        -- cerca de 8 mensagens por agendamento, então isto cobre ~250
        -- agendamentos -- muito acima de um teste honesto, e ainda assim um
        -- custo de pior caso na casa de R$ 30.
        and (
          u.recebidas_no_total >= 2000
          -- 400 num dia só. O teto total não segura um laço, que queima 2.000
          -- numa hora; este segura. Uma barbearia real não recebe 400
          -- mensagens em um dia.
          or u.recebidas_hoje >= 400
        )
    )
  );

comment on view public.salons_atendendo is
  'Saloes cujo agente ainda deve responder: ativos, dentro do prazo de tolerancia (3 dias apos o vencimento) e, quando em trial, abaixo do teto de uso. Sem assinatura registrada, atende -- a falta da linha e problema nosso, nao inadimplencia.';

-- Quem estourou o teto, para o dono do produto ser avisado.
--
-- Sem isto o agente para em silêncio e ninguém sabe: nem o dono da barbearia,
-- que acha que quebrou, nem você, que perde a chance de converter alguém que
-- claramente está usando — ou de descobrir um abuso em andamento.
create or replace view public.auditoria_operacao
with (security_invoker = on) as
select
  'trial-no-teto:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD') as chave,
  'Teste grátis atingiu o teto de uso' as tipo,
  'aviso' as gravidade,
  s.id as salon_id,
  now() as ocorrido_em,
  s.nome || ' — ' || u.recebidas_no_total || ' mensagens no teste, ' ||
    u.recebidas_hoje || ' hoje. O agente parou de responder.' as detalhe
from public.salons s
join public.subscriptions sub on sub.salon_id = s.id
join public.uso_do_agente u on u.salon_id = s.id
where s.ativo
  and sub.status = 'trial'
  and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400);

comment on view public.auditoria_operacao is
  'Achados operacionais, nao de comportamento do agente. Alimenta auditoria_pendente.';

-- `auditoria_pendente` passa a ler as três fontes, com a mesma trava de avisar
-- uma vez só.
create or replace view public.auditoria_pendente
with (security_invoker = on) as
select a.*
from (
  select * from public.auditoria_do_agente
  union all
  select * from public.auditoria_fronteira
  union all
  select * from public.auditoria_operacao
) a
left join public.auditoria_avisos av on av.chave = a.chave
where av.chave is null
order by
  case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
  a.ocorrido_em desc;

revoke all on public.uso_do_agente, public.auditoria_operacao from anon, authenticated;

-- `authenticated` precisa ler `uso_do_agente` porque `salons_atendendo` passou
-- a depender dela, e a view roda com `security_invoker` — sem este grant, o
-- CRM quebraria com "permission denied" ao consultar os salões atendidos.
--
-- É seguro: com `security_invoker`, o RLS de `whatsapp_messages` continua
-- valendo, então cada usuário conta apenas as mensagens do próprio salão.
grant select on public.uso_do_agente to authenticated, service_role;
grant select on public.auditoria_operacao to service_role;
