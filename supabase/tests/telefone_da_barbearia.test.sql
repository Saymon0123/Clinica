-- O telefone da barbearia, quando existe, é um telefone (migration 0155 — A11
-- do giro de 10/09).
--
-- Vazio continua valendo de propósito: o convite pelo painel cria a barbearia
-- antes de o dono aparecer, e é o aceite que grava o número. O que a CHECK
-- barra é o número que não é número — que viraria um botão "Falar com a
-- barbearia" apontando para lugar nenhum.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(5);

select lives_ok(
  $$insert into salons (id, nome) values ('bbbb9000-0000-0000-0000-000000000001', 'Ainda sem telefone')$$,
  'barbearia sem telefone ainda pode nascer (convite pelo painel)'
);

select lives_ok(
  $$update salons set telefone = '(41) 98727-5895' where id = 'bbbb9000-0000-0000-0000-000000000001'$$,
  'telefone com mascara passa'
);

select lives_ok(
  $$update salons set telefone = '5541987275895' where id = 'bbbb9000-0000-0000-0000-000000000001'$$,
  'telefone com DDI passa'
);

select throws_ok(
  $$update salons set telefone = '98727-589' where id = 'bbbb9000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'curto demais: recusado'
);

select throws_ok(
  $$update salons set telefone = '55419872758951' where id = 'bbbb9000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'comprido demais: recusado'
);

select * from finish();
rollback;
