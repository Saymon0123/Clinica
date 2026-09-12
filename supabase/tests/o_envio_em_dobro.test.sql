-- O envio em dobro (migration 0163 — achado M12).
--
-- Duas execuções sobrepostas do mesmo fluxo liam as mesmas linhas e mandavam a
-- mesma mensagem duas vezes. Na reativação isso não era só incômodo: cada envio
-- soma 1 em `reativacao_sem_resposta`, e a pausa dispara em 2 — o cliente que
-- respondeu normalmente era silenciado por um defeito nosso.
--
-- Concorrência de verdade não cabe numa transação de teste. O que cabe — e é o
-- que importa — é a propriedade em que ela se resolve: **chamar a reserva duas
-- vezes devolve a linha uma vez só**. Duas execuções ao mesmo tempo são exatamente
-- isso, serializadas pelo lock do UPDATE.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

-- A janela de silêncio não pode decidir o resultado: aqui ela fica aberta, e
-- quem a testa é o `cadeira_certa_e_hora_certa`. A troca some no rollback.
create or replace function private.hora_de_falar(p_quando timestamptz default now())
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$ select true $$;

\set salao    'ffff9000-0000-0000-0000-000000000001'
\set barbeiro 'ffff9001-0000-0000-0000-000000000001'
\set servico  'ffff9003-0000-0000-0000-000000000001'
\set cli_av   'ffff9002-0000-0000-0000-000000000001'
\set cli_re   'ffff9002-0000-0000-0000-000000000002'
\set comanda  'ffff9004-0000-0000-0000-000000000001'
\set reserva  'ffff9005-0000-0000-0000-000000000001'

insert into salons (id, nome, horario_funcionamento) values
  (:'salao', 'Fila Sem Dobro',
   '{"dom":{"abre":"00:00","fecha":"23:59"},"seg":{"abre":"00:00","fecha":"23:59"},"ter":{"abre":"00:00","fecha":"23:59"},"qua":{"abre":"00:00","fecha":"23:59"},"qui":{"abre":"00:00","fecha":"23:59"},"sex":{"abre":"00:00","fecha":"23:59"},"sab":{"abre":"00:00","fecha":"23:59"}}'::jsonb);

insert into subscriptions (salon_id, status, acesso_ate) values (:'salao', 'ativa', current_date + 90);
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Joao', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'servico', :'salao', 'Corte', 30, 50, true);
insert into clients (id, salon_id, nome, telefone) values
  (:'cli_av', :'salao', 'Cliente Avaliacao', '41999990001'),
  (:'cli_re', :'salao', 'Cliente Reativacao', '41999990002');

insert into remetentes_oficiais (phone_number_id, rotulo, ativo)
values ('teste-0163', 'Teste', true) on conflict (phone_number_id) do nothing;
insert into whatsapp_templates (chave, nome_meta, idioma, categoria, corpo, status, ativo)
values ('avaliacao_pos_atendimento', 'avaliacao_pos_atendimento', 'pt_BR', 'utility',
        'Oi, {{1}}! Como foi na *{{2}}*?', 'aprovado', true)
on conflict (chave) do update set status = 'aprovado', ativo = true;

insert into orders (id, salon_id, client_id, professional_id, status, closed_at)
values (:'comanda', :'salao', :'cli_av', :'barbeiro', 'fechada', now() - interval '3 hours');
insert into order_items (order_id, tipo, service_id, quantidade, preco_unitario)
values (:'comanda', 'servico', :'servico', 1, 50);

insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem)
values (:'reserva', :'salao', :'cli_re', :'barbeiro', :'servico',
        now() + interval '10 hours', now() + interval '10 hours 30 minutes',
        'agendado', 'reativacao');

-- ---------------------------------------------------------------------------
-- A avaliação
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from avaliacoes_a_pedir where order_id = :'comanda'),
  1,
  'antes de reservar, a comanda esta na fila'
);

select is(
  (select count(*)::int from reservar_avaliacoes(50) where order_id = :'comanda'),
  1,
  'a primeira execucao reserva e recebe a comanda'
);

-- O coração do teste: a segunda execução é a que mandava a mensagem repetida.
select is(
  (select count(*)::int from reservar_avaliacoes(50) where order_id = :'comanda'),
  0,
  'a segunda execucao nao recebe a mesma comanda — e este e o envio em dobro que sumiu'
);

select is(
  (select count(*)::int from avaliacoes_a_pedir where order_id = :'comanda'),
  0,
  'e a fila tambem para de mostra-la enquanto a reserva vale'
);

-- O prazo é o que faz uma execução que morreu devolver a linha sozinha, em vez
-- de travá-la para sempre.
update orders set envio_reservado_ate = now() - interval '1 minute' where id = :'comanda';

select is(
  (select count(*)::int from avaliacoes_a_pedir where order_id = :'comanda'),
  1,
  'vencida a reserva, a comanda volta para a fila sozinha'
);

-- ---------------------------------------------------------------------------
-- A reativação — onde o dobro não era so incomodo
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from reservar_reativacoes(50) where appointment_id = :'reserva'),
  1,
  'a primeira execucao reserva e recebe o convite'
);

select is(
  (select count(*)::int from reservar_reativacoes(50) where appointment_id = :'reserva'),
  0,
  'a segunda nao recebe o mesmo convite'
);

-- Reservar não é enviar. Se a reserva mexesse neste contador, ela sozinha
-- pausaria o cliente na segunda rodada — trocando um defeito por outro.
select is(
  (select reativacao_sem_resposta from clients where id = :'cli_re'),
  0,
  'reservar nao mexe no contador de sem-resposta: quem soma e o envio, nao a reserva'
);

-- ---------------------------------------------------------------------------
-- Quem pode chamar
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.reservar_reativacoes(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.reservar_reativacoes(integer)', 'execute')
  and has_function_privilege('service_role', 'public.reservar_reativacoes(integer)', 'execute'),
  'so o n8n (service_role) reserva: nem a equipe logada, nem quem nao esta'
);

select * from finish();
rollback;
