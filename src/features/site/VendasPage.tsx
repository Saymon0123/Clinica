import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Menu, MessageCircle, Smartphone, Wallet, X } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { DIAS_DE_TESTE, PRECO_POR_AGENDAMENTO } from '../../lib/planos'
import { CONTATO } from '../../lib/contato'
import { ChatDemo } from './landing/ChatDemo'
import { ProvaRobo } from './landing/ProvaRobo'
import { ProdutoDemo } from './landing/ProdutoDemo'
import { Depoimentos } from './landing/Depoimentos'
import { FaqAccordion } from './landing/FaqAccordion'
import { Calculadora } from './landing/Calculadora'
import { CalculadoraPreco } from './landing/CalculadoraPreco'
import { Comparativo } from './landing/Comparativo'
import { GraficoPreco } from './landing/GraficoPreco'
import {
  BalaoMini,
  CaixaMini,
  CampoMini,
  LembreteMini,
  QrMini,
  ServicoMini,
} from './landing/MicroVisuais'
import { CtaFixo } from './landing/CtaFixo'
import { WhatsAppPopup } from './landing/WhatsAppPopup'
import { Cta, Reveal, RevealGrupo, RevealItem } from './landing/primitivos'
import { useRolou } from './landing/useRolou'
import { FaixaBarbearias } from './landing/FaixaBarbearias'
import { ReconhecimentoAura } from './landing/ReconhecimentoAura'
import { ReguaScroll } from './landing/ReguaScroll'
import { MarcaClubCut } from '../../components/MarcaClubCut'

/**
 * Página de vendas — onde o anúncio e a prospecção caem.
 *
 * Fora do CRM e sem autenticação: quem chega aqui não tem conta. Todo caminho
 * leva ao mesmo lugar (`/criar-conta`), porque uma página com dois objetivos
 * não converte em nenhum.
 *
 * **Regra ao mexer no texto:** só entra o que o sistema faz hoje. Nada de site
 * institucional, recuperação de clientes ou relatório avançado — são coisas da
 * visão que não existem, e prometê-las aqui vira reclamação no primeiro dia de
 * uso. Os preços saem de `plans`; se a tabela mudar, este texto precisa mudar
 * junto.
 *
 * **A copy fala de perda, não de ganho.** "Agenda automática" é benefício de
 * catálogo e não mexe com ninguém; o corte que foi para o concorrente porque a
 * mensagem das 22h ficou sem resposta, sim. E fala com hora e número: "cliente
 * esperando" é abstração, "15h20 e a cadeira vazia" é uma cena que o dono já
 * viveu.
 *
 * **Uma decisão por seção.** Cada chamada para ação vem com a mesma microcopy
 * de risco embaixo, e a barra fixa se apaga quando qualquer uma delas está à
 * vista, para nunca haver dois botões disputando o mesmo olhar.
 *
 * **Um só elemento gritando.** O verde sólido aparece na chamada principal e
 * no plano recomendado, e em mais nada. Espalhado, ele deixa de significar
 * "é por aqui".
 *
 * ---------------------------------------------------------------------------
 * POSICIONAMENTO, e por que a página é escrita assim
 *
 * A categoria está lotada. Uma busca por "sistema de agendamento com IA para
 * barbearia" devolve uma dúzia de produtos com a MESMA lista de recursos
 * (agenda, WhatsApp, IA, financeiro, comissão, fidelidade) e a MESMA promessa:
 * "reduza até X% das faltas", com X indo de 50 a 90 conforme a página. Nenhum
 * publica de onde tirou o número, e todos usam "até", que permite dizer 70
 * quando o real foi 4.
 *
 * O Club Cut custa mais que a maioria deles, e isso é escolha, não descuido.
 * Uma página que promete a mesma coisa por três vezes o preço não fecha venda,
 * então ela não compete na mesma frase.
 *
 * Duas coisas sustentam o preço, e as duas já são verdade no produto:
 *
 * 1. O agente ASSUME QUE É AUTOMÁTICO quando perguntam, e sai da frente quando
 *    o dono entra na conversa. O concorrente faz o oposto: batiza o robô de
 *    gente. O medo real do dono não é "será que agenda?", é "e se falar besteira
 *    com meu cliente". Ninguém responde isso porque admitir risco atrapalha a
 *    venda — e é exatamente por isso que responder aqui separa.
 *
 * 2. A página NÃO PROMETE PERCENTUAL. Num mercado onde todos gritam um número
 *    inventado, ser o único que não grita é a coisa mais distinta possível. No
 *    lugar da promessa vem a calculadora, com os números do próprio dono.
 *
 * Ao mexer nesta página: não introduza percentual de resultado sem medição, e
 * não suavize a frase da seção `Franqueza`. As duas coisas são o produto.
 * ---------------------------------------------------------------------------
 */
const CTA = `Testar ${DIAS_DE_TESTE} dias grátis`
const MICROCOPY = 'Sem cartão. Cancela quando quiser.'

/**
 * Respiro entre seções.
 *
 * Era 150px em cima e embaixo, o que dava 300px de preto entre uma seção e a
 * seguinte. Espaço vazio só lê como respiro quando alguma coisa mora perto
 * dele; sozinho, do tamanho de meia tela, lê como página inacabada. `SECAO_APOIO`
 * é para as partes de serviço, que não precisam do mesmo palco.
 */
