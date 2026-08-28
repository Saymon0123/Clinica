import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { urlDeRedefinicaoDeSenha } from '../../lib/appUrl'
import {
  CODIGO_MAX,
  codigoPareceValido,
  hashDeEntrada,
  mensagemDeErroDoRetorno,
  normalizarCodigo,
} from '../../lib/recuperacaoSenha'
import { useAuth } from './AuthContext'

/**
 * Redefinição de senha por **código de 6 dígitos**, sem sair do site.
 *
 * O fluxo por link dependia de o Supabase redirecionar de volta para a
 * aplicação, e isso quebrava de duas formas: a URL precisa estar na lista de
 * permitidas do projeto (senão o Supabase manda para a Site URL em silêncio), e
 * no celular o link costuma abrir num navegador diferente daquele em que a
 * pessoa estava — a sessão nasce no lugar errado.
 *
 * Com código digitado não há redirecionamento nenhum: a pessoa recebe seis
 * dígitos, digita aqui e cria a senha na mesma tela.
 *
 * Requer que o template "Reset Password" no painel do Supabase use
 * `{{ .Token }}` (o código) em vez de apenas `{{ .ConfirmationURL }}`.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { concluirRecuperacao } = useAuth()

  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Quem chegou aqui por um link vencido merece saber o motivo.
  const [avisoDoLink] = useState(() => mensagemDeErroDoRetorno(hashDeEntrada()))

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      // `redirectTo` continua indo: se o template ainda mandar link, ele
      // funciona pelo caminho antigo.
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: urlDeRedefinicaoDeSenha(),
      })
      // Rate limit e afins vêm como `error`, não como throw — sem checar,
      // a tela avançava para "digite o código" de um e-mail que nunca saiu.
      if (error) throw error
      // Avança sempre, mesmo se o e-mail não existir: dizer "esse e-mail não
      // tem conta" revelaria quais endereços estão cadastrados.
      setEtapa('codigo')
    } catch (err) {
      console.error('Erro ao solicitar redefinição de senha:', err)
      setErro('Não foi possível enviar o código agora. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  async function salvarNovaSenha(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!codigoPareceValido(codigo)) {
      setErro('Código incompleto. Confira o que chegou no e-mail.')
      return
    }
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirmar) {
      setErro('As senhas não coincidem.')
      return
    }

    setEnviando(true)
    try {
      // O código autentica a pessoa; só depois dá para trocar a senha.
      const { error: erroCodigo } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: normalizarCodigo(codigo),
        type: 'recovery',
      })
      if (erroCodigo) {
        setErro('Código inválido ou expirado. Peça um novo e tente de novo.')
        return
      }

      const { error: erroSenha } = await supabase.auth.updateUser({ password: senha })
      if (erroSenha) {
        setErro('Não foi possível salvar a nova senha. Tente novamente.')
        return
      }

      concluirRecuperacao()
      navigate('/')
    } catch (err) {
      console.error('Erro ao redefinir senha:', err)
      setErro('Não foi possível redefinir a senha. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-surface p-6 sm:p-8 rounded-xl border border-border space-y-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          {etapa === 'email' ? 'Esqueci minha senha' : 'Criar nova senha'}
        </h1>

        {avisoDoLink && etapa === 'email' && (
          <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
            {avisoDoLink}
          </p>
        )}

        {etapa === 'email' ? (
          <form onSubmit={pedirCodigo} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {/* Sem dizer o tamanho do código: ele é configurável no Supabase
                  (6 a 10) e o texto envelheceria de novo a cada ajuste. */}
              Informe o e-mail da sua conta. Vamos enviar um código de acesso.
            </p>

            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-3 text-base"
              />
            </div>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="w-full btn-primary rounded-lg px-3 py-3 text-sm font-medium disabled:opacity-50"
            >
              {enviando ? 'Enviando...' : 'Enviar código'}
            </button>

            <Link to="/login" className="block text-center text-sm text-muted-foreground underline">
              Voltar para o login
            </Link>
          </form>
        ) : (
          <form onSubmit={salvarNovaSenha} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se houver conta com esse e-mail, enviamos um código. Verifique também o spam.
              Digite o código e escolha a nova senha.
            </p>

            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="codigo">Código</label>
              <input
                id="codigo"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                // Folga sobre o maior codigo possivel (10 digitos), porque
                // quem cola do e-mail traz espaco ou traco junto -- eles sao
                // removidos depois, por `normalizarCodigo`. Estava em 7, e o
                // oitavo digito do codigo real nao cabia no campo.
                maxLength={CODIGO_MAX + 4}
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-3 text-base tracking-[0.3em] text-center"
              />
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="senha">Nova senha</label>
              <div className="relative">
                <input
                  id="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-3 pr-11 text-base"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
                >
                  {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="confirmar">
                Confirmar nova senha
              </label>
              <input
                id="confirmar"
                type={mostrarSenha ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-3 text-base"
              />
            </div>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="w-full btn-primary rounded-lg px-3 py-3 text-sm font-medium disabled:opacity-50"
            >
              {enviando ? 'Salvando...' : 'Salvar nova senha'}
            </button>

            <button
              type="button"
              onClick={() => {
                setEtapa('email')
                setCodigo('')
                setErro(null)
              }}
              className="w-full text-center text-sm text-muted-foreground underline"
            >
              Não recebi o código
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
