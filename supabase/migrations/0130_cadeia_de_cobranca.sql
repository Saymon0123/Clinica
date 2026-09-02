-- 0130: a cadeia de cobrança para de cobrar duas vezes, de cobrar o teste
-- grátis e de bloquear quem não deve nada (Parte 2, passo 2.1 — achados 17, 18 e 19).
--
-- Os três defeitos moram no mesmo lugar e se somam: o dinheiro. Medidos em
-- produção em 02/09, nas seis assinaturas que existem.
--
-- =========================================================================
-- PARTE A — o teste grátis deixa de ser cobrado (achado 18)
-- =========================================================================
--
-- `gerar_fatura_de_uso` conta os agendamentos do período inteiro, sem olhar se
-- a barbearia estava em teste. Não é hipótese: a fatura de agosto de "João
-- corte" cobre 01–31/08, e ela foi criada em 27/08 com teste até 10/09 —
-- período inteiro dentro do teste. "Curitiba" foi faturada em R$ 1,50 por um
-- período que inclui os seus dias de teste.
--
-- Faltava saber QUANDO o teste acabou. `acesso_ate` serve enquanto a barbearia
-- está em teste, mas ele anda para frente no primeiro pagamento e a data
-- original se perde. Por isso a coluna nova: ela é gravada uma vez e não se
-- move mais.
alter table public.subscriptions add column if not exists trial_ate date;

comment on column public.subscriptions.trial_ate is
  'Ultimo dia do teste gratis. Fixo: nao anda quando acesso_ate anda. E o corte que gerar_fatura_de_uso usa para nao cobrar dia de teste. Nulo = sem teste (conta criada pela operacao sem vencimento automatico).';

-- Backfill. Para quem AINDA está em teste, `acesso_ate` é a data exata — não
-- há por que estimar. Para o resto, a regra histórica do `DIAS_DE_TESTE`:
-- 7 dias até 14/08, 14 dias até 31/08, 7 de novo depois (as datas estão
-- documentadas em `criar-minha-barbearia/index.ts`).
update public.subscriptions
   set trial_ate = case
         when status = 'trial' then acesso_ate
         else created_at::date + case
                when created_at::date < date '2026-08-14' then 7
                when created_at::date < date '2026-08-31' then 14
                else 7
              end
       end
 where trial_ate is null;

