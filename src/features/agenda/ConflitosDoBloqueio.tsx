import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarOff, CalendarX, UserX } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { ErroInline } from '../../components/ErroInline'
import { SkeletonLinhas } from '../../components/Skeleton'

type Candidato = { professional_id: string; nome: string }

type Conflito = {
  id: string
  hora: string
  cliente: string
  servico: string
  candidatos: Candidato[]
  carregandoCandidatos: boolean
}

/**
 * Os horários que estão no caminho de um bloqueio, e quem pode assumir cada um.
 *
 * O banco já impedia bloquear por cima de horário marcado: a
 * `appointments_sem_sobreposicao` levanta 23P01 e a tela dizia *"Cancele ou
 * remarque antes de bloquear"*. Correto e inútil -- o dono ficava com a tarefa
 * inteira na mão, tendo de adivinhar, horário por horário, qual barbeiro
 * trabalha naquele dia, faz aquele serviço e está livre naquela hora.
 *
 * Aqui as três perguntas já vêm respondidas pela `quem_pode_assumir` (0202),
 * que é a MESMA régua do `horarios_livres` -- de propósito: candidato calculado
 * por fora seria recusado depois pelo trigger da folga, e o dono levaria erro
 * depois de clicar num nome.
 *
 * **Passar não é remarcar.** O horário continua o mesmo; muda a cadeira. Por
 * isso o `update` é só de `professional_id`, e a trava de sobreposição é a
 * última palavra: se dois cliques disputarem o mesmo barbeiro, o segundo é
 * recusado pelo banco, não por uma conferência nossa que chegaria tarde.
 *
 * **O cliente não é avisado.** Trocar o barbeiro de alguém sem avisar é coisa
 * que ele descobre na cadeira, e o aviso é mensagem iniciada pela plataforma --
 * precisa de template aprovado, que o dono decidiu não usar por hora. Fica
 * dito na tela, para o dono saber que o recado é com ele.
 */
