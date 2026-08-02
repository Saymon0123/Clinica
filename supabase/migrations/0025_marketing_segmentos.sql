-- MARKETING FASE 1 — segmentos e elegibilidade.
--
-- Nada aqui envia mensagem. Esta migration entrega só a pergunta que a aba
-- Marketing precisa responder antes de qualquer disparo: "quem é elegível hoje,
-- quanto essa gente gasta, e quanto dá para descontar sem perder dinheiro".
--
-- Princípio do desenho (docs/marketing.md): a campanha guarda a REGRA, nunca uma
-- lista congelada de clientes. Por isso a elegibilidade vive aqui, em função, e
-- é recalculada a cada chamada — no simulador e, na fase 2, no envio.
--
-- As travas da seção 4 do desenho são aplicadas aqui, no banco, e não na tela:
-- o n8n vai chamar as mesmas funções na hora de enviar, e não pode depender de
-- o front ter filtrado direito.

-- 1. Preferência de marketing por cliente ------------------------------------

create table if not exists client_marketing (
  client_id uuid primary key references clients(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  opt_out boolean not null default false,
  opt_out_em timestamptz,
  last_campaign_at timestamptz
);

create index if not exists idx_client_marketing_salon on client_marketing (salon_id);

alter table client_marketing enable row level security;

drop policy if exists "client_marketing: gestor" on client_marketing;
create policy "client_marketing: gestor" on client_marketing for all to authenticated
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

comment on table client_marketing is
  'Opt-out e cooldown de campanha por cliente. O opt_out depende de o fluxo do '
  'agente no n8n reconhecer o pedido de saída — ver docs/backlog.md.';

-- 2. Fuso do salão -----------------------------------------------------------
--
-- `professional_schedules.hora_inicio` é hora LOCAL da barbearia (time), mas
-- `appointments.data_hora_inicio` é timestamptz. Cruzar os dois exige um fuso, e
-- o schema não tem nenhum: sem isto o Postgres usa o da sessão (UTC no Supabase)
-- e as faixas de horário sairiam 3 horas deslocadas.
--
-- Constante única enquanto todo salão for do horário de Brasília. Quando existir
-- salão em outro fuso, isto vira coluna em `salons` — está no backlog.
-- `set search_path = ''` porque o advisor do Supabase classifica função sem
-- search_path fixo como risco (a função não referencia tabela nenhuma, então
-- vazio basta).
create or replace function private.fuso_do_salao(p_salon_id uuid)
returns text language sql immutable set search_path = '' as $$
  select 'America/Sao_Paulo'
$$;

-- 3. Comissão média — o custo real de conceder desconto ----------------------
--
-- Um corte de R$ 50 não são R$ 50 no bolso do dono: sai dali a comissão do
-- barbeiro. `commissions.percentual_aplicado` guarda o percentual real por item,
-- então dá para calcular margem ≈ preço − comissão sem inventar nada.
--
-- Não considera insumo (produto gasto no atendimento): não existe no schema, é
-- cadastro chato e move pouco o número. A tela declara isso ao dono.
create or replace function marketing_comissao_media(p_salon_id uuid)
returns numeric language sql stable security invoker set search_path = public as $$
  select coalesce(avg(cm.percentual_aplicado), 0)
  from commissions cm
  join order_items oi on oi.id = cm.order_item_id
  join orders o on o.id = oi.order_id
  where o.salon_id = p_salon_id
    and o.status = 'fechada'
    and o.created_at > now() - interval '180 days'
$$;

-- 4. Clientes elegíveis por segmento -----------------------------------------
--
-- Segmentos aceitos:
--   sumidos         — último atendimento concluído há mais de 60 dias
--   uma_vez         — exatamente 1 atendimento concluído, há mais de 30 dias
--   aniversariantes — aniversário no mês corrente
--   ocioso          — clientes ativos, para convidar a faixas vazias da agenda
--
-- Limiares fixos no v1 por decisão registrada em docs/marketing.md.
create or replace function marketing_segmento_clientes(
  p_salon_id uuid,
  p_segmento text,
  p_limite int default null
)
returns table (
  client_id uuid,
  nome text,
  telefone text,
  ultimo_atendimento timestamptz,
  visitas bigint,
  ticket_medio numeric
)
language plpgsql stable security invoker set search_path = public as $$
begin
  -- O RLS de `clients` deixa o barbeiro ver os clientes dele, então sem esta
  -- checagem ele receberia um segmento reduzido em vez de um erro. Marketing é
  -- de dono e gerente (docs/visao.md); a recusa tem que ser explícita.
  if not private.is_manager(p_salon_id) then
    raise exception 'Apenas dono ou gerente podem consultar segmentos de marketing'
      using errcode = '42501';
  end if;

  if p_segmento not in ('sumidos', 'uma_vez', 'aniversariantes', 'ocioso') then
    raise exception 'Segmento desconhecido: %', p_segmento using errcode = '22023';
  end if;

  return query
  with historico as (
    select
      c.id,
      c.nome,
      c.telefone,
      c.telefone_norm,
      c.aniversario,
      max(a.data_hora_inicio) filter (where a.status = 'concluido') as ultimo,
      count(a.id) filter (where a.status = 'concluido') as visitas
    from clients c
    left join appointments a
      on a.client_id = c.id
     and a.salon_id = p_salon_id
    where c.salon_id = p_salon_id
    group by c.id, c.nome, c.telefone, c.telefone_norm, c.aniversario
  ),
  -- Ticket real do cliente, não preço de tabela: o que importa para o
  -- simulador é quanto ele de fato gasta quando vem.
  tickets as (
    select o.client_id, avg(i.total) as ticket_medio
    from orders o
    join lateral (
      select coalesce(sum(oi.preco_unitario * oi.quantidade), 0) as total
      from order_items oi
      where oi.order_id = o.id
    ) i on true
    where o.salon_id = p_salon_id
      and o.status = 'fechada'
      and o.client_id is not null
    group by o.client_id
  ),
  elegiveis as (
    select h.*
    from historico h
    where
      -- TRAVA: já tem horário marcado. Dar desconto para uma venda que já
      -- estava garantida é o erro nº 1 desse tipo de ferramenta.
      not exists (
        select 1 from appointments fa
        where fa.client_id = h.id
          and fa.salon_id = p_salon_id
          and fa.status <> 'cancelado'
          and fa.data_hora_inicio > now()
      )
      -- TRAVA: opt-out e cooldown de 30 dias, válido entre segmentos. Sem o
      -- cooldown, quem cai em dois segmentos recebe duas mensagens.
      and not exists (
        select 1 from client_marketing cm
        where cm.client_id = h.id
          and (cm.opt_out or cm.last_campaign_at > now() - interval '30 days')
      )
      -- TRAVA: só quem já conversou pelo WhatsApp do salão. Número que nunca
      -- falou com a barbearia é abordagem fria, outro problema e outro risco.
      -- O casamento é por telefone_norm (últimos 8 dígitos) porque o WhatsApp
      -- entrega 554187275895 e o cadastro guarda (41) 98727-5895 — comparar
      -- `telefone` por igualdade nunca casa. Ver docs/n8n-integration.md.
      and h.telefone_norm is not null
      and exists (
        select 1 from whatsapp_conversations w
        where w.salon_id = p_salon_id
          and right(regexp_replace(w.contact_phone, '\D', '', 'g'), 8) = h.telefone_norm
      )
  )
  select
    e.id,
    e.nome,
    e.telefone,
    e.ultimo,
    e.visitas,
    round(coalesce(t.ticket_medio, 0), 2)
  from elegiveis e
  left join tickets t on t.client_id = e.id
  where case p_segmento
    when 'sumidos' then
      e.ultimo is not null and e.ultimo < now() - interval '60 days'
    when 'uma_vez' then
      e.visitas = 1 and e.ultimo < now() - interval '30 days'
    when 'aniversariantes' then
      e.aniversario is not null
      and extract(month from e.aniversario) = extract(month from current_date)
    when 'ocioso' then
      e.ultimo is not null and e.ultimo >= now() - interval '90 days'
  end
  order by e.ultimo desc nulls last
  limit p_limite;
end;
$$;

-- 5. Resumo dos segmentos (os cards da tela inicial) -------------------------

create or replace function marketing_segmentos(p_salon_id uuid)
returns table (
  segmento text,
  clientes bigint,
  ticket_medio numeric,
  potencial numeric,
  ultima_campanha timestamptz
)
language plpgsql stable security invoker set search_path = public as $$
declare
  s text;
begin
  if not private.is_manager(p_salon_id) then
    raise exception 'Apenas dono ou gerente podem consultar segmentos de marketing'
      using errcode = '42501';
  end if;

  foreach s in array array['sumidos', 'uma_vez', 'aniversariantes', 'ocioso'] loop
    return query
    with c as (select * from marketing_segmento_clientes(p_salon_id, s))
    select
      s,
      count(*),
      round(coalesce(avg(nullif(c.ticket_medio, 0)), 0), 2),
      round(coalesce(sum(c.ticket_medio), 0), 2),
      (
        select max(cm.last_campaign_at)
        from client_marketing cm
        where cm.client_id in (select client_id from c)
      )
    from c;
  end loop;
end;
$$;

-- 6. Faixas ociosas da agenda ------------------------------------------------
--
-- Diferente dos outros segmentos: seleciona uma FAIXA da agenda, não pessoas.
-- Desconto que preenche terça de manhã não canibaliza venda que já aconteceria.
--
-- Ocupação = agendamentos por semana ÷ barbeiros disponíveis naquela faixa,
-- medida nas últimas 4 semanas. Barbeiro sem `professional_schedules` não entra
-- na capacidade: o desenho do produto é que todo barbeiro tenha a própria grade.
create or replace function marketing_horarios_ociosos(
  p_salon_id uuid,
  p_limite int default 5
)
returns table (
  dia_semana int,
  hora int,
  capacidade bigint,
  agendados_por_semana numeric,
  ocupacao numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_fuso text := private.fuso_do_salao(p_salon_id);
begin
  if not private.is_manager(p_salon_id) then
    raise exception 'Apenas dono ou gerente podem consultar segmentos de marketing'
      using errcode = '42501';
  end if;

  return query
  with capacidade as (
    select
      ps.dia_semana::int as dow,
      h.hora::int as hora,
      count(distinct ps.professional_id) as barbeiros
    from professional_schedules ps
    join professionals p on p.id = ps.professional_id
    cross join lateral generate_series(
      extract(hour from ps.hora_inicio)::int,
      extract(hour from ps.hora_fim)::int - 1
    ) as h(hora)
    where p.salon_id = p_salon_id
      and p.ativo
      and ps.ativo
    group by ps.dia_semana, h.hora
  ),
  ocupados as (
    select
      extract(dow from a.data_hora_inicio at time zone v_fuso)::int as dow,
      extract(hour from a.data_hora_inicio at time zone v_fuso)::int as hora,
      count(*)::numeric / 4 as por_semana
    from appointments a
    where a.salon_id = p_salon_id
      and a.status <> 'cancelado'
      and a.data_hora_inicio >= now() - interval '28 days'
      and a.data_hora_inicio < now()
    group by 1, 2
  )
  select
    c.dow,
    c.hora,
    c.barbeiros,
    round(coalesce(o.por_semana, 0), 2),
    round(coalesce(o.por_semana, 0) / c.barbeiros, 3)
  from capacidade c
  left join ocupados o on o.dow = c.dow and o.hora = c.hora
  where c.barbeiros > 0
  order by coalesce(o.por_semana, 0) / c.barbeiros asc, c.dow, c.hora
  limit p_limite;
end;
$$;
