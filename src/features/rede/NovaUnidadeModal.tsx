import { useState, type FormEvent } from 'react'
import { Building2, X } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'

type Resultado = {
  salonId: string
  nome: string
  organizationId: string
  /** A barbearia de origem acabou de virar rede — era avulsa até agora. */
  redeCriada: boolean
  servicosCopiados: number
}

/**
 * Cria uma unidade a partir da barbearia atual.
 *
 * Mora fora da RedePage porque tem dois donos: a aba Rede (quem já é rede) e
 * as Configurações (quem ainda não é). É no segundo lugar que a rede nasce —
 * rede não é um cadastro, é o que acontece quando uma barbearia abre a segunda
 * unidade. Manter o modal só na aba Rede era o ovo e a galinha: a aba exige
 * rede, e nada fora dela criava uma.
 */
export function NovaUnidadeModal({
  salonId,
  onClose,
  onCriada,
}: {
  /** A unidade de onde esta nasce. Serviços e horário vêm dela por padrão. */
  salonId: string
  onClose: () => void
  onCriada: (resultado: Resultado) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [telefone, setTelefone] = useState('')
  const [copiarCatalogo, setCopiarCatalogo] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Informe o nome da unidade.')
      return
    }

    setSalvando(true)
    setErro(null)
    const { data, error } = await invokeFunction<Resultado>(
      'add-salon-unit',
      {
        body: {
          salonId,
          nome: nome.trim(),
          endereco: endereco.trim(),
          telefone: telefone.trim(),
          copiarCatalogo,
        },
      },
      'Não foi possível criar a unidade.',
    )
    setSalvando(false)

    if (error || !data) {
      setErro(error ?? 'Não foi possível criar a unidade.')
      return
    }
    await onCriada(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Building2 size={18} />
            Nova unidade
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={criar} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Nome da unidade</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="Ex: Unidade Centro"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Endereço</span>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Telefone</span>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={copiarCatalogo}
              onChange={(e) => setCopiarCatalogo(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm text-foreground">Copiar os serviços desta unidade</span>
          </label>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="w-full btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {salvando ? 'Criando...' : 'Criar unidade'}
          </button>
          <p className="text-xs text-muted-foreground">
            Você entra como dono da nova unidade, com 7 dias de teste. O horário de funcionamento
            vem desta unidade; os barbeiros são convidados depois, pela aba Equipe.
          </p>
        </form>
      </div>
    </div>
  )
}
