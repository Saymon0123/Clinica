-- 0151 — A corrida do `cobrar-uso` deixa de ser sinalizada e passa a ser impedida.
--
-- Pre-requisito de producao, por decisao do dono em 10/09.
--
-- O que existe hoje (0145): entre LISTAR as faturas livres e GRAVAR o id do PIX
-- ha uma chamada de rede ao AbacatePay. Duas execucoes sobrepostas leem as
-- mesmas faturas, ambas criam um PIX REAL, e o `.is('abacate_pix_id', null)` no
-- update final garante que so uma vence. Quem perde grava zero linhas e vira
-- alerta no Sentry.
--
-- Isso impede a perda SILENCIOSA, e nao impede a cobranca dupla: os dois PIX ja
-- existem do outro lado quando a corrida e detectada. Se o dono receber o QR
-- perdedor por qualquer via, paga uma cobranca que o webhook nao sabe rotear.
--
-- A correcao inverte a ordem: RESERVAR a fatura primeiro, gastar depois. Quem
-- nao consegue reservar nem chega a chamar o AbacatePay -- entao o segundo PIX
-- nunca nasce.
--
-- Por que uma coluna e nao um lock: `pg_try_advisory_xact_lock` morre no fim da
-- transacao, e cada chamada do PostgREST e a sua propria. A reserva precisa
-- sobreviver a chamada de rede que acontece entre uma consulta e outra.
alter table public.faturas_de_uso
  add column if not exists cobranca_reservada_em timestamptz;

comment on column public.faturas_de_uso.cobranca_reservada_em is
  'Marca que uma execucao do cobrar-uso esta gerando o PIX desta fatura agora. Reivindicada ANTES de chamar o AbacatePay e limpa ao gravar o id (ou ao falhar). Reserva orfa com mais de 10 minutos e reciclada -- ver o cabecalho da funcao.';

-- Sem indice dedicado de proposito: `faturas_de_uso` tem dezenas de linhas por
-- barbearia por ANO, e a consulta que le esta coluna ja filtra por
-- `abacate_pix_id is null`. Indice aqui seria cerimonia, nao ganho.
