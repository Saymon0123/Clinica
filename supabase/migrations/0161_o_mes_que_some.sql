-- 0161: o mês que some (Fase 5 — achado A14).
--
-- O BURACO. `fechar_mes_de_uso` sempre faturou "o mês anterior e só ele":
-- `v_inicio` = dia 1º do mês passado, `v_fim` = último dia do mês passado. E
-- `gerar_fatura_de_uso` só empurra o início para FRENTE (até o dia seguinte à
-- última fatura), nunca para trás. Some disso que, se o `pg_cron` falhar num dia
-- 1º, aquele mês **nunca mais é faturado**: no mês seguinte a janela já começa
-- depois do buraco. A receita evapora em silêncio, e a auditoria não vê — ela
-- olha faturas que existem, e uma fatura que nunca nasceu é invisível.
--
-- O AGRAVANTE, achado ao corrigir. O laço não tinha `exception`: uma barbearia
-- que levantasse erro abortava a rodada inteira, e **todas as barbearias depois
-- dela na fila perdiam o mês junto**. É a mesma falha que a 0134 corrigiu no
-- cron da reativação, na mesma forma, e ela é pior aqui: lá o cliente perde um
-- convite, aqui o dono perde um mês de receita.
--
-- TRÊS CONSERTOS, e o terceiro é o que impede a próxima vez:
--
-- 1. **A janela passa a ser por barbearia**, do dia seguinte ao último dia já
--    faturado (ou ao fim do teste, para quem nunca teve fatura). Buraco antigo é
--    recuperado sozinho na próxima rodada.
--
--    Decidido pelo dono em 12/09: o buraco vira **uma fatura só**, cobrindo o
--    período inteiro, em vez de uma fatura por mês faltante. Mais simples de
--    gerar; o `detalhe` da fatura lista agendamento por agendamento, então o
--    extrato continua auditável dia a dia.
--
-- 2. **Cada barbearia no seu próprio `begin/exception`**, e a ordem passa a ser
--    determinística (`order by s.id`). Uma barbearia com problema vira aviso no
--    log e não encosta nas outras.
--
-- 3. **Um alarme para o que não existe.** Entra em `auditoria_cobranca`, que já
--    é unida em `auditoria_pendente` e já é lida pelo fluxo "Auditoria do
--    Agente" do n8n, que manda e-mail. Nenhuma mudança no n8n: o alerta novo
--    pega carona no canal que já funciona. Sem ele, os consertos 1 e 2 ainda
--    dependeriam de alguém lembrar de conferir.

-- ---------------------------------------------------------------------------
-- 1 e 2 — a janela por barbearia, e uma não derruba a outra
-- ---------------------------------------------------------------------------
create or replace function public.fechar_mes_de_uso()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_padrao date := (date_trunc('month', v_hoje) - interval '1 month')::date;
  v_fim date := (date_trunc('month', v_hoje) - interval '1 day')::date;
  v_inicio date;
  v_salon record;
  v_fatura public.faturas_de_uso;
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
     -- Ordem fixa: sem ela, "quem ficou de fora quando alguém quebrou" muda a
     -- cada rodada, e o defeito vira impossível de reproduzir.
     order by s.id
  loop
    -- Onde esta barbearia parou. O dia seguinte ao último faturado; nunca
    -- faturada ainda, o dia seguinte ao fim do teste; sem teste, a janela de
    -- sempre. É esta linha que recupera mês pulado.
    select coalesce(
             (select max(f.periodo_fim) + 1 from public.faturas_de_uso f
               where f.salon_id = v_salon.id),
             (select sub.trial_ate + 1 from public.subscriptions sub
               where sub.salon_id = v_salon.id),
             v_padrao)
      into v_inicio;

    -- Nada a faturar: o teste ainda corre, ou o período já está coberto.
    continue when v_inicio is null or v_inicio > v_fim;

    begin
      v_fatura := public.gerar_fatura_de_uso(v_salon.id, v_inicio, v_fim, 'mensal');
      -- `v_fatura is not null` seria errado, e era o que estava escrito: num
      -- registro composto, `IS NOT NULL` só é verdadeiro quando TODAS as colunas
      -- são não-nulas — e fatura recém-criada tem `paga_em`, `abacate_pix_id` e
      -- outras nulas por definição. O contador nunca saiu do zero. Ninguém
      -- percebeu porque o número só aparece no retorno do cron, que ninguém lê;
      -- é justamente por isso que ele precisa estar certo quando alguém for ler.
      if v_fatura.id is not null then
        v_total := v_total + 1;
      end if;
    exception when others then
      -- A barbearia problemática fica para trás e vira alarme na rodada
      -- seguinte (auditoria_cobranca, abaixo). As outras seguem.
      raise warning 'Fechamento mensal pulou a barbearia %: %', v_salon.id, sqlerrm;
    end;
  end loop;
  return v_total;
end;
$function$;

comment on function public.fechar_mes_de_uso() is
  'Fechamento mensal. A janela e POR BARBEARIA, do dia seguinte ao ultimo dia faturado -- entao mes pulado pelo cron e recuperado na rodada seguinte, numa fatura so (0161). Cada barbearia roda no proprio bloco de excecao: uma que quebre nao derruba as outras.';

