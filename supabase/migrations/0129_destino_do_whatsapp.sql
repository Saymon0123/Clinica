-- 0129: o destino do WhatsApp para de ganhar um 55 a mais (Parte 2, passo 2.1).
--
-- Cinco views montavam o destino como `'55' || digitos(telefone)`, sem olhar se
-- o número JÁ vinha com o DDI. E ele vem: `docs/n8n-integration.md` manda o
-- agente gravar o telefone "como veio do WhatsApp", que é `5541987275895`.
-- Resultado, medido em produção em 02/09 nos três clientes que o agente
-- cadastrou:
--
--   telefone gravado      destino montado        dígitos
--   554187275895     ->   55554187275895         14
--   554184729754     ->   55554184729754         14
--
-- Catorze dígitos passavam no filtro `length(destino) >= 12` e viravam mensagem
-- para um número que não existe. Pelo canal oficial cada uma dessas é um
-- template COBRADO que não chega em ninguém — e, pior que o custo, o cliente
-- que deveria receber o lembrete simplesmente não recebe, e ninguém fica
-- sabendo.
--
-- Isso não era caso de borda: é o padrão de TODO cliente criado pelo agente.
-- Só não estourou ainda porque as filas de disparo estão vazias enquanto os
-- templates não voltam aprovados da Meta.
--
-- A régua vira função única, como a do telefone na 0128. E ela devolve NULO
-- quando não dá para montar destino nenhum: a linha some da fila, em vez de
-- virar mensagem cobrada para um número inventado. Os filtros
-- `length(destino) >= 12` que já existem continuam valendo sem mudança —
-- destino válido tem 12 ou 13 dígitos, e `length(null) >= 12` é nulo.

create or replace function private.destino_whatsapp(p_telefone text)
returns text
language sql
immutable
as $$
  select case
           -- Sem DDI: é o formato que o balcão digita. Ganha o 55.
           when length(d) in (10, 11) then '55' || d
           -- Com DDI: é o formato que o WhatsApp entrega, e é o que o agente
           -- grava. Passa como está — somar outro 55 aqui é o defeito.
           when length(d) in (12, 13) then d
           -- Não dá para montar destino: NULO, e a linha some da fila em vez
           -- de virar mensagem cobrada para um número que não existe.
           else null
         end
    from (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) as t(d);
$$;

comment on function private.destino_whatsapp(text) is
  'Telefone gravado -> destino para a API de WhatsApp (so digitos, com DDI). 10-11 digitos ganham o 55; 12-13 ja tem DDI e passam intactos; o resto vira NULO. Regua unica: antes cada view concatenava 55 as cegas e telefone gravado com DDI virava destino de 14 digitos.';

-- A troca nas views é MECÂNICA — uma expressão, cinco vezes, dentro de corpos
-- longos que não mudam em mais nada. Reescrevê-los à mão seria copiar ~250
-- linhas de definição para trocar uma linha em cada, e o risco real aqui não é
-- a lógica: é a transcrição.
--
-- Por isso a substituição é feita sobre a definição que o próprio banco
-- devolve, com TRÊS travas para não passar batido em silêncio: cada view tem de
-- mudar, nenhuma pode sobrar com `'55' ||`, e o total tem de ser exatamente 5.
-- Qualquer uma que falhe derruba a migration inteira.
do $$
declare
  v record;
  antes text;
  novo text;
  trocadas int := 0;
