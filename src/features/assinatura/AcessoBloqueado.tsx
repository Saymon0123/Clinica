import { Link } from 'react-router-dom'
import { Lock, MessageCircle } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import type { Assinatura } from './useAssinatura'

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * Tela que substitui o CRM quando o acesso vence.
 *
 * A decisão de produto (2026-08-02) foi: **o CRM bloqueia, o WhatsApp continua**
 * por alguns dias. Cortar o agente pararia o negócio do cliente e viraria
 * reclamação, não pagamento — a barbearia segue recebendo agendamento enquanto
 * o dono regulariza.
 *
 * Por isso esta tela diz, com todas as letras, que o atendimento não parou. Sem
 * isso o dono lê "bloqueado" e presume o pior: que os clientes dele estão sem
 * resposta agora.
 */
export function AcessoBloqueado({ assinatura }: { assinatura: Assinatura }) {
  const { isManager, salonName } = useSalon()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-6">
        <span className="flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-4">
          <Lock size={20} />
        </span>

        <h1 className="text-xl font-bold tracking-tight text-foreground">Acesso ao CRM suspenso</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {salonName ? `${salonName} — ` : ''}
          {assinatura.acessoAte
            ? `o acesso venceu em ${formatarData(assinatura.acessoAte)}.`
            : 'o acesso está vencido.'}
        </p>

        {/* A informação que evita o desespero. */}
        <div className="flex gap-2.5 mt-4 p-3 rounded-lg bg-surface-2 border border-border">
          <MessageCircle size={16} className="shrink-0 mt-0.5 text-success" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Seus clientes continuam sendo atendidos.</strong> O
            agente segue respondendo e marcando horário no WhatsApp
            {assinatura.atendimentoAte ? ` até ${formatarData(assinatura.atendimentoAte)}` : ''}.
          </p>
        </div>

        {isManager ? (
          <>
            <p className="text-sm text-muted-foreground mt-4">
              Regularize a assinatura para voltar a usar a agenda, o financeiro e as demais telas.
            </p>
            <Link
              to="/assinatura"
              className="btn-primary rounded-lg px-4 py-2 text-sm font-medium inline-flex mt-4"
            >
              Ver assinatura
            </Link>
          </>
        ) : (
          /* O barbeiro não tem como resolver: mandá-lo para a tela de
             pagamento seria beco sem saída. */
          <p className="text-sm text-muted-foreground mt-4">
            Avise o dono da barbearia para regularizar o acesso.
          </p>
        )}
      </div>
    </div>
  )
}
