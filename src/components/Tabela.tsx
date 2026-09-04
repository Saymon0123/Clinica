import type { KeyboardEvent, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

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

/**
 * A coluna que não pode sair da tela quando a tabela rola de lado.
 *
 * Medido em 04/09/2026: o Catálogo tem 566px de tabela dentro de 343px de
 * contêiner no celular. A rolagem está contida (a página não anda de lado, que
 * é o certo), mas a consequência é que "Editar" e "Desativar" nascem fora da
 * tela — e nada na tela sugere que aquela tabela rola. Para desativar um
 * serviço pelo celular o dono precisava descobrir sozinho.
 *
 * Grudar a última coluna resolve sem virar cartão: a informação continua
 * rolando, a ação fica. A sombra à esquerda é o que denuncia que há conteúdo
 * cortado embaixo dela.
 */
export const COLUNA_FIXA_A_DIREITA =
  'sticky right-0 bg-surface shadow-[-10px_0_10px_-10px_color-mix(in_srgb,var(--foreground)_35%,transparent)]'

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border-strong ${className ?? ''}`}
      {...props}
    />
  )
}

/**
 * `onClick` é opcional e não mexe em nenhum uso antigo: sem ele a linha
 * continua sendo um `<tr>` inerte. Com ele a linha vira alvo de verdade —
 * cursor, foco por teclado e Enter/Espaço — porque um `<button>` dentro de
 * `<td>` só deixaria clicável a célula, e a fileira inteira é o que o dedo
 * mira no celular.
 */
export function Linha({
  className,
  onClick,
  children,
}: {
  className?: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <tr
      className={`border-b border-border/60 last:border-b-0 hover:bg-surface-2/60 transition-colors ${
        onClick ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary' : ''
      } ${className ?? ''}`}
      {...(onClick
        ? {
            onClick,
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            },
          }
        : {})}
    >
      {children}
    </tr>
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  // py-3.5 (leva C): linha mais alta, no respiro da referência — e é a altura
  // que o avatar de 36px do <Pessoa> pede para não ficar espremido.
  return <td className={`px-4 py-3.5 ${className ?? ''}`} {...props} />
}
