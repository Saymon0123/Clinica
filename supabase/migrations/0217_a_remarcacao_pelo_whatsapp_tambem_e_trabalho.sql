-- A remarcação pelo WhatsApp também é trabalho, e passa a ser cobrada.
--
-- Até aqui a fatura contava LINHAS de `agendamentos_cobraveis`, agrupadas pelo
-- dia em que o agendamento nasceu. Isso cobrava uma vez por horário: o cliente
-- podia remarcar três vezes pelo WhatsApp e o agente trabalhava três vezes de
-- graça.
--
-- **Por que não dava para só contar a coluna que já existia.**
-- `remarcado_pelo_cliente_em` é UM carimbo, sobrescrito a cada remarcação — ele
-- sabe dizer "houve pelo menos uma", nunca "houve duas", e muito menos em que
-- mês cada uma caiu. Cobrança precisa de EVENTO, com data própria, senão a
-- remarcação de novembro cairia na fatura de outubro só porque o horário nasceu
-- em outubro.
--
-- **A regra, decidida pelo dono em 07/10 (opção A).** Cobra-se a remarcação de
-- horário que NASCEU no WhatsApp (`origem = 'agente'`), não importa se o
-- cliente remarcou falando com o agente ou pela página de gestão — o link de
-- gestão só existe porque o agente o mandou. A alternativa estrita (parâmetro
-- de canal novo em `remarcar_pelo_cliente`, mexendo em n8n e edge function)
-- ficou de fora por ser mais superfície para o mesmo resultado.
--
-- **Quem NÃO entra, e continua não entrando:** link público, balcão (CRM) e
-- bloqueio de agenda. E o barbeiro arrastando o horário na grade não é
-- remarcação do cliente: só `remarcar_pelo_cliente` grava o carimbo — conferido,
-- é a única função no banco que o escreve.
--
-- Zero faturas emitidas até hoje, então o retroativo não muda valor de ninguém.

-- ------------------------------------------------------------- 1) Os eventos

create table if not exists public.eventos_cobraveis (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  tipo text not null check (tipo in ('agendamento', 'remarcacao')),
  ocorrido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

comment on table public.eventos_cobraveis is
  'Uma linha por evento que gera cobranca. Substitui a contagem de linhas de agendamentos_cobraveis porque a remarcacao precisa de data propria: ela cai no mes em que aconteceu, nao no mes em que o horario nasceu.';

-- O agendamento e cobrado UMA vez por horario. A remarcacao pode repetir, e por
-- isso fica de fora do indice: o cliente que remarca tres vezes gera tres.
create unique index if not exists eventos_cobraveis_um_agendamento_por_horario
  on public.eventos_cobraveis (appointment_id)
  where tipo = 'agendamento';

create index if not exists eventos_cobraveis_salao_quando
  on public.eventos_cobraveis (salon_id, ocorrido_em);

-- Ninguem le pelo REST: e dinheiro, e so o service_role e as funcoes definer
-- tem o que fazer aqui. Mesmo desenho de `avisos_do_imprevisto` (0215).
alter table public.eventos_cobraveis enable row level security;
revoke all on public.eventos_cobraveis from anon, authenticated;

-- ------------------------------------------------------- 2) Quem grava, e quando

create or replace function private.registrar_evento_cobravel()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    -- As DUAS portas do nascimento. A segunda -- reativacao que ja chega
    -- confirmada -- foi um buraco que o pgTAP antigo (`um_numero_so`) pegou: a
    -- regra da view contava aquela linha, e o gatilho, que so tratava a
    -- confirmacao no UPDATE, deixava passar de graca. Importacao, correcao a
    -- mao ou um caminho futuro que insira pronta precisa cobrar igual.
    if (new.origem = 'agente'
        or (new.origem = 'reativacao' and new.reativacao_confirmada_em is not null))
       and new.status <> 'bloqueio' then
      insert into public.eventos_cobraveis (salon_id, appointment_id, tipo, ocorrido_em)
      values (new.salon_id, new.id, 'agendamento',
              coalesce(new.reativacao_confirmada_em, new.created_at))
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- A reativacao so vira cobranca quando o cliente CONFIRMA. Convite ignorado
  -- nao custa nada -- e a mesma regra que ja valia na view antiga.
  if new.origem = 'reativacao'
     and new.reativacao_confirmada_em is not null
     and old.reativacao_confirmada_em is null then
    insert into public.eventos_cobraveis (salon_id, appointment_id, tipo, ocorrido_em)
    values (new.salon_id, new.id, 'agendamento', new.reativacao_confirmada_em)
    on conflict do nothing;
  end if;

  -- A remarcacao. O carimbo so e escrito por `remarcar_pelo_cliente`, entao
  -- barbeiro arrastando o horario na grade NAO cai aqui -- conferido: e a unica
  -- funcao do banco que mexe nessa coluna.
  if new.origem = 'agente'
     and new.remarcado_pelo_cliente_em is not null
     and new.remarcado_pelo_cliente_em is distinct from old.remarcado_pelo_cliente_em then
    insert into public.eventos_cobraveis (salon_id, appointment_id, tipo, ocorrido_em)
    values (new.salon_id, new.id, 'remarcacao', new.remarcado_pelo_cliente_em);
  end if;

  return new;
