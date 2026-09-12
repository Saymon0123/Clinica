-- 0165: o cron que para em silêncio.
--
-- Sete rotinas automáticas sustentam o produto, e **nenhuma delas avisa quando
-- para de rodar**. A auditoria olha dados errados; um cron que simplesmente
-- deixa de existir não produz dado nenhum para olhar. É o mesmo cego-ponto da
-- 0161 ("uma fatura que nunca nasceu é invisível"), uma camada acima.
--
-- O CASO QUE MOTIVOU. `estende-acesso-sem-debito` roda às 4h20 e escreve
-- `acesso_ate = hoje + 1`. Ou seja: **a folga é de um dia**. Se ele falhar duas
-- vezes seguidas, toda barbearia pagante perde o acesso ao CRM — de uma vez, em
-- silêncio, e o dono descobre pelo cliente reclamando. Descoberto em 12/09 ao
-- acompanhar a primeira cobrança real.
--
-- Mas o buraco não é só desse cron. `fechamento-mensal-de-uso` roda uma vez por
-- mês: se falhar, ninguém é faturado e só se percebe 30 dias depois (a 0161 pôs
-- um alarme para a fatura que não nasce, o que cobre a consequência — este
-- cobre a causa). `cancela-agendamentos-sem-comanda` a cada 5 minutos, e por aí.
--
-- COMO SABER QUE PAROU. `cron.job_run_details` guarda toda execução. A rotina
-- está atrasada quando o último sucesso é mais velho que a tolerância da
-- cadência dela. As tolerâncias são folgadas de propósito: alarme que dispara
-- por atraso normal do agendador vira ruído, e ruído se aprende a ignorar.
--
-- POR QUE UMA FUNÇÃO `private` E NÃO A VIEW DIRETO. O schema `cron` é do
-- postgres: `service_role` **não tem USAGE nele** (conferido). Uma view
-- `security_invoker` — e todas são, desde a 0157, com catraca em pgTAP —
-- quebraria ao ser lida pelo n8n. A função `security definer` lê como dona e a
-- view a consulta; é o mesmo arranjo de `private.hora_de_falar`.

