-- Padroniza a abertura da familia de recuperacao por opt-in.
--
-- Todas passam a comecar com "Voce pediu para que te avisassemos". A frase nao
-- e enfeite: e ela que faz a mensagem ser UTILIDADE (~R$ 0,04) em vez de
-- MARKETING (~R$ 0,35), porque a Meta classifica pela existencia de uma acao
-- anterior do cliente -- e pedir para ser avisado e uma acao.
--
-- **A frase so pode ser usada quando o pedido existir.** Escrita para quem nao
-- pediu, ela passa na aprovacao (a Meta nao tem como saber), mas quem recebe
-- estranha e bloqueia; bloqueio derruba a nota do numero, a nota derruba o
-- limite de envio, e o que se perde primeiro sao os LEMBRETES -- que sao o que
-- de fato reduz falta. Economizar R$ 0,31 aqui custa a funcionalidade que
-- sustenta o preco por agendamento. Alem disso a mensagem vai assinada pela
-- BARBEARIA: quem paga a desconfianca e o cliente do cliente.
--
-- Por isso o botao no caixa ("quer que eu te avise daqui a X semanas?") deixa de
-- ser conveniencia e vira **pre-requisito** destes textos.
--
-- Os templates de `reativacao_*` NAO recebem a abertura: eles sao frios por
-- definicao, ninguem pediu nada, e continuam marketing assumido.

update public.whatsapp_templates set
  corpo = 'Oi, {{1}}! Voce pediu para que te avisassemos quando desse tempo de voltar na *{{2}}*. Ja faz {{3}}. Quer marcar?',
  atualizado_em = now()
 where chave = 'retorno_pedido';

update public.whatsapp_templates set
  corpo = 'Oi, {{1}}! Voce pediu para que te avisassemos quando fosse hora de repetir seu {{2}} na *{{3}}*. Deu o tempo. Quer marcar?',
  atualizado_em = now()
 where chave = 'retorno_pedido_servico';

update public.whatsapp_templates set
  corpo = 'Oi, {{1}}! Voce pediu para que te avisassemos quando desse tempo de voltar. O {{2}} tem horario livre essa semana na *{{3}}*. Quer marcar?',
  atualizado_em = now()
 where chave = 'retorno_pedido_barbeiro';

update public.whatsapp_templates set
  corpo = 'Oi, {{1}}! Voce pediu para que te avisassemos todo mes na *{{2}}*, e ja faz {{3}} desde a ultima vez. Quer marcar?',
  atualizado_em = now()
 where chave = 'retorno_recorrente';

update public.whatsapp_templates set
  corpo = 'Oi, {{1}}! Voce pediu para que te avisassemos quando desse o intervalo do seu {{2}}. Ja faz {{3}}. Quer marcar na *{{4}}*?',
  atualizado_em = now()
 where chave = 'retorno_intervalo';

-- Este segue um agendamento real que o cliente perdeu, e ja e utilidade por
-- merito proprio. Abrir com "voce pediu" seria falso -- ninguem pede para ser
-- avisado de uma falta -- e enfraqueceria o unico texto da familia que se
-- sustenta sem opt-in nenhum.
update public.whatsapp_templates set
  corpo = 'Oi, {{1}}! Voce tinha horario na *{{2}}* em {{3}} e acabou nao dando pra vir. Quer remarcar?',
  atualizado_em = now()
 where chave = 'retorno_faltou';
