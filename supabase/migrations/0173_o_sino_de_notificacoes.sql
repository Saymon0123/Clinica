-- 0173: o sino de notificações — o aviso que passou continua legível.
--
-- O QUE ISTO DESTRAVA. Hoje o cartão de "Novo agendamento" vive quinze
-- segundos e morre; o aviso de cancelamento fica preso na tela da Agenda; e o
-- que chegou enquanto o dono cortava cabelo simplesmente passou. O pedido do
-- dono (14/09): poder olhar DEPOIS o que chegou antes.
--
-- O DESENHO: derivar, não duplicar. As notificações são uma LEITURA de
-- `appointments` — nada é gravado quando um evento acontece, então não existe
-- "esqueceu de gravar a notificação" nem dessincronia entre a lista e a
-- agenda. Três eventos, os mesmos que hoje geram aviso efêmero:
--
--   novo_horario  cliente marcou sozinho (agente ou QR)      → created_at
--   cancelou      cliente cancelou sozinho                    → cancelado_em
--   remarcou      cliente mudou o horário sozinho             → remarcado_pelo_cliente_em
--
-- O que o dono fez ele mesmo (origem 'crm') não notifica: ninguém precisa ser
-- avisado do próprio gesto. Janela de 7 dias, a mesma de
-- `cancelamentos_a_avisar`. "Pediu para falar com o dono" fica de FORA por
-- enquanto: `whatsapp_conversations` não guarda QUANDO o pedido aconteceu, só
-- o booleano — entra quando houver carimbo (anotado no backlog).
--
-- A RLS FILTRA DE GRAÇA: a view roda com as permissões de quem consulta
-- (`security_invoker`), e a política de `appointments` já mostra ao barbeiro
-- só os horários dele — o sino de cada um mostra o que é de cada um.
--
-- `notificacoes_vistas` é a única escrita: um carimbo POR USUÁRIO por salão
-- ("vi até aqui"), que vira o contador do sino. Por usuário, e não por salão:
-- o gerente ler não pode zerar o sino do dono.
--
-- O TRINCO, de novo: view e tabela novas no `public` nascem com as permissões
-- padrão do Supabase, `anon` incluso (a lição da 0171). Revogado à mão e
-- catracado em `o_sino_de_notificacoes.test.sql`.

create view public.notificacoes_do_salao
with (security_invoker = on) as
select 'novo_horario:' || a.id as chave,
       a.salon_id,
       'novo_horario'::text as tipo,
       a.created_at as evento_em,
       a.data_hora_inicio,
       a.origem,
       c.nome as cliente,
       p.nome as barbeiro,
       coalesce(
         (select string_agg(s2.nome, ' + ' order by asv.ordem)
            from public.appointment_services asv
            join public.services s2 on s2.id = asv.service_id
           where asv.appointment_id = a.id),
         s.nome
       ) as servicos
  from public.appointments a
  left join public.clients c on c.id = a.client_id
  left join public.professionals p on p.id = a.professional_id
  left join public.services s on s.id = a.service_id
 where a.origem in ('agente', 'publico')
   and a.created_at >= now() - interval '7 days'

union all

select 'cancelou:' || a.id,
       a.salon_id,
       'cancelou',
       a.cancelado_em,
       a.data_hora_inicio,
       a.origem,
       c.nome,
       p.nome,
       coalesce(
         (select string_agg(s2.nome, ' + ' order by asv.ordem)
            from public.appointment_services asv
            join public.services s2 on s2.id = asv.service_id
           where asv.appointment_id = a.id),
         s.nome
       )
  from public.appointments a
  left join public.clients c on c.id = a.client_id
  left join public.professionals p on p.id = a.professional_id
  left join public.services s on s.id = a.service_id
 where a.status = 'cancelado'
   and a.cancelado_por = 'cliente'
   and a.cancelado_em >= now() - interval '7 days'

union all

-- Remarcado e DEPOIS cancelado aparece uma vez só, como cancelamento — o
-- mesmo recorte de `cancelamentos_a_avisar` (0170).
select 'remarcou:' || a.id,
       a.salon_id,
       'remarcou',
       a.remarcado_pelo_cliente_em,
       a.data_hora_inicio,
       a.origem,
       c.nome,
       p.nome,
       coalesce(
         (select string_agg(s2.nome, ' + ' order by asv.ordem)
            from public.appointment_services asv
            join public.services s2 on s2.id = asv.service_id
           where asv.appointment_id = a.id),
         s.nome
       )
  from public.appointments a
  left join public.clients c on c.id = a.client_id
  left join public.professionals p on p.id = a.professional_id
  left join public.services s on s.id = a.service_id
 where a.status in ('agendado', 'confirmado')
   and a.remarcado_pelo_cliente_em is not null
   and a.remarcado_pelo_cliente_em >= now() - interval '7 days';

comment on view public.notificacoes_do_salao is
  'O que aconteceu sem a barbearia fazer nada, nos ultimos 7 dias: cliente marcou pelo agente/QR, cancelou ou remarcou sozinho. Derivada de appointments (nada e gravado ao acontecer); alimenta o sino do CRM. Com security_invoker, o barbeiro ve so os horarios dele.';

revoke all on public.notificacoes_do_salao from anon;
grant select on public.notificacoes_do_salao to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Até onde cada pessoa leu
-- ---------------------------------------------------------------------------

create table public.notificacoes_vistas (
  user_id uuid not null references auth.users (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  visto_em timestamptz not null default now(),
  primary key (user_id, salon_id)
);

comment on table public.notificacoes_vistas is
  'Ate quando cada usuario viu as notificacoes de cada salao. Abrir o sino grava now(); o contador e o que veio depois disso. Por usuario de proposito: o gerente ler nao zera o sino do dono.';

alter table public.notificacoes_vistas enable row level security;

-- Só a própria linha, e só em salão do qual participa.
create policy "notificacoes_vistas: so o proprio"
  on public.notificacoes_vistas
  for all
  to authenticated
  using (user_id = auth.uid() and salon_id in (select private.salon_ids()))
  with check (user_id = auth.uid() and salon_id in (select private.salon_ids()));

revoke all on public.notificacoes_vistas from anon;
grant select, insert, update on public.notificacoes_vistas to authenticated;
