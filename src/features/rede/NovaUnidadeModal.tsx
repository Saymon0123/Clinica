import { useState, type FormEvent } from 'react'
import { Building2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Campo, Input } from '../../components/Campo'
import { invokeFunction } from '../../lib/invokeFunction'
import { ErroInline } from '../../components/ErroInline'

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
  primeiraUnidade,
  onClose,
  onCriada,
}: {
  /** A unidade de onde esta nasce. Serviços e horário vêm dela por padrão. */
  salonId: string
  /**
   * A origem ainda não pertence a uma rede: este "Adicionar unidade" é o que
   * cria a rede, e o dono escolhe o nome dela aqui — senão a rede nasce com o
   * nome da barbearia e não há tela para renomear.
   */
  primeiraUnidade?: boolean
  onClose: () => void
  onCriada: (resultado: Resultado) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [nomeRede, setNomeRede] = useState('')
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
          nomeRede: primeiraUnidade ? nomeRede.trim() || undefined : undefined,
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
    <Modal
      onClose={onClose}
      titulo={
        <span className="flex items-center gap-2">
          <Building2 size={18} />
          Nova unidade
        </span>
      }
      tamanho="sm"
    >
        <form onSubmit={criar} className="space-y-3">
          {primeiraUnidade && (
            <Campo
              rotulo="Nome da rede"
              htmlFor="unidade-nome-rede"
              apoio="Como o conjunto das unidades se chama. Em branco, usa o nome da barbearia atual."
            >
              <Input
                id="unidade-nome-rede"
                value={nomeRede}
                onChange={(e) => setNomeRede(e.target.value)}
                placeholder="Ex: Barbearia do Zé"
              />
            </Campo>
          )}
          <Campo rotulo="Nome da unidade" htmlFor="unidade-nome">
            <Input
              id="unidade-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Unidade Centro"
              autoFocus
            />
          </Campo>
          <Campo rotulo="Endereço" htmlFor="unidade-endereco">
            <Input id="unidade-endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </Campo>
          <Campo rotulo="Telefone" htmlFor="unidade-telefone">
            <Input id="unidade-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </Campo>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={copiarCatalogo}
              onChange={(e) => setCopiarCatalogo(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm text-foreground">Copiar os serviços desta unidade</span>
          </label>

          <ErroInline>{erro}</ErroInline>

          <button
            type="submit"
            disabled={salvando}
            className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {salvando ? 'Criando...' : 'Criar unidade'}
          </button>
          <p className="text-xs text-muted-foreground">
            Você entra como dono da nova unidade, com 7 dias de teste. O horário de funcionamento
            vem desta unidade; os barbeiros são convidados depois, pela aba Equipe.
          </p>
        </form>
    </Modal>
  )
}
