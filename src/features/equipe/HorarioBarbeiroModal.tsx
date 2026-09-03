import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Campo'
import { SkeletonLinhas } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { ErroInline } from '../../components/ErroInline'

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

    // Uma transação só (achado 43 da revisão de 01/09). Antes era DELETE e
    // INSERT em duas chamadas: a rede caindo entre as duas deixava o barbeiro
    // sem jornada nenhuma — e sem jornada o agente e o QR não marcam nada. A
    // RPC `salvar_jornada` (0135) valida, apaga e grava juntos, e grava os 7
    // dias: folga é `ativo = false`, não ausência de linha.
    const { error } = await supabase.rpc('salvar_jornada', {
      p_professional_id: professionalId,
      p_dias: dias.map((d) => ({
        dia_semana: d.dia_semana,
        ativo: d.trabalha,
        hora_inicio: d.inicio,
        hora_fim: d.fim,
      })),
    })

    if (error) {
      console.error('Erro ao salvar a jornada:', error)
      setErro(
        traduzirErroDoBanco(error, undefined, 'Não foi possível salvar. A jornada anterior continua valendo — tente de novo.'),
      )
      setSalvando(false)
      return
    }

    setSalvando(false)
    setSalvo(true)
    setTimeout(onClose, 900)
  }

  return (
    <Modal
      onClose={onClose}
      bloquearFechamento={salvando}
      titulo={
        <span className="flex items-center gap-2">
          <Clock size={18} />
          Horário de {nome}
        </span>
      }
      tamanho="sm"
    >
        {carregando ? (
          <SkeletonLinhas />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Dias e horários em que ele atende. Serve para a agenda e para o atendimento
              automático não oferecer horário em dia de folga.
            </p>

            {/* Mesmo fundo dos outros avisos do app: `--warning-soft` existe
                desde o passo 2.5 (antes era opacidade sobre `--warning`, um
                amarelo diferente do resto). */}
            {nuncaSalvo && (
              <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
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
                      <div className="w-28">
                        <Input
                          type="time"
                          value={d.inicio}
                          onChange={(e) =>
                            setDias((prev) =>
                              prev.map((x, idx) => (idx === i ? { ...x, inicio: e.target.value } : x)),
                            )
                          }
                          aria-label={`Entrada de ${d.label}`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">às</span>
                      <div className="w-28">
                        <Input
                          type="time"
                          value={d.fim}
                          onChange={(e) =>
                            setDias((prev) =>
                              prev.map((x, idx) => (idx === i ? { ...x, fim: e.target.value } : x)),
                            )
                          }
                          aria-label={`Saída de ${d.label}`}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Folga</span>
                  )}
                </div>
              ))}
            </div>

            <ErroInline>{erro}</ErroInline>

            <button
              onClick={salvar}
              disabled={salvando || salvo}
              className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {salvo ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar horário'}
            </button>
          </>
        )}
    </Modal>
  )
}
