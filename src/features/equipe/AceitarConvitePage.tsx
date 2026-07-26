import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Eye, EyeOff, Scissors } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'

type ConviteInfo = { nome: string; email: string; salao: string; role: string }

export function AceitarConvitePage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<ConviteInfo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

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
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    setSalvando(true)
    setErro(null)
    const { error } = await invokeFunction(
      'accept-invite',
      { body: { token, senha } },
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
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
            <Scissors size={18} />
          </span>
          <span className="font-semibold text-foreground">Salão CRM</span>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando convite...</p>
        ) : pronto ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <Check size={20} />
              <h1 className="text-base font-semibold">Conta criada!</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Agora é só entrar com o seu e-mail e a senha que você acabou de criar.
            </p>
            <Link
              to="/login"
              className="block w-full text-center btn-primary rounded px-3 py-2.5 text-sm font-medium"
            >
              Ir para o login
            </Link>
          </div>
        ) : !info ? (
          <div className="space-y-3">
            <h1 className="text-base font-semibold text-foreground">Convite indisponível</h1>
            <p className="text-sm text-danger">{erro}</p>
            <Link to="/login" className="block text-sm text-primary hover:underline">
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={aceitar} className="space-y-4">
            <div>
              <h1 className="text-base font-semibold text-foreground">Olá, {info.nome}!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Você foi convidado para trabalhar na <strong>{info.salao}</strong>. Crie sua senha
                para acessar.
              </p>
            </div>

            <div>
              <span className="text-xs font-medium text-muted-foreground">Seu e-mail</span>
              <div className="mt-1 bg-surface-2 rounded px-3 py-2 text-sm text-foreground">
                {info.email}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Crie uma senha</span>
              <div className="relative mt-1">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 pr-10 text-sm"
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

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Repita a senha</span>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </label>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <button
              type="submit"
              disabled={salvando}
              className="w-full btn-primary rounded px-3 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {salvando ? 'Criando conta...' : 'Criar minha conta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
