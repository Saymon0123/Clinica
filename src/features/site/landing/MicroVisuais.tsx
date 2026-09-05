/**
 * Peças pequenas que substituem frase por imagem.
 *
 * A varredura de 05/09 achou 1.949 palavras e uma imagem só na página
 * inteira — e o público é barbeiro, que não senta para ler landing. Estas
 * peças existem para tirar palavra da tela sem tirar informação: cada uma
 * MOSTRA o que a frase ao lado descrevia.
 *
 * **Nenhuma é foto, nenhuma é ilustração comprada.** São os mesmos elementos
 * do resto da página — cartão, chip, etiqueta mono, o verde do acento — em
 * escala pequena. O `ProdutoDemo` já faz isso em tamanho grande; aqui é a
 * versão de bolso, para caber dentro de um card.
 *
 * Todas são decorativas: o texto do card ao lado já diz o que precisa ser
 * dito, então elas levam `aria-hidden` e não entram na leitura de tela. Uma
 * peça decorativa anunciada como "imagem sem descrição" atrapalha mais do
 * que ajuda.
 */

/** Fundo e borda que todas usam. Mantém as três iguais entre si. */
const MOLDURA =
  'rounded-[12px] border border-[var(--l-line)] bg-[var(--l-bg)] p-3.5 overflow-hidden'

/** A conversa: uma pergunta de cliente e a resposta do agente. */
export function BalaoMini() {
  return (
    <div className={MOLDURA} aria-hidden="true">
      <div className="flex flex-col gap-2">
        <span className="max-w-[80%] self-start rounded-[10px] rounded-bl-[3px] bg-[var(--l-bg-lift)] px-3 py-2 text-[11.5px] leading-snug text-[var(--l-fg-mute)]">
          Quanto tá a barba?
        </span>
        <span className="max-w-[85%] self-end rounded-[10px] rounded-br-[3px] bg-[var(--l-accent-pale)] px-3 py-2 text-[11.5px] leading-snug text-[var(--l-fg)]">
          R$ 35. Tenho amanhã 9h ou 14h30 — qual fica melhor?
        </span>
      </div>
    </div>
  )
}

/** O lembrete: a pergunta de confirmação com as duas respostas possíveis. */
export function LembreteMini() {
  return (
    <div className={MOLDURA} aria-hidden="true">
      <div className="landing-label text-[var(--l-fg-faint)]">1h antes</div>
      <p className="mt-2 text-[11.5px] leading-snug text-[var(--l-fg-mute)]">
        Confirma seu horário das 15h?
      </p>
      <div className="mt-2.5 flex gap-1.5">
        <span className="rounded-full bg-[var(--l-ok-pale)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--l-ok)]">
          Confirmo
        </span>
        <span className="rounded-full bg-[rgba(243,241,234,0.07)] px-2.5 py-1 text-[10.5px] text-[var(--l-fg-faint)]">
          Não vou poder
        </span>
      </div>
    </div>
  )
}

/** O caixa: duas comissões e o total do dia. */
export function CaixaMini() {
  return (
    <div className={MOLDURA} aria-hidden="true">
      <div className="flex flex-col gap-1.5 text-[11.5px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[var(--l-fg-mute)]">Rafael · 48%</span>
          <span className="landing-num text-[var(--l-fg-mute)]">R$ 1.310</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[var(--l-fg-mute)]">Deivid · 45%</span>
          <span className="landing-num text-[var(--l-fg-mute)]">R$ 980</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[var(--l-line)] pt-2">
          <span className="landing-label text-[var(--l-fg-faint)]">Caixa do dia</span>
          <span className="landing-num text-[13px] text-[var(--l-accent-ink)]">R$ 2.290</span>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Os três passos de "como começa"                                            */
/* -------------------------------------------------------------------------- */

const PASSO = 'rounded-[10px] border border-[var(--l-line)] bg-[var(--l-bg)] p-3'

/** Passo 1: o campo de e-mail do cadastro. */
export function CampoMini() {
  return (
    <div className={PASSO} aria-hidden="true">
      <div className="landing-label text-[var(--l-fg-faint)]">E-mail</div>
      <div className="mt-2 flex items-center justify-between rounded-[7px] bg-[var(--l-bg-lift)] px-2.5 py-2">
        <span className="text-[11.5px] text-[var(--l-fg-mute)]">voce@suabarbearia.com</span>
        <span className="h-3.5 w-px bg-[var(--l-accent-ink)]" />
      </div>
    </div>
  )
}

/**
 * Passo 2: o código na tela do celular.
 *
 * O desenho é ABSTRATO de propósito — os três cantos fazem a forma ser
 * reconhecida como código, e o miolo é um padrão fixo, não um QR válido.
 * Gerar um código que a pessoa aponta a câmera e não abre nada seria a
 * mesma classe de problema do link morto que esta página já recusou uma vez.
 */
export function QrMini() {
  const modulos = [
    [0, 1, 1, 0, 1],
    [1, 0, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 0, 1],
    [1, 0, 1, 1, 0],
  ]
  return (
    <div className={PASSO} aria-hidden="true">
      <div className="mx-auto flex w-fit flex-col items-center">
        <svg width="74" height="74" viewBox="0 0 74 74">
          {[
            [2, 2],
            [50, 2],
            [2, 50],
          ].map(([cx, cy]) => (
            <g key={`${cx}-${cy}`}>
              <rect
                x={cx}
                y={cy}
                width="22"
                height="22"
                rx="5"
                fill="none"
                stroke="var(--l-fg-mute)"
                strokeWidth="3"
              />
              <rect x={cx + 7} y={cy + 7} width="8" height="8" rx="2" fill="var(--l-fg-mute)" />
            </g>
          ))}
          {modulos.map((linha, l) =>
            linha.map((m, c) =>
              m ? (
                <rect
                  key={`${l}-${c}`}
                  x={30 + c * 8}
                  y={30 + l * 8}
                  width="6"
                  height="6"
                  rx="1.5"
                  fill="var(--l-accent-ink)"
                  opacity="0.75"
                />
              ) : null,
            ),
          )}
        </svg>
      </div>
    </div>
  )
}

/** Passo 3: um serviço do catálogo, com preço e duração editáveis. */
export function ServicoMini() {
  return (
    <div className={PASSO} aria-hidden="true">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] text-[var(--l-fg)]">Corte e barba</span>
        <span className="landing-num text-[11.5px] text-[var(--l-fg)]">R$ 70</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        <span className="rounded-full bg-[var(--l-bg-lift)] px-2.5 py-1 text-[10.5px] text-[var(--l-fg-faint)]">
          60 min
        </span>
        <span className="rounded-full bg-[var(--l-accent-pale)] px-2.5 py-1 text-[10.5px] text-[var(--l-accent-ink)]">
          editar
        </span>
      </div>
    </div>
  )
}
