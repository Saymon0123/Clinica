-- Quem participa da fidelidade, com que meta, e por quanto tempo o carimbo vale.
--
-- A `0072` deixou a fidelidade valendo para todo cliente da barbearia, sem
-- excecao. Isso tira do barbeiro a decisao que e dele: fidelidade e cortesia,
-- nao direito, e 1 corte gratis a cada 10 e 10% de desconto no livro inteiro.
--
-- **Padrao na barbearia, excecao na ficha** -- a mesma forma de `recursos` +
-- `recursos_do_salao`, um nivel abaixo. Com um mecanismo so cabem os dois
-- mundos: "todos, menos o fulano" e "so os meus fieis".
--
-- **Nulo em `clients.fidelidade_participa` significa 'segue o padrao', e e o
-- valor inicial de proposito.** O caminho obvio seria exigir que o barbeiro
-- marcasse cliente por cliente -- e ele esqueceria. No meio do corte, com o
-- proximo esperando, ninguem abre ficha para marcar cadastro. O cliente ouviria
-- "voce esta no cartao", voltaria na decima vez e nao teria carimbo nenhum, que
-- e pior do que nunca ter oferecido. Controle total com atrito alto vira
-- funcionalidade morta.
--
-- **O ajuste manual e o que faz a fidelidade nascer.** No dia em que o dono liga
-- a chave, os clientes ja tem cartao de papel no bolso com seis, sete carimbos.
-- Comecar todo mundo do zero significa brigar com a clientela inteira no
-- primeiro dia. Como os carimbos sao contados, somar por ajuste e a forma
-- honesta -- forjar uma venda sujaria financeiro e comissao.

alter table public.salons
  add column if not exists fidelidade_padrao_todos boolean not null default true,
  add column if not exists fidelidade_validade_meses integer not null default 0;

comment on column public.salons.fidelidade_padrao_todos is
  'Padrao da barbearia: true = todo cliente participa da fidelidade, false = so quem for marcado na ficha. A ficha do cliente sobrescreve.';
comment on column public.salons.fidelidade_validade_meses is
  'Meses que um carimbo vale. Zero = nunca vence.';

alter table public.clients
  add column if not exists fidelidade_participa boolean,
  add column if not exists fidelidade_a_cada integer;

comment on column public.clients.fidelidade_participa is
  'Excecao ao padrao da barbearia. NULO = segue o padrao, true = dentro, false = fora.';
comment on column public.clients.fidelidade_a_cada is
  'Meta individual. NULO = usa a da barbearia. E a moeda de troca do balcao: "pra voce eu faco a cada 8".';

create table if not exists public.fidelidade_ajustes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Negativo tira. Serve para desfazer engano sem apagar historico.
  carimbos integer not null check (carimbos <> 0),
  motivo text not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create index if not exists fidelidade_ajustes_cliente_idx
  on public.fidelidade_ajustes (client_id, criado_em desc);

alter table public.fidelidade_ajustes enable row level security;

drop policy if exists "equipe cuida dos ajustes da sua barbearia" on public.fidelidade_ajustes;
create policy "equipe cuida dos ajustes da sua barbearia"
  on public.fidelidade_ajustes for all
  using (salon_id in (select private.salon_ids()))
  with check (salon_id in (select private.salon_ids()));

comment on table public.fidelidade_ajustes is
  'Carimbos somados ou tirados a mao, com motivo e autor. Existe para migrar cartao de papel e consertar engano sem forjar venda -- venda falsa sujaria financeiro e comissao.';
