-- Politica de atraso: a tolerancia vira ajuste do dono, e o banco publica a
-- lista de quem perguntar.
--
-- **Um numero so para os dois lados.** `atraso_tolerado_minutos` decide quando
-- o botao "Nao veio" aparece na faixa do balcao E quando o agente pergunta ao
-- cliente se ele esta a caminho. Sao a mesma pergunta feita de dois lados: dois
-- ajustes separados sairiam do ar um do outro e ninguem entenderia por que.
--
-- **O horario nunca e liberado sozinho.** Nenhum toque da faixa e obrigatorio
-- para o sistema estar certo, entao a ausencia de marcacao significa duas
-- coisas ao mesmo tempo -- "nao veio" e "veio mas o barbeiro nao marcou". Agir
-- sobre isso liberaria a cadeira de quem esta sentado ali esperando. O sistema
-- pergunta e avisa; quem decide e o barbeiro.
--
-- **Por que a lista e uma view.** Mesmo motivo de sempre neste projeto: a regra
-- mora no banco e e consultada por quem precisar. O n8n so pergunta "para quem
-- eu mando agora" e recebe a lista pronta, com gating de plano, WhatsApp
-- conectado e janela ja aplicados. Espalhar essas condicoes pelos nos do fluxo
-- e exatamente como elas ficam divergentes -- ja aconteceu com o fluxo de
-- lembretes, que marcava envio por instancia morta.

alter table public.salons
  add column if not exists atraso_tolerado_minutos integer not null default 10;

comment on column public.salons.atraso_tolerado_minutos is
  'Minutos de atraso antes de o sistema reagir: e quando o botao "Nao veio" aparece na faixa do balcao e quando o agente pergunta ao cliente se ele esta a caminho. Um numero so, porque sao a mesma pergunta feita de dois lados.';

alter table public.appointments
  add column if not exists atraso_perguntado_em timestamptz;

comment on column public.appointments.atraso_perguntado_em is
  'Quando o agente perguntou ao cliente atrasado se ele esta vindo. Marcado pelo fluxo n8n ANTES do envio: se o envio falhar o cliente perde uma pergunta, o que e muito menos grave que receber a mesma pergunta a cada dez minutos.';

create or replace view public.atrasos_para_perguntar
with (security_invoker = on) as
select
  a.id as appointment_id,
  a.salon_id,
  s.nome as barbearia,
  c.nome as cliente,
  c.telefone,
  wc.instance_name,
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_marcada,
  floor(extract(epoch from (now() - a.data_hora_inicio)) / 60)::int as minutos_de_atraso
from public.appointments a
join public.salons s on s.id = a.salon_id
join public.clients c on c.id = a.client_id
-- So barbearia paga e em dia: mensagem automatica e recurso de plano.
join public.salons_com_automacao sa on sa.id = a.salon_id
-- Sem WhatsApp aberto nao adianta marcar como perguntado; o fluxo de lembretes
-- ja aprendeu isso da pior forma, marcando envio por instancia morta.
join public.whatsapp_connections wc on wc.salon_id = a.salon_id and wc.status = 'open'
where a.status in ('agendado', 'confirmado')
  -- Chegou ou sentou: nao ha o que perguntar.
  and a.chegou_em is null
  and a.iniciado_em is null
  and a.atraso_perguntado_em is null
  and length(coalesce(c.telefone, '')) >= 10
  and now() >= a.data_hora_inicio + make_interval(mins => s.atraso_tolerado_minutos)
  -- Teto: passada uma hora do horario, perguntar so constrange. Quem nao veio
  -- nao vem mais, e o barbeiro ja resolveu na mao.
  and now() < a.data_hora_inicio + interval '1 hour';

comment on view public.atrasos_para_perguntar is
  'Clientes atrasados alem da tolerancia da barbearia que ainda nao foram perguntados. Consumida pelo fluxo n8n da politica de atraso, que marca atraso_perguntado_em antes de enviar.';
