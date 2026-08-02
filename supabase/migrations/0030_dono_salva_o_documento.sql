-- O dono precisa gravar o CPF/CNPJ na tela de Assinatura, e não conseguia:
-- `subscriptions` só tinha policy de SELECT. Sem policy de UPDATE o PostgREST
-- atualiza zero linhas e responde 204 **sem erro** — a tela dizia "Salvo" e o
-- campo voltava vazio, sem nada indicando o motivo.
--
-- Só que liberar UPDATE por RLS não basta, porque RLS é por linha, não por
-- coluna: com a policy sozinha o dono poderia mandar status='ativa' e
-- acesso_ate='2099-01-01' pelo navegador e usar o CRM de graça para sempre.
-- Quem decide esses campos é o webhook do Asaas, com service_role.
--
-- Por isso são duas travas: a policy diz *quais linhas*, e o grant de coluna
-- diz *quais campos*. Uma sem a outra não protege.

revoke update on public.subscriptions from authenticated, anon;
grant update (cpf_cnpj) on public.subscriptions to authenticated;

create policy "subscriptions: dono salva o documento"
  on public.subscriptions for update
  to authenticated
  using (
    exists (
      select 1 from public.user_salons us
      where us.salon_id = subscriptions.salon_id
        and us.user_id = (select auth.uid())
        and us.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.user_salons us
      where us.salon_id = subscriptions.salon_id
        and us.user_id = (select auth.uid())
        and us.role = 'owner'
    )
  );
