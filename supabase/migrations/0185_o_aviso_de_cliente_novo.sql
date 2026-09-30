-- O aviso de cliente novo — e o de cliente que quase foi.
--
-- Até aqui, uma barbearia podia se cadastrar e **ninguém ficava sabendo**. A
-- edge `criar-minha-barbearia` cria tudo e não conta para nenhum lugar: sem
-- e-mail, sem webhook, sem chave de alarme. O dado existia na
-- `metricas_do_produto` (o painel administrativo), mas painel é coisa que se
-- abre — e quem está prospectando precisa ser procurado, não procurar.
--
-- O mesmo vale para o contrário: em 30/09 havia **duas contas criadas que
-- nunca viraram barbearia**. Ambas entraram uma vez, minutos depois de
-- confirmar o e-mail, e sumiram. É venda perdida a um passo do fim, e não
-- havia nada que a apontasse.
--
-- ## Por que aqui dentro, e não num fluxo novo
--
-- A `auditoria_pendente` já é lida de 30 em 30 minutos pelo workflow
-- "Auditoria do Agente", que manda e-mail para o `canal_de_alertas`. Entrar
-- nessa fila é acrescentar um membro ao `UNION ALL`: nenhum workflow novo,
-- nenhum canal novo, e o `auditoria_avisos` já cuida de não repetir o mesmo
-- aviso duas vezes.
--
-- **Ressalva registrada:** esses avisos saem pelo mesmo SMTP de todo o resto.
-- Não resolvem o ponto único de falha da observabilidade (ver o parecer de
-- 30/09 no backlog) — resolvem só a pergunta "tenho cliente novo?".

------------------------------------------------------------------------------
-- 1. A porta para `auth.users`
------------------------------------------------------------------------------
-- As views de auditoria são todas `security_invoker = on`, então rodam como
-- quem chama — e quem chama é o n8n pelo `service_role`, que **não tem leitura
-- em `auth.users`**.
--
-- Isso não é detalhe: uma view invoker lendo `auth.users` direto levantaria
-- "permission denied for table users" dentro da `auditoria_pendente`, e como a
-- fila é um `UNION ALL`, derrubaria **todos os outros alarmes junto**. Ficaria
-- pior do que antes de existir.
--
-- A saída é a que a `auditoria_crons` já usa para chegar em `cron.job`: uma
-- função `security definer` no schema `private`, com o trinco apertado.
create or replace function private.cadastros_parados()
returns table (user_id uuid, email text, criada_em timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select u.id, u.email::text, u.created_at
    from auth.users u
   where not exists (
           select 1 from public.user_salons us where us.user_id = u.id
         )
     -- Barbeiro convidado que ainda não aceitou não é cadastro parado: ele
     -- nem deveria ter barbearia própria. Sem esta linha, todo convite aberto
     -- viraria um alarme falso.
     and not exists (
           select 1 from public.salon_invites si
            where lower(si.email) = lower(u.email)
              and si.usado_em is null
              and si.expira_em > now()
         )
     -- 3 horas: uma hora pegaria quem só foi jantar; 24 avisariam quando a
     -- pessoa já esqueceu que tentou. Os dois casos reais de setembro
     -- desistiram em 3 minutos, então 3h pega todos e ainda dá para ligar no
     -- mesmo dia.
     and u.created_at < now() - interval '3 hours'
     -- Teto de 30 dias: sem ele a view varreria a tabela inteira para sempre.
     -- Sobrevive a um apagão longo do alarme, que é o que importa.
     and u.created_at > now() - interval '30 days'
$function$;

revoke all on function private.cadastros_parados() from public, anon, authenticated;
grant execute on function private.cadastros_parados() to service_role;

------------------------------------------------------------------------------
-- 2. As duas notícias
------------------------------------------------------------------------------
create or replace view public.auditoria_cadastro
with (security_invoker = on) as
select 'barbearia-nova:' || s.id::text as chave,
       'Barbearia nova' as tipo,
       'aviso' as gravidade,
       s.id as salon_id,
       s.created_at as ocorrido_em,
       'A barbearia "' || s.nome || '" se cadastrou' ||
       coalesce(' (telefone ' || s.telefone || ')', '') ||
       -- O DONO, e não o primeiro profissional da lista: num salão com três
       -- cadeiras o `limit 1` cru trazia o nome errado para o e-mail.
       coalesce('. Dono: ' || (
         select p.nome
           from public.professionals p
           join public.user_salons us
             on us.user_id = p.user_id and us.salon_id = s.id
          where p.salon_id = s.id and us.role = 'owner'
          order by p.id
          limit 1
       ), '') || '.' as detalhe
  from public.salons s
 where s.created_at > now() - interval '30 days'
union all
select 'conta-sem-barbearia:' || c.user_id::text,
       'Cadastro parado na metade',
       'aviso',
       -- Sem salão: é justamente o que não chegou a existir. A fila aceita
       -- nulo aqui (a `auditoria_crons` faz o mesmo).
       null::uuid,
       c.criada_em,
       'A conta ' || c.email || ' foi criada ha ' ||
       to_char(now() - c.criada_em, 'DD"d" HH24"h"') ||
       ' e nao virou barbearia. O segundo passo do cadastro falhou ou foi abandonado.'
  from private.cadastros_parados() c;

comment on view public.auditoria_cadastro is
  'Barbearia nova e conta que parou antes de virar barbearia. Entra na fila '
  '`auditoria_pendente`, que o n8n drena de 30 em 30 minutos por e-mail.';

------------------------------------------------------------------------------
-- 3. A fila, recriada por inteiro
------------------------------------------------------------------------------
-- `drop` + `create`, e não `create or replace`: é a regra da casa, porque o
-- replace perde em silêncio o `security_invoker` e os grants. Aqui a lista de
-- colunas nem muda, mas repetir o ritual custa nada e já custou caro não
-- repetir.
drop view public.auditoria_pendente;

create view public.auditoria_pendente
with (security_invoker = on) as
select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
  from (
         select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_do_agente
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_fronteira
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_operacao
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_avaliacao
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_atendimento
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_cobranca
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_comanda
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_entrega
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_mensagens
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_crons
   -- O membro novo (0185).
   union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_cadastro
       ) a
  left join auditoria_avisos av on av.chave = a.chave
 where av.chave is null
 order by case a.gravidade
            when 'grave' then 1
            when 'aviso' then 2
            else 3
          end,
          a.ocorrido_em desc;

-- Os grants que o `drop` levou junto, repostos à mão: só quem drena a fila.
revoke all on public.auditoria_pendente from public, anon, authenticated;
grant select on public.auditoria_pendente to service_role;
