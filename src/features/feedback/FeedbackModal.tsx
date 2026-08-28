import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, MessageSquarePlus, X } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { TextArea } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useSalon } from '../auth/useSalon'
import { ErroInline } from '../../components/ErroInline'

type Tipo = 'sugestao' | 'problema' | 'elogio'

const TIPOS: { id: Tipo; label: string }[] = [
  { id: 'sugestao', label: 'Sugestão' },
  { id: 'problema', label: 'Problema' },
  { id: 'elogio', label: 'Elogio' },
]

/**
 * Canal direto do dono com quem faz o produto.
 *
 * Um campo de texto e três botões — nada de nota de 1 a 5 nem formulário longo.
 * Cada campo a mais reduz quem escreve, e o que importa aqui é a frase da
 * pessoa, não a métrica.
 *
 * A rota vai junto, capturada sozinha: "não achei o botão" é inútil sem saber
 * de qual tela ela fala, e ninguém digita isso espontaneamente.
 */
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { salonId } = useSalon()
  const location = useLocation()

  const [tipo, setTipo] = useState<Tipo>('sugestao')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const texto = mensagem.trim()
    if (!texto || enviando) return
    if (!salonId || !user) {
      setErro('Escolha uma barbearia antes de enviar.')
      return
    }

    setEnviando(true)
    setErro(null)

    const { error } = await supabase.from('feedbacks').insert({
      salon_id: salonId,
      user_id: user.id,
      tipo,
      mensagem: texto,
      rota: location.pathname,
    })

    setEnviando(false)
    if (error) {
      console.error('Erro ao enviar feedback:', error)
      setErro('Não foi possível enviar agora. Tente de novo em instantes.')
      return
    }

    setEnviado(true)
    setTimeout(onClose, 1600)
  }

  return (
    <Modal onClose={onClose} tamanho="md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MessageSquarePlus size={18} />
              Falar com quem faz o sistema
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Escreve do teu jeito. Leio todas e respondo por aqui mesmo.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {enviado ? (
          // Confirmação explícita: sem ela a pessoa não sabe se chegou, e a
          // dúvida é o que faz alguém não mandar o segundo.
          <div className="flex items-center gap-2 text-sm text-success py-6 justify-center">
            <Check size={18} />
            Recebido. Obrigado!
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <div className="flex gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipo(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    tipo === t.id
                      ? 'bg-primary-soft border-border-strong text-primary-soft-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <TextArea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={5}
              autoFocus
              placeholder={
                tipo === 'problema'
                  ? 'O que aconteceu? Se puder, diga o que você estava fazendo na hora.'
                  : 'O que melhoraria o seu dia a dia aqui?'
              }
              className="resize-none"
            />

            <ErroInline>{erro}</ErroInline>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">
                Vai junto a tela em que você está, para eu entender o contexto.
              </span>
              <button
                type="submit"
                disabled={enviando || !mensagem.trim()}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 shrink-0"
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        )}
    </Modal>
  )
}
