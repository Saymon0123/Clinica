-- O pedido de dono (migration 0216).
--
-- ## O que este teste existe para impedir
--
-- **A asserção 2 é o coração.** O carimbo NÃO pode ser reescrito enquanto o
-- pedido continua de pé. `last_message_at` muda a cada mensagem, e o cliente
-- que está esperando manda "oi?", "alguém aí?" — exatamente ele. Se cada
-- mensagem re-carimbasse, o prazo da devolução reiniciaria junto e o agente
-- nunca voltaria: quem mais precisa da rede seria o único a nunca cair nela.
--
-- **A 5 é o trinco que o ensaio pegou.** A view recriada com `drop` + `create`
-- NASCE com `select` para `anon` pelo padrão do schema, mesmo a antiga nunca
-- tendo tido. Sem o `revoke`, a migration sairia com grants diferentes dos que
-- entraram — a deriva que a regra da casa existe para pegar.
--
-- **A 8 protege quem assumiu a conversa de verdade.** Dono que pausou o agente
-- à mão (sem pedido do cliente) não pode ser atropelado pelo cron: ele está
-- conversando, e o robô voltar por cima seria pior que o problema original.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(10);

\set salao 'dddd0216-0000-0000-0000-000000000001'
\set c_antigo 'dddd0216-0001-0000-0000-000000000001'
\set c_recente 'dddd0216-0001-0000-0000-000000000002'
\set c_manual 'dddd0216-0001-0000-0000-000000000003'

insert into salons (id, nome, ativo) values (:'salao', 'Barbearia do Pedido', true);

insert into whatsapp_conversations (id, salon_id, contact_phone, contact_name)
values (:'c_antigo', :'salao', '5541977770401', 'Quem Esperou');

-- 1: nasce sem carimbo.
select is(
  (select needs_human_em from whatsapp_conversations where id = :'c_antigo'),
  null::timestamptz,
  'conversa nova nao tem carimbo de pedido'
);

update whatsapp_conversations
   set needs_human = true, agent_paused = true,
       resumo_contexto = 'Cliente desde marco. Quer saber se a barbearia faz progressiva.'
 where id = :'c_antigo';

-- Puxa o carimbo para tras para o prazo ja ter vencido, e so DEPOIS manda
-- outra mensagem -- que e o caso real de quem esta esperando resposta.
update whatsapp_conversations set needs_human_em = now() - interval '45 minutes'
 where id = :'c_antigo';
update whatsapp_conversations set last_message_at = now(), last_message_preview = 'alguem ai?'
 where id = :'c_antigo';

-- 2: o CORACAO. Mensagem nova nao reinicia o prazo.
select ok(
  (select needs_human_em from whatsapp_conversations where id = :'c_antigo')
    < now() - interval '40 minutes',
  'mensagem nova NAO re-carimba o pedido -- senao o prazo da devolucao nunca vence'
);

-- 3 e 4: a view enxerga o pedido, e sem horario inventado.
select is(
  (select detalhe from notificacoes_do_salao
    where tipo = 'pediu_dono' and salon_id = :'salao'),
  'Cliente desde marco. Quer saber se a barbearia faz progressiva.',
  'o sino carrega o resumo que o agente escreveu'
);

select is(
  (select data_hora_inicio from notificacoes_do_salao
    where tipo = 'pediu_dono' and salon_id = :'salao'),
  null::timestamptz,
  'pedido de dono nao tem horario de atendimento -- e a view nao inventa um'
);

-- 5: o trinco que o ensaio pegou.
select ok(
  has_table_privilege('authenticated', 'public.notificacoes_do_salao', 'select')
  and not has_table_privilege('anon', 'public.notificacoes_do_salao', 'select'),
  'o sino e do dono logado -- anon nao le, mesmo a view tendo sido recriada'
);

-- 6, 7 e 8: a devolucao escolhe a dedo.
insert into whatsapp_conversations (id, salon_id, contact_phone, contact_name,
                                    needs_human, agent_paused, needs_human_em)
values (:'c_recente', :'salao', '5541977770402', 'Acabou de Pedir', true, true, now() - interval '5 minutes');

insert into whatsapp_conversations (id, salon_id, contact_phone, contact_name,
                                    needs_human, agent_paused)
values (:'c_manual', :'salao', '5541977770403', 'Dono Assumiu', false, true);

select is(
  devolver_conversas_sem_dono(30),
  1,
  'so o pedido vencido volta para o agente'
);

select is(
  (select agent_paused from whatsapp_conversations where id = :'c_recente'),
  true,
  'quem pediu ha pouco continua esperando a pessoa -- o prazo nao venceu'
);

select is(
  (select agent_paused from whatsapp_conversations where id = :'c_manual'),
  true,
  'conversa que o dono assumiu A MAO nao e atropelada pelo cron'
);

-- 9: o pedido continua existindo depois da devolucao.
select is(
  (select needs_human from whatsapp_conversations where id = :'c_antigo'),
  true,
  'devolver ao agente NAO apaga o pedido -- o dono continua vendo na lista dele'
);

-- 10: avisar uma vez tira da fila do e-mail.
do $$
declare v_chave text;
begin
  select x.chave into v_chave from private.pedidos_de_dono_pendentes(10) x
   where x.cliente = 'Quem Esperou';
  perform registrar_aviso_de_pedido_de_dono(v_chave);
end $$;

select is(
  (select count(*)::int from private.pedidos_de_dono_pendentes(10) x where x.cliente = 'Quem Esperou'),
  0,
  'pedido ja avisado sai da fila do e-mail -- nao vira spam a cada varredura'
);

select * from finish();
rollback;
