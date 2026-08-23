import { Link } from 'react-router-dom'
import { Navbar, Rodape } from './VendasPage'
import { Reveal, Cta } from './landing/primitivos'
import { CONTATO } from '../../lib/contato'
import { DIAS_DE_TESTE } from '../../lib/planos'
import { EMPRESA, ORIGEM, QUEM_FAZ } from '../../lib/institucional'

/**
 * Página "sobre".
 *
 * Não é uma página de produto. Ela responde a uma pergunta só, e é uma
 * pergunta de risco: "posso confiar meu WhatsApp e minha agenda a esse
 * pessoal?". Cada bloco existe para derrubar uma desconfiança específica.
 * Bloco que não derruba desconfiança nenhuma não entra.
 *
 * **A regra do CONTATO vale aqui inteira.** Nada nesta página pode ser
 * inventado para o layout ficar cheio: origem sem história escrita, nome de
 * fundador que não existe, CNPJ de mentira. O conteúdo variável vem de
 * `lib/institucional.ts`, e o bloco que não tiver dado real simplesmente NÃO
 * RENDERIZA — do mesmo jeito que o rodapé esconde o canal de suporte que
 * ainda não existe. Uma página "sobre" com marcador `[seu nome]` no ar é pior
 * que não ter página "sobre".
 *
 * **Os três blocos fixos são fixos porque são verificáveis dentro do
 * produto.** A tese, as três posições e o fechamento não dependem de dado
 * novo: cada posição descreve algo que já está no código e na landing, e por
 * isso qualquer pessoa pode conferir se é verdade. É o conteúdo mais difícil
 * de confundir com texto genérico, e é ele que carrega a página enquanto o
 * resto não estiver preenchido.
 */

const SECAO = 'border-b border-[var(--l-line)] px-6'
const FAIXA = 'mx-auto max-w-[1180px] py-[72px] sm:py-[88px]'

/**
 * As três posições.
 *
 * Cada uma tem uma `consequencia`: o que aquela posição CUSTOU. Posição sem
 * custo é slogan — qualquer concorrente escreve "somos transparentes". O que
 * não dá para copiar é o depoimento que ficou de fora, o número que a gente
 * se recusa a publicar e a cobrança que cai junto com o uso.
 *
 * A numeração 01/02/03 não é enfeite: são três posições independentes, e o
 * número serve de âncora para citar "a posição 2" numa conversa.
 */
const POSICOES = [
  {
    titulo: 'O cliente sempre sabe que está falando com um robô.',
    texto:
      'Dá para fazer a IA se passar por gente, e vende bem. A gente não acha certo. O agente se apresenta logo na primeira mensagem, e quem quiser falar com uma pessoa fala com uma pessoa.',
    consequencia:
      'O que isso custou: um depoimento nosso terminava com "o mais louco é que o cliente nem percebe que está falando com uma IA". A frase é verdadeira. Ficou de fora.',
  },
  {
    titulo: 'Não prometemos porcentagem que não medimos.',
    texto:
      'Você não vai achar "reduza até 70% das faltas" em lugar nenhum deste site. A gente não mediu isso na sua barbearia, então não pode afirmar — e "até" é a palavra que deixa dizer 70 quando o real foi 4.',
    consequencia:
      'Por isso a calculadora da página inicial roda com os seus números, e não com os nossos.',
  },
  {
    titulo: 'Você paga por agendamento, não por mês parado.',
    texto:
      'Mensalidade cobra igual no mês cheio e no mês fraco. Cobrança por agendamento só existe quando o sistema fez alguma coisa por você.',
    consequencia: 'Se a gente parar de funcionar, a nossa conta cai junto. É de propósito.',
  },
] as const

