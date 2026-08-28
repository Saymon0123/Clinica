import { useState, type FormEvent } from 'react'
import { Check, CreditCard } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { apenasDigitos, formatarDocumento, problemaNoDocumento } from '../../lib/documento'
import { Campo, Input } from '../../components/Campo'
import { ErroInline } from '../../components/ErroInline'

/**
 * Coleta o CPF/CNPJ de quem paga a plataforma.
 *
 * O Asaas **exige** o documento para criar o cliente — sem ele não existe
 * assinatura. Pedimos aqui, e não no cadastro da barbearia, porque é o momento
 * em que a pessoa decidiu pagar; antes disso é atrito puro.
 *
 * A validação é local de propósito: o Asaas recusa documento inválido com um
 * erro genérico, e o dono concluiria que o sistema está quebrado em vez de
 * perceber que trocou um dígito.
 */
export function DadosDeCobranca({
  salonId,
  documentoAtual,
  onSalvo,
}: {
  salonId: string
  documentoAtual: string | null
  onSalvo: () => void
}) {
  const [documento, setDocumento] = useState(formatarDocumento(documentoAtual ?? ''))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  // Já preenchido, o formulário vira uma linha. Antes ele continuava dizendo
  // "precisamos do CPF ou CNPJ" com o campo cheio — pedia o que já tinha, e
  // ocupava o mesmo espaço das coisas que ainda exigem decisão.
  const [editando, setEditando] = useState(false)

  if (documentoAtual && !editando) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-sm px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CreditCard size={16} className="text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground shrink-0">Cobrança para</span>
          <span className="text-sm text-foreground tabular-nums truncate">
            {formatarDocumento(documentoAtual)}
          </span>
        </div>
        <button
          onClick={() => setEditando(true)}
          className="text-sm font-medium text-muted-foreground hover:text-foreground shrink-0"
        >
          Alterar
        </button>
      </div>
    )
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const problema = problemaNoDocumento(documento)
    if (problema) {
      setErro(problema)
      return
    }

    setSalvando(true)
    setErro(null)
    // O `.select()` não é enfeite: sem ele um UPDATE barrado por permissão volta
    // 204 **sem erro**, e a tela dizia "Salvo" enquanto nada era gravado. Contar
    // as linhas é o que separa "gravou" de "não tinha permissão".
    const { data, error } = await supabase
      .from('subscriptions')
      .update({ cpf_cnpj: apenasDigitos(documento) })
      .eq('salon_id', salonId)
      .select('id')

    setSalvando(false)
    if (error) {
      console.error('Erro ao salvar os dados de cobrança:', error)
      setErro('Não foi possível salvar agora. Tente de novo em instantes.')
      return
    }
    if (!data || data.length === 0) {
      console.error('Update sem linhas afetadas em subscriptions do salao', salonId)
      setErro('Você não tem permissão para alterar a cobrança desta barbearia.')
      return
    }
    setSalvo(true)
    setEditando(false)
    onSalvo()
  }

  return (
    <form onSubmit={salvar} className="bg-surface border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Dados de cobrança</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Precisamos do CPF ou CNPJ de quem vai pagar para emitir a cobrança.
      </p>

      <Campo rotulo="CPF ou CNPJ" htmlFor="cobranca-documento">
        <Input
          id="cobranca-documento"
          value={documento}
          onChange={(e) => {
            setDocumento(formatarDocumento(e.target.value))
            setErro(null)
            setSalvo(false)
          }}
          inputMode="numeric"
          placeholder="000.000.000-00"
        />
      </Campo>

      <div className="mt-2"><ErroInline>{erro}</ErroInline></div>

      <div className="flex items-center gap-3 mt-3">
        <button
          type="submit"
          disabled={salvando}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        {documentoAtual && (
          <button
            type="button"
            onClick={() => {
              setDocumento(formatarDocumento(documentoAtual))
              setErro(null)
              setEditando(false)
            }}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        )}
        {salvo && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <Check size={16} />
            Salvo
          </span>
        )}
      </div>
    </form>
  )
}
