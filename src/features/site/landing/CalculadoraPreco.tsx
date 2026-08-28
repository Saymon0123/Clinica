import { useState } from 'react'
import { PRECO_POR_AGENDAMENTO } from '../../../lib/planos'
import { Controle, ValorAnimado, moedaComCentavos } from './Calculadora'

/**
 * A conta da cobrança por uso.
 *
 * Reaproveita o mesmo padrão de slider + valor animado da calculadora da
 * seção "Não vamos prometer 70%" (`Controle`, `ValorAnimado`) — não
 * um componente novo do zero, para as duas calculadoras da página lerem como
 * a mesma peça em dois lugares, e não como dois estilos concorrentes.
 *
 * **Só um controle, e não dois.** A calculadora da cadeira vazia tem duas
 * variáveis porque o dono não sabe de cabeça o total; aqui só uma entra —
 * quantos agendamentos por mês — porque o preço por unidade é fixo e
 * conhecido (R$0,75, a primeira faixa), então o segundo controle seria redundante.
 *
 * **A referência de preço é o corte com barba de R$65 da conversa do herói.**
 * Antes era um "corte simples de R$50" inventado só para dar escala; usar o
 * número que a própria página já mostra fecha o círculo e não pede fé.
 */
const MIN_AGENDAMENTOS = 20
const MAX_AGENDAMENTOS = 400
const PASSO_AGENDAMENTOS = 10

export function CalculadoraPreco() {
  const [agendamentos, setAgendamentos] = useState(80)

  const custoEstimado = agendamentos * PRECO_POR_AGENDAMENTO

  return (
    <div className="card rounded-[var(--r-md)] p-7 sm:p-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <div className="flex flex-col justify-center gap-8">
          <Controle
            rotulo="Horários confirmados por mês"
            valor={agendamentos}
            min={MIN_AGENDAMENTOS}
            max={MAX_AGENDAMENTOS}
            passo={PASSO_AGENDAMENTOS}
            aoMudar={setAgendamentos}
          />
        </div>

        <div className="flex flex-col justify-center border-t border-[var(--l-line)] pt-8 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
          <div className="landing-label text-[var(--l-fg-mute)]">Seu custo estimado</div>
          <div
            aria-live="polite"
            className="landing-num mt-3 text-[clamp(2.4rem,6vw,3.6rem)] text-[var(--l-accent-ink)]"
          >
            <ValorAnimado valor={custoEstimado} />
            <span className="ml-1.5 text-[16px] font-normal text-[var(--l-fg-faint)]">/mês</span>
          </div>

          <p className="mt-6 max-w-[36ch] text-[15px] leading-relaxed text-[var(--l-fg-mute)]">
            {/* A comparação usa 80 FIXO, e não o valor do slider: uma frase
                presa ao slider viraria mentira assim que a pessoa passasse de
                86 horários (80 × 0,75 = 60 < 65; 400 × 0,75 = 300). Número
                dinâmico pede frase dinâmica ou frase ancorada — esta é
                ancorada, e os dois números dela são verificáveis na página. */}
            Isso equivale a {moedaComCentavos(PRECO_POR_AGENDAMENTO)} por horário. Uma barbearia
            com 80 horários no mês paga R$ 60 — menos que o corte com barba de R$ 65 da conversa
            lá de cima.
          </p>
        </div>
      </div>
    </div>
  )
}
