-- O que o sistema custou, do que entrou.
--
-- O medidor já mostrava dois números lado a lado: o custo do mês e o "gerado
-- pra você" (o valor dos serviços que o agente agendou). Faltava a conta que
-- ninguém faz de cabeça e que é a única pergunta que o dono realmente tem:
-- **isto é caro?**
--
-- `faturamento` é a receita REAL da barbearia no mesmo período — a mesma base
-- do cartão "Faturamento" do Financeiro e do ticket médio da 0184:
-- `sum(payments.valor)` das comandas `fechada` cujo `closed_at` cai na janela.
-- Usar outra base faria a mesma barbearia ver dois faturamentos diferentes em
-- duas telas, que é pior do que não mostrar nenhum.
--
-- ## Por que no banco, e não uma segunda consulta na tela
--
-- O percentual só é honesto se as duas pontas vierem da MESMA janela. A janela
-- aqui é `date_trunc('month')` no relógio de São Paulo, cortada em hoje. Se o
-- CRM somasse `payments` por conta própria, ele refaria essa data em
-- JavaScript — e `new Date('YYYY-MM-DD')` é UTC, que no Brasil volta um dia.
-- Na virada do mês o numerador e o denominador falariam de meses diferentes, e
-- o percentual estaria errado sem nada na tela acusar.
--
-- ## Drop + create, não replace
--
-- A regra da casa, e aqui ela tem dente: a 0160 adicionou `cobravel` com
-- `create or replace`, então o `security_invoker` desta view depende de ter
-- sido redigitado em cada passagem. Recriando por inteiro, ele está escrito
-- aqui, à vista, em vez de herdado por sorte.
--
-- ## O que cada leitor vê nesta coluna
--
-- `security_invoker = on`: a RLS é a de quem lê. `orders` libera a comanda do
-- salão para gestor e só a PRÓPRIA comanda para barbeiro, e `payments` segue a
-- comanda. Então `faturamento` é o do salão para o dono e o do próprio
-- barbeiro para o barbeiro — nunca o total do salão para quem não pode vê-lo.
-- A tela só mostra o medidor a gestor (`isManager`), mas a garantia é a RLS,
-- não a tela.

drop view public.uso_do_sistema_no_mes;

create view public.uso_do_sistema_no_mes
with (security_invoker = on) as
 with periodo as (
   select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as inicio,
          (now() at time zone 'America/Sao_Paulo')::date as fim
 )
 select s.id as salon_id,
        s.nome as barbearia,
        p.inicio as periodo_inicio,
        p.fim as periodo_fim,
        (select count(*) from public.professionals pr
          where pr.salon_id = s.id and pr.ativo) as barbeiros,
        public.preco_por_uso((select count(*)::integer from public.professionals pr
          where pr.salon_id = s.id and pr.ativo)) as preco_unitario,
        (select count(*) from public.agendamentos_cobraveis c
          where c.salon_id = s.id and c.dia_de_criacao >= p.inicio) as agendamentos,
        (select coalesce(sum(c.valor_servico), 0) from public.agendamentos_cobraveis c
          where c.salon_id = s.id and c.dia_de_criacao >= p.inicio) as valor_gerado,
        (select count(*) from public.appointments a
          where a.salon_id = s.id and a.lembrete_enviado
            and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date >= p.inicio
            and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date <= p.fim) as lembretes,
        (select count(*) from public.reativacao_envios r
          where r.salon_id = s.id
            and (r.criado_em at time zone 'America/Sao_Paulo')::date >= p.inicio) as reativacoes,
        s.cobravel,
        -- A receita real do mesmo período. `join` e não `left join`: comanda
        -- sem pagamento não soma nada, e a linha a mais só pesaria.
        (select coalesce(sum(pg.valor), 0)
           from public.orders o
           join public.payments pg on pg.order_id = o.id
          where o.salon_id = s.id
            and o.status = 'fechada'
            and o.closed_at is not null
            and (o.closed_at at time zone 'America/Sao_Paulo')::date >= p.inicio
            and (o.closed_at at time zone 'America/Sao_Paulo')::date <= p.fim) as faturamento
   from public.salons s
   cross join periodo p;

-- O trinco, reposto à mão. O ensaio pegou: a view nova nasce com `select`
-- para `anon` pelo padrão do schema, e a que estava no ar NÃO o tinha. É
-- inerte (como `anon`, `private.salon_ids()` volta vazio e a RLS não devolve
-- linha), mas o estado mudaria calado — e trinco que some calado é o começo
-- de todo vazamento. O ensaio compara os grants antes e depois, um a um.
revoke all on public.uso_do_sistema_no_mes from anon;

comment on view public.uso_do_sistema_no_mes is
  'Uso do mes corrente por barbearia, ao vivo. `cobravel` falso quer dizer que nada disso vira fatura (0160) -- a tela precisa dizer isso em vez de prometer cobranca. `faturamento` e a receita real do MESMO periodo (sum(payments) das comandas fechadas), para a tela poder dizer quanto o sistema custou do que entrou; por ser security_invoker, ele e o do salao para gestor e o do proprio barbeiro para barbeiro.';
