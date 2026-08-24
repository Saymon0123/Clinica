-- A lista de clientes ganha a coluna que o dono mais precisa: quem sumiu
-- (2026-08-25). "Ultima visita" = ultimo agendamento CONCLUIDO do cliente.
--
-- View com security_invoker: a RLS de clients e appointments decide o que cada
-- papel enxerga -- o barbeiro ve so os clientes dele, com as visitas dele.

create view public.clientes_com_ultima_visita
with (security_invoker = on) as
select c.id, c.salon_id, c.nome, c.telefone, c.aniversario, c.observacao, c.created_at,
       (select max(a.data_hora_inicio)
          from public.appointments a
         where a.client_id = c.id
           and a.status = 'concluido') as ultima_visita
  from public.clients c;

grant select on public.clientes_com_ultima_visita to authenticated, service_role;
