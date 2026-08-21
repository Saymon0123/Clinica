-- Reativacao em dois toques: 1 mes e 3 meses.
--
-- **Por que `>= 30` e nao `= 30`.** Comparar com o dia exato, como faz
-- `vencimentos_proximos`, exige que o fluxo rode naquele dia. Um dia fora do ar
-- e o cliente e pulado para sempre, sem ninguem perceber. Com `>=` mais o
-- registro da etapa, atraso vira atraso -- nao vira perda.
--
-- **O ciclo reinicia.** Os envios so contam se forem POSTERIORES a ultima
-- visita: cliente que voltou e sumiu de novo merece o ciclo inteiro outra vez.
-- Sem isso, quem foi chamado uma vez nunca mais seria chamado.
--
-- **Textos diferentes nos dois toques.** Repetir a mesma frase em 30 e 90 dias
-- e exatamente o que faz o cliente bloquear -- e bloqueio derruba a nota do
-- numero, que derruba o alcance dos lembretes.
--
-- Nota de ordem: em producao esta migration foi aplicada como
-- `0082_reativacao_em_duas_etapas`, depois de `0082a_tempo_sem_vir`. No
-- repositorio ficaram 0082 (funcao) e 0083 (esta), para a ordem de leitura
-- bater com a de aplicacao.

alter table public.salons
  add column if not exists reativacao_dias_2 integer not null default 0;

comment on column public.salons.reativacao_dias is
  'Dias sem aparecer para o PRIMEIRO toque de reativacao. Zero desliga a reativacao inteira.';
comment on column public.salons.reativacao_dias_2 is
  'Dias sem aparecer para o SEGUNDO toque. Zero = so um toque. Precisa ser maior que reativacao_dias.';

alter table public.reativacao_envios
  add column if not exists etapa smallint not null default 1 check (etapa in (1, 2));

comment on column public.reativacao_envios.etapa is
  'Qual toque foi enviado: 1 (primeiro, ~1 mes) ou 2 (segundo, ~3 meses). Sem isto o segundo toque nunca sairia, porque o primeiro ja teria travado a repeticao.';

insert into public.whatsapp_templates (chave, nome_meta, categoria, corpo, parametros, botoes, status) values
('retorno_pedido_segunda', 'retorno_pedido_segunda', 'utility',
 'Oi, {{1}}! Faz {{2}} desde a sua ultima passada na *{{3}}*. Voce pediu para que te avisassemos, entao fica o lembrete. Quer marcar?',
 '["primeiro nome","tempo desde a ultima visita","barbearia"]'::jsonb,
 '["Quero marcar","Nao quero mais receber"]'::jsonb, 'rascunho')
on conflict (chave) do nothing;

update public.salons
   set reativacao_dias_2 = 90
 where reativacao_dias > 0 and reativacao_dias_2 = 0;

-- `drop` antes de criar: a coluna `etapa` entra no meio da lista, e
-- `create or replace view` recusa isso com 42P16. Mesma pedra da 0062 e da 0074.
drop view if exists public.clientes_para_avisar_retorno;
drop view if exists public.clientes_para_reativar;

create view public.clientes_para_avisar_retorno
with (security_invoker = on) as
with config as (
  select s.id as salon_id, s.nome as barbearia, s.reativacao_dias, s.reativacao_dias_2
    from public.salons s
   where s.ativo and s.reativacao_dias > 0
),
ultima_visita as (
  select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
    from public.appointments a
   where a.status = 'concluido'
   group by a.client_id, a.salon_id
),
elegivel as (
  select c.id as client_id, cfg.salon_id, cfg.barbearia, c.nome, c.telefone, uv.em as visita,
         (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) as dias,
         cfg.reativacao_dias, cfg.reativacao_dias_2, wc.instance_name
    from config cfg
    join public.clients c on c.salon_id = cfg.salon_id
    join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
    join public.salons_com_automacao sa on sa.id = cfg.salon_id
    join public.whatsapp_connections wc on wc.salon_id = cfg.salon_id and wc.status = 'open'
   where c.quer_aviso_de_retorno
     and c.aviso_de_retorno_em is not null
     and not c.recusou_contato
     and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
     and not exists (
       select 1 from public.appointments a2
        where a2.client_id = c.id and a2.status in ('agendado', 'confirmado')
          and a2.data_hora_inicio > now()
     )
),
com_etapa as (
  select e.*,
         case
           -- Segundo toque tem prioridade: quem passou dos 90 e ja recebeu o
           -- primeiro precisa do segundo, nao de outro primeiro.
           when e.reativacao_dias_2 > 0 and e.dias >= e.reativacao_dias_2
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 2
                                   and r.criado_em > e.visita)
             then 2
           when e.dias >= e.reativacao_dias
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 1
                                   and r.criado_em > e.visita)
             then 1
           else null
         end as etapa
    from elegivel e
)
select
  ce.client_id, ce.salon_id, ce.barbearia, ce.nome as cliente,
  ce.dias as dias_sem_vir, ce.etapa, ce.instance_name,
  '55' || regexp_replace(ce.telefone, '\D', '', 'g') as destino,
  t.nome_meta as template, t.idioma as template_idioma,
  case when ce.etapa = 1
    then jsonb_build_array(split_part(ce.nome, ' ', 1), ce.barbearia, public.tempo_sem_vir(ce.dias))
    else jsonb_build_array(split_part(ce.nome, ' ', 1), public.tempo_sem_vir(ce.dias), ce.barbearia)
  end as template_parametros
