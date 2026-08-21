import { useState } from 'react'
import { PRECO_POR_AGENDAMENTO } from '../../../lib/planos'
import { Controle, ValorAnimado, moeda, moedaComCentavos } from './Calculadora'

/**
 * A conta da cobrança por uso.
 *
 * Reaproveita o mesmo padrão de slider + valor animado da calculadora da
 * seção "Não vamos prometer 70%" (`Controle`, `ValorAnimado`, `moeda`) — não
 * um componente novo do zero, para as duas calculadoras da página lerem como
 * a mesma peça em dois lugares, e não como dois estilos concorrentes.
 *
 * **Só um controle, e não dois.** A calculadora da cadeira vazia tem duas
 * variáveis porque o dono não sabe de cabeça o total; aqui só uma entra —
 * quantos agendamentos por mês — porque o preço por unidade é fixo e
 * conhecido (R$0,85), então o segundo controle seria redundante.
 *
 * **A referência de "corte simples" é nomeada, não flutuante.** Dizer
 * "menos que 2% de um corte" sem dizer de quanto é o corte seria o mesmo
 * número solto que a página recusa em "Não vamos prometer 70%". Aqui o
 * valor de referência (R$50) aparece explícito ao lado da porcentagem.
 */
const MIN_AGENDAMENTOS = 20
const MAX_AGENDAMENTOS = 400
const PASSO_AGENDAMENTOS = 10

/** Preço de um corte simples usado só para dar escala à porcentagem — não é
 *  o preço médio real de nenhuma barbearia, e o texto deixa isso nomeado. */
const CORTE_SIMPLES_REFERENCIA = 50

const PORCENTAGEM_DO_CORTE = Math.ceil((PRECO_POR_AGENDAMENTO / CORTE_SIMPLES_REFERENCIA) * 100)

export function CalculadoraPreco() {
  const [agendamentos, setAgendamentos] = useState(80)

  const custoEstimado = agendamentos * PRECO_POR_AGENDAMENTO

  return (
    <div className="card rounded-[var(--r-md)] p-7 sm:p-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <div className="flex flex-col justify-center gap-8">
          <Controle
            rotulo="Agendamentos confirmados por mês"
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
            Isso equivale a {moedaComCentavos(PRECO_POR_AGENDAMENTO)} por agendamento — menos que{' '}
            {PORCENTAGEM_DO_CORTE}% do valor de um corte simples de {moeda(CORTE_SIMPLES_REFERENCIA)}.
          </p>
        </div>
      </div>
    </div>
  )
}
