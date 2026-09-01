-- 0121: a avaliação passa a sair pelo CANAL OFICIAL (item 16, correção)
--
-- Regra da casa, enunciada em 01/09: **toda conversa iniciada por nós**
-- (reativação, lembrete, avaliação) sai pelo número central na API oficial.
-- A Evolution só responde quem falou primeiro. Motivo: iniciar conversa em
-- massa pelo número não oficial é exatamente o padrão que faz a Meta banir —
-- e o número banido seria o do barbeiro.
--
-- Consequência de desenho: mensagem iniciada exige TEMPLATE APROVADO. Então
-- a nota deixa de ser texto solto e vira CLIQUE em botão (3 quick replies),
-- reconhecido pelo `wamid` como já acontece no lembrete. Isso também resolve
-- quem interpreta a resposta: o número central não tem agente — o banco
-- decide, com a mesma mecânica do `responder_lembrete`.

-- 1) O template (rascunho, como todos: nada sai até a Meta aprovar)
insert into public.whatsapp_templates (chave, nome_meta, idioma, categoria, corpo, parametros, botoes, status, ativo)
values (
  'avaliacao_pos_atendimento',
  'avaliacao_pos_atendimento',
  'pt_BR',
  'utility',
  'Oi, {{1}}! Aqui é da {{2}}. Como foi seu atendimento hoje? Sua resposta ajuda a gente a melhorar.',
  '["cliente","barbearia"]'::jsonb,
  '["Otimo","Bom","Podia melhorar"]'::jsonb,
  'rascunho',
  true
)
on conflict (chave) do nothing;

-- 2) Pedidos enviados: guarda o wamid, que é como o clique volta a encontrar
--    o cliente e a comanda.
create table if not exists public.avaliacao_pedidos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  message_id text unique,
  respondido_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.avaliacao_pedidos enable row level security;
comment on table public.avaliacao_pedidos is
  'Pedidos de avaliação enviados pelo número central. RLS sem policy: só service_role (n8n) e as funções definer.';
create index if not exists idx_avaliacao_pedidos_client on public.avaliacao_pedidos (client_id, criado_em);

-- 3) A fila troca Evolution por remetente central + template
drop view if exists public.avaliacoes_a_pedir;
create view public.avaliacoes_a_pedir
with (security_invoker = on) as
select o.id as order_id,
       o.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       '55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') as destino,
       'cloud_api'::text as provedor,
       rem.phone_number_id,
       t.nome_meta as template,
       t.idioma as template_idioma,
       jsonb_build_array(split_part(c.nome, ' ', 1), s.nome) as template_parametros
  from public.orders o
  join public.clients c on c.id = o.client_id
  join public.salons s on s.id = o.salon_id
  join public.salons_com_automacao sa on sa.id = o.salon_id
  join lateral (
    select r.phone_number_id from public.remetentes_oficiais r
     where r.ativo
     order by (r.phone_number_id = s.remetente_phone_number_id) desc, r.criado_em
     limit 1
  ) rem on true
  join public.whatsapp_templates t
    on t.chave = 'avaliacao_pos_atendimento' and t.status = 'aprovado' and t.ativo
 where o.status = 'fechada'
   and o.closed_at between now() - interval '26 hours' and now() - interval '2 hours'
   and not c.recusou_contato
   and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
   and (c.avaliacao_pedida_em is null or c.avaliacao_pedida_em < now() - interval '8 weeks');

