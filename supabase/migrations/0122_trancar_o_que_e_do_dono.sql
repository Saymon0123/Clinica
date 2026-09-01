-- 0122: trancar o que é do dono (roteiro de consertos, passo 1.1)
--
-- Achados 2 e 3 da revisão de 01/09:
--
-- 1) A trava de "só dono muda papel" existia SÓ no JavaScript. No banco, a
--    policy `user_salons: gestor gerencia a equipe` era ALL com is_manager(),
--    que inclui GERENTE. Pela API direta, um gerente mudava o próprio role
--    para owner, apagava a linha do dono e, via `salons: gestor altera`,
--    trocava o organization_id — levando a unidade para outra rede.
--
-- 2) "Desativar" barbeiro só gravava professionals.ativo = false. O acesso vem
--    de user_salons, que ninguém apagava, e my_professional_ids() não filtrava
--    por ativo: o demitido continuava entrando e lendo agenda e clientes.
--
-- A partir daqui: escrita em user_salons NÃO passa mais por PostgREST direto.
-- Papel e desligamento viram RPC definer com checagem de dono e trava do
-- último dono. E salons perde organization_id da lista de colunas que
-- `authenticated` pode alterar — mudar de rede é operação nossa, não do CRM.

-- ------------------------------------------------------------------
-- 1) Fim da escrita direta em user_salons
-- ------------------------------------------------------------------
drop policy if exists "user_salons: gestor gerencia a equipe" on public.user_salons;
-- As duas policies de SELECT continuam: cada um vê os próprios vínculos, e o
-- gestor vê a equipe (é o que a tela Equipe lê).

-- ------------------------------------------------------------------
-- 2) salons: gestor altera, menos o que muda a dona da unidade
--    Grant por coluna é o que trava — a policy sozinha não distingue coluna.
-- ------------------------------------------------------------------
revoke update on public.salons from authenticated;
grant update (
  nome, endereco, telefone, horario_funcionamento, meta_faturamento_mensal,
  folga_entre_atendimentos_minutos, atraso_tolerado_minutos,
  reativacao_dias, reativacao_dias_2, troco_padrao, google_review_url
) on public.salons to authenticated;
-- Fora da lista de propósito: id, created_at, organization_id, ativo,
-- remetente_phone_number_id. Nenhum deles é editável pelo CRM hoje.

-- ------------------------------------------------------------------
-- 3) O demitido perde o acesso: my_professional_ids só devolve ativo
-- ------------------------------------------------------------------
create or replace function private.my_professional_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from professionals where user_id = (select auth.uid()) and ativo
$$;

-- ------------------------------------------------------------------
-- 4) Trocar papel: só dono, e nunca deixando o salão sem dono
-- ------------------------------------------------------------------
create or replace function public.definir_papel_do_membro(p_vinculo_id uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_vinculo public.user_salons%rowtype;
  v_outros_donos int;
begin
  if p_papel not in ('owner', 'gerente', 'barbeiro') then
    raise exception 'Papel invalido.' using errcode = '22023';
  end if;

  select * into v_vinculo from public.user_salons where id = p_vinculo_id;
  if not found then
    raise exception 'Vinculo nao encontrado.' using errcode = '42501';
  end if;

  -- Só DONO DESTA unidade mexe em papel. is_manager() não serve aqui: era
  -- exatamente ele que deixava o gerente se promover.
  if not exists (
    select 1 from public.user_salons u
     where u.salon_id = v_vinculo.salon_id
       and u.user_id = (select auth.uid())
       and u.role = 'owner'
  ) then
    raise exception 'Apenas o dono pode mudar o papel de alguem.' using errcode = '42501';
  end if;

  -- Rebaixar o último dono deixaria a barbearia órfã: ninguém poderia
  -- promover outro, e a unidade ficaria sem quem cancela ou paga.
  if v_vinculo.role = 'owner' and p_papel <> 'owner' then
    select count(*) into v_outros_donos
      from public.user_salons u
     where u.salon_id = v_vinculo.salon_id and u.role = 'owner' and u.id <> v_vinculo.id;
    if v_outros_donos = 0 then
      raise exception 'Esta barbearia ficaria sem dono. Promova outra pessoa antes.'
        using errcode = '23514';
    end if;
  end if;

  update public.user_salons set role = p_papel where id = p_vinculo_id;
end;
$$;
revoke all on function public.definir_papel_do_membro(uuid, text) from public, anon;
grant execute on function public.definir_papel_do_membro(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 5) Tirar da equipe: apaga o ACESSO, não só o "ativo"
-- ------------------------------------------------------------------
create or replace function public.tirar_da_equipe(p_vinculo_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_vinculo public.user_salons%rowtype;
  v_outros_donos int;
begin
  select * into v_vinculo from public.user_salons where id = p_vinculo_id;
  if not found then
    raise exception 'Vinculo nao encontrado.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_salons u
     where u.salon_id = v_vinculo.salon_id
       and u.user_id = (select auth.uid())
       and u.role = 'owner'
  ) then
    raise exception 'Apenas o dono pode tirar alguem da equipe.' using errcode = '42501';
  end if;

  if v_vinculo.role = 'owner' then
    select count(*) into v_outros_donos
      from public.user_salons u
     where u.salon_id = v_vinculo.salon_id and u.role = 'owner' and u.id <> v_vinculo.id;
    if v_outros_donos = 0 then
      raise exception 'Esta barbearia ficaria sem dono. Promova outra pessoa antes.'
        using errcode = '23514';
    end if;
  end if;

  -- O profissional NÃO é apagado: o histórico de atendimento, comissão e
  -- comanda dele continua de pé. Ele só perde o acesso e sai da agenda.
  update public.professionals
     set ativo = false
   where salon_id = v_vinculo.salon_id and user_id = v_vinculo.user_id;

  delete from public.user_salons where id = p_vinculo_id;
end;
$$;
revoke all on function public.tirar_da_equipe(uuid) from public, anon;
grant execute on function public.tirar_da_equipe(uuid) to authenticated;
