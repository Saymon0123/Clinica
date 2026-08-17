-- Check-in no balcao: o sistema passa a saber que o cliente entrou na porta.
--
-- Ate aqui o banco sabia o que foi **marcado**, nunca o que **aconteceu**. Sem
-- isso, `faltou` e palpite do barbeiro, adiantar quem espera e decisao de
-- cabeca, e a politica de atraso (passo 6 do balcao) nao tem em que se apoiar.
--
-- **Por que uma data e hora, e nao um status novo.** Tres motivos, e o primeiro
-- e o que decide:
--
-- 1. Nao quebra nada. `status` e lido em todo lugar -- em `horarios_livres`, na
--    trava de sobreposicao, no agente e no n8n, sempre como
--    `status not in ('cancelado','faltou')`. Um valor novo obrigaria a revisar
--    cada um desses pontos, e esquecer um seria silencioso.
-- 2. Sao coisas independentes. Um cliente pode estar `confirmado` **e** ter
--    chegado. Como status, um apagaria o outro.
-- 3. Guarda o *quando*. Chegou as 14:28 ou as 14:47? A politica de atraso vive
--    exatamente dessa diferenca.
--
-- **Nulo nao significa que faltou** -- significa que ninguem confirmou. A
-- distincao importa porque quem age sobre a ausencia do sinal e o passo 6.
--
-- Quem marca e o **barbeiro**, nao o cliente. Se fosse o cliente, o check-in
-- seria opcional na pratica e a ausencia passaria a significar duas coisas ao
-- mesmo tempo ("nao veio" e "veio mas nao avisou"), fazendo a politica de
-- atraso liberar o horario de quem esta sentado ali esperando.

alter table public.appointments
  add column if not exists chegou_em timestamptz;

comment on column public.appointments.chegou_em is
  'Quando o cliente foi marcado como presente na barbearia. Nulo = ninguem confirmou a chegada, o que NAO significa que faltou. Data e hora, e nao status, porque chegar e ortogonal a confirmar/concluir e porque a politica de atraso precisa do quanto atrasou.';

-- A faixa do balcao pergunta "quem chegou hoje e ainda nao foi atendido".
create index if not exists appointments_chegou_em_idx
  on public.appointments (salon_id, chegou_em)
  where chegou_em is not null;

-- Entra desligado para todo mundo, como o `agenda_publica`: as barbearias da v1
-- nao veem nada mudar.
insert into public.recursos (chave, nome, descricao, padrao)
values (
  'balcao',
  'Balcao',
  'Faixa de check-in na agenda: marcar quem chegou, ver quem esta esperando.',
  false
)
on conflict (chave) do nothing;
