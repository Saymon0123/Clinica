-- Canal do dono da barbearia para quem faz o produto.
--
-- Até aqui, **todo defeito encontrado veio de nós testando**. Isso não escala e
-- não cobre o que só quem usa de verdade percebe: o dono repete um caminho
-- cinquenta vezes por semana e sente atrito onde ninguém pensaria em procurar.
--
-- O texto sozinho não serve para agir ("não gostei da agenda"). O que torna o
-- feedback acionável é o contexto gravado junto — quem é, qual plano, quantos
-- barbeiros e **em que tela estava**. "Não achei o botão" só faz sentido com a
-- tela ao lado.
--
-- Acesso: qualquer pessoa autenticada da barbearia **escreve**, e ninguém lê
-- pelo CRM — nem quem escreveu. Isso é canal com o fornecedor, não ferramenta
-- interna da barbearia: gerente não deve ler o que o dono escreveu sobre o
-- produto, e o dono não deve ver o de outra unidade. A leitura é pelo painel do
-- Supabase e pelo n8n, que usam `service_role`.

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('sugestao', 'problema', 'elogio')),
  mensagem text not null check (length(trim(mensagem)) > 0),
  -- Rota do CRM onde a pessoa estava ao escrever.
  rota text,
  -- Preenchido pelo n8n quando o aviso chega até o dono do produto. Sem isto,
  -- ou a notificação se repete para sempre, ou some se o fluxo falhar no meio.
  notificado_em timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.feedbacks is
  'Sugestoes e problemas relatados pelos donos de barbearia. Escrita liberada a quem e da barbearia; leitura so por service_role -- e canal com o fornecedor, nao ferramenta interna.';

-- O n8n varre por aqui a cada rodada: sem índice, varredura na tabela inteira.
create index if not exists feedbacks_pendentes_idx
  on public.feedbacks (created_at)
  where notificado_em is null;

alter table public.feedbacks enable row level security;

-- Escrever: só em barbearia de que a pessoa participa, e só em nome dela
-- própria. Sem o `with check` do user_id, daria para atribuir a mensagem a
-- outro usuário.
create policy "feedbacks: membro escreve"
  on public.feedbacks for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_salons us
      where us.salon_id = feedbacks.salon_id
        and us.user_id = (select auth.uid())
    )
  );

-- Nenhuma policy de SELECT, UPDATE ou DELETE: pelo CRM ninguém lê nem apaga.
-- `service_role` ignora RLS e é por onde o n8n e o painel leem.
revoke all on public.feedbacks from anon, authenticated;
grant insert on public.feedbacks to authenticated;
