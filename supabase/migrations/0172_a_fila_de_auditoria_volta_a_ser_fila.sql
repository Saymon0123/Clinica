-- 0172: a fila de auditoria volta a ser fila.
--
-- O QUE ACONTECEU. Desde 12/09 às 05:30 UTC, o fluxo "Auditoria do Agente"
-- falha a cada 30 minutos:
--
--     duplicate key value violates unique constraint "auditoria_avisos_pkey"
--
-- ~80 execuções, e o dono recebeu DOIS e-mails por ciclo: o relatório de
-- auditoria (sempre com os mesmos dois achados de 08 e 09/09) e o alerta de
-- falha. O canal por onde o produto avisa que algo deu errado virou ruído — que
-- é pior do que estar mudo, porque um achado NOVO chegaria no meio da enxurrada
-- e ninguém veria.
--
-- A CAUSA. `auditoria_pendente` parou de ser "pendente". A 0152 a definia assim:
--
--     from ( ...oito fontes em union all... ) a
--     left join auditoria_avisos av on av.chave = a.chave
--     where av.chave is null
--
-- A 0162 a recriou para acrescentar `auditoria_mensagens` — e escreveu só o
-- `union all`, sem o anti-join. A 0165 acrescentou a décima fonte copiando o
-- `pg_get_viewdef` da versão JÁ quebrada, e levou o erro adiante com a cara de
-- quem só somou uma linha.
--
-- Sem o anti-join a view devolve todo achado que existe, avisado ou não. O n8n
-- manda o e-mail, tenta gravar a chave em `auditoria_avisos`, ela já está lá, e
-- a chave primária — que é justamente a trava de "avisa uma vez só" — derruba a
-- execução. A trava funcionou: ela é o motivo de o defeito ter feito barulho em
-- vez de duplicar aviso em silêncio.
--
-- NADA SE PERDEU: conferido antes de mexer, não havia nenhum achado na fila que
-- não estivesse já em `auditoria_avisos`. O e-mail vinha repetido, não faltando.
--
-- O anti-join volta a ser a ÚLTIMA coisa da definição, depois do union, para a
-- próxima fonte entrar sem passar por cima dele. E o teste que faltava entra
-- junto: `a_mensagem_nao_se_perde.test.sql` já provava que o achado CHEGA na
-- fila; passa a provar também que ele SAI depois de avisado. A 0162 shipou com
-- esse teste verde — ele cobria a metade que continuou funcionando.

create or replace view public.auditoria_pendente
with (security_invoker = on) as
select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
  from (
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_do_agente
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_fronteira
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_operacao
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_avaliacao
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_atendimento
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_cobranca
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_comanda
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_entrega
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_mensagens
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_crons
  ) a
  -- A razão de existir desta view. Sem esta linha ela é `auditoria_tudo`.
  left join public.auditoria_avisos av on av.chave = a.chave
 where av.chave is null
 order by case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
          a.ocorrido_em desc;

comment on view public.auditoria_pendente is
  'Tudo que precisa de olho humano e AINDA NAO FOI AVISADO, mais grave primeiro. Lida pelo fluxo "Auditoria do Agente" do n8n, que manda e-mail e depois grava a chave em auditoria_avisos. O anti-join com auditoria_avisos e a razao de existir desta view: sem ele (0162 ate 0172) o mesmo achado volta a cada 30 minutos e a gravacao esbarra na chave primaria.';

-- Repetido de propósito, como na 0157 e na 0162: quem lê isto é o n8n com a
-- chave de serviço. O site sem login e a equipe da barbearia não têm por quê.
revoke all on public.auditoria_pendente from anon, authenticated;
