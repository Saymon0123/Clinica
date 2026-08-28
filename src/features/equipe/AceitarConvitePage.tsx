import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Eye, EyeOff, Scissors } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'
import { Input } from '../../components/Campo'
import { VERSAO_DOS_TERMOS } from '../../lib/termos'
import { ErroInline } from '../../components/ErroInline'

type ConviteInfo = {
  nome: string | null
  email: string
  salao: string
  role: string
  /** Convite de dono vem sem nome — quem aceita digita o próprio. */
  pedeNome?: boolean
  /**
   * O e-mail já tem conta no Club Cut. Muda o modo da tela: em vez de criar
   * senha, a pessoa ENTRA com a que já possui — a senha é a prova de posse do
   * e-mail, e é o que impede alguém com o link de sequestrar conta alheia ou
   * de vincular um terceiro a uma equipe sem consentimento.
   */
  contaExiste?: boolean
}

export function AceitarConvitePage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<ConviteInfo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  // Começa DESMARCADO de propósito. Caixa pré-marcada não é ato afirmativo, e
  // é a diferença entre um aceite que segura numa disputa e um que não.
  const [aceitouTermos, setAceitouTermos] = useState(false)
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    async function checar() {
      if (!token) {
        setErro('Convite inválido.')
        setCarregando(false)
        return
      }
      const { data, error } = await invokeFunction<ConviteInfo>(
        'accept-invite',
        { body: { action: 'check', token } },
        'Não foi possível carregar o convite. Verifique sua conexão.',
      )
      if (error || !data) {
        setErro(error ?? 'Convite inválido ou expirado.')
      } else {
        setInfo(data)
      }
      setCarregando(false)
    }
    checar()
  }, [token])

  async function aceitar(e: FormEvent) {
    e.preventDefault()
    if (info?.pedeNome && !nome.trim()) {
      setErro('Informe seu nome.')
      return
    }
    if (!aceitouTermos) {
      setErro('É preciso aceitar os termos de uso para continuar.')
      return
    }
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    // Quem já tem conta digita a senha EXISTENTE — repetição não prova nada
    // nesse caso, só atrapalha.
    if (!info?.contaExiste && senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    setSalvando(true)
    setErro(null)
    const { error } = await invokeFunction(
      'accept-invite',
      // A versão vai junto: é ela que liga o registro do aceite ao texto exato
      // que estava no ar quando a pessoa marcou a caixa.
      { body: { token, senha, nome: nome.trim() || undefined, versaoTermos: VERSAO_DOS_TERMOS } },
      'Não foi possível concluir o cadastro. Tente novamente.',
    )
    setSalvando(false)
    if (error) {
      setErro(error)
      return
    }
    setPronto(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
            <Scissors size={18} />
          </span>
          <span className="font-semibold text-foreground">Club Cut</span>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando convite...</p>
        ) : pronto ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <Check size={20} />
              <h1 className="text-base font-semibold">
                {info?.contaExiste ? 'Convite aceito!' : 'Conta criada!'}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {info?.contaExiste
                ? 'A barbearia foi adicionada à sua conta. Entre normalmente e escolha a unidade.'
                : 'Agora é só entrar com o seu e-mail e a senha que você acabou de criar.'}
            </p>
            <Link
              to="/login"
              className="block w-full text-center btn-primary rounded-lg px-3 py-2.5 text-sm font-medium"
            >
              Ir para o login
            </Link>
          </div>
        ) : !info ? (
          <div className="space-y-3">
            <h1 className="text-base font-semibold text-foreground">Convite indisponível</h1>
            <ErroInline>{erro}</ErroInline>
            <Link to="/login" className="block text-sm text-primary hover:underline">
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={aceitar} className="space-y-4">
            <div>
              {/* Sem nome o cumprimento sairia como "Olá, !". E quem é dono não
                  foi convidado para *trabalhar na* barbearia — ela é dele. */}
              <h1 className="text-base font-semibold text-foreground">
                {info.nome ? `Olá, ${info.nome}!` : 'Bem-vindo!'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {info.contaExiste ? (
                  <>
                    Você foi convidado para a <strong>{info.salao}</strong>. Como você já tem conta
                    no Club Cut, entre com a sua senha para aceitar — a barbearia é adicionada à
                    conta que você já usa.
                  </>
                ) : info.role === 'owner' ? (
                  <>
                    Seu acesso à <strong>{info.salao}</strong> está pronto. Crie sua senha para
                    entrar.
                  </>
                ) : (
                  <>
                    Você foi convidado para trabalhar na <strong>{info.salao}</strong>. Crie sua
                    senha para acessar.
                  </>
                )}
              </p>
            </div>

            <div>
              <span className="text-xs font-medium text-muted-foreground">Seu e-mail</span>
              <div className="mt-1 bg-surface-2 rounded-lg px-3 py-2 text-sm text-foreground">
                {info.email}
              </div>
            </div>

            {info.pedeNome && (
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Como você se chama?</span>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                  className="mt-1"
                />
                <span className="block text-[11px] text-muted-foreground mt-1">
                  É o nome que aparece na agenda e que o atendimento no WhatsApp usa.
                </span>
              </label>
            )}

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {info.contaExiste ? 'Sua senha do Club Cut' : 'Crie uma senha'}
              </span>
              <div className="relative mt-1">
                <Input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={info.contaExiste ? 'A senha da sua conta' : 'Mínimo 8 caracteres'}
                  autoComplete={info.contaExiste ? 'current-password' : 'new-password'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {/* Repetir só faz sentido quando a senha está sendo INVENTADA. */}
            {!info.contaExiste && (
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Repita a senha</span>
                <Input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  className="mt-1"
                />
              </label>
            )}

            {/* Os links abrem em aba nova: clicar para ler não pode custar a
                senha já digitada e o convite aberto. */}
            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={aceitouTermos}
                onChange={(e) => setAceitouTermos(e.target.checked)}
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

            <ErroInline>{erro}</ErroInline>

            <button
              type="submit"
              disabled={salvando}
              className="w-full btn-primary rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {salvando
                ? info.contaExiste
                  ? 'Aceitando convite...'
                  : 'Criando conta...'
                : info.contaExiste
                  ? 'Entrar e aceitar convite'
                  : 'Criar minha conta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
