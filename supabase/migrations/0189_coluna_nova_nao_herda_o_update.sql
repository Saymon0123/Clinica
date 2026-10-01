-- Coluna nova em `salons` não herda o UPDATE.
--
-- Depois da 0186/0187, o dono abriu Configurações, mudou o horário de
-- funcionamento e levou **"Você não tem permissão para fazer isso."** — logado
-- como dono da própria barbearia.
--
-- ## A causa
--
-- `salons` não tem UPDATE de tabela para `authenticated`: tem **grant por
-- coluna**, uma lista branca de dez. É proteção deliberada e boa — ela impede o
-- dono de mexer em `ativo`, `cobravel`, `organization_id` e
-- `remetente_phone_number_id`, que são do operador do sistema e não dele.
--
-- O que ninguém lembra é que **`alter table add column` NÃO estende o grant por
-- coluna**. `SELECT`, `INSERT` e `REFERENCES` são da tabela inteira ali e se
-- estendem sozinhos; só o `UPDATE` do `authenticated` é por coluna, e as duas
-- novas nasceram fora da lista.
--
-- ## Por que derrubou a tela inteira, e não só o campo novo
--
-- A tela manda **um `update` só** com todos os campos. Basta uma coluna sem
-- privilégio para o Postgres recusar a instrução inteira: mexer no horário de
-- sábado falhava por causa de um campo de comissão que o dono nem tinha tocado.
-- Por isso o erro parecia não ter relação nenhuma com o que ele estava fazendo.
--
-- Reproduzido com a identidade real do dono antes de corrigir (42501), e
-- conferido depois que a lista branca continua branca: `ativo` segue recusado.

grant update (ciclo_comissao, dia_fechamento_comissao)
  on public.salons
  to authenticated;
