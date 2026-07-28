import { useState, type FormEvent } from 'react'
import { Package, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ServiceItem } from '../catalogo/types'
import type { Pacote } from './usePackagesData'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PacoteModal({
  salonId,
  servicos,
  pacote,
  onClose,
  onSalvo,
}: {
  salonId: string
  servicos: ServiceItem[]
  /** null = criando um pacote novo. */
  pacote: Pacote | null
  onClose: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(pacote?.nome ?? '')
  const [descricao, setDescricao] = useState(pacote?.descricao ?? '')
  const [preco, setPreco] = useState(pacote ? String(pacote.preco) : '')
  const [validadeDias, setValidadeDias] = useState(
    pacote?.validadeDias != null ? String(pacote.validadeDias) : '90',
  )
  const [semValidade, setSemValidade] = useState(pacote ? pacote.validadeDias == null : false)
  const [valeNaRede, setValeNaRede] = useState(pacote?.valeNaRede ?? false)
  const [enviarRecibo, setEnviarRecibo] = useState(pacote?.enviarReciboPorUso ?? true)
  const [quantidades, setQuantidades] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {}
    for (const i of pacote?.itens ?? []) inicial[i.serviceId] = i.quantidade
    return inicial
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ativos = servicos.filter((s) => s.ativo)
  const escolhidos = Object.entries(quantidades).filter(([, q]) => q > 0)
  const totalCreditos = escolhidos.reduce((s, [, q]) => s + q, 0)
  const valorAvulso = escolhidos.reduce((soma, [id, q]) => {
    const s = ativos.find((x) => x.id === id)
    return soma + (s ? s.preco * q : 0)
  }, 0)
  const precoNum = Number(preco) || 0
  const desconto = valorAvulso > 0 ? ((valorAvulso - precoNum) / valorAvulso) * 100 : 0

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Dê um nome ao pacote.')
      return
    }
    if (escolhidos.length === 0) {
      setErro('Escolha ao menos um serviço e a quantidade.')
      return
    }
    if (precoNum <= 0) {
      setErro('Informe o preço do pacote.')
      return
    }

    setSalvando(true)
    setErro(null)

    const dados = {
      salon_id: salonId,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      preco: precoNum,
      validade_dias: semValidade ? null : Number(validadeDias) || null,
      vale_na_rede: valeNaRede,
      enviar_recibo_por_uso: enviarRecibo,
    }

    const { data, error } = pacote
      ? await supabase.from('packages').update(dados).eq('id', pacote.id).select('id').single()
      : await supabase.from('packages').insert(dados).select('id').single()

    if (error || !data) {
      console.error('Erro ao salvar pacote:', error)
      setErro('Não foi possível salvar o pacote.')
      setSalvando(false)
      return
    }

    // Regrava os itens inteiros: mais simples e evita sobra de serviço removido.
    await supabase.from('package_items').delete().eq('package_id', data.id)
    const { error: itensError } = await supabase.from('package_items').insert(
      escolhidos.map(([serviceId, quantidade]) => ({
        package_id: data.id,
        service_id: serviceId,
        quantidade,
      })),
    )

    setSalvando(false)
    if (itensError) {
      console.error('Erro ao salvar itens do pacote:', itensError)
      setErro('O pacote foi salvo, mas os serviços não. Edite e tente de novo.')
      return
    }

    onSalvo()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Package size={18} />
            {pacote ? 'Editar pacote' : 'Novo pacote'}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={salvar} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Pacote Corte 5x"
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Descrição (opcional)</span>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>

          <div>
            <span className="text-xs font-medium text-muted-foreground">O que está incluso</span>
            <div className="mt-1 border border-border rounded-lg divide-y divide-border max-h-52 overflow-y-auto">
              {ativos.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Cadastre serviços antes de montar um pacote.
                </p>
              ) : (
                ativos.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">{s.nome}</div>
                      <div className="text-[11px] text-muted-foreground">{moeda(s.preco)} avulso</div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={quantidades[s.id] ?? 0}
                      onChange={(e) =>
                        setQuantidades((prev) => ({ ...prev, [s.id]: Number(e.target.value) || 0 }))
                      }
                      aria-label={`Quantidade de ${s.nome}`}
                      className="w-16 shrink-0 border border-border-strong bg-surface text-foreground rounded px-2 py-1 text-sm text-center"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Preço do pacote</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>

          {/* Mostra o desconto para o dono não vender abaixo do que pretendia. */}
          {totalCreditos > 0 && precoNum > 0 && (
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              {totalCreditos} atendimento{totalCreditos === 1 ? '' : 's'} · avulso sairia{' '}
              {moeda(valorAvulso)} ·{' '}
              {desconto >= 0 ? (
                <span className="text-success font-medium">{desconto.toFixed(0)}% de desconto</span>
              ) : (
                <span className="text-danger font-medium">
                  {Math.abs(desconto).toFixed(0)}% acima do avulso
                </span>
              )}
              <br />
              Cada atendimento vale {moeda(precoNum / totalCreditos)} para a comissão.
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={semValidade}
                onChange={(e) => setSemValidade(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">Sem validade</span>
            </label>

            {!semValidade && (
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Vence em (dias)</span>
                <input
                  type="number"
                  min={1}
                  value={validadeDias}
                  onChange={(e) => setValidadeDias(e.target.value)}
                  className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
                />
              </label>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={valeNaRede}
                onChange={(e) => setValeNaRede(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">Vale em todas as unidades da rede</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enviarRecibo}
                onChange={(e) => setEnviarRecibo(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">Avisar no WhatsApp a cada uso</span>
            </label>
          </div>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="w-full btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : pacote ? 'Salvar alterações' : 'Criar pacote'}
          </button>

          {pacote && (
            <p className="text-xs text-muted-foreground">
              Editar não muda pacotes já vendidos: quem comprou mantém as quantidades e o valor da
              época da compra.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