/*
   Superficie por secao. No escuro a elevacao vem do contraste base/cartao:
   secao com cartoes fica na base (o cartao salta), secao de texto puro fica na
   banda de superficie (o texto ganha um palco). A pagina alterna as duas.
*/
const SECAO = 'relative overflow-hidden px-6 py-[76px] lg:py-[104px]'
const SECAO_BRANCA = 'relative overflow-hidden bg-[var(--l-canvas)] px-6 py-[76px] lg:py-[104px]'
const SECAO_APOIO = 'relative overflow-hidden px-6 py-[64px] lg:py-[84px]'
const CAIXA = 'relative z-[1] mx-auto max-w-[1180px]'

/**
 * Três níveis de título, e não um só.
 *
 * Seis seções no mesmo corpo de 54px faziam o olho descer a página sem nunca
 * ter motivo para acelerar ou desacelerar: os layouts variavam, o ritmo não.
 * O tamanho passa a dizer o que a seção pesa na decisão.
 *
 * DECISAO é onde a pessoa escolhe (o que o produto faz, quanto custa).
 * NARRATIVA é onde ela se reconhece ou vê a prova.
 * APOIO é serviço: consulta antes de decidir, não convence sozinho.
 */
const TITULO_DECISAO = 'landing-display text-[clamp(2rem,4.6vw,3.4rem)] text-[var(--l-fg)]'
const TITULO_NARRATIVA = 'landing-display text-[clamp(1.75rem,3.6vw,2.75rem)] text-[var(--l-fg)]'
const TITULO_APOIO = 'landing-display text-[clamp(1.5rem,2.6vw,2.05rem)] text-[var(--l-fg)]'

/** Atalhos do meio da barra: as três perguntas que fazem alguém rolar. */
const ATALHOS = [
  { href: '#recursos', rotulo: 'O que faz' },
  { href: '#preco', rotulo: 'Preço' },
  { href: '#duvidas', rotulo: 'Dúvidas' },
] as const

/**
 * Barra de navegação sem chamada para ação.
 *
 * O botão daqui competia com o do herói na mesma tela, e dois botões iguais na
 * mesma dobra fazem a pessoa escolher entre botões em vez de escolher o
 * produto. Quem já é cliente tem o "Entrar", que é outra intenção; quem não é
 * tem o botão grande logo abaixo e a barra fixa depois.
 *
 * **Os atalhos do meio não desfazem essa decisão — é o oposto dela.** A barra
 * tinha a marca colada numa borda e o "Entrar" na outra, com mil pixels de
 * vazio no meio no desktop; parecia layout quebrado, não layout limpo. O que
 * entra ali é navegação, não conversão: leva para uma seção da mesma página,
 * então não disputa o clique com o botão do herói do jeito que um segundo
 * "testar grátis" disputaria. Numa página longa, "Preço" é o atalho que a
 * pessoa procura primeiro — e ela procurava rolando.
 *
 * **Some abaixo de `md` de propósito.** No celular não existe vazio nenhum
 * para preencher, e três links a mais só espremeriam a marca.
 */
