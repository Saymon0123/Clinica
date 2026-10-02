-- A jornada também precisa de alguém que escolheu.
--
-- Segunda metade do onboarding do barbeiro. A 0200 deu à lista de serviços a
-- marca `servicos_confirmados_em`, porque "todos marcados" podia ser decisão ou
-- podia ser o padrão do convite. **A jornada tem exatamente o mesmo problema, e
-- eu tinha deixado passar.**
--
-- O `accept-invite` deriva a jornada do **horário de funcionamento da
-- barbearia**: o barbeiro novo nasce trabalhando todos os dias em que a loja
-- abre, de abertura a fechamento. Para uma barbearia que abre seis dias, isso é
-- quase sempre errado -- gente trabalha cinco, com horário próprio -- e nada na
-- tela distingue "ele confirmou que é assim" de "ninguém olhou".
--
-- Sem esta coluna, o cartão de primeira entrada do barbeiro mostraria a jornada
-- como **pronta** no primeiro segundo, porque as linhas existem. O item nasceria
-- riscado, e o barbeiro nunca olharia o expediente que o sistema inventou para
-- ele. É o mesmo defeito do "Ainda não salvo" do horário, só que um nível acima:
-- lá o problema era a tela parecer salva sem estar; aqui é a tela parecer
-- decidida sem ter sido.
--
-- ## Por que o stamp mora na RPC, e não num trigger
--
-- Um trigger em `professional_schedules` marcaria qualquer insert -- inclusive o
-- do `accept-invite`, que é precisamente o que NÃO pode contar como escolha.
-- Quem marca é a `salvar_jornada`, que só roda quando uma pessoa salvou.
--
-- E, como na 0200, quem salva pode ser o gestor **ou o próprio barbeiro**: os
-- dois casos são alguém decidindo.
--
-- O corpo da função vem reproduzido inteiro de novo (`create or replace`
-- substitui, não emenda). É a terceira vez que ele é copiado -- 0135, 0200 e
-- aqui --, e isso é um custo real: cada cópia é uma chance de perder a validação
-- dos 7 dias sem ninguém notar. O pgTAP `equipe_sem_sustos` é quem segura isso,
-- e continua passando.

alter table public.professionals
  add column if not exists jornada_confirmada_em timestamptz;

comment on column public.professionals.jornada_confirmada_em is
  'Quando alguem (o barbeiro na primeira entrada ou o gestor na aba Equipe) salvou a jornada dele de fato. NULL = ninguem olhou: as linhas existem porque o accept-invite derivou do horario de funcionamento da barbearia, o que para loja que abre 6 dias e quase sempre errado. Sem esta marca o cartao do barbeiro mostraria a jornada como pronta no primeiro segundo. Sem grant proprio: professionals tem privilegio de TABELA e a coluna herda -- conferido na 0200.';

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

  -- Definer ignora RLS: a autorizacao e esta. Gestor da unidade (ativa) ou o
  -- proprio barbeiro -- nunca a jornada de outro.
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

  -- A marca de que ALGUEM escolheu. Nao existe trigger para isto de proposito:
  -- trigger marcaria tambem o insert do accept-invite, que e justamente o que
  -- nao conta como escolha.
  update public.professionals
     set jornada_confirmada_em = now()
   where id = p_professional_id;
end;
$function$;

revoke all on function public.salvar_jornada(uuid, jsonb) from public, anon;
grant execute on function public.salvar_jornada(uuid, jsonb) to authenticated, service_role;

comment on function public.salvar_jornada(uuid, jsonb) is
  'Grava os 7 dias da jornada de uma vez (valida, apaga e grava na mesma transacao): folga e `ativo = false`, nao ausencia de linha. Autorizada para o gestor da unidade OU o proprio barbeiro (0200), para o onboarding dele. Marca jornada_confirmada_em (0201), que distingue jornada escolhida da jornada que o accept-invite derivou do horario da barbearia.';

notify pgrst, 'reload schema';
