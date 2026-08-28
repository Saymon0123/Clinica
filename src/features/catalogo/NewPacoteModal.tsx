import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Campo, Input, Select } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toast'
import type { Pacote } from './usePacotesData'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type ServicoOption = { id: string; nome: string; preco: number }
type ItemRascunho = { service_id: string; quantidade: number }

/**
 * Montagem do pacote pré-pago: "pague R$120 e ganhe 5 cortes".
 *
 * A composição vem do catálogo da própria barbearia, e o preço é livre — a
 * tela faz a conta na hora ("avulso sairia R$150, o cliente economiza 20%")
 * para o dono enxergar a margem que está dando antes de salvar.
 */
export function NewPacoteModal({
  salonId,
  pacote,
  onClose,
  onSaved,
}: {
  salonId: string
  pacote?: Pacote
  onClose: () => void
  onSaved: () => void
}) {
  const [servicos, setServicos] = useState<ServicoOption[]>([])
  const [nome, setNome] = useState(pacote?.nome ?? '')
  const [preco, setPreco] = useState(pacote ? String(pacote.preco) : '')
  const [validade, setValidade] = useState(pacote?.validade_dias ? String(pacote.validade_dias) : '')
  const [itens, setItens] = useState<ItemRascunho[]>(
    pacote?.itens.map((i) => ({ service_id: i.service_id, quantidade: i.quantidade })) ?? [],
  )
  const [novoServico, setNovoServico] = useState('')
  const [novaQtd, setNovaQtd] = useState(5)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('services')
      .select('id, nome, preco')
      .eq('salon_id', salonId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) =>
        setServicos((data ?? []).map((x) => ({ id: x.id, nome: x.nome, preco: Number(x.preco) }))),
      )
  }, [salonId])

  const valorAvulso = itens.reduce(
    (s, i) => s + (servicos.find((x) => x.id === i.service_id)?.preco ?? 0) * i.quantidade,
    0,
  )
  const precoNum = parseFloat(preco.replace(',', '.')) || 0
  const economia = valorAvulso > 0 && precoNum > 0 ? valorAvulso - precoNum : 0

  function adicionarItem() {
    if (!novoServico || novaQtd < 1) return
    if (itens.some((i) => i.service_id === novoServico)) {
      setErro('Esse serviço já está no pacote — edite a quantidade dele.')
      return
    }
    setErro(null)
    setItens((prev) => [...prev, { service_id: novoServico, quantidade: novaQtd }])
    setNovoServico('')
    setNovaQtd(5)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Dê um nome ao pacote — é o que o cliente vai ouvir no balcão.')
      return
    }
    if (itens.length === 0) {
      setErro('Adicione ao menos um serviço ao pacote.')
      return
    }
    if (!Number.isFinite(precoNum) || precoNum <= 0) {
      setErro('Informe o preço do pacote.')
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      const payload = {
        nome: nome.trim(),
        preco: precoNum,
        validade_dias: validade.trim() ? Math.max(1, parseInt(validade, 10) || 0) : null,
      }

      let pacoteId = pacote?.id
      if (pacote) {
        const { error: upError } = await supabase.from('pacotes').update(payload).eq('id', pacote.id)
        if (upError) throw upError
        // Composição: substitui inteira. Pacotes já vendidos não mudam — o
        // saldo do cliente aponta para os itens da época via consumos.
        const { error: delError } = await supabase.from('pacote_itens').delete().eq('pacote_id', pacote.id)
        if (delError) throw delError
      } else {
        const { data: novo, error: insError } = await supabase
          .from('pacotes')
          .insert({ salon_id: salonId, ...payload })
          .select('id')
          .single()
        if (insError || !novo) throw insError ?? new Error('Falha ao criar o pacote.')
        pacoteId = novo.id
      }

      const { error: itensError } = await supabase.from('pacote_itens').insert(
        itens.map((i) => ({ pacote_id: pacoteId, service_id: i.service_id, quantidade: i.quantidade })),
      )
      if (itensError) throw itensError

      toast(pacote ? 'Pacote atualizado' : 'Pacote criado')
      onSaved()
      onClose()
    } catch (err) {
      console.error('Erro ao salvar o pacote:', err)
      setErro('Não foi possível salvar o pacote. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal onClose={onClose} titulo={pacote ? 'Editar pacote' : 'Novo pacote'} tamanho="md">
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nome do pacote" htmlFor="nome-pacote">
            <Input
              id="nome-pacote"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="5 cortes"
            />
          </Campo>

          <div>
            <span className="text-xs font-medium text-muted-foreground">O que está incluído</span>
            <div className="mt-1 space-y-1.5">
              {itens.map((i) => {
                const svc = servicos.find((x) => x.id === i.service_id)
                return (
                  <div key={i.service_id} className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2 text-sm">
                    <span className="flex-1 min-w-0 truncate text-foreground">
                      {i.quantidade}× {svc?.nome ?? '...'}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      avulso {moeda((svc?.preco ?? 0) * i.quantidade)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItens((prev) => prev.filter((x) => x.service_id !== i.service_id))}
                      aria-label="Remover"
                      className="text-muted-foreground hover:text-danger shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <Select
                value={novoServico}
                onChange={(e) => setNovoServico(e.target.value)}
                className="flex-1 min-w-0"
              >
                <option value="">Serviço...</option>
                {servicos
                  .filter((x) => !itens.some((i) => i.service_id === x.id))
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome} — {moeda(x.preco)}
                    </option>
                  ))}
              </Select>
              <input
                type="number"
                min={1}
                value={novaQtd}
                onChange={(e) => setNovaQtd(parseInt(e.target.value, 10) || 1)}
                aria-label="Quantidade"
                className="w-16 border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm"
              />
              <button
                type="button"
                onClick={adicionarItem}
                className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium inline-flex items-center gap-1"
              >
                <Plus size={14} />
                Incluir
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Preço do pacote (R$)" htmlFor="preco-pacote">
              <Input
                id="preco-pacote"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="120,00"
              />
            </Campo>
            <Campo rotulo="Validade (dias, opcional)" htmlFor="validade-pacote">
              <Input
                id="validade-pacote"
                type="number"
                min={1}
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                placeholder="90"
              />
            </Campo>
          </div>

          {valorAvulso > 0 && precoNum > 0 && (
            <p
              className={`text-sm rounded-lg px-3 py-2 ${
                economia >= 0 ? 'bg-primary-soft/40 text-foreground' : 'bg-warning-soft text-foreground'
              }`}
            >
              Avulso sairia por <strong>{moeda(valorAvulso)}</strong>.{' '}
              {economia > 0 ? (
                <>
                  O cliente economiza <strong>{moeda(economia)}</strong> (
                  {Math.round((economia / valorAvulso) * 100)}%).
                </>
              ) : economia === 0 ? (
                'Mesmo preço do avulso — sem vantagem para o cliente.'
              ) : (
                'Atenção: o pacote está MAIS CARO que o avulso.'
              )}
            </p>
          )}

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar pacote'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
