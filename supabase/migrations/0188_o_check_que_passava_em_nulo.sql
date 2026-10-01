-- O CHECK que passava em nulo.
--
-- A trava que a 0187 escreveu para amarrar `ciclo_comissao` a
-- `dia_fechamento_comissao` **deixava passar ciclo sem dia** — e também dia sem
-- ciclo. O ensaio pegou antes de a tela existir.
--
-- ## A causa, que vale ficar escrita
--
-- Lógica de três valores. Com `ciclo = 'semanal'` e `dia = null`:
--
--     (ciclo is null and dia is null)         -> false
--     (ciclo = 'mensal'  and dia between ...) -> false
--     (ciclo = 'semanal' and dia between ...) -> true and NULL  =  NULL
--     false or false or NULL                  =  NULL
--
-- E **CHECK só recusa em FALSE**: NULL deixa a linha entrar. Era preciso exigir
-- `is not null` nos dois campos de forma explícita, em vez de confiar que uma
-- comparação com nulo devolvesse falso.
--
-- De quebra, a regra nova também recusa ciclo inventado ('xpto'), que a
-- anterior aceitava pelo mesmo caminho.

alter table public.salons
  drop constraint salons_fechamento_comissao_valido;

alter table public.salons
  add constraint salons_fechamento_comissao_valido
  check (
    -- Não definido: os dois nulos juntos.
    (ciclo_comissao is null and dia_fechamento_comissao is null)
    -- Definido: os dois cheios, e o dia dentro da faixa do ciclo. O
    -- `is not null` explícito é o que impede o resultado NULL que a 0187
    -- deixava escapar.
    or (
      ciclo_comissao is not null
      and dia_fechamento_comissao is not null
      and (
        (ciclo_comissao = 'mensal'  and dia_fechamento_comissao between 1 and 31)
        -- 0 = domingo … 6 = sábado.
        or (ciclo_comissao = 'semanal' and dia_fechamento_comissao between 0 and 6)
      )
    )
  );
