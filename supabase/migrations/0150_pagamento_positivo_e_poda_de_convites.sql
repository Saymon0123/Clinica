-- 0150 — Duas decisoes do dono em 10/09, sobre escolhas que a 0149 deixou abertas.

-- 1) Pagamento de R$ 0 deixa de ser possivel.
--
-- A 0149 usou `valor >= 0` de proposito: eu barrei o SINAL (o risco real de
-- inverter saldo) e deixei o zero passar porque venda de cortesia era plausivel
-- e eu nao tinha visto esse caminho no codigo. Perguntei; o dono respondeu que
-- **nao existe brinde nem cortesia** no produto.
--
-- Com isso a janela fecha. Ela nao era corrupcao de dado -- era erro humano
-- passando despercebido: comanda marcada como paga com R$ 0, caixa fechando
-- certo, financeiro registrando a venda, e dinheiro nenhum entrando.
alter table public.payments drop constraint payments_valor_nao_negativo;
alter table public.payments add constraint payments_valor_positivo check (valor > 0);

-- 2) Convite vencido some sozinho, 30 dias depois.
--
-- A 0149 criou `salon_invites_pendente_unico` (um convite VIVO por e-mail por
-- barbearia). O efeito colateral conhecido: convite vencido e nao usado bloqueia
-- um novo, porque `now()` nao e IMMUTABLE e nao pode entrar no predicado do
-- indice. A saida era o dono apagar na lista.
--
-- Decisao do dono: ninguem deve precisar se preocupar com isso. Entao a poda
-- resolve -- 30 dias APOS O VENCIMENTO, nao apos a criacao. Some do caminho sem
-- apagar o rastro na hora: se alguem perguntar "convidei o fulano e ele nao
-- recebeu", a evidencia ainda esta la por um mes.
--
-- Convite ACEITO nunca e apagado: e historico de quem entrou na equipe.
create or replace function public.poda_historico_antigo()
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_total integer := 0; v_qtd integer;
begin
  delete from public.whatsapp_messages where created_at < now() - interval '12 months';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.auditoria_avisos where avisado_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.cobranca_eventos where recebido_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.controle_de_taxa where janela_inicio < now() - interval '7 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  -- `usado_em is null` e o que separa convite morto de historico de equipe.
  delete from public.salon_invites
   where usado_em is null and expira_em is not null and expira_em < now() - interval '30 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  return v_total;
end;
$function$;

-- 3) A poda passa a rodar TODO DIA, e nao no dia 2 de cada mes.
--
-- Mensal fazia "30 dias apos o vencimento" virar, na pratica, 30 a 60 dias --
-- e o dono pediu 30. De quebra, apagar todo dia troca um pico mensal por lotes
-- pequenos, que e melhor para um banco em plano compartilhado.
select cron.unschedule('poda-historico-antigo');
select cron.schedule('poda-historico-antigo', '30 7 * * *', 'select public.poda_historico_antigo()');
