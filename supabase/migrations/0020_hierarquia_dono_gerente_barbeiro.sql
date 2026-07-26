-- Hierarquia dono / gerente / barbeiro.
--
-- O barbeiro passa a poder ACRESCENTAR serviços ao catálogo, mas nunca
-- apagar nem alterar o que o dono ou o gerente cadastraram. Para isso o
-- serviço precisa saber quem o criou.

alter table services add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Serviços que já existiam são do gestor: created_by fica nulo e, pelas
-- políticas abaixo, o barbeiro não consegue mexer neles.

create index if not exists services_created_by_idx on services (created_by);

-- Leitura continua igual: todo membro do salão enxerga o catálogo inteiro.

-- Gestor (dono/gerente) mantém controle total.
drop policy if exists "services: gestor gerencia" on services;
create policy "services: gestor gerencia" on services
  for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

-- Barbeiro cadastra serviço novo no próprio salão.
drop policy if exists "services: barbeiro acrescenta" on services;
create policy "services: barbeiro acrescenta" on services
  for insert
  with check (salon_id in (select private.salon_ids()));

-- Barbeiro só edita/apaga o que ele mesmo criou. `created_by` é lido da
-- linha, sem passar por função STABLE — do contrário o INSERT ... RETURNING
-- falharia igual ao caso de clients (ver migration 0019).
drop policy if exists "services: barbeiro mexe no proprio" on services;
create policy "services: barbeiro mexe no proprio" on services
  for update
  using (salon_id in (select private.salon_ids()) and created_by = (select auth.uid()))
  with check (salon_id in (select private.salon_ids()) and created_by = (select auth.uid()));

drop policy if exists "services: barbeiro apaga o proprio" on services;
create policy "services: barbeiro apaga o proprio" on services
  for delete
  using (salon_id in (select private.salon_ids()) and created_by = (select auth.uid()));

-- O SELECT precisa enxergar a linha recém-inserida pelo barbeiro para que
-- `insert().select()` funcione. A policy de leitura já cobre (salão inteiro).
