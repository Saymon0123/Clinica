import { MailWarning } from 'lucide-react'
import type { EntregasPresas } from './useEntregasPresas'

/**
 * A faixa que diz ao dono que um e-mail dele não saiu.
 *
 * O CASO: em 20/09 a caixa da plataforma parou de autenticar e ninguém soube
 * por **quatro dias**. Os robôs seguiram rodando e fechando como "sucesso", e
 * o alarme por e-mail seria circular. Esta faixa é o caminho que não depende
 * de canal nenhum — o dono abre o CRM e lê.
 *
 * A FRASE É DE CLIENTE, NÃO DE SERVIDOR. Quem abre o CRM é dono de barbearia:
 * "o SMTP caiu com 535" não diz nada e assusta. O que ele precisa saber é que
 * o convite que ele mandou não chegou, e o que fazer enquanto isso — no caso
 * do convite, existe saída imediata: copiar o link na tela de Equipe.
 *
 * NÃO TEM BOTÃO DE FECHAR, de propósito: o problema não é da pessoa e não
 * some por ela mandar sumir. A faixa desaparece sozinha quando a fila esvazia,
 * o que acontece em minutos assim que o envio volta.
 */
export function AvisoDeEntrega({ entregas }: { entregas: EntregasPresas | null }) {
  if (!entregas || entregas.presas < 1) return null

  const { convites, feedbacks } = entregas

  // O texto nomeia o que está preso, porque "e-mails" no genérico deixa o dono
  // sem saber se é com ele. Convite vem primeiro: é o único com ação possível.
  const oQue =
    convites > 0 && feedbacks > 0
      ? `${convites} convite${convites > 1 ? 's' : ''} de equipe e ${feedbacks} mensagem${feedbacks > 1 ? 's' : ''} para nós`
      : convites > 0
        ? `${convites} convite${convites > 1 ? 's de equipe' : ' de equipe'}`
        : `${feedbacks} mensagem${feedbacks > 1 ? 's' : ''} para nós`

  return (
    <div
      role="status"
      className="flex items-start gap-2 px-4 py-2.5 text-sm border-b bg-warning-soft border-warning/30 text-warning"
    >
      <MailWarning size={16} className="shrink-0 mt-0.5" />
      <span>
        <strong className="font-medium">Um e-mail não saiu.</strong> {oQue} continua na fila de
        envio. Já estamos vendo isso — e, se for convite, dá para{' '}
        <span className="font-medium">copiar o link em Equipe</span> e mandar por WhatsApp agora
        mesmo.
      </span>
    </div>
  )
}
