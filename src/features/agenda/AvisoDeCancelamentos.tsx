import { useCallback, useEffect, useState } from 'react'
import { CalendarX2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * "O cliente cancelou" — o aviso que não existia (etapa 6 do QR v2).
 *
 * O BURACO QUE ELE TAPA. O cancelamento pelo link só mudava o status no banco,
 * e nenhum gatilho de `appointments` falava para fora. Quem está com o CRM
 * aberto vê o bloco sumir da agenda — o realtime já existe. Quem fechou o CRM
 * às 19h chega no dia seguinte e encontra a cadeira vazia sem explicação.
 *
 * E A ETAPA 3 PIOROU ISSO DE PROPÓSITO: guardar o horário no celular existe
 * justamente para a pessoa cancelar sozinha, sem falar com ninguém. Facilitar o
 * cancelamento silencioso sem construir o aviso seria entregar metade.
 *
 * ─── Três decisões que valem mais que o desenho ────────────────────────────
 *
 * SÓ O QUE O CLIENTE CANCELOU. A barbearia não precisa de um aviso do que ela
 * mesma acabou de cancelar na tela ao lado — é o mesmo erro que o aviso de
 * "novo agendamento" cometia antes do achado 35. Quem separa um do outro é o
 * `cancelado_por` do banco (migration 0168), inferido de `auth.uid()`.
 *
 * DAR CIÊNCIA É UM TOQUE, e some. Aviso que não some vira paisagem, e paisagem
 * ninguém lê — que é exatamente o estado de quem não tem aviso nenhum.
 *
 * NÃO SOME SOZINHO COM O TEMPO. A view corta em sete dias, mas dentro disso o
 * aviso espera. O dono que só abre o CRM na segunda tem de ver o que aconteceu
 * no sábado.
 */

type Cancelamento = {
  id: string
  /** 'cancelou' ou 'remarcou'. Sao noticias diferentes: uma libera a cadeira,
   *  a outra a move -- e o barbeiro faz coisas diferentes com cada uma. */
  tipo: string
  data_hora_inicio: string
  mexido_em: string
  cliente: string | null
  barbeiro: string | null
  servicos: string | null
  ainda_da_para_encaixar: boolean
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * O titulo diz o que aconteceu, nao "voce tem 3 avisos".
 *
 * Cancelar e remarcar sao noticias diferentes: uma libera a cadeira, a outra a
 * move. Misturar as duas num "3 mudancas" obrigaria o dono a ler a lista para
 * saber se sobrou buraco na agenda -- que e a pergunta que ele faz primeiro.
 */
function tituloDoAviso(lista: Cancelamento[]) {
  const cancelados = lista.filter((c) => c.tipo !== 'remarcou').length
  const remarcados = lista.length - cancelados
  const partes: string[] = []
  if (cancelados) partes.push(cancelados === 1 ? 'um cliente cancelou' : `${cancelados} clientes cancelaram`)
  if (remarcados) partes.push(remarcados === 1 ? 'um mudou de horário' : `${remarcados} mudaram de horário`)
  const frase = partes.join(' e ')
  return frase.charAt(0).toUpperCase() + frase.slice(1)
}

export function AvisoDeCancelamentos({ salonId }: { salonId: string | null }) {
  const [lista, setLista] = useState<Cancelamento[]>([])
  const [dandoCiencia, setDandoCiencia] = useState(false)

  const buscar = useCallback(async () => {
    if (!salonId) return
    const { data, error } = await supabase
      .from('cancelamentos_a_avisar')
      .select('id, tipo, data_hora_inicio, mexido_em, cliente, barbeiro, servicos, ainda_da_para_encaixar')
      .eq('salon_id', salonId)
      .order('data_hora_inicio')
    // Falha de carga NÃO vira caixa de erro aqui. Este é um aviso extra sobre
    // uma tela que já tem o seu próprio erro de carga logo abaixo; dois avisos
    // vermelhos sobre a mesma queda de rede é ruído, e o dono ainda tem a
    // agenda para trabalhar.
    if (error) return
    setLista((data ?? []) as Cancelamento[])
  }, [salonId])

  useEffect(() => {
    void buscar()
  }, [buscar])

  /**
   * Realtime, e o mesmo canal que a Agenda já usa não serve: aquele recarrega a
   * grade, este precisa saber que um cancelamento NOVO entrou na fila de
   * avisos. Sem isto, quem está com o CRM aberto o dia inteiro só veria o aviso
   * no próximo F5 — e é justamente ele que dá para avisar na hora.
   */
  useEffect(() => {
    if (!salonId) return
    const canal = supabase
      .channel(`cancelamentos_${salonId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
        (payload) => {
          const linha = payload.new as {
            status?: string | null
            cancelado_por?: string | null
            remarcado_pelo_cliente_em?: string | null
          }
          // Qualquer update da unidade chega aqui (arrastar horário, marcar
          // presença, o flag do lembrete). Só o que o CLIENTE mexeu sozinho
          // interessa, e a consulta de volta é o que confirma.
          const cancelou = linha.status === 'cancelado' && linha.cancelado_por === 'cliente'
          const remarcou = !!linha.remarcado_pelo_cliente_em
          if (cancelou || remarcou) void buscar()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [salonId, buscar])

  async function darCiencia() {
    if (!lista.length) return
    setDandoCiencia(true)
    const ids = lista.map((c) => c.id)
    const { error } = await supabase
      .from('appointments')
      .update({ cancelamento_visto_em: new Date().toISOString() })
      .in('id', ids)
    setDandoCiencia(false)
    // Só some da tela se o banco confirmou. Sumir antes faria o dono achar que
    // deu ciência de um aviso que volta no próximo carregamento.
    if (!error) setLista([])
  }

  if (!lista.length) return null

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-warning/40 bg-warning-soft/60 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarX2 size={18} className="shrink-0 text-warning" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">{tituloDoAviso(lista)}</h2>
        </div>
        <button
          type="button"
          onClick={darCiencia}
          disabled={dandoCiencia}
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold"
        >
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} aria-hidden />
            {dandoCiencia ? 'Marcando...' : 'Ok, vi'}
          </span>
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {lista.map((c) => (
          <li key={c.id} className="text-[13px] leading-snug text-foreground">
            <strong className="font-semibold capitalize">{QUANDO.format(new Date(c.data_hora_inicio))}</strong>
            {' · '}
            {c.cliente ?? 'Cliente'}
            {c.servicos ? ` · ${c.servicos}` : ''}
            {c.barbeiro ? ` · com ${c.barbeiro}` : ''}
            {/* A cadeira que ainda dá para vender é outra conversa da que já
                passou. Sem essa marca, o dono lê a lista inteira procurando
                qual ainda vale a pena preencher. */}
            <span
              className={`mr-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                c.tipo === 'remarcou'
                  ? 'bg-primary-soft text-primary-soft-foreground'
                  : 'bg-danger-soft text-danger'
              }`}
            >
              {c.tipo === 'remarcou' ? 'mudou' : 'cancelou'}
            </span>
            {c.ainda_da_para_encaixar && (
              <span className="ml-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                ainda dá para encaixar
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
