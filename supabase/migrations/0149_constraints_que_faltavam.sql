-- 0149 — As constraints que o giro de 10/09 (achado M17) encontrou faltando.
--
-- POR QUE AGORA: constraint em tabela vazia e uma linha. Em tabela com dados e
-- validar o passado inteiro primeiro, e cada barbearia nova torna isso mais
-- caro. Conferido antes de escrever: ZERO linhas violam qualquer uma delas hoje,
-- entao todas entram VALIDAS -- este projeto nao tem nenhuma `not valid` e nao e
-- aqui que vai comecar.
--
-- Nenhuma delas e teorica. A primeira e a segunda, juntas, fecham um buraco que
-- atravessa as duas exclusion constraints de sobreposicao.

-- 1) Duracao e intervalo — o par que deixava passar agendamento de duracao ZERO.
--
-- `EXCLUDE USING gist` compara ranges. Um range VAZIO nao colide com nada: um
-- agendamento das 14h as 14h atravessaria a trava do barbeiro E a do cliente,
-- e ainda ocuparia a linha da agenda. Bastava um servico com duracao 0.
alter table public.services
  add constraint services_duracao_positiva check (duracao_minutos > 0);

alter table public.appointments
  add constraint appointments_fim_depois_do_inicio check (data_hora_fim > data_hora_inicio);

-- 2) Sinal — dinheiro e estoque nao andam para tras por acidente.
--
-- `valor >= 0` e nao `> 0` de proposito: o estorno NAO grava pagamento negativo
-- (conferido em `estornar_venda`, que marca a venda como cancelada e nao toca em
-- `payments`), mas venda de cortesia com valor zero e plausivel e eu nao vou
-- proibir um caminho que nao vi. O que se quer barrar aqui e o SINAL.
alter table public.payments
  add constraint payments_valor_nao_negativo check (valor >= 0);

alter table public.order_items
  add constraint order_items_quantidade_positiva check (quantidade > 0),
  add constraint order_items_preco_nao_negativo check (preco_unitario >= 0);

-- Direcao mora em `tipo` ('entrada'/'saida'); a quantidade e sempre positiva.
-- Quantidade negativa numa saida inverteria o estoque em silencio.
alter table public.stock_movements
  add constraint stock_movements_quantidade_positiva check (quantidade > 0);

-- A tabela que vira cobranca. Numero negativo aqui e dinheiro errado no PIX.
alter table public.faturas_de_uso
  add constraint faturas_de_uso_numeros_nao_negativos check (
    valor >= 0 and valor_gerado >= 0 and preco_unitario >= 0
    and agendamentos >= 0 and lembretes >= 0 and reativacoes >= 0 and barbeiros >= 0
  );

-- 3) Um convite VIVO por e-mail, por barbearia.
--
-- Indice PARCIAL, nao unique na coluna: convite ja usado (`usado_em` preenchido)
-- e historico, e quem saiu da equipe pode ser convidado de novo. Sem o `where`,
-- reconvidar o mesmo e-mail seria impossivel para sempre.
--
-- `lower(email)` porque o CRM ja normaliza no insert (`EquipePage`), mas o banco
-- nao pode depender disso -- e o pgTAP prova que `authenticated` insere direto.
--
-- Nao da para incluir "e nao vencido" no predicado: `now()` nao e IMMUTABLE e o
-- Postgres recusa em indice. A consequencia e conhecida: convite vencido e nao
-- usado bloqueia um novo. O CRM lista os pendentes e permite apagar, e a
-- mensagem de erro (traduzida junto com esta migration) diz exatamente isso.
create unique index if not exists salon_invites_pendente_unico
  on public.salon_invites (salon_id, lower(email))
  where usado_em is null;

comment on index public.salon_invites_pendente_unico is
  'Um convite em aberto por e-mail por barbearia. Convite ja aceito nao conta: quem saiu pode voltar.';
