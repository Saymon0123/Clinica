-- O dono consegue salvar Configurações (migration 0189).
--
-- ## O defeito que isto existe para impedir
--
-- Depois de a 0186/0187 acrescentarem duas colunas em `salons`, o dono abriu
-- Configurações, mudou o **horário de funcionamento** e levou "Você não tem
-- permissão para fazer isso." — logado como dono da própria barbearia.
--
-- `salons` não tem UPDATE de tabela para `authenticated`: tem **grant por
-- coluna**, uma lista branca. É proteção deliberada, e boa: impede o dono de
-- mexer em `ativo`, `cobravel`, `organization_id` e `remetente_phone_number_id`,
-- que são do operador do sistema e não dele.
--
-- O que ninguém lembra é que **`alter table add column` não estende grant por
-- coluna**. E como a tela manda **um `update` só** com todos os campos, basta
-- uma coluna sem privilégio para o Postgres recusar a instrução inteira: mexer
-- no sábado falhava por causa de um campo de comissão que o dono nem tocou.
--
-- Por isso este teste escreve o payload INTEIRO da tela, e não campo a campo.
-- Coluna nova que entre em Configurações sem o `grant update` correspondente
-- quebra aqui, e não na cara do dono.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(5);

\set salao 'ffff1000-0000-0000-0000-000000000001'
\set dono  'ffff1500-0000-0000-0000-000000000001'

insert into auth.users (id, email) values (:'dono', 'dono@teste189.local');
insert into salons (id, nome, ativo) values (:'salao', 'Salao do Dono', true);
insert into user_salons (user_id, salon_id, role) values (:'dono', :'salao', 'owner');

create or replace function pg_temp.entrar_como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

select pg_temp.entrar_como(:'dono');

------------------------------------------------------- o que ele PODE salvar

-- O payload inteiro de Configurações, numa instrução só, como a tela manda.
select lives_ok(
  format($$update salons set
             nome = 'Salao do Dono',
             endereco = 'Rua Um, 100',
             telefone = '(41) 90000-0000',
             google_review_url = null,
             horario_funcionamento = '{"seg": {"abre": "09:00", "fecha": "19:00"}}'::jsonb,
             folga_entre_atendimentos_minutos = 10,
             ciclo_comissao = 'semanal',
             dia_fechamento_comissao = 1
           where id = %L$$, :'salao'),
  'o dono salva Configuracoes INTEIRO numa instrucao so -- coluna nova sem grant quebra aqui'
);

select is(
  (select ciclo_comissao from salons where id = :'salao'),
  'semanal',
  'e o que ele salvou ficou gravado mesmo'
);

----------------------------------------------- e o que ele NAO pode salvar

-- A lista branca continua branca. Se um destes passar a funcionar, alguem
-- trocou o grant por coluna por um grant de tabela e abriu o que nao devia.
select throws_ok(
  format($$update salons set ativo = false where id = %L$$, :'salao'),
  '42501', null,
  'o dono NAO desativa a propria barbearia: `ativo` e do operador do sistema'
);

select throws_ok(
  format($$update salons set cobravel = false where id = %L$$, :'salao'),
  '42501', null,
  'o dono NAO se tira da cobranca'
);

select throws_ok(
  format($$update salons set organization_id = null where id = %L$$, :'salao'),
  '42501', null,
  'o dono NAO se desliga da rede a que pertence'
);

select * from finish();
rollback;
