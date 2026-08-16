-- Chave de funcionalidade por barbearia.
--
-- Hoje "publicar" significa publicar **para todas as barbearias ao mesmo
-- tempo, ao vivo**: um banco, um conjunto de edge functions e um único fluxo
-- do n8n servem todo mundo. Não existe versão do software por cliente.
--
-- Enquanto só havia barbearias de teste, isso era aceitável. Com clientes
-- pagando, cada entrega da v2 vira uma aposta com o negócio deles.
--
-- Isto transforma "lançar" em "ligar para uma barbearia, olhar, ligar para as
-- outras". O modelo é o mesmo que o gating de plano já usa
-- (`salons_com_automacao`), generalizado: **a decisão mora no banco**, e quem
-- consulta — CRM, edge function ou n8n — pergunta em vez de repetir a regra.
--
-- Duas tabelas, e a divisão é o que faz o desenho funcionar:
--
-- - `recursos` é o catálogo, com o **padrão global**. Terminado o lançamento,
--   vira `padrao = true` e ninguém precisa de linha nenhuma.
-- - `recursos_do_salao` são as **exceções**. Durante o lançamento é onde
--   ficam os poucos que já têm; depois, onde fica quem pediu para não ter.
--
-- Sem o padrão global, ligar um recurso para todos exigiria uma linha por
-- barbearia — e a que fosse criada depois nasceria sem.

create table if not exists public.recursos (
  chave text primary key,
  nome text not null,
  descricao text,
  -- Falso por padrão: recurso novo nasce desligado para todo mundo. Ligar é
  -- uma decisão explícita; esquecer não liga nada para ninguém.
  padrao boolean not null default false,
  criado_em timestamptz not null default now()
);

comment on table public.recursos is
  'Catalogo de funcionalidades que podem ser ligadas por barbearia, com o padrao global de cada uma.';

comment on column public.recursos.padrao is
  'Vale para quem NAO tem linha em recursos_do_salao. Terminado o lancamento, vira true e as excecoes podem ser apagadas.';

create table if not exists public.recursos_do_salao (
  salon_id uuid not null references public.salons(id) on delete cascade,
  recurso text not null references public.recursos(chave) on delete cascade,
  ativo boolean not null,
  -- Por que esta barbearia é exceção. Sem isto, seis meses depois ninguém
  -- sabe se a linha é de um lançamento em andamento ou de um pedido do dono —
  -- e aí ninguém tem coragem de apagar.
  motivo text,
  criado_em timestamptz not null default now(),
  primary key (salon_id, recurso)
);

comment on table public.recursos_do_salao is
  'Excecoes ao padrao global: quem tem (ou nao tem) um recurso independente do padrao.';

-- A resposta pronta: uma linha por barbearia e recurso, com o padrão já
-- resolvido contra a exceção.
--
-- Quem consulta nunca precisa saber que existem duas tabelas — e é por isso
-- que a regra não vaza para o CRM nem para o n8n.
create or replace view public.recursos_ativos
with (security_invoker = on) as
select s.id as salon_id,
       r.chave as recurso,
       coalesce(e.ativo, r.padrao) as ativo
from public.salons s
cross join public.recursos r
left join public.recursos_do_salao e on e.salon_id = s.id and e.recurso = r.chave;

comment on view public.recursos_ativos is
  'Quais recursos cada barbearia tem, com a excecao ja resolvida contra o padrao global. E daqui que CRM, edge functions e n8n devem perguntar.';

-- Atalho para usar dentro de outra view ou policy, onde um join extra
-- atrapalharia a leitura.
create or replace function private.tem_recurso(p_salon_id uuid, p_recurso text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select e.ativo from public.recursos_do_salao e
      where e.salon_id = p_salon_id and e.recurso = p_recurso),
    (select r.padrao from public.recursos r where r.chave = p_recurso),
    false  -- recurso que não existe no catálogo é falso, nunca erro
  );
$$;

comment on function private.tem_recurso(uuid, text) is
  'Resolve excecao contra padrao global. Recurso inexistente devolve falso -- errar o nome de uma chave nao pode LIGAR uma funcionalidade.';

alter table public.recursos enable row level security;
alter table public.recursos_do_salao enable row level security;

-- O dono enxerga o que a própria barbearia tem: é o que permite a tela
-- esconder o que ainda não foi liberado, sem inventar a regra do lado dela.
-- Escrita é só pelo painel administrativo, via service_role.
create policy "recursos: leitura para autenticados" on public.recursos
  for select using (true);

create policy "recursos_do_salao: le o da propria barbearia" on public.recursos_do_salao
  for select using (salon_id in (select private.salon_ids()));

revoke all on public.recursos, public.recursos_do_salao, public.recursos_ativos from anon;
grant select on public.recursos, public.recursos_do_salao, public.recursos_ativos to authenticated;
grant select, insert, update, delete on public.recursos, public.recursos_do_salao to service_role;
grant select on public.recursos_ativos to service_role;
revoke execute on function private.tem_recurso(uuid, text) from anon, authenticated;
grant execute on function private.tem_recurso(uuid, text) to service_role;
