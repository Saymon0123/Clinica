-- A saúde do canal oficial entra na auditoria.
--
-- Em 01/10 eu reportei o canal oficial como bloqueado e estava errado: li
-- `health_status` com um token que só tem `whatsapp_business_management`, e o
-- `health_status` é relativo ao **App do token que faz a chamada**. O erro 141011
-- descrevia o meu token, não o número. O dono desmentiu pela experiência dele
-- ("recebi lembrete no meu número"), e a `analytics` da WABA confirmou: 14
-- mensagens, 100% entregues, a última em 16/09.
--
-- Nada no sistema olhava o `health_status`. Esta migration dá lugar para a
-- leitura e a coloca na auditoria diária, com uma trava contra exatamente o erro
-- que eu cometi.
--
-- ## A trava: leitura de token que não envia NÃO alarma bloqueio
--
-- Se a checagem rodar com um token sem `whatsapp_business_messaging`, ela vai
-- ler `BLOCKED` todo dia, para sempre, pelo motivo errado — e alarme que grita
-- todo dia é alarme que ninguém lê. Pior: ele esconderia o bloqueio de verdade.
--
-- Então a leitura carrega `token_envia`, e a view separa os dois mundos:
--
-- - `token_envia = true`  e `pode_enviar <> 'AVAILABLE'` → **grave**: não envia.
-- - `token_envia = false`                                → **aviso**: a checagem
--   está cega, porque o token dela não é o que envia. O defeito é da checagem,
--   e é isso que o aviso diz.
--
-- Quem checa deve usar **a mesma credencial que envia**. É a única cujo
-- resultado responde à pergunta "o lembrete vai sair?".
--
-- ## E a terceira coisa que precisa alarmar: ninguém checou
--
-- Monitor que para de rodar fica verde para sempre. Sem leitura nas últimas 26
-- horas (24 de folga mais duas de atraso), a view acusa — mesma lógica do
-- `auditoria_crons`, que alarma rotina parada em vez de confiar no silêncio.

create table private.saude_do_canal (
  -- Sequencial, e não uuid: a view precisa saber qual e a leitura MAIS RECENTE, e
  -- `lido_em` sozinho nao resolve empate. Duas leituras no mesmo instante -- o
  -- ensaio produziu exatamente isso, porque `now()` nao anda dentro de uma
  -- transacao -- deixavam o `distinct on` escolher de forma arbitraria, e a view
  -- podia reportar a leitura antiga como se fosse a atual. Com sequencial, a
  -- ultima e a de maior id, sempre.
  id bigint generated always as identity primary key,
  -- O número lido. Texto, e não FK: o id vive na Meta, e o dia em que alguém
  -- apagar a linha de `remetentes_oficiais` a leitura histórica continua válida.
  phone_number_id text not null,
  /** O `can_send_message` da Meta: AVAILABLE, LIMITED ou BLOCKED. */
  pode_enviar text not null,
  /**
   * Se o token da checagem tem `whatsapp_business_messaging`.
   *
   * Sem isto a leitura não quer dizer nada sobre enviar, e foi essa confusão que
   * produziu o falso alarme de 01/10.
   */
  token_envia boolean not null,
  /** O `entities` inteiro da Meta, para o detalhe do alarme dizer QUEM bloqueou. */
  detalhe jsonb,
  lido_em timestamptz not null default now()
);

comment on table private.saude_do_canal is
  'Leituras do health_status da WABA, escritas pela auditoria do n8n. `token_envia` diz se o token da checagem tinha escopo de envio: leitura de token sem esse escopo NAO prova nada sobre enviar (falso alarme de 01/10) e a view auditoria_canal_oficial a trata como checagem cega, nao como bloqueio.';

create index saude_do_canal_recente on private.saude_do_canal (phone_number_id, lido_em desc, id desc);

