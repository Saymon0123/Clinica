-- Convite de equipe enviado por e-mail (2026-08-25).
--
-- O fluxo era: dono cria o convite, copia o link e manda a mao pelo WhatsApp.
-- Continua podendo -- mas agora o n8n tambem envia o link por e-mail para o
-- convidado, a cada 10 minutos. Menos um trabalho para o dono, e o convite
-- nao morre se ele esquecer de mandar.
--
-- `email_enviado_em` e a fila (mesmo padrao de notificada_em): nulo = ainda
-- nao saiu. Marcar vem DEPOIS do envio, entao falha de e-mail volta a fila.

alter table public.salon_invites
  add column if not exists email_enviado_em timestamptz;

comment on column public.salon_invites.email_enviado_em is
  'Quando o e-mail com o link do convite saiu para o convidado, via n8n. Nulo = na fila.';

create view public.convites_a_enviar
with (security_invoker = on) as
select i.id, i.nome, i.email, i.token, i.role, i.expira_em,
       s.nome as barbearia
  from public.salon_invites i
  join public.salons s on s.id = i.salon_id
 where i.usado_em is null
   and i.email_enviado_em is null
   and i.expira_em > now();

revoke all on public.convites_a_enviar from anon, authenticated;
grant select on public.convites_a_enviar to service_role;
