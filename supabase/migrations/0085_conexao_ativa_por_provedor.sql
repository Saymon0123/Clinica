-- "O WhatsApp desta barbearia funciona?" -- uma resposta, dois provedores.
--
-- Ate aqui a pergunta era `whatsapp_connections.status = 'open'`, espalhada por
-- seis views. Isso e vocabulario da Evolution: 'open', 'close', 'connecting'
-- sao estados de uma sessao pareada por QR.
--
-- **Na Cloud API nao existe sessao.** O numero esta registrado na WABA ou nao
-- esta; nao ha o que cair. Uma barbearia migrada fica com o `status` congelado
-- no ultimo valor da Evolution -- e foi o que aconteceu com a El Guardians, que
-- virou `cloud_api` com `status = 'close'` e **sumiu das quatro views que
-- exigem 'open'**: reativacao, retorno, atraso e vencimento. Em silencio.
--
-- A regra passa a morar aqui. As views perguntam a esta, e nao ao `status`.

create or replace view public.conexoes_ativas
with (security_invoker = on) as
select wc.salon_id,
       wc.provedor,
       wc.phone_number_id,
       wc.waba_id,
       wc.instance_name,
       -- O que cada provedor entende por "consegue falar":
       --   evolution -> a sessao pareada esta de pe
       --   cloud_api -> o numero esta registrado na WABA
       case wc.provedor
         when 'evolution' then wc.status = 'open'
         when 'cloud_api' then wc.phone_number_id is not null
         else false
       end as conectado
  from public.whatsapp_connections wc;

comment on view public.conexoes_ativas is
  'Traduz "o WhatsApp funciona?" para os dois provedores. Evolution olha o status da sessao; Cloud API olha se ha phone_number_id, porque nao existe sessao para cair. Quem precisa saber se da para enviar consulta esta view, nunca o status cru.';
