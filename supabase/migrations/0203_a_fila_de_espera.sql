-- A fila de espera: quem fica esperando uma vaga abrir.
--
-- Item 16. A fundação entrou na 0192 e nunca foi usada: o status `reservado`, a
-- origem `fila`, a coluna `reservada_ate` e a varredura `expirar_reservas` --
-- zero linhas de cada uma até hoje, conferido. Aqui nasce **quem espera**.
--
-- ## A vaga segurada já existe, e é por isso que a fila pode chamar UMA pessoa
--
-- Quando a vaga abrir, o sistema não manda um aviso para a fila inteira e deixa
-- os clientes correrem: ele **segura** a vaga para quem foi chamado, por um
-- prazo, criando um `appointments` com status `reservado`. Isso já é respeitado
-- de graça pela trava de sobreposição, pelo `horarios_livres`, pela agenda
-- pública e pelo CRM -- foi o ponto da 0192.
--
-- Esta migration cria só a fila e as duas portas de entrar e sair. Quem procura
-- a vaga e faz a chamada vem na seguinte, porque é outra conversa (e outro
-- ensaio).
--
-- ## Por que tabela filha para os serviços, e não `uuid[]`
--
-- As funções da casa falam `p_service_ids uuid[]` (0198, 0199, 0202), então a
-- tentação é guardar um array aqui. Mas o schema inteiro tem **uma** coluna de
-- array (`faturas_de_uso.pix_anteriores`, que é histórico, não relação), e as
-- duas relações desse tipo que existem -- `appointment_services` e
-- `professional_services` -- são tabelas filhas. Array também não tem FK: um
-- serviço apagado deixaria id pendurado, e a fila passaria a casar com nada sem
-- dizer por quê.
--
-- A conversão para `uuid[]` acontece dentro da função que procura a vaga, que
-- já fala essa língua.
--
-- ## O que uma pessoa espera
--
-- `de`/`ate` é faixa de dias, não um dia só: *"me avisa se abrir algo essa
-- semana"* é tão comum quanto *"se abrir sábado"* -- e faixa de um dia só é
-- `de = ate`, sem caso especial. `hora_de`/`hora_ate` é opcional, para quem só
-- pode à tarde. `professional_id` nulo quer dizer **qualquer barbeiro**: a
-- preferência existe, mas exigir que ela exista faria o cliente responder uma
-- pergunta que ele não tem.
--
-- ## Uma inscrição aberta por cliente, e por quê
--
-- O índice parcial único impede o mesmo cliente de ter duas inscrições vivas na
-- mesma barbearia. Não é limitação técnica: é que *"me avisa se abrir"* dito
-- duas vezes é a mesma vontade dita duas vezes, e duas inscrições fariam o
-- sistema chamar a pessoa duas vezes para a mesma vaga.
--
-- ## O status `chamado` sem vaga é informação, não inconsistência
--
-- A `expirar_reservas` **apaga** a linha da reserva (não cancela), e a FK aqui é
-- `on delete set null`. Então uma inscrição em `chamado` com `appointment_id`
-- nulo significa exatamente *"foi chamado e não respondeu no prazo"* -- e é
-- assim que a próxima migration vai saber que precisa chamar o próximo. Por isso
-- **não existe** CHECK exigindo `appointment_id` quando o status é `chamado`:
-- ele quebraria na varredura, que é justamente o caminho normal.

create table if not exists public.fila_de_espera (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,

  -- Nulo = qualquer barbeiro. A preferencia existe; exigi-la nao.
  professional_id uuid references public.professionals (id) on delete set null,

  de date not null,
  ate date not null,
  hora_de time,
  hora_ate time,

  status text not null default 'esperando',
  -- Quantas vezes essa pessoa ja foi chamada e nao respondeu. Duas chamadas sem
  -- resposta encerram a inscricao: chamar para sempre e virar spam, e chamar uma
  -- vez so despeja quem estava no banho.
  chamadas smallint not null default 0,

  -- A vaga segurada para ela (0192). Fica nulo quando o prazo vence e a
  -- varredura apaga a reserva -- e esse nulo e o sinal de "nao respondeu".
  appointment_id uuid references public.appointments (id) on delete set null,

  origem text not null default 'crm',
  criada_em timestamptz not null default now(),
  chamada_em timestamptz,
  encerrada_em timestamptz,

  constraint fila_status_valido
    check (status in ('esperando', 'chamado', 'atendido', 'saiu', 'expirou')),
  constraint fila_origem_valida
    check (origem in ('crm', 'agente')),
  constraint fila_faixa_de_dias_valida
    check (ate >= de),
  -- Ou a janela de horario inteira, ou nenhuma: so uma das pontas e um filtro
  -- que ninguem sabe ler. CHECK so recusa FALSE -- com uma ponta nula o `>`
  -- daria NULL e passaria --, entao os dois lados sao explicitos.
  constraint fila_janela_de_hora_em_par
    check ((hora_de is null and hora_ate is null)
           or (hora_de is not null and hora_ate is not null and hora_ate > hora_de)),
  -- Encerrada sem data de encerramento e inscricao que ninguem sabe quando saiu.
  constraint fila_encerrada_com_data
    check ((status in ('esperando', 'chamado') and encerrada_em is null)
           or (status in ('atendido', 'saiu', 'expirou') and encerrada_em is not null))
);

