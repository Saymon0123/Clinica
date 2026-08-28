import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { ErroInline } from '../../components/ErroInline'

/**
 * A barbearia abre num dia em que ninguém trabalha.
 *
 * Mudar o horário da barbearia **não** mexe na jornada dos barbeiros, e isso é
 * deliberado: com dois barbeiros eles trabalham em dias diferentes de
 * propósito, e arrastar o horário do salão sobre a jornada de todos apagaria
 * escala combinada.
 *
 * Só que para a barbearia de um barbeiro só — a maioria — vira armadilha
 * silenciosa. Aconteceu em 2026-08-16 com o dono do produto, que **sabia** onde
 * mexer: abriu o domingo em Configurações, nada funcionou, e foi preciso uma
 * segunda edição noutra tela para o horário aparecer. Um dono de barbearia não
 * vai descobrir isso — vai concluir que o produto não funciona.
 *
 * O aviso não muda a regra. Ele só torna visível o que já era verdade, e
 * oferece a saída num clique.
 */
const DIAS = [
  { chave: 'dom', nome: 'domingo', numero: 0 },
  { chave: 'seg', nome: 'segunda', numero: 1 },
  { chave: 'ter', nome: 'terça', numero: 2 },
  { chave: 'qua', nome: 'quarta', numero: 3 },
  { chave: 'qui', nome: 'quinta', numero: 4 },
  { chave: 'sex', nome: 'sexta', numero: 5 },
  { chave: 'sab', nome: 'sábado', numero: 6 },
] as const

type Faixa = { abre?: string; fecha?: string } | null
type Buraco = { numero: number; nome: string; abre: string; fecha: string }

export function AvisoDeJornada({ recarregar }: { recarregar?: number }) {
  const { salonId, isManager } = useSalon()
  const [buracos, setBuracos] = useState<Buraco[]>([])
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([])
  const [aplicando, setAplicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const verificar = useCallback(async () => {
    if (!salonId) return
    setPronto(false)

    const [{ data: salao }, { data: profs }] = await Promise.all([
      supabase.from('salons').select('horario_funcionamento').eq('id', salonId).maybeSingle(),
      supabase.from('professionals').select('id, nome').eq('salon_id', salonId).eq('ativo', true),
    ])

    if (!salao || !profs?.length) {
      setBuracos([])
      return
    }
    setProfissionais(profs)

    const { data: jornadas } = await supabase
      .from('professional_schedules')
      .select('dia_semana')
      .in(
        'professional_id',
        profs.map((p) => p.id),
      )
      .eq('ativo', true)

    const diasComAlguem = new Set((jornadas ?? []).map((j) => j.dia_semana))
    const horario = (salao.horario_funcionamento ?? {}) as Record<string, Faixa>

    setBuracos(
      DIAS.filter((d) => {
        const faixa = horario[d.chave]
        return !!faixa?.abre && !!faixa?.fecha && !diasComAlguem.has(d.numero)
      }).map((d) => ({
        numero: d.numero,
        nome: d.nome,
        abre: horario[d.chave]!.abre!,
        fecha: horario[d.chave]!.fecha!,
      })),
    )
  }, [salonId])

  useEffect(() => {
    verificar()
  }, [verificar, recarregar])

  async function aplicar() {
    setAplicando(true)
    setErro(null)

    // Aplica a TODOS os profissionais ativos. Numa barbearia de um, é o que o
    // dono quer. Em várias, ele ajusta na aba Equipe depois — e ao menos os
    // clientes conseguem agendar nesse meio-tempo, que é melhor que o silêncio.
    const linhas = buracos.flatMap((b) =>
      profissionais.map((p) => ({
        professional_id: p.id,
        dia_semana: b.numero,
        hora_inicio: b.abre,
        hora_fim: b.fecha,
        ativo: true,
      })),
    )

    // Limpa antes de inserir: um profissional podia ter linha INATIVA para o
    // mesmo dia (a verificação só olha ativas), e o insert puro duplicava.
    const { error: limpaError } = await supabase
      .from('professional_schedules')
      .delete()
      .in('professional_id', profissionais.map((p) => p.id))
      .in('dia_semana', buracos.map((b) => b.numero))
    if (limpaError) {
      console.error('Erro ao limpar jornadas antigas:', limpaError)
      setErro('Não foi possível aplicar. Ajuste na aba Equipe.')
      setAplicando(false)
      return
    }

    const { error } = await supabase.from('professional_schedules').insert(linhas)
    setAplicando(false)

    if (error) {
      console.error('Erro ao aplicar jornada:', error)
      setErro('Não foi possível aplicar. Ajuste na aba Equipe.')
      return
    }
    setPronto(true)
    verificar()
  }

  if (!isManager || buracos.length === 0) {
    return pronto ? (
      <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft p-3 text-sm text-foreground">
        <Check size={16} className="text-success shrink-0" />
        Jornada aplicada. Os clientes já conseguem agendar nesses dias.
      </div>
    ) : null
  }

  const lista = buracos.map((b) => b.nome).join(', ')

  return (
    <div className="rounded-xl border border-warning/40 bg-warning-soft p-4 space-y-3">
      <div className="flex gap-2.5">
        <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
        <div className="text-sm text-foreground">
          <strong>
            A barbearia abre {buracos.length > 1 ? 'nestes dias' : 'neste dia'}, mas ninguém
            trabalha: {lista}.
          </strong>
          <p className="text-muted-foreground mt-1">
            Sem alguém na jornada, ninguém consegue agendar — nem pelo WhatsApp, nem pelo QR do
            balcão. O horário da barbearia e a jornada de cada barbeiro são coisas separadas, para
            quem tem equipe com escalas diferentes.
          </p>
        </div>
      </div>

      <button
        onClick={aplicar}
        disabled={aplicando}
        className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {aplicando
          ? 'Aplicando...'
          : profissionais.length === 1
            ? `Aplicar esse horário à jornada de ${profissionais[0].nome}`
            : `Aplicar à jornada dos ${profissionais.length} barbeiros`}
      </button>

      <ErroInline>{erro}</ErroInline>

      <p className="text-[11px] text-muted-foreground">
        Se cada barbeiro trabalha em dias diferentes, ignore este aviso e ajuste um por um na aba
        Equipe.
      </p>
    </div>
  )
}
