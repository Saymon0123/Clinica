import { useState, type FormEvent } from 'react'
import { MarcaClubCut } from '../../components/MarcaClubCut'
import { invokeFunction } from '../../lib/invokeFunction'
import { useSalon } from '../auth/useSalon'
import { useAuth } from '../auth/AuthContext'
import { VERSAO_DOS_TERMOS } from '../../lib/termos'

/**
 * Segundo passo do cadastro: a pessoa já tem conta e cria a própria barbearia.
 *
 * Ocupa o lugar do que antes era uma mensagem sem saída — *"Sua conta ainda não
 * está vinculada a um salão. Fale com o administrador"* — repetida em seis
 * telas. Era literalmente um beco: quem caísse ali não tinha o que fazer.
 *
 * Dois campos, e nenhum a mais. O nome da pessoa vai para a agenda e é como o
 * agente se refere ao barbeiro; o nome da barbearia é como ele se apresenta ao
 * cliente. Os dois são impossíveis de adivinhar — horário, catálogo e o resto
 * têm padrão e são corrigidos depois, em telas que já existem.
 */
export function CriarBarbeariaPage() {
  const { recarregarUnidades } = useSalon()
  const { signOut } = useAuth()

  const [nome, setNome] = useState('')
  const [nomeSalao, setNomeSalao] = useState('')
  // Terceiro campo, contra a regra de "dois e nenhum a mais" — e por um motivo
  // concreto: sem telefone o produto não tem **nenhum** jeito de falar com o
  // dono fora do CRM. Em 2026-08-14, quatro das cinco barbearias não tinham
  // telefone nenhum, e o aviso de fim de teste não tinha para onde ir.
  const [telefone, setTelefone] = useState('')
  // Desmarcado de propósito: caixa pré-marcada não é ato afirmativo.
  const [aceitou, setAceitou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!nome.trim()) return setErro('Informe seu nome.')
    if (!nomeSalao.trim()) return setErro('Informe o nome da barbearia.')
    if (telefone.replace(/\D/g, '').length < 10) {
      return setErro('Informe um WhatsApp com DDD.')
    }
    if (!aceitou) return setErro('É preciso aceitar os termos de uso para continuar.')

    setSalvando(true)
    const { error } = await invokeFunction('criar-minha-barbearia', {
      body: {
        nome: nome.trim(),
        nomeSalao: nomeSalao.trim(),
        telefone: telefone.trim(),
        versaoTermos: VERSAO_DOS_TERMOS,
      },
    })

    if (error) {
      setSalvando(false)
      setErro(error)
      return
    }

    // Não desliga o "salvando": recarregar troca a tela inteira, e voltar o
    // botão ao normal por um instante daria a impressão de que nada aconteceu.
    await recarregarUnidades()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
            <MarcaClubCut size={18} />
          </span>
          <span className="font-semibold text-foreground">Club Cut</span>
        </div>

        <div>
          <h1 className="text-base font-semibold text-foreground">Vamos criar sua barbearia</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Só o essencial agora. Horário, serviços e preços já vêm preenchidos e você ajusta
            depois.
          </p>
        </div>

        <form onSubmit={criar} className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Seu nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como os clientes te chamam"
              autoComplete="name"
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Nome da barbearia</span>
            <input
              value={nomeSalao}
              onChange={(e) => setNomeSalao(e.target.value)}
              placeholder="Ex.: Barbearia do Zé"
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-[11px] text-muted-foreground mt-1">
              É assim que o atendimento automático se apresenta aos seus clientes.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Seu WhatsApp</span>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(41) 99999-9999"
              inputMode="tel"
              autoComplete="tel"
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-[11px] text-muted-foreground mt-1">
              É por aqui que avisamos você sobre o teste e o pagamento. Não vai para seus clientes.
            </span>
          </label>

          {/* Aba nova: clicar para ler não pode custar o que já foi digitado. */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aceitou}
              onChange={(e) => setAceitou(e.target.checked)}
              className="mt-0.5 accent-primary shrink-0"
            />
            <span className="text-xs text-muted-foreground">
              Li e aceito os{' '}
              <a
                href="/termos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                termos de uso
              </a>{' '}
              e a{' '}
              <a
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                política de privacidade
              </a>
              .
            </span>
          </label>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="w-full btn-primary rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {salvando ? 'Criando...' : 'Criar minha barbearia'}
          </button>
        </form>

        {/* Saída para quem entrou na conta errada. Sem isto a tela vira beco
            de novo — que é exatamente o defeito que ela veio consertar. */}
        <button
          onClick={() => signOut()}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          Sair desta conta
        </button>
      </div>
    </div>
  )
}
