import type { ReactNode } from 'react'

/**
 * Cabeçalho padrão de página: título forte + uma linha dizendo para que a
 * tela serve (referência CheckinOs: "Dashboard / Monitor your key...").
 * As telas caíam direto no conteúdo, sem dizer onde a pessoa estava.
 *
 * `acoes` fica à direita, na mesma linha — é só posição, os botões continuam
 * sendo os das próprias telas.
 *
 * **As ações quebram linha.** O `flex-wrap` da linha de fora só deixava o bloco
 * INTEIRO de ações descer; dentro dele os botões continuavam numa fila rígida.
 * No Financeiro, a fila é "Hoje · Este mês · Caixa · abre na 1ª venda ·
 * Exportar": media 551px num celular de 375, e a PÁGINA ganhava 176px de
 * rolagem lateral — o sintoma clássico de tela quebrada no telefone. Medido em
 * 07/10 numa moldura de 375px de verdade, porque o emulador do painel estava
 * entregando 550 e escondendo o defeito.
 */
export function PageHeader({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: ReactNode
  subtitulo?: string
  acoes?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{titulo}</h1>
        {subtitulo && <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}
