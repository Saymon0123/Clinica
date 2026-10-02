import { useState } from 'react'
import { Check, ChevronRight, Scissors, UserCheck, X } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useMinhaFicha } from './useMinhaFicha'
import { HorarioBarbeiroModal } from '../equipe/HorarioBarbeiroModal'
import { ServicosBarbeiroModal } from '../equipe/ServicosBarbeiroModal'

/**
 * A primeira entrada do barbeiro: confirmar o que o convite chutou por ele.
 *
 * Quando alguém aceita um convite, o `accept-invite` entrega a cadeira
 * **configurada por suposição**: todos os serviços ativos ligados, e a jornada
 * derivada do horário de funcionamento da barbearia. É generoso para destravar
 * e errado na prática -- o agente passa a oferecer esse barbeiro para serviço
 * que ele não faz, em horário que ele não trabalha, e o cliente marca.
 *
 * Então isto não é tour: são **duas confirmações**, e elas desaparecem quando
 * feitas. As marcas vêm de `servicos_confirmados_em` (0200) e
 * `jornada_confirmada_em` (0201) -- sem elas os dois itens nasceriam riscados,
 * porque os dados já existem.
 *
 * ## Por que abre modal em vez de levar para a aba Equipe
 *
 * O barbeiro **não tem a rota `/equipe`** (`somenteGestor` no AppLayout). Mandar
 * ele para lá seria mandar para uma tela que não abre.
 *
 * ## Por que só para quem NÃO é gestor
 *
 * O dono costuma ter cadeira também, e veria dois cartões flutuantes no mesmo
 * canto, um por cima do outro. Para ele os dois modais já existem na aba Equipe,
 * e o `CardAtivacao` já cobra jornada e comissão de **todo** profissional ativo.
 *
 * Visual copiado do `CardAtivacao` de propósito: mesma pílula, mesmo canto,
 * recolhido por padrão, e some sozinho quando não há mais nada a fazer.
 */

const CHAVE = 'clubcut:primeira-entrada-aberto'

function leAberto(): boolean {
  // Pode estourar em aba anônima ou com dados do site bloqueados; recolhido é o
  // padrão seguro, porque não cobre nada da agenda.
  try {
    return localStorage.getItem(CHAVE) === 'sim'
  } catch {
    return false
  }
}

function gravaAberto(v: boolean) {
  try {
    localStorage.setItem(CHAVE, v ? 'sim' : 'nao')
  } catch {
    /* sem storage: a escolha vale só para esta visita */
  }
}

