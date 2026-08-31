-- 0118: trio da realidade do balcão (itens 14, 12 e 16)
--
-- 14) O agente pode responder saldo de pacote: view consultável por telefone
--     (a identidade no WhatsApp É o número). O agente só fala número que veio
--     desta view — nunca de memória.
-- 12) Cancelar/remarcar pela página pública: cada agendamento ganha um token
--     de gestão impossível de adivinhar. O link vai para quem marcou; cancelar
--     exige o token daquele agendamento — não é porta aberta na rua.
-- 16) Avaliação pós-atendimento: pedida PELO NÚMERO DA BARBEARIA (Evolution),
--     sem template, sem janela, sem custo Meta. Nota 5 → link do Google;
--     nota baixa → alerta ao dono. No máximo 1 pedido por cliente a cada
--     8 semanas — pesquisa repetida é o caminho do bloqueio.

-- ------------------------------------------------------------------
-- 14) Saldo por telefone
-- ------------------------------------------------------------------
drop view if exists public.saldo_de_pacotes_por_telefone;
create view public.saldo_de_pacotes_por_telefone
with (security_invoker = on) as
select c.salon_id,
       c.telefone_norm,
       split_part(c.nome, ' ', 1) as cliente,
       s.pacote,
       s.servico,
       s.restante,
       s.expira_em,
       s.vencido
  from public.saldo_de_pacotes s
  join public.clients c on c.id = s.client_id;

-- ------------------------------------------------------------------
-- 12) Token de gestão do agendamento
-- ------------------------------------------------------------------
alter table public.appointments
  add column if not exists token_gestao uuid not null default gen_random_uuid();
create unique index if not exists idx_appointments_token_gestao
  on public.appointments (token_gestao);

-- ------------------------------------------------------------------
-- 16) Avaliações
-- ------------------------------------------------------------------
alter table public.salons
  add column if not exists google_review_url text;
alter table public.clients
  add column if not exists avaliacao_pedida_em timestamptz;

create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  nota smallint not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamptz not null default now()
);
alter table public.avaliacoes enable row level security;
create policy "avaliacoes: membros leem as do proprio salao"
  on public.avaliacoes for select
  using (salon_id in (select private.salon_ids()));
comment on table public.avaliacoes is
  'Notas pós-atendimento coletadas pelo agente no WhatsApp. INSERT só via service_role (ferramenta do agente no n8n).';
create index if not exists idx_avaliacoes_salon on public.avaliacoes (salon_id, criado_em);

-- Fila de pedidos: comanda fechada entre 2h e 26h atrás, cliente contactável,
-- sem pedido nas últimas 8 semanas, e barbearia com o canal de conversa
-- (Evolution) de pé — o pedido sai pelo número da barbearia.
drop view if exists public.avaliacoes_a_pedir;
create view public.avaliacoes_a_pedir
with (security_invoker = on) as
select o.id as order_id,
       o.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       '55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') as destino,
       ca.instance_name,
       s.google_review_url
  from public.orders o
  join public.clients c on c.id = o.client_id
  join public.salons s on s.id = o.salon_id
  join public.conexoes_ativas ca
    on ca.salon_id = o.salon_id and ca.provedor = 'evolution' and ca.conectado
 where o.status = 'fechada'
   and o.closed_at between now() - interval '26 hours' and now() - interval '2 hours'
   and not c.recusou_contato
   and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
   and (c.avaliacao_pedida_em is null or c.avaliacao_pedida_em < now() - interval '8 weeks');

-- O n8n marca o pedido no envio (mesmo padrão dos demais fluxos)
create or replace function public.marcar_avaliacao_pedida(p_client_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.clients set avaliacao_pedida_em = now() where id = p_client_id;
$$;
revoke all on function public.marcar_avaliacao_pedida(uuid) from public, anon, authenticated;
