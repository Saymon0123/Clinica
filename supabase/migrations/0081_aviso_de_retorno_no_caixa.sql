-- O opt-in de aviso de retorno, marcado por padrao no caixa.
--
-- A caixa vem marcada e o barbeiro se encarrega de avisar o cliente. Isso torna
-- a frase "voce pediu para que te avisassemos" verdadeira -- e e ela que faz a
-- mensagem ser utilidade (~R$ 0,04) em vez de marketing (~R$ 0,35).
--
-- **Duas colunas, e nao uma.** O default `true` sozinho seria uma armadilha:
-- ele valeria retroativamente para a base inteira, e centenas de clientes que
-- ninguem nunca avisou de nada passariam a receber "voce pediu". Por isso a
-- elegibilidade nao olha a preferencia, olha `aviso_de_retorno_em` -- que so e
-- preenchido quando o cliente PASSA POR UM CAIXA, com o barbeiro na frente
-- dele. Quem nunca passou continua na lista fria, que e onde ele deve estar.
--
-- Nulo em `aviso_de_retorno_em` nao significa recusa: significa que a conversa
-- ainda nao aconteceu.
--
-- As duas listas se excluem: quem confirmou vai pela A (barata), quem nunca
-- passou vai pela B (cara), e ninguem recebe as duas.

alter table public.clients
  add column if not exists quer_aviso_de_retorno boolean not null default true,
  add column if not exists aviso_de_retorno_em timestamptz;

comment on column public.clients.quer_aviso_de_retorno is
  'Preferencia do cliente sobre receber aviso de retorno. Vem marcada por padrao no caixa; o barbeiro avisa o cliente na hora.';
comment on column public.clients.aviso_de_retorno_em is
  'Quando a preferencia foi confirmada num caixa, com o barbeiro na frente do cliente. NULO = nunca passou por um caixa desde que isto existe, e por isso NAO entra na lista de utilidade -- ninguem lhe disse nada, entao "voce pediu" seria falso.';

-- Lista A: quem pediu. UTILIDADE.
create or replace view public.clientes_para_avisar_retorno
with (security_invoker = on) as
with config as (
  select s.id as salon_id, s.nome as barbearia, s.reativacao_dias
    from public.salons s
   where s.ativo and s.reativacao_dias > 0
),
ultima_visita as (
  select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
    from public.appointments a
   where a.status = 'concluido'
   group by a.client_id, a.salon_id
)
select
  c.id as client_id,
  cfg.salon_id,
  cfg.barbearia,
  c.nome as cliente,
  (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) as dias_sem_vir,
  wc.instance_name,
  '55' || regexp_replace(c.telefone, '\D', '', 'g') as destino,
  t.nome_meta as template,
  t.idioma as template_idioma,
  jsonb_build_array(
    split_part(c.nome, ' ', 1),
    cfg.barbearia,
    case
      when (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) >= 60
        then ((current_date - (uv.em at time zone 'America/Sao_Paulo')::date) / 30)::text || ' meses'
      else (current_date - (uv.em at time zone 'America/Sao_Paulo')::date)::text || ' dias'
    end
  ) as template_parametros
from config cfg
join public.clients c on c.salon_id = cfg.salon_id
join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
join public.salons_com_automacao sa on sa.id = cfg.salon_id
join public.whatsapp_connections wc on wc.salon_id = cfg.salon_id and wc.status = 'open'
join public.whatsapp_templates t
  on t.chave = 'retorno_pedido' and t.status = 'aprovado' and t.ativo
where c.quer_aviso_de_retorno
  -- A trava que impede a frase de virar mentira.
  and c.aviso_de_retorno_em is not null
  and not c.recusou_contato
  and (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) >= cfg.reativacao_dias
  and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
  and not exists (
    select 1 from public.appointments a2
     where a2.client_id = c.id and a2.status in ('agendado', 'confirmado')
       and a2.data_hora_inicio > now()
  )
  and not exists (
    select 1 from public.reativacao_envios re
     where re.client_id = c.id
       and re.criado_em > now() - make_interval(days => cfg.reativacao_dias)
  );

comment on view public.clientes_para_avisar_retorno is
  'Clientes que confirmaram no caixa que querem ser avisados. Template de UTILIDADE (~R$ 0,04). So entra quem passou por um caixa: sem isso, "voce pediu" seria falso.';

-- Lista B: quem nao pediu. MARKETING. Passa a EXCLUIR quem esta na lista A,
-- senao o mesmo cliente receberia as duas -- e a cara, sem necessidade.
create or replace view public.clientes_para_reativar
with (security_invoker = on) as
with config as (
  select s.id as salon_id, s.nome as barbearia, s.reativacao_dias
    from public.salons s
   where s.ativo and s.reativacao_dias > 0
),
ultima_visita as (
  select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
    from public.appointments a
   where a.status = 'concluido'
   group by a.client_id, a.salon_id
)
select
  c.id as client_id,
  cfg.salon_id,
  cfg.barbearia,
  c.nome as cliente,
  (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) as dias_sem_vir,
  wc.instance_name,
  '55' || regexp_replace(c.telefone, '\D', '', 'g') as destino,
  t.nome_meta as template,
  t.idioma as template_idioma,
  jsonb_build_array(
    split_part(c.nome, ' ', 1),
    case
      when (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) >= 60
        then ((current_date - (uv.em at time zone 'America/Sao_Paulo')::date) / 30)::text || ' meses'
      else (current_date - (uv.em at time zone 'America/Sao_Paulo')::date)::text || ' dias'
    end,
    cfg.barbearia
  ) as template_parametros
from config cfg
join public.clients c on c.salon_id = cfg.salon_id
join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
join public.salons_com_automacao sa on sa.id = cfg.salon_id
join public.whatsapp_connections wc on wc.salon_id = cfg.salon_id and wc.status = 'open'
join public.whatsapp_templates t
  on t.chave = 'reativacao' and t.status = 'aprovado' and t.ativo
where not c.recusou_contato
  -- Quem confirmou no caixa vai pela lista A, que e nove vezes mais barata.
  and c.aviso_de_retorno_em is null
  and (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) >= cfg.reativacao_dias
  and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
  and not exists (
    select 1 from public.appointments a2
     where a2.client_id = c.id and a2.status in ('agendado', 'confirmado')
       and a2.data_hora_inicio > now()
  )
  and not exists (
    select 1 from public.reativacao_envios re
     where re.client_id = c.id
       and re.criado_em > now() - make_interval(days => cfg.reativacao_dias)
  );

comment on view public.clientes_para_reativar is
  'Clientes dormentes que NUNCA confirmaram nada no caixa. Template de MARKETING (~R$ 0,35). Exclui quem esta em clientes_para_avisar_retorno, para ninguem receber as duas.';