-- =========================================================================
-- PARTE B — o mesmo dia nunca é cobrado duas vezes (achado 17)
-- =========================================================================
--
-- `fechar_mes_de_uso` roda dia 1º e fatura o mês anterior para TODA barbearia
-- ativa. Cancelar a assinatura não desativa a barbearia — então, para quem
-- cancelou no meio do mês, a fatura de cancelamento (que vai do dia seguinte à
-- última fatura até hoje) e a mensal do dia 1º cobrem os mesmos dias.
--
-- A trava vai dentro de `gerar_fatura_de_uso`, que é a porta única de criação
-- de fatura: nenhum período pode começar antes do último dia já faturado. Isso
-- vale para os dois chamadores e para qualquer um que apareça depois — e, de
-- brinde, torna a função idempotente por construção.
create or replace function public.gerar_fatura_de_uso(p_salon_id uuid, p_inicio date, p_fim date, p_motivo text default 'mensal'::text)
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
  -- Corte 1: dia de teste não se cobra.
  select s.trial_ate into v_trial_ate
    from public.subscriptions s where s.salon_id = p_salon_id;
  if v_trial_ate is not null and p_inicio <= v_trial_ate then
    p_inicio := v_trial_ate + 1;
  end if;

  -- Corte 2: dia já faturado não se cobra de novo.
  select max(f.periodo_fim) into v_ultimo_faturado
    from public.faturas_de_uso f where f.salon_id = p_salon_id;
  if v_ultimo_faturado is not null and p_inicio <= v_ultimo_faturado then
    p_inicio := v_ultimo_faturado + 1;
  end if;

  -- Sobrou zero dia para cobrar: não existe fatura a criar. Devolver NULO em
  -- vez de uma fatura de R$ 0,00 evita encher a lista do dono de linha que não
  -- quer dizer nada.
  if p_inicio > p_fim then
    return null;
  end if;

  -- A busca por fatura existente vem DEPOIS do recorte, senão ela procuraria
  -- por um período que a função já decidiu não usar.
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

  select count(*),
         coalesce(sum(sv.total), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'data', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'hora', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
               'servico', coalesce(sv.nomes, '—'),
               'valor_servico', coalesce(sv.total, 0),
               'status', a.status
             )
             order by a.created_at
           ),
           '[]'::jsonb
         )
    into v_agendamentos, v_valor_gerado, v_detalhe
    from public.appointments a
    left join lateral (
      select sum(s.preco) as total,
             string_agg(s.nome, ' + ' order by asv.ordem) as nomes
        from public.appointment_services asv
        join public.services s on s.id = asv.service_id
       where asv.appointment_id = a.id
    ) sv on true
   where a.salon_id = p_salon_id
     and (a.origem = 'agente'
          or (a.origem = 'reativacao' and a.reativacao_confirmada_em is not null))
     and a.status <> 'bloqueio'
     and (a.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

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

-- Quem cancelou não entra no fechamento mensal: a fatura de cancelamento já
-- fechou a conta dele. O recorte acima já impediria a cobrança dupla, mas sem
-- isto o fechamento ainda criaria uma fatura dos dias restantes — dias em que a
-- barbearia nem estava mais sendo atendida, e que viraria linha de R$ 0,00 na
-- lista do dono todo mês, para sempre.
--
-- Mas o pulo é CONDICIONAL, e a condição importa: `asaas/index.ts` engole de
-- propósito a falha ao gerar a fatura de cancelamento, com o comentário
-- "o fechamento mensal cobre o período". Pular todo mundo que cancelou
-- tornaria esse comentário mentira e transformaria uma falha registrada só no
-- console em receita perdida em silêncio. Então só pula quem realmente tem a
-- fatura de cancelamento.
create or replace function public.fechar_mes_de_uso()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := (date_trunc('month', v_hoje) - interval '1 month')::date;
  v_fim date := (date_trunc('month', v_hoje) - interval '1 day')::date;
  v_salon record;
  v_total integer := 0;
begin
  for v_salon in
    select s.id
      from public.salons s
      left join public.subscriptions sub on sub.salon_id = s.id
     where s.ativo
       and (
         coalesce(sub.status, '') <> 'cancelada'
         or not exists (
           select 1 from public.faturas_de_uso f
            where f.salon_id = s.id and f.motivo = 'cancelamento'
         )
       )
  loop
    -- Conta só o que virou fatura de verdade: com o recorte, a função devolve
    -- NULO quando não sobrou dia para cobrar, e um contador que somasse tudo
    -- diria "fechei 6" num mês em que fechou 2.
    if public.gerar_fatura_de_uso(v_salon.id, v_inicio, v_fim, 'mensal') is not null then
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$function$;

-- =========================================================================
-- PARTE C — quem não deve nada não é bloqueado (achado 19)
-- =========================================================================
--
-- `acesso_ate` só anda quando um pagamento entra pelo webhook do Asaas. E o
-- boleto é gerado à mão, a partir do e-mail de detalhamento — abaixo do mínimo
-- do banco, boleto nenhum é emitido.
--
-- O resultado, medido em 02/09: as SEIS faturas que existem estão com
-- `boleto_vencimento` nulo (quatro de R$ 0,00, duas de R$ 1,50). Ninguém tem
-- como pagar, e mesmo assim o acesso vence. A barbearia que usou pouco é
-- justamente a que é punida.
--
-- A regra que faltava: o acesso continua enquanto NÃO houver dívida vencida.
-- Não é generosidade — é o modelo por uso. Quem não usou não deve, e quem não
-- deve não pode ser bloqueado.
create or replace function public.estender_acesso_sem_debito()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mexidas integer;
begin
  update public.subscriptions sub
     set acesso_ate = v_hoje + 1,
         -- Mesma folga de 7 dias que o resto do sistema usa entre o fim do
         -- acesso e o fim do atendimento pelo WhatsApp.
         atendimento_ate = v_hoje + 8,
         updated_at = now()
    from public.salons s
   where s.id = sub.salon_id
     and s.ativo
     -- Cancelou: o acesso corre até a data que ele já tem e acaba ali.
     and sub.status <> 'cancelada'
     -- Em teste, quem manda é a data do teste. Estender aqui daria teste eterno.
     and sub.trial_ate is not null
     and sub.trial_ate < v_hoje
     -- Nulo é "sem vencimento automático", conta criada pela operação.
     and sub.acesso_ate is not null
     -- Só mexe em quem está para vencer ou já venceu.
     and sub.acesso_ate <= v_hoje
     -- A trava: dívida vencida e não paga segura o acesso. Fatura de R$ 0,00
     -- não é dívida, e fatura sem boleto emitido não está vencida — não dá
     -- para vencer um prazo que nunca existiu.
     and not exists (
       select 1 from public.faturas_de_uso f
        where f.salon_id = sub.salon_id
          and f.paga_em is null
          and f.valor > 0
          and f.boleto_vencimento is not null
          and f.boleto_vencimento < v_hoje
     );
  get diagnostics v_mexidas = row_count;
  return v_mexidas;
end;
$function$;

comment on function public.estender_acesso_sem_debito() is
  'Roda todo dia: mantem o acesso um dia a frente de quem terminou o teste e nao tem fatura vencida em aberto. Antes, acesso_ate so andava com pagamento pelo webhook do Asaas -- e quem usou pouco demais para gerar boleto ficava bloqueado devendo nada.';

revoke all on function public.estender_acesso_sem_debito() from public, anon, authenticated;

select cron.schedule(
  'estende-acesso-sem-debito',
  '20 4 * * *',
  $$select public.estender_acesso_sem_debito()$$
);

-- O `trial_ate` é gravado pelo BANCO, não pelas quatro edge functions que criam
-- teste (`criar-minha-barbearia`, `add-salon-unit`, `admin-create-salon` e o
-- ramo de dono do `accept-invite`). Uma regra em quatro cópias é uma regra que
-- uma delas vai esquecer — e a que esquecer produz uma barbearia que volta a
-- ser cobrada pelo próprio teste, em silêncio.
create or replace function public.marca_o_fim_do_teste()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- A guarda `trial_ate is null` é o que impede a data de andar junto com
  -- `acesso_ate` no primeiro pagamento.
  if new.trial_ate is null and new.status = 'trial' and new.acesso_ate is not null then
    new.trial_ate := new.acesso_ate;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_marca_o_fim_do_teste on public.subscriptions;
create trigger trg_marca_o_fim_do_teste
  before insert or update on public.subscriptions
  for each row execute function public.marca_o_fim_do_teste();

comment on function public.marca_o_fim_do_teste() is
  'Grava trial_ate = acesso_ate quando a assinatura nasce (ou vira) trial. Fica no banco, e nao nas quatro edge functions que criam teste.';

-- =========================================================================
-- PARTE D — boleto único da rede exige documento (achado 22)
-- =========================================================================
--
-- Ligar o boleto único da rede grava uma preferência e nada mais. O documento
-- é opcional na tela e no servidor — mas ele é o CPF/CNPJ do PAGADOR no Asaas.
-- Sem ele, `cobrar-uso` agrupa as faturas da rede, não consegue criar o
-- cliente, soma em `semDocumento` e segue em frente: a rede inteira fica sem
-- boleto nenhum, em silêncio, até alguém reparar na falta do dinheiro.
--
-- A trava é CHECK e não validação de tela porque o estado "boleto único ligado
-- sem documento válido" não deveria conseguir existir — inclusive apagando o
-- documento depois de ligar, que é o caminho que ninguém lembra de testar.
create or replace function private.documento_valido(p_doc text)
returns boolean
language plpgsql
immutable
as $function$
declare
  d text := regexp_replace(coalesce(p_doc, ''), '\D', '', 'g');
  soma int;
  resto int;
  i int;
  peso int;
begin
  -- Todos os dígitos iguais passam na conta dos verificadores e não existem.
  if d ~ '^(.)\1*$' then
    return false;
  end if;

  if length(d) = 11 then
    soma := 0;
    for i in 1..9 loop soma := soma + substr(d, i, 1)::int * (11 - i); end loop;
    resto := (soma * 10) % 11;
    if resto = 10 then resto := 0; end if;
    if resto <> substr(d, 10, 1)::int then return false; end if;

    soma := 0;
    for i in 1..10 loop soma := soma + substr(d, i, 1)::int * (12 - i); end loop;
    resto := (soma * 10) % 11;
    if resto = 10 then resto := 0; end if;
    return resto = substr(d, 11, 1)::int;

  elsif length(d) = 14 then
    soma := 0; peso := 5;
    for i in 1..12 loop
      soma := soma + substr(d, i, 1)::int * peso;
      peso := peso - 1;
      if peso < 2 then peso := 9; end if;
    end loop;
    resto := soma % 11;
    resto := case when resto < 2 then 0 else 11 - resto end;
    if resto <> substr(d, 13, 1)::int then return false; end if;

    soma := 0; peso := 6;
    for i in 1..13 loop
      soma := soma + substr(d, i, 1)::int * peso;
      peso := peso - 1;
      if peso < 2 then peso := 9; end if;
    end loop;
    resto := soma % 11;
    resto := case when resto < 2 then 0 else 11 - resto end;
    return resto = substr(d, 14, 1)::int;
  end if;

  return false;
end;
$function$;

comment on function private.documento_valido(text) is
  'CPF (11 digitos) ou CNPJ (14), com digitos verificadores conferidos, ignorando pontuacao. Espelha src/lib/documento.ts, que nao da para importar aqui. Mudou num lado, muda no outro -- os dois tem teste com os mesmos casos.';

alter table public.organizations drop constraint if exists organizations_unificada_exige_documento;
alter table public.organizations
  add constraint organizations_unificada_exige_documento
  check (not cobranca_unificada or private.documento_valido(cpf_cnpj));

comment on constraint organizations_unificada_exige_documento on public.organizations is
  'Boleto unico da rede so existe com CPF/CNPJ valido: e o documento do PAGADOR no Asaas. Sem ele, cobrar-uso agrupa as faturas da rede, nao consegue criar o cliente, conta em semDocumento e segue -- a rede fica com boleto nenhum, em silencio.';
