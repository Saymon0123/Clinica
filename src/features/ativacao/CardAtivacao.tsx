import { Link } from 'react-router-dom'
import { Check, ChevronRight, Rocket } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useAtivacao } from './useAtivacao'
import { BarraProgresso } from '../../components/Pessoa'

/**
 * Checklist do que falta para a barbearia funcionar de verdade.
 *
 * Fica na Agenda porque é onde o dono cai ao entrar, e **some sozinho** quando
 * tudo está feito — checklist que fica para sempre vira decoração, e decoração
 * a pessoa aprende a ignorar.
 *
 * Não tem botão de dispensar de propósito: o que está aqui não é sugestão. Com
 * o WhatsApp desconectado o produto não faz nada, e esconder isso não ajuda
 * ninguém. O jeito de tirar da tela é resolver.
 */
export function CardAtivacao() {
  const { salonId, isManager } = useSalon()
  const { itens, pendentes, completo, loading } = useAtivacao(salonId)

  // Barbeiro não configura nada disso; mostrar só geraria ansiedade sem ação.
  if (!isManager || loading || completo || itens.length === 0) return null

  const feitos = itens.length - pendentes.length

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sm p-5 mb-5">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-soft text-primary-soft-foreground shrink-0">
          <Rocket size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Falta pouco para começar</h2>
          <p className="text-xs text-muted-foreground">
            {feitos} de {itens.length} prontos
          </p>
        </div>
      </div>

      {/* Barra fina (leva C): o "X de Y" já existia como texto; a barra dá a
          leitura de relance, sem número novo. */}
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
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors group"
              >
                <span className="w-5 h-5 rounded-full border-2 border-border-strong shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{item.titulo}</span>
                  {/* O "por quê" é o que faz a pessoa clicar. "Definir a
                      comissão" é tarefa; "sem isso o Financeiro do barbeiro
                      mostra zero" é motivo. */}
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
  )
}
