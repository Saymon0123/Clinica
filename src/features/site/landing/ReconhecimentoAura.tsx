import { Reveal, RevealGrupo, RevealItem } from './primitivos'

/**
 * O programa de patentes Aura.
 *
 * Adaptado de um mockup de referência (não é a página original) para os
 * tokens e o vocabulário visual já em uso aqui: fundo `--l-canvas` que já
 * embala o comparativo e os depoimentos ao redor, `landing-serif` no
 * destaque do título, `landing-label` nas etiquetas, mesma borda de cartão
 * usada no resto da página.
 *
 * **Fica entre os depoimentos e "como começa" de propósito.** É a última
 * peça antes do CTA de criar conta: depois de ver quem já usa (a faixa) e o
 * que essas pessoas dizem (os depoimentos), esta seção mostra o que a
 * barbearia ganha por continuar — antes do "como começa" levar a pessoa
 * para a ação.
 *
 * **A cor dourada da patente General não é um token da paleta.** É a única
 * exceção de cor na página inteira, e existe porque a moldura dourada é o
 * objeto físico de verdade — a mesma lógica do ouro em qualquer sistema de
 * medalhas: reservado para o topo, e só para ele.
 *
 * **Sem link "veja como funciona".** O mockup original tinha um `href="#"`
 * que não levava a lugar nenhum. Um link morto é pior que nenhum link — a
 * seção termina na régua de benefícios e deixa o CTA para "como começa",
 * que já vem na sequência.
 *
 * **Cada patente soma, não substitui.** A régua listava só o benefício
 * NOVO de cada patente, sem dizer se ele troca o da anterior ou se acumula.
 * O rótulo `+` antes de cada benefício e a frase de abertura resolvem isso:
 * virar General significa ter o que o Capitão tem, mais o que é só do
 * General — nenhuma barbearia perde o relatório mensal ao subir de patente.
 */
const PATENTES = [
  {
    nome: 'Recruta',
    cor: 'text-[var(--l-fg-faint)]',
    beneficio:
      'Relatório automático mensal de performance: faturamento, recorrência e horários ociosos.',
  },
  {
    nome: 'Sargento',
    cor: 'text-[var(--l-fg-mute)]',
    beneficio:
      'Auditoria trimestral de agenda feita pelo time Aura, apontando onde estão os furos e as oportunidades.',
  },
  {
    nome: 'Capitão',
    cor: 'text-[var(--l-accent-ink)]',
    beneficio:
      'Acesso beta a novas automações antes do lançamento geral, e prioridade pra sugerir o que vem a seguir.',
  },
  {
    nome: 'General',
    // Única cor fora da paleta da página — ver nota no topo do arquivo.
    cor: 'text-[#d4af5a]',
    beneficio:
      'Consultoria trimestral com os fundadores, sua barbearia em destaque nas nossas redes, e comissão por indicação.',
  },
] as const

export function ReconhecimentoAura() {
  return (
    <section className="relative overflow-hidden bg-[var(--l-canvas)] px-6 py-[64px] lg:py-[84px]">
      <div className="relative z-[1] mx-auto max-w-[1100px]">
        <Reveal>
          <p className="landing-label text-[var(--l-accent-ink)]">Reconhecimento Aura</p>
          <h2 className="landing-display mt-4 max-w-[18ch] text-[clamp(1.75rem,3.6vw,2.75rem)] text-[var(--l-fg)]">
            Sua barbearia tem um nome.
            <br />
            Agora ela também tem <em className="landing-serif">uma patente.</em>
          </h2>
          <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            Cada barbearia que evolui com a Aura sobe de patente — e ganha uma placa física pra
            provar. Não é sobre quem fatura mais. É sobre quem cresce de verdade.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-11">
          <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line)]">
            <img
              src="/patentes-aura.jpg"
              alt="Quatro placas de reconhecimento em degradê: Recruta, Sargento, Capitão e General, cada uma com uma estrela e a moldura mais nobre conforme a patente sobe."
              className="block w-full"
              loading="lazy"
              decoding="async"
            />
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-[var(--l-fg-faint)]">
            <strong className="font-medium text-[var(--l-fg-mute)]">
              Recruta. Sargento. Capitão. General.
            </strong>{' '}
            Cada patente é uma placa de verdade, na parede de verdade da sua barbearia.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--l-fg-faint)]">
            E os benefícios sobem junto: cada patente nova soma aos benefícios das anteriores —
            nada do que veio antes some.
          </p>
        </Reveal>

        {/*
          Grade com "gap preenchido": o container pinta a cor da linha e cada
          célula cobre por cima com o próprio fundo, deixando só 1px de vão
          à mostra. Em vez de bordas condicionais por índice — que quebram
          toda vez que o número de colunas muda de 1 para 2 para 4 conforme
          a largura da tela — o vão sozinho já desenha a divisória certa em
          qualquer contagem de colunas, sem lógica nenhuma.
        */}
        <RevealGrupo
          className="mt-9 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line)] bg-[var(--l-line)] sm:grid-cols-2 lg:grid-cols-4"
          intervalo={0.08}
        >
          {PATENTES.map((p) => (
            <RevealItem key={p.nome}>
              <div className="h-full bg-[var(--l-bg)] p-6">
                <div className={`landing-label mb-3.5 ${p.cor}`}>{p.nome}</div>
                <p className="text-[14px] leading-relaxed text-[var(--l-fg-mute)]">
                  {/* O "+" é o que diz "soma", não "troca" — sem ele a régua lê como
                      quatro planos concorrentes, e não como uma escada. */}
                  <span aria-hidden="true" className={`mr-1 font-semibold ${p.cor}`}>
                    +
                  </span>
                  {p.beneficio}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGrupo>
      </div>
    </section>
  )
}
