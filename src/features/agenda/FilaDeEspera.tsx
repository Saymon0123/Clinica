import { useCallback, useEffect, useState } from 'react'
import { Clock3, UserMinus, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarTelefone } from '../../lib/telefone'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { ErroInline } from '../../components/ErroInline'

type Inscricao = {
  id: string
  status: string
  de: string
  ate: string
  hora_de: string | null
  hora_ate: string | null
  chamadas: number
  cliente: string
  telefone: string | null
  barbeiro: string | null
  servicos: string
  reserva: { data_hora_inicio: string; reservada_ate: string | null } | null
}

/**
 * Quem está esperando uma vaga abrir.
 *
 * Mora na Agenda, acima da grade, pelo mesmo motivo do aviso de cancelamentos:
 * é informação que muda o que o dono faz **agora**. Alguém desmarcou às 14h e a
 * pergunta imediata é "quem eu chamo?" -- e a resposta tem de estar na tela onde
 * ele viu a cadeira esvaziar, não a dois cliques de distância.
 *
 * **Some quando a fila está vazia.** Bloco que fica para sempre vira paisagem, e
 * paisagem ninguém lê.
 *
 * ## Por que o telefone aparece
 *
 * O aviso automático da fila é mensagem **iniciada pela plataforma**: precisa de
 * template aprovado na Meta, e o dono decidiu não usar template por hora. Então
 * o banco já procura a vaga, já segura a reserva e já sabe o que dizer -- só não
 * fala. Com o telefone na tela, a fila funciona **hoje**, chamando na mão, em vez
 * de ficar guardada esperando uma decisão de template.
 *
 * ## `chamado` é um estado que o dono precisa ver
 *
 * Quando o sistema segura uma vaga para alguém, a cadeira fica ocupada por 30
 * minutos sem ninguém confirmado. Sem isso na tela, o dono olha a agenda, vê o
 * horário tomado, não reconhece o nome e desfaz a reserva sem saber que estava
 * segurando a vez de quem esperou.
 */
