import type { ReactNode } from 'react'

/**
 * Identidade de uma pessoa numa lista (leva C do refinamento).
 *
 * A referência mostra avatar + nome com o contato empilhado embaixo: a lista
 * parece de PESSOAS, não de registros. Nós não temos foto — e não vamos
 * inventar uma —, então o avatar é a inicial sobre o verde suave, o mesmo
 * tratamento que o cabeçalho da agenda já usa.
 *
 * `contato` some quando não há nada: linha vazia sob o nome pareceria falha.
 */
export function Pessoa({ nome, contato }: { nome: string; contato?: ReactNode }) {
  const inicial = nome.trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span
        aria-hidden
        className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-soft text-primary-soft-foreground text-xs font-semibold shrink-0"
      >
        {inicial}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground truncate">{nome}</span>
        {contato && (
          <span className="block text-xs text-muted-foreground truncate">{contato}</span>
        )}
      </span>
    </div>
  )
}

/**
 * Barra de progresso fina (leva C). Fila neutra + trilho no verde da marca,
 * como as barras de "Progress" da referência. Só apresentação de um número
 * que a tela já tem.
 */
export function BarraProgresso({
  porcentagem,
  rotulo,
}: {
  porcentagem: number
  /** Texto acessível do que a barra representa. */
  rotulo: string
}) {
  const pct = Math.max(0, Math.min(100, porcentagem))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={rotulo}
      className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
