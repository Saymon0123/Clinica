import { useEffect, useRef, useState } from 'react'
import { Reveal } from './primitivos'

/**
 * O programa de patentes do Club Cut.
 *
 * Chamava-se "Reconhecimento Aura", o que dava à feature o nome da empresa
 * (Aura Studio) e somava um quarto nome à página — Club Cut, Aura, Aurora,
 * Aura Studio. O programa é do produto, então leva o nome do produto.
 * (Auditoria 2026-08-28, P0 de marca.)
 *
 * Adaptado de um mockup de referência (não é a página original) para os
 * tokens e o vocabulário visual já em uso aqui: fundo `--l-canvas` que já
 * embala o comparativo e os depoimentos ao redor, `landing-serif` no
 * destaque do título, `landing-label` nas etiquetas, mesma borda de cartão
 * usada no resto da página.
 *
 * **Fica depois do preço.** É benefício de quem JÁ decidiu ("e ainda tem
 * isso"), e no meio do funil era a seção mais longa interrompendo o corredor
 * prova -> preço (auditoria 2026-08-28). Depois da poda de 02/09 ela também
 * é curta, o que a torna um respiro antes do FAQ em vez de um desvio.
 *
 * **A régua de benefícios saiu em 02/09.** Ela listava, por patente, um
 * relatório mensal no WhatsApp, uma revisão de agenda trimestral, acesso
 * antecipado a automações, divulgação nas redes e comissão por indicação —
 * e NADA disso existia: nem tabela, nem coluna, nem rotina no n8n, nem
 * controle de pagamento para a comissão. Numa página que recusa o "reduza
 * até 70%" dos concorrentes por não conseguir provar, prometer dinheiro de
 * indicação sem sistema por trás era a contradição mais cara do site.
 *
 * O que substituiu não foi outra lista: foi dizer que a placa é o prêmio
 * inteiro. A ausência de benefício vira o argumento, do mesmo jeito que a
 * seção "Não vamos prometer 70%" faz com a ausência do número.
 *
 * **O critério é o único número que já existe.** Horário confirmado pelo
 * sistema é o que a fatura cobra (`faturas_de_uso`), então a pessoa pode
 * conferir a própria régua sem depender da nossa palavra. Faixas por
 * patente NÃO entram na página enquanto não existirem no banco.
 */

/**
 * A foto das quatro placas, aparecendo em vez de pipocando.
 *
 * Com `loading="lazy"`, a imagem decodifica no meio do `Reveal` da seção e
 * salta na tela já opaca — o único "pop" visível da página. Um fade curto
 * no `load` resolve, mas ele precisa cobrir o caso da imagem já estar em
 * cache: aí o evento `load` dispara antes de o React pendurar o handler, e
 * a imagem ficaria invisível para sempre. Daí a checagem de `complete` na
 * montagem.
 */
function PlacaAura() {
  const imgRef = useRef<HTMLImageElement>(null)
  const [carregada, setCarregada] = useState(false)

  useEffect(() => {
    if (imgRef.current?.complete) setCarregada(true)
  }, [])

  return (
    <div className="placa-aura-alvo overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line)]">
      <img
        ref={imgRef}
        src="/patentes-aura.jpg"
        alt="Quatro placas de reconhecimento em degradê: Recruta, Sargento, Capitão e General, cada uma com uma estrela e a moldura mais nobre conforme a patente sobe."
        onLoad={() => setCarregada(true)}
        /*
          `width`/`height` com as medidas reais do arquivo não são decoração:
          sem elas o navegador reserva altura zero até a imagem decodificar e,
          como ela é `lazy`, isso acontece com a pessoa já rolando — a página
          inteira abaixo desta seção dá um salto de ~600px. Foi assim que um
          atalho para "#preço" ia parar no lugar errado: o alvo era calculado
          antes de a imagem existir. Com as medidas declaradas o espaço já
          nasce reservado, e o `w-full`/`h-auto` continua mandando no tamanho
          que aparece na tela.
        */
        width={1024}
        height={572}
        /*
          O container já tinha `overflow-hidden` — o zoom no hover só usa o
          recorte que já existia. A transição e o zoom moram em `index.css`
          (`.placa-aura`), junto das outras guardas de movimento; ver a nota
          lá sobre por que não dá para fazer isso com variante do Tailwind.
        */
        className={`placa-aura block h-auto w-full ${carregada ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}

export function ReconhecimentoAura() {
  return (
    <section className="relative overflow-hidden bg-[var(--l-canvas)] px-6 py-[64px] lg:py-[84px]">
      <div className="relative z-[1] mx-auto max-w-[1100px]">
        <Reveal>
          <p className="landing-label text-[var(--l-accent-ink)]">Patentes Club Cut</p>
          <h2 className="landing-display mt-4 max-w-[18ch] text-[clamp(1.75rem,3.6vw,2.75rem)] text-[var(--l-fg)]">
            Sua barbearia tem um nome.
            <br />
            Agora ela também tem <em className="landing-serif">uma patente.</em>
          </h2>
          <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            Cada barbearia que evolui com o Club Cut sobe de patente — e ganha uma placa física pra
            provar. Não é sobre quem fatura mais. É sobre quem cresce de verdade.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-11">
          <PlacaAura />
          <p className="mt-4 text-[14px] leading-relaxed text-[var(--l-fg-faint)]">
            <strong className="font-medium text-[var(--l-fg-mute)]">
              Recruta. Sargento. Capitão. General.
            </strong>{' '}
            Cada patente é uma placa de verdade, na parede de verdade da sua barbearia.
          </p>
          {/*
            A frase que substituiu a régua de benefícios. Dizer que não vem
            nada junto é mais forte do que uma lista morna — e é a única
            versão verdadeira: hoje a placa é, de fato, o programa inteiro.
          */}
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[var(--l-fg-faint)]">
            A placa é o prêmio inteiro: sem desconto, sem brinde, sem benefício escondido. É o
            registro, na parede, de que a sua barbearia chegou lá.
          </p>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[var(--l-fg-faint)]">
            Sobe de patente por horário confirmado pelo sistema — o mesmo número que aparece na
            sua fatura.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
