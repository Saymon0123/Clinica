-- Reativacao: chamar de volta quem sumiu.
--
-- **O custo muda tudo aqui.** "Faz tempo que voce nao vem" e categoria
-- MARKETING na Meta -- e continua sendo mesmo sem desconto nenhum, porque a
-- classificacao e por INTENCAO (reengajamento), nao por conteudo. Uma mensagem
-- dessas custa ~R$ 0,35 contra ~R$ 0,04 de um lembrete.
--
-- Na conta do produto, que cobra por agendamento: chamar 100 dormentes custa
-- ~R$ 35; se voltarem 5, sao R$ 3,00 de receita. Por isso a lista e estreita de
-- proposito, e por isso ha trava de repeticao.
--
-- E ha um risco pior que o dinheiro: marketing tem vigilancia de qualidade. Se
-- muita gente bloquear, a nota do numero cai e isso estrangula os LEMBRETES,
-- que sao o que de fato reduz falta.

alter table public.salons
  add column if not exists reativacao_dias integer not null default 0;

comment on column public.salons.reativacao_dias is
  'Dias sem aparecer para o cliente entrar na lista de reativacao. Zero desliga. Cada mensagem dessas e categoria MARKETING na Meta (~R$ 0,35, quase dez vezes um lembrete), entao o numero aqui e decisao de custo, nao so de saudade.';

create table if not exists public.reativacao_envios (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create index if not exists reativacao_envios_cliente_idx
  on public.reativacao_envios (client_id, criado_em desc);

alter table public.reativacao_envios enable row level security;

drop policy if exists "equipe le os envios da sua barbearia" on public.reativacao_envios;
create policy "equipe le os envios da sua barbearia"
  on public.reativacao_envios for all
  using (salon_id in (select private.salon_ids()))
  with check (salon_id in (select private.salon_ids()));

comment on table public.reativacao_envios is
  'Quando cada cliente foi chamado de volta. Trava para nao repetir mensagem de marketing: repeticao custa caro E aumenta bloqueio, que derruba a nota do numero e estrangula os lembretes.';

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
  -- Na ordem exata dos {{n}} do template. Errar a ordem manda o nome da
  -- barbearia no lugar do tempo sem vir.
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
-- So sai o que a Meta ja aprovou.
join public.whatsapp_templates t
  on t.chave = 'reativacao' and t.status = 'aprovado' and t.ativo
where not c.recusou_contato
  and (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) >= cfg.reativacao_dias
  and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
  -- Quem ja tem horario marcado nao precisa ser chamado de volta.
  and not exists (
    select 1 from public.appointments a2
     where a2.client_id = c.id
       and a2.status in ('agendado', 'confirmado')
       and a2.data_hora_inicio > now()
  )
  -- Nao repetir antes de passar de novo o mesmo tempo de ausencia.
  and not exists (
    select 1 from public.reativacao_envios re
     where re.client_id = c.id
       and re.criado_em > now() - make_interval(days => cfg.reativacao_dias)
  );

comment on view public.clientes_para_reativar is
  'Clientes que ficaram tempo demais sem vir e podem ser chamados de volta, com template e parametros prontos. So aparece com o template APROVADO na Meta, com WhatsApp aberto, plano com automacao, sem opt-out, sem horario futuro e sem envio recente.';
