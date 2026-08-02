import { Link } from 'react-router-dom'
import { AlertTriangle, Clock } from 'lucide-react'
import type { Assinatura } from './useAssinatura'

/** A partir de quantos dias restantes o aviso começa a aparecer. */
const JANELA_DE_AVISO = 3

/**
 * Faixa de aviso sobre o fim do teste.
 *
 * Aparece **antes** de vencer, não depois: descobrir que o acesso acabou é a
 * pior hora de saber. Some sozinha quando não há prazo (barbearia que já paga)
 * ou quando ainda falta muito, para não virar ruído permanente.
 *
 * Decisão de produto registrada em 2026-08-02: vencer **não** derruba o
 * atendimento no WhatsApp. Cortar o agente pararia o negócio do cliente e
 * viraria reclamação, não pagamento — o aviso é dentro do CRM, para o dono.
 */
export function AvisoAssinatura({ assinatura }: { assinatura: Assinatura | null }) {
  if (!assinatura) return null
  const { status, diasRestantes, expirada } = assinatura

  if (status === 'ativa' && !expirada) return null
  if (diasRestantes === null) return null
  if (!expirada && diasRestantes > JANELA_DE_AVISO) return null

  const grave = expirada || diasRestantes <= 1

  // O texto muda com o estado: dizer "seu teste termina" para quem cancelou uma
  // assinatura paga soa como erro do sistema, e faz o dono desconfiar do resto.
  const oQueTermina = status === 'cancelada' ? 'Seu acesso' : 'Seu teste'

  const texto = expirada
    ? `${status === 'cancelada' ? 'Sua assinatura terminou' : 'Seu período de teste terminou'}. O atendimento pelo WhatsApp continua funcionando, mas o acesso ao CRM precisa ser regularizado.`
    : diasRestantes === 0
      ? `${oQueTermina} termina hoje.`
      : diasRestantes === 1
        ? `${oQueTermina} termina amanhã.`
        : `${oQueTermina} termina em ${diasRestantes} dias.`

  return (
    <div
      role="status"
      className={`flex items-start gap-2 px-4 py-2.5 text-sm border-b ${
        grave
          ? 'bg-danger-soft border-danger/30 text-danger'
          : 'bg-primary-soft border-border text-primary-soft-foreground'
      }`}
    >
      {grave ? (
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      ) : (
        <Clock size={16} className="shrink-0 mt-0.5" />
      )}
      <span>
        {texto}{' '}
        <Link to="/assinatura" className="underline font-medium">
          Ver assinatura
        </Link>
      </span>
    </div>
  )
}
