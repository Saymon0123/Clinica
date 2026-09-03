import type { ReactNode } from 'react'

/**
 * Onde os avisos flutuantes vivem (achado 35 da revisão de 01/09).
 *
 * Um lugar só para os dois banners globais. Antes cada um era `fixed top-4
 * right-4` por conta própria: os dois caíam no mesmo canto, um sobre o outro,
 * e no celular cobriam o cabeçalho — justamente onde ficam o avatar, a troca
 * de barbearia e o sair. Aqui a pilha começa ABAIXO do cabeçalho no celular
 * (h-14 + folga), tem teto de altura (passa disso, rola) e não intercepta
 * toques no espaço vazio entre os cartões.
 */
export function PilhaDeAvisos({ children }: { children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Avisos"
      className="pointer-events-none fixed right-4 top-[4.5rem] md:top-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 max-h-[calc(100dvh-9.5rem)] md:max-h-[calc(100dvh-2rem)] overflow-y-auto [&>*]:pointer-events-auto"
    >
      {children}
    </div>
  )
}