-- 4) Marcar o envio agora guarda o wamid (assinatura nova; a antiga sai)
drop function if exists public.marcar_avaliacao_pedida(uuid);
create or replace function public.marcar_avaliacao_pedida(
  p_client_id uuid, p_salon_id uuid, p_order_id uuid, p_message_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.avaliacao_pedidos (salon_id, client_id, order_id, message_id)
  values (p_salon_id, p_client_id, p_order_id, p_message_id)
  on conflict (message_id) do nothing;
  update public.clients set avaliacao_pedida_em = now() where id = p_client_id;
end;
$$;
revoke all on function public.marcar_avaliacao_pedida(uuid, uuid, uuid, text) from public, anon, authenticated;

-- 5) O clique vira nota. Mesma mecânica do responder_lembrete: o banco decide,
--    devolve o texto pronto e diz se o dono precisa ser avisado.
create or replace function public.responder_avaliacao(p_message_id text, p_botao text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_p public.avaliacao_pedidos%rowtype;
  v_botao text;
  v_nota smallint;
  v_cliente text;
  v_link text;
begin
  if p_message_id is null or p_botao is null then return jsonb_build_object('atendido', false); end if;
  select * into v_p from public.avaliacao_pedidos where message_id = p_message_id;
  if not found then return jsonb_build_object('atendido', false); end if;
  if v_p.respondido_em is not null then
    return jsonb_build_object('atendido', true, 'acao', 'repetido', 'salon_id', v_p.salon_id, 'resposta', null);
  end if;

  v_botao := lower(translate(p_botao, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC'));
  if v_botao like '%otimo%' then v_nota := 5;
  elsif v_botao like '%bom%' then v_nota := 4;
  elsif v_botao like '%melhor%' then v_nota := 2;
  else return jsonb_build_object('atendido', false);
  end if;

  insert into public.avaliacoes (salon_id, client_id, order_id, nota, comentario)
  values (v_p.salon_id, v_p.client_id, v_p.order_id, v_nota, p_botao);
  update public.avaliacao_pedidos set respondido_em = now() where id = v_p.id;

  select coalesce(split_part(c.nome, ' ', 1), '') into v_cliente
    from public.clients c where c.id = v_p.client_id;
  select s.google_review_url into v_link from public.salons s where s.id = v_p.salon_id;

  if v_nota = 5 and v_link is not null and v_link <> '' then
    return jsonb_build_object('atendido', true, 'acao', 'nota', 'nota', v_nota,
      'salon_id', v_p.salon_id, 'avisar_dono', false,
      'resposta', 'Que bom, ' || v_cliente || '! Se puder deixar essa nota no Google, ajuda demais a barbearia: ' || v_link);
  elsif v_nota >= 4 then
    return jsonb_build_object('atendido', true, 'acao', 'nota', 'nota', v_nota,
      'salon_id', v_p.salon_id, 'avisar_dono', false,
      'resposta', 'Valeu, ' || v_cliente || '! Obrigado por responder — até a próxima.');
  else
    return jsonb_build_object('atendido', true, 'acao', 'nota', 'nota', v_nota,
      'salon_id', v_p.salon_id, 'avisar_dono', true,
      'resposta', 'Obrigado pela sinceridade, ' || v_cliente || '. Vou passar isso para o dono da barbearia.');
  end if;
end;
$$;
revoke all on function public.responder_avaliacao(text, text) from public, anon, authenticated;

-- 6) Nota baixa vira alerta no canal que já existe (uma linha por avaliação)
drop view if exists public.auditoria_pendente;
drop view if exists public.auditoria_avaliacao;
create view public.auditoria_avaliacao
with (security_invoker = on) as
select 'avaliacao-baixa:' || a.id as chave,
       'Cliente avaliou mal o atendimento' as tipo,
       'aviso' as gravidade,
       a.salon_id,
       a.criado_em as ocorrido_em,
       s.nome || ' -- nota ' || a.nota || ' de ' || coalesce(split_part(c.nome, ' ', 1), 'um cliente')
         || '. Vale uma ligacao antes que vire reclamacao publica.' as detalhe
  from public.avaliacoes a
  join public.salons s on s.id = a.salon_id
  left join public.clients c on c.id = a.client_id
 where a.nota <= 3
   and a.criado_em > now() - interval '30 days';

create view public.auditoria_pendente
with (security_invoker = on) as
select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
  from (
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_do_agente
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_fronteira
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_operacao
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_avaliacao
  ) a
  left join public.auditoria_avisos av on av.chave = a.chave
 where av.chave is null
 order by case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
          a.ocorrido_em desc;