from com_etapa ce
join public.whatsapp_templates t
  on t.chave = case when ce.etapa = 1 then 'retorno_pedido' else 'retorno_pedido_segunda' end
 and t.status = 'aprovado' and t.ativo
where ce.etapa is not null;

comment on view public.clientes_para_avisar_retorno is
  'Clientes que confirmaram no caixa, em dois toques (etapa 1 e 2) com textos diferentes. UTILIDADE. Envio so conta se posterior a ultima visita, entao o ciclo reinicia quando o cliente volta e some de novo.';

create view public.clientes_para_reativar
with (security_invoker = on) as
with config as (
  select s.id as salon_id, s.nome as barbearia, s.reativacao_dias, s.reativacao_dias_2
    from public.salons s
   where s.ativo and s.reativacao_dias > 0
),
ultima_visita as (
  select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
    from public.appointments a
   where a.status = 'concluido'
   group by a.client_id, a.salon_id
),
elegivel as (
  select c.id as client_id, cfg.salon_id, cfg.barbearia, c.nome, c.telefone, uv.em as visita,
         (current_date - (uv.em at time zone 'America/Sao_Paulo')::date) as dias,
         cfg.reativacao_dias, cfg.reativacao_dias_2, wc.instance_name
    from config cfg
    join public.clients c on c.salon_id = cfg.salon_id
    join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
    join public.salons_com_automacao sa on sa.id = cfg.salon_id
    join public.whatsapp_connections wc on wc.salon_id = cfg.salon_id and wc.status = 'open'
   where not c.recusou_contato
     and c.aviso_de_retorno_em is null
     and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
     and not exists (
       select 1 from public.appointments a2
        where a2.client_id = c.id and a2.status in ('agendado', 'confirmado')
          and a2.data_hora_inicio > now()
     )
),
com_etapa as (
  select e.*,
         case
           when e.reativacao_dias_2 > 0 and e.dias >= e.reativacao_dias_2
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 2
                                   and r.criado_em > e.visita)
             then 2
           when e.dias >= e.reativacao_dias
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 1
                                   and r.criado_em > e.visita)
             then 1
           else null
         end as etapa
    from elegivel e
)
select
  ce.client_id, ce.salon_id, ce.barbearia, ce.nome as cliente,
  ce.dias as dias_sem_vir, ce.etapa, ce.instance_name,
  '55' || regexp_replace(ce.telefone, '\D', '', 'g') as destino,
  t.nome_meta as template, t.idioma as template_idioma,
  jsonb_build_array(split_part(ce.nome, ' ', 1), public.tempo_sem_vir(ce.dias), ce.barbearia)
    as template_parametros
from com_etapa ce
join public.whatsapp_templates t
  on t.chave = case when ce.etapa = 1 then 'reativacao' else 'reativacao_tempo' end
 and t.status = 'aprovado' and t.ativo
where ce.etapa is not null;

comment on view public.clientes_para_reativar is
  'Clientes dormentes que nunca confirmaram nada no caixa, em dois toques com textos diferentes. MARKETING (~R$ 0,35 cada). Exclui quem esta em clientes_para_avisar_retorno.';
