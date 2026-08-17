-- Em atendimento: quem esta na cadeira agora, e desde quando.
--
-- O check-in (`0067`) sabia que o cliente chegou, mas nao distinguia "chegou e
-- esta esperando" de "chegou e ja esta sendo atendido". Para o barbeiro sozinho
-- quase nao importa; com dois ou tres na fila e a diferenca entre conseguir
-- dizer "faltam uns 15 minutos" e chutar.
--
-- **Nao guarda a duracao.** A previsao de termino sai de
-- `iniciado_em + (data_hora_fim - data_hora_inicio)`, e essa duracao ja foi
-- calculada pelo trigger `calcula_fim_do_agendamento` a partir do servico.
-- Repetir o numero aqui criaria duas fontes para a mesma verdade, e um dia elas
-- discordariam.
--
-- **Nulo nao pune ninguem.** Nenhum toque da faixa do balcao e obrigatorio para
-- o sistema estar certo: um barbeiro corrido pode ignorar a faixa inteira e a
-- agenda continua funcionando. E por isso que a politica de atraso, no passo
-- seguinte, so pode avisar -- nunca liberar horario por conta propria.

alter table public.appointments
  add column if not exists iniciado_em timestamptz;

comment on column public.appointments.iniciado_em is
  'Quando o atendimento comecou de fato. Junto com a duracao prevista (data_hora_fim - data_hora_inicio) da a previsao de termino, que e o que permite dizer a quem espera quanto falta. Nulo = chegou mas ainda nao sentou.';
