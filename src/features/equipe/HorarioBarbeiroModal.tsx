import { useEffect, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Dia = { dia_semana: number; label: string; trabalha: boolean; inicio: string; fim: string }

const DIAS_PADRAO: Dia[] = [
  { dia_semana: 1, label: 'Segunda', trabalha: true, inicio: '09:00', fim: '19:00' },
  { dia_semana: 2, label: 'Terça', trabalha: true, inicio: '09:00', fim: '19:00' },
  { dia_semana: 3, label: 'Quarta', trabalha: true, inicio: '09:00', fim: '19:00' },
  { dia_semana: 4, label: 'Quinta', trabalha: true, inicio: '09:00', fim: '19:00' },
  { dia_semana: 5, label: 'Sexta', trabalha: true, inicio: '09:00', fim: '20:00' },
  { dia_semana: 6, label: 'Sábado', trabalha: true, inicio: '09:00', fim: '18:00' },
  { dia_semana: 0, label: 'Domingo', trabalha: false, inicio: '09:00', fim: '13:00' },
]

export function HorarioBarbeiroModal({
  professionalId,
  nome,
  onClose,
}: {
  professionalId: string
  nome: string
  onClose: () => void
}) {
  const [dias, setDias] = useState<Dia[]>(DIAS_PADRAO)
  const [carregando, setCarregando] = useState(true)
  /**
   * Ainda não existe horário salvo — o que está na tela é só sugestão.
   *
   * Sem esta distinção o modal de quem nunca configurou é **idêntico** ao de
   * quem já configurou: a semana aparece preenchida, o dono fecha satisfeito e
   * o banco continua vazio. Foi o que aconteceu com a barbearia de testes em
   * 2026-08-03, e só apareceu porque fui conferir por que o agente não teria
   * horário para oferecer. Sem horário salvo, o atendimento automático não
   * consegue marcar nada — e nada na tela denunciava isso.
   */
  const [nuncaSalvo, setNuncaSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    async function carregar() {
      const { data, error } = await supabase
        .from('professional_schedules')
        .select('dia_semana, hora_inicio, hora_fim, ativo')
        .eq('professional_id', professionalId)

      if (error) {
        console.error('Erro ao carregar horários:', error)
        setErro('Não foi possível carregar os horários.')
      } else if (!data || data.length === 0) {
        setNuncaSalvo(true)
      } else {
        setDias(
          DIAS_PADRAO.map((padrao) => {
            const salvo = data.find((d) => d.dia_semana === padrao.dia_semana)
            if (!salvo) return { ...padrao, trabalha: false }
            return {
              ...padrao,
              trabalha: salvo.ativo,
              inicio: String(salvo.hora_inicio).slice(0, 5),
              fim: String(salvo.hora_fim).slice(0, 5),
            }
          }),
        )
      }
      setCarregando(false)
    }
    carregar()
  }, [professionalId])

  async function salvar() {
    const invalido = dias.find((d) => d.trabalha && d.inicio >= d.fim)
    if (invalido) {
      setErro(`Em ${invalido.label}, o horário de saída precisa ser depois do de entrada.`)
      return
    }

    setSalvando(true)
    setErro(null)

    // Regrava tudo: mais simples e evita sobras de dias removidos.
    const { error: deleteError } = await supabase
      .from('professional_schedules')
      .delete()
      .eq('professional_id', professionalId)

    if (deleteError) {
      console.error('Erro ao limpar horários:', deleteError)
      setErro('Não foi possível salvar. Tente novamente.')
      setSalvando(false)
      return
    }

    const paraSalvar = dias
      .filter((d) => d.trabalha)
      .map((d) => ({
        professional_id: professionalId,
        dia_semana: d.dia_semana,
        hora_inicio: d.inicio,
        hora_fim: d.fim,
        ativo: true,
      }))

    if (paraSalvar.length > 0) {
      const { error: insertError } = await supabase.from('professional_schedules').insert(paraSalvar)
      if (insertError) {
        console.error('Erro ao salvar horários:', insertError)
        setErro('Não foi possível salvar. Tente novamente.')
        setSalvando(false)
        return
      }
    }

    setSalvando(false)
    setSalvo(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border shadow-sm w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Clock size={18} />
            Horário de {nome}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Dias e horários em que ele atende. Serve para a agenda e para o atendimento
              automático não oferecer horário em dia de folga.
            </p>

            {/* `warning-soft` não existe nos tokens; a opacidade sobre
                `--color-warning` dá o mesmo efeito sem inventar um token. */}
            {nuncaSalvo && (
              <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
                <strong className="font-medium">Ainda não salvo.</strong> Estes são horários
                sugeridos — enquanto não salvar, o atendimento automático não tem quando marcar e
                não vai conseguir agendar nada.
              </p>
            )}

            <div className="space-y-1.5">
              {dias.map((d, i) => (
                <div key={d.dia_semana} className="flex items-center gap-2">
                  <label className="flex items-center gap-2 w-24 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.trabalha}
                      onChange={(e) =>
                        setDias((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, trabalha: e.target.checked } : x)),
                        )
                      }
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">{d.label}</span>
                  </label>

                  {d.trabalha ? (
                    <>
                      <input
                        type="time"
                        value={d.inicio}
                        onChange={(e) =>
                          setDias((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, inicio: e.target.value } : x)),
                          )
                        }
                        aria-label={`Entrada de ${d.label}`}
                        className="border border-border-strong bg-surface text-foreground rounded-lg px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">às</span>
                      <input
                        type="time"
                        value={d.fim}
                        onChange={(e) =>
                          setDias((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, fim: e.target.value } : x)),
                          )
                        }
                        aria-label={`Saída de ${d.label}`}
                        className="border border-border-strong bg-surface text-foreground rounded-lg px-2 py-1.5 text-sm"
                      />
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Folga</span>
                  )}
                </div>
              ))}
            </div>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <button
              onClick={salvar}
              disabled={salvando || salvo}
              className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {salvo ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar horário'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
