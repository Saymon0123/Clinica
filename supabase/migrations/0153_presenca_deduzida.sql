-- 0153: presença deduzida — o cron registra "não veio", não "cancelado"
--
-- A7 do giro de 10/09; desenho escolhido pelo dono em 11/09 ("plano C").
--
-- A presença continua DEDUZIDA, como decidido em 25/08, quando a faixa do
-- balcão ("chegou / não veio") saiu: quem fecha o ciclo é o banco, 15 minutos
-- depois do fim previsto, sem venda. O que muda é o que ele escreve.
--
-- Antes escrevia `cancelado`, e isso fazia três estragos:
--   1. `trg_reativacao_pos_atendimento` só conta falta na transição para
--      `faltou`, que nada escrevia. A pausa após 2 faltas nunca disparava, e a
--      reativação seguia reservando cadeira para quem nunca vem.
--   2. Falta aparecia como cancelamento: os cards de Financeiro e Rede somavam
--      quem faltou, e o número que a 0063 chama de "justamente o que interessa
--      ao dono" não existia em lugar nenhum.
--   3. O histórico do cliente dizia "Cancelado" para quem não apareceu.
--
-- Agora:
--   - `faltou` para todo horário que o cliente tinha aceitado: marcado pelo
--     agente, pelo QR, no balcão, ou reativação que ele CONFIRMOU.
--   - `cancelado` para a reativação que ele nunca aceitou (ainda `agendado`).
--     Foi o sistema que reservou; sem o "sim" dele, não é falta. Quase nunca
--     chega aqui — `expira_reativacoes_sem_resposta` cancela 3h antes —, mas
--     quando o convite nem saiu (falha de envio) o cliente nem sabia do
--     horário, e contar falta contra ele pausaria quem não fez nada.
--
-- O nome da função fica, de propósito: o cron `cancela-agendamentos-sem-comanda`
-- chama por ele, e renomear seria mexer no agendador de produção por estética.
--
-- A correção existe, e é a venda: o CRM passou a perguntar, ao escolher o
-- cliente em "Nova venda", se a venda é do horário de hoje dele; e o "Concluir
-- e cobrar" da agenda passou a valer também para `faltou`. `faltou` →
-- `concluido` é a transição de "ele veio, só lancei tarde" — e é por causa
-- dela que o trigger da reativação também muda, logo abaixo.
create or replace function public.cancela_agendamentos_sem_comanda()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_qtd integer;
begin
  update public.appointments
     set status = case
                    when origem = 'reativacao' and status = 'agendado' then 'cancelado'
                    else 'faltou'
                  end
   where status in ('agendado', 'confirmado')
     and data_hora_fim < now() - interval '15 minutes'
     -- Carência do lançamento retroativo (0126): registrar um atendimento que
     -- já aconteceu é uso legítimo, e o cron não pode competir com o barbeiro.
     and created_at < now() - interval '15 minutes';
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$function$;

-- Reativação: a falta conta, e a correção desconta.
--
-- Duas mudanças em relação à 0113:
--
-- 1. A falta não sobrescreve pausa que já existia. Pausa também nasce do
--    próprio cliente — "Cancelar" no convite (`responder_lembrete`) ou dois
--    convites sem resposta (`expira_reativacoes_sem_resposta`). O carimbo é o
--    que distingue os motivos (ver 2), então a falta só carimba quando ainda
--    não há pausa.
--
-- 2. `faltou` → `concluido` desfaz a pausa que ESTA falta causou. É a correção
--    de "ele veio, o barbeiro lançou tarde": sem isto, duas vendas lançadas
--    depois dos 15 minutos pausavam um cliente assíduo, e nada o despausava.
--    Como saber que foi esta falta: pausa e falta nasceram na mesma transação,
--    e `now()` é o mesmo nas duas — `marca_updated_at` carimbou o `updated_at`
--    do horário com o mesmo instante que este trigger gravou em
--    `reativacao_pausada_em`. Pausa por qualquer outro motivo tem outro
--    instante e fica: desfazer o "não quero mais" do cliente seria o pior erro
--    possível aqui.
create or replace function public.trg_reativacao_pos_atendimento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.origem <> 'reativacao' or new.status = old.status then return new; end if;
  if new.status = 'faltou' then
    update public.clients
       set reativacao_no_shows = reativacao_no_shows + 1,
           reativacao_pausada_em = coalesce(
             reativacao_pausada_em,
             case when reativacao_no_shows + 1 >= 2 then now() end
           )
     where id = new.client_id;
  elsif new.status = 'concluido' then
    update public.clients
       set reativacao_no_shows = 0,
           reativacao_pausada_em = case
             when old.status = 'faltou' and reativacao_pausada_em = old.updated_at then null
             else reativacao_pausada_em
           end
     where id = new.client_id;
  end if;
  return new;
end;
$function$;