begin
  for v in
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and c.relname = any (array[
             'atrasos_para_perguntar',
             'avaliacoes_a_pedir',
             'clientes_para_avisar_retorno',
             'clientes_para_reativar',
             'vencimentos_proximos'
           ])
     order by c.relname
  loop
    antes := pg_get_viewdef(v.oid, true);

    novo := regexp_replace(
      antes,
      '''55''::text \|\| regexp_replace\((.+?), ''\\D''::text, ''''::text, ''g''::text\)',
      'private.destino_whatsapp(\1)',
      'g');

    -- `atrasos_para_perguntar` prefere o telefone da conversa real do WhatsApp
    -- e só cai no cadastro se não houver. Esse valor já vem com DDI e por isso
    -- nunca teve o bug — mas passar pela mesma régua faz um valor estranho
    -- (JID de grupo, por exemplo) virar nulo e cair no telefone do cadastro,
    -- em vez de virar destino inválido.
    novo := replace(
      novo,
      'regexp_replace(conv.contact_phone, ''\D''::text, ''''::text, ''g''::text)',
      'private.destino_whatsapp(conv.contact_phone)');

    if novo = antes then
      raise exception
        'A view % nao mudou: o padrao de concatenacao esperado nao existe mais nela.', v.relname;
    end if;
    if novo like '%''55''::text ||%' then
      raise exception 'A view % ainda concatena 55 depois da troca.', v.relname;
    end if;

    execute format('create or replace view public.%I as %s', v.relname, novo);
    -- `create or replace view` não carrega as reloptions da anterior, e sem
    -- isto as cinco perderiam o `security_invoker=on` — que é o que faz a RLS
    -- das tabelas de baixo valer para quem lê a view.
    execute format('alter view public.%I set (security_invoker = on)', v.relname);

    trocadas := trocadas + 1;
  end loop;

  if trocadas <> 5 then
    raise exception 'Esperava trocar 5 views, troquei %.', trocadas;
  end if;
end $$;

-- Confere o resultado em vez de confiar no laço: nenhuma das cinco pode ter
-- ficado sem `security_invoker`, e nenhuma view do schema pode ter sobrado
-- concatenando 55.
do $$
declare
  sem_invoker text;
  ainda_concatena text;
begin
  select string_agg(c.relname, ', ') into sem_invoker
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and c.relname = any (array['atrasos_para_perguntar','avaliacoes_a_pedir',
           'clientes_para_avisar_retorno','clientes_para_reativar','vencimentos_proximos'])
     and (c.reloptions is null or not ('security_invoker=on' = any (c.reloptions)));
  if sem_invoker is not null then
    raise exception 'Views sem security_invoker depois da troca: %', sem_invoker;
  end if;

  select string_agg(c.relname, ', ') into ainda_concatena
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and pg_get_viewdef(c.oid) like '%''55''::text ||%';
  if ainda_concatena is not null then
    raise exception 'Views que ainda concatenam 55: %', ainda_concatena;
  end if;
end $$;

-- A fila da reativação saía com `telefone_norm` — os últimos 8 dígitos, que
-- servem para ACHAR o cliente e não para mandar mensagem. Sem um destino
-- pronto, o n8n teria de montar o número por conta própria, que é exatamente a
-- cópia da régua que esta migration existe para acabar. A coluna entra no fim
-- da lista de propósito: coluna nova no meio levanta 42P16 no `replace`.
create or replace view public.reativacoes_a_enviar
with (security_invoker = on) as
select a.id as appointment_id,
       a.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       c.telefone_norm,
       c.reativacao_sem_resposta,
       p.nome as barbeiro,
       to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'DD/MM') as data,
       to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI') as hora,
       private.destino_whatsapp(c.telefone) as destino
  from public.appointments a
  join public.clients c on c.id = a.client_id
  join public.salons s on s.id = a.salon_id
  left join public.professionals p on p.id = a.professional_id
 where a.origem = 'reativacao'
   and a.status = 'agendado'
   and not a.confirmacao_enviada
   and a.data_hora_inicio >= now() + interval '2 hours'
   and a.data_hora_inicio <= now() + interval '26 hours'
   and not c.recusou_contato
   and c.reativacao_pausada_em is null
   -- Sem destino não há o que enviar. Antes a linha saía na fila mesmo assim e
   -- o problema só aparecia (ou não) do lado do n8n.
   and private.destino_whatsapp(c.telefone) is not null;
