import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, Plus, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarTelefone } from '../../lib/telefone'
import { useSalon } from '../auth/useSalon'
import { QrDoBalcao } from '../agendaPublica/QrDoBalcao'
import { AvisoDeJornada } from './AvisoDeJornada'
import { NovaUnidadeModal } from '../rede/NovaUnidadeModal'
import {
  desserializarHorario,
  serializarHorario,
  type DiaSemana,
} from '../adminTool/servicosPadrao'

/**
 * Dados da barbearia depois da criação.
 *
 * Antes desta tela, `nome`, `endereco`, `telefone` e `horario_funcionamento`
 * eram gravados apenas pelo wizard do painel administrativo e nunca mais
 * podiam ser alterados — o dono precisava pedir para alguém editar o banco.
 *
 * O horário importa além do cadastro: o agente de IA só oferece datas dentro
 * dele (ver docs/n8n-integration.md), então uma barbearia que muda de horário e
 * não consegue atualizar aqui passa a ter o agente marcando fora da realidade.
 */
export function ConfiguracoesPage() {
  const { salonId, salonName, isManager, isOwner, isNetwork, organizationId, unidades, recarregarUnidades, selecionarUnidade } =
    useSalon()
  const navigate = useNavigate()
  const [modalUnidade, setModalUnidade] = useState(false)
  // Só o que a pessoa é dona: o barbeiro que também trabalha noutra casa tem
  // vínculo lá, mas isso não faz daquela casa uma unidade desta rede.
  const proprias = unidades.filter((u) => u.role === 'owner')

  const [nome, setNome] = useState('')
  // Guardado para saber se vale recarregar as unidades depois de salvar.
  const [nomeOriginal, setNomeOriginal] = useState('')
  const [endereco, setEndereco] = useState('')
  const [telefone, setTelefone] = useState('')
  // Minutos livres exigidos antes e depois de cada atendimento. Zero mantem o
  // comportamento antigo, colado.
  const [folga, setFolga] = useState('0')
  // Minutos de atraso antes de o sistema reagir. Vale para os dois lados da
  // mesma pergunta: quando o botão "Não veio" aparece na faixa do balcão, e
  // quando o agente pergunta ao cliente se ele está vindo.
  const [atraso, setAtraso] = useState('10')
  const [horario, setHorario] = useState<DiaSemana[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  // Muda a cada gravação para o aviso de jornada reconferir: é justamente ao
  // abrir um dia novo que o buraco aparece, e o aviso precisa surgir na hora.
  const [gravacoes, setGravacoes] = useState(0)

  const carregar = useCallback(async () => {
    if (!salonId) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('salons')
      .select(
        'nome, endereco, telefone, horario_funcionamento, folga_entre_atendimentos_minutos, atraso_tolerado_minutos',
      )
      .eq('id', salonId)
      .maybeSingle()

    if (error || !data) {
      console.error('Erro ao carregar a barbearia:', error)
      setErro('Não foi possível carregar os dados da barbearia.')
      setCarregando(false)
      return
    }

    setNome(data.nome ?? '')
    setNomeOriginal(data.nome ?? '')
    setEndereco(data.endereco ?? '')
    setTelefone(data.telefone ?? '')
    setFolga(String(data.folga_entre_atendimentos_minutos ?? 0))
    setAtraso(String(data.atraso_tolerado_minutos ?? 10))
    setHorario(desserializarHorario(data.horario_funcionamento))
    setCarregando(false)
  }, [salonId])

  useEffect(() => {
    carregar()
  }, [carregar])

  function alterarDia(chave: string, mudanca: Partial<DiaSemana>) {
    setSalvo(false)
    setHorario((atual) => atual.map((d) => (d.chave === chave ? { ...d, ...mudanca } : d)))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!salonId) return

    if (!nome.trim()) {
      setErro('O nome da barbearia é obrigatório.')
      return
    }

    // Um dia aberto com fecha <= abre gera janela vazia, e o agente não
    // encontraria horário nenhum sem explicar o motivo.
    const invalido = horario.find((d) => d.aberto && d.fecha <= d.abre)
    if (invalido) {
      setErro(`Em ${invalido.label}, o horário de fechar precisa ser depois do de abrir.`)
      return
    }

    setSalvando(true)
    setErro(null)
    const { error } = await supabase
      .from('salons')
      .update({
        nome: nome.trim(),
        endereco: endereco.trim() || null,
        telefone: telefone.trim() || null,
        folga_entre_atendimentos_minutos: Math.min(60, Math.max(0, Number(folga) || 0)),
        // Mínimo de 5: abaixo disso o cliente recebe a pergunta enquanto ainda
        // está estacionando, e a barbearia parece impaciente.
        atraso_tolerado_minutos: Math.min(60, Math.max(5, Number(atraso) || 10)),
        horario_funcionamento: serializarHorario(horario),
      })
      .eq('id', salonId)
    setSalvando(false)

    if (error) {
      console.error('Erro ao salvar a barbearia:', error)
      setErro('Não foi possível salvar. Tente novamente.')
      return
    }

    setSalvo(true)
    setGravacoes((n) => n + 1)

    // Recarregar as unidades põe o SalonProvider em `loading`, o que faz o
    // RequireManager desmontar esta tela e ela voltar com o estado zerado —
    // inclusive perdendo o aviso de "Salvo". Só vale pagar esse preço quando o
    // nome mudou, porque ele aparece no topo e no seletor de unidades. Nos
    // outros casos (horário, endereço, telefone) nada fora desta tela depende
    // do valor.
    if (nome.trim() !== nomeOriginal) {
      await recarregarUnidades()
    } else {
      setNomeOriginal(nome.trim())
    }
  }

  if (!isManager) {
    return (
      <p className="text-sm text-muted-foreground">
        Só o dono ou o gerente da barbearia pode alterar estes dados.
      </p>
    )
  }

  if (carregando) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Dados de {salonName ?? 'sua barbearia'} e horário de funcionamento
        </p>
      </div>

      <form onSubmit={salvar} className="space-y-6">
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="nome">
              Nome da barbearia
            </label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                setSalvo(false)
              }}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="endereco">
              Endereço
            </label>
            <input
              id="endereco"
              value={endereco}
              onChange={(e) => {
                setEndereco(e.target.value)
                setSalvo(false)
              }}
              placeholder="Rua, número, bairro"
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="telefone">
              Telefone
            </label>
            <input
              id="telefone"
              value={telefone}
              onChange={(e) => {
                setTelefone(e.target.value)
                setSalvo(false)
              }}
              onBlur={() => setTelefone((t) => (t.trim() ? formatarTelefone(t) : t))}
              placeholder="(11) 90000-0000"
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Horário de funcionamento</h2>
            <p className="text-xs text-muted-foreground">
              O agente de IA só oferece horários dentro desta janela. Dia desmarcado é dia fechado.
            </p>
          </div>

          {/* Fica no bloco do horário, e não no de dados, porque é a mesma
              pergunta: quando dá para atender. */}
          <div className="border-b border-border pb-4">
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="folga">
              Folga entre um atendimento e outro
            </label>
            <div className="flex items-center gap-2">
              <input
                id="folga"
                type="number"
                min={0}
                max={60}
                step={5}
                value={folga}
                onChange={(e) => {
                  setFolga(e.target.value)
                  setSalvo(false)
                }}
                className="w-24 border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
              <span className="text-sm text-muted-foreground">minutos</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tempo livre exigido antes e depois de cada horário, para limpar a cadeira e receber o
              próximo. Vale para todos os serviços. <strong>Zero</strong> encaixa um cliente colado
              no outro — cabe mais gente no dia, mas qualquer atraso empurra o resto.
            </p>
          </div>

          <div className="border-b border-border pb-4">
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="atraso">
              Atraso tolerado
            </label>
            <div className="flex items-center gap-2">
              <input
                id="atraso"
                type="number"
                min={5}
                max={60}
                step={5}
                value={atraso}
                onChange={(e) => {
                  setAtraso(e.target.value)
                  setSalvo(false)
                }}
                className="w-24 border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
              <span className="text-sm text-muted-foreground">minutos</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Passado esse tempo, o agente pergunta ao cliente pelo WhatsApp se ele está a caminho.
              E se a comanda não for fechada até <strong>15 minutos depois do fim previsto</strong>{' '}
              do serviço, o agendamento é cancelado sozinho e o horário volta a ficar disponível —
              fechar a comanda depois desfaz o cancelamento.
            </p>
          </div>

          {horario.map((d) => (
            <div key={d.chave} className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 w-32 shrink-0 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={d.aberto}
                  onChange={(e) => alterarDia(d.chave, { aberto: e.target.checked })}
                  aria-label={`${d.label} aberto`}
                  className="accent-primary"
                />
                {d.label}
              </label>

              {d.aberto ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={d.abre}
                    onChange={(e) => alterarDia(d.chave, { abre: e.target.value })}
                    aria-label={`${d.label} abre às`}
                    className="border border-border-strong bg-surface text-foreground rounded px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">às</span>
                  <input
                    type="time"
                    value={d.fecha}
                    onChange={(e) => alterarDia(d.chave, { fecha: e.target.value })}
                    aria-label={`${d.label} fecha às`}
                    className="border border-border-strong bg-surface text-foreground rounded px-2 py-1 text-sm"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
          ))}
        </div>

        {/* O cartao de fidelidade saiu em 2026-08-26: no lugar dele entraram
            os PACOTES pre-pagos, configurados no Catalogo (aba Pacotes) — cada
            pacote carrega as proprias regras, sem configuracao global aqui. */}

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
          {salvo && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <Check size={16} />
              Salvo
            </span>
          )}
        </div>
      </form>

      {/* Logo abaixo do formulário: é a consequência do que ele acabou de
          salvar, e precisa ser lido antes de ele sair da tela achando que
          terminou. */}
      <AvisoDeJornada recarregar={gravacoes} />

      {/* Depois do formulário de propósito: o cartaz é uma entrega, não um
          campo para editar. No meio dos campos, o dono procuraria onde salvar. */}
      <QrDoBalcao />

      {/* Rede não é um cadastro, é uma promoção: a barbearia avulsa vira rede
          no primeiro "Adicionar unidade". Por isso o botão mora AQUI, onde a
          avulsa chega — a aba Rede só existe para quem já tem duas. */}
      {isOwner && (
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Building2 size={18} />
                Unidades
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isNetwork
                  ? `Sua rede tem ${proprias.length} unidades. A lista, o comparativo e a troca entre elas ficam na aba Rede.`
                  : 'Abrindo a segunda unidade? Adicione aqui e o Club Cut vira um painel só para todas, com agenda, equipe e WhatsApp separados por unidade.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalUnidade(true)}
              className="inline-flex items-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium shrink-0"
            >
              <Plus size={16} />
              Adicionar unidade
            </button>
          </div>

        </section>
      )}

      {modalUnidade && salonId && (
        <NovaUnidadeModal
          salonId={salonId}
          primeiraUnidade={!organizationId}
          onClose={() => setModalUnidade(false)}
          onCriada={async (r) => {
            // Recarregar primeiro: é o que liga `isNetwork` e faz aparecer o
            // seletor de unidades e a aba Rede. Depois, entrar na unidade nova
            // — o dono acabou de criá-la e é nela que ele quer mexer.
            await recarregarUnidades()
            selecionarUnidade(r.salonId)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}
