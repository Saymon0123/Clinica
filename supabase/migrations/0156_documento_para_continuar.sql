-- 0156: sem documento de quem paga, o teste acaba e o acesso não renova (M2 do
-- giro de 10/09).
--
-- O BURACO. Sem CPF/CNPJ o `cobrar-uso` não emite o Pix: a fatura fica aberta,
-- sem `cobranca_vence_em`, e o bloqueio — que só olha cobrança vencida — nunca
-- chegava. `estender_acesso_sem_debito` renovava o acesso toda madrugada: quem
-- não cadastrava documento usava o produto de graça, para sempre.
--
-- A DECISÃO (dono, 10/09). Trabalhar com "emite nota fiscal = SIM". Isso escolhe
-- o desenho: o documento não deixa de bloquear, ele muda O QUE bloqueia. O
-- portão sai da frente da cobrança e vai para a frente do acesso. Terminou o
-- teste sem documento válido, o acesso não renova e bloqueia como qualquer
-- inadimplência: o CRM tranca, o WhatsApp segue os 3 dias de sempre, e a tela
-- de bloqueio pede o documento ali mesmo.
--
-- QUAL DOCUMENTO. O mesmo que o `cobrar-uso` usa para emitir: o da rede quando
-- a cobrança é unificada, senão o da assinatura da unidade. E só documento
-- VÁLIDO (`private.documento_valido`, com dígito verificador): um CPF com dígito
-- trocado passaria pelo `cobrar-uso`, seria recusado lá na frente, e a
-- barbearia voltaria a usar de graça.
--
-- DESTRAVA NA HORA. Gatilhos em `subscriptions` e `organizations` aplicam a
-- régua do cron à unidade que acabou de cadastrar o documento. Sem isso o dono
-- salvaria o CPF e continuaria trancado até a madrugada seguinte, concluindo que
-- o sistema não gravou. A régua mora num lugar só, `private.estender_acesso`: o
-- cron chama para todas as unidades, os gatilhos para uma.
--
-- A TELA. `situacao_do_acesso` passa a dizer se o documento está em dia e, com o
-- acesso bloqueado, o motivo — que muda o que o dono precisa fazer: cadastrar o
-- documento, pagar a cobrança, ou nada (cancelou). Coluna nova muda o tipo de
-- retorno, então a função é recriada (drop + create) com as permissões da 0131.

