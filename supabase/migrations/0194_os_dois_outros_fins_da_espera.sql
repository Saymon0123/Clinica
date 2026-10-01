-- Os dois outros fins da espera.
--
-- A 0193 entregou o template de **abriu a vaga**. Uma entrada na fila tem três
-- fins possíveis, e só um deles estava escrito:
--
-- 1. abriu uma vaga e foi oferecida → `fila_vaga_abriu` (0193)
-- 2. a vaga oferecida foi preenchida por outra pessoa → **aqui**
-- 3. o período pedido passou e nada abriu → **aqui**
--
-- Sem 2 e 3 a fila fica silenciosa nos dois caminhos em que ela falha, que são
-- justamente os que o cliente não tem como descobrir sozinho. Ele responde
-- "quero" uma hora depois e não entende por que não funcionou, ou espera a
-- semana inteira sem notícia. É o mesmo tipo de muro que a agenda pública nos
-- ensinou a não construir: o fluxo que dá certo nunca foi o problema.
--
-- ## Por que os dois são `utility` pela forma, não pela intenção
--
-- Ambos são **estado de um pedido específico que o cliente fez** — nenhum
-- convida, nenhum oferece, nenhum tem preço ou promoção. O 2 informa e mantém a
-- espera de pé; o 3 informa e a encerra.
--
-- Os botões são ação sobre ESTE pedido, nunca opt-out de divulgação: "Sair da
-- espera" e "Quero esperar de novo" dizem respeito à fila, não a receber
-- mensagens.
--
-- ## As regras de redação da casa, aplicadas
--
-- De `docs/templates-para-a-meta.md`: nome só com minúscula e underscore; nenhum
-- corpo começa ou termina com variável; não há duas variáveis coladas; no máximo
-- três botões. E a voz é a mesma dos aprovados — "Separamos", "Reservamos" —,
-- então aqui é "avisamos" e "Encerramos", não primeira pessoa do singular.
--
-- Nascem `rascunho` e `ativo = false`. Nada envia template que não esteja
-- `aprovado`; as views já filtram por isso.

insert into public.whatsapp_templates
  (chave, nome_meta, idioma, categoria, corpo, parametros, botoes, status, ativo)
values
  (
    'fila_vaga_perdida',
    'vaga_ja_preenchida',
    'pt_BR',
    'utility',
    'Oi, {{1}}! O horário de {{2}} às {{3}} na *{{4}}* que te avisamos já foi preenchido. Você continua na espera e avisamos no próximo que abrir.',
    jsonb_build_array('primeiro nome', 'dia', 'hora HH:MM', 'barbearia'),
    -- Um botão só, de propósito: a única decisão que cabe aqui é continuar
    -- esperando ou não. Oferecer "ver outros horários" seria transformar um
    -- aviso de estado em vitrine, e é assim que `utility` vira `marketing`.
    jsonb_build_array('Sair da espera'),
    'rascunho',
    false
  ),
  (
    'fila_espera_encerrada',
    'espera_encerrada',
    'pt_BR',
    'utility',
    'Oi, {{1}}! O período que você pediu para esperar na *{{2}}* passou e não abriu horário. Encerramos sua espera por aqui.',
    jsonb_build_array('primeiro nome', 'barbearia'),
    -- "Quero esperar de novo" é voltar para a MESMA fila, não um convite para
    -- comprar. Sem ele, o cliente que quer continuar esperando não tem caminho e
    -- a conversa morre num aviso de encerramento.
    jsonb_build_array('Quero esperar de novo'),
    'rascunho',
    false
  );
