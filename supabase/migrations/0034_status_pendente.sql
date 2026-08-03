-- Faltava o estado "assinou, aguardando o pagamento".
--
-- Ele existe na realidade — entre criar a recorrência e o Pix cair — mas não
-- existia na constraint, e por isso o `status` ficava parado no valor anterior.
-- Quem tinha cancelado e assinou de novo continuava marcado como `cancelada`
-- com uma recorrência ativa: um estado que nenhuma tela consegue descrever sem
-- mentir. Ora a tela dizia "cancelada" (falso, ele acabou de assinar), ora
-- "ativa" com uma próxima cobrança que ainda dependia de um pagamento.
--
-- Foi tentador derivar isso de `temRecorrencia + status`, mas é justamente o
-- padrão que já deu errado três vezes nesta tela: duas fontes para a mesma
-- pergunta, e a interface escolhendo a errada. O estado é real, então tem nome.
--
-- `atrasada` não serve: quem acabou de assinar não está devendo. Quem sai de
-- `pendente` é o webhook, na confirmação.

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('trial', 'pendente', 'ativa', 'atrasada', 'cancelada'));

comment on column public.subscriptions.status is
  'trial = teste; pendente = assinou e aguarda o pagamento; ativa = pago; atrasada = fatura vencida; cancelada = sem recorrencia.';
