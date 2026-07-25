import { useState, type FormEvent } from 'react'
import { Check, Copy, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const SECRET_STORAGE_KEY = 'admin_tool_secret'

type Result = {
  email: string
  tempPassword: string
  salonId: string
}

function AccessGate({ onUnlock }: { onUnlock: (secret: string) => void }) {
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const secret = value.trim()
    if (!secret || checking) return

    setChecking(true)
    setError(null)
    try {
      // Valida a senha no servidor ANTES de liberar o formulário.
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-salon', {
        headers: { 'x-admin-secret': secret },
        body: { action: 'verify' },
      })

      if (invokeError || data?.error || !data?.ok) {
        setError('Senha incorreta. Verifique e tente novamente.')
        return
      }

      sessionStorage.setItem(SECRET_STORAGE_KEY, secret)
      onUnlock(secret)
    } catch (err) {
      console.error('Erro ao validar senha administrativa:', err)
      setError('Não foi possível validar a senha agora. Verifique sua conexão e tente novamente.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-6 rounded-lg shadow space-y-4">
        <div className="flex items-center gap-2 text-gray-900">
          <Lock size={18} />
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          placeholder="Senha de acesso"
          autoFocus
          className={`w-full border rounded px-3 py-2 text-sm ${
            error ? 'border-red-400 focus:outline-red-400' : 'border-gray-300'
          }`}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="w-full btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {checking ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-gray-100 rounded px-3 py-2 text-sm break-all">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copiar ${label}`}
          className="p-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 shrink-0"
        >
          {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}

export function NovaBarbeariaPage() {
  const [secret, setSecret] = useState<string | null>(() => sessionStorage.getItem(SECRET_STORAGE_KEY))

  const [salonName, setSalonName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  if (!secret) {
    return <AccessGate onUnlock={setSecret} />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-salon', {
        headers: { 'x-admin-secret': secret! },
        body: {
          salonName,
          ownerName,
          ownerEmail,
          ownerPhone,
        },
      })

      if (invokeError || data?.error) {
        if (data?.error === 'Não autorizado.') {
          sessionStorage.removeItem(SECRET_STORAGE_KEY)
          setSecret(null)
          return
        }
        setError(data?.error ?? 'Não foi possível cadastrar a barbearia.')
        return
      }

      setResult(data as Result)
      setSalonName('')
      setOwnerName('')
      setOwnerEmail('')
      setOwnerPhone('')
    } catch (err) {
      console.error('Erro ao cadastrar barbearia:', err)
      setError('Não foi possível cadastrar a barbearia. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">Cadastrar nova barbearia</h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="salonName">Nome da barbearia</label>
            <input
              id="salonName"
              value={salonName}
              onChange={(e) => setSalonName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="ownerName">Nome do barbeiro/dono</label>
            <input
              id="ownerName"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="ownerEmail">E-mail de login</label>
            <input
              id="ownerEmail"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="ownerPhone">Telefone (opcional)</label>
            <input
              id="ownerPhone"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="(11) 90000-0000"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-700 text-white rounded px-3 py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {submitting ? 'Cadastrando...' : 'Cadastrar barbearia'}
          </button>
        </form>

        {result && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-green-200">
            <p className="text-sm text-green-700 font-medium">Barbearia cadastrada com sucesso!</p>
            <p className="text-xs text-gray-500">
              Envie esses dados para o barbeiro. Recomende trocar a senha assim que entrar.
            </p>
            <CopyField label="E-mail" value={result.email} />
            <CopyField label="Senha temporária" value={result.tempPassword} />
            <CopyField label="Link de acesso" value="https://clinica-crm-kappa.vercel.app" />
          </div>
        )}
      </div>
    </div>
  )
}
