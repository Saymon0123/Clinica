-- O pedido de dono deixa de morrer com o CRM fechado.
--
-- Diagnóstico de 06/10: quando o cliente pede uma pessoa, o agente marca
-- `needs_human` E `agent_paused` na mesma escrita -- ou seja, o robô se cala na
-- hora. Com o CRM ABERTO o aviso é imediato (realtime, som, botão WEB aceso).
-- Com o CRM FECHADO não havia nada: sem carimbo de quando o pedido chegou, sem
-- gatilho na tabela, fora do sino, fora do pg_cron, sem e-mail.
--
-- O resultado é pior do que não ter a funcionalidade: o cliente pediu uma
-- pessoa, o robô parou de responder, e ninguém assume. Ele fica no vácuo até o
-- dono abrir o CRM -- que pode ser no dia seguinte.
--
-- Esta migration fecha os quatro buracos:
--
--   1. `needs_human_em` -- o carimbo que faltava, mantido por GATILHO e não
--      pelo n8n: assim ele vale para quem quer que vire a chave, inclusive o
--      próprio CRM, e não pode dessincronizar.
--   2. O quarto ramo do sino, que agora enxerga o pedido.
--   3. Um motor de aviso por e-mail para o DONO DA BARBEARIA (não para o canal
--      de alertas, que é o produto falando com quem o mantém).
--   4. Um prazo que devolve a conversa ao agente se ninguém assumir -- para o
--      cliente deixar de esperar para sempre.

-- ---------------------------------------------------------------- 1) O carimbo

alter table public.whatsapp_conversations
  add column if not exists needs_human_em timestamptz;

comment on column public.whatsapp_conversations.needs_human_em is
  'Quando o pedido de falar com uma pessoa chegou. Mantida pelo gatilho carimbar_pedido_de_dono, nunca escrita a mao: o sino ordena por ela e o prazo da devolucao conta a partir dela.';

-- Retroativo: quem ja estava pedindo nao pode ficar invisivel para o sino.
-- Hoje sao zero linhas; a linha existe para o caso de a chave virar entre
-- escrever e aplicar.
update public.whatsapp_conversations
   set needs_human_em = coalesce(last_message_at, created_at)
 where needs_human and needs_human_em is null;

create or replace function private.carimbar_pedido_de_dono()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- No INSERT nao existe OLD: ler old.needs_human aqui levantaria erro.
  if tg_op = 'INSERT' then
    if new.needs_human then
      new.needs_human_em := now();
    end if;
    return new;
  end if;

  if new.needs_human and not coalesce(old.needs_human, false) then
    new.needs_human_em := now();
  elsif not new.needs_human then
    -- O dono respondeu (a edge zera os dois campos juntos) ou o pedido foi
    -- resolvido: o carimbo sai com ele, senao o sino repetiria para sempre.
    new.needs_human_em := null;
  end if;
  -- Pedido que continua de pe nao e re-carimbado: `last_message_at` muda a cada
  -- mensagem, e re-carimbar reiniciaria o prazo da devolucao a cada "oi?" do
  -- cliente -- exatamente quem mais precisa dela.
  return new;
end $$;

drop trigger if exists carimbar_pedido_de_dono on public.whatsapp_conversations;
create trigger carimbar_pedido_de_dono
  before insert or update on public.whatsapp_conversations
  for each row execute function private.carimbar_pedido_de_dono();

revoke all on function private.carimbar_pedido_de_dono() from public, anon, authenticated;

-- ------------------------------------------------------------ 2) O quarto ramo
--
-- A view recria por inteiro (drop + create), como manda a regra da casa: o
-- `create or replace` perderia em silencio o `security_invoker` e os grants, e
-- coluna nova no meio da lista levantaria 42P16. A coluna `detalhe` nasce aqui
-- porque o pedido de dono traz um RESUMO, que os tres ramos de agendamento nao
-- tem -- e enfiar o resumo em `servicos` seria mentir sobre o que a coluna e.

drop view if exists public.notificacoes_do_salao;

create view public.notificacoes_do_salao
with (security_invoker = on) as
 select 'novo_horario:'::text || a.id as chave,
    a.salon_id,
    'novo_horario'::text as tipo,
    a.created_at as evento_em,
    a.data_hora_inicio,
    a.origem,
    c.nome as cliente,
    p.nome as barbeiro,
    coalesce((select string_agg(s2.nome, ' + '::text order by asv.ordem)
                from appointment_services asv
                join services s2 on s2.id = asv.service_id
               where asv.appointment_id = a.id), s.nome) as servicos,
    null::text as detalhe
   from appointments a
     left join clients c on c.id = a.client_id
     left join professionals p on p.id = a.professional_id
     left join services s on s.id = a.service_id
  where (a.origem = any (array['agente'::text, 'publico'::text]))
    and a.created_at >= (now() - '7 days'::interval)
