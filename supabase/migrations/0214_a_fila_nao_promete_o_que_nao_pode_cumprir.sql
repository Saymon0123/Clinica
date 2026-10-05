-- A fila não promete o que não pode cumprir
--
-- ## O buraco, medido em 05/10
--
-- O agente de WhatsApp está **ativo** e tem três ferramentas da fila ligadas
-- (`Entrar na Fila`, `Sair da Fila`, `Confirmar Vaga da Fila`). O prompt dele
-- manda, com estas palavras:
--
--     Dia CHEIO nao e fim de conversa. Antes de encerrar, ofereca a fila:
--     "quer que eu te avise se abrir?"
--     [...] "Te aviso na hora que abrir" e verdade
--
-- **Essa última linha é falsa hoje.** Quem chama a fila é o `rodar_a_fila`, e
-- ele só roda pelo fluxo do n8n `CRM Salão - Fila de Espera (Aviso de Vaga)`,
-- que está **inativo** — e o template `fila_vaga_abriu` está `ativo = false`.
-- Ou seja: o cliente entra na fila e **ninguém nunca liga**.
--
-- Não aconteceu ainda porque a tabela está zerada. Mas estava a um dia cheio de
-- distância, e o próprio prompt reconhece o risco noutro trecho: *"prometer
-- aviso é prometer um telefone que nunca toca"*.
--
-- ## Por que a trava vem para o banco, e não só para o prompt
--
-- Editar o prompt resolve hoje e apodrece amanhã: a informação "a fila está
-- desligada" passaria a morar na cabeça de quem editou. Aqui ela vale para
-- **qualquer** caminho — agente, CRM, `curl` — e some sozinha no dia em que o
-- template for religado, sem cirurgia no n8n.
--
-- É o **mesmo gate** que o fluxo do n8n já faz antes de varrer, e a nota dele
-- explica por quê: sem template liberado, chamar alguém cria reserva de 30
-- minutos e marca `chamado` para quem nunca receberia aviso — e duas varreduras
-- depois a inscrição é encerrada em silêncio.
--
-- ## Recusa de negócio, não exceção
--
-- Volta como `{ok:false, motivo}`, como as outras recusas desta função, porque
-- é conversa: o agente lê o motivo e repassa com as palavras dele. Exceção fica
-- para chamada malfeita, que é o que o resto da função já faz.
--
-- ## O que esta trava NÃO cobre
--
-- Ela confere o **template**, não o fluxo do n8n. Se alguém ligar
-- `whatsapp_templates.ativo` e esquecer de ativar o workflow, a promessa volta a
-- ficar vazia. É o mesmo limite que o gate do n8n tem, e a nota do fluxo já
-- documenta a ordem das duas chaves:
--
--     1. update public.whatsapp_templates set ativo = true where chave = 'fila_vaga_abriu';
--     2. Ativar o workflow.
--
-- ## Por que não apagar a fila
--
-- O dono pediu para **adiar**, não para remover. Tabelas vazias, funções sem
-- chamador e migrations não custam nada paradas — e apagá-las jogaria fora seis
-- arquivos de pgTAP e quinze migrations de trabalho, para refazer depois.

create or replace function public.entrar_na_fila(
  p_salon_id uuid,
  p_client_id uuid,
  p_service_ids uuid[],
  p_de date,
  p_ate date,
  p_hora_de time without time zone default null,
  p_hora_ate time without time zone default null,
  p_professional_id uuid default null,
  p_origem text default 'crm'
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid; v_qtd int; v_ja uuid;
begin
  -- A PORTA, antes de qualquer validação: a fila só aceita gente quando o
  -- aviso de vaga pode de fato sair. `whatsapp_templates` é global (não tem
  -- `salon_id`), então este é o interruptor do produto inteiro — o mesmo que o
  -- fluxo do n8n consulta antes de varrer.
  if not exists (
    select 1 from public.whatsapp_templates t
     where t.chave = 'fila_vaga_abriu'
       and t.status = 'aprovado'
       and t.ativo
  ) then
    return jsonb_build_object('ok', false,
      'motivo', 'A fila de espera esta desligada por enquanto. Nao da para avisar quando abrir vaga.');
  end if;

  if p_salon_id is null or p_client_id is null or p_de is null or p_ate is null then
    raise exception 'Faltou barbearia, cliente ou a faixa de dias.' using errcode = '22023';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;
  if p_origem not in ('crm', 'agente') then
    raise exception 'Origem invalida.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c
                  where c.id = p_client_id and c.salon_id = p_salon_id) then
    raise exception 'Cliente nao e desta barbearia.' using errcode = '42501';
  end if;
  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s on s.id = d.sid and s.salon_id = p_salon_id and s.ativo;
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outra barbearia, inativo ou inexistente.' using errcode = '22023';
  end if;
  if p_professional_id is not null
     and not exists (select 1 from public.professionals p
                      where p.id = p_professional_id and p.salon_id = p_salon_id and p.ativo) then
    raise exception 'Profissional nao e desta barbearia ou esta inativo.' using errcode = '42501';
  end if;
  if p_ate < v_hoje then
    return jsonb_build_object('ok', false, 'motivo', 'Essa faixa de dias ja passou.');
  end if;
  if p_hora_de is not null and p_hora_ate is not null and p_hora_ate <= p_hora_de then
    return jsonb_build_object('ok', false, 'motivo', 'A hora final precisa ser depois da inicial.');
  end if;

  -- NOVO na 0205: inscricao que nunca poderia ser atendida se recusa na PORTA.
  -- "O Thiago, para platinado" quando o Thiago nao faz platinado ficaria
  -- esperando ate vencer, e a pessoa nunca saberia por que o telefone nao
  -- tocou. Lista vazia conta como "faz todos", pela regua da 0199.
  if p_professional_id is not null
     and exists (select 1 from public.professional_services x
                  where x.professional_id = p_professional_id)
     and exists (select 1 from (select distinct sid from unnest(p_service_ids) as sid) d
                  where not exists (select 1 from public.professional_services x
                                     where x.professional_id = p_professional_id
                                       and x.service_id = d.sid)) then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse barbeiro nao faz esse servico. Pode ser com outro?');
  end if;

  select f.id into v_ja from public.fila_de_espera f
   where f.salon_id = p_salon_id and f.client_id = p_client_id
     and f.status in ('esperando', 'chamado');
  if v_ja is not null then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse cliente ja esta na fila.', 'fila_id', v_ja);
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
