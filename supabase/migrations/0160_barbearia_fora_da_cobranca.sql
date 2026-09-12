-- 0160: barbearia que não se cobra (decidido pelo dono em 12/09).
--
-- O CASO REAL. A El Guardians é a barbearia de teste do próprio dono, dentro do
-- banco de produção. Ela sai do teste grátis em 19/09, e a partir daí o
-- fechamento do dia 1º geraria fatura — com o AbacatePay já em produção, isso é
-- **PIX de verdade cobrando o dono dele mesmo**. Decisão: fica fora da cobrança.
--
-- POR QUE UMA COLUNA, E NÃO UM REMENDO. As duas saídas fáceis mentem: desligar
-- o cron `fechamento-mensal-de-uso` tira a cobrança de TODO mundo, e empurrar
-- `trial_ate` para 2030 deixa no banco um "teste grátis de quatro anos" que a
-- próxima pessoa lê como bug. O que é verdade é outra coisa: esta barbearia não
-- é cliente. Isso é um fato dela, e fato de entidade mora em coluna.
--
-- ONDE A TRAVA FICA. Dentro de `gerar_fatura_de_uso`, pelo mesmo motivo que a
-- 0130 escreveu ali a trava do teste grátis: é a porta única de criação de
-- fatura. O fechamento mensal e a fatura de cancelamento passam os dois por
-- aqui, então a regra vale para os dois sem ser escrita duas vezes.
--
-- O QUE NÃO MUDA: o acesso. Barbearia fora da cobrança continua sujeita ao
-- documento (0156) e ao cron de acesso como qualquer outra — o que ela não tem
-- é fatura. Medir o uso continua igual: a tela mostra tudo, só avisa que não
-- vira conta.

alter table public.salons
  add column if not exists cobravel boolean not null default true;

comment on column public.salons.cobravel is
  'Esta barbearia vira fatura? Falso = barbearia interna (teste, demonstracao): o uso e medido e mostrado, mas gerar_fatura_de_uso nao cria fatura nenhuma para ela. Nao mexe em acesso nem em documento. 0160.';

-- ---------------------------------------------------------------------------
-- A porta única de criação de fatura passa a olhar a coluna
-- ---------------------------------------------------------------------------
-- O corpo é o da 0136, intacto. A única mudança é o bloco no começo — antes de
-- qualquer conta, porque não há conta a fazer.
create or replace function public.gerar_fatura_de_uso(p_salon_id uuid, p_inicio date, p_fim date, p_motivo text default 'mensal')
returns public.faturas_de_uso
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_barbeiros integer;
  v_preco numeric;
  v_agendamentos integer;
  v_lembretes integer;
  v_reativacoes integer;
  v_valor_gerado numeric;
  v_detalhe jsonb;
  v_fatura public.faturas_de_uso;
  v_trial_ate date;
  v_ultimo_faturado date;
begin
  -- Barbearia interna não vira fatura. Primeiro teste da função, de propósito:
  -- sem fatura não há período faturado, não há Pix, não há bloqueio por
  -- cobrança vencida — a cadeia inteira simplesmente não começa.
  if not exists (
    select 1 from public.salons s where s.id = p_salon_id and s.cobravel
  ) then
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

  -- A regra de "cobrável" mora na view agendamentos_cobraveis (0136).
  select count(*),
         coalesce(sum(c.valor_servico), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'data', to_char(c.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'hora', to_char(c.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
               'servico', coalesce(c.servicos, '—'),
               'valor_servico', c.valor_servico,
               'status', c.status
             )
             order by c.created_at
           ),
           '[]'::jsonb
         )
    into v_agendamentos, v_valor_gerado, v_detalhe
    from public.agendamentos_cobraveis c
   where c.salon_id = p_salon_id
     and c.dia_de_criacao between p_inicio and p_fim;

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
    agendamentos, lembretes, reativacoes, valor, valor_gerado, detalhe
  ) values (
    p_salon_id, p_inicio, p_fim, p_motivo, v_barbeiros, coalesce(v_preco, 0.75),
    v_agendamentos, v_lembretes, v_reativacoes,
    round(coalesce(v_preco, 0.75) * v_agendamentos, 2), v_valor_gerado, v_detalhe
  )
  on conflict (salon_id, periodo_inicio, periodo_fim, motivo) do nothing;

  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  return v_fatura;
end;
$function$;

comment on function public.gerar_fatura_de_uso(uuid, date, date, text) is
  'Porta unica de criacao de fatura de uso. Recusa barbearia com cobravel = false (0160), recorta o teste gratis (0130) e o periodo ja faturado, e e idempotente pela chave (salon, inicio, fim, motivo).';

-- ---------------------------------------------------------------------------
-- A tela precisa saber, senão ela mente
-- ---------------------------------------------------------------------------
-- `uso_do_sistema_no_mes` alimenta "você paga X por agendamento" e "R$ Y no mês
-- até agora". Numa barbearia fora da cobrança as duas frases são falsas. A
-- coluna entra no FIM da lista de propósito: coluna nova no meio levanta 42P16
-- no `replace`.
create or replace view public.uso_do_sistema_no_mes
with (security_invoker = on) as
 with periodo as (
   select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as inicio,
          (now() at time zone 'America/Sao_Paulo')::date as fim
 )
 select s.id as salon_id,
        s.nome as barbearia,
        p.inicio as periodo_inicio,
        p.fim as periodo_fim,
        (select count(*) from public.professionals pr
          where pr.salon_id = s.id and pr.ativo) as barbeiros,
        public.preco_por_uso((select count(*)::integer from public.professionals pr
          where pr.salon_id = s.id and pr.ativo)) as preco_unitario,
        (select count(*) from public.agendamentos_cobraveis c
          where c.salon_id = s.id and c.dia_de_criacao >= p.inicio) as agendamentos,
        (select coalesce(sum(c.valor_servico), 0) from public.agendamentos_cobraveis c
          where c.salon_id = s.id and c.dia_de_criacao >= p.inicio) as valor_gerado,
        (select count(*) from public.appointments a
          where a.salon_id = s.id and a.lembrete_enviado
            and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date >= p.inicio
            and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date <= p.fim) as lembretes,
        (select count(*) from public.reativacao_envios r
          where r.salon_id = s.id
            and (r.criado_em at time zone 'America/Sao_Paulo')::date >= p.inicio) as reativacoes,
        s.cobravel
   from public.salons s
   cross join periodo p;

comment on view public.uso_do_sistema_no_mes is
  'Uso do mes corrente por barbearia, ao vivo. `cobravel` falso quer dizer que nada disso vira fatura (0160) -- a tela precisa dizer isso em vez de prometer cobranca.';
