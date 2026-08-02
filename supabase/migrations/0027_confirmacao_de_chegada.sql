-- Segunda mensagem do ciclo de atendimento: confirmação de chegada, ~10 min
-- antes do horário.
--
-- É uma pergunta diferente da do lembrete de 1h. O lembrete avisa ("você tem
-- horário hoje às 15h"); a confirmação pergunta se a pessoa está a caminho, e
-- serve para o barbeiro saber que vai atrasar antes de a cadeira ficar vazia.
--
-- Precisa de marcador próprio: reaproveitar `lembrete_enviado` faria a segunda
-- mensagem nunca sair, já que o lembrete de 1h marca o campo bem antes. Mesmo
-- padrão e mesmo motivo — sem o marcador, o fluxo roda a cada 10 minutos e
-- reenviaria a mesma mensagem em toda rodada da janela.
alter table appointments
  add column if not exists confirmacao_enviada boolean not null default false;

comment on column appointments.confirmacao_enviada is
  'Confirmação de chegada (~10 min antes) já enviada. Marcada pelo fluxo n8n de lembretes, antes do envio.';
