-- 0144 — Cadeia de cobranca: Asaas/boleto -> AbacatePay/PIX.
-- Asaas nunca foi ao ar (producao zerada, 0 faturas) -> troca de colunas sem backfill.
-- Decisoes (dono, 2026-09-09): PIX-only; janela 7 dias p/ pagar (cobranca_vence_em);
-- pagar quita o ciclo (sem "+1 mes", isso e no webhook); "atrasada" derivada.
-- Ordem expand->contract, e auditoria_cobranca por CREATE OR REPLACE (auditoria_pendente depende dela).

-- 1) EXPAND: novas colunas em faturas_de_uso.
alter table public.faturas_de_uso
  add column if not exists abacate_pix_id text,
  add column if not exists pix_br_code text,
  add column if not exists pix_br_code_base64 text,
  add column if not exists pix_expira_em timestamptz,
  add column if not exists cobranca_vence_em date,
  add column if not exists cobranca_valor numeric,
  add column if not exists cobranca_notificada_em timestamptz;

-- 2) asaas_eventos -> cobranca_eventos.
alter table public.asaas_eventos rename to cobranca_eventos;
alter table public.cobranca_eventos rename column payment_id to pix_id;
alter table public.cobranca_eventos drop column if exists subscription_id;
alter index if exists asaas_eventos_pkey rename to cobranca_eventos_pkey;

-- 3) Funcoes.
create or replace function public.estender_acesso_sem_debito()
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mexidas integer;
begin
  update public.subscriptions sub
     set acesso_ate = v_hoje + 1, atendimento_ate = v_hoje + 8, updated_at = now()
    from public.salons s
   where s.id = sub.salon_id and s.ativo and sub.status <> 'cancelada'
     and sub.trial_ate is not null and sub.trial_ate < v_hoje
     and sub.acesso_ate is not null and sub.acesso_ate <= v_hoje
     and not exists (
       select 1 from public.faturas_de_uso f
        where f.salon_id = sub.salon_id and f.paga_em is null and f.valor > 0
          and f.cobranca_vence_em is not null and f.cobranca_vence_em < v_hoje
     );
  get diagnostics v_mexidas = row_count;
  return v_mexidas;
end;
$function$;

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
  return v_total;
end;
$function$;

-- 4) auditoria_cobranca: REPLACE (saida identica -> auditoria_pendente intacta).
create or replace view public.auditoria_cobranca as
 select 'cobranca-travada:'::text || f.id as chave, 'Cobranca nao foi gerada'::text as tipo,
    'grave'::text as gravidade, f.salon_id, f.gerada_em as ocorrido_em,
    ((((s.nome || ' -- deve R$ '::text) || replace(to_char(f.valor, 'FM999990.00'::text), '.'::text, ','::text)) || ' e a cobranca nao foi gerada ha '::text) || floor(extract(epoch from now() - f.gerada_em) / 86400::numeric)::integer) || ' dias. O AbacatePay recusou ou o cobrar-uso falhou.'::text as detalhe
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
     left join subscriptions sub on sub.salon_id = f.salon_id
     left join organizations org on org.id = s.organization_id
  where f.abacate_pix_id is null and f.paga_em is null and f.valor >= 5::numeric and f.gerada_em < (now() - '2 days'::interval) and coalesce(sub.cpf_cnpj, org.cpf_cnpj) is not null
union all
 select 'cobranca-sem-doc:'::text || f.id, 'Cobranca parada por falta de CPF/CNPJ'::text, 'aviso'::text,
    f.salon_id, f.gerada_em,
    ((s.nome || ' -- deve R$ '::text) || replace(to_char(f.valor, 'FM999990.00'::text), '.'::text, ','::text)) || ' mas nao informou CPF/CNPJ; sem ele nao da para cobrar. Pedir na aba Assinatura.'::text
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
     left join subscriptions sub on sub.salon_id = f.salon_id
     left join organizations org on org.id = s.organization_id
  where f.abacate_pix_id is null and f.paga_em is null and f.valor > 0::numeric and f.gerada_em < (now() - '3 days'::interval) and coalesce(sub.cpf_cnpj, org.cpf_cnpj) is null
union all
 select 'cobranca-vencida:'::text || f.id, 'PIX vencido e nao pago'::text, 'aviso'::text,
    f.salon_id, f.cobranca_vence_em::timestamp with time zone,
    ((((s.nome || ' -- cobranca de R$ '::text) || replace(to_char(coalesce(f.cobranca_valor, f.valor), 'FM999990.00'::text), '.'::text, ','::text)) || ' venceu em '::text) || to_char(f.cobranca_vence_em::timestamp with time zone, 'DD/MM'::text)) || ' e nao foi paga (prazo de 7 dias).'::text
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
  where f.abacate_pix_id is not null and f.paga_em is null and f.cobranca_vence_em is not null and f.cobranca_vence_em < (now() - '3 days'::interval);

-- 5) faturas_a_notificar: sem dependentes -> DROP+CREATE (saida muda).
drop view if exists public.faturas_a_notificar;
create view public.faturas_a_notificar as
 select f.id, f.salon_id, s.nome as barbearia, o.nome as rede,
    f.periodo_inicio, f.periodo_fim, f.motivo, f.barbeiros, f.preco_unitario,
    f.agendamentos, f.lembretes, f.reativacoes, f.valor, f.valor_gerado,
    f.detalhe, f.gerada_em, f.pix_br_code, f.cobranca_vence_em, f.cobranca_valor,
    email_do_dono(f.salon_id) as email_do_dono
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
     left join organizations o on o.id = s.organization_id
  where f.notificada_em is null;

-- 6) boletos_a_enviar -> cobrancas_a_enviar.
drop view if exists public.boletos_a_enviar;
create view public.cobrancas_a_enviar as
 select distinct on (f.abacate_pix_id) f.abacate_pix_id, f.pix_br_code, f.pix_br_code_base64,
    f.cobranca_valor, f.cobranca_vence_em, f.pix_expira_em, f.salon_id,
    s.nome as barbearia, o.nome as rede,
    o.id is not null and o.cobranca_unificada as unificada,
    email_do_dono(f.salon_id) as email_do_dono,
    ( select count(*) as count from faturas_de_uso f2 where f2.abacate_pix_id = f.abacate_pix_id) as faturas_na_cobranca,
    f.periodo_inicio, f.periodo_fim, f.agendamentos, f.preco_unitario,
    f.valor, f.valor_gerado, f.lembretes, f.reativacoes, f.motivo
   from faturas_de_uso f
     join salons s on s.id = f.salon_id
     left join organizations o on o.id = s.organization_id
  where f.abacate_pix_id is not null and f.pix_br_code is not null and f.cobranca_notificada_em is null
  order by f.abacate_pix_id, f.periodo_fim desc;

-- 7) CONTRACT: dropa as colunas antigas (nada mais referencia).
alter table public.faturas_de_uso
  drop column if exists asaas_payment_id,
  drop column if exists boleto_url,
  drop column if exists boleto_valor,
  drop column if exists boleto_vencimento,
  drop column if exists boleto_notificado_em;
alter table public.subscriptions
  drop column if exists asaas_customer_id,
  drop column if exists asaas_subscription_id;
alter table public.organizations
  drop column if exists asaas_customer_id,
  drop column if exists asaas_subscription_id;

-- 8) Grants perdidos no DROP das views (auditoria_cobranca mantem via REPLACE).
grant select on public.faturas_a_notificar to service_role;
grant select on public.cobrancas_a_enviar to service_role;
