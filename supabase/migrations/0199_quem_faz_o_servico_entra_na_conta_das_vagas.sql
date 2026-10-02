-- Quem faz o serviço entra na conta das vagas.
--
-- ## O que eu encontrei medindo, antes de escrever isto
--
-- A tabela `professional_services` existe desde a 0001, está populada, e
-- **nada no sistema a lê**. Conferido um por um: `horarios_livres` não a
-- consulta (ela só conhece jornada e duração em minutos), `agendar_pelo_agente`
-- não, `remarcar_pelo_cliente` não, a agenda pública não, e no CRM a única
-- escrita é o `NewServiceModal` ligando o serviço novo. Nas migrations ela só
-- aparece em schema, RLS e um insert (0133).
--
-- Ou seja: o vínculo "este barbeiro faz este serviço" é **decorativo**. E o
-- `accept-invite` liga o barbeiro novo a TODOS os serviços ativos -- com um
-- comentário dizendo "o gestor ajusta depois na aba Equipe", onde **não existe
-- controle nenhum** para isso. Só o horário tem modal (`HorarioBarbeiroModal`).
--
-- O retrato de hoje na El Corte: os quatro barbeiros fazem os oito serviços,
-- incluindo "Luzes / platinado" (R$160) e "Hidratação capilar". Não porque
-- alguém decidiu: porque nada permite decidir outra coisa.
--
-- ## Por que a leitura entra ANTES do controle, e não depois
--
-- Esta migration faz a `horarios_livres_pelo_agente` (0198) respeitar o
-- vínculo. Hoje isso é **no-op**: todos fazem tudo, então a lista de vagas não
-- muda em nada -- e é exatamente por isso que é seguro entrar agora. Quando a
-- tela de onboarding do barbeiro existir e ele desmarcar "platinado", a régua
-- já estará de pé e o cliente para de ser oferecido a quem não faz.
--
-- O contrário -- tela primeiro, régua depois -- deixa o barbeiro respondendo
-- perguntas que não mudam nada, que é o jeito mais rápido de ele nunca mais
-- responder.
--
-- ## O que NÃO entra aqui, de propósito
--
-- A trava na ESCRITA (`agendar_pelo_agente`, ou um trigger em `appointments`
-- cobrindo as quatro portas) fica para depois da tela. Enforcar escrita antes
-- de existir controle para arrumar o dado é como se trava a agenda de alguém:
-- um barbeiro com a lista errada deixaria de poder ser agendado e o dono não
-- teria onde consertar.
--
-- ## A armadilha do zero, e por que "nenhum ligado" significa "faz todos"
--
-- Se um barbeiro não tem NENHUM serviço ligado, filtrar ao pé da letra o faz
-- **desaparecer da agenda inteira** -- e o dono vê menos horários sem nenhuma
-- explicação, que é o muro que a agenda pública nos ensinou a não construir.
-- Então "lista vazia" é lido como "faz todos": falha visível e recuperável em
-- vez de invisível. A tela, quando vier, exige ao menos um marcado, para que
-- "desmarquei tudo" nunca seja confundido com "faço tudo".
--
-- ## E a recusa fica distinguível
--
-- "Ninguém nesta barbearia faz esse serviço" é uma conversa diferente de "esse
-- dia não tem vaga": a primeira não melhora mudando o dia. Por isso ela volta
-- com `motivo` próprio e sem `proximo_dia_com_vaga` -- senão o agente ofereceria
-- segunda-feira para um serviço que ninguém faz nunca.

