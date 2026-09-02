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
 * Reconferido em 2026-09-02, quando esta tabela deixou de ser um bloco dentro
 * da seção de preço e virou seção própria: mais gente lê, então o número
 * precisa estar mais certo, não menos.
 *
 *   - AppBarber ("Planos e Preços do Sistema", página pública de ajuda):
 *     R$ 79,90/mês para 1 profissional, R$ 109,90 para 2, R$ 164,50 para 3 e
 *     R$ 219,90 a partir de 4 — confirmado sem alteração desde 2026-08-25.
 *     É a escada que a tabela usa, e ela é o argumento: o preço SOBE a cada
 *     contratação.
 *
 * **O "até R$ 299" saiu.** Vinha da página da BestBarbers em 2026-08-25 e não
 * foi possível reconfirmar em 2026-09-02 (a página não expõe mais o valor na
 * busca pública). Número que não dá para reconferir não fica numa página que
 * cobra honestidade dos outros — a faixa agora vai só até onde a fonte viva
 * sustenta. Se reencontrar o preço publicado, dá para reabrir a faixa.
 *
 * A página NÃO cita os nomes porque preço de concorrente muda sem avisar, e
 * um número velho com nome em cima vira propaganda enganosa — o rodapé da
 * tabela diz de onde a faixa veio e quando foi consultada. Se for atualizar,
 * consultar as páginas de novo e trocar a data.
 * ────────────────────────────────────────────────────────────────────────────
 */
/*
  Quatro linhas, não cinco. "Mês fraco: paga o mesmo / paga quase nada" saiu:
  era a mesma ideia de "como cobra", dita de novo com outras palavras, e
  diluía justamente a linha que ninguém pode copiar sem trocar o próprio
  modelo — a de que o preço cai quando a equipe cresce.
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
    criterio: 'WhatsApp, lembrete, extras',
    mensalidade: 'Muitas vezes é módulo cobrado à parte',
    clubcut: 'Tudo incluso desde o primeiro agendamento',
  },
  {
    criterio: 'Quanto custa',
    mensalidade: 'De R$ 79,90 a R$ 219,90 por mês, conforme a equipe',
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
          . Preço do sistema por mensalidade levantado da página pública de preços de um dos mais
          conhecidos da categoria, reconferido em setembro de 2026.
        </p>
      </div>
    </div>
  )
}
