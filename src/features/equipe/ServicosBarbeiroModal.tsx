import { useEffect, useState } from 'react'
import { Scissors } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { SkeletonLinhas } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { ErroInline } from '../../components/ErroInline'

type Servico = { id: string; nome: string; preco: number | null; faz: boolean }

export function ServicosBarbeiroModal({
  professionalId,
  salonId,
  nome,
  confirmadoEm,
  onClose,
  onSalvo,
}: {
  professionalId: string
  /**
   * Filtrar por `salon_id` na consulta, e nao so confiar na RLS: dono de REDE
   * tem mais de uma barbearia no alcance, e o catalogo da outra apareceria aqui
   * como se fosse desta.
   */
  salonId: string
  nome: string
  /**
   * `null` = ninguém escolheu ainda: a lista é o padrão de entrada do convite,
   * que liga TODOS os serviços ativos.
   *
   * Sem esta distinção, a tela de quem nunca escolheu é **idêntica** à de quem
   * escolheu tudo — os serviços aparecem todos marcados, o dono fecha
   * satisfeito, e o que ele viu foi um padrão, não uma decisão. É o mesmo
   * defeito que o aviso "Ainda não salvo" do horário resolveu em 03/08.
   */
  confirmadoEm: string | null
  onClose: () => void
  onSalvo: () => void
}) {
  const [servicos, setServicos] = useState<Servico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroDeCarga, setErroDeCarga] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    async function carregar() {
      const [cat, meus] = await Promise.all([
        supabase
          .from('services')
          .select('id, nome, preco')
          .eq('salon_id', salonId)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('professional_services')
          .select('service_id')
          .eq('professional_id', professionalId),
      ])

      if (cat.error || meus.error) {
        console.error('Erro ao carregar os serviços:', cat.error ?? meus.error)
        setErroDeCarga(true)
        setCarregando(false)
        return
      }

      const faz = new Set((meus.data ?? []).map((m) => m.service_id))
      setServicos(
        (cat.data ?? []).map((s) => ({
          id: s.id,
          nome: s.nome,
          preco: s.preco == null ? null : Number(s.preco),
          faz: faz.has(s.id),
        })),
      )
      setCarregando(false)
    }
    carregar()
  }, [professionalId, salonId])

  const marcados = servicos.filter((s) => s.faz)

  async function salvar() {
    // A régua mora no banco (`salvar_servicos_do_barbeiro` recusa lista vazia),
    // mas deixar o botão clicável para devolver erro depois é pior do que dizer
    // antes: barbeiro sem serviço nenhum volta a ser oferecido para TODOS.
    if (marcados.length === 0) return

    setSalvando(true)
    setErro(null)

    // Uma chamada só, como o horário. DELETE e INSERT separados deixariam o
    // barbeiro sem serviço nenhum se a rede caísse no meio — e sem lista ele é
    // oferecido para tudo de novo, calado.
    const { error } = await supabase.rpc('salvar_servicos_do_barbeiro', {
      p_professional_id: professionalId,
      p_service_ids: marcados.map((s) => s.id),
    })

    if (error) {
      console.error('Erro ao salvar os serviços:', error)
      setErro(
        traduzirErroDoBanco(
          error,
          undefined,
          'Não foi possível salvar. A lista anterior continua valendo — tente de novo.',
        ),
      )
      setSalvando(false)
      return
    }

    setSalvando(false)
    setSalvo(true)
    onSalvo()
    setTimeout(onClose, 900)
  }

  return (
    <Modal
      onClose={onClose}
      bloquearFechamento={salvando}
      titulo={
        <span className="flex items-center gap-2">
          <Scissors size={18} />
          Serviços de {nome}
        </span>
      }
      tamanho="sm"
    >
      {carregando ? (
        <SkeletonLinhas />
      ) : erroDeCarga ? (
        /* Erro de carga cala a lista inteira: mostrar "nenhum serviço" para
           quem só está sem rede faria o dono achar que o catálogo esvaziou. */
        <div className="space-y-3">
          <ErroInline>Não foi possível carregar os serviços.</ErroInline>
          <button
            onClick={() => window.location.reload()}
            className="w-full btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
          >
            Tentar de novo
          </button>
        </div>
      ) : servicos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A barbearia ainda não tem serviço ativo no catálogo. Cadastre um serviço primeiro — é
          dele que sai o que o barbeiro pode fazer.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            O que {nome.split(' ')[0]} faz de verdade. A agenda e o atendimento automático param de
            oferecer ele para o que estiver desmarcado.
          </p>

          {!confirmadoEm && (
            <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
              <strong className="font-medium">Ninguém escolheu ainda.</strong> Ao entrar na equipe
              ele passou a fazer todos os serviços — é isso que está marcado aqui, não uma decisão.
            </p>
          )}

          <div className="space-y-1">
            {servicos.map((s, i) => (
              <label
                key={s.id}
                className="flex items-center gap-2 py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={s.faz}
                  onChange={(e) =>
                    setServicos((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, faz: e.target.checked } : x)),
                    )
                  }
                  className="accent-primary"
                />
                <span className="text-sm text-foreground flex-1">{s.nome}</span>
                {s.preco != null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {s.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                )}
              </label>
            ))}
          </div>

          {marcados.length === 0 && (
            <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
              Marque ao menos um. Sem nenhum serviço marcado, o sistema volta a oferecer{' '}
              {nome.split(' ')[0]} para todos.
            </p>
          )}

          <ErroInline>{erro}</ErroInline>

          <button
            onClick={salvar}
            disabled={salvando || salvo || marcados.length === 0}
            className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {salvo
              ? 'Salvo!'
              : salvando
                ? 'Salvando...'
                : `Salvar ${marcados.length} ${marcados.length === 1 ? 'serviço' : 'serviços'}`}
          </button>
        </>
      )}
    </Modal>
  )
}