-- A view da auditoria e `security_invoker`, entao a leitura acontece com a
-- identidade de quem chama -- o `service_role` do n8n. Sem este grant ela voltaria
-- "permission denied" em producao e o alarme novo nasceria morto.
grant select on private.saude_do_canal to service_role;

------------------------------------------------------------------------------
-- Como a auditoria registra uma leitura
------------------------------------------------------------------------------
-- RPC, e não `insert` direto do n8n, pelo motivo de sempre: a régua de qual
-- valor é aceitável fica num lugar só, e o nó do n8n passa a ser burro.
create or replace function private.registrar_saude_do_canal(
  p_phone_number_id text,
  p_pode_enviar text,
  p_token_envia boolean,
  p_detalhe jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_pode_enviar is null or p_pode_enviar = '' then
    raise exception 'pode_enviar vazio: a leitura nao diz nada'
      using errcode = '22023';
  end if;
  -- `token_envia` nulo seria o pior dos mundos: a view não saberia se pode
  -- confiar na leitura, e silêncio ambíguo é o que esta migration combate.
  if p_token_envia is null then
    raise exception 'token_envia nao informado: a leitura seria inconclusiva por construcao'
      using errcode = '22023';
  end if;

  insert into private.saude_do_canal
    (phone_number_id, pode_enviar, token_envia, detalhe)
  values (p_phone_number_id, upper(p_pode_enviar), p_token_envia, p_detalhe);
end;
$function$;

-- O trinco, reposto à mão: função nova nasce com execute para `public`.
revoke all on function private.registrar_saude_do_canal(text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function private.registrar_saude_do_canal(text, text, boolean, jsonb)
  to service_role;

comment on function private.registrar_saude_do_canal(text, text, boolean, jsonb) is
  'Grava uma leitura do health_status da WABA. Chamada pela auditoria do n8n com o resultado de GET /{waba}?fields=health_status e de /debug_token. Recusa leitura sem `token_envia`, porque leitura inconclusiva por construcao e pior que leitura nenhuma.';

------------------------------------------------------------------------------
-- A view da auditoria
------------------------------------------------------------------------------
-- A folga é 26 horas: 24 da periodicidade mais 2 de atraso. Apertar para 24
-- faria o alarme disparar por um cron que atrasou dez minutos, e alarme que
-- mente uma vez por semana deixa de ser lido.
create view public.auditoria_canal_oficial
with (security_invoker = on) as
with ultima as (
  -- `id desc` como desempate: ver o comentario da coluna. Sem ele a view e nao
  -- deterministica quando duas leituras caem no mesmo instante.
  select distinct on (phone_number_id)
         phone_number_id, pode_enviar, token_envia, detalhe, lido_em
    from private.saude_do_canal
   order by phone_number_id, lido_em desc, id desc
),
-- Os remetentes que DEVERIAM estar sendo checados. Sem isto, apagar a leitura
-- deixaria o número fora da auditoria em silêncio.
esperados as (
  select phone_number_id from public.remetentes_oficiais where ativo
)
-- 1. Não envia, e a leitura é confiável. É o alarme de verdade.
select 'canal-bloqueado:' || u.phone_number_id as chave,
       'Canal oficial nao envia' as tipo,
       'grave' as gravidade,
       null::uuid as salon_id,
       u.lido_em as ocorrido_em,
       'A Meta diz can_send_message = ' || u.pode_enviar || ' para o numero '
         || u.phone_number_id || '. Nenhum lembrete, avaliacao ou aviso sai por ele. '
         || 'Quem bloqueou: ' || coalesce(u.detalhe::text, 'detalhe nao gravado') as detalhe
  from ultima u
 where u.token_envia
   and u.pode_enviar <> 'AVAILABLE'

union all

-- 2. A checagem está cega: o token dela não envia, então o que ela leu não
--    responde à pergunta. Foi exatamente o erro de 01/10, e aqui ele vira aviso
--    sobre a CHECAGEM em vez de alarme falso sobre o canal.
select 'canal-checagem-cega:' || u.phone_number_id,
       'Checagem do canal oficial sem escopo de envio',
       'aviso',
       null::uuid,
       u.lido_em,
       'A ultima leitura do numero ' || u.phone_number_id || ' veio de um token SEM '
         || 'whatsapp_business_messaging, e health_status e relativo ao App do token. '
         || 'Ela leu ' || u.pode_enviar || ', e isso nao prova nada sobre enviar. '
         || 'Trocar a credencial da checagem pela MESMA que envia.'
  from ultima u
 where not u.token_envia

union all

-- 3. Ninguém checou. Monitor parado fica verde para sempre.
select 'canal-sem-checagem:' || e.phone_number_id,
       'Canal oficial sem checagem de saude',
       'grave',
       null::uuid,
       coalesce(u.lido_em, '1970-01-01'::timestamptz),
       case
         when u.phone_number_id is null then
           'O numero ' || e.phone_number_id || ' esta ativo como remetente e NUNCA '
             || 'teve a saude checada.'
         else
           'A saude do numero ' || e.phone_number_id || ' nao e checada ha '
             || to_char(now() - u.lido_em, 'DD"d" HH24"h" MI"min"')
             || '. A tolerancia e 26h.'
       end
  from esperados e
  left join ultima u on u.phone_number_id = e.phone_number_id
 where u.lido_em is null or u.lido_em < now() - interval '26 hours';

comment on view public.auditoria_canal_oficial is
  'Alarme da saude do canal oficial. Tres casos: nao envia (grave), checagem feita com token sem escopo de envio (aviso -- o defeito e da checagem, nao do canal) e ninguem checou ha mais de 26h (grave).';

------------------------------------------------------------------------------
-- `auditoria_pendente`, recriada por inteiro com o membro novo
------------------------------------------------------------------------------
-- `drop` + `create`, reproduzindo os onze membros mais o novo. A regra da casa, e
-- aqui com dente duplo: `create or replace` não aceita acrescentar membro no meio
-- de um UNION sem reescrever tudo, e perderia os grants em silêncio.
drop view public.auditoria_pendente;

-- `with (security_invoker = on)` REDIGITADO. A view tinha essa opcao, e nem o
-- `replace` nem o `drop` + `create` a herdam: sem esta linha ela viraria view de
-- DONO, e passaria a ignorar a RLS das tabelas de origem. O ensaio pegou.
create view public.auditoria_pendente
with (security_invoker = on) as
select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
  from (
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_do_agente
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_fronteira
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_operacao
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_avaliacao
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_atendimento
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_cobranca
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_comanda
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_entrega
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_mensagens
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_crons
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_cadastro
    union all
    -- O membro novo (0196).
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_canal_oficial
  ) a
  left join auditoria_avisos av on av.chave = a.chave
 where av.chave is null
 order by (case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end),
          a.ocorrido_em desc;

-- O trinco, reposto a mao, e aqui ele vale muito.
--
-- Antes do `drop` esta view tinha grants SO para `postgres` e `service_role`. O
-- `create` devolveu tudo para `anon` e `authenticated` pelo padrao do schema, e o
-- ensaio comparou e acusou. Sem este revoke, qualquer chamada anonima leria os
-- achados de auditoria de TODAS as barbearias -- e, junto com o `security_invoker`
-- que eu tinha esquecido de redigitar, leria como dono, sem RLS.
--
-- Duas metades da mesma armadilha do CLAUDE.md, na mesma migration.
revoke all on public.auditoria_pendente from anon, authenticated;
revoke all on public.auditoria_canal_oficial from anon, authenticated;

comment on view public.auditoria_pendente is
  'Achados de auditoria ainda nao comunicados ao dono do produto, de doze fontes, sem os que ja estao em auditoria_avisos. Consumida pelo n8n. security_invoker on e sem grant para anon/authenticated: ela cruza TODAS as barbearias.';
