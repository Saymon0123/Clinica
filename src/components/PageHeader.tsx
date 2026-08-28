import type { ReactNode } from 'react'

/**
 * Cabeçalho padrão de página: título forte + uma linha dizendo para que a
 * tela serve (referência CheckinOs: "Dashboard / Monitor your key...").
 * As telas caíam direto no conteúdo, sem dizer onde a pessoa estava.
 *
 * `acoes` fica à direita, na mesma linha — é só posição, os botões continuam
 * sendo os das próprias telas.
 */
export function PageHeader({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string
  subtitulo?: string
  acoes?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{titulo}</h1>
        {subtitulo && <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  )
}
