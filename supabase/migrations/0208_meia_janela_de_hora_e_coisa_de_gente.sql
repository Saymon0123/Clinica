-- Meia janela de hora é coisa de gente.
--
-- A 0203 criou este CHECK:
--
--     constraint fila_janela_de_hora_em_par
--       check ((hora_de is null and hora_ate is null)
--              or (hora_de is not null and hora_ate is not null and hora_ate > hora_de))
--
-- com este comentário meu: *"ou a janela de horario inteira, ou nenhuma: so uma
-- das pontas e um filtro que ninguem sabe ler"*.
--
-- **Isso é falso, e a primeira frase de cliente de verdade derrubou.** No teste
-- do agente, alguém disse *"só consigo antes das 9"*. O agente leu certo, montou
-- `hora_de: null, hora_ate: '09:00'` -- que é a tradução exata da frase -- e o
-- banco recusou com 23514. "Antes das 9" e "depois das 18" não são filtros
-- ilegíveis: são as duas restrições que cliente mais diz.
--
-- O erro foi meu, e foi de desenho: a constraint guardava uma suposição minha
-- sobre como as pessoas falam, não uma regra do negócio.
--
-- ## O que torna isto seguro de afrouxar
--
-- A função que procura a vaga (`private.chamar_proximos_da_fila`, 0205) **já**
-- trata as duas pontas de forma independente:
--
--     and (v_f.hora_de is null or (h.inicio ...)::time >= v_f.hora_de)
--     and (v_f.hora_ate is null or ((h.inicio + duracao) ...)::time <= v_f.hora_ate)
--
-- Cada condição some sozinha quando a ponta dela é nula. Escrevi assim sem
-- perceber que a constraint proibia justamente o caso que o código já sabia
-- tratar -- o código estava certo e a trava estava errada.
--
-- Nulo passa a significar **ponta aberta**: sem `hora_de`, vale da abertura; sem
-- `hora_ate`, vale até o fechamento. A única regra que sobra é a que sempre fez
-- sentido: quando as DUAS existem, o fim vem depois do começo.
--
-- A view `fila_do_cliente` é recriada junto, porque a frase dela também assumia
-- a janela inteira ("entre X e Y") e diria "entre  e 09:00" numa meia janela.

alter table public.fila_de_espera
  drop constraint if exists fila_janela_de_hora_em_par;

alter table public.fila_de_espera
  add constraint fila_janela_de_hora_valida
  -- CHECK so recusa FALSE. Com uma das pontas nula, o `>` daria NULL e passaria
  -- -- que agora e exatamente o que queremos. A clausula explicita so existe
  -- para o caso de as duas estarem preenchidas.
  check (hora_de is null or hora_ate is null or hora_ate > hora_de);

comment on constraint fila_janela_de_hora_valida on public.fila_de_espera is
  'Quando as DUAS pontas existem, o fim vem depois do comeco. Ponta nula e ponta ABERTA: sem hora_de vale da abertura, sem hora_ate vale ate o fechamento. A versao anterior (0203) exigia as duas ou nenhuma, por uma suposicao minha de que meia janela era ilegivel -- e a primeira frase de cliente de verdade ("so consigo antes das 9") foi recusada com 23514.';

------------------------------------------------------------------------------
-- A view, com a frase que entende meia janela
------------------------------------------------------------------------------
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
       case when f.de = f.ate
            then 'dia ' || to_char(f.de, 'DD/MM')
            else 'de ' || to_char(f.de, 'DD/MM') || ' a ' || to_char(f.ate, 'DD/MM')
       end as quando,
       -- As quatro formas de janela, em palavras de gente.
       case when f.hora_de is null and f.hora_ate is null then null
            when f.hora_de is null then 'ate ' || to_char(f.hora_ate, 'HH24:MI')
            when f.hora_ate is null then 'a partir de ' || to_char(f.hora_de, 'HH24:MI')
            else 'entre ' || to_char(f.hora_de, 'HH24:MI')
                 || ' e ' || to_char(f.hora_ate, 'HH24:MI')
       end as janela,
       p.nome as barbeiro,
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

-- O trinco, reposto a mao: view recriada GANHA o select de anon pelo padrao do
-- schema, e `create` nao herda o security_invoker.
revoke all on public.fila_do_cliente from anon, authenticated;
grant select on public.fila_do_cliente to service_role;

comment on view public.fila_do_cliente is
  'A fila de um cliente com o texto PRONTO para o contexto do agente: servicos somados, faixa de dias em palavras, janela de hora legivel nas QUATRO formas (nenhuma, so ate, so a partir de, entre), e a vaga segurada com hora e prazo. Mesmo molde da agendamentos_do_cliente, e pelo mesmo motivo: formatar no prompt faz o modelo converter fuso e montar frase a partir de ISO. `de_pe` existe porque o no do Supabase nao filtra `status in (...)`.';

notify pgrst, 'reload schema';
