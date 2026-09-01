-- 0123: congelar a composição do pacote na venda (roteiro, passo 1.2)
--
-- Achado 1 da revisão de 01/09. A view `saldo_de_pacotes` juntava
-- `pacote_itens` pelo `pacote_id` — ou seja, lia a composição ATUAL do modelo
-- para calcular o saldo de quem comprou meses atrás. Editar o pacote de 10
-- cortes para 5 fazia quem pagou por 10 passar a ter 5 (ou saldo negativo, já
-- que não havia piso). E como `NewPacoteModal` apaga e reinsere os itens ao
-- salvar, uma falha no meio deixava o pacote sem itens e o INNER JOIN sumia
-- com TODOS os saldos daquele pacote.
--
-- O cliente pagou adiantado: o que ele comprou não pode depender do que o
-- catálogo virou depois. A composição passa a ser copiada no ato da venda.

-- 1) A cópia congelada
create table if not exists public.pacote_do_cliente_itens (
  pacote_do_cliente_id uuid not null references public.pacotes_do_cliente(id) on delete cascade,
  service_id uuid not null references public.services(id),
  quantidade integer not null check (quantidade > 0),
  primary key (pacote_do_cliente_id, service_id)
);
alter table public.pacote_do_cliente_itens enable row level security;
comment on table public.pacote_do_cliente_itens is
  'O que o cliente comprou, congelado no ato da venda. Editar o modelo no Catálogo não mexe aqui — é isto que a view saldo_de_pacotes lê.';

create policy "pacote_do_cliente_itens: leitura do proprio salao"
  on public.pacote_do_cliente_itens for select
  using (exists (
    select 1 from public.pacotes_do_cliente pdc
     where pdc.id = pacote_do_cliente_id
       and pdc.salon_id in (select private.salon_ids())
  ));

-- 2) Toda venda de pacote carimba a composição vigente
create or replace function public.trg_congela_itens_do_pacote()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.pacote_do_cliente_itens (pacote_do_cliente_id, service_id, quantidade)
  select new.id, pi.service_id, pi.quantidade
    from public.pacote_itens pi
   where pi.pacote_id = new.pacote_id
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.trg_congela_itens_do_pacote() from public, anon, authenticated;
drop trigger if exists trg_congela_itens_do_pacote on public.pacotes_do_cliente;
create trigger trg_congela_itens_do_pacote
  after insert on public.pacotes_do_cliente
  for each row execute function public.trg_congela_itens_do_pacote();

-- 3) Backfill: quem já comprou fica com a composição de hoje — é a melhor
--    verdade disponível, e a partir de agora ela para de se mexer.
insert into public.pacote_do_cliente_itens (pacote_do_cliente_id, service_id, quantidade)
select pdc.id, pi.service_id, pi.quantidade
  from public.pacotes_do_cliente pdc
  join public.pacote_itens pi on pi.pacote_id = pdc.pacote_id
on conflict do nothing;

-- 4) A view passa a ler da cópia, e o restante ganha piso zero (achado 9).
--    Drop antes de recriar: a dependente sai junto e volta logo abaixo.
drop view if exists public.saldo_de_pacotes_por_telefone;
drop view if exists public.saldo_de_pacotes;

create view public.saldo_de_pacotes
with (security_invoker = on) as
select pdc.id as pacote_do_cliente_id,
       pdc.salon_id,
       pdc.client_id,
       p.nome as pacote,
       pci.service_id,
       s.nome as servico,
       pci.quantidade as contratado,
       count(pc.id)::integer as consumido,
       greatest(pci.quantidade - count(pc.id), 0)::integer as restante,
       pdc.expira_em,
       pdc.expira_em is not null and pdc.expira_em < current_date as vencido,
       pdc.comprado_em
  from public.pacotes_do_cliente pdc
  join public.pacotes p on p.id = pdc.pacote_id
  join public.pacote_do_cliente_itens pci on pci.pacote_do_cliente_id = pdc.id
  join public.services s on s.id = pci.service_id
  left join public.pacote_consumos pc
    on pc.pacote_do_cliente_id = pdc.id and pc.service_id = pci.service_id
 group by pdc.id, pdc.salon_id, pdc.client_id, p.nome, pci.service_id, s.nome,
          pci.quantidade, pdc.expira_em, pdc.comprado_em;

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

-- 5) Trava de consumo além do contratado (achado 9, parte 2). Antes, só o
--    JavaScript impedia — e a venda tem rollback, então o erro aqui é seguro.
create or replace function public.trg_nao_consumir_alem_do_pacote()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_contratado int;
  v_consumido int;
begin
  select quantidade into v_contratado
    from public.pacote_do_cliente_itens
   where pacote_do_cliente_id = new.pacote_do_cliente_id and service_id = new.service_id;

  if v_contratado is null then
    raise exception 'Esse serviço não faz parte do pacote comprado.' using errcode = '23514';
  end if;

  select count(*) into v_consumido
    from public.pacote_consumos
   where pacote_do_cliente_id = new.pacote_do_cliente_id and service_id = new.service_id;

  if v_consumido >= v_contratado then
    raise exception 'Esse pacote não tem mais crédito deste serviço.' using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.trg_nao_consumir_alem_do_pacote() from public, anon, authenticated;
drop trigger if exists trg_nao_consumir_alem_do_pacote on public.pacote_consumos;
create trigger trg_nao_consumir_alem_do_pacote
  before insert on public.pacote_consumos
  for each row execute function public.trg_nao_consumir_alem_do_pacote();
