-- 0140: dois alertas novos na auditoria -- agente mudo e cobranca travada.
--
-- Sao os dois erros mais silenciosos e caros de hoje. O "agente mudo" ja custou
-- ~2 semanas de silencio uma vez (o proprio whatsapp-webhook chama isso de "a
-- classe de falha mais perigosa"): o cliente escreve e ninguem responde. A
-- "cobranca travada" e dinheiro parado sem ninguem ver: fatura que nao vira
-- boleto, que espera CPF, ou boleto vencido e nao pago.
--
-- Cada um vira uma view no padrao das demais auditorias (security_invoker: o
-- dono ve so a sua barbearia via RLS das tabelas base; o n8n com service_role ve
-- tudo e manda ao canal de alertas). As duas entram na auditoria_pendente.

-- 1) Agente mudo: a ULTIMA mensagem da conversa e do cliente (direction='in') e
--    passou de 15 min sem resposta. agent_paused=false (o dono nao assumiu) e a
--    barbearia esta atendendo. A chave e o id da mensagem final -> um alerta por
--    rajada nao respondida, que some sozinho quando o agente responde.
--    (Se o volume crescer, da para pre-filtrar por c.last_message_at antes do
--    lateral; hoje o lateral ja usa o indice (conversation_id, created_at desc).)
create or replace view public.auditoria_atendimento
with (security_invoker = on) as
select 'agente-mudo:' || ult.msg_id as chave,
       'Cliente sem resposta do agente' as tipo,
       'grave' as gravidade,
       c.salon_id,
       ult.created_at as ocorrido_em,
       s.nome || ' -- o cliente ' || coalesce(nullif(c.contact_name, ''), c.contact_phone)
         || ' escreveu ha ' || floor(extract(epoch from (now() - ult.created_at)) / 60)::int
         || ' min e ninguem respondeu. Ultima: "'
         || left(coalesce(nullif(c.last_message_preview, ''), ult.content), 120) || '".' as detalhe
  from public.whatsapp_conversations c
  join public.salons s on s.id = c.salon_id
  join lateral (
    select m.id as msg_id, m.direction, m.created_at, m.content
      from public.whatsapp_messages m
     where m.conversation_id = c.id
     order by m.created_at desc
     limit 1
  ) ult on true
 where ult.direction = 'in'
   and ult.created_at < now() - interval '15 minutes'
   and ult.created_at > now() - interval '24 hours'
   and not c.agent_paused
   and exists (select 1 from public.salons_atendendo sa where sa.id = c.salon_id);

comment on view public.auditoria_atendimento is
  'Alerta: conversa cuja ultima mensagem e do cliente e ficou sem resposta > 15 min (agente nao pausado, barbearia atendendo). Grave: e a falha que ja deixou o agente mudo por semanas.';

-- 2) Cobranca travada, em tres casos mutuamente exclusivos por fatura.
create or replace view public.auditoria_cobranca
with (security_invoker = on) as
-- B1: tem documento, acima do minimo do Asaas, aberta ha > 2 dias sem boleto.
--     E o cobrar-uso falhando (hoje: conta Asaas reprovada).
select 'cobranca-travada:' || f.id as chave,
       'Cobranca nao foi gerada' as tipo, 'grave' as gravidade,
       f.salon_id, f.gerada_em as ocorrido_em,
       s.nome || ' -- deve R$ ' || replace(to_char(f.valor, 'FM999990.00'), '.', ',')
         || ' e a cobranca nao foi gerada ha ' || floor(extract(epoch from (now() - f.gerada_em)) / 86400)::int
         || ' dias. O Asaas esta recusando ou o cobrar-uso falhou.' as detalhe
  from public.faturas_de_uso f
  join public.salons s on s.id = f.salon_id
  left join public.subscriptions sub on sub.salon_id = f.salon_id
  left join public.organizations org on org.id = s.organization_id
 where f.asaas_payment_id is null and f.paga_em is null
   and f.valor >= 5
   and f.gerada_em < now() - interval '2 days'
   and coalesce(sub.cpf_cnpj, org.cpf_cnpj) is not null
union all
-- B2: sem CPF/CNPJ ha > 3 dias. Fica aberta de proposito ate o dono informar.
select 'cobranca-sem-doc:' || f.id as chave,
       'Cobranca parada por falta de CPF/CNPJ' as tipo, 'aviso' as gravidade,
       f.salon_id, f.gerada_em as ocorrido_em,
       s.nome || ' -- deve R$ ' || replace(to_char(f.valor, 'FM999990.00'), '.', ',')
         || ' mas nao informou CPF/CNPJ; sem ele nao da para cobrar. Pedir na aba Assinatura.' as detalhe
  from public.faturas_de_uso f
  join public.salons s on s.id = f.salon_id
  left join public.subscriptions sub on sub.salon_id = f.salon_id
  left join public.organizations org on org.id = s.organization_id
 where f.asaas_payment_id is null and f.paga_em is null
   and f.valor > 0
   and f.gerada_em < now() - interval '3 days'
   and coalesce(sub.cpf_cnpj, org.cpf_cnpj) is null
union all
-- B3: boleto emitido, vencido ha > 3 dias, nao pago. Inadimplencia real.
select 'cobranca-vencida:' || f.id as chave,
       'Boleto vencido e nao pago' as tipo, 'aviso' as gravidade,
       f.salon_id, f.boleto_vencimento::timestamptz as ocorrido_em,
       s.nome || ' -- boleto de R$ ' || replace(to_char(coalesce(f.boleto_valor, f.valor), 'FM999990.00'), '.', ',')
         || ' venceu em ' || to_char(f.boleto_vencimento, 'DD/MM') || ' e nao foi pago.' as detalhe
  from public.faturas_de_uso f
  join public.salons s on s.id = f.salon_id
 where f.asaas_payment_id is not null and f.paga_em is null
   and f.boleto_vencimento is not null
   and f.boleto_vencimento < (now() - interval '3 days');

comment on view public.auditoria_cobranca is
  'Alertas de cobranca: (grave) fatura com documento >= R$5 aberta ha >2d sem boleto = Asaas recusando/cobrar-uso falhou; (aviso) sem CPF/CNPJ ha >3d; (aviso) boleto vencido ha >3d nao pago.';

-- 3) As duas entram na fila unica de alertas (auditoria_avisos deduplica).
create or replace view public.auditoria_pendente
with (security_invoker = on) as
select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
  from (
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_do_agente
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_fronteira
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_operacao
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_avaliacao
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_atendimento
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_cobranca
  ) a
  left join public.auditoria_avisos av on av.chave = a.chave
 where av.chave is null
 order by case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
          a.ocorrido_em desc;

revoke all on public.auditoria_atendimento from anon;
revoke all on public.auditoria_cobranca from anon;
grant select on public.auditoria_atendimento to authenticated, service_role;
grant select on public.auditoria_cobranca to authenticated, service_role;
