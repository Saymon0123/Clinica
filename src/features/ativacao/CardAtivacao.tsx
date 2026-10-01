import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Rocket, X } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useAtivacao } from './useAtivacao'
import { BarraProgresso } from '../../components/Pessoa'

/**
 * Checklist do que falta para a barbearia funcionar de verdade.
 *
 * **Flutuante, no canto superior direito, e recolhido por padrão** (pedido do
 * dono em 30/09). Antes era um cartão largo no topo da Agenda, empurrando a
 * grade — que é a tela — para baixo. Agora é uma pílula que não disputa espaço
 * com o dia de trabalho e abre em um toque.
 *
 * **Some sozinho quando tudo está feito**: checklist que fica para sempre vira
 * decoração, e decoração a pessoa aprende a ignorar.
 *
 * Continua sem botão de dispensar, e isso é de propósito: recolher é diferente
 * de sumir. Com o WhatsApp desconectado o produto não faz nada, e esconder isso
 * não ajuda ninguém. O jeito de tirar da tela é resolver.
 */

const CHAVE = 'clubcut:ativacao-aberto'

function leAberto(): boolean {
  // Pode estourar em aba anônima ou com dados do site bloqueados; recolhido é
  // o padrão seguro, porque não cobre nada.
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
    /* sem storage: a escolha vale só para esta visita, e tudo bem */
  }
}

export function CardAtivacao() {
  const { salonId, isManager } = useSalon()
  const { itens, pendentes, completo, loading } = useAtivacao(salonId)
  const [aberto, setAberto] = useState(leAberto)

  // Barbeiro não configura nada disso; mostrar só geraria ansiedade sem ação.
  if (!isManager || loading || completo || itens.length === 0) return null

  const feitos = itens.length - pendentes.length

  function alternar(v: boolean) {
    setAberto(v)
    gravaAberto(v)
  }

  return (
    // `fixed` abaixo do cabeçalho e acima do conteúdo, mas sob os modais (que
    // usam z-50): a pílula não pode ficar por cima de uma confirmação.
    <div className="fixed right-3 top-16 z-30 lg:right-6 lg:top-20 print:hidden">
      {aberto ? (
        <div className="w-[min(20rem,calc(100vw-1.5rem))] bg-surface border border-warning/40 rounded-2xl shadow-lg p-4">
          <div className="flex items-start gap-2.5 mb-1">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-warning-soft text-warning shrink-0">
              <Rocket size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">Falta pouco para começar</h2>
              <p className="text-xs text-muted-foreground">
                {feitos} de {itens.length} prontos
              </p>
            </div>
            <button
              onClick={() => alternar(false)}
              aria-label="Recolher os passos"
              className="btn-chip shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-3">
            <BarraProgresso
              porcentagem={(feitos / itens.length) * 100}
              rotulo={`${feitos} de ${itens.length} passos prontos`}
            />
          </div>

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
                  <Link
                    to={item.rota}
                    onClick={() => alternar(false)}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors group"
                  >
                    <span className="w-5 h-5 rounded-full border-2 border-border-strong shrink-0" />
                    <span className="min-w-0 flex-1">
                      {/* O "por quê" é o que faz a pessoa clicar. "Definir a
                          comissão" é tarefa; "sem isso o Financeiro do barbeiro
                          mostra zero" é motivo. */}
                      <span className="block text-sm font-medium text-foreground">{item.titulo}</span>
                      <span className="block text-xs text-muted-foreground">{item.porque}</span>
                    </span>
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground group-hover:text-foreground shrink-0"
                    />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        // Recolhido: âmbar, porque há coisa faltando. Quando não houver, o
        // componente inteiro já terá sumido -- então esta cor só existe no
        // estado em que ela significa alguma coisa.
        <button
          onClick={() => alternar(true)}
          className="flex items-center gap-2 rounded-full bg-warning-soft text-warning border border-warning/40 shadow-md pl-2.5 pr-3 py-1.5 text-xs font-medium hover:brightness-95 transition"
        >
          <Rocket size={14} className="shrink-0" />
          {pendentes.length} {pendentes.length === 1 ? 'passo restante' : 'passos restantes'}
        </button>
      )}
    </div>
  )
}
