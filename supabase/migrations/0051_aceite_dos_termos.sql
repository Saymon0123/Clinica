-- Registro do aceite dos termos.
--
-- Contrato de software não exige forma específica (CC, art. 104 e 107): o
-- clique é um contrato de adesão válido. O que falta numa disputa não é o
-- termo — é a **prova** de que aquela pessoa aceitou **aquele texto**.
--
-- É isso que esta tabela guarda. Sem ela existe o documento e não existe o
-- aceite, que é o mesmo que não ter nada.
--
-- Quatro campos fazem o trabalho:
--
-- - `versao`: por isso o texto é versionado. Sem ela, mudar os termos
--   reescreveria retroativamente o que todo mundo aceitou, e o registro
--   passaria a apontar para um texto que ninguém leu.
-- - `ip` e `user_agent`: lidos no servidor, do cabeçalho da requisição. Se
--   viessem do formulário, quem aceita escolheria o que registrar.
-- - `aceito_em`: gravado pelo banco, não pelo cliente.

create table if not exists public.termos_aceites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salon_id uuid references public.salons(id) on delete set null,
  versao text not null,
  ip text,
  user_agent text,
  aceito_em timestamptz not null default now()
);

comment on table public.termos_aceites is
  'Prova do aceite dos termos: quem, quando, de onde e QUAL VERSAO do texto. Insert-only -- registro alterado nao prova nada.';

comment on column public.termos_aceites.versao is
  'Versao do texto aceito. Trocar os termos NAO reescreve aceites antigos: cria uma versao nova, que precisa ser aceita de novo.';

create index if not exists idx_termos_aceites_user on public.termos_aceites (user_id, aceito_em desc);

alter table public.termos_aceites enable row level security;

-- O titular enxerga o próprio aceite — é direito dele saber o que aceitou e
-- quando. Ninguém escreve pelo navegador: quem grava é a edge function, com
-- `service_role`, no momento em que a conta é criada.
--
-- Sem policy de update nem de delete de propósito. Registro de aceite que pode
-- ser alterado depois não serve como prova, e um `delete` acidental apagaria
-- justamente o que se quer demonstrar.
create policy "termos_aceites: titular le o proprio" on public.termos_aceites
  for select using (user_id = auth.uid());

revoke all on public.termos_aceites from anon, authenticated;
grant select on public.termos_aceites to authenticated;
grant select, insert on public.termos_aceites to service_role;
