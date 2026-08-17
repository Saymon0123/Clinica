-- A view do atraso passa a entregar destino e texto prontos.
--
-- Padrao da casa, ja usado por `vencimentos_a_avisar`: **o texto da mensagem
-- mora em SQL**, nao dentro do n8n. A regra e o texto sao deterministicos e
-- moram ao lado do dado que os define; no fluxo, cada mensagem viraria uma
-- string solta num no, longe de tudo que decide se ela deve sair.
--
-- Duas condicoes novas, que na especificacao original iam virar nos `IF` no
-- fluxo e agora sao SQL:
--
-- 1. **Agente pausado.** Se o dono assumiu a conversa, o agente cala a boca. A
--    linha some da lista e volta sozinha se ele devolver ao agente ainda dentro
--    da janela -- mesmo efeito que o fluxo de lembretes conseguiu com um no
--    dedicado, sem o no.
-- 2. **Numero real.** O telefone vem do `contact_phone` da conversa, que e o
--    numero que o WhatsApp de fato usa, caindo para o cadastro so quando o
--    cliente nunca conversou. Resolve o caso do numero antigo sem o 9, que o
--    fluxo de lembretes ja tinha aprendido.

drop view if exists public.atrasos_para_perguntar;

create view public.atrasos_para_perguntar
with (security_invoker = on) as
with conversa as (
  select c.id as client_id,
         w.contact_phone,
         w.agent_paused
    from public.clients c
    join public.whatsapp_conversations w
      on w.salon_id = c.salon_id
     and right(regexp_replace(w.contact_phone, '\D', '', 'g'), 8) = c.telefone_norm
)
select
  a.id as appointment_id,
  a.salon_id,
  s.nome as barbearia,
  c.nome as cliente,
  wc.instance_name,
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_marcada,
  floor(extract(epoch from (now() - a.data_hora_inicio)) / 60)::int as minutos_de_atraso,
  coalesce(
    regexp_replace(conv.contact_phone, '\D', '', 'g'),
    '55' || regexp_replace(c.telefone, '\D', '', 'g')
  ) as destino,
  -- Sem ameaca e sem cobranca: o sistema NAO libera o horario sozinho, e uma
  -- mensagem que promete o contrario vira reclamacao no balcao.
  'Oi, ' || split_part(c.nome, ' ', 1) || '! Aqui e da *' || s.nome || '*.' || chr(10) || chr(10) ||
  'Seu horario era ' || to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') ||
  ' e a cadeira esta te esperando. Consegue chegar nos proximos minutos?' as texto
from public.appointments a
join public.salons s on s.id = a.salon_id
join public.clients c on c.id = a.client_id
join public.salons_com_automacao sa on sa.id = a.salon_id
join public.whatsapp_connections wc on wc.salon_id = a.salon_id and wc.status = 'open'
left join conversa conv on conv.client_id = c.id
where a.status in ('agendado', 'confirmado')
  and a.chegou_em is null
  and a.iniciado_em is null
  and a.atraso_perguntado_em is null
  and coalesce(conv.agent_paused, false) = false
  and now() >= a.data_hora_inicio + make_interval(mins => s.atraso_tolerado_minutos)
  and now() < a.data_hora_inicio + interval '1 hour'
  and length(coalesce(
        regexp_replace(conv.contact_phone, '\D', '', 'g'),
        '55' || regexp_replace(c.telefone, '\D', '', 'g')
      )) >= 12;

comment on view public.atrasos_para_perguntar is
  'Clientes atrasados alem da tolerancia da barbearia que ainda nao foram perguntados, com destino e texto prontos. Consumida pelo fluxo n8n da politica de atraso, que marca atraso_perguntado_em ANTES de enviar.';