-- ---------------------------------------------------------------------------
-- 3 — o alarme da fatura que não nasceu
-- ---------------------------------------------------------------------------
-- Os três blocos que já existiam falam de faturas que EXISTEM: a que não virou
-- cobrança, a parada por falta de documento, a vencida sem pagar. Faltava o
-- caso em que não há fatura nenhuma para olhar.
--
-- REPLACE, e não drop: `auditoria_pendente` depende desta view (e derrubá-la foi
-- exatamente o acidente que a 0152 cometeu). O `with (security_invoker = on)`
-- vai junto de propósito — `create or replace view` **não** herda as opções da
-- versão anterior, e foi assim que o invoker se perdeu naquela vez.
--
-- 35 dias, e não 31: no dia 30 de um mês o último dia faturado é o dia 31 do
-- mês anterior, o que já são 30 dias de distância no caminho normal. Abaixo de
-- 35 o alarme não distingue um fim de mês comum de um fechamento perdido.
create or replace view public.auditoria_cobranca
with (security_invoker = on) as
 select 'cobranca-travada:'::text || f.id as chave,
    'Cobranca nao foi gerada'::text as tipo,
    'grave'::text as gravidade,
    f.salon_id,
    f.gerada_em as ocorrido_em,
    ((((s.nome || ' -- deve R$ '::text) || replace(to_char(f.valor, 'FM999990.00'::text), '.'::text, ','::text)) || ' e a cobranca nao foi gerada ha '::text) || floor(extract(epoch from now() - f.gerada_em) / 86400::numeric)::integer) || ' dias. O AbacatePay recusou ou o cobrar-uso falhou.'::text as detalhe
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
     left join subscriptions sub on sub.salon_id = f.salon_id
     left join organizations org on org.id = s.organization_id
  where f.abacate_pix_id is null and f.paga_em is null and f.valor >= 5::numeric and f.gerada_em < (now() - '2 days'::interval) and coalesce(sub.cpf_cnpj, org.cpf_cnpj) is not null
union all
 select 'cobranca-sem-doc:'::text || f.id as chave,
    'Cobranca parada por falta de CPF/CNPJ'::text as tipo,
    'aviso'::text as gravidade,
    f.salon_id,
    f.gerada_em as ocorrido_em,
    ((s.nome || ' -- deve R$ '::text) || replace(to_char(f.valor, 'FM999990.00'::text), '.'::text, ','::text)) || ' mas nao informou CPF/CNPJ; sem ele nao da para cobrar. Pedir na aba Assinatura.'::text as detalhe
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
     left join subscriptions sub on sub.salon_id = f.salon_id
     left join organizations org on org.id = s.organization_id
  where f.abacate_pix_id is null and f.paga_em is null and f.valor > 0::numeric and f.gerada_em < (now() - '3 days'::interval) and coalesce(sub.cpf_cnpj, org.cpf_cnpj) is null
union all
 select 'cobranca-vencida:'::text || f.id as chave,
    'PIX vencido e nao pago'::text as tipo,
    'aviso'::text as gravidade,
    f.salon_id,
    f.cobranca_vence_em::timestamp with time zone as ocorrido_em,
    ((((s.nome || ' -- cobranca de R$ '::text) || replace(to_char(coalesce(f.cobranca_valor, f.valor), 'FM999990.00'::text), '.'::text, ','::text)) || ' venceu em '::text) || to_char(f.cobranca_vence_em::timestamp with time zone, 'DD/MM'::text)) || ' e nao foi paga (prazo de 7 dias).'::text as detalhe
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
  where f.abacate_pix_id is not null and f.paga_em is null and f.cobranca_vence_em is not null and f.cobranca_vence_em < (now() - '3 days'::interval)
union all
 select 'fatura-nao-nasceu:'::text || c.salon_id::text || ':'::text || to_char(c.ate, 'YYYY-MM'::text) as chave,
    'Mes fechou sem fatura'::text as tipo,
    'grave'::text as gravidade,
    c.salon_id,
    c.ate::timestamp with time zone as ocorrido_em,
    ((((c.nome || ' -- o ultimo dia faturado e '::text) || to_char(c.ate, 'DD/MM/YYYY'::text)) || ', ha '::text) || (c.hoje - c.ate)::text) || ' dias. O fechamento mensal nao gerou fatura para este periodo.'::text as detalhe
   from (
     select s.id as salon_id, s.nome,
            (now() at time zone 'America/Sao_Paulo')::date as hoje,
            coalesce(
              (select max(f.periodo_fim) from faturas_de_uso f where f.salon_id = s.id),
              sub.trial_ate) as ate
       from salons s
       join subscriptions sub on sub.salon_id = s.id
      where s.ativo and s.cobravel and sub.status <> 'cancelada'
   ) c
  where c.ate is not null and c.ate < c.hoje - 35;

comment on view public.auditoria_cobranca is
  'Alertas de cobranca para o dono, unidos em auditoria_pendente. Quatro casos: fatura sem cobranca gerada, cobranca parada por falta de documento, PIX vencido sem pagar e -- desde a 0161 -- a fatura que NAO NASCEU, quando o ultimo dia faturado fica mais de 35 dias para tras.';
