import { RefreshCw, WifiOff } from 'lucide-react'

/**
 * O terceiro estado das listas (achado 31 da revisão de 01/09).
 *
 * Toda lista tem três situações que NÃO podem se parecer: carregando, vazia e
 * com erro. As cinco telas tinham esqueleto para a primeira e "nenhum cliente"
 * para a segunda — e, na terceira, a consulta falhava, o array ficava vazio e a
 * tela dizia com toda a calma que não havia clientes, produtos ou faturamento.
 * Com a rede caída no celular, o dono lia "R$ 0,00" e "nenhuma reserva" e
 * achava que tinha perdido os dados.
 *
 * Este banner é o estado de erro, com o caminho de volta na mão: "tentar de
 * novo" chama o `reload` do hook. As telas gated os vazios e os totais por
 * `erro`, e mostram isto no lugar.
 */
export function ErroDeCarga({
  mensagem,
  aoTentarDeNovo,
  tentando = false,
}: {
  mensagem: string | null
  aoTentarDeNovo: () => void | Promise<void>
  tentando?: boolean
}) {
  if (!mensagem) return null
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3"
    >
      <WifiOff size={16} className="shrink-0 text-danger" />
      <p className="flex-1 min-w-[12rem] text-sm text-foreground">
        {mensagem}{' '}
        <span className="text-muted-foreground">Seus dados estão salvos — isto costuma ser conexão.</span>
      </p>
      <button
        type="button"
        onClick={() => void aoTentarDeNovo()}
        disabled={tentando}
        className="inline-flex items-center gap-1.5 btn-secondary rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        <RefreshCw size={14} className={tentando ? 'animate-spin' : ''} />
        {tentando ? 'Tentando...' : 'Tentar de novo'}
      </button>
    </div>
  )
}
