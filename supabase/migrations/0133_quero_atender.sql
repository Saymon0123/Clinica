-- 0133: o dono que não atende consegue virar barbeiro sem convite (Parte 2,
-- passo 2.7 — achado 24).
--
-- Quem cria a barbearia pela operação com "dono atende = não", ou entra por
-- convite de dono sem atender, não ganha linha em `professionals`. Depois, se
-- resolver cortar também, não há caminho: a aba Equipe só cria barbeiro por
-- convite, e convidar a si mesmo pede outro e-mail. Em produção há um dono
-- nessa situação hoje ("Gusta Barber").
--
-- Virou RPC, e não insert direto pela tela, por três motivos:
--
--   1. São TRÊS escritas que só fazem sentido juntas: o profissional, a jornada
--      (derivada do horário do salão, como `criar-minha-barbearia` e
--      `accept-invite` fazem) e o vínculo com os serviços. Sem o vínculo o
--      agente não tem o que oferecer com esse barbeiro; sem a jornada, a agenda
--      não sabe quando ele atende. Pela tela seriam três pedidos separados, e
--      o do meio falhando deixaria um barbeiro pela metade.
--   2. A derivação da jornada já existe em TypeScript nas edge functions
--      (`_shared/jornada.ts`), que o CRM não consegue importar. Uma terceira
--      cópia em `src/` era o caminho fácil; esta é a segunda, e no banco.
--   3. A policy de `professionals` deixa o gestor gravar QUALQUER user_id. Aqui
--      só se cria para quem está chamando — é "quero atender", não "cadastre
--      fulano".
create or replace function public.quero_atender(p_salon_id uuid, p_nome text, p_telefone text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := (select auth.uid());
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_horario jsonb;
  v_id uuid;
  v_dia record;
begin
  -- Definer ignora RLS: a autorização é esta. Dono da unidade (ativa), e só.
  if v_user is null
     or p_salon_id not in (select private.salon_ids())
     or not exists (
       select 1 from public.user_salons us
        where us.salon_id = p_salon_id and us.user_id = v_user and us.role = 'owner') then
    raise exception 'Só o dono da barbearia pode se cadastrar como barbeiro dela.' using errcode = '42501';
  end if;

  if v_nome is null then
    raise exception 'Informe o seu nome como barbeiro.' using errcode = '22023';
  end if;

  if p_telefone is not null and btrim(p_telefone) <> '' and not private.telefone_valido(p_telefone) then
    raise exception 'Telefone inválido: informe DDD e número.' using errcode = '22023';
  end if;

  -- Já atende: não há o que criar. Reativar um barbeiro desligado é decisão
  -- explícita na aba Equipe, não efeito colateral deste botão.
  if exists (select 1 from public.professionals p
              where p.salon_id = p_salon_id and p.user_id = v_user) then
    raise exception 'Você já está na equipe desta barbearia como barbeiro.' using errcode = '22023';
  end if;

  insert into public.professionals (salon_id, user_id, nome, telefone, ativo)
  values (p_salon_id, v_user, v_nome, nullif(btrim(coalesce(p_telefone, '')), ''), true)
  returning id into v_id;

  -- Jornada = horário do salão, dia a dia. Dia sem `abre`/`fecha`, ou com hora
  -- que não é hora (a lição da 0125: `{"abre": ""}` já derrubou a agenda), é
  -- dia sem jornada — não é motivo para o cadastro inteiro falhar.
  select s.horario_funcionamento into v_horario from public.salons s where s.id = p_salon_id;
  for v_dia in
    select case h.key when 'dom' then 0 when 'seg' then 1 when 'ter' then 2 when 'qua' then 3
                      when 'qui' then 4 when 'sex' then 5 when 'sab' then 6 end as dia_semana,
           h.value->>'abre' as abre,
           h.value->>'fecha' as fecha
      from jsonb_each(coalesce(v_horario, '{}'::jsonb)) h
     where jsonb_typeof(h.value) = 'object'
       and (h.value->>'abre') ~ '^[0-9]{1,2}:[0-9]{2}'
       and (h.value->>'fecha') ~ '^[0-9]{1,2}:[0-9]{2}'
  loop
    if v_dia.dia_semana is not null then
      insert into public.professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
      values (v_id, v_dia.dia_semana, v_dia.abre::time, v_dia.fecha::time, true);
    end if;
  end loop;

  -- Todos os serviços ativos do salão: é o mesmo padrão do cadastro inicial.
  -- O dono tira depois o que não faz; começar sem nenhum deixaria o agente
  -- sem o que oferecer com ele.
  insert into public.professional_services (professional_id, service_id)
  select v_id, sv.id from public.services sv
   where sv.salon_id = p_salon_id and sv.ativo;

  return v_id;
end;
$function$;

comment on function public.quero_atender(uuid, text, text) is
  'O dono da unidade se cadastra como barbeiro dela: profissional + jornada derivada do horario do salao + vinculo com todos os servicos ativos, numa transacao. So para o proprio auth.uid(). Recusa se ja tiver linha em professionals.';

revoke all on function public.quero_atender(uuid, text, text) from public, anon;
grant execute on function public.quero_atender(uuid, text, text) to authenticated;
