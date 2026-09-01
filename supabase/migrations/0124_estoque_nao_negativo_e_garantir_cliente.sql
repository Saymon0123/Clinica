-- 0124: travas de integridade (roteiro, passo 1.3)
--
-- a) Achado 9, parte 3: `estoque_atual` podia ficar negativo. A trava existia
--    só no navegador — quem chamasse a API direto, ou uma corrida entre duas
--    vendas do mesmo produto, furava. O trigger de movimento já usa
--    `greatest(0, ...)`, mas nada impedia um update solto de gravar -3.
--
-- b) Achado 11: o barbeiro travava PARA SEMPRE ao agendar um cliente que a RLS
--    esconde dele. A policy de leitura só mostra cliente que ele criou ou
--    atendeu; um cliente cadastrado por outro barbeiro é invisível — mas
--    existe, e o índice único de telefone recusa o cadastro. Resultado: a
--    busca não acha, o cadastro falha com erro técnico, e não há saída pela
--    tela.

-- a) Estoque nunca negativo
alter table public.products
  drop constraint if exists products_estoque_nao_negativo;
alter table public.products
  add constraint products_estoque_nao_negativo check (estoque_atual >= 0);

-- b) Resolver o cliente por telefone, por cima da RLS de leitura
create or replace function public.garantir_cliente(
  p_salon_id uuid, p_nome text, p_telefone text)
returns table (id uuid, nome text, ja_existia boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_digitos text;
  v_norm text;
  v_existente public.clients%rowtype;
  v_novo_id uuid;
begin
  -- Quem chama precisa ser da barbearia. Definer ignora RLS: a autorização
  -- mora aqui, e é ela que impede a função de virar consulta à base alheia.
  if p_salon_id not in (select private.salon_ids()) then
    raise exception 'Barbearia nao encontrada.' using errcode = '42501';
  end if;

  v_digitos := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_digitos) < 10 or length(v_digitos) > 13 then
    raise exception 'Telefone invalido: informe DDD e numero.' using errcode = '22023';
  end if;
  v_norm := right(v_digitos, 8);

  select * into v_existente
    from public.clients c
   where c.salon_id = p_salon_id and c.telefone_norm = v_norm
   limit 1;

  if found then
    -- Devolve id e NOME. O barbeiro vai atender essa pessoa — saber o nome de
    -- quem senta na cadeira dele não é vazamento; listar a base inteira, sim,
    -- e isso a RLS continua barrando.
    return query select v_existente.id, v_existente.nome, true;
    return;
  end if;

  insert into public.clients (salon_id, nome, telefone, created_by)
  values (p_salon_id, coalesce(nullif(btrim(p_nome), ''), 'Cliente'), p_telefone, (select auth.uid()))
  returning clients.id into v_novo_id;

  return query select v_novo_id, coalesce(nullif(btrim(p_nome), ''), 'Cliente'), false;
end;
$$;
revoke all on function public.garantir_cliente(uuid, text, text) from public, anon;
grant execute on function public.garantir_cliente(uuid, text, text) to authenticated;
