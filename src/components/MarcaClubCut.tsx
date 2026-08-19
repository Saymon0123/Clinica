/**
 * A marca do Club Cut.
 *
 * Existe como componente único porque antes cada tela desenhava o logo por
 * conta própria com o ícone `Scissors` do lucide — ou seja, a marca era um
 * glifo de biblioteca que qualquer produto do mundo pode usar, repetido em
 * seis lugares que podiam divergir.
 *
 * ─── O que a forma diz ──────────────────────────────────────────────────────
 *
 * PLACA — o retângulo de canto generoso é a mesma linguagem de forma dos
 * cartões da landing. A marca é feita do mesmo material que o produto.
 *
 * LISTRA — a diagonal do poste de barbearia, no MESMO ângulo de -52° da
 * `.regua-poste` que fecha o herói e antecede o rodapé. A listra do poste não
 * é enfeite: historicamente são as ataduras penduradas secando em volta do
 * bastão que o paciente apertava, de quando o barbeiro também sangrava e
 * arrancava dente. É o vocabulário do ofício, e nenhum concorrente usa.
 *
 * C — a letra da marca, com o terminal cortado no mesmo -52°. O corte é o
 * produto: Club **Cut**.
 *
 * ─── Por que ela sobrevive pequena ──────────────────────────────────────────
 *
 * A 16px a listra desaparece por completo e sobra um C limpo sobre a placa.
 * Isso é degradação desenhada, não acidente: o detalhe some primeiro, a marca
 * fica. Testado em aba de navegador antes de entrar.
 *
 * A placa própria é o que faz a marca funcionar em fundo escuro, claro ou
 * cinza sem precisar de variante — inclusive na aba do navegador, onde não se
 * controla a cor de trás.
 */
import { useId } from 'react'

export function MarcaClubCut({
  size = 32,
  className = '',
}: {
  size?: number
  className?: string
}) {
  /*
    IDs derivados por instância. A marca aparece na navbar E no rodapé da mesma
    página; com `id` fixo os dois SVGs declarariam o mesmo clipPath e a mesma
    mask, o que é HTML inválido e faz o navegador resolver todas as referências
    para a primeira declaração encontrada.
  */
  const base = useId()
  const placa = `${base}-placa`
  const letra = `${base}-letra`

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Club Cut"
    >
      <clipPath id={placa}>
        <rect width="512" height="512" rx="116" />
      </clipPath>
      {/*
        A máscara pinta a placa inteira MENOS o C. Desenhar o C por cima em
        osso deixaria a listra atravessando a letra; assim a letra é recorte
        limpo, e a listra fica só no fundo.
      */}
      <mask id={letra}>
        <rect width="512" height="512" fill="#fff" />
        <circle cx="256" cy="256" r="132" fill="none" stroke="#000" strokeWidth="72" />
        <rect
          x="256"
          y="206"
          width="330"
          height="100"
          fill="#fff"
          transform="rotate(-52 256 256)"
        />
      </mask>

      <g clipPath={`url(#${placa})`}>
        {/* O osso fica embaixo: é ele que aparece dentro do recorte do C. */}
        <rect width="512" height="512" fill="#F3F1EA" />
        <g mask={`url(#${letra})`}>
          <rect width="512" height="512" fill="#1F5D42" />
          {/* Listra do poste. Tinta com alfa, e não uma segunda cor: assim ela
              escurece o verde em vez de introduzir um terceiro tom na marca. */}
          <g stroke="#0D1512" strokeOpacity="0.26" strokeWidth="58">
            <path d="M-120 340 L340 -120" />
            <path d="M-40 560 L560 -40" />
            <path d="M180 640 L640 180" />
          </g>
        </g>
      </g>
    </svg>
  )
}