comment on table public.fila_de_espera is
  'Quem espera uma vaga abrir. A vaga, quando abre, e SEGURADA para quem foi chamado como um appointments com status reservado (0192) -- nao se manda aviso para a fila inteira e deixa os clientes correrem. `chamado` com appointment_id NULO significa "chamado e nao respondeu": a varredura expirar_reservas apaga a reserva e a FK e on delete set null.';

comment on column public.fila_de_espera.professional_id is
  'Nulo = qualquer barbeiro serve. A preferencia existe, mas exigi-la faria o cliente responder pergunta que ele nao tem.';

comment on column public.fila_de_espera.chamadas is
  'Chamadas sem resposta. Duas encerram a inscricao: chamar para sempre e spam, chamar uma vez so despeja quem estava no banho.';

create table if not exists public.fila_de_espera_servicos (
  fila_id uuid not null references public.fila_de_espera (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  ordem smallint not null default 1,
  primary key (fila_id, service_id)
);

comment on table public.fila_de_espera_servicos is
  'O que a pessoa esta esperando fazer. Tabela filha, como appointment_services e professional_services -- e nao uuid[], que nao tem FK e deixaria id pendurado quando um servico fosse apagado. A conversao para uuid[] acontece na funcao que procura a vaga.';

-- Uma inscricao viva por cliente e por barbearia. "Me avisa se abrir" dito duas
-- vezes e a mesma vontade dita duas vezes.
create unique index if not exists fila_uma_inscricao_viva_por_cliente
  on public.fila_de_espera (salon_id, client_id)
  where status in ('esperando', 'chamado');

-- O caminho que a funcao da proxima migration vai percorrer: por barbearia, as
-- inscricoes vivas na ordem de chegada.
create index if not exists fila_vivas_por_barbearia
  on public.fila_de_espera (salon_id, criada_em)
  where status = 'esperando';

------------------------------------------------------------------------------
-- RLS: a fila e dado de barbearia, e so quem e da casa le
------------------------------------------------------------------------------
alter table public.fila_de_espera enable row level security;
alter table public.fila_de_espera_servicos enable row level security;

-- Leitura para quem e da unidade (a tela da fila). Escrita NAO tem policy de
-- proposito: entrar e sair passam pelas RPCs abaixo, que validam o resto.
create policy "fila: membros leem" on public.fila_de_espera
  for select using (salon_id in (select private.salon_ids()));

create policy "fila_servicos: membros leem" on public.fila_de_espera_servicos
  for select using (
    exists (select 1 from public.fila_de_espera f
             where f.id = fila_id and f.salon_id in (select private.salon_ids()))
  );

grant select on public.fila_de_espera to authenticated;
grant select on public.fila_de_espera_servicos to authenticated;

------------------------------------------------------------------------------
-- Entrar na fila
------------------------------------------------------------------------------
create or replace function public.entrar_na_fila(
  p_salon_id uuid,
  p_client_id uuid,
  p_service_ids uuid[],
  p_de date,
  p_ate date,
  p_hora_de time default null,
  p_hora_ate time default null,
  p_professional_id uuid default null,
  p_origem text default 'crm'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
  v_qtd int;
  v_ja uuid;
begin
  if p_salon_id is null or p_client_id is null or p_de is null or p_ate is null then
    raise exception 'Faltou barbearia, cliente ou a faixa de dias.' using errcode = '22023';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;
  if p_origem not in ('crm', 'agente') then
    raise exception 'Origem invalida.' using errcode = '22023';
  end if;

  -- O cliente e do salao informado. Recusa de negocio aqui seria estranha: id
  -- trocado e chamada malfeita.
  if not exists (select 1 from public.clients c
                  where c.id = p_client_id and c.salon_id = p_salon_id) then
    raise exception 'Cliente nao e desta barbearia.' using errcode = '42501';
  end if;

  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid and s.salon_id = p_salon_id and s.ativo;
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outra barbearia, inativo ou inexistente.'
      using errcode = '22023';
  end if;

  if p_professional_id is not null
     and not exists (select 1 from public.professionals p
                      where p.id = p_professional_id
                        and p.salon_id = p_salon_id
                        and p.ativo) then
    raise exception 'Profissional nao e desta barbearia ou esta inativo.'
      using errcode = '42501';
  end if;

  -- Recusas de NEGOCIO voltam como ok:false para virar conversa (a regua da
  -- casa): o agente repassa o motivo com as palavras dele.
  if p_ate < v_hoje then
    return jsonb_build_object('ok', false,
      'motivo', 'Essa faixa de dias ja passou.');
  end if;
  if p_hora_de is not null and p_hora_ate is not null and p_hora_ate <= p_hora_de then
    return jsonb_build_object('ok', false,
      'motivo', 'A hora final precisa ser depois da inicial.');
  end if;

  select f.id into v_ja
    from public.fila_de_espera f
   where f.salon_id = p_salon_id
     and f.client_id = p_client_id
     and f.status in ('esperando', 'chamado');
  if v_ja is not null then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse cliente ja esta na fila.',
      'fila_id', v_ja);
  end if;

  insert into public.fila_de_espera
    (salon_id, client_id, professional_id, de, ate, hora_de, hora_ate, origem)
  values (p_salon_id, p_client_id, p_professional_id,
          greatest(p_de, v_hoje), p_ate, p_hora_de, p_hora_ate, p_origem)
  returning id into v_id;

  insert into public.fila_de_espera_servicos (fila_id, service_id, ordem)
  select v_id, u.sid, u.ord
    from (select distinct on (sid) sid, ord
            from unnest(p_service_ids) with ordinality as u(sid, ord)
           order by sid, ord) u;

  return jsonb_build_object('ok', true, 'fila_id', v_id,
    'de', greatest(p_de, v_hoje), 'ate', p_ate);
end;
$function$;

revoke all on function public.entrar_na_fila(uuid, uuid, uuid[], date, date, time, time, uuid, text)
  from public, anon;
grant execute on function public.entrar_na_fila(uuid, uuid, uuid[], date, date, time, time, uuid, text)
  to authenticated, service_role;

comment on function public.entrar_na_fila(uuid, uuid, uuid[], date, date, time, time, uuid, text) is
  'Poe um cliente na fila de espera. Recusa de NEGOCIO volta como {ok:false, motivo} para o agente transformar em conversa -- faixa que ja passou, hora invertida, cliente ja na fila. Id trocado (cliente ou servico de outra barbearia) e chamada malfeita e levanta excecao. `de` nunca nasce no passado: quem pede "essa semana" na quarta espera de quarta em diante.';

------------------------------------------------------------------------------
-- Sair da fila
------------------------------------------------------------------------------
create or replace function public.sair_da_fila(
  p_fila_id uuid,
  p_motivo text default 'saiu'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_salon uuid;
  v_status text;
  v_reserva uuid;
begin
  if p_motivo not in ('saiu', 'expirou') then
    raise exception 'Motivo de saida invalido.' using errcode = '22023';
  end if;

  select f.salon_id, f.status, f.appointment_id
    into v_salon, v_status, v_reserva
    from public.fila_de_espera f
   where f.id = p_fila_id;

  if v_salon is null then
    return jsonb_build_object('ok', false, 'motivo', 'Essa inscricao nao existe.');
  end if;
  if v_status not in ('esperando', 'chamado') then
    return jsonb_build_object('ok', false,
      'motivo', 'Essa inscricao ja estava encerrada.', 'status', v_status);
  end if;

  update public.fila_de_espera
     set status = p_motivo,
         encerrada_em = now(),
         appointment_id = null
   where id = p_fila_id;

  -- Quem sai da fila com vaga segurada devolve a vaga NA HORA. Esperar a
  -- varredura deixaria o horario preso por ate 30 minutos para quem acabou de
  -- dizer que nao quer -- e esse horario pode ser o de outra pessoa da fila.
  if v_reserva is not null then
    delete from public.appointments
     where id = v_reserva and status = 'reservado';
  end if;

  return jsonb_build_object('ok', true, 'vaga_devolvida', v_reserva is not null);
end;
$function$;

revoke all on function public.sair_da_fila(uuid, text) from public, anon;
grant execute on function public.sair_da_fila(uuid, text) to authenticated, service_role;

comment on function public.sair_da_fila(uuid, text) is
  'Tira uma inscricao da fila. Se ela tinha vaga segurada, a vaga volta NA HORA (delete da reserva) em vez de esperar a varredura: 30 minutos de horario preso para quem acabou de dizer que nao quer pode ser o horario de outra pessoa da fila. Inscricao inexistente ou ja encerrada volta como {ok:false, motivo}, nao excecao -- as duas portas chamam isto e "ja saiu" e conversa, nao erro.';

notify pgrst, 'reload schema';
