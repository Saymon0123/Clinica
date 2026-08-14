-- Quatro números que dizem se o **produto** funciona — não se o código funciona.
--
-- Até aqui só existia auditoria do agente, que mede comportamento. Sem medida
-- de produto não dá para saber onde as barbearias param, e anunciar sem isso é
-- comprar aprendizado pelo preço mais caro que existe.

create or replace view public.metricas_do_produto
with (security_invoker = on) as
select
  (select count(*) from public.salons where ativo) as barbearias,

  -- Ativação de verdade: conectou o WhatsApp **E** já trocou mensagem.
  -- Conectar sem nunca receber mensagem é cadastro, não uso — contar isso como
  -- ativação seria enganar a si mesmo.
  (select count(distinct s.id)
     from public.salons s
     join public.whatsapp_conversations c on c.salon_id = s.id
     join public.whatsapp_messages m on m.conversation_id = c.id
    where s.ativo) as ativaram,

  -- Vivas: teve agendamento criado nos últimos 7 dias. É o sinal mais honesto
  -- de que alguém está usando — login não prova nada.
  (select count(distinct a.salon_id)
     from public.appointments a
    where a.created_at >= now() - interval '7 days') as vivas_7d,

  (select count(*) from public.subscriptions where status = 'trial') as em_teste,
  (select count(*) from public.subscriptions where status = 'ativa') as pagantes,
  (select count(*) from public.subscriptions where status = 'cancelada') as canceladas,

  -- O buraco entre o fim do teste e a assinatura.
  (select count(*)
     from public.subscriptions
    where acesso_ate is not null
      and acesso_ate < current_date
      and status <> 'ativa') as venceram_sem_pagar,

  -- Vazamento do passo 1 para o passo 2 do cadastro aberto: criou conta e não
  -- criou barbearia. É o número que diz se a tela do passo 2 está boa.
  (select count(*)
     from auth.users u
    where not exists (select 1 from public.user_salons us where us.user_id = u.id)) as contas_sem_barbearia,

  (select count(*) from public.whatsapp_messages where direction = 'in') as mensagens_recebidas;

comment on view public.metricas_do_produto is
  'Funil do produto: quantas barbearias existem, quantas ativaram de fato, quantas estao vivas, e onde o cadastro vaza. Uma linha so.';

revoke all on public.metricas_do_produto from anon, authenticated;
grant select on public.metricas_do_produto to service_role;
