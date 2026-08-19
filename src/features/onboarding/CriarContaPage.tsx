import { useState, type FormEvent } from 'react'
import { MarcaClubCut } from '../../components/MarcaClubCut'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { APP_URL } from '../../lib/appUrl'
import { DIAS_DE_TESTE } from '../../lib/planos'

/**
 * Primeiro passo do cadastro aberto: a conta.
 *
 * Usa o `signUp` do próprio Supabase, de propósito. Criar o usuário por edge
 * function exigiria marcar o e-mail como confirmado sem verificar nada — o que
 * a `accept-invite` faz, e ali é aceitável porque o e-mail veio de nós. Num
 * cadastro aberto, permitiria criar conta com o e-mail de qualquer pessoa.
 *
 * Assim, confirmação de e-mail, limite de tentativas e regras de senha ficam
 * com a plataforma, e não com código nosso.
 *
 * A barbearia **não** é criada aqui. Ela vem no passo 2, depois de confirmar o
 * e-mail e entrar — ver `CriarBarbeariaPage`.
 */
const SENHA_MINIMA = 8

export function CriarContaPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [reenviado, setReenviado] = useState(false)

  /**
   * Sem isto, "não recebi o e-mail" era beco: a pessoa não conseguia entrar
   * (conta não confirmada) nem se cadastrar de novo (e-mail já existe). A
   * única saída era falar com você — e a maioria não fala, some.
   */
  async function reenviar() {
    setErro(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: APP_URL },
    })
    if (error) {
      console.error('Erro ao reenviar confirmacao:', error)
      // O Supabase limita reenvio por endereço. Dizer "espere um pouco" é mais
      // útil que repetir "não foi possível".
      setErro('Aguarde um minuto antes de pedir outro e-mail.')
      return
    }
    setReenviado(true)
  }

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Informe um e-mail válido.')
    if (senha.length < SENHA_MINIMA) {
      return setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
    }

    setEnviando(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      // Para onde o link do e-mail volta. Sem isto o Supabase manda para a
      // Site URL do projeto, que pode não ser o endereço em que a pessoa está.
      options: { emailRedirectTo: APP_URL },
    })
    setEnviando(false)

    if (error) {
      console.error('Erro no cadastro:', error)
      setErro('Não foi possível criar a conta agora. Tente novamente em instantes.')
      return
    }

    // Avança sempre, inclusive quando o e-mail já tem conta — o Supabase não
    // distingue os dois casos justamente para não revelar quais endereços
    // estão cadastrados. É o mesmo tratamento de "Esqueci minha senha".
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
        <div className="surge w-full max-w-sm bg-surface border border-border rounded-xl p-6 space-y-4 shadow-[0_16px_40px_-24px_color-mix(in_srgb,var(--foreground)_45%,transparent)]">
          <div className="flex items-center gap-2 text-success">
            <MailCheck size={20} />
            <h1 className="text-base font-semibold">Confira seu e-mail</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Mandamos um link de confirmação para <strong className="text-foreground">{email}</strong>
            . Abra o link para ativar sua conta. <strong>Verifique também o spam</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            Se esse e-mail já tinha conta, nada mudou: é só entrar normalmente.
          </p>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <Link
            to="/login"
            className="block w-full text-center btn-primary rounded-lg px-3 py-3 text-sm font-semibold"
          >
            Ir para o login
          </Link>

          {reenviado ? (
            <p className="text-center text-xs text-success">Mandamos outro. Confira o spam.</p>
          ) : (
            <button
              onClick={reenviar}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Não recebi o e-mail
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-10">
      <div className="surge w-full max-w-sm bg-surface border border-border rounded-xl p-6 space-y-5 shadow-[0_16px_40px_-24px_color-mix(in_srgb,var(--foreground)_45%,transparent)]">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary text-primary-foreground shrink-0">
            <MarcaClubCut size={20} />
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground">Club Cut</span>
        </div>

        <div>
          <h1 className="text-base font-semibold text-foreground">Criar conta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {DIAS_DE_TESTE} dias grátis, sem cartão. Leva um minuto.
          </p>
        </div>

        <form onSubmit={criar} className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Seu e-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 text-base transition-colors duration-150 focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Crie uma senha</span>
            <div className="relative mt-1">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                className="w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 pr-11 text-base transition-colors duration-150 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="w-full btn-primary rounded-lg px-3 py-3.5 text-base font-semibold disabled:opacity-50"
          >
            {enviando ? 'Criando...' : 'Criar conta'}
          </button>
        </form>

        {/* O aceite dos termos fica no passo 2, junto com a criação da
            barbearia: é lá que existe salão para vincular o registro, e é lá
            que o contrato de fato começa a valer. */}
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