function Tese() {
  return (
    <section className={SECAO}>
      <div className={`${FAIXA} pt-[120px] sm:pt-[136px]`}>
        <Reveal>
          <span className="landing-label text-[var(--l-fg-faint)]">Sobre</span>
          <h1 className="mt-5 max-w-[20ch] text-[clamp(2rem,5.2vw,3.5rem)] font-bold leading-[1.08] tracking-[-0.025em] text-[var(--l-fg)] [text-wrap:balance]">
            Barbeiro bom perde cliente por não conseguir responder o WhatsApp{' '}
            <span className="text-[var(--l-accent-ink)]">com a tesoura na mão.</span>
          </h1>
          <p className="mt-7 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            O Club Cut existe por causa dessa frase. O resto desta página é a explicação de quem
            está do outro lado e de como a gente decide o que entra no produto.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/** Só aparece quando existe história escrita. Ver `lib/institucional.ts`. */
function Origem() {
  if (ORIGEM.paragrafos.length === 0) return null

  return (
    <section className={SECAO}>
      <div className={FAIXA}>
        <div className="grid gap-6 lg:grid-cols-[200px_1fr] lg:gap-12">
          <Reveal>
            <span className="landing-label text-[var(--l-fg-faint)]">Como começou</span>
          </Reveal>
          <div className="flex flex-col gap-6">
            {ORIGEM.paragrafos.map((p) => (
              <Reveal key={p.slice(0, 32)}>
                <p className="max-w-[62ch] text-[16.5px] leading-[1.75] text-[var(--l-fg-mute)]">
                  {p}
                </p>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Imagem de ambiente, nunca de rosto: um interior de barbearia não é
            atribuído a ninguém, então não tem o que ser desmentido. Com
            `width`/`height` porque sem eles a imagem preguiçosa reserva zero
            altura e a página pula quando ela decodifica. */}
        {ORIGEM.imagem && (
          <Reveal>
            <figure className="mt-12 overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line)]">
              <img
                src={ORIGEM.imagem.src}
                alt={ORIGEM.imagem.alt}
                width={ORIGEM.imagem.largura}
                height={ORIGEM.imagem.altura}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full"
              />
              {ORIGEM.imagem.legenda && (
                <figcaption className="border-t border-[var(--l-line)] bg-[var(--l-canvas)] px-5 py-3 text-[12.5px] text-[var(--l-fg-faint)]">
                  {ORIGEM.imagem.legenda}
                </figcaption>
              )}
            </figure>
          </Reveal>
        )}
      </div>
    </section>
  )
}

function Posicoes() {
  return (
    <section className={SECAO}>
      <div className={FAIXA}>
        <Reveal>
          <span className="landing-label text-[var(--l-fg-faint)]">No que a gente acredita</span>
        </Reveal>

        <div className="mt-10 flex flex-col">
          {POSICOES.map((p, i) => (
            <Reveal key={p.titulo}>
              <article className="grid gap-3 border-t border-[var(--l-line)] py-9 last:border-b sm:grid-cols-[44px_1fr] sm:gap-6">
                <span
                  aria-hidden="true"
                  className="landing-num flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--l-accent-pale)] text-[12.5px] text-[var(--l-accent-ink)]"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-[var(--l-fg)] [text-wrap:balance]">
                    {p.titulo}
                  </h2>
                  <p className="mt-3 max-w-[58ch] text-[15.5px] leading-relaxed text-[var(--l-fg-mute)]">
                    {p.texto}
                  </p>
                  <p className="mt-4 max-w-[58ch] border-l-2 border-[var(--l-accent)] pl-3.5 text-[13.5px] leading-relaxed text-[var(--l-fg-faint)]">
                    {p.consequencia}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Só aparece com pessoa real e nome real. Ver `lib/institucional.ts`. */
function QuemFaz() {
  if (!QUEM_FAZ) return null

  return (
    <section className={SECAO}>
      <div className={FAIXA}>
        <Reveal>
          <span className="landing-label text-[var(--l-fg-faint)]">Quem faz</span>
        </Reveal>

        <Reveal>
          <div className="card mt-10 grid gap-8 rounded-[var(--r-md)] p-7 sm:grid-cols-[132px_1fr] sm:p-9">
            {/* Sem foto o cartão continua de pé — a coluna some e o texto ocupa
                a largura inteira. Nome com link que dá para conferir vale mais
                que retrato que ninguém consegue checar. */}
            {QUEM_FAZ.foto && (
              <img
                src={QUEM_FAZ.foto.src}
                alt={QUEM_FAZ.foto.alt}
                width={264}
                height={264}
                loading="lazy"
                decoding="async"
                className="h-[132px] w-[132px] rounded-[var(--r-sm)] object-cover"
              />
            )}
            <div>
              <h2 className="text-[21px] font-semibold tracking-[-0.015em] text-[var(--l-fg)]">
                {QUEM_FAZ.nome}
              </h2>
              <p className="mt-1.5 text-[14px] text-[var(--l-accent-ink)]">{QUEM_FAZ.papel}</p>
              <p className="mt-5 max-w-[58ch] text-[15.5px] leading-relaxed text-[var(--l-fg-mute)]">
                {QUEM_FAZ.bio}
              </p>

              {QUEM_FAZ.links.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2.5">
                  {QUEM_FAZ.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center rounded-full border border-[var(--l-line)] px-4 text-[13px] text-[var(--l-fg-mute)] transition-colors duration-200 hover:border-[var(--l-line-strong)] hover:text-[var(--l-fg)]"
                    >
                      {l.rotulo}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/**
 * Prova de existência.
 *
 * É o bloco que separa "empresa" de "landing page", e o mais fácil de
 * estragar: campo inventado aqui é o oposto do que a seção existe para fazer.
 * Campo sem valor real não vira linha.
 */
function Existencia() {
  const campos = [
    EMPRESA.razaoSocial && { rotulo: 'Razão social', valor: EMPRESA.razaoSocial },
    EMPRESA.cnpj && { rotulo: 'CNPJ', valor: EMPRESA.cnpj, mono: true },
    EMPRESA.cidade && { rotulo: 'Onde estamos', valor: EMPRESA.cidade },
    CONTATO.email && { rotulo: 'E-mail', valor: CONTATO.email, href: `mailto:${CONTATO.email}` },
    CONTATO.instagram && {
      rotulo: 'Instagram',
      valor: `@${CONTATO.instagram}`,
      href: `https://instagram.com/${CONTATO.instagram}`,
    },
    {
      rotulo: 'Suporte',
      valor: 'WhatsApp, dentro do sistema, com resposta em até 1 dia útil',
    },
  ].filter(Boolean) as Array<{
    rotulo: string
    valor: string
    href?: string
    mono?: boolean
  }>

  /*
    O canal de suporte sozinho não é prova de existência de ninguém — é uma
    frase que qualquer página escreveria. Com só ele preenchido, a seção vira
    uma célula solitária numa grade de três colunas, e uma seção chamada
    "prova de existência" sem nenhuma prova é pior que a ausência dela. Some
    até existir CNPJ, cidade ou canal real.
  */
  if (campos.length < 2) return null

  return (
    <section className={SECAO}>
      <div className={FAIXA}>
        <Reveal>
          <span className="landing-label text-[var(--l-fg-faint)]">Prova de existência</span>
        </Reveal>

        <Reveal>
          {/* `gap-px` sobre a cor da linha: as divisórias da grade são o próprio
              fundo aparecendo entre as células, e não borda em cada uma — assim
              não dobram no encontro de duas células. */}
          <dl className="mt-10 grid gap-px overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line)] bg-[var(--l-line)] sm:grid-cols-2 lg:grid-cols-3">
            {campos.map((c) => (
              <div key={c.rotulo} className="bg-[var(--l-canvas)] p-6">
                <dt className="landing-label text-[var(--l-fg-faint)]">{c.rotulo}</dt>
                <dd
                  className={`mt-3 text-[15px] leading-relaxed text-[var(--l-fg)] ${
                    c.mono ? 'landing-num' : ''
                  }`}
                >
                  {c.href ? (
                    <a
                      href={c.href}
                      target="_blank"
                      rel="noreferrer"
                      className="border-b border-[var(--l-line-strong)] transition-colors duration-200 hover:border-[var(--l-accent-ink)]"
                    >
                      {c.valor}
                    </a>
                  ) : (
                    c.valor
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  )
}

function Fechamento() {
  return (
    <section className="px-6">
      <div className={`${FAIXA} text-center`}>
        <Reveal>
          <h2 className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-bold tracking-[-0.02em] text-[var(--l-fg)] [text-wrap:balance]">
            Se fez sentido, o teste é de graça.
          </h2>
          {/* Sem repetir preço nem recurso: quem leu até aqui não estava com
              dúvida de produto, estava com dúvida de confiança. */}
          <p className="mx-auto mt-5 max-w-[44ch] text-[16px] leading-relaxed text-[var(--l-fg-mute)]">
            Você já viu o que ele faz na página inicial. O que faltava era saber quem está do
            outro lado.
          </p>
          <div className="mt-8 flex justify-center">
            <Cta>{`Testar ${DIAS_DE_TESTE} dias grátis`}</Cta>
          </div>
          <p className="mt-6 text-[13.5px] text-[var(--l-fg-faint)]">
            Ou volte para <Link to="/inicio" className="underline underline-offset-4">a página inicial</Link>.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

export function SobrePage() {
  return (
    /* `landing` não é enfeite: é a classe que DEFINE os tokens `--l-*` em
       `index.css`. Sem ela a página herda o tema claro do CRM e cada
       `var(--l-fg)` cai para o valor vazio — foi o que aconteceu no primeiro
       teste, com o fundo saindo branco. */
    <div className="landing min-h-[100dvh]">
      {/* `base` manda os atalhos do menu para as âncoras da landing: aqui elas
          não existem, e um `#preco` nesta página não leva a lugar nenhum. */}
      <Navbar base="/inicio" />
      <main>
        <Tese />
        <Origem />
        <Posicoes />
        <QuemFaz />
        <Existencia />
        <Fechamento />
      </main>
      <Rodape />
    </div>
  )
}
