import { useState } from 'react'
import { CalendarOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { ErroInline } from '../../components/ErroInline'

/**
 * Quem está de folga no dia aberto — e a saída para desfazer.
 *
 * ## Por que isto existe
 *
 * A folga (0213) entrava pelo painel de conflitos e **não saía por lugar
 * nenhum**: marcar no dia errado só se consertava por SQL. Uma ação que o dono
 * pode fazer com um clique e desfazer só com ajuda não é uma ação, é uma
 * armadilha.
 *
 * ## Por que um aviso, e não um selo no cabeçalho da coluna
 *
 * O cabeçalho tem 160px e já carrega inicial, nome e o selo de inativo. A
 * confirmação em dois passos não cabe lá, e sem confirmação um toque errado
 * reabre o dia para os clientes sem o dono perceber.
 *
 * A coluna cinza continua sendo o sinal visual — ela vem de graça, porque
 * `null` na jornada já significava folga na agenda. Este aviso é quem **diz o
 * nome** de quem está de folga e o que isso causa: a coluna cinza sozinha não
 * distingue folga de "não trabalha nesse dia da semana".
 *
 * ## Dois passos, como em `LinhaDeExcluir`
 *
 * Remover a folga **devolve o dia aos clientes** na mesma hora, nas quatro
 * portas. É o mesmo peso do botão que tira um bloqueio, e segue o mesmo
 * desenho: pedir, avisar a consequência, confirmar.
 *
 * ## O barbeiro vê, mas não mexe
 *
 * A RLS só deixa o gestor escrever (a política espelha a de
 * `professional_schedules`). Mostrar o botão para o barbeiro seria oferecer uma
 * ação que o banco recusa — então ele lê o aviso e não vê botão.
 */
export function AvisoDeFolga({
  deFolga,
  dia,
  aoMudar,
  podeGerenciar,
}: {
  /** Quem está de folga no dia aberto. */
  deFolga: { id: string; nome: string }[]
  /** 'YYYY-MM-DD' do dia aberto, por partes — nunca de `toISOString()`. */
  dia: string
  /** A folga saiu: recarrega a agenda para a coluna voltar a ter jornada. */
  aoMudar: () => void
  podeGerenciar: boolean
}) {
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function remover(professionalId: string) {
    setRemovendo(professionalId)
    setErro(null)

    const { error } = await supabase
      .from('dias_de_folga')
      .delete()
      .eq('professional_id', professionalId)
      .eq('dia', dia)

    setRemovendo(null)

    if (error) {
      console.error('Erro ao remover a folga:', error)
      // A confirmação FICA aberta no erro: fechá-la junto com a falha daria a
      // impressão de que a folga saiu.
      setErro(traduzirErroDoBanco(error, undefined, 'Não foi possível remover a folga.'))
      return
    }

    setConfirmando(null)
    aoMudar()
  }

  return (
    <div className="mb-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 space-y-2">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <CalendarOff size={14} className="shrink-0 mt-0.5" />
        <span>
          {deFolga.length === 1 ? (
            <>
              <strong className="font-medium text-foreground">{deFolga[0].nome}</strong> está de
              folga nesse dia.
            </>
          ) : (
            <>
              <strong className="font-medium text-foreground">{deFolga.length} barbeiros</strong>{' '}
              estão de folga nesse dia.
            </>
          )}{' '}
          O dia não é oferecido na agenda pública, no WhatsApp nem na fila de espera. Os horários
          já marcados continuam na agenda.
        </span>
      </p>

      <ErroInline>{erro}</ErroInline>

      {podeGerenciar && (
        <ul className="space-y-1.5">
          {deFolga.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 flex-wrap">
              {confirmando === p.id ? (
                <>
                  <span className="text-xs text-danger">
                    O dia de {p.nome} volta a ser oferecido aos clientes.
                  </span>
                  <span className="flex gap-2 shrink-0">
                    <button onClick={() => setConfirmando(null)} className="btn-chip">
                      Voltar
                    </button>
                    <button
                      onClick={() => void remover(p.id)}
                      disabled={removendo === p.id}
                      className="btn-chip btn-chip-perigo disabled:opacity-50"
                    >
                      {removendo === p.id ? 'Removendo...' : 'Remover folga'}
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs text-foreground truncate">{p.nome}</span>
                  <button
                    onClick={() => {
                      setErro(null)
                      setConfirmando(p.id)
                    }}
                    className="btn-chip shrink-0"
                  >
                    Remover folga
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
