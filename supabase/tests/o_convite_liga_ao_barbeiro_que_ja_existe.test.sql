-- O convite que liga ao barbeiro que já existe (migration 0191).
--
-- ## O que isto impede de voltar
--
-- `accept-invite` fazia **`insert`** em `professionals`, sempre. Barbeiro que já
-- ocupa cadeira sem login — ele atende, aparece na agenda, é oferecido pelo
-- agente no WhatsApp, e nunca abre o CRM — ao receber acesso virava um SEGUNDO
-- profissional. O dono ficava com dois "João": o antigo com todo o histórico,
-- comissão e horários, e o novo vazio com o login.
--
-- A ligação é escolha do dono no convite, não casamento por nome ou telefone:
-- **ligação errada é pior que duplicata**, porque entrega o histórico, a
-- comissão e a agenda de uma pessoa para outra, e ninguém vê.
--
-- As três travas guardadas aqui são todas do BANCO. O que a edge function faz
-- com a coluna (ligar em vez de inserir) não se testa em pgTAP; o que se testa é
-- que ela não pode receber uma cadeira que não devia.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(7);

\set salao   'eeee1910-0000-0000-0000-000000000001'
\set vizinha 'eeee1910-0000-0000-0000-000000000002'
\set prof    'eeee1911-0000-0000-0000-000000000001'
\set alheia  'eeee1911-0000-0000-0000-000000000002'
\set conv    'eeee1912-0000-0000-0000-000000000001'

insert into salons (id, nome) values
  (:'salao',   'Barbearia do Convite'),
  (:'vizinha', 'Barbearia da Esquina');

-- Cadeira sem login: exatamente o caso que a 0191 existe para atender.
insert into professionals (id, salon_id, nome, ativo) values
  (:'prof',   :'salao',   'Joao Sem Login', true);
insert into professionals (id, salon_id, nome, ativo) values
  (:'alheia', :'vizinha', 'Cadeira Alheia', true);

------------------------------------------------------------ o caminho certo

insert into salon_invites (id, salon_id, nome, email, role, professional_id) values
  (:'conv', :'salao', 'Joao Sem Login', 'joao1910@teste.local', 'barbeiro', :'prof');

select is(
  (select professional_id from salon_invites where id = :'conv'),
  :'prof'::uuid,
  'o convite guarda a cadeira que o dono escolheu'
);

------------------------------------------- a cadeira tem de ser DESTA barbearia

-- A FK COMPOSTA (professional_id, salon_id) é o que torna isto impossível. Sem
-- ela, um dono poderia apontar o convite para a cadeira de outra barbearia e
-- entregar a agenda de um estranho a quem aceitasse.
select throws_ok(
  format(
    $$insert into salon_invites (salon_id, nome, email, role, professional_id)
      values (%L, 'Invasor', 'invasor1910@teste.local', 'barbeiro', %L)$$,
    :'salao', :'alheia'
  ),
  '23503', null,
  'convite NAO aponta para a cadeira de outra barbearia (FK composta)'
);

------------------------------------------- uma cadeira, um convite em aberto

select throws_ok(
  format(
    $$insert into salon_invites (salon_id, nome, email, role, professional_id)
      values (%L, 'Segundo', 'segundo1910@teste.local', 'barbeiro', %L)$$,
    :'salao', :'prof'
  ),
  '23505', null,
  'dois convites EM ABERTO na mesma cadeira sao recusados'
);

-- Convite já usado sai do índice: a cadeira precisa poder ser religada depois
-- de quem a ocupava sair da equipe. Travar para sempre deixaria a cadeira órfã.
update salon_invites set usado_em = now() where id = :'conv';

select lives_ok(
  format(
    $$insert into salon_invites (salon_id, nome, email, role, professional_id)
      values (%L, 'Religa', 'religa1910@teste.local', 'barbeiro', %L)$$,
    :'salao', :'prof'
  ),
  'depois de USADO o convite sai do indice e a cadeira pode ser religada'
);

------------------------------------ apagar a cadeira nao derruba o convite

-- `on delete set null (professional_id)` com RECORTE de coluna. Sem o recorte o
-- Postgres tentaria anular `salon_id` também, que é `not null`, e o delete
-- falharia — o dono não conseguiria apagar um barbeiro que tivesse convite.
delete from professionals where id = :'prof';

select is(
  (select count(*)::int from salon_invites where salon_id = :'salao'),
  2,
  'apagar a cadeira NAO apaga os convites dela'
);

select is(
  (select count(*)::int from salon_invites
    where salon_id = :'salao' and professional_id is not null),
  0,
  'o set null recortou so professional_id, e salon_id ficou de pe'
);

--------------------------------------------------------------- o trinco

-- `salon_invites` dá INSERT **por coluna** para `authenticated` (o SELECT é de
-- tabela). Coluna nova não herda grant por coluna, e a tela manda um `insert`
-- só com todos os campos: sem o grant, criar convite falharia INTEIRO com
-- 42501 -- o mesmo defeito que derrubou Configuracoes em 30/09.
select ok(
  has_column_privilege('authenticated', 'public.salon_invites', 'professional_id', 'insert'),
  'o dono pode INSERIR a coluna nova: o grant por coluna foi reposto'
);

select * from finish();
rollback;