union all
 select 'cancelou:'::text || a.id as chave,
    a.salon_id,
    'cancelou'::text as tipo,
    a.cancelado_em as evento_em,
    a.data_hora_inicio,
    a.origem,
    c.nome as cliente,
    p.nome as barbeiro,
    coalesce((select string_agg(s2.nome, ' + '::text order by asv.ordem)
                from appointment_services asv
                join services s2 on s2.id = asv.service_id
               where asv.appointment_id = a.id), s.nome) as servicos,
    null::text as detalhe
   from appointments a
     left join clients c on c.id = a.client_id
     left join professionals p on p.id = a.professional_id
     left join services s on s.id = a.service_id
  where a.status = 'cancelado'::text
    and a.cancelado_por = 'cliente'::text
    and a.cancelado_em >= (now() - '7 days'::interval)
union all
 select 'remarcou:'::text || a.id as chave,
    a.salon_id,
    'remarcou'::text as tipo,
    a.remarcado_pelo_cliente_em as evento_em,
    a.data_hora_inicio,
    a.origem,
    c.nome as cliente,
    p.nome as barbeiro,
    coalesce((select string_agg(s2.nome, ' + '::text order by asv.ordem)
                from appointment_services asv
                join services s2 on s2.id = asv.service_id
               where asv.appointment_id = a.id), s.nome) as servicos,
    null::text as detalhe
   from appointments a
     left join clients c on c.id = a.client_id
     left join professionals p on p.id = a.professional_id
     left join services s on s.id = a.service_id
  where (a.status = any (array['agendado'::text, 'confirmado'::text]))
    and a.remarcado_pelo_cliente_em is not null
    and a.remarcado_pelo_cliente_em >= (now() - '7 days'::interval)
union all
 -- O QUARTO: pediu para falar com uma pessoa.
 --
 -- `data_hora_inicio` e `barbeiro` sao nulos de proposito: nao ha agendamento
 -- nenhum por tras de um pedido de dono, e inventar um horario seria pior que
 -- deixar vazio. A tela trata este tipo a parte.
 --
 -- A chave carrega o carimbo porque o mesmo cliente pode pedir o dono mais de
 -- uma vez na mesma conversa: sem ele, o segundo pedido herdaria o "ja visto"
 -- do primeiro e nunca acenderia o sino.
 select 'pediu_dono:'::text || w.id::text || ':' || w.needs_human_em::text as chave,
    w.salon_id,
    'pediu_dono'::text as tipo,
    w.needs_human_em as evento_em,
    null::timestamptz as data_hora_inicio,
    'agente'::text as origem,
    coalesce(nullif(btrim(w.contact_name), ''), w.contact_phone) as cliente,
    null::text as barbeiro,
    null::text as servicos,
    w.resumo_contexto as detalhe
   from whatsapp_conversations w
  where w.needs_human
    and w.needs_human_em is not null
    and w.needs_human_em >= (now() - '7 days'::interval);

comment on view public.notificacoes_do_salao is
  'O que o cliente fez sozinho nos ultimos 7 dias: marcou, cancelou, remarcou e -- desde a 0216 -- pediu para falar com uma pessoa. security_invoker: a RLS de cada tabela e quem decide o que cada dono enxerga.';

-- Os grants de antes, repostos um a um.
--
-- O `revoke` de `anon` nao e decorativo: o ensaio mostrou que a view recriada
-- NASCE com `select` para `anon` pelo padrao do schema, mesmo a antiga nunca
-- tendo tido.
--
-- Sendo exato sobre o risco: a unica politica de `whatsapp_conversations` e do
-- papel `public` e exige gestor logado, entao `anon` cairia em zero linhas de
-- qualquer jeito -- nao e porta aberta. O que a linha impede e a DERIVA: sair
-- da migration com grants diferentes dos que entraram, que e precisamente o que
-- a regra do `drop` + `create` existe para pegar. Trinco a menos hoje e porta
-- aberta no dia em que alguem afrouxar a politica.
revoke all on public.notificacoes_do_salao from anon;
grant select on public.notificacoes_do_salao to authenticated;

-- --------------------------------------------------- 3) O aviso fora do CRM
--
-- Vai por e-mail para o DONO DA BARBEARIA, lido de `auth.users` pelo vinculo em
-- `user_salons`. NAO vai para `canal_de_alertas`: aquele canal e o produto
-- falando com quem mantem o produto, e tem um destinatario so para todas as
-- barbearias -- usa-lo aqui mandaria o pedido do cliente de um salao para a
-- caixa de entrada de outra pessoa.
--
-- WhatsApp seria melhor que e-mail, e nao da hoje: mensagem que a plataforma
-- inicia exige template aprovado pela Meta, e nao existe um para isto.