export function Navbar({ base = '' }: { base?: string }) {
  const rolou = useRolou(80)
  /*
    O menu do celular. Abaixo de `md` os atalhos eram `display:none` sem
    hambúrguer nenhum — quem chegava por anúncio no celular e queria "Preço"
    não tinha como chegar lá sem rolar a página inteira. (Auditoria
    2026-08-28, P1.) O painel fecha ao escolher, porque escolher É fechar.
  */
  const [aberto, setAberto] = useState(false)

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-300 ${
        rolou || aberto
          ? 'border-b border-[var(--l-line)] bg-[rgba(13,21,18,0.92)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center gap-6 px-6">
        <Link to="/inicio" className="-my-2 flex min-h-[44px] shrink-0 items-center gap-2.5 py-2">
          <MarcaClubCut size={32} />
          <span className="text-[17px] font-bold tracking-tight text-[var(--l-fg)]">Club Cut</span>
        </Link>

        {/* O cabecalho tinha links de navegacao sem landmark: leitor de tela
            nao tinha como pular para eles. E o alvo de toque subiu para 44px,
            que e o minimo para o dedo. */}
        <nav aria-label="Principal" className="hidden flex-1 justify-center gap-1 md:flex">
          {ATALHOS.map((a) => (
            <a
              key={a.href}
              href={`${base}${a.href}`}
              className="inline-flex min-h-[44px] items-center rounded-full px-3.5 text-[14px] font-medium text-[var(--l-fg-mute)] transition-colors duration-200 hover:bg-[var(--l-bg-lift)] hover:text-[var(--l-fg)]"
            >
              {a.rotulo}
            </a>
          ))}
          {/* "Sobre" é <Link>, não âncora: os atalhos rolam dentro da mesma
              página e este navega para outra rota — misturá-lo no ATALHOS
              faria o `base` transformá-lo em "/inicio/sobre". Continua
              navegação, não conversão: a decisão de CTA zero na barra fica. */}
          <Link
            to="/sobre"
            className="inline-flex min-h-[44px] items-center rounded-full px-3.5 text-[14px] font-medium text-[var(--l-fg-mute)] transition-colors duration-200 hover:bg-[var(--l-bg-lift)] hover:text-[var(--l-fg)]"
          >
            Sobre
          </Link>
        </nav>

        {/* A borda existe porque "Entrar" era texto cinza solto na borda da
            tela: sem contorno, o único alvo clicável da barra não parecia
            clicável. Contorno em vez de preenchimento mantém ele visivelmente
            secundário ao botão do herói. */}
        <Link
          to="/login"
          className="ml-auto inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-[var(--l-line)] px-4 text-[14px] font-medium text-[var(--l-fg-mute)] transition-colors duration-200 hover:border-[var(--l-line-strong)] hover:text-[var(--l-fg)] md:ml-0"
        >
          Entrar
        </Link>

        <button
          type="button"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={aberto}
          aria-controls="menu-celular"
          onClick={() => setAberto((v) => !v)}
          className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[var(--l-fg)] md:hidden"
        >
          {aberto ? <Menu className="hidden" /> : null}
          {aberto ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
        </button>
      </div>

      {aberto && (
        <nav
          id="menu-celular"
          aria-label="Menu"
          className="border-t border-[var(--l-line)] bg-[var(--l-canvas)] px-6 py-3 md:hidden"
        >
          {ATALHOS.map((a) => (
            <a
              key={a.href}
              href={`${base}${a.href}`}
              onClick={() => setAberto(false)}
              className="flex min-h-[48px] items-center text-[16px] font-medium text-[var(--l-fg)]"
            >
              {a.rotulo}
            </a>
          ))}
          <Link
            to="/sobre"
            onClick={() => setAberto(false)}
            className="flex min-h-[48px] items-center text-[16px] font-medium text-[var(--l-fg)]"
          >
            Sobre
          </Link>
        </nav>
      )}
    </header>
  )
}

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-[88px] pt-[124px] lg:pb-[108px] lg:pt-[148px]">

      <div className={`${CAIXA} grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10`}>
        <div>
          {/* A sobrancelha existe para resolver um pronome orfao: o H1 comeca
              falando de "ele" e, no celular, o aparelho com a conversa fica
              abaixo da dobra. Sem esta linha, metade do trafego le um pronome
              sem dono como primeira palavra da pagina. */}
          <Reveal>
            <p className="landing-label text-[var(--l-fg-faint)]">
              Atendimento no WhatsApp para barbearia
            </p>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="landing-display mt-5 text-[clamp(2.6rem,6.6vw,5rem)] text-[var(--l-fg)]">
              Você corta. Ele responde, marca e <em className="landing-serif">confirma</em>.
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-8 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)] sm:text-[19px]">
              Enquanto você termina um corte, ele responde o preço, mostra os horários livres e
              marca o próximo cliente. E quando você pega o celular, ele sai da frente.
            </p>
          </Reveal>

          <Reveal delay={0.17}>
            <Cta className="mt-11" microcopy={MICROCOPY}>
              {CTA}
            </Cta>
          </Reveal>
        </div>

        <Reveal delay={0.22}>
          <ChatDemo />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * As três cenas, cada uma com o horário na frente.
 *
 * Eram três frases longas alternadas à esquerda e à direita — 70 palavras
 * sem nenhum ponto de descanso para o olho. O horário é o que a cena tem de
 * mais concreto, e número grande é imagem: quem passa o olho lê "15h20" e
 * "22h" antes de ler qualquer palavra, e já sabe do que a página está
 * falando. As frases encolheram porque o marcador passou a dizer o quando.
 */
const DORES = [
  {
    quando: 'agora',
    cena: 'Máquina na mão, o celular toca. Ou você para o corte, ou o cliente espera.',
  },
  {
    quando: '15h20',
    cena: 'Marcou às 15h. A cadeira continua vazia, e aquele horário não volta.',
  },
  {
    quando: '22h',
    cena: 'Perguntaram o preço da barba. Você respondeu no outro dia; ele já tinha cortado em outro lugar.',
  },
]

