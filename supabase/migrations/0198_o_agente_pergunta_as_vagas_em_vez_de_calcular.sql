-- O agente pergunta as vagas, em vez de calcular.
--
-- ## O que ele faz hoje, e o que isso custa
--
-- Para oferecer horário, o agente faz três idas ao banco e termina a conta na
-- cabeça:
--
--   1. `Listar Profissionais Ativos`  — quem existe (e os ids)
--   2. `Jornada da Equipe no Dia`     — quem trabalha naquele dia e até que hora
--   3. `Verificar Disponibilidade`    — os agendamentos crus do dia
--
-- ...e então o MODELO procura os buracos entre um atendimento e outro. Duas
-- consequências, medidas na execução 44571:
--
-- - **Preço.** Cada ferramenta é uma volta ao modelo que reenvia o prompt
--   inteiro mais o contexto. O nó do modelo rodou 4x numa única mensagem de
--   cliente, ~50 mil tokens contra um teto de 30 mil por minuto. Uma mensagem
--   sozinha estoura o limite.
-- - **Verdade.** A conta feita por fora não conhece a folga entre
--   atendimentos, o bloqueio do barbeiro (0182), o fechamento da loja nem a
--   vaga `reservado` (0192). Ela acerta no caso fácil e oferece horário que a
--   trava do banco recusa no caso difícil.
--
-- ## Por que uma função nova, se `horarios_livres` já existe
--
-- A `horarios_livres` já responde isso inteiro — e devolve `professional_id`,
-- `profissional`, `inicio` e `hora_local`, que é "14:00 com o Rafael" pronto.
-- Falta uma coisa só para o agente poder chamá-la: ela pede DURAÇÃO EM MINUTOS,
-- e o agente conhece serviços, não minutos. O catálogo que ele recebe no
-- contexto tem nome e preço; duração não está lá de propósito, porque o prompt
-- proíbe falar de duração com o cliente.
--
-- Fazer o modelo somar "corte 30 + barba 20" é pedir exatamente a aritmética
-- que a casa não confia a ele (é a mesma razão da regra "NUNCA CONVERTA FUSO
-- NEM CALCULE DURAÇÃO" no prompt). Então a soma vem para cá.
--
-- O bloco de validação e a soma são **os mesmos** do `agendar_pelo_agente`
-- (0176), linha por linha: serviço do salão, ativo, existente, com duração
-- cadastrada. Isso não é duplicação por descuido — é a mesma pergunta feita
-- antes de oferecer e na hora de gravar, e se as duas discordarem o cliente
-- ouve um horário que a gravação recusa.
--
-- ## A forma da resposta é escolhida pelo preço
--
-- O resultado da ferramenta entra no contexto da volta seguinte do modelo. Uma
-- linha por vaga ficaria caro: a El Corte tem 72 vagas amanhã para um serviço
-- de 30 min, e 72 objetos JSON são ~3 mil tokens. Então a resposta vem agrupada
-- por barbeiro, com as horas numa string:
--
--     {"ok": true, "dia": "02/10", "data_iso": "2026-10-02",
--      "barbeiros": [{"professional_id": "...", "nome": "Rafael Nogueira",
--                     "horas": "10:30, 11:00, 11:30, ..."}]}
--
-- Mesma informação, um décimo do tamanho. E `professional_id` vem junto: é dele
-- que o `Criar Agendamento` tira o barbeiro, o que aposenta a ferramenta de
-- listar profissionais no caminho de marcar.
--
-- **`duracao_minutos` NÃO vai na resposta**, de propósito. O sistema calcula o
-- fim e o prompt proíbe dizer a duração ao cliente; informação que não é
-- necessária para a tarefa é informação que vaza na conversa.
--
-- ## Dia sem vaga devolve o próximo dia que tem
--
-- "Não tem nada quinta" obriga o cliente a chutar outro dia, e cada chute é
-- outra volta ao modelo. Quando o dia pedido não tem vaga, a função procura até
-- 7 dias à frente e devolve o primeiro que tem, com as 6 primeiras horas. Isso
-- é recusa de negócio, então volta como `{ok:false, motivo}` para virar
-- conversa -- a régua da casa. Id inexistente ou de outro salão é chamada
-- malfeita, e aí sim é exceção.
--
-- ## O que esta migration NÃO muda
--
-- Nada no CRM, nada na agenda pública, nada na Vercel. A `horarios_livres` fica
-- intocada -- esta função só a chama. O que muda de verdade mora no n8n (as
-- ferramentas do agente e o prompt), e é por isso que o `notify pgrst` no fim
-- não é detalhe: sem ele a função existe no banco e o PostgREST não a acha.

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
  v_tz constant text := 'America/Sao_Paulo';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_qtd int;
  v_minutos int;
  v_barbeiros jsonb;
  v_proximo date;
  v_horas text;
  v_dia date;
begin
  if p_salon_id is null or p_data is null then
    raise exception 'Faltou salao ou data.' using errcode = '22023';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;

  -- Mesma validação do agendar_pelo_agente: serviço do salão, ativo, existente.
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

  -- Dia que já passou é pergunta de conversa (o cliente disse "sexta" pensando
  -- na que vem), não chamada malfeita.
  if p_data < v_hoje then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse dia ja passou. Confirme com o cliente qual data ele quer.');
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
           group by h.professional_id, h.profissional) x;

  if v_barbeiros is null then
    -- Procura o primeiro dia com vaga, para o agente não devolver só "não tem".
    -- O passo é dia a dia porque a régua é por dia (jornada, fechamento, folga);
    -- 7 é o teto para a busca não virar uma varredura cara na conversa.
    for v_dia in
      select g::date
        from generate_series((greatest(p_data, v_hoje) + 1)::timestamp,
                             (greatest(p_data, v_hoje) + 7)::timestamp,
                             interval '1 day') g
    loop
      -- `distinct`: a lista é de HORAS, não de vagas. Sem ele o ensaio devolveu
      -- "09:00, 09:00, 09:00, 09:00, 09:10, 09:10" -- as seis primeiras vagas
      -- eram a mesma hora em quatro barbeiros, e o agente leria isso como lista
      -- para mostrar ao cliente. Aqui o nome do barbeiro não entra de propósito:
      -- isto é só a dica de que o dia existe; para oferecer, o agente chama de
      -- novo com a data.
      select string_agg(y.hora_local, ', ' order by y.hora_local) into v_horas
        from (select distinct h.hora_local
                from public.horarios_livres(p_salon_id, v_dia, v_minutos,
                                            p_professional_id) h
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

-- O trinco, reposto à mão: função nova nasce com execute para `public`. Quem
-- chama é o agente do n8n, com a chave de service_role -- e mais ninguém. O CRM
-- não precisa (a agenda dele lê a tabela), e a agenda pública chega por edge
-- function com o token do agendamento.
revoke all on function public.horarios_livres_pelo_agente(uuid, date, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.horarios_livres_pelo_agente(uuid, date, uuid[], uuid)
  to service_role;

comment on function public.horarios_livres_pelo_agente(uuid, date, uuid[], uuid) is
  'As vagas do dia para o agente do WhatsApp, em UMA chamada: recebe os SERVICOS (soma a duracao aqui, como o agendar_pelo_agente faz) e devolve as horas agrupadas por barbeiro, com o professional_id que o Criar Agendamento precisa. Substitui as tres ferramentas em que o modelo somava jornada + agendamentos crus e procurava os buracos -- conta que ignorava folga, bloqueio, fechamento e a vaga reservado. Dia sem vaga devolve o proximo dia que tem. Os nomes dos parametros sao o contrato REST: o PostgREST casa a funcao pelo CONJUNTO de nomes recebidos, e mudar um quebra o no do n8n em silencio.';

-- Sem isto a função existe no banco e continua invisível para o PostgREST até
-- ele recarregar o cache por conta própria.
notify pgrst, 'reload schema';
