-- 0131: o bloqueio por vencimento passa a valer para todo mundo da unidade, e a
-- tela conta a mesma verdade que as views (Parte 2, passo 2.2 — achados 16 e 20).
--
-- ACHADO 16. A policy "subscriptions: dono le" (0022) só deixa o DONO ler a
-- assinatura. `useAssinatura` faz `.maybeSingle()`, recebe nada para barbeiro e
-- gerente, e o `AppLayout` entende "nada" como "barbearia antiga sem controle de
-- assinatura — não bloqueia". Resultado: unidade vencida, dono trancado do lado
-- de fora, e a equipe inteira usando o CRM normalmente. O comentário do próprio
-- `AppLayout` diz "o bloqueio vale para todos"; a policy é que não deixava.
--
-- O roteiro pedia "policy de SELECT para todos os vínculos". Não dá: na mesma
-- tabela moram `cpf_cnpj` e `asaas_customer_id` do pagador. Abrir a linha para
-- a equipe entregaria o CPF do dono a cada barbeiro. Grant por coluna não
-- resolve, porque dono e barbeiro são o mesmo papel (`authenticated`).
--
-- Então a situação do acesso vira uma RPC definer que devolve SÓ o que a tela
-- de bloqueio precisa — e nada do pagador. A policy da tabela fica como está.
--
-- ACHADO 20. A tolerância do WhatsApp depois do vencimento está escrita em
-- cinco migrations como `coalesce(atendimento_ate, acesso_ate + 3)`. A tela
-- tinha uma sexta versão: mostrava a data só quando a coluna estava
-- preenchida, e nunca dizia que o prazo já tinha passado. Aqui a régua é
-- calculada uma vez, no banco, e a tela só exibe.
create or replace function public.situacao_do_acesso(p_salon_id uuid)
returns table (
  status text,
  acesso_ate date,
  atendimento_ate date,
  bloqueado boolean,
  atendendo boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with hoje as (
    -- Data de São Paulo, não `current_date` (UTC no Supabase): às 22h do
    -- último dia pago, o UTC já virou e a tela diria "venceu" para quem ainda
    -- tem duas horas. As views de disparo usam `current_date`; a diferença é
    -- de horas em volta da meia-noite e está anotada no backlog.
    select (now() at time zone 'America/Sao_Paulo')::date as d
  )
  select sub.status,
         sub.acesso_ate,
         coalesce(sub.atendimento_ate, sub.acesso_ate + 3) as atendimento_ate,
         (sub.acesso_ate is not null and sub.acesso_ate < h.d) as bloqueado,
         (sub.acesso_ate is null
            or coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= h.d) as atendendo
    from public.subscriptions sub
    cross join hoje h
   where sub.salon_id = p_salon_id
     -- Definer ignora RLS: a autorização é esta linha. Qualquer vínculo ativo
     -- da unidade — é para isso que a função existe. Fora dela, linha nenhuma,
     -- que é o mesmo que a policy da tabela devolve.
     and p_salon_id in (select private.salon_ids());
$$;

comment on function public.situacao_do_acesso(uuid) is
  'Situacao do acesso de uma unidade para QUALQUER vinculo dela: status, prazos e os dois booleanos que a tela de bloqueio usa. Nao devolve cpf_cnpj nem asaas_* -- por isso existe em vez de abrir a policy da tabela. A regua do WhatsApp (atendimento_ate ou acesso_ate + 3) e calculada aqui, uma vez.';

revoke all on function public.situacao_do_acesso(uuid) from public, anon;
grant execute on function public.situacao_do_acesso(uuid) to authenticated;

-- A régua tinha um buraco que a RPC acima expôs ao ser testada: com
-- `acesso_ate` NULO — "sem vencimento automático", a barbearia que já paga por
-- fora, criada pela operação — `coalesce(atendimento_ate, acesso_ate + 3)` é
-- nulo, a comparação é nula, e as duas views deixavam a barbearia de fora. O
-- CRM (`useAssinatura`) sempre tratou nulo como "nunca vence". Duas verdades.
--
-- Hoje nenhuma assinatura está nesse estado; a correção é para as views
-- passarem a dizer o mesmo que a RPC e que a intenção documentada em
-- `admin-create-salon`. Só o WHERE muda; as colunas ficam idênticas, então
-- `create or replace` serve — mas o `security_invoker` precisa ser repetido,
-- porque o replace não carrega as reloptions da versão anterior.
create or replace view public.salons_com_automacao
with (security_invoker = on) as
select s.id,
       s.nome,
       sub.plan_codigo,
       sub.status,
       sub.acesso_ate,
       sub.atendimento_ate
  from public.salons s
  join public.subscriptions sub on sub.salon_id = s.id
 where s.ativo
   and (sub.acesso_ate is null
        or coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= current_date);

create or replace view public.salons_atendendo
with (security_invoker = on) as
select s.id,
       s.nome,
       s.endereco,
       s.telefone,
       s.horario_funcionamento,
       s.created_at,
       s.meta_faturamento_mensal,
       s.organization_id,
       s.ativo,
       s.google_review_url
  from public.salons s
  left join public.subscriptions sub on sub.salon_id = s.id
 where s.ativo
   and (sub.salon_id is null
        or sub.acesso_ate is null
        or coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= current_date)
   and (sub.status is distinct from 'trial'
        or not exists (
          select 1 from public.uso_do_agente u
           where u.salon_id = s.id
             and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400)));
