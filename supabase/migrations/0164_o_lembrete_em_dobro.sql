-- 0164: o lembrete em dobro — a quarta fila, que a 0163 deixou de fora.
--
-- A 0163 fechou a corrida das filas de avaliação e reativação e deixou o
-- lembrete explicitamente para depois, por ser o fluxo mais usado do produto.
-- É esta migration.
--
-- POR QUE AQUI A EXPOSIÇÃO É MAIOR, E NÃO MENOR. O fluxo "CRM Salão - Lembretes
-- de Agendamento" roda a cada 10 minutos e busca a janela de **85 a 100 minutos**
-- — 15 minutos de largura para um ciclo de 10. Isso é deliberado, e o comentário
-- no próprio n8n explica: com janela igual ao ciclo, qualquer atraso de segundos
-- no agendador faz um horário cair entre duas rodadas e **nunca** receber
-- lembrete. Trocaram o risco de perder pelo risco de repetir.
--
-- A consequência é que, por construção, metade dos agendamentos é vista por
-- DUAS rodadas. O que impede o envio dobrado é `lembrete_enviado` — mas ele é
-- lido numa rodada e escrito só depois do envio. Entre ler e marcar cabe a
-- segunda rodada inteira. Não é hipótese remota: é o caminho normal sempre que
-- uma rodada demora mais que o intervalo até a rodada seguinte, o que acontece
-- quando há muitos lembretes ou quando a API do WhatsApp responde devagar.
--
-- O CONSERTO é o mesmo da 0163, e de propósito: `UPDATE ... RETURNING` como
-- reivindicação atômica, com prazo. Quem chama recebe só as linhas que
-- conseguiu reservar; a segunda execução recebe vazio. O prazo de 5 minutos faz
-- a linha voltar sozinha se a execução morrer no meio — sem ele, um n8n que
-- reinicia no momento errado silenciaria o lembrete para sempre.
--
-- O QUE ESTA MIGRATION **NÃO** FAZ: mover lógica. As outras duas filas têm view
-- própria; aqui a RPC devolve `setof appointments` e os filtros continuam
-- exatamente os que a consulta do n8n e o nó `Classificar Envio` já aplicam.
-- Mexer no fluxo mais usado do produto é uma mudança por vez: esta fecha a
-- corrida e nada mais.

create or replace function public.reservar_lembretes(p_limite integer default 200)
returns setof public.appointments
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with alvo as (
    select a.id
      from public.appointments a
     where a.data_hora_inicio >= now() + interval '85 minutes'
       and a.data_hora_inicio <  now() + interval '100 minutes'
       and a.status not in ('cancelado', 'concluido', 'bloqueio')
       -- Bloqueio de agenda não tem cliente para avisar. Filtrado aqui e também
       -- no `Classificar Envio`: lá é onde o defeito do PostgREST obrigou a
       -- filtrar (o `client_id neq null` do nó manda a string "null" e derruba a
       -- execução com 22P02), e não custa nada os dois concordarem.
       and a.client_id is not null
       -- Reativação já recebeu o convite 2-26h antes, com os mesmos botões. Um
       -- segundo aviso seria mensagem dobrada pelo mesmo horário. (2026-09-08)
       and a.origem is distinct from 'reativacao'
       and not a.lembrete_enviado
       and (a.envio_reservado_ate is null or a.envio_reservado_ate < now())
     -- Ordem fixa: sem ela, "quem ficou de fora quando o limite cortou" muda a
     -- cada rodada, e um lembrete perdido vira impossível de reproduzir.
     order by a.data_hora_inicio
     limit greatest(p_limite, 1)
  )
  update public.appointments a
     set envio_reservado_ate = now() + interval '5 minutes'
   where a.id in (select alvo.id from alvo)
     -- Repetido de propósito: entre o `select` do `alvo` e este `update`, outra
     -- execução pode ter reservado. É esta linha que a perde, não a de cima.
     and (a.envio_reservado_ate is null or a.envio_reservado_ate < now())
  returning a.*;
$$;

comment on function public.reservar_lembretes(integer) is
  'Reserva e devolve os agendamentos que devem receber lembrete agora (janela de 85 a 100 minutos). Duas execucoes sobrepostas NAO recebem o mesmo agendamento: a reserva e um UPDATE ... RETURNING, atomico por definicao. O prazo de 5 minutos devolve a linha sozinha se a execucao morrer no meio. Limite alto (200) porque esta e a fila de maior volume do produto -- o que nao couber so seria visto na rodada seguinte, e a janela pode ja ter passado.';

-- O n8n fala como `service_role`. Ninguem logado no CRM tem o que fazer aqui, e
-- `anon` muito menos: a funcao e `security definer` e enxerga todas as
-- barbearias de uma vez.
revoke execute on function public.reservar_lembretes(integer) from public, anon, authenticated;
grant execute on function public.reservar_lembretes(integer) to service_role;
