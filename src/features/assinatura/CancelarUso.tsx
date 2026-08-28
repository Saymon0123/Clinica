import { useState } from 'react'
import { invokeFunction } from '../../lib/invokeFunction'
import { ErroInline } from '../../components/ErroInline'

/**
 * O único botão do modelo por uso: cancelar.
 *
 * Não existe "assinar" — usar o sistema É a assinatura, e o boleto nasce do
 * fechamento mensal. Cancelar interrompe o uso e gera NA HORA a fatura parcial
 * (último fechamento → hoje), que segue por e-mail para o faturamento manual —
 * a regra de 2026-08-24: só se paga o que foi usado até o dia do cancelamento.
 */
export function CancelarUso({ salonId, onMudou }: { salonId: string; onMudou: () => void }) {
  const [confirmando, setConfirmando] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function cancelar() {
    setCarregando(true)
    setErro(null)
    const { error } = await invokeFunction(
      'asaas',
      { body: { acao: 'cancelar', salonId } },
      'Não foi possível cancelar agora. Tente novamente.',
    )
    setCarregando(false)
    if (error) {
      setErro(error)
      return
    }
    setConfirmando(false)
    onMudou()
  }

  if (confirmando) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-foreground">Cancelar o uso do sistema?</p>
        <p className="text-xs text-muted-foreground">
          O que foi usado até hoje é fechado agora e vem na última cobrança. O acesso e o
          atendimento no WhatsApp seguem até o fim do período já pago.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={cancelar}
            disabled={carregando}
            className="text-sm text-danger font-medium hover:underline disabled:opacity-50"
          >
            {carregando ? 'Cancelando...' : 'Sim, cancelar'}
          </button>
          <button
            onClick={() => setConfirmando(false)}
            disabled={carregando}
            className="text-sm text-muted-foreground hover:underline"
          >
            Voltar
          </button>
        </div>
        <ErroInline>{erro}</ErroInline>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="text-sm text-muted-foreground hover:text-danger hover:underline"
    >
      Cancelar o uso do sistema
    </button>
  )
}
