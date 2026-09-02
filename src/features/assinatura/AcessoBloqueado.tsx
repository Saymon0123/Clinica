import { Link } from 'react-router-dom'
import { LifeBuoy, Lock, LogOut, MessageCircle, MessageCircleOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
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
 *
 * E quando o prazo do WhatsApp TAMBÉM passou, ela diz isso (achado 20): a
 * frase "seus clientes continuam sendo atendidos" numa barbearia em que o
 * agente parou há uma semana é a mentira mais cara que a tela pode contar. A
 * data e o veredito vêm do banco, pela mesma régua que corta o atendimento.
 */
export function AcessoBloqueado({ assinatura }: { assinatura: Assinatura }) {
  const { isManager, salonName } = useSalon()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-sm p-5">
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

        {assinatura.atendendo ? (
          /* A informação que evita o desespero. */
          <div className="flex gap-2.5 mt-4 p-3 rounded-lg bg-surface-2 border border-border">
            <MessageCircle size={16} className="shrink-0 mt-0.5 text-success" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Seus clientes continuam sendo atendidos.</strong> O
              agente segue respondendo e marcando horário no WhatsApp
              {assinatura.atendimentoAte ? ` até ${formatarData(assinatura.atendimentoAte)}` : ''}.
            </p>
          </div>
        ) : (
          /* A informação que evita a ilusão. */
          <div className="flex gap-2.5 mt-4 p-3 rounded-lg bg-danger-soft border border-border">
            <MessageCircleOff size={16} className="shrink-0 mt-0.5 text-danger" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">O atendimento pelo WhatsApp também parou</strong>
              {assinatura.atendimentoAte ? ` em ${formatarData(assinatura.atendimentoAte)}` : ''}. Quem
              mandar mensagem para a barbearia não recebe resposta do agente até o acesso ser
              regularizado.
            </p>
          </div>
        )}

        {isManager ? (
          <>
            <p className="text-sm text-muted-foreground mt-4">
              Regularize a assinatura para voltar a usar a agenda, o financeiro e as demais telas.
            </p>
            <Link
              to="/assinatura"
              className="btn-primary rounded-full px-5 py-2 text-sm font-medium inline-flex mt-4"
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

        {/* Duas saídas que faltavam (achado 27). Sem "sair", quem tem outra
            conta — ou entrou na conta errada — ficava preso nesta tela; e sem
            a Ajuda, o barbeiro que "avisa o dono" não tinha por onde entender
            o que aconteceu. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5 pt-4 border-t border-border">
          <Link
            to="/ajuda"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LifeBuoy size={14} />
            Ajuda
          </Link>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut size={14} />
            Sair desta conta
          </button>
        </div>
      </div>
    </div>
  )
}