create or replace function public.horarios_livres_pelo_agente(
  p_salon_id uuid,
  p_data date,
  p_service_ids uuid[],
  p_professional_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_qtd int;
  v_minutos int;
  v_barbeiros jsonb;
  v_proximo date;
  v_horas text;
  v_dia date;
  v_quem uuid[];
begin
  if p_salon_id is null or p_data is null then
    raise exception 'Faltou salao ou data.' using errcode = '22023';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;

  -- Mesma validacao do agendar_pelo_agente: servico do salao, ativo, existente.
  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid and s.salon_id = p_salon_id and s.ativo;
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outro salao, inativo ou inexistente.'
      using errcode = '22023';
  end if;

  select sum(s.duracao_minutos) into v_minutos
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s on s.id = d.sid;
  if coalesce(v_minutos, 0) <= 0 then
    raise exception 'Servico sem duracao cadastrada.' using errcode = '22023';
  end if;

  if p_professional_id is not null
     and not exists (select 1 from public.professionals p
                      where p.id = p_professional_id
                        and p.salon_id = p_salon_id
                        and p.ativo) then
    raise exception 'Profissional nao e deste salao ou esta inativo.'
      using errcode = '42501';
  end if;

  if p_data < v_hoje then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse dia ja passou. Confirme com o cliente qual data ele quer.');
  end if;

  -- Quem faz TODOS os servicos pedidos. Lista vazia conta como "faz todos":
  -- ver a armadilha do zero no comentario do topo.
  select array_agg(p.id) into v_quem
    from public.professionals p
   where p.salon_id = p_salon_id
     and p.ativo
     and (p_professional_id is null or p.id = p_professional_id)
     and (
       not exists (select 1 from public.professional_services x
                    where x.professional_id = p.id)
       or not exists (
            select 1 from (select distinct sid from unnest(p_service_ids) as sid) d
             where not exists (select 1 from public.professional_services x
                                where x.professional_id = p.id
                                  and x.service_id = d.sid))
     );

  -- Recusa propria: mudar o dia nao resolve, entao nem oferecemos outro dia.
  if v_quem is null or array_length(v_quem, 1) = 0 then
    return jsonb_build_object('ok', false,
      'motivo', case when p_professional_id is null
                     then 'Nenhum barbeiro desta barbearia faz esse servico.'
                     else 'Esse barbeiro nao faz esse servico.' end);
  end if;

  select jsonb_agg(
           jsonb_build_object('professional_id', x.professional_id,
                              'nome', x.nome,
                              'horas', x.horas)
           order by x.primeira, x.nome)
    into v_barbeiros
    from (select h.professional_id,
                 h.profissional as nome,
                 string_agg(h.hora_local, ', ' order by h.inicio) as horas,
                 min(h.inicio) as primeira
            from public.horarios_livres(p_salon_id, p_data, v_minutos,
                                        p_professional_id) h
           where h.professional_id = any(v_quem)
           group by h.professional_id, h.profissional) x;

  if v_barbeiros is null then
    for v_dia in
      select g::date
        from generate_series((greatest(p_data, v_hoje) + 1)::timestamp,
                             (greatest(p_data, v_hoje) + 7)::timestamp,
                             interval '1 day') g
    loop
      -- `distinct`: a lista e de HORAS, nao de vagas. Sem ele o ensaio devolveu
      -- "09:00, 09:00, 09:00, 09:00, 09:10, 09:10" -- a mesma hora em quatro
      -- barbeiros. O nome do barbeiro nao entra: isto e so a dica de que o dia
      -- existe; para oferecer, o agente chama de novo com a data.
      select string_agg(y.hora_local, ', ' order by y.hora_local) into v_horas
        from (select distinct h.hora_local
                from public.horarios_livres(p_salon_id, v_dia, v_minutos,
                                            p_professional_id) h
               where h.professional_id = any(v_quem)
               order by h.hora_local
               limit 6) y;
      if v_horas is not null then
        v_proximo := v_dia;
        exit;
      end if;
    end loop;

    return jsonb_build_object('ok', false,
      'motivo', 'Nao ha horario livre nesse dia.',
      'proximo_dia_com_vaga',
        case when v_proximo is null then null
             else to_char(v_proximo, 'DD/MM') end,
      'proximo_data_iso', v_proximo,
      'horas_no_proximo_dia', coalesce(v_horas, ''));
  end if;

  return jsonb_build_object('ok', true,
    'dia', to_char(p_data, 'DD/MM'),
    'data_iso', p_data,
    'barbeiros', v_barbeiros);
end;
$function$;

-- O trinco, reposto a mao. `create or replace` preserva os grants, mas repetir
-- o estado atual e o ponto: se um replace futuro afrouxar, isto reaperta.
revoke all on function public.horarios_livres_pelo_agente(uuid, date, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.horarios_livres_pelo_agente(uuid, date, uuid[], uuid)
  to service_role;

comment on function public.horarios_livres_pelo_agente(uuid, date, uuid[], uuid) is
  'As vagas do dia para o agente do WhatsApp, em UMA chamada: recebe os SERVICOS (soma a duracao aqui, como o agendar_pelo_agente faz) e devolve as horas agrupadas por barbeiro, com o professional_id que o Criar Agendamento precisa. Desde a 0199 so entram os barbeiros que fazem TODOS os servicos pedidos (professional_services) -- e barbeiro sem nenhum servico ligado conta como "faz todos", senao ele desapareceria da agenda sem explicacao. "Ninguem faz esse servico" volta com motivo proprio e SEM proximo dia, porque mudar o dia nao resolve. Os nomes dos parametros sao o contrato REST: mudar um quebra o no do n8n em silencio.';
