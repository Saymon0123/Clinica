-- Sair de `reservado` limpa o prazo — e isso não é tarefa de quem chama.
--
-- O dono tentou cancelar a reserva de teste da fila pela tela e levou:
--
--     Essa operação não é permitida porque deixaria um dado inválido.
--
-- É o CHECK `appointments_reserva_com_prazo`, da 0192:
--
--     (status = 'reservado' AND reservada_ate IS NOT NULL)
--     OR (status <> 'reservado' AND reservada_ate IS NULL)
--
-- A tela faz `update appointments set status = 'cancelado'` e mais nada — e
-- **qualquer** saída de `reservado` sem limpar o prazo é recusada. Medido, não
-- deduzido: com só o status, 23514; com os dois campos juntos, passa.
--
-- ## Por que um gatilho, e não consertar a tela
--
-- Eu já sabia disso: está escrito na 0207, onde a `confirmar_vaga_da_fila`
-- muda os dois campos na mesma instrução *"porque o CHECK exige o par"*. Tratei
-- o caso da fila e deixei os outros.
--
-- E os outros são muitos. `reservado` pode virar `cancelado` (dois botões
-- diferentes), `faltou`, `agendado`, `confirmado` ou `atendido`, por quatro
-- portas: CRM, agenda pública, agente e as RPCs. Consertar caller por caller é
-- a forma de errar o próximo — **o próximo já existia e ninguém viu**, porque a
-- fila nunca tinha tido uma reserva viva numa tela de verdade até hoje.
--
-- Normalizar num gatilho põe a regra num lugar só, e ela passa a valer para
-- porta que ainda nem foi escrita. O CHECK continua: ele é a garantia, o
-- gatilho é quem a cumpre.
--
-- ## Por que só no `update`, e não no `insert`
--
-- A primeira versão pegava os dois, e **o pgTAP da 0192 reprovou** — com razão.
-- Ele já afirmava que *"agendamento comum NÃO aceita prazo de reserva"*: inserir
-- `agendado` com prazo é **recusado**. Normalizar no insert tornaria essa
-- garantia inalcançável, e eu teria afrouxado um teste que estava certo para
-- caber uma implementação que estava errada.
--
-- E as duas pontas são situações diferentes. Quem **insere** `agendado` com
-- prazo está confuso sobre o que está criando, e recusar é o sinal — normalizar
-- em silêncio esconde o defeito de quem chamou. Quem **atualiza** o status de
-- uma reserva que existe está fazendo a coisa certa (cancelar, concluir, marcar
-- falta), e o prazo ali já não significa nada: depois que a reserva vira
-- agendamento, cancelamento ou falta, ele não é histórico, é lixo que o CHECK
-- proíbe.
--
-- Recusar na entrada, normalizar na transição. O teste antigo definiu a metade
-- que eu teria quebrado.

create or replace function private.limpa_prazo_fora_da_reserva()
returns trigger
language plpgsql
as $function$
begin
  -- `is distinct from` e nao `<>`: status e NOT NULL hoje, mas `<>` com nulo
  -- daria nulo, o `if` nao entraria, e o CHECK recusaria a linha sem ninguem
  -- entender por que. A forma que nao depende disso custa o mesmo.
  if new.status is distinct from 'reservado' then
    new.reservada_ate := null;
  end if;
  return new;
end;
$function$;

revoke all on function private.limpa_prazo_fora_da_reserva() from public, anon, authenticated;

comment on function private.limpa_prazo_fora_da_reserva() is
  'Zera reservada_ate quando um UPDATE tira a linha de `reservado`. So no update: o pgTAP da 0192 ja garante que INSERIR com prazo sem ser reserva e RECUSADO, e normalizar no insert tornaria essa garantia inalcancavel -- recusar na entrada, normalizar na transicao. Existe porque o CHECK appointments_reserva_com_prazo exige o par, e exigir que CADA caller lembre disso e a forma de errar o proximo: a tela do dono fazia `set status = cancelado` e so, e cancelar uma vaga segurada era recusado com 23514. O CHECK e a garantia; este gatilho e quem a cumpre.';

drop trigger if exists trg_limpa_prazo_fora_da_reserva on public.appointments;

create trigger trg_limpa_prazo_fora_da_reserva
before update on public.appointments
for each row
execute function private.limpa_prazo_fora_da_reserva();