create or replace function private.pedidos_de_dono_pendentes(p_limite integer default 20)
returns table (
  chave text,
  conversation_id uuid,
  salao text,
  cliente text,
  contato text,
  resumo text,
  pedido_em timestamptz,
  destino_email text
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select ('pedido_dono:' || w.id::text || ':' || w.needs_human_em::text)::text,
         w.id,
         s.nome,
         coalesce(nullif(btrim(w.contact_name), ''), w.contact_phone),
         w.contact_phone,
         coalesce(nullif(btrim(w.resumo_contexto), ''),
                  'O cliente pediu para falar com uma pessoa e o agente nao resumiu o motivo.'),
         w.needs_human_em,
         (select string_agg(u.email, ',' order by u.email)
            from public.user_salons us
            join auth.users u on u.id = us.user_id
           where us.salon_id = w.salon_id
             and us.role in ('owner', 'gerente')
             and u.email is not null)
    from public.whatsapp_conversations w
    join public.salons s on s.id = w.salon_id and s.ativo
    left join public.auditoria_avisos a
           on a.chave = 'pedido_dono:' || w.id::text || ':' || w.needs_human_em::text
   where w.needs_human
     and w.needs_human_em is not null
     and a.chave is null
   order by w.needs_human_em
   limit greatest(p_limite, 1)
$$;

comment on function private.pedidos_de_dono_pendentes(integer) is
  'Pedidos de dono que ainda nao foram avisados por e-mail, do mais antigo para o mais novo. Quem ja foi avisado sai pela juncao com auditoria_avisos.';

-- O n8n so alcanca `public` pelo PostgREST: `private` devolveria PGRST202.
create or replace function public.rodar_os_avisos_de_pedido_de_dono(p_limite integer default 20)
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'pedidos',
    coalesce((select jsonb_agg(to_jsonb(x)) from private.pedidos_de_dono_pendentes(p_limite) x
               where x.destino_email is not null), '[]'::jsonb)
  )
$$;

comment on function public.rodar_os_avisos_de_pedido_de_dono(integer) is
  'O que o fluxo do n8n le a cada varredura. Quem nao tem e-mail de dono cadastrado e filtrado aqui: nao da para avisar, e devolver a linha so faria o fluxo tentar e falhar.';

create or replace function public.registrar_aviso_de_pedido_de_dono(p_chave text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.auditoria_avisos (chave, avisado_em)
  values (p_chave, now())
  on conflict (chave) do nothing
$$;

comment on function public.registrar_aviso_de_pedido_de_dono(text) is
  'Marca o pedido como avisado. Chamada DEPOIS do envio, ao contrario do motor do imprevisto: la a reivindicacao vem antes porque o aviso e unico e disputado; aqui um e-mail repetido e muito melhor que um e-mail que nunca sai.';

-- ------------------------------------------------- 4) O prazo que desempata
--
-- Sem isto, o cliente que pediu uma pessoa fica sem NINGUEM: o robo se calou e
-- o dono nao chegou. Passado o prazo, o agente volta a atender a conversa.
--
-- `needs_human` CONTINUA verdadeiro de proposito: o pedido nao deixou de
-- existir so porque o robo voltou, e o dono precisa continuar vendo a conversa
-- na aba "Solicitou falar com o dono". O que muda e so quem responde enquanto
-- ele nao chega.

create or replace function public.devolver_conversas_sem_dono(p_minutos integer default 30)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_quantas integer;
begin
  with devolvidas as (
    update public.whatsapp_conversations
       set agent_paused = false
     where needs_human
       and agent_paused
       and needs_human_em is not null
       and needs_human_em < now() - make_interval(mins => greatest(p_minutos, 1))
    returning id
  )
  select count(*) into v_quantas from devolvidas;
  return v_quantas;
end $$;

comment on function public.devolver_conversas_sem_dono(integer) is
  'Devolve ao agente a conversa em que o cliente pediu o dono e ninguem assumiu no prazo. NAO limpa needs_human: o pedido continua na lista do dono, so para de deixar o cliente sem resposta. Conversa que o dono pausou a mao (agent_paused sem needs_human) nao e tocada.';

revoke all on function private.pedidos_de_dono_pendentes(integer) from public, anon, authenticated;
revoke all on function public.rodar_os_avisos_de_pedido_de_dono(integer) from public, anon, authenticated;
revoke all on function public.registrar_aviso_de_pedido_de_dono(text) from public, anon, authenticated;
revoke all on function public.devolver_conversas_sem_dono(integer) from public, anon, authenticated;

grant execute on function public.rodar_os_avisos_de_pedido_de_dono(integer) to service_role;
grant execute on function public.registrar_aviso_de_pedido_de_dono(text) to service_role;

select cron.schedule(
  'devolve-conversas-sem-dono',
  '*/5 * * * *',
  $$select public.devolver_conversas_sem_dono(30)$$
);

notify pgrst, 'reload schema';
