-- A reserva vencida não tinha quem a apagasse.
--
-- Achado em 03/10, conferindo o cron antes de inserir uma inscrição de teste:
-- **nada chama `expirar_reservas`.** Não há job no `cron.job` (são sete, nenhum
-- é este), nenhuma tela, nenhuma edge, nenhum fluxo do n8n — procurado nos
-- quatro lugares. As únicas menções no banco são a própria função e um
-- *comentário* dentro da `devolver_chamados_sem_resposta`.
--
-- E a história explica como isso passou: a `private.expirar_reservas` nasceu na
-- 0192, a 0197 criou a fachada `public.expirar_reservas` **justamente para o n8n
-- poder chamá-la**, e o chamador nunca foi construído. Cada peça assumiu que a
-- outra ligaria o fio.
--
-- ## O que isso quebra, e é a fila inteira
--
-- A `devolver_chamados_sem_resposta` diz, no próprio comentário:
--
--     `chamado` com appointment_id NULO = a varredura expirar_reservas apagou a
--     reserva, ou seja: foi chamado e nao respondeu no prazo.
--
-- Ela **depende** de a reserva ter sido apagada. Sem ninguém apagando:
--
-- 1. quem foi chamado e não respondeu fica `chamado` **para sempre** — nunca
--    volta para a fila, nunca é chamado de novo, nunca encerra;
-- 2. a reserva fica `reservado` **para sempre**, e a
--    `horarios_livres` **não olha `reservada_ate`** (conferido) — ou seja, o
--    horário fica bloqueado para todo mundo: agenda pública, agente e CRM;
-- 3. e se a pessoa responder "Sim" depois do prazo, a `confirmar_vaga_da_fila`
--    recusa com *"O prazo da reserva venceu"* — então ela perde a vaga, a vaga
--    continua bloqueada, e ela continua presa. Os três ao mesmo tempo.
--
-- O prazo de 30 minutos era **decorativo**: ninguém o fazia valer.
--
-- Nada disso mordeu ainda porque o remetente está desligado e não há reserva
-- viva nenhuma. Mordia no dia em que fosse ligado.
--
-- ## Por que aqui dentro, e não num job novo
--
-- `rodar_a_fila` já é o tique da fila, e já tem ordem declarada. Pôr a expiração
-- como **primeiro** passo fecha o ciclo num lugar só: quem agenda o remetente
-- agenda tudo. Um job separado seria uma segunda coisa para alguém lembrar de
-- ligar — e foi exatamente esquecer de ligar que criou este defeito.
--
-- A ordem é obrigatória: apagar a reserva vencida **antes** de devolver quem não
-- respondeu, porque é a ausência da reserva que a `devolver_chamados_sem_resposta`
-- usa como sinal.
--
-- ## O que NÃO muda, de propósito
--
-- A `horarios_livres` continua sem olhar `reservada_ate`. Ela é a régua que a
-- agenda pública, o agente e o CRM usam, e mexer nela para cobrir um atraso de
-- varredura seria tratar o sintoma no lugar mais caro do sistema. Com o tique
-- rodando a cada 10 minutos, uma reserva fica no máximo ~10 minutos vencida — e
-- a trava de sobreposição do banco continua sendo a palavra final.

create or replace function public.rodar_a_fila(
  p_limite integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expiradas int;
  v_vencidas int;
  v_devolvidas int;
  v_chamadas jsonb;
begin
  -- PRIMEIRO. A `devolver_chamados_sem_resposta` reconhece quem nao respondeu
  -- pela AUSENCIA da reserva (`chamado` com appointment_id nulo, pela FK
  -- `on delete set null`). Sem apagar antes, ela nao enxerga ninguem e a
  -- inscricao fica presa em `chamado` para sempre.
  v_expiradas := private.expirar_reservas();

  v_vencidas := private.encerrar_fila_vencida();
  v_devolvidas := private.devolver_chamados_sem_resposta();

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_chamadas
    from private.chamar_proximos_da_fila(p_limite) c;

  return jsonb_build_object(
    'reservas_expiradas', v_expiradas,
    'vencidas', v_vencidas,
    'devolvidas', v_devolvidas,
    'chamadas', v_chamadas);
end;
$function$;

revoke all on function public.rodar_a_fila(integer) from public, anon, authenticated;
grant execute on function public.rodar_a_fila(integer) to service_role;

comment on function public.rodar_a_fila(integer) is
  'O tique da fila, para o n8n. QUATRO passos, nesta ordem: apaga reserva vencida, encerra inscricao vencida, devolve quem foi chamado e nao respondeu, e chama os proximos. A ORDEM importa duas vezes -- apagar a reserva ANTES de devolver, porque e a ausencia dela que sinaliza "nao respondeu"; e devolver ANTES de chamar, porque a que chama so enxerga `esperando`. A expiracao entrou na 0211: ate ali NINGUEM chamava expirar_reservas (nem cron, nem edge, nem n8n), e o prazo de 30 minutos era decorativo -- quem nao respondia ficava preso em `chamado` para sempre, com o horario bloqueado para todo mundo. Fachada em public porque o PostgREST so alcanca public (0197).';

notify pgrst, 'reload schema';