create or replace function private.crons_atrasados()
returns table (
  jobname text,
  schedule text,
  ultimo_sucesso timestamptz,
  tolerancia interval
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with cadencia as (
    select
      j.jobid,
      j.jobname::text as jobname,
      j.schedule::text as schedule,
      case
        -- "*/N * * * *" — a cada N minutos. Quatro ciclos de folga: um atraso
        -- isolado do agendador não vira alarme, dois seguidos viram.
        when j.schedule ~ '^\*/[0-9]+ \* \* \* \*$'
          then (substring(j.schedule from '^\*/([0-9]+)')::int * 4) * interval '1 minute'
        -- "M * * * *" — de hora em hora.
        when j.schedule ~ '^[0-9]+ \* \* \* \*$' then interval '3 hours'
        -- "M H * * *" — uma vez por dia. 26h para o alarme chegar ANTES do
        -- estrago: no caso do acesso, sobram horas até a barbearia travar.
        when j.schedule ~ '^[0-9]+ [0-9]+ \* \* \*$' then interval '26 hours'
        -- "M H D * *" — uma vez por mês.
        when j.schedule ~ '^[0-9]+ [0-9]+ [0-9]+ \* \*$' then interval '32 days'
        -- Cadência que ninguém previu: um dia de folga e o alarme aparece. É
        -- melhor errar para o lado de avisar demais do que de nunca avisar.
        else interval '26 hours'
      end as tolerancia
    from cron.job j
    where j.active
  )
  select c.jobname, c.schedule, u.ultimo_sucesso, c.tolerancia
    from cadencia c
    left join lateral (
      select max(d.start_time) as ultimo_sucesso
        from cron.job_run_details d
       where d.jobid = c.jobid and d.status = 'succeeded'
    ) u on true
   -- `is null` conta: rotina ativa que nunca teve um sucesso é tão quebrada
   -- quanto uma que parou, e é o estado de quem foi agendada com erro.
   where u.ultimo_sucesso is null
      or now() - u.ultimo_sucesso > c.tolerancia;
$function$;

comment on function private.crons_atrasados() is
  'As rotinas do pg_cron cujo ultimo sucesso e mais velho que a tolerancia da cadencia delas. `security definer` porque o schema cron e do postgres e o service_role nao tem USAGE nele.';

-- So o n8n (que le a auditoria) precisa disso. Nome de rotina interna nao e
-- assunto de quem esta logado no CRM.
revoke execute on function private.crons_atrasados() from public, anon, authenticated;
grant execute on function private.crons_atrasados() to service_role;

create or replace view public.auditoria_crons
with (security_invoker = on) as
select
  'cron-parado:' || c.jobname as chave,
  'Rotina automatica parada'::text as tipo,
  'grave'::text as gravidade,
  null::uuid as salon_id,
  c.ultimo_sucesso as ocorrido_em,
  case
    when c.ultimo_sucesso is null then
      'A rotina "' || c.jobname || '" (' || c.schedule || ') esta ativa e NUNCA rodou com sucesso.'
    else
      'A rotina "' || c.jobname || '" (' || c.schedule || ') nao roda com sucesso ha ' ||
      to_char(now() - c.ultimo_sucesso, 'DD"d" HH24"h" MI"min"') ||
      '. A tolerancia dela e ' || c.tolerancia::text || '.'
  end as detalhe
from private.crons_atrasados() c;

comment on view public.auditoria_crons is
  'Rotina automatica que parou de rodar. Decimo membro de auditoria_pendente. Existe porque a auditoria olha DADO errado, e cron que some nao produz dado nenhum para olhar -- o caso que motivou foi o estende-acesso-sem-debito, que escreve acesso_ate = hoje + 1: duas falhas seguidas dele tiram o CRM de toda barbearia pagante, em silencio.';

-- ---------------------------------------------------------------------------
-- E entra na fila que já é lida
-- ---------------------------------------------------------------------------
-- `create or replace` e não drop: `auditoria_pendente` tem dependentes, e
-- derrubá-la foi o acidente da 0152. O `with (security_invoker = on)` vai junto
-- de propósito — replace NÃO herda as opções da versão anterior, e foi assim
-- que o invoker se perdeu naquela vez.
create or replace view public.auditoria_pendente
with (security_invoker = on) as
 select auditoria_do_agente.chave,
    auditoria_do_agente.tipo,
    auditoria_do_agente.gravidade,
    auditoria_do_agente.salon_id,
    auditoria_do_agente.ocorrido_em,
    auditoria_do_agente.detalhe
   from public.auditoria_do_agente
union all
 select auditoria_fronteira.chave,
    auditoria_fronteira.tipo,
    auditoria_fronteira.gravidade,
    auditoria_fronteira.salon_id,
    auditoria_fronteira.ocorrido_em,
    auditoria_fronteira.detalhe
   from public.auditoria_fronteira
union all
 select auditoria_operacao.chave,
    auditoria_operacao.tipo,
    auditoria_operacao.gravidade,
    auditoria_operacao.salon_id,
    auditoria_operacao.ocorrido_em,
    auditoria_operacao.detalhe
   from public.auditoria_operacao
union all
 select auditoria_avaliacao.chave,
    auditoria_avaliacao.tipo,
    auditoria_avaliacao.gravidade,
    auditoria_avaliacao.salon_id,
    auditoria_avaliacao.ocorrido_em,
    auditoria_avaliacao.detalhe
   from public.auditoria_avaliacao
union all
 select auditoria_atendimento.chave,
    auditoria_atendimento.tipo,
    auditoria_atendimento.gravidade,
    auditoria_atendimento.salon_id,
    auditoria_atendimento.ocorrido_em,
    auditoria_atendimento.detalhe
   from public.auditoria_atendimento
union all
 select auditoria_cobranca.chave,
    auditoria_cobranca.tipo,
    auditoria_cobranca.gravidade,
    auditoria_cobranca.salon_id,
    auditoria_cobranca.ocorrido_em,
    auditoria_cobranca.detalhe
   from public.auditoria_cobranca
union all
 select auditoria_comanda.chave,
    auditoria_comanda.tipo,
    auditoria_comanda.gravidade,
    auditoria_comanda.salon_id,
    auditoria_comanda.ocorrido_em,
    auditoria_comanda.detalhe
   from public.auditoria_comanda
union all
 select auditoria_entrega.chave,
    auditoria_entrega.tipo,
    auditoria_entrega.gravidade,
    auditoria_entrega.salon_id,
    auditoria_entrega.ocorrido_em,
    auditoria_entrega.detalhe
   from public.auditoria_entrega
union all
 select auditoria_mensagens.chave,
    auditoria_mensagens.tipo,
    auditoria_mensagens.gravidade,
    auditoria_mensagens.salon_id,
    auditoria_mensagens.ocorrido_em,
    auditoria_mensagens.detalhe
   from public.auditoria_mensagens
union all
 select auditoria_crons.chave,
    auditoria_crons.tipo,
    auditoria_crons.gravidade,
    auditoria_crons.salon_id,
    auditoria_crons.ocorrido_em,
    auditoria_crons.detalhe
   from public.auditoria_crons;

comment on view public.auditoria_pendente is
  'Tudo que precisa de olho humano, num lugar so. Lida pelo fluxo "Auditoria do Agente" do n8n, que manda e-mail. Dez membros desde a 0165, quando entrou a rotina automatica que parou de rodar.';
