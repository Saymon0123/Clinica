import { useEffect, useRef, useState } from 'react'
import { Palette } from 'lucide-react'

/**
 * O que cada cor da Agenda quer dizer.
 *
 * ## Por que existe
 *
 * A grade tinha três estados com a MESMA cor — agendado, confirmado e
 * bloqueio dividiam o estilo `default`, e `concluido` usava `success`, que
 * neste tema é irmão do verde da marca de propósito (está escrito no
 * `index.css`: *"o verde positivo agora é IRMÃO da marca"*). No tema escuro
 * `--success` e `--primary` são **o mesmo hex**, `#7cc5a0`: não eram parecidos,
 * eram idênticos.
 *
 * Cor que não se distingue não informa, e o barbeiro lia a agenda adivinhando.
 *
 * ## Por que um botão que abre, e não uma faixa fixa
 *
 * A altura da grade é disputada neste projeto — a janela já foi encolhida de
 * 6h–22h para o expediente porque *"mais de um terço da altura eram horas que
 * ela nunca usa"*. Uma faixa permanente devolveria parte desse problema para
 * uma informação que se lê nas primeiras vezes e depois se sabe de cor.
 *
 * Fica ao lado da navegação de data: no caminho dos olhos de quem está
 * escolhendo o dia, e some assim que deixa de ser necessária.
 *
 * ## As amostras são as classes REAIS dos blocos
 *
 * Copiadas do `BLOCK_STYLES` de propósito, não aproximadas à mão: legenda que
 * desenha a própria versão das cores vira mentira no dia em que alguém mudar
 * uma delas e esquecer da outra.
 */

/** O mesmo que o `BLOCK_STYLES` da grade pinta, na ordem em que o dia acontece. */
const CORES: { amostra: string; rotulo: string; dica: string }[] = [
  {
    amostra: 'bg-primary-soft/50 border-primary',
    rotulo: 'Agendado',
    dica: 'marcado, ainda sem confirmação',
  },
  {
    amostra: 'bg-primary-soft border-primary',
    rotulo: 'Confirmado',
    dica: 'o cliente respondeu que vem',
  },
  {
    amostra: 'bg-warning-soft border-warning border-dashed',
    rotulo: 'Reservado',
    dica: 'a fila segurou a vaga, e ela vence',
  },
  {
    amostra: 'bg-surface-2 border-success',
    rotulo: 'Concluído',
    dica: 'atendido — fica apagado de propósito',
  },
  {
    amostra: 'bg-surface-2 border-border-strong',
    rotulo: 'Cancelado',
    dica: 'caiu, e o horário voltou a ficar livre',
  },
  {
    amostra: 'bg-danger-soft border-danger',
    rotulo: 'Não veio',
    dica: 'faltou sem avisar',
  },
  {
    amostra: 'bloco-bloqueio border-border-strong',
    rotulo: 'Bloqueio',
    dica: 'agenda fechada — não é cliente',
  },
]

export function LegendaDaAgenda() {
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fechar por fora e por Escape, como o `ProfileMenu` — um popover que só
  // fecha no próprio botão prende quem abriu por engano.
  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false)
    }
    function aoApertarEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoApertarEsc)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoApertarEsc)
    }
  }, [aberto])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className="btn-chip inline-flex items-center gap-1.5"
      >
        <Palette size={14} aria-hidden="true" />
        Legenda
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="O que cada cor da agenda significa"
          // `right-0` no celular e `left-0` a partir do sm: o botão fica perto
          // da borda esquerda no desktop, e perto da direita quando a barra de
          // navegação espreme o cabeçalho.
          className="absolute z-20 mt-2 left-0 w-[17rem] rounded-xl border border-border bg-surface shadow-lg p-3 space-y-2"
        >
          <p className="text-xs font-medium text-foreground">O que cada cor quer dizer</p>
          <ul className="space-y-1.5">
            {CORES.map((c) => (
              <li key={c.rotulo} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 w-4 h-4 shrink-0 rounded border-l-2 ${c.amostra}`}
                />
                <span className="text-xs leading-tight">
                  <span className="text-foreground">{c.rotulo}</span>
                  <span className="text-muted-foreground"> — {c.dica}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