export function FilaDeEspera({ salonId }: { salonId: string | null }) {
  const [lista, setLista] = useState<Inscricao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroDeCarga, setErroDeCarga] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [tirando, setTirando] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    if (!salonId) {
      setLista([])
      setCarregando(false)
      return
    }

    const { data, error } = await supabase
      .from('fila_de_espera')
      .select(
        `id, status, de, ate, hora_de, hora_ate, chamadas,
         clients(nome, telefone),
         professionals(nome),
         fila_de_espera_servicos(services(nome)),
         appointments(data_hora_inicio, reservada_ate)`,
      )
      .eq('salon_id', salonId)
      .in('status', ['esperando', 'chamado'])
      .order('criada_em')

    if (error) {
      console.error('Erro ao carregar a fila de espera:', error)
      setErroDeCarga(true)
      setCarregando(false)
      return
    }

    // Relação embutida do Supabase vem como ARRAY mesmo quando é
    // uma-para-uma, e os tipos gerados dizem isso -- foi o typecheck que me
    // corrigiu aqui, pela segunda vez no mesmo dia (a primeira foi no painel de
    // conflitos do bloqueio). Então o acesso é por `[0]`, sem fingir que pode
    // vir objeto.
    setLista(
      (data ?? []).map((f) => {
        const cliente = (f.clients as { nome: string; telefone: string | null }[] | null)?.[0]
        const barbeiro = (f.professionals as { nome: string }[] | null)?.[0]
        const reserva = (
          f.appointments as { data_hora_inicio: string; reservada_ate: string | null }[] | null
        )?.[0]
        const servicos = ((f.fila_de_espera_servicos ?? []) as { services: { nome: string }[] }[])
          .map((s) => s.services?.[0]?.nome)
          .filter((n): n is string => Boolean(n))
        return {
          id: f.id,
          status: f.status,
          de: f.de,
          ate: f.ate,
          hora_de: f.hora_de,
          hora_ate: f.hora_ate,
          chamadas: f.chamadas,
          cliente: cliente?.nome ?? 'Cliente',
          telefone: cliente?.telefone ?? null,
          barbeiro: barbeiro?.nome ?? null,
          servicos: servicos.join(' + '),
          reserva: reserva ?? null,
        }
      }),
    )
    setCarregando(false)
  }, [salonId])

  useEffect(() => {
    buscar()
  }, [buscar])

  async function tirar(i: Inscricao) {
    setTirando(i.id)
    setErro(null)
    const { error } = await supabase.rpc('sair_da_fila', { p_fila_id: i.id })
    setTirando(null)
    if (error) {
      console.error('Erro ao tirar da fila:', error)
      setErro(
        traduzirErroDoBanco(error, undefined, 'Não foi possível tirar essa pessoa da fila.'),
      )
      return
    }
    await buscar()
  }

  // Carregando e vazio não podem se parecer, mas aqui os dois são silêncio: um
  // bloco "carregando a fila" piscando acima da grade atrapalharia a tela que o
  // dono veio ver. Erro, sim, aparece -- fila que não carregou e fila vazia são
  // coisas muito diferentes para quem acabou de ter um cancelamento.
  if (carregando) return null
  if (erroDeCarga) {
    return (
      <div className="mb-4 rounded-xl border border-border bg-surface p-3">
        <ErroInline>Não foi possível carregar a fila de espera.</ErroInline>
      </div>
    )
  }
  if (!lista.length) return null

  const esperando = lista.filter((i) => i.status === 'esperando').length
  const chamados = lista.filter((i) => i.status === 'chamado').length

  return (
    <div role="status" className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Users size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">
          {esperando === 1 ? '1 pessoa esperando vaga' : `${esperando} pessoas esperando vaga`}
          {chamados > 0 && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {chamados === 1 ? '1 com vaga segurada' : `${chamados} com vaga segurada`}
            </span>
          )}
        </h2>
      </div>

      <ErroInline>{erro}</ErroInline>

      <ul className="mt-3 space-y-2">
        {lista.map((i) => (
          <li key={i.id} className="flex flex-wrap items-start gap-2 text-[13px] leading-snug">
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-foreground">{i.cliente}</span>
              {i.telefone && (
                <span className="text-muted-foreground"> · {formatarTelefone(i.telefone)}</span>
              )}
              {i.servicos && <span className="text-muted-foreground"> · {i.servicos}</span>}
              {i.barbeiro && (
                <span className="text-muted-foreground"> · só com {i.barbeiro}</span>
              )}

              <span className="block text-muted-foreground">
                {janelaEmPalavras(i)}
                {i.chamadas > 0 && (
                  <span className="text-warning">
                    {' '}
                    · já chamado {i.chamadas === 1 ? 'uma vez' : `${i.chamadas} vezes`} sem resposta
                  </span>
                )}
              </span>

              {/* A vaga segurada é o estado que o dono mais precisa reconhecer:
                  a cadeira está ocupada e ninguém confirmou ainda. */}
              {i.status === 'chamado' && i.reserva && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                  <Clock3 size={11} aria-hidden />
                  vaga segurada: {QUANDO.format(new Date(i.reserva.data_hora_inicio))}
                  {i.reserva.reservada_ate &&
                    ` · até ${HORA.format(new Date(i.reserva.reservada_ate))}`}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => tirar(i)}
              disabled={tirando === i.id}
              aria-label={`Tirar ${i.cliente} da fila`}
              className="btn-danger rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <UserMinus size={13} className="inline mr-1 -mt-0.5" />
              {tirando === i.id ? 'Tirando...' : 'Tirar'}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        O sistema procura a vaga e segura por 30 minutos, mas{' '}
        <strong className="font-medium text-foreground">não avisa o cliente</strong> — o aviso
        automático depende de um modelo de mensagem aprovado. Por enquanto, quem chama é você.
      </p>
    </div>
  )
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * A faixa em palavras de gente, não em datas ISO.
 *
 * `new Date('2026-10-05')` é UTC e volta um dia no Brasil (a regra do CLAUDE.md),
 * então a data sem hora é partida por partes -- nunca entregue ao construtor.
 */
function janelaEmPalavras(i: Inscricao) {
  const dia = (iso: string) => {
    // O ano nao entra no rotulo (a faixa e sempre de dias proximos), mas a data
    // sem hora e partida por PARTES de qualquer jeito: `new Date('2026-10-05')`
    // e UTC e volta um dia no Brasil.
    const [, m, d] = iso.split('-').map(Number)
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
  }
  const faixa = i.de === i.ate ? `dia ${dia(i.de)}` : `de ${dia(i.de)} a ${dia(i.ate)}`

  // As QUATRO formas de janela, iguais as da view fila_do_cliente. A primeira
  // versao daqui (e o CHECK da 0203) assumia que janela vinha sempre inteira --
  // e "so antes das 9" foi a primeira frase de cliente de verdade a chegar.
  const de = i.hora_de?.slice(0, 5)
  const ate = i.hora_ate?.slice(0, 5)
  const hora =
    de && ate ? `, entre ${de} e ${ate}` : ate ? `, até ${ate}` : de ? `, a partir de ${de}` : ''
  return `espera ${faixa}${hora}`
}
