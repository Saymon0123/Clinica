import { Check, Minus } from 'lucide-react'
import type { Assinatura } from './useAssinatura'

/**
 * O que o plano do salão inclui.
 *
 * Existe porque a diferença entre Básico e Pro era invisível: o dono via o nome
 * do plano e o preço, e nada explicando o que um tem a mais. Quem estivesse no
 * Básico não tinha como descobrir o que estava perdendo, nem quem estivesse no
 * Pro tinha como saber pelo que pagava a mais.
 *
 * A lista mostra **só o que existe de verdade hoje**. Site ligado ao Google e
 * recuperação de clientes antigos estão na visão do produto e são vendidos como
 * Pro, mas ainda não foram construídos — anunciá-los aqui seria prometer o que o
 * sistema não entrega.
 */
const RECURSOS = [
  { nome: 'Agenda, clientes e financeiro', soPro: false },
  { nome: 'Atendimento pelo agente no WhatsApp', soPro: false },
  { nome: 'Lembrete 1h antes do horário', soPro: true },
  { nome: 'Confirmação de chegada 10 min antes', soPro: true },
]

export function RecursosDoPlano({ assinatura }: { assinatura: Assinatura }) {
  const { incluiAutomacoes, planoNome } = assinatura

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">O que o {planoNome} inclui</h2>

      <ul className="space-y-2">
        {RECURSOS.map((recurso) => {
          const tem = !recurso.soPro || incluiAutomacoes
          return (
            <li key={recurso.nome} className="flex items-start gap-2 text-sm">
              {tem ? (
                <Check size={16} className="shrink-0 mt-0.5 text-success" />
              ) : (
                <Minus size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
              )}
              <span className={tem ? 'text-foreground' : 'text-muted-foreground'}>
                {recurso.nome}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Sem isto o dono no Básico vê dois itens apagados e não sabe o que
          fazer a respeito. Aponta para o bloco de troca logo abaixo. */}
      {!incluiAutomacoes && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          Os lembretes automáticos fazem parte do plano Pro — dá para mudar aqui embaixo, pagando
          só a diferença dos dias que faltam.
        </p>
      )}
    </div>
  )
}