export function ConflitosDoBloqueio({
  professionalId,
  inicio,
  fim,
  onVazio,
  onFolga,
  salvando,
}: {
  professionalId: string
  /** ISO do começo da janela do bloqueio. */
  inicio: string
  fim: string
  /** Chamado quando não sobrou nenhum conflito: o bloqueio pode ser tentado. */
  onVazio: () => void
  /**
   * Marcar o dia como folga em vez de resolver tudo antes de bloquear.
   *
   * **Ausente quando o bloqueio não é de dia inteiro**, e por isso é opcional:
   * folga de duas horas não existe, e oferecer a opção num bloqueio de almoço
   * fecharia o dia inteiro por engano.
   */
  onFolga?: () => void
  /** O pai está gravando (a folga). Trava o botão para não inserir duas vezes. */
  salvando?: boolean
}) {
  const [conflitos, setConflitos] = useState<Conflito[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  /**
   * Erro de LEITURA separado do erro de ACAO, e nao um `erro` so.
   *
   * Sao duas situacoes diferentes para quem olha: falhar ao LER significa que
   * nao se sabe quantos horarios existem -- e aí a tela nao pode dizer "Tem 0
   * horarios. Passe cada um para outro barbeiro", que foi exatamente o que ela
   * dizia, com o erro logo abaixo. Numero que nao foi lido e numero inventado.
   * Falhar ao PASSAR um horario e outra coisa: a lista continua valendo e o
   * erro e daquela linha.
   */
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [mexendo, setMexendo] = useState<string | null>(null)
  const [escolha, setEscolha] = useState<Record<string, string>>({})

  /**
   * `onVazio` por ref, e nao na lista de dependencias do `carregar`.
   *
   * Se o pai passar uma funcao nova a cada render -- o que acontece sem
   * `useCallback`, e e facil de esquecer --, `carregar` mudaria de identidade,
   * o efeito rodaria de novo, e isso e um laco de consultas ao banco disparado
   * por um detalhe do pai. A ref tira essa chance de existir aqui, em vez de
   * confiar que quem usar o componente vai lembrar.
   */
  const onVazioRef = useRef(onVazio)
  onVazioRef.current = onVazio

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    setErroLeitura(null)

    const { data, error } = await supabase
      .from('appointments')
      // `services!appointments_service_id_fkey` com a FK NOMEADA, e nao
      // `services(nome)`. Existem DOIS caminhos de `appointments` para
      // `services` -- a FK direta (`service_id`) e a tabela de juncao
      // (`appointment_services`) --, o PostgREST nao escolhe sozinho e devolve
      // **PGRST201** sempre, independente dos dados. Com `services(nome)` este
      // painel nunca leu nada: a consulta falhava 100% das vezes.
      .select('id, data_hora_inicio, clients(nome), services!appointments_service_id_fkey(nome)')
      .eq('professional_id', professionalId)
      .gte('data_hora_inicio', inicio)
      .lt('data_hora_inicio', fim)
      .not('status', 'in', '("cancelado","faltou","bloqueio")')
      .order('data_hora_inicio')

    if (error) {
      console.error('Erro ao ler os horários no caminho:', error)
      setErroLeitura('Não foi possível ler os horários desse dia.')
      // A lista vai junto: lista velha embaixo de um erro e a mesma mentira do
      // "R$ 0,00 para quem só está sem rede".
      setConflitos([])
      setCarregando(false)
      return
    }

    const linhas: Conflito[] = (data ?? []).map((a) => {
      // O Supabase devolve a relacao embutida como ARRAY, mesmo quando e
      // uma-para-uma -- o typecheck pegou isto antes de virar `undefined` na
      // tela. `[0]` com fallback cobre as duas formas sem mentir no tipo.
      const cliente = (Array.isArray(a.clients) ? a.clients[0] : a.clients) as
        | { nome: string }
        | undefined
      const servico = (Array.isArray(a.services) ? a.services[0] : a.services) as
        | { nome: string }
        | undefined
      return {
        id: a.id,
        hora: new Date(a.data_hora_inicio).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        cliente: cliente?.nome ?? 'Cliente',
        servico: servico?.nome ?? '',
        candidatos: [],
        carregandoCandidatos: true,
      }
    })
    setConflitos(linhas)
    setCarregando(false)

    if (linhas.length === 0) {
      onVazioRef.current()
      return
    }

    // Os candidatos vêm um por agendamento, porque cada um tem a sua hora e os
    // seus serviços. Em paralelo para a lista não aparecer de cima para baixo.
    const comCandidatos = await Promise.all(
      linhas.map(async (l) => {
        const { data: cands, error: errCand } = await supabase.rpc('quem_pode_assumir', {
          p_appointment_id: l.id,
        })
        if (errCand) console.error('Erro ao buscar quem pode assumir:', errCand)
        return {
          ...l,
          candidatos: ((cands ?? []) as Candidato[]).map((c) => ({
            professional_id: c.professional_id,
            nome: c.nome,
          })),
          carregandoCandidatos: false,
        }
      }),
    )
    setConflitos(comCandidatos)
  }, [professionalId, inicio, fim])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function passar(c: Conflito) {
    const destino = escolha[c.id] ?? c.candidatos[0]?.professional_id
    if (!destino) return

    setMexendo(c.id)
    setErro(null)

    // Só a cadeira muda. A hora é a mesma, então não há duração para recalcular
    // -- e a trava de sobreposição decide se cabe.
    const { error } = await supabase
      .from('appointments')
      .update({ professional_id: destino })
      .eq('id', c.id)

    setMexendo(null)

    if (error) {
      console.error('Erro ao passar o horário:', error)
      setErro(
        traduzirErroDoBanco(
          error,
          {
            '23P01':
              'Esse barbeiro ficou ocupado nesse horário enquanto você decidia. A lista foi atualizada.',
          },
          'Não foi possível passar esse horário. Tente de novo.',
        ),
      )
      await carregar()
      return
    }

    await carregar()
  }

  async function cancelar(c: Conflito) {
    setMexendo(c.id)
    setErro(null)

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado', cancelado_por: 'barbearia' })
      .eq('id', c.id)

    setMexendo(null)

    if (error) {
      console.error('Erro ao cancelar o horário:', error)
      setErro(traduzirErroDoBanco(error, undefined, 'Não foi possível cancelar esse horário.'))
      return
    }

    await carregar()
  }

  if (carregando) return <SkeletonLinhas />

  // Erro de leitura CALA a contagem e a lista: sem ter lido, a tela não sabe
  // quantos horários existem, e dizer "Tem 0" com o erro embaixo é pedir uma
  // ação sobre um número que ninguém mediu.
  if (erroLeitura) {
    return (
      <div className="space-y-3">
        <ErroInline>{erroLeitura}</ErroInline>
        <button
          onClick={() => void carregar()}
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
        <strong className="font-medium">
          {conflitos.length === 1
            ? 'Tem 1 horário marcado nesse dia.'
            : `Tem ${conflitos.length} horários marcados nesse dia.`}
        </strong>{' '}
        Passe cada um para outro barbeiro ou cancele. Só depois o dia pode ser bloqueado.
      </div>

      {/* A saída para o dia que não dá para esvaziar agora.
          Sem ela o dono fica sem caminho nenhum quando é o único barbeiro: não
          há para quem passar, e cancelar dez pessoas de uma vez não é decisão
          que se toma com um clique. */}
      {onFolga && (
        <div className="text-xs bg-surface-2 border border-border rounded-lg px-3 py-2.5 space-y-2">
          <p className="text-muted-foreground">
            <strong className="font-medium text-foreground">
              Não precisa resolver tudo agora.
            </strong>{' '}
            Marcar folga fecha o dia para novos agendamentos na hora — na agenda pública, no
            WhatsApp e na fila de espera. Os horários acima continuam na agenda para você
            resolver com calma.
          </p>
          <button
            onClick={onFolga}
            disabled={salvando}
            className="btn-secondary rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <CalendarOff size={13} className="inline mr-1 -mt-0.5" />
            {salvando ? 'Marcando...' : 'Marcar folga nesse dia'}
          </button>
        </div>
      )}

      <ErroInline>{erro}</ErroInline>

      <ul className="space-y-2">
        {conflitos.map((c) => (
          <li key={c.id} className="border border-border rounded-lg p-2.5 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground tabular-nums">{c.hora}</span>
              <span className="text-sm text-foreground truncate">{c.cliente}</span>
              {c.servico && (
                <span className="text-xs text-muted-foreground truncate">{c.servico}</span>
              )}
            </div>

            {c.carregandoCandidatos ? (
              <p className="text-xs text-muted-foreground">Vendo quem pode assumir...</p>
            ) : c.candidatos.length === 0 ? (
              /* Vazio é informação, não falha: ninguém livre naquele minuto que
                 faça esse serviço. Empurrar outro horário seria decidir pelo
                 cliente. */
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground flex-1 min-w-[12rem]">
                  Ninguém está livre nesse horário para esse serviço. Fale com o cliente para
                  remarcar, ou cancele.
                </p>
                <button
                  onClick={() => cancelar(c)}
                  disabled={mexendo === c.id}
                  className="btn-danger rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  <CalendarX size={13} className="inline mr-1 -mt-0.5" />
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={escolha[c.id] ?? c.candidatos[0].professional_id}
                  onChange={(e) => setEscolha((p) => ({ ...p, [c.id]: e.target.value }))}
                  aria-label={`Passar o horário de ${c.hora} para`}
                  className="flex-1 min-w-[10rem] bg-surface border border-border-strong rounded-lg px-2 py-1.5 text-sm text-foreground"
                >
                  {c.candidatos.map((cand) => (
                    <option key={cand.professional_id} value={cand.professional_id}>
                      {cand.nome}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => passar(c)}
                  disabled={mexendo === c.id}
                  className="btn-primary rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {mexendo === c.id ? 'Passando...' : 'Passar'}
                  <ArrowRight size={13} className="inline ml-1 -mt-0.5" />
                </button>
                <button
                  onClick={() => cancelar(c)}
                  disabled={mexendo === c.id}
                  className="btn-danger rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  <CalendarX size={13} className="inline mr-1 -mt-0.5" />
                  Cancelar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* O dono precisa saber que o recado com o cliente é com ele: o aviso
          automático é mensagem iniciada pela plataforma e depende de template. */}
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <UserX size={13} className="shrink-0 mt-0.5" />
        <span>
          O cliente <strong className="font-medium text-foreground">não é avisado</strong> da troca
          pelo sistema. Quem conta é você.
        </span>
      </p>
    </div>
  )
}