-- ---------------------------------------------------------------------------
-- 1. O documento de cobrança da unidade está em dia?
-- ---------------------------------------------------------------------------
create or replace function private.documento_de_cobranca_ok(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((
    select case
             when o.cobranca_unificada then private.documento_valido(o.cpf_cnpj)
             else private.documento_valido(sub.cpf_cnpj)
           end
      from public.salons s
      left join public.organizations o on o.id = s.organization_id
      left join public.subscriptions sub on sub.salon_id = s.id
     where s.id = p_salon_id
  ), false);
$$;

comment on function private.documento_de_cobranca_ok(uuid) is
  'O documento de quem paga a unidade e valido? O da rede quando a cobranca e unificada, senao o da assinatura -- a mesma escolha do cobrar-uso. Condicao para renovar o acesso depois do teste (0156, M2).';

revoke all on function private.documento_de_cobranca_ok(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A régua de renovar, num lugar só
-- ---------------------------------------------------------------------------
create or replace function private.estender_acesso(p_salon_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mexidas integer;
begin
  update public.subscriptions sub
     set acesso_ate = v_hoje + 1, atendimento_ate = v_hoje + 8, updated_at = now()
    from public.salons s
   where s.id = sub.salon_id and s.ativo and sub.status <> 'cancelada'
     and (p_salon_id is null or sub.salon_id = p_salon_id)
     and sub.trial_ate is not null and sub.trial_ate < v_hoje
     and sub.acesso_ate is not null and sub.acesso_ate <= v_hoje
     -- M2: sem documento válido de quem paga, o teste acaba e ponto.
     and private.documento_de_cobranca_ok(sub.salon_id)
     and not exists (
       select 1 from public.faturas_de_uso f
        where f.salon_id = sub.salon_id and f.paga_em is null and f.valor > 0
          and f.cobranca_vence_em is not null and f.cobranca_vence_em < v_hoje
     );
  get diagnostics v_mexidas = row_count;
  return v_mexidas;
end;
$$;

comment on function private.estender_acesso(uuid) is
  'Renova o acesso de quem terminou o teste, tem documento valido de quem paga e nao tem cobranca vencida. Sem argumento, todas as unidades (o cron); com argumento, uma so (os gatilhos de documento). 0156, M2.';

revoke all on function private.estender_acesso(uuid) from public, anon, authenticated;

-- O cron `estende-acesso-sem-debito` segue chamando o nome de sempre. O replace
-- preserva as permissões (ninguém além do dono do banco executa).
create or replace function public.estender_acesso_sem_debito()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return private.estender_acesso(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Cadastrar o documento destrava na hora
-- ---------------------------------------------------------------------------
create or replace function private.trg_documento_libera_acesso()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_table_name = 'subscriptions' then
    perform private.estender_acesso(new.salon_id);
  else
    -- Rede: o documento dela vale para todas as unidades com cobrança unificada.
    perform private.estender_acesso(s.id)
       from public.salons s
      where s.organization_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.trg_documento_libera_acesso() from public, anon, authenticated;

-- O UPDATE que o gatilho dispara mexe em `acesso_ate`, não em `cpf_cnpj`: o
-- `of cpf_cnpj` não dispara de novo, então não há recursão.
drop trigger if exists trg_documento_libera_acesso on public.subscriptions;
create trigger trg_documento_libera_acesso
  after update of cpf_cnpj on public.subscriptions
  for each row
  when (new.cpf_cnpj is distinct from old.cpf_cnpj)
  execute function private.trg_documento_libera_acesso();

drop trigger if exists trg_documento_da_rede_libera_acesso on public.organizations;
create trigger trg_documento_da_rede_libera_acesso
  after update of cpf_cnpj, cobranca_unificada on public.organizations
  for each row
  when (new.cpf_cnpj is distinct from old.cpf_cnpj
        or new.cobranca_unificada is distinct from old.cobranca_unificada)
  execute function private.trg_documento_libera_acesso();

-- ---------------------------------------------------------------------------
-- 4. A tela sabe por que está bloqueada
-- ---------------------------------------------------------------------------
drop function if exists public.situacao_do_acesso(uuid);

create function public.situacao_do_acesso(p_salon_id uuid)
returns table (
  status text,
  acesso_ate date,
  atendimento_ate date,
  bloqueado boolean,
  atendendo boolean,
  documento_ok boolean,
  motivo_do_bloqueio text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with hoje as (
    -- Data de São Paulo, não `current_date` (UTC): ver a 0131.
    select (now() at time zone 'America/Sao_Paulo')::date as d
  )
  select sub.status,
         sub.acesso_ate,
         coalesce(sub.atendimento_ate, sub.acesso_ate + 3) as atendimento_ate,
         (sub.acesso_ate is not null and sub.acesso_ate < h.d) as bloqueado,
         (sub.acesso_ate is null
            or coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= h.d) as atendendo,
         -- Um booleano, não o documento: a RPC atende a equipe inteira, e o CPF
         -- do dono continua só na tabela, só para ele.
         private.documento_de_cobranca_ok(sub.salon_id) as documento_ok,
         case
           when sub.acesso_ate is null or sub.acesso_ate >= h.d then null
           when sub.status = 'cancelada' then 'cancelada'
           when not private.documento_de_cobranca_ok(sub.salon_id) then 'sem_documento'
           when exists (
             select 1 from public.faturas_de_uso f
              where f.salon_id = sub.salon_id and f.paga_em is null and f.valor > 0
                and f.cobranca_vence_em is not null and f.cobranca_vence_em < h.d
           ) then 'cobranca_vencida'
           else 'vencido'
         end as motivo_do_bloqueio
    from public.subscriptions sub
    cross join hoje h
   where sub.salon_id = p_salon_id
     -- Definer ignora RLS: a autorização é esta linha (ver a 0131).
     and p_salon_id in (select private.salon_ids());
$$;

comment on function public.situacao_do_acesso(uuid) is
  'Situacao do acesso de uma unidade para QUALQUER vinculo dela: status, prazos, os dois booleanos da tela de bloqueio, se o documento de quem paga esta em dia e, bloqueada, o motivo (sem_documento, cobranca_vencida, cancelada ou vencido). Nao devolve cpf_cnpj -- por isso existe em vez de abrir a policy da tabela. 0131, motivo e documento na 0156.';

revoke all on function public.situacao_do_acesso(uuid) from public, anon;
grant execute on function public.situacao_do_acesso(uuid) to authenticated;
