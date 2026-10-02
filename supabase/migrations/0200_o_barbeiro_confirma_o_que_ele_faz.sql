-- O barbeiro confirma o que ele faz.
--
-- Primeira metade do onboarding do barbeiro (item 20). A 0199 fez a régua das
-- vagas respeitar `professional_services`; aqui nasce o jeito de MEXER nessa
-- lista, que até hoje não existia em lugar nenhum do produto.
--
-- ## Três coisas, e o porquê de cada uma
--
-- ### 1. `servicos_confirmados_em`
--
-- Sem esta coluna, a tela de serviços de quem nunca escolheu é **idêntica** à de
-- quem escolheu tudo: os oito aparecem marcados, o dono fecha satisfeito, e o
-- que ele viu foi o padrão do `accept-invite` ("entra fazendo tudo"), não uma
-- decisão. É o mesmo defeito que o `HorarioBarbeiroModal` resolveu em 03/08 com
-- o aviso "Ainda não salvo" -- e que só apareceu quando alguém foi investigar
-- por que o agente não tinha horário para oferecer.
--
-- `null` = ninguém escolheu ainda, a lista é o padrão de entrada. A tela diz
-- isso em cima.
--
-- **Sobre a armadilha do grant por coluna: aqui ela NÃO se aplica, e isso foi
-- medido, não suposto.** `professionals` tem privilégio de TABELA para
-- `authenticated` (delete, insert, references, select, trigger, truncate,
-- update) -- a tabela tem exatamente sete colunas, e foi isso que me fez ler
-- "sete colunas com grant" como se fosse grant por coluna. Era coincidência.
-- Coluna nova aqui **herda** tudo, e nenhum `grant` é necessário; acrescentar um
-- seria ruído que faz o próximo acreditar no contrário.
--
-- A vizinha é que é por coluna: `salons` não tem UPDATE de tabela, só a lista
-- branca de colunas -- e foi lá que em 30/09 o dono parou de salvar o horário de
-- funcionamento por causa de um campo que ele nem tocava. Conferir antes de
-- acrescentar coluna que a tela escreva continua sendo a regra; a resposta é que
-- varia de tabela para tabela.
--
-- Consequência que fica registrada: como a coluna herda o UPDATE de tabela, nada
-- no banco impede uma escrita direta nela sem passar pela RPC. Converter
-- `professionals` para grant por coluna só para proteger um timestamp seria
-- trocar um risco pequeno por um grande -- é exatamente a mudança que quebrou a
-- tela de configurações em 30/09. Então a marca é **pista para a tela**, não
-- fronteira de segurança: quem escreve de verdade é a RPC abaixo.
--
-- ### 2. `salvar_servicos_do_barbeiro`
--
-- A tela não faz DELETE e INSERT em duas chamadas. É o achado 43 de 01/09, o
-- mesmo que criou a `salvar_jornada`: a rede caindo entre as duas deixaria o
-- barbeiro **sem serviço nenhum** -- e, pela regra da 0199, sem serviço nenhum
-- ele volta a ser oferecido para tudo. O estrago seria silencioso.
--
-- Valida tudo ANTES de apagar qualquer coisa, e exige **ao menos um** serviço.
-- Esse mínimo não é capricho: pela 0199, lista vazia é lida como "faz todos", e
-- "desmarquei tudo" jamais pode virar "faço tudo".
--
-- ### 3. A jornada passa a aceitar o próprio barbeiro
--
-- A `salvar_jornada` (0135) só aceitava gestor. Para o onboarding, quem sabe o
-- expediente é o barbeiro. E o precedente já existe: a 0182 deu a ele o poder de
-- fechar a própria agenda. Então a autorização passa a ser **gestor OU ele
-- mesmo** -- nunca um barbeiro mexendo na jornada de outro.
--
-- O corpo abaixo é o da 0135 reproduzido inteiro (`create or replace` substitui,
-- não emenda), com uma mudança só: o `if` da autorização. Reproduzir o resto é
-- obrigatório, senão a validação dos 7 dias se perderia em silêncio.

------------------------------------------------------------------------------
-- 1. A marca de "alguém escolheu"
------------------------------------------------------------------------------
alter table public.professionals
  add column if not exists servicos_confirmados_em timestamptz;

comment on column public.professionals.servicos_confirmados_em is
  'Quando alguem (o barbeiro no onboarding ou o gestor na aba Equipe) escolheu de fato quais servicos ele faz. NULL = ninguem escolheu: a lista e o padrao do accept-invite, que liga TODOS os servicos ativos. A tela precisa dizer isso, senao "tudo marcado por padrao" se confunde com "ele faz tudo".';

-- Nenhum `grant` aqui, de proposito: `professionals` tem privilegio de TABELA
-- para `authenticated` e a coluna nova herda. Conferido em
-- information_schema.role_table_grants antes de escrever isto. O cuidado de
-- conferir continua valendo -- a `salons`, ao lado, e por coluna.

