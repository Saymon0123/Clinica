-- A fila do cliente, pronta para o contexto do agente.
--
-- O agente precisa de duas coisas sobre a fila: **saber** se aquele cliente já
-- está nela (para não inscrever duas vezes e para responder *"você está na fila
-- para sábado"*) e ter o `fila_id` em mão para tirá-lo quando ele pedir.
--
-- ## Por que uma view, e não a tabela direto
--
-- É o molde que a `agendamentos_do_cliente` já criou: a view entrega o texto
-- **pronto** -- serviços somados com ` + `, a faixa de dias em palavras, a
-- janela de hora legível -- e o nó do n8n fica um `getAll` com dois filtros.
--
-- E é o molde porque a alternativa custou caro antes: formatar no prompt
-- significa o modelo convertendo fuso, somando nomes e montando frase a partir
-- de ISO. A regra "NUNCA CONVERTA FUSO NEM CALCULE DURACAO" do prompt existe por
-- causa disso, e cada campo pronto aqui é uma chance menos de ele errar.
--
-- Também traz `de_pe`, pelo mesmo motivo que a view dos agendamentos: o nó do
-- Supabase não sabe filtrar `status in (...)`, e três condições `neq` numa tela
-- de fluxo é a definição de regra que ninguém vai reler.
--
-- ## O trinco, que nesta casa não é teórico
--
-- View nova **ganha o `select` de `anon`** pelo padrão do schema -- está escrito
-- no CLAUDE.md, e ainda assim me pegou hoje na 0203 (tabela, não view). Aqui o
-- `revoke` vem junto, e o `security_invoker=on` é redigitado porque `create` não
-- o herda.
--
-- A view cruza clientes de todas as barbearias por natureza; sem as duas coisas,
-- uma chamada anônima leria quem está na fila de qualquer uma.

drop view if exists public.fila_do_cliente;

create view public.fila_do_cliente
with (security_invoker = on)
as
select f.id,
       f.salon_id,
       f.client_id,
       f.status,
       f.chamadas,
       f.status in ('esperando', 'chamado') as de_pe,

       coalesce((select string_agg(s.nome, ' + ' order by fs.ordem)
                   from public.fila_de_espera_servicos fs
                   join public.services s on s.id = fs.service_id
                  where fs.fila_id = f.id), '') as servicos,

       -- A faixa em palavras de gente. Faixa de um dia nao vira "de 05/10 a
       -- 05/10", que e como um sistema fala.
       case when f.de = f.ate
            then 'dia ' || to_char(f.de, 'DD/MM')
            else 'de ' || to_char(f.de, 'DD/MM') || ' a ' || to_char(f.ate, 'DD/MM')
       end as quando,

       case when f.hora_de is null then null
            else 'entre ' || to_char(f.hora_de, 'HH24:MI')
                 || ' e ' || to_char(f.hora_ate, 'HH24:MI')
       end as janela,

       p.nome as barbeiro,

       -- A vaga segurada, quando existe: o agente precisa dizer a hora e o
       -- prazo, nao o id da reserva.
       case when a.id is null then null
            when (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
                 = (now() at time zone 'America/Sao_Paulo')::date then 'hoje'
            when (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
                 = (now() at time zone 'America/Sao_Paulo')::date + 1 then 'amanha'
            else 'dia ' || to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM')
       end as reserva_quando,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as reserva_hora,
       a.reservada_ate
  from public.fila_de_espera f
  left join public.professionals p on p.id = f.professional_id
  left join public.appointments a on a.id = f.appointment_id;

-- O trinco, reposto a mao: view nova GANHA o select de anon pelo padrao do
-- schema. Esta view cruza clientes de todas as barbearias.
revoke all on public.fila_do_cliente from anon, authenticated;
grant select on public.fila_do_cliente to service_role;

comment on view public.fila_do_cliente is
  'A fila de um cliente com o texto PRONTO para o contexto do agente: servicos somados, faixa de dias em palavras, janela de hora legivel, e a vaga segurada com hora e prazo. Mesmo molde da agendamentos_do_cliente, e pelo mesmo motivo: formatar no prompt faz o modelo converter fuso e montar frase a partir de ISO, que e justamente o que a regra "NUNCA CONVERTA FUSO" proibe. `de_pe` existe porque o no do Supabase nao filtra `status in (...)`.';

notify pgrst, 'reload schema';