function Dor() {
  return (
    <section className={SECAO_BRANCA}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>Não é falta de <em className="landing-serif">jeito</em>. É que suas mãos estavam ocupadas.</h2>
        </Reveal>

        <RevealGrupo className="mt-12 flex flex-col gap-9 sm:gap-11" intervalo={0.11}>
          {DORES.map((d) => (
            <RevealItem key={d.quando}>
              {/*
                O horário à esquerda, largo o bastante para os três ficarem
                alinhados entre si: sem largura fixa, "agora" empurra a frase
                para um lugar e "22h" para outro, e a coluna deixa de existir.
              */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-8">
                <span className="landing-num shrink-0 text-[clamp(2rem,5vw,3.25rem)] leading-none tracking-[-0.03em] text-[var(--l-accent-ink)] sm:w-[3.6em]">
                  {d.quando}
                </span>
                <p className="max-w-[34ch] text-[clamp(1.15rem,2.3vw,1.6rem)] font-medium leading-[1.34] tracking-[-0.015em] text-[var(--l-fg)]">
                  {d.cena}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGrupo>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/** Cada texto carrega uma hora ou um número: a cena convence, o adjetivo não. */
const RECURSOS = [
  {
    icone: MessageCircle,
    titulo: 'Atende no WhatsApp, sozinho',
    texto:
      'Responde preço e horário, marca, remarca e cancela. Às 23h40 de um domingo, ele responde igual.',
    span: 'md:col-span-2',
    visual: BalaoMini,
  },
  {
    icone: Smartphone,
    titulo: 'Você sabe da falta às 14h50',
    texto: 'Uma hora antes, o lembrete pergunta se ele vem. Dá tempo de chamar outro.',
    span: '',
    visual: LembreteMini,
  },
  {
    icone: Wallet,
    titulo: 'O dinheiro do dia, fechado',
    texto: 'Comanda, caixa e a comissão de cada barbeiro, calculada sozinha.',
    span: 'md:col-span-3',
    visual: CaixaMini,
  },
]

/**
 * Bento: células de tamanhos diferentes. Cards iguais seriam o template.
 *
 * Eram quatro. "Agenda que não deixa furo" saiu porque a demo da seção
 * seguinte MOSTRA a agenda se organizando — descrever em texto o que a tela
 * ao lado exibe é a repetição que fazia a página parecer que dava três voltas
 * no mesmo assunto (feedback de 02/09).
 */
function Recursos() {
  return (
    <section id="recursos" className={`${SECAO} secao-ancora`}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_DECISAO}>O que o seu WhatsApp faz enquanto você <em className="landing-serif">corta</em></h2>
        </Reveal>

        <RevealGrupo className="mt-11 grid gap-4 md:grid-cols-3">
          {RECURSOS.map((f) => (
            <RevealItem key={f.titulo} className={f.span}>
              <div className="card h-full rounded-[var(--r-md)] p-7 sm:p-9">
                {/* Icone decorativo: o titulo do card ja diz tudo. Sem aria-hidden o
                    leitor de tela anuncia um grafico sem nome antes do texto. */}
                <f.icone
                  size={20}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="text-[var(--l-accent-ink)]"
                />
                <h3 className="mt-7 text-[21px] font-semibold tracking-[-0.015em] text-[var(--l-fg)]">
                  {f.titulo}
                </h3>
                <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[var(--l-fg-mute)]">
                  {f.texto}
                </p>
                {/* A peça pequena mostra o que a frase acabou de descrever.
                    `max-w` para ela não esticar no card largo e virar o
                    assunto do cartão — ela ilustra, não narra. */}
                <div className="mt-6 max-w-[300px]">
                  <f.visual />
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGrupo>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * A franqueza, dita em voz alta.
 *
 * É o posicionamento inteiro numa frase. A categoria vende o contrário: o
 * concorrente batiza o robô de "Jarvis" e trabalha para que o cliente ache que
 * está falando com gente.
 *
 * O medo real do dono não é "será que agenda?", é "e se falar besteira com meu
 * cliente e me queimar?". Nenhum concorrente responde isso, porque admitir
 * risco atrapalha a venda. É justamente por isso que responder aqui separa o
 * Club Cut do resto — e é o que sustenta cobrar mais.
 *
 * Sem card e sem ícone de propósito: a frase é a peça.
 */
function Franqueza() {
  return (
    <section className="relative overflow-hidden bg-[var(--l-canvas)] px-6 py-[72px] lg:py-[96px]">
      <div className={`${CAIXA} grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10`}>
        <Reveal>
          <p className="max-w-[19ch] text-[clamp(1.6rem,4vw,2.9rem)] font-semibold leading-[1.2] tracking-[-0.025em] text-[var(--l-fg)]">
            Se o cliente perguntar se é robô, ele responde que é.
          </p>
          <p className="mt-7 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            A gente não acha certo enganar o seu cliente. Ele escreve como gente, atende como gente,
            e quando perguntam, não mente. É o seu nome na conversa.
          </p>

          {/*
            Aqui morava o convite "manda mensagem pro nosso número e pergunta"
            (a prova falsificável). Saiu por decisão do dono (2026-08-28): o
            número real do CONTATO é o suporte, atendido por gente — convidar
            a testar o robô num número onde o robô não atende prometeria o que
            o número não entrega. Se um dia o agente atender o número público,
            o convite volta a valer a pena. A prova encenada do ProvaRobo
            logo abaixo faz esse papel enquanto isso.
          */}
        </Reveal>

        {/*
          A prova encenada: a mesma pergunta e a mesma resposta que o agente
          dá de verdade. É o que sustenta a seção sem convidar ninguém a
          testar um número onde quem atende é o suporte humano.
        */}
        <Reveal delay={0.1}>
          <ProvaRobo />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * A agenda e o caixa por dentro.
 *
 * É a prova de que existe um sistema atrás do bot, e estava no mesmo container
 * de 1180px do texto, comprimida e fácil de passar batido. Ganhou um container
 * mais largo que o resto da página: a peça é para ser OLHADA, e largura é o que
 * dá tempo de olhar.
 *
 * O halo atrás separa a demonstração do texto ao redor sem precisar de um
 * fundo diferente, que quebraria a continuidade do ambiente escuro.
 */
function PorDentro() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>E do seu lado, fica <em className="landing-serif">assim</em></h2>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            O que ele marca cai direto na agenda, e o que você atende fecha no caixa.
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.1} className="relative z-[1] mx-auto mt-12 max-w-[1360px]">
        <ProdutoDemo />
      </Reveal>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/**
 * O comparativo com o resto da categoria, como SEÇÃO.
 *
 * Estava dentro da seção de Preço, como terceiro bloco empilhado depois da
 * calculadora — ali ele lia como letra miúda de preço, e não como resposta à
 * pergunta "por que vocês e não o sistema que eu já conheço". O sócio leu a
 * página e disse exatamente isso: "já tem um negócio assim ali no meio, mas
 * não achei que ficou legal daquele jeito" (02/09).
 *
 * O título carrega o argumento inteiro, e é o único que a categoria não pode
 * copiar sem mudar o próprio modelo de cobrança: no concorrente o preço SOBE
 * quando a barbearia contrata; aqui ele DESCE. A tabela abaixo é a prova.
 *
 * Entra no lugar que a antiga seção "O mesmo dia, duas versões" deixou vago:
 * logo depois da demo do produto, antes dos depoimentos. Quem acabou de ver a
 * tela funcionando é quem está pronto para perguntar quanto custa e por que
 * não o outro.
 */
function ComoCobramos() {
  return (
    <section className={`${SECAO_APOIO} bg-[var(--l-canvas)]`}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>
            Contratar barbeiro devia sair mais <em className="landing-serif">barato</em>, não mais
            caro
          </h2>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            Nos sistemas por mensalidade, cada profissional novo sobe o plano de faixa. Aqui é o
            contrário: quanto mais a equipe agenda, menor fica o preço de cada agendamento.
          </p>
        </Reveal>

        {/*
          O gráfico vem ANTES da tabela: ele entrega o argumento em um
          segundo, e quem quiser conferir linha a linha continua com a tabela
          logo abaixo. Na ordem inversa, a tabela cobra leitura de quem ainda
          não sabe por que deveria ler.
        */}
        <Reveal delay={0.1} className="mt-11">
          <GraficoPreco />
        </Reveal>

        <Reveal delay={0.14} className="mt-10">
          <Comparativo />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const PASSOS = [
  {
    titulo: 'Crie sua conta',
    texto: 'E-mail e senha. Confirma pelo e-mail e já entra.',
    visual: CampoMini,
  },
  {
    titulo: 'Conecte seu WhatsApp',
    texto: 'Leia o código com o celular da barbearia — o mesmo número que seus clientes já usam.',
    visual: QrMini,
  },
  {
    titulo: 'Ajuste o que não servir',
    texto: 'A barbearia já vem com horário e serviços preenchidos. Você muda em dois minutos.',
    visual: ServicoMini,
  },
]

/**
 * Os três passos, com o trilho preenchendo conforme a pessoa desce.
 *
 * Ver o quanto falta para o fim é o que faz alguém terminar: um passo que já
 * está pela metade motiva mais do que três passos parados. O trilho preenche em
 * `scaleY` e não em `height` para não recalcular layout a cada quadro de scroll.
 */
function ComoComeca() {
  const ref = useRef<HTMLOListElement>(null)
  const semMovimento = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 78%', 'end 65%'],
  })
  const preenchimento = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    restDelta: 0.001,
  })

  return (
    <section className={`${SECAO_APOIO} bg-[var(--l-canvas)]`}>
      <div className={`${CAIXA} grid gap-12 lg:grid-cols-[0.8fr_1.2fr]`}>
        <Reveal>
          <h2 className={TITULO_APOIO}>Como <em className="landing-serif">começa</em></h2>
          <p className="mt-6 max-w-[34ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            Três passos. O mais demorado leva dois minutos.
          </p>
        </Reveal>

        <ol ref={ref} className="relative flex flex-col">
          {/* Trilho de fundo e trilho preenchido, um sobre o outro. */}
          <span className="absolute bottom-10 left-[19px] top-10 w-px bg-[var(--l-line)]" />
          <motion.span
            className="absolute bottom-10 left-[19px] top-10 w-px origin-top bg-[var(--l-accent)]"
            style={{ scaleY: semMovimento ? 1 : preenchimento }}
          />

          {PASSOS.map((passo, i) => (
            <PassoNaLinha
              key={passo.titulo}
              indice={i}
              total={PASSOS.length}
              passo={passo}
              progresso={preenchimento}
              semMovimento={!!semMovimento}
            />
          ))}
        </ol>
      </div>
    </section>
  )
}

function PassoNaLinha({
  indice,
  total,
  passo,
  progresso,
  semMovimento,
}: {
  indice: number
  total: number
  passo: (typeof PASSOS)[number]
  progresso: ReturnType<typeof useSpring>
  semMovimento: boolean
}) {
  // O passo acende quando o preenchimento chega nele. Como opacidade de uma
  // camada por cima, e não troca de classe: assim o valor contínuo do scroll
  // não vira estado do React.
  const inicio = indice / total
  const aceso = useTransform(progresso, [inicio, inicio + 0.5 / total], [0, 1])

  return (
    <li className="relative flex gap-6 pb-11 last:pb-0">
      <span className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--l-line-strong)] bg-[var(--l-bg)] text-[14px] font-bold text-[var(--l-fg-mute)]">
        {indice + 1}
        <motion.span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--l-accent)] text-[var(--l-on-accent)]"
          style={{ opacity: semMovimento ? 1 : aceso }}
        >
          {indice + 1}
        </motion.span>
      </span>
      {/*
        Texto e peça lado a lado a partir de `sm`: empilhados, os três visuais
        empurram o passo seguinte para fora da tela e o trilho vira um rolo
        comprido. Lado a lado, o passo continua cabendo de uma olhada só.
      */}
      <div className="flex flex-1 flex-col gap-4 pt-1.5 sm:flex-row sm:items-start sm:gap-7">
        <div className="flex-1">
          <div className="text-[19px] font-semibold tracking-[-0.015em] text-[var(--l-fg)]">
            {passo.titulo}
          </div>
          <p className="mt-2.5 max-w-[42ch] text-[15px] leading-relaxed text-[var(--l-fg-mute)]">
            {passo.texto}
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-[188px]">
          <passo.visual />
        </div>
      </div>
    </li>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * O número que a gente não vai prometer.
 *
 * Todo concorrente da categoria lidera com "reduza até X% das faltas", e o X
 * escala de 50 a 90 conforme a página. Nenhum publica de onde saiu, e o "até"
 * é a palavra que deixa dizer 70 quando o real foi 4.
 *
 * Recusar esse número parecia fraqueza nossa, porque a página ficava sem prova.
 * É o contrário: num mercado onde todos gritam um percentual inventado, ser o
 * único que não grita é a coisa mais distinta que dá para fazer. E a
 * calculadora entrega a alternativa honesta na mesma tela, senão a recusa
 * ficaria sendo só crítica sem oferta.
 *
 * Nenhum concorrente é citado pelo nome de propósito. A afirmação é sobre a
 * prática da categoria, que é verificável em qualquer busca, e não sobre uma
 * empresa específica.
 */
function SemPromessa() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>Não vamos <em className="landing-serif">prometer</em> 70%</h2>
          <div className="mt-7 flex max-w-[54ch] flex-col gap-5 text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            <p>
              Você vai ver esse número por aí, e as variações dele: menos 50%, menos 70%, menos 90%
              de falta. Pergunte de onde saiu.
            </p>
            <p>
              A gente não tem esse número. Ninguém mediu a sua barbearia, e o que acontece numa não
              acontece igual na outra. O que dá para fazer é a conta com os seus números.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <Calculadora />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * O que está incluso, sem separação de nível.
 *
 * Até 2026-08-21 a página vendia dois planos (Básico/Pro) porque a
 * mensalidade fixa precisava de uma régua para justificar o preço maior.
 * Cobrando por agendamento, cada barbearia já paga proporcional ao próprio
 * uso — não tem mais sentido também prender o lembrete de confirmação atrás
 * de um degrau de preço; unificar os dois planos que existiam num serviço
 * completo é mais simples e mais honesto do que manter uma divisão que só
 * fazia sentido com mensalidade.
 */
/**
 * O que está incluso, em chip.
 *
 * Eram seis frases inteiras numa lista de duas colunas — 46 palavras que
 * ninguém lê linha a linha nesse ponto da página, porque a pessoa já
 * decidiu que quer saber o preço. Em chip, a mesma informação se lê de
 * relance: o que importa aqui é a QUANTIDADE de coisas inclusas, não a
 * redação de cada uma. O detalhe de cada recurso já está lá em cima.
 */
const RECURSOS_INCLUSOS = [
  'WhatsApp que você já usa',
  'Agenda e clientes',
  'Caixa e comissão',
  'Seus serviços e preços',
  'Lembrete 1h antes',
  'Confirmação 10 min antes',
]

function Preco() {
  return (
    <section id="preco" className={`${SECAO} secao-ancora`}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_DECISAO}>Quanto <em className="landing-serif">custa</em></h2>
          {/* A âncora, no lugar da antiga comparação com um concorrente de
              R$49/mês: essa comparação não sobrevive à mudança de cobrança,
              porque não tem mais mensalidade nenhuma para comparar. */}
          <p className="mt-7 max-w-[28ch] text-[clamp(1.4rem,2.8vw,2rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--l-fg)]">
            Sem mensalidade. Você paga só quando funciona.
          </p>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            Mês fraco, quase não paga nada. Mês cheio, você também está faturando mais — o custo
            acompanha o resultado, não o contrário.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-11">
          <div className="card rounded-[var(--r-md)] p-8 sm:p-10">
            <div className="landing-label text-[var(--l-fg-mute)]">Você paga por horário marcado</div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-[19px] text-[var(--l-fg-mute)]">R$</span>
              <span className="landing-num text-[52px] text-[var(--l-fg)]">
                {PRECO_POR_AGENDAMENTO.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-[15px] text-[var(--l-fg-faint)]">/ agendamento confirmado</span>
            </div>
            {/* Sem taxa de setup confirmado: não é uma ressalva escondida em
                letra miúda, é a segunda coisa que a pessoa lê. */}
            <p className="mt-3 text-[14px] text-[var(--l-fg-faint)]">
              Sem mensalidade. Sem taxa de setup.{' '}
              <span className="landing-serif text-[var(--l-fg-mute)]">
                80 horários no mês custam R$ 60 — menos que um corte com barba.
              </span>
            </p>
            {/* A escada anda na direção OPOSTA à da categoria: nos sistemas
                por mensalidade cada profissional a mais sobe o plano; aqui a
                equipe maior paga MENOS por agendamento. É o argumento do
                comparativo logo abaixo, anunciado onde o preço aparece. */}
            <p className="mt-2 text-[14px] text-[var(--l-fg-faint)]">
              Equipe maior paga menos: o preço cai por faixa, até R$ 0,60 por agendamento.
            </p>

            <ul className="mt-9 flex flex-wrap gap-2">
              {RECURSOS_INCLUSOS.map((i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-full border border-[var(--l-line)] bg-[var(--l-bg)] py-2 pl-2.5 pr-4 text-[14px] text-[var(--l-fg-mute)]"
                >
                  <Check
                    size={15}
                    strokeWidth={2.5}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--l-accent-ink)]"
                  />
                  {i}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={0.14} className="mt-9">
          <CalculadoraPreco />
        </Reveal>

        <Reveal delay={0.18}>
          <Cta className="mt-14" microcopy={`${MICROCOPY} No teste você usa tudo, sem custo.`}>
            {CTA}
          </Cta>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const PERGUNTAS = [
  [
    'Preciso de um número novo de WhatsApp?',
    'Não. Você usa o número que a barbearia já tem. É só ler um QR code, como no WhatsApp Web.',
  ],
  [
    'E se eu quiser responder eu mesmo?',
    'É só responder. Ele percebe e sai da frente naquela conversa, até você devolver para ele.',
  ],
  [
    'O cliente vai perceber que é automático?',
    'Se ele perguntar, ele assume que é automático. A gente não acha certo enganar o seu cliente. Fora isso, ele escreve como gente.',
  ],
  [
    'Fico preso em contrato?',
    `Não. São ${DIAS_DE_TESTE} dias grátis sem cartão, e depois você paga só pelos horários confirmados — sem mensalidade e sem mês a cumprir. Cancela quando quiser, pelo próprio sistema.`,
  ],
  [
    'Funciona com mais de um barbeiro?',
    'Sim. Cada um tem o próprio horário e a própria comissão, e o cliente pode escolher com quem quer cortar.',
  ],
  /*
    As tres perguntas abaixo entraram porque eram as objecoes que a pagina
    deixava o leitor formular sozinho, na cabeca dele, sem ninguem para
    responder. A do preco e a mais cara: quem viu R$ 49 no concorrente e nao
    ouve nada sobre isso simplesmente fecha a aba.
  */
  [
    `Por que custa mais que os outros?`,
    'Porque não é um robô com respostas prontas. Ele entende quando o cliente muda de ideia no meio da conversa, e sai da frente sozinho quando você entra. Nos ' +
      `${DIAS_DE_TESTE} dias você compara com qualquer outro sem pagar nada.`,
  ],
  [
    'Vou perder o jeito pessoal do meu atendimento?',
    'A conversa continua sua. Ele responde o que é sempre igual — preço, horário, o que a barbearia faz — e te devolve o cliente na hora em que você entra. O papo que importa continua sendo com você.',
  ],
  [
    'E se der problema no meio do sábado?',
    'O suporte é por WhatsApp, com resposta em até 1 dia útil. E se ele parar, o WhatsApp continua sendo o seu: as mensagens chegam normalmente e você responde como sempre respondeu.',
  ],
]

function Faq() {
  return (
    <section id="duvidas" className={`${SECAO_APOIO} secao-ancora bg-[var(--l-canvas)]`}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_APOIO}>Perguntas que todo <em className="landing-serif">dono</em> faz</h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-10">
          <FaqAccordion itens={PERGUNTAS.map(([pergunta, resposta]) => ({ pergunta, resposta }))} />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function Fecho() {
  return (
    <section className="relative overflow-hidden px-6 py-[100px] text-center lg:py-[132px]">
      <div className={CAIXA}>
        <Reveal>
          <h2 className="landing-display mx-auto max-w-[17ch] text-[clamp(2.4rem,6vw,4.6rem)] text-[var(--l-fg)]">
            Amanhã às 22h alguém vai te mandar <em className="landing-serif">mensagem</em>.
          </h2>
        </Reveal>
        <Reveal delay={0.09}>
          <p className="mx-auto mt-8 max-w-[42ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)] sm:text-[19px]">
            Em {DIAS_DE_TESTE} dias dá tempo de ver seu WhatsApp responder sozinho, marcar, e o
            cliente aparecer na cadeira.
          </p>
        </Reveal>
        {/* O caminho de baixo compromisso, para quem não decide hoje: falar
            com uma pessoa. Só existe com número real no CONTATO — a mesma
            regra do rodapé: link para lugar nenhum é pior que nenhum link.
            (Auditoria 2026-08-28, gargalo 2 de conversão.) */}
        {CONTATO.whatsapp && (
          <Reveal delay={0.12}>
            <p className="mt-6 text-[14.5px] text-[var(--l-fg-mute)]">
              Prefere conversar antes?{' '}
              <a
                href={`https://wa.me/${CONTATO.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--l-accent-ink)] underline underline-offset-4"
              >
                Me chama no WhatsApp
              </a>
              . Quem responde é gente.
            </p>
          </Reveal>
        )}
        <Reveal delay={0.16}>
          <Cta className="mt-12" microcopy={MICROCOPY}>
            {CTA}
          </Cta>
        </Reveal>
      </div>
    </section>
  )
}

/**
 * Rodapé em três colunas: marca, produto e suporte.
 *
 * Os canais de contato leem de `CONTATO` e só aparecem quando o canal real
 * existe. Um "fale conosco" apontando para lugar nenhum é pior que nenhum:
 * alguém escreve, ninguém responde, e a página que promete "responde na hora"
 * vira piada.
 */
export function Rodape() {
  /* `min-h-[44px]` e o minimo de alvo de toque. Os links do rodape tinham
     21px de altura -- meio dedo. O recuo negativo mantem o alinhamento
     visual da coluna enquanto a area clicavel cresce. */
  const linkClasse =
    '-mx-2 inline-flex min-h-[44px] items-center px-2 text-[14px] text-[var(--l-fg-mute)] transition-colors duration-200 hover:text-[var(--l-fg)]'

  const suporte = [
    CONTATO.whatsapp && {
      href: `https://wa.me/${CONTATO.whatsapp}`,
      rotulo: 'Suporte no WhatsApp',
      externo: true,
    },
    CONTATO.email && { href: `mailto:${CONTATO.email}`, rotulo: CONTATO.email, externo: true },
    CONTATO.instagram && {
      href: `https://instagram.com/${CONTATO.instagram}`,
      rotulo: `@${CONTATO.instagram}`,
      externo: true,
    },
  ].filter(Boolean) as Array<{ href: string; rotulo: string; externo: boolean }>

  return (
    <footer className="relative z-[1] border-t border-[var(--l-line)] bg-[var(--l-canvas)] px-6 pb-10 pt-14">
      <div className="mx-auto grid max-w-[1180px] gap-10 sm:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-2.5 text-[16px] font-bold text-[var(--l-fg)]">
            <MarcaClubCut size={32} />
            Club Cut
          </span>
          <p className="mt-4 max-w-[30ch] text-[13.5px] leading-relaxed text-[var(--l-fg-faint)]">
            Atendimento, agenda e caixa para barbearia, no WhatsApp que ela já tem.
          </p>
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <span className="landing-label text-[var(--l-fg-faint)]">Produto</span>
          {[
            ['/criar-conta', CTA],
            ['/login', 'Entrar'],
            ['/sobre', 'Sobre'],
            ['/termos', 'Termos de uso'],
            ['/privacidade', 'Privacidade'],
          ].map(([href, rotulo]) => (
            <Link key={href} to={href} className={linkClasse}>
              {rotulo}
            </Link>
          ))}
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <span className="landing-label text-[var(--l-fg-faint)]">Suporte</span>
          {suporte.length > 0 ? (
            suporte.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className={linkClasse}
              >
                {s.rotulo}
              </a>
            ))
          ) : (
            <p className="max-w-[26ch] text-[13.5px] leading-relaxed text-[var(--l-fg-faint)]">
              O suporte é feito por WhatsApp, dentro do sistema, com resposta em até 1 dia útil.
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-[1180px] flex-wrap items-center justify-between gap-3 border-t border-[var(--l-line)] pt-6">
        <span className="landing-label text-[var(--l-fg-faint)]">
          © {new Date().getFullYear()} Club Cut
        </span>
        {/* "criado pela Aura" contradizia a própria página: Aura era o nome
            do programa de patentes, e a empresa é Aura Studio. Uma marca, uma
            assinatura. (Auditoria 2026-08-28, P0 de marca.) */}
        <span className="landing-label text-[var(--l-fg-faint)]">um produto Aura Studio</span>
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */

export function VendasPage() {
  return (
    <div className="landing min-h-[100dvh]">
      {/* Invisível até receber foco por Tab: quem navega por teclado ou
          leitor de tela pula a barra e cai direto no conteúdo. */}
      <a
        href="#conteudo"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-full bg-[var(--l-accent)] px-5 py-3 text-[14px] font-semibold text-[var(--l-on-accent)] transition-transform focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <ReguaScroll />
      <Navbar />
      <main id="conteudo">
        <Hero />
        {/* Fecha o heroi. Marca onde a barbearia comeca. */}
        <div className="regua-poste" aria-hidden="true" />
        {/* A primeira prova da pagina. Antes disso, so afirmacao nossa. */}
        <FaixaBarbearias />
        <Dor />
        <Recursos />
        <Franqueza />
        <PorDentro />
        <ComoCobramos />
        <Depoimentos />
        <ComoComeca />
        <SemPromessa />
        <Preco />
        {/* Depois do preço, de propósito: é benefício de quem JÁ decidiu
            ("e ainda tem isso"), e no meio do funil era a seção mais longa
            interrompendo o corredor prova → preço. (Auditoria 2026-08-28.) */}
        <ReconhecimentoAura />
        <Faq />
        <Fecho />
      </main>
      <div className="regua-poste" aria-hidden="true" />
      <Rodape />

      {/* Aparece depois do herói e se apaga perto de qualquer CTA de seção. */}
      <CtaFixo rotulo={CTA} microcopy={MICROCOPY} />
      <WhatsAppPopup />
    </div>
  )
}