------------------------------------------------------------------------------
-- 2. Trocar a lista de serviços de uma vez
------------------------------------------------------------------------------
create or replace function public.salvar_servicos_do_barbeiro(
  p_professional_id uuid,
  p_service_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_salon uuid;
  v_eu boolean;
  v_pedidos int;
  v_validos int;
begin
  select p.salon_id, (p.user_id is not null and p.user_id = auth.uid())
    into v_salon, v_eu
    from public.professionals p
   where p.id = p_professional_id;

  -- Definer ignora RLS: a autorizacao e esta. Gestor da unidade (ativa) ou o
  -- proprio barbeiro -- nunca um barbeiro na lista de outro.
  if v_salon is null
     or v_salon not in (select private.salon_ids())
     or not (private.is_manager(v_salon) or v_eu) then
    raise exception 'So o dono, o gerente ou o proprio barbeiro muda os servicos dele.'
      using errcode = '42501';
  end if;

  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Marque ao menos um servico: barbeiro sem servico nenhum volta a ser oferecido para todos.'
      using errcode = '22023';
  end if;

  -- Valida TUDO antes de apagar: uma linha ruim nao pode deixar o barbeiro sem
  -- servico nenhum.
  select count(distinct sid) into v_pedidos from unnest(p_service_ids) as sid;
  select count(*) into v_validos
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid and s.salon_id = v_salon and s.ativo;
  if v_validos <> v_pedidos then
    raise exception 'Servico de outra barbearia, inativo ou inexistente.'
      using errcode = '22023';
  end if;

  -- Apagar e gravar na mesma transacao: ou a lista nova inteira, ou a antiga
  -- intacta.
  delete from public.professional_services where professional_id = p_professional_id;
  insert into public.professional_services (professional_id, service_id)
  select p_professional_id, d.sid
    from (select distinct sid from unnest(p_service_ids) as sid) d;

  update public.professionals
     set servicos_confirmados_em = now()
   where id = p_professional_id;
end;
$function$;

revoke all on function public.salvar_servicos_do_barbeiro(uuid, uuid[])
  from public, anon;
grant execute on function public.salvar_servicos_do_barbeiro(uuid, uuid[])
  to authenticated, service_role;

comment on function public.salvar_servicos_do_barbeiro(uuid, uuid[]) is
  'Troca a lista de servicos que o barbeiro faz, de uma vez (DELETE + INSERT na mesma transacao, como a salvar_jornada): a rede caindo entre duas chamadas o deixaria sem servico nenhum, e pela 0199 isso o faz ser oferecido para TODOS. Exige ao menos um servico pelo mesmo motivo. Autorizada para o gestor da unidade ou para o proprio barbeiro (precedente: 0182, o barbeiro fecha a propria agenda). Marca servicos_confirmados_em, que e o que distingue "escolheu tudo" de "nunca escolheu".';

------------------------------------------------------------------------------
-- 3. A jornada passa a aceitar o próprio barbeiro
------------------------------------------------------------------------------
create or replace function public.salvar_jornada(p_professional_id uuid, p_dias jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_salon uuid;
  v_eu boolean;
  v_dia jsonb;
  v_num int;
  v_ativo boolean;
  v_inicio text;
  v_fim text;
  v_vistos int[] := '{}';
begin
  select p.salon_id, (p.user_id is not null and p.user_id = auth.uid())
    into v_salon, v_eu
    from public.professionals p
   where p.id = p_professional_id;

  -- Definer ignora RLS: a autorizacao e esta. Era so gestor; o onboarding pede
  -- que o proprio barbeiro confirme o expediente dele, e a 0182 ja lhe deu o
  -- poder de fechar a propria agenda. Nunca a jornada de outro.
  if v_salon is null
     or v_salon not in (select private.salon_ids())
     or not (private.is_manager(v_salon) or v_eu) then
    raise exception 'So o dono, o gerente ou o proprio barbeiro altera a jornada dele.'
      using errcode = '42501';
  end if;

  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) <> 7 then
    raise exception 'A jornada precisa dos 7 dias da semana.' using errcode = '22023';
  end if;

  -- Valida TUDO antes de apagar qualquer coisa: uma linha ruim nao pode deixar
  -- o barbeiro sem jornada.
  for v_dia in select value from jsonb_array_elements(p_dias) loop
    if jsonb_typeof(v_dia) <> 'object' or coalesce(v_dia->>'dia_semana', '') !~ '^[0-6]$' then
      raise exception 'Dia da semana invalido na jornada.' using errcode = '22023';
    end if;
    v_num := (v_dia->>'dia_semana')::int;
    if v_num = any(v_vistos) then
      raise exception 'Dia % repetido na jornada.', v_num using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_num;

    v_ativo := coalesce(v_dia->>'ativo', 'false') in ('true', 't', '1');
    v_inicio := v_dia->>'hora_inicio';
    v_fim := v_dia->>'hora_fim';
    if coalesce(v_inicio, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]'
       or coalesce(v_fim, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]' then
      raise exception 'Hora invalida no dia %: informe entrada e saida como HH:MM.', v_num using errcode = '22023';
    end if;
    if v_ativo and v_inicio::time >= v_fim::time then
      raise exception 'No dia %, a saida precisa ser depois da entrada.', v_num using errcode = '22023';
    end if;
  end loop;

  -- Apagar e gravar na mesma transacao: ou a jornada nova inteira, ou a antiga
  -- intacta.
  delete from public.professional_schedules where professional_id = p_professional_id;
  insert into public.professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
  select p_professional_id,
         (d->>'dia_semana')::int,
         (d->>'hora_inicio')::time,
         (d->>'hora_fim')::time,
         coalesce(d->>'ativo', 'false') in ('true', 't', '1')
    from jsonb_array_elements(p_dias) d;
end;
$function$;

revoke all on function public.salvar_jornada(uuid, jsonb) from public, anon;
grant execute on function public.salvar_jornada(uuid, jsonb) to authenticated, service_role;

comment on function public.salvar_jornada(uuid, jsonb) is
  'Grava os 7 dias da jornada de uma vez (valida, apaga e grava na mesma transacao): folga e `ativo = false`, nao ausencia de linha. Desde a 0200 a autorizacao e gestor da unidade OU o proprio barbeiro, para o onboarding dele -- antes era so gestor.';

notify pgrst, 'reload schema';
