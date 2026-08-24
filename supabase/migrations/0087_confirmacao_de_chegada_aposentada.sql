-- A confirmacao de chegada de ~10 min antes deixa de existir.
--
-- Ela nasceu na 0027 como a segunda mensagem do ciclo, e fazia sentido enquanto
-- o lembrete era um aviso sem resposta. Com o lembrete de 1h30 virando pergunta
-- com botoes, ela passou a repetir o que ja foi perguntado.
--
-- E tinha um defeito que so ficou visivel na migracao para a API oficial: sendo
-- texto livre, ela so sai com a janela de 24h aberta -- ou seja, so chega a
-- quem ja tinha respondido. Justamente para quem ficou em silencio, que era o
-- unico caso em que ela servia para alguma coisa, ela sumia sem aviso.
--
-- A coluna nao e derrubada: `agendamento_local` a lista, e mexer na view para
-- remover um booleano parado nao ganha nada hoje. Fica marcada como morta para
-- que ninguem a leia como sinal vivo.

comment on column public.appointments.confirmacao_enviada is
  'MORTA desde 2026-08-21. Marcava a confirmacao de chegada de ~10 min antes, removida quando o lembrete de 1h30 ganhou botoes -- ele ja pergunta o mesmo, e a de 10 min dependia da janela de 24h estar aberta, ou seja, sumia em silencio justamente para quem nao tinha respondido. A coluna fica porque a view agendamento_local a lista; derrubar as duas nao ganha nada hoje.';
