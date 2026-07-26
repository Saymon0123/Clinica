-- Corrige o cadastro de cliente pelo funcionário (barbeiro).
--
-- Sintoma: barbeiro logado não conseguia criar agendamento. O app faz
-- `insert(...).select('id').single()`, que vira `INSERT ... RETURNING`.
-- O Postgres aplica a policy de SELECT sobre a linha recém-inserida, e a
-- policy chamava private.my_client_ids() — função STABLE que lê a própria
-- tabela clients e portanto enxerga o snapshot do início do statement, onde
-- a linha nova ainda não existe. Resultado: 42501 (RLS violation).
-- O dono não era afetado porque private.is_manager() curto-circuita antes.
--
-- Correção: avaliar `created_by = auth.uid()` diretamente na policy. Isso é
-- lido da própria linha NEW, sem depender do snapshot. Não amplia acesso:
-- my_client_ids() já inclui exatamente esse conjunto.

drop policy if exists "clients: leitura conforme papel" on clients;

create policy "clients: leitura conforme papel" on clients
  for select using (
    salon_id in (select private.salon_ids())
    and (
      private.is_manager(salon_id)
      or created_by = (select auth.uid())
      or id in (select private.my_client_ids())
    )
  );
