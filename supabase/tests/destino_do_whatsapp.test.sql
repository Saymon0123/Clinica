-- O destino do WhatsApp (migration 0129, Parte 2, passo 2.1).
--
-- Cinco views montavam o destino como `'55' || digitos(telefone)` sem olhar se
-- o número já vinha com o DDI — e vem: o agente grava o telefone como o
-- WhatsApp entrega. `554187275895` virava `55554187275895`, catorze dígitos,
-- número que não existe. O filtro `length(destino) >= 12` deixava passar, e
-- pelo canal oficial cada uma dessas é um template cobrado que não chega em
-- ninguém — e o cliente que devia ser avisado não é, sem ninguém saber.
--
-- A última asserção é a que protege de verdade: ela varre o schema inteiro
-- procurando a concatenação. Uma view nova escrita do jeito antigo derruba o CI
-- em vez de derrubar dinheiro.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Sem DDI: o formato que o balcão digita
-- ---------------------------------------------------------------------------

select is(private.destino_whatsapp('4133445566'), '554133445566',
  '10 digitos (fixo com DDD) ganham o 55');

select is(private.destino_whatsapp('41987275895'), '5541987275895',
  '11 digitos (celular com DDD) ganham o 55');

select is(private.destino_whatsapp('(41) 98727-5895'), '5541987275895',
  'a mascara do balcao nao atrapalha');

-- ---------------------------------------------------------------------------
-- Com DDI: o formato que o WhatsApp entrega. Era aqui que doía.
-- ---------------------------------------------------------------------------

select is(private.destino_whatsapp('554187275895'), '554187275895',
  '12 digitos com DDI passam intactos -- era este que virava 14');

select is(private.destino_whatsapp('5541987275895'), '5541987275895',
  '13 digitos com DDI passam intactos');

-- Número estrangeiro de verdade também passa: quem tem 12 ou 13 dígitos já
-- trouxe o proprio DDI, seja ele qual for.
select is(private.destino_whatsapp('351911234567'), '351911234567',
  'numero estrangeiro nao ganha 55 na frente');

-- ---------------------------------------------------------------------------
-- O que não dá para enviar sai da fila em vez de virar mensagem cobrada
-- ---------------------------------------------------------------------------

select is(private.destino_whatsapp('987275895'), null::text,
  '9 digitos (celular sem DDD) nao viram destino');

select is(private.destino_whatsapp('55554187275895'), null::text,
  '14 digitos nao viram destino -- e o proprio defeito, se ele reaparecer');

select is(private.destino_whatsapp('nao tem'), null::text,
  'texto sem digito nao vira destino');

select is(private.destino_whatsapp(null), null::text,
  'telefone em branco nao vira destino');

-- ---------------------------------------------------------------------------
-- A trava que sobrevive a quem não leu este arquivo
-- ---------------------------------------------------------------------------

select is(
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and pg_get_viewdef(c.oid) like '%''55''::text ||%'),
  null::text,
  'nenhuma view do schema concatena 55 no telefone -- use private.destino_whatsapp'
);

select * from finish();
rollback;
