import { useState } from 'react'
import { Check, Copy, Send } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'
import { HORARIO_PADRAO, SERVICOS_PADRAO, serializarHorario } from './servicosPadrao'
import { DIAS_DE_TESTE } from '../../lib/planos'

/**
 * Cadastro à distância — quando a conversa com o dono acontece por mensagem.
 *
 * O wizard ao lado pressupõe as duas pessoas juntas: alguém precisa saber
 * endereço, telefone, horário dos sete dias e o catálogo com preço e duração de
 * cada serviço, e digitar tudo. Por WhatsApp isso vira uma entrevista de dias, e
 * o interesse esfria entre o "quero" e o "está pronto".
 *
 * Aqui só o que não dá para adivinhar é perguntado: o nome da barbearia e o
 * e-mail. **O resto se assume** — o mesmo horário e o mesmo catálogo padrão que
 * o wizard já oferece pré-marcados. O dono corrige o que não serve em
 * Configurações e Catálogo, telas que já existem, em vez de responder vinte
 * perguntas antes de ver o produto.
 */
type Resultado = { link: string; email: string; salao: string; expiraEm: string }

function CampoCopiavel({ label, value }: { label: string; value: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm break-all">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1500)
          }}
          aria-label={`Copiar ${label}`}
          className="p-2 border border-border-strong rounded-md text-muted-foreground hover:bg-surface-2 shrink-0"
        >
          {copiado ? <Check size={16} className="text-success" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}

export function ConvidarBarbearia({ secret, onCriado }: { secret: string; onCriado: () => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [liberarTeste, setLiberarTeste] = useState(true)
  const [donoAtende, setDonoAtende] = useState(true)

  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function convidar() {
    if (!nome.trim()) return setErro('Informe o nome da barbearia.')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('E-mail inválido.')

    setEnviando(true)
    setErro(null)
    const { data, error } = await invokeFunction<Resultado>('admin-invite-salon', {
      headers: { 'x-admin-secret': secret },
      body: {
        nome: nome.trim(),
        email: email.trim(),
        dias_de_teste: liberarTeste ? DIAS_DE_TESTE : null,
        dono_atende: donoAtende,
        // Os padrões saem daqui, não de uma cópia dentro da edge function:
        // `servicosPadrao.ts` é a fonte única, compartilhada com o wizard.
        horario_funcionamento: serializarHorario(HORARIO_PADRAO),
        servicos: SERVICOS_PADRAO.filter((s) => s.padrao).map((s) => ({
          nome: s.nome,
          preco: s.preco,
          duracao_minutos: s.duracao_minutos,
        })),
      },
    })
    setEnviando(false)

    if (error || !data) {
      setErro(error ?? 'Não foi possível gerar o convite.')
      return
    }
    setResultado(data)
    onCriado()
  }

  if (resultado) {
    const vence = new Date(resultado.expiraEm).toLocaleDateString('pt-BR')
    return (
      <div className="bg-surface rounded-xl border border-success/40 p-6 space-y-4">
        <div className="flex items-center gap-2 text-success">
          <Check size={20} />
          <h2 className="text-base font-semibold">Convite pronto!</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Mande o link para o dono. Ele escolhe a própria senha e entra — os {DIAS_DE_TESTE} dias de teste começam
          nesse momento, não agora. O link vale até <strong>{vence}</strong>.
        </p>

        <CampoCopiavel label="Link do convite" value={resultado.link} />

        <CampoCopiavel
          label="Mensagem pronta para WhatsApp"
          value={`Olá! Preparei o acesso da ${resultado.salao} no Club Cut.\n\nÉ só abrir o link, criar sua senha e já entrar:\n${resultado.link}\n\nSeus ${DIAS_DE_TESTE} dias de teste começam quando você entrar pela primeira vez.`}
        />

        <button
          onClick={() => {
            setResultado(null)
            setNome('')
            setEmail('')
          }}
          className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium"
        >
          Convidar outra
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Convidar barbearia</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Para quando o contato é por mensagem. A barbearia nasce com horário e catálogo padrão, e o
          dono ajusta o que não servir depois de entrar.
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Nome da barbearia</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Barbearia do Zé"
          className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">E-mail do dono</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dono@email.com"
          className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
        />
        <span className="block text-[11px] text-muted-foreground mt-1">
          É o e-mail de acesso dele. O nome ele mesmo digita ao aceitar.
        </span>
      </label>

      {/* Sem plano desde 2026-08-25: a cobrança é por agendamento do agente. */}
      <p className="text-xs text-muted-foreground">
        Cobrança por agendamento feito pelo WhatsApp — sem mensalidade, tudo incluído.
      </p>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={liberarTeste}
          onChange={(e) => setLiberarTeste(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-sm text-foreground">
          Liberar teste grátis de {DIAS_DE_TESTE} dias
          <span className="block text-xs text-muted-foreground">
            {liberarTeste
              ? 'Contados a partir do primeiro acesso dele — não da hora em que você gera o convite.'
              : 'Sem prazo de vencimento — use quando a barbearia já está pagando.'}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={donoAtende}
          onChange={(e) => setDonoAtende(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-sm text-foreground">
          O dono também atende como barbeiro
          <span className="block text-xs text-muted-foreground">
            Se desmarcado, ele administra mas não aparece na agenda nem é oferecido pelo agente.
          </span>
        </span>
      </label>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <button
        onClick={convidar}
        disabled={enviando}
        className="w-full flex items-center justify-center gap-1.5 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        <Send size={15} />
        {enviando ? 'Gerando...' : 'Gerar convite'}
      </button>
    </div>
  )
}
