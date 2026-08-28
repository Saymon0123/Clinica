import { Check, X } from 'lucide-react'
import {
  FAIXAS_DE_USO,
  PRECO_MINIMO_POR_AGENDAMENTO,
  PRECO_POR_AGENDAMENTO,
} from '../../../lib/planos'
import { moedaComCentavos } from './Calculadora'

/**
 * O comparativo com o resto da categoria.
 *
 * A diferença de verdade entre o Club Cut e os sistemas conhecidos não é
 * recurso — todo mundo lista agenda, WhatsApp e comissão. É o MODELO: eles
 * cobram mensalidade que SOBE a cada profissional; aqui o preço por
 * agendamento DESCE conforme a equipe cresce. É a inversão exata, e ela é
 * verificável nas faixas do banco (migration 0097).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SÓ ENTRA NÚMERO PÚBLICO E CONFERIDO — a mesma regra dos depoimentos.
 *
 * A faixa "R$ 79,90 a R$ 299 por mês" e o exemplo de R$ 164,50 vêm de
 * páginas públicas de preço consultadas em 2026-08-25:
 *
 *   - AppBarber (central de ajuda, "Planos e Preços do Sistema"):
 *     R$ 79,90/mês para 1 profissional, R$ 109,90 para 2, R$ 164,50 para 3,
 *     R$ 219,90 para 4 — e WhatsApp/fidelidade como módulos à parte.
 *   - BestBarbers (site, "Sistema para Barbearia"): plano completo com app
 *     "a partir de R$ 299/mês".
 *   - BarbUp (blog de preços da categoria): R$ 49,90 a R$ 129,90.
 *
 * A página NÃO cita os nomes porque preço de concorrente muda sem avisar, e
 * um número velho com nome em cima vira propaganda enganosa — o rodapé da
 * tabela diz de onde a faixa veio e quando foi consultada. Se for atualizar,
 * consultar as páginas de novo e trocar a data.
 * ────────────────────────────────────────────────────────────────────────────
 */
const LINHAS = [
  {
    criterio: 'Como cobra',
    mensalidade: 'Mensalidade fixa, mesmo no mês fraco',
    clubcut: 'Por agendamento confirmado',
  },
  {
    criterio: 'Barbeiro a mais na equipe',
    mensalidade: 'O plano sobe de faixa',
    clubcut: `O preço por agendamento cai — até ${moedaComCentavos(PRECO_MINIMO_POR_AGENDAMENTO)}`,
  },
  {
    criterio: 'Mês fraco',
    mensalidade: 'Paga o mesmo',
    clubcut: 'Paga quase nada',
  },
  {
    criterio: 'WhatsApp, lembrete, extras',
    mensalidade: 'Muitas vezes é módulo cobrado à parte',
    clubcut: 'Tudo incluso desde o primeiro agendamento',
  },
  {
    criterio: 'Quanto custa',
    mensalidade: 'R$ 79,90 a R$ 299 por mês',
    clubcut: `A partir de ${moedaComCentavos(PRECO_POR_AGENDAMENTO)} por agendamento`,
  },
] as const

export function Comparativo() {
  return (
    <div className="card overflow-hidden rounded-[var(--r-md)]">
      {/* `overflow-x-auto` no invólucro da tabela, nunca na página: em tela
          estreita a tabela rola dentro do cartão e o corpo fica parado. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <caption className="sr-only">
            Comparação entre sistemas com mensalidade e a cobrança por uso do Club Cut
          </caption>
          <thead>
            <tr className="border-b border-[var(--l-line)]">
              <th scope="col" className="p-5 sm:p-6" aria-label="Critério" />
              <th
                scope="col"
                className="landing-label p-5 font-semibold text-[var(--l-fg-mute)] sm:p-6"
              >
                Sistemas com mensalidade
              </th>
              {/* A coluna do Club Cut leva o fundo de acento em alfa — é o
                  MESMO par pale/ink dos chips: informação destacada, não
                  botão. O verde sólido continua exclusivo do CTA. */}
              <th
                scope="col"
                className="landing-label bg-[var(--l-accent-pale)] p-5 font-semibold text-[var(--l-accent-ink)] sm:p-6"
              >
                Club Cut
              </th>
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((l) => (
              <tr key={l.criterio} className="border-b border-[var(--l-line)] last:border-0">
                <th
                  scope="row"
                  className="p-5 align-top text-[13.5px] font-semibold text-[var(--l-fg)] sm:p-6 sm:text-[14px]"
                >
                  {l.criterio}
                </th>
                <td className="p-5 align-top text-[14px] leading-relaxed text-[var(--l-fg-faint)] sm:p-6">
                  <span className="flex gap-2.5">
                    <X
                      size={16}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 opacity-60"
                    />
                    {l.mensalidade}
                  </span>
                </td>
                <td className="bg-[var(--l-accent-pale)] p-5 align-top text-[14px] leading-relaxed text-[var(--l-fg)] sm:p-6">
                  <span className="flex gap-2.5">
                    <Check
                      size={16}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[var(--l-accent-ink)]"
                    />
                    {l.clubcut}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--l-line)] px-5 py-5 sm:px-6">
        {/* O exemplo com conta feita: R$164,50 é o preço público de um dos
            sistemas mais conhecidos para 3 profissionais (fonte no topo do
            arquivo). 120 × 0,75 = 90. */}
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-[var(--l-fg-mute)]">
          Na prática: uma barbearia com 3 barbeiros e 120 agendamentos no mês paga{' '}
          {/* `whitespace-nowrap` nos valores: sem ele o parágrafo quebrava a
              linha entre o "R$" e o número — e um preço partido ao meio, em
              negrito, lia como texto riscado. Dinheiro não quebra de linha. */}
          <span className="landing-num whitespace-nowrap text-[var(--l-fg)]">R$ 164,50</span> num
          sistema típico por mensalidade — e{' '}
          <span className="landing-num whitespace-nowrap text-[var(--l-accent-ink)]">
            {moedaComCentavos(120 * PRECO_POR_AGENDAMENTO).replace(',00', '')}
          </span>{' '}
          aqui.
        </p>
        {/* A escada inteira, aberta: esconder as faixas e mostrar só o menor
            preço seria o "até 70%" dos concorrentes ao contrário. */}
        <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-[var(--l-fg-faint)]">
          As faixas: {FAIXAS_DE_USO.map((f) => `${f.rotulo} · ${moedaComCentavos(f.preco)}`).join(
            '  —  ',
          )}
          . Preços dos sistemas com mensalidade levantados das páginas públicas de preço dos mais
          conhecidos da categoria, em agosto de 2026.
        </p>
      </div>
    </div>
  )
}
