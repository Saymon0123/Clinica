-- 0114: correções da revisão de 29/08
-- 1) Revokes que faltaram (regra da 0095/0107: definer nunca executável por
--    anon/authenticated via RPC).
-- 2) Pausa da reativação só quando um convite de fato vence sem resposta —
--    a versão anterior pausava por contador acumulado a cada varredura de
--    15min, pegando cliente que ia responder tarde.
-- 3) Barbeiro pode DESFAZER movimento de estoque do próprio salão: o rollback
--    da venda deletava por RLS silenciosamente filtrado (só gestor tinha
--    DELETE) e o estoque ficava debitado para sempre.
-- 4) Versiona o drift: consumo_ia, precos_modelo e precificar_consumo_ia
--    existiam só no banco, fora de qualquer migration.

-- 1) Revokes
-- O revoke de `precificar_consumo_ia()` NÃO fica aqui: esta migration é quem
-- versiona essa função (seção 4), então num banco aplicado do zero ela ainda
-- não existe neste ponto e o revoke aborta com 42883 — foi o que derrubou o
-- CI. Em produção passava porque lá a função já existia por drift. O revoke
-- dela está no fim da seção 4, logo depois do create.
revoke all on function public.trg_reativacao_pos_atendimento() from public, anon, authenticated;

-- 2) Pausa apenas no vencimento real
create or replace function public.expira_reativacoes_sem_resposta()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_total integer;
begin
  with expiradas as (
    update public.appointments a
       set status = 'cancelado'
     where a.origem = 'reativacao'
       and a.status = 'agendado'
       and a.confirmacao_enviada
       and a.lembrete_respondido_em is null
       and a.data_hora_inicio < now() + interval '3 hours'
    returning a.client_id
  ),
  pausados as (
    -- só pausa quem deixou vencer AGORA e já está no segundo silêncio;
    -- quem responder antes do vencimento nunca entra aqui
    update public.clients c
       set reativacao_pausada_em = now()
     where c.id in (select client_id from expiradas)
       and c.reativacao_pausada_em is null
       and c.reativacao_sem_resposta >= 2
    returning c.id
  )
  select count(*) into v_total from expiradas;
  return v_total;
end;
$$;
revoke all on function public.expira_reativacoes_sem_resposta() from public, anon, authenticated;

-- 3) Rollback de estoque para qualquer membro do salão
drop policy if exists "stock_movements: membros desfazem do proprio salao" on public.stock_movements;
create policy "stock_movements: membros desfazem do proprio salao"
  on public.stock_movements for delete
  using (exists (
    select 1 from public.products p
     where p.id = product_id
       and p.salon_id in (select private.salon_ids())
  ));

-- 4) Drift versionado (idempotente: os objetos já existem em produção)
create table if not exists public.precos_modelo (
  modelo text not null,
  vigente_de date not null,
  usd_por_1k_entrada numeric,
  usd_por_1k_saida numeric,
  usd_por_minuto numeric,
  observacao text,
  primary key (modelo, vigente_de)
);
alter table public.precos_modelo enable row level security;
comment on table public.precos_modelo is
  'Tarifas dos modelos de IA. RLS ligada sem policy de propósito: só service_role lê/escreve (n8n).';

create table if not exists public.consumo_ia (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references public.salons(id),
  conversation_id uuid,
  tipo text not null,
  modelo text not null,
  medicao text not null default 'medido',
  tokens_entrada integer,
  tokens_saida integer,
  segundos_audio numeric,
  custo_usd numeric,
  execucao_n8n text,
  criado_em timestamptz not null default now()
);
alter table public.consumo_ia enable row level security;
comment on table public.consumo_ia is
  'Consumo de IA por salão, gravado pelo n8n. RLS ligada sem policy de propósito: o CRM não lê; só service_role.';
create index if not exists idx_consumo_ia_salon on public.consumo_ia (salon_id);

create or replace function public.precificar_consumo_ia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p public.precos_modelo%rowtype;
begin
  -- Quem ja mandou o custo pronto manda; a funcao nao sobrescreve.
  if new.custo_usd is not null then
    return new;
  end if;

  select * into p
    from public.precos_modelo
   where modelo = new.modelo
     and vigente_de <= (new.criado_em at time zone 'America/Sao_Paulo')::date
   order by vigente_de desc
   limit 1;

  if not found then
    return new;  -- sem preco cadastrado: fica nulo, e a tela dira "nao medido"
  end if;

  if new.tipo = 'transcricao' then
    -- Sem tarifa por minuto nao da para precificar audio. Zero mentiria.
    if p.usd_por_minuto is null then
      return new;
    end if;
    new.custo_usd := coalesce(new.segundos_audio, 0) / 60.0 * p.usd_por_minuto;
  else
    -- Idem para token: a tarifa de entrada e obrigatoria porque e ela que
    -- domina esta carga (o agente reenvia o historico a cada volta).
    if p.usd_por_1k_entrada is null then
      return new;
    end if;
    new.custo_usd :=
        coalesce(new.tokens_entrada, 0) / 1000.0 * p.usd_por_1k_entrada
      + coalesce(new.tokens_saida, 0) / 1000.0 * coalesce(p.usd_por_1k_saida, 0);
  end if;

  return new;
end;
$$;
-- nome igual ao que já existe em produção (verificado em pg_trigger)
drop trigger if exists consumo_ia_precificar on public.consumo_ia;
create trigger consumo_ia_precificar
  before insert on public.consumo_ia
  for each row execute function public.precificar_consumo_ia();

-- Revoke da seção 1 que precisava esperar a função existir (ver comentário lá
-- em cima). Mesma regra da 0095/0107: definer nunca executável via RPC por
-- anon/authenticated.
revoke all on function public.precificar_consumo_ia() from public, anon, authenticated;
