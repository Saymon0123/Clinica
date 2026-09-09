-- 0142: alerta "comanda aberta esquecida".
--
-- Nenhum cron fecha comanda: `cancela_agendamentos_sem_comanda` mexe em
-- appointments, e `fechar_caixas_do_dia` fecha o CAIXA mas deixa as comandas
-- abertas dentro dele. Entao o barbeiro que abre a comanda, atende e esquece de
-- fechar deixa a venda pendurada -- e se o caixa fechou, a comanda vira orfa num
-- caixa fechado. Ninguem percebe: e faturamento da barbearia escapando calado.
--
-- Alerta quando a comanda esta 'aberta' e ou (a) o caixa dela ja fechou -- o
-- sinal mais forte, sem falso positivo -- ou (b) foi aberta num dia anterior.
-- Comanda aberta hoje com caixa aberto e atendimento em curso: nao alerta.
-- security_invoker: o dono ve a da sua barbearia; e dinheiro dele.

create or replace view public.auditoria_comanda
with (security_invoker = on) as
select 'comanda-aberta:' || o.id as chave,
       'Comanda aberta e esquecida' as tipo,
       'aviso' as gravidade,
       o.salon_id,
       o.created_at as ocorrido_em,
       s.nome || ' -- comanda' || coalesce(' de ' || nullif(cl.nome, ''), '') || ' aberta desde '
         || to_char(o.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
         || case when cr.status = 'fechado' then ', mas o caixa ja foi fechado' else ', de um dia anterior' end
         || '. Nunca foi fechada -- conferir se a venda foi cobrada.' as detalhe
  from public.orders o
  join public.salons s on s.id = o.salon_id
  left join public.clients cl on cl.id = o.client_id
  left join public.cash_registers cr on cr.id = o.cash_register_id
 where o.status = 'aberta'
   and o.created_at > now() - interval '30 days'
   and exists (select 1 from public.salons_atendendo sa where sa.id = o.salon_id)
   and (
     cr.status = 'fechado'
     or (o.created_at at time zone 'America/Sao_Paulo')::date < (now() at time zone 'America/Sao_Paulo')::date
   );

comment on view public.auditoria_comanda is
  'Alerta (aviso): comanda aberta cujo caixa ja fechou (orfa) ou aberta num dia anterior. Venda pendurada -- faturamento da barbearia escapando. Nenhum cron fecha comanda.';

-- Entra na fila unica de alertas.
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
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_comanda
  ) a
  left join public.auditoria_avisos av on av.chave = a.chave
 where av.chave is null
 order by case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
          a.ocorrido_em desc;

revoke all on public.auditoria_comanda from anon;
grant select on public.auditoria_comanda to authenticated, service_role;
