-- 0152 — Erro de entrega da Meta deixa de ser invisivel.
--
-- O `whatsapp-webhook` fazia `if (valor.statuses?.length) continue` nos DOIS
-- ramos do hibrido. E esse bloco e o UNICO lugar por onde um erro da Meta
-- chegaria. Sumiam:
--
--   131026 -- numero nao existe ou nao tem WhatsApp
--   131047 -- janela de 24h fechada, era preciso template
--   131049 -- a Meta optou por nao entregar (qualidade/limite de marketing)
--   e toda nao-entrega, inclusive cliente que BLOQUEOU o numero
--
-- Resultado: voce ACHA que entregou. O lembrete nao chegou, o convite de
-- reativacao nao chegou, e nada muda de cor em lugar nenhum. Voce descobre pelo
-- cliente que nao apareceu.
--
-- Nota de escopo: o dono levantou que a janela de 24h deixa de ser gratuita em
-- 01/10/2026, e concluiu que o 131047 perde relevancia. Concordo -- na pratica
-- todo texto livre que o sistema manda responde a algo que o cliente ACABOU de
-- fazer, entao a janela esta aberta. O valor desta migration e o RESTO: numero
-- invalido, bloqueio e template pausado nao dependem de janela nenhuma.

-- 1) O registro. `message_id` e a PK: a Meta pode reenviar o mesmo status, e
--    contar duas vezes inflaria o aviso ao dono.
create table if not exists public.entregas_falhadas (
  message_id       text primary key,
  salon_id         uuid references public.salons(id) on delete cascade,
  destino          text not null,
  codigo           integer,
  titulo           text,
  detalhe          text,
  phone_number_id  text,
  ocorrido_em      timestamptz not null default now()
);

create index if not exists entregas_falhadas_salao_idx
  on public.entregas_falhadas (salon_id, ocorrido_em desc);

alter table public.entregas_falhadas enable row level security;
-- Sem policy: nega por padrao para `authenticated`. Quem escreve e a edge com a
-- service key; quem le e a view de auditoria.
revoke all on public.entregas_falhadas from anon, authenticated;
grant select, insert on public.entregas_falhadas to service_role;

comment on table public.entregas_falhadas is
  'Mensagens que a Meta confirmou NAO ter entregue. Alimentada pelo whatsapp-webhook a partir do bloco `statuses`, que antes era descartado inteiro.';

-- 2) Resolve o salao pelo wamid e grava, numa ida so.
--
-- O wamid da mensagem que falhou e o mesmo que guardamos ao ENVIAR: lembrete em
-- `appointments.lembrete_message_id`, pedido de avaliacao em
-- `avaliacao_pedidos.message_id`. Quando nao casa nenhum (reativacao, por
-- exemplo, nao guarda wamid), grava com salao nulo -- saber que falhou vale
-- mesmo sem saber de quem.
create or replace function public.registrar_entrega_falhada(
  p_message_id text,
  p_destino text,
  p_codigo integer default null,
  p_titulo text default null,
  p_detalhe text default null,
  p_phone_number_id text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_salon uuid;
begin
  if p_message_id is null or p_destino is null then
    return false;
  end if;

  select a.salon_id into v_salon
    from public.appointments a where a.lembrete_message_id = p_message_id limit 1;
  if v_salon is null then
    select ap.salon_id into v_salon
      from public.avaliacao_pedidos ap where ap.message_id = p_message_id limit 1;
  end if;

  insert into public.entregas_falhadas
    (message_id, salon_id, destino, codigo, titulo, detalhe, phone_number_id)
  values (p_message_id, v_salon, p_destino, p_codigo, p_titulo, p_detalhe, p_phone_number_id)
  on conflict (message_id) do nothing;

  return true;
end;
$function$;

revoke all on function public.registrar_entrega_falhada(text, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_entrega_falhada(text, text, integer, text, text, text)
  to service_role;

-- 3) O aviso ao dono: AGRUPADO POR NUMERO, nao por mensagem.
--
-- Cinco clientes com telefone errado numa campanha virariam cinquenta avisos, e
-- aviso demais e o mesmo que aviso nenhum. Uma linha por destino diz o que o
-- dono precisa fazer: conferir AQUELE telefone.
create or replace view public.auditoria_entrega
with (security_invoker = on) as
select 'entrega-falhada:' || e.salon_id::text || ':' || e.destino as chave,
       'Mensagem nao entregue'::text as tipo,
       'aviso'::text as gravidade,
       e.salon_id,
       max(e.ocorrido_em) as ocorrido_em,
       coalesce(max(c.nome), 'Cliente sem cadastro') || ' (' || e.destino || ') nao recebeu '
         || count(*)::text || ' mensagem(ns): '
         || coalesce(
              case max(e.codigo)
                when 131026 then 'o numero nao tem WhatsApp ou nao pode receber'
                when 131047 then 'a janela de 24h fechou e era preciso template'
                when 131049 then 'a Meta optou por nao entregar (qualidade da conta)'
                when 130472 then 'o numero esta num experimento da Meta'
                else max(e.titulo)
              end,
              'motivo nao informado pela Meta')
         || '. Confira o telefone na ficha do cliente.' as detalhe
  from public.entregas_falhadas e
  left join public.clients c
    on c.salon_id = e.salon_id
   and c.telefone_norm = nullif(right(regexp_replace(e.destino, '[^0-9]', '', 'g'), 8), '')
 where e.ocorrido_em > now() - interval '30 days'
   and e.salon_id is not null
 group by e.salon_id, e.destino;

grant select on public.auditoria_entrega to service_role;

-- 4) Entra na fila de avisos, como as outras sete.
--    `create or replace` preserva grants e dependentes: as colunas de saida nao
--    mudam, so a origem ganha um ramo.
create or replace view public.auditoria_pendente as
 select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
   from ( select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_do_agente
    union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_fronteira
    union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_operacao
    union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_avaliacao
    union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_atendimento
    union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_cobranca
    union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_comanda
    union all select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_entrega) a
   left join auditoria_avisos av on av.chave = a.chave
  where av.chave is null
  order by (case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end), a.ocorrido_em desc;

-- 5) Poda junto com o resto do historico.
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
  delete from public.salon_invites
   where usado_em is null and expira_em is not null and expira_em < now() - interval '30 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  -- 90 dias: a view de auditoria so olha 30, e o resto e material de diagnostico.
  delete from public.entregas_falhadas where ocorrido_em < now() - interval '90 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  return v_total;
end;
$function$;