end $$;

drop trigger if exists registrar_evento_cobravel on public.appointments;
create trigger registrar_evento_cobravel
  after insert or update on public.appointments
  for each row execute function private.registrar_evento_cobravel();

revoke all on function private.registrar_evento_cobravel() from public, anon, authenticated;

-- --------------------------------------------------------------- 3) Retroativo
--
-- Um evento por horario cobravel que ja existe, com a data de criacao ORIGINAL
-- -- senao os 584 de hoje cairiam todos na fatura deste mes.

insert into public.eventos_cobraveis (salon_id, appointment_id, tipo, ocorrido_em)
select c.salon_id, c.id, 'agendamento', c.created_at
  from public.agendamentos_cobraveis c
on conflict do nothing;

-- ------------------------------------------------------- 4) A fatura, por evento

alter table public.faturas_de_uso
  add column if not exists remarcacoes integer not null default 0;

comment on column public.faturas_de_uso.remarcacoes is
  'Quantas das cobrancas do periodo sao remarcacao, e nao agendamento novo. So para o detalhamento: o valor ja soma as duas.';

create or replace function public.gerar_fatura_de_uso(
  p_salon_id uuid, p_inicio date, p_fim date, p_motivo text default 'mensal'
)
returns public.faturas_de_uso
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_barbeiros integer;
  v_preco numeric;
  v_cobrancas integer;
  v_remarcacoes integer;
  v_lembretes integer;
  v_reativacoes integer;
  v_valor_gerado numeric;
  v_detalhe jsonb;
  v_fatura public.faturas_de_uso;
  v_trial_ate date;
  v_ultimo_faturado date;
begin
  if not exists (select 1 from public.salons s where s.id = p_salon_id and s.cobravel) then
    return null;
  end if;

  select s.trial_ate into v_trial_ate
    from public.subscriptions s where s.salon_id = p_salon_id;
  if v_trial_ate is not null and p_inicio <= v_trial_ate then
    p_inicio := v_trial_ate + 1;
  end if;

  select max(f.periodo_fim) into v_ultimo_faturado
    from public.faturas_de_uso f where f.salon_id = p_salon_id;
  if v_ultimo_faturado is not null and p_inicio <= v_ultimo_faturado then
    p_inicio := v_ultimo_faturado + 1;
  end if;

  if p_inicio > p_fim then
    return null;
  end if;

  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  if found then
    return v_fatura;
  end if;

  select count(*) into v_barbeiros
    from public.professionals p
   where p.salon_id = p_salon_id and p.ativo;

  v_preco := public.preco_por_uso(v_barbeiros);

  -- O CORACAO DA MUDANCA: conta EVENTOS, nao linhas de agendamento. Um horario
  -- marcado e remarcado duas vezes pelo WhatsApp gera tres cobrancas, cada uma
  -- no mes em que aconteceu.
  --
  -- `valor_gerado` soma so os agendamentos: e quanto a barbearia FATUROU, e a
  -- remarcacao nao traz dinheiro novo -- somar de novo inflaria o numero que o
  -- dono usa para comparar com o que paga.
  select count(*),
         count(*) filter (where e.tipo = 'remarcacao'),
         coalesce(sum(a.valor_servico) filter (where e.tipo = 'agendamento'), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'quando', to_char(e.ocorrido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'tipo', e.tipo,
               'data', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'hora', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
               'servico', coalesce(a.servicos, '—'),
               'valor_servico', case when e.tipo = 'agendamento' then a.valor_servico else 0 end,
               'status', a.status
             )
             order by e.ocorrido_em
           ),
           '[]'::jsonb
         )
    into v_cobrancas, v_remarcacoes, v_valor_gerado, v_detalhe
    from public.eventos_cobraveis e
    left join public.agendamentos_cobraveis a on a.id = e.appointment_id
   where e.salon_id = p_salon_id
     and (e.ocorrido_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(*) into v_lembretes
    from public.appointments a
   where a.salon_id = p_salon_id and a.lembrete_enviado
     and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(*) into v_reativacoes
    from public.reativacao_envios r
   where r.salon_id = p_salon_id
     and (r.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  insert into public.faturas_de_uso (
    salon_id, periodo_inicio, periodo_fim, motivo, barbeiros, preco_unitario,
    agendamentos, remarcacoes, lembretes, reativacoes, valor, valor_gerado, detalhe
  ) values (
    p_salon_id, p_inicio, p_fim, p_motivo, v_barbeiros, coalesce(v_preco, 0.75),
    v_cobrancas, v_remarcacoes, v_lembretes, v_reativacoes,
    round(coalesce(v_preco, 0.75) * v_cobrancas, 2), v_valor_gerado, v_detalhe
  )
  on conflict (salon_id, periodo_inicio, periodo_fim, motivo) do nothing;

  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  return v_fatura;
end $$;

comment on function public.gerar_fatura_de_uso(uuid, date, date, text) is
  'Fecha a fatura de um periodo contando EVENTOS cobraveis (agendamento pelo agente, reativacao confirmada, remarcacao pelo cliente de horario nascido no agente). A coluna agendamentos guarda o TOTAL de cobrancas; remarcacoes diz quantas delas foram remarcacao.';

revoke all on function public.gerar_fatura_de_uso(uuid, date, date, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
