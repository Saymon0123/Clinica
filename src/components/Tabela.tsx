import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

/**
 * A tabela única do CRM (leva 2 da modernização).
 *
 * Antes eram 5 tabelas HTML cruas com 3 dialetos de linha: cabeçalho sem
 * hierarquia (parecia só uma linha cinza a mais), hover em umas e não em
 * outras, densidades divergentes. Decisões fechadas:
 *
 * - Cabeçalho lê-se como cabeçalho: 11px, versalete, tracking.
 * - Linha tem hover — a tabela responde ao mouse.
 * - Densidade única: células px-4 py-3.
 * - O contêiner já traz card + overflow-x (rolagem própria no celular).
 */
export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border-strong ${className ?? ''}`}
      {...props}
    />
  )
}

export function Linha({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <tr className={`border-b border-border/60 last:border-b-0 hover:bg-surface-2/60 transition-colors ${className ?? ''}`}>
      {children}
    </tr>
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  // py-3.5 (leva C): linha mais alta, no respiro da referência — e é a altura
  // que o avatar de 36px do <Pessoa> pede para não ficar espremido.
  return <td className={`px-4 py-3.5 ${className ?? ''}`} {...props} />
}
