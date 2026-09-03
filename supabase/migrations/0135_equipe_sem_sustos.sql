-- 0135: Equipe sem sustos (Parte 3, passo 3.8 — achados 42, 43 e 44).
--
-- Duas RPCs, pelos mesmos motivos da 0128 e da 0133: escritas que só fazem
-- sentido juntas vão para dentro de uma transação no banco, e o que a tela não
-- pode mais fazer direto (UPDATE em `salon_invites`, revogado na 0128) ganha um
-- caminho estreito e autorizado.
--
-- 1. `salvar_jornada` (achado 43). A tela fazia DELETE e depois INSERT em duas
--    chamadas separadas. Falha no meio — rede caindo entre as duas — deixava o
--    barbeiro SEM JORNADA NENHUMA, com a mensagem "não foi possível salvar",
--    que sugere que nada mudou. Barbeiro sem jornada não recebe reserva do
--    agente nem do QR: um dia inteiro de horários que nunca chegaram. Aqui a
--    validação vem antes de apagar qualquer coisa, e apagar + gravar caem
--    juntos ou não caem. Os 7 dias são gravados sempre, com `ativo = false`
--    marcando folga — semana inteira de folga deixa de ser indistinguível de
--    "nunca configurou" (zero linhas). Quem lê a jornada já filtra `ps.ativo`
--    (horarios_livres desde a 0065, as views da 0088, a auditoria da 0046).
--
-- 2. `editar_convite` (achado 44). Função e comissão do convite não podiam ser
--    corrigidas depois de gerado — só o e-mail. O único caminho era cancelar e
--    refazer, matando o link já enviado.
create or replace function public.salvar_jornada(p_professional_id uuid, p_dias jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_salon uuid;
  v_dia jsonb;
  v_num int;
  v_ativo boolean;
  v_inicio text;
  v_fim text;
  v_vistos int[] := '{}';
begin
  select p.salon_id into v_salon from public.professionals p where p.id = p_professional_id;

  -- Definer ignora RLS: a autorização é esta. Gestor da unidade (ativa), e só.
  if v_salon is null
     or v_salon not in (select private.salon_ids())
     or not private.is_manager(v_salon) then
    raise exception 'Só o dono ou o gerente da barbearia altera a jornada de um barbeiro.' using errcode = '42501';
  end if;

  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) <> 7 then
    raise exception 'A jornada precisa dos 7 dias da semana.' using errcode = '22023';
  end if;

  -- Valida TUDO antes de apagar qualquer coisa: uma linha ruim não pode deixar
  -- o barbeiro sem jornada.
  for v_dia in select value from jsonb_array_elements(p_dias) loop
    if jsonb_typeof(v_dia) <> 'object' or coalesce(v_dia->>'dia_semana', '') !~ '^[0-6]$' then
      raise exception 'Dia da semana inválido na jornada.' using errcode = '22023';
    end if;
    v_num := (v_dia->>'dia_semana')::int;
    if v_num = any(v_vistos) then
      raise exception 'Dia % repetido na jornada.', v_num using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_num;

    v_ativo := coalesce(v_dia->>'ativo', 'false') in ('true', 't', '1');
    v_inicio := v_dia->>'hora_inicio';
    v_fim := v_dia->>'hora_fim';
    if coalesce(v_inicio, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]'
       or coalesce(v_fim, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]' then
      raise exception 'Hora inválida no dia %: informe entrada e saída como HH:MM.', v_num using errcode = '22023';
    end if;
    if v_ativo and v_inicio::time >= v_fim::time then
      raise exception 'No dia %, a saída precisa ser depois da entrada.', v_num using errcode = '22023';
    end if;
  end loop;

  -- Apagar e gravar na mesma transação: ou a jornada nova inteira, ou a antiga
  -- intacta.
  delete from public.professional_schedules where professional_id = p_professional_id;
  insert into public.professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
  select p_professional_id,
         (d->>'dia_semana')::int,
         (d->>'hora_inicio')::time,
         (d->>'hora_fim')::time,
         coalesce(d->>'ativo', 'false') in ('true', 't', '1')
    from jsonb_array_elements(p_dias) d;
end;
$function$;

comment on function public.salvar_jornada(uuid, jsonb) is
  'Grava a jornada semanal do barbeiro (7 dias, ativo=false marca folga) numa transacao: valida tudo, apaga a antiga e insere a nova. So gestor da unidade.';

revoke all on function public.salvar_jornada(uuid, jsonb) from public, anon;
grant execute on function public.salvar_jornada(uuid, jsonb) to authenticated;


create or replace function public.editar_convite(p_convite_id uuid, p_role text, p_comissao numeric default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_convite public.salon_invites%rowtype;
begin
  select * into v_convite from public.salon_invites where id = p_convite_id;

  if v_convite.id is null
     or v_convite.salon_id not in (select private.salon_ids())
     or not private.is_manager(v_convite.salon_id) then
    raise exception 'Você não gerencia esta barbearia.' using errcode = '42501';
  end if;

  if v_convite.usado_em is not null then
    raise exception 'Este convite já foi aceito: mude a função e a comissão na lista da equipe.' using errcode = '22023';
  end if;

  -- O convite de dono é da operação (0128): não vira gerente nem barbeiro por
  -- aqui, e ninguém vira dono por aqui.
  if v_convite.role = 'owner' then
    raise exception 'Convite de dono não se edita por aqui.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('gerente', 'barbeiro') then
    raise exception 'Função inválida: use gerente ou barbeiro.' using errcode = '22023';
  end if;
  if p_comissao is not null and (p_comissao < 0 or p_comissao > 100) then
    raise exception 'A comissão deve ficar entre 0 e 100.' using errcode = '22023';
  end if;

  update public.salon_invites
     set role = p_role,
         comissao_percentual = p_comissao
   where id = p_convite_id;
end;
$function$;

comment on function public.editar_convite(uuid, text, numeric) is
  'Corrige funcao e comissao de um convite PENDENTE (nunca de dono). So gestor da unidade. O UPDATE direto em salon_invites foi revogado na 0128.';

revoke all on function public.editar_convite(uuid, text, numeric) from public, anon;
grant execute on function public.editar_convite(uuid, text, numeric) to authenticated;