export function CardDoBarbeiro() {
  const { salonId, isManager } = useSalon()
  const { ficha, loading, erro, reload } = useMinhaFicha(salonId)
  const [aberto, setAberto] = useState(leAberto)
  const [abrindo, setAbrindo] = useState<'jornada' | 'servicos' | null>(null)

  const pendentes = ficha
    ? [
        ...(ficha.jornada_confirmada_em ? [] : ['jornada' as const]),
        ...(ficha.servicos_confirmados_em ? [] : ['servicos' as const]),
      ]
    : []

  // `erro` cala o cartão: pedir confirmação porque a rede caiu é pior do que não
  // pedir nada. E gestor não vê (ver o comentário do topo).
  if (isManager || loading || erro || !ficha || pendentes.length === 0) return null

  function alternar(v: boolean) {
    setAberto(v)
    gravaAberto(v)
  }

  const primeiroNome = ficha.nome.split(' ')[0]

  const itens = [
    {
      id: 'jornada' as const,
      titulo: 'Confirmar seus dias e horários',
      porque:
        'Hoje está valendo o horário da barbearia inteira. Enquanto você não ajustar, pode aparecer horário seu em dia de folga.',
      feito: Boolean(ficha.jornada_confirmada_em),
    },
    {
      id: 'servicos' as const,
      titulo: 'Confirmar o que você faz',
      porque:
        'Você entrou fazendo todos os serviços do catálogo. Desmarque o que não é seu para não ser agendado nele.',
      feito: Boolean(ficha.servicos_confirmados_em),
    },
  ]

  const feitos = itens.filter((i) => i.feito).length

  return (
    <>
      {/* `fixed` abaixo do cabeçalho e acima do conteúdo, mas sob os modais (que
          usam z-50): a pílula não pode ficar por cima de uma confirmação. */}
      <div className="fixed right-3 top-16 z-30 lg:right-6 lg:top-20 print:hidden">
        {aberto ? (
          <div className="w-[min(20rem,calc(100vw-1.5rem))] bg-surface border border-warning/40 rounded-2xl shadow-lg p-4">
            <div className="flex items-start gap-2.5 mb-1">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-warning-soft text-warning shrink-0">
                <UserCheck size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">
                  Bem-vindo, {primeiroNome}!
                </h2>
                <p className="text-xs text-muted-foreground">
                  {feitos} de {itens.length} confirmados
                </p>
              </div>
              <button
                onClick={() => alternar(false)}
                aria-label="Recolher as confirmações"
                className="btn-chip shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Quando você entrou, o sistema preencheu sua agenda por suposição. Confirme as duas
              coisas abaixo e ela passa a ser a sua.
            </p>

            <ul className="mt-3 space-y-1.5">
              {itens.map((item) => (
                <li key={item.id}>
                  {item.feito ? (
                    <div className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-success-soft text-success flex items-center justify-center shrink-0">
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <span className="line-through">{item.titulo}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAbrindo(item.id)
                        alternar(false)
                      }}
                      className="btn-ghost w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left group"
                    >
                      <span className="w-5 h-5 rounded-full border-2 border-border-strong shrink-0" />
                      <span className="min-w-0 flex-1">
                        {/* O "por quê" é o que faz a pessoa clicar: "confirmar
                            seus horários" é tarefa; "pode aparecer horário seu
                            em dia de folga" é motivo. */}
                        <span className="block text-sm font-medium text-foreground">
                          {item.titulo}
                        </span>
                        <span className="block text-xs text-muted-foreground">{item.porque}</span>
                      </span>
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground group-hover:text-foreground shrink-0"
                      />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {/* Orientação, não tarefa: aparece enquanto ele é novo, que é quando
                importa, e vai embora com o cartão. A comissão continua no
                Financeiro depois disso. */}
            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
              <p className="text-xs text-muted-foreground">
                <Scissors size={11} className="inline mr-1 -mt-0.5" />
                Sua comissão é{' '}
                <strong className="font-medium text-foreground">
                  {ficha.comissao_percentual == null
                    ? 'combinada com o dono — ainda não está no sistema'
                    : `${ficha.comissao_percentual.toLocaleString('pt-BR')}%`}
                </strong>
                . Quem muda isso é o dono.
              </p>
              <p className="text-xs text-muted-foreground">
                No Financeiro você vê <strong className="font-medium text-foreground">a sua
                comissão e os seus clientes</strong> — não o faturamento da barbearia.
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={() => alternar(true)}
            className="flex items-center gap-2 rounded-full bg-warning-soft text-warning border border-warning/40 shadow-md pl-2.5 pr-3 py-1.5 text-xs font-medium hover:brightness-95 transition"
          >
            <UserCheck size={14} className="shrink-0" />
            {pendentes.length === 1 ? '1 coisa para confirmar' : '2 coisas para confirmar'}
          </button>
        )}
      </div>

      {abrindo === 'jornada' && (
        <HorarioBarbeiroModal
          professionalId={ficha.id}
          nome={ficha.nome}
          onClose={() => {
            setAbrindo(null)
            // A marca só existe depois do save; reler é o que risca o item.
            reload()
          }}
        />
      )}

      {abrindo === 'servicos' && salonId && (
        <ServicosBarbeiroModal
          professionalId={ficha.id}
          salonId={salonId}
          nome={ficha.nome}
          confirmadoEm={ficha.servicos_confirmados_em}
          onSalvo={reload}
          onClose={() => setAbrindo(null)}
        />
      )}
    </>
  )
}
