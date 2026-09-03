import { useState } from 'react'
import { Building2, Check, ChevronLeft, ChevronRight, Copy, Plus, Scissors, Store, Trash2 } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'
import {
  HORARIO_PADRAO,
  SERVICOS_PADRAO,
  serializarHorario,
  type DiaSemana,
  type ServicoPadrao,
} from './servicosPadrao'
import { DIAS_DE_TESTE } from '../../lib/planos'
import { Campo, Input } from '../../components/Campo'
import { ErroInline } from '../../components/ErroInline'

/**
 * `donoAtende` separa duas coisas que o sistema confundia: ser **dono** (acesso,
 * em `user_salons`) e **atender clientes** (recurso agendável, em
 * `professionals`). Antes, o cadastro criava o dono como barbeiro em toda
 * unidade — então o dono de rede virava opção de agendamento nas duas, e o
 * agente de IA passava a oferecê-lo ao cliente no WhatsApp.
 */
type Unidade = { nome: string; endereco: string; telefone: string; donoAtende: boolean }

/** Formato do negócio. Espelha os três casos reais descritos em docs/visao.md. */
type Tipo = 'solo' | 'unica' | 'rede'

function unidadeVazia(donoAtende: boolean): Unidade {
  return { nome: '', endereco: '', telefone: '', donoAtende }
}
type ServicoEscolhido = ServicoPadrao & { escolhido: boolean }

type Resultado = {
  email: string
  tempPassword: string
  loginUrl: string
  rede: string | null
  salons: { id: string; nome: string }[]
}

const PASSOS = ['Tipo', 'Unidades', 'Dono', 'Funcionamento', 'Serviços']

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm break-all">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          aria-label={`Copiar ${label}`}
          className="p-2 border border-border-strong rounded-md text-muted-foreground hover:bg-surface-2 shrink-0"
        >
          {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}

export function SalonWizard({ secret, onCreated }: { secret: string; onCreated: () => void }) {
  const [passo, setPasso] = useState(0)
  const [tipo, setTipo] = useState<Tipo>('solo')
  const [redeNome, setRedeNome] = useState('')
  const [redeCnpj, setRedeCnpj] = useState('')
  const [unidades, setUnidades] = useState<Unidade[]>([unidadeVazia(true)])

  // No formato solo o dono É o barbeiro — perguntar seria ruído. Nos outros a
  // pergunta aparece, para a exceção ser tratada sem mexer em código.
  const perguntaSeDonoAtende = tipo !== 'solo'

  function escolherTipo(novo: Tipo) {
    setTipo(novo)
    // Rede começa com o dono fora do atendimento (ele supervisiona); barbearia
    // com equipe começa com ele dentro, que é o caso mais comum.
    const atendePadrao = novo !== 'rede'
    setUnidades((prev) => {
      const base = novo === 'rede' ? prev : prev.slice(0, 1)
      return base.map((u) => ({ ...u, donoAtende: atendePadrao }))
    })
  }
  const [donoNome, setDonoNome] = useState('')
  const [donoEmail, setDonoEmail] = useState('')
  const [donoTelefone, setDonoTelefone] = useState('')

  // A comissão não tem padrão no banco: sem este campo, o dono que atende
  // nascia com `comissao_percentual` nulo e o Financeiro dele calculava zero.
  // Diferente da jornada, que cai no horário do salão, aqui não há de onde
  // inferir — é combinado comercial. 50% é o mais comum no mercado.
  const [comissao, setComissao] = useState('50')
  const donoAtendeEmAlguma = tipo === 'solo' || unidades.some((u) => u.donoAtende)

  // Assinatura: sem isto a barbearia nascia sem nenhuma linha em
  // `subscriptions`, e não havia como saber quem está testando nem quando
  // vence. A cobrança continua manual na v1 — o que muda é passar a registrar.
  const [liberarTeste, setLiberarTeste] = useState(true)
  const [horario, setHorario] = useState<DiaSemana[]>(HORARIO_PADRAO)
  const [servicos, setServicos] = useState<ServicoEscolhido[]>(
    SERVICOS_PADRAO.map((s) => ({ ...s, escolhido: s.padrao })),
  )

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  function validarPasso(): string | null {
    if (passo === 0 && tipo === 'rede' && !redeNome.trim()) return 'Informe o nome da rede.'
    if (passo === 1) {
      if (unidades.some((u) => !u.nome.trim())) return 'Toda unidade precisa de um nome.'
      if (unidades.some((u) => !u.endereco.trim())) return 'O endereço é obrigatório.'
    }
    if (passo === 2) {
      if (!donoNome.trim()) return 'Informe o nome do dono.'
      if (!donoEmail.trim()) return 'Informe o e-mail de acesso.'
      if (!/^\S+@\S+\.\S+$/.test(donoEmail.trim())) return 'E-mail inválido.'
    }
    if (passo === 4 && !servicos.some((s) => s.escolhido)) {
      return 'Selecione ao menos um serviço.'
    }
    return null
  }

  function avancar() {
    const problema = validarPasso()
    if (problema) {
      setErro(problema)
      return
    }
    setErro(null)
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1))
  }

  async function criar() {
    const problema = validarPasso()
    if (problema) {
      setErro(problema)
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      const { data, error } = await invokeFunction<Resultado>('admin-create-salon', {
        headers: { 'x-admin-secret': secret },
        body: {
          action: 'create',
          tipo,
          organizacao: tipo === 'rede' ? { nome: redeNome, cnpj: redeCnpj } : undefined,
          dono: {
            nome: donoNome,
            email: donoEmail,
            telefone: donoTelefone,
            comissao_percentual: donoAtendeEmAlguma ? Number(comissao) : null,
          },
          assinatura: { dias_de_teste: liberarTeste ? DIAS_DE_TESTE : null },
          unidades: unidades.map((u) => ({
            nome: u.nome,
            endereco: u.endereco,
            telefone: u.telefone,
            horario_funcionamento: serializarHorario(horario),
            // No formato solo o dono sempre atende, então nem mostramos a opção.
            dono_atende: tipo === 'solo' ? true : u.donoAtende,
          })),
          servicos: servicos
            .filter((s) => s.escolhido)
            .map((s) => ({ nome: s.nome, preco: s.preco, duracao_minutos: s.duracao_minutos })),
        },
      })

      if (error || !data) {
        setErro(error ?? 'Não foi possível cadastrar. Tente novamente.')
        return
      }
      setResultado(data)
      onCreated()
    } catch (err) {
      console.error('Erro ao cadastrar:', err)
      setErro('Não foi possível cadastrar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  // ---------- Tela de sucesso ----------
  if (resultado) {
    return (
      <div className="bg-surface rounded-2xl border border-success/40 p-5 space-y-4">
        <div className="flex items-center gap-2 text-success">
          <Check size={20} />
          <h2 className="text-base font-semibold">
            {resultado.salons.length > 1
              ? `Rede cadastrada com ${resultado.salons.length} unidades!`
              : 'Barbearia cadastrada!'}
          </h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Mande estes dados para o dono. Recomende trocar a senha no primeiro acesso.
        </p>

        <CopyField label="Link de acesso" value={resultado.loginUrl} />
        <CopyField label="E-mail" value={resultado.email} />
        <CopyField label="Senha temporária" value={resultado.tempPassword} />

        <CopyField
          label="Mensagem pronta para WhatsApp"
          value={`Olá! Seu acesso ao Club Cut está pronto.\n\nLink: ${resultado.loginUrl}\nE-mail: ${resultado.email}\nSenha: ${resultado.tempPassword}\n\nRecomendo trocar a senha assim que entrar.`}
        />

        <div className="pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground mb-1">Unidades criadas</div>
          <ul className="text-sm text-foreground space-y-0.5">
            {resultado.salons.map((s) => (
              <li key={s.id}>· {s.nome}</li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => {
            setResultado(null)
            setPasso(0)
            setTipo('solo')
            setUnidades([unidadeVazia(true)])
            setDonoNome('')
            setDonoEmail('')
            setDonoTelefone('')
            setRedeNome('')
            setRedeCnpj('')
          }}
          className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium"
        >
          Cadastrar outra
        </button>
      </div>
    )
  }

  const grupos = [...new Set(servicos.map((s) => s.grupo))]

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
      {/* Progresso */}
      <div className="flex items-center gap-1 mb-6">
        {PASSOS.map((nome, i) => (
          <div key={nome} className="flex-1">
            <div
              className={`h-1 rounded-full transition-colors ${
                i <= passo ? 'bg-primary' : 'bg-surface-2'
              }`}
            />
            <span
              className={`text-[11px] mt-1 block ${
                i === passo ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {nome}
            </span>
          </div>
        ))}
      </div>

      {/* Passo 1 — tipo */}
      {passo === 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Como funciona a barbearia?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => escolherTipo('solo')}
              className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
                tipo === 'solo' ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-surface-2'
              }`}
            >
              <Scissors size={20} className={tipo === 'solo' ? 'text-primary' : 'text-muted-foreground'} />
              <span className="text-sm font-medium text-foreground">Só eu atendo</span>
              <span className="text-xs text-muted-foreground">Um endereço, um barbeiro</span>
            </button>
            <button
              onClick={() => escolherTipo('unica')}
              className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
                tipo === 'unica' ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-surface-2'
              }`}
            >
              <Store size={20} className={tipo === 'unica' ? 'text-primary' : 'text-muted-foreground'} />
              <span className="text-sm font-medium text-foreground">Tenho equipe</span>
              <span className="text-xs text-muted-foreground">Um endereço, mais barbeiros</span>
            </button>
            <button
              onClick={() => escolherTipo('rede')}
              className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
                tipo === 'rede' ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-surface-2'
              }`}
            >
              <Building2 size={20} className={tipo === 'rede' ? 'text-primary' : 'text-muted-foreground'} />
              <span className="text-sm font-medium text-foreground">Rede</span>
              <span className="text-xs text-muted-foreground">Várias unidades</span>
            </button>
          </div>

          {tipo === 'rede' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Campo rotulo="Nome da rede" htmlFor="wizard-rede-nome">
                <Input
                  id="wizard-rede-nome"
                  value={redeNome}
                  onChange={(e) => setRedeNome(e.target.value)}
                  placeholder="Ex.: Barbearia do Zé"
                />
              </Campo>
              <Campo rotulo="CNPJ (opcional)" htmlFor="wizard-rede-cnpj">
                <Input id="wizard-rede-cnpj" value={redeCnpj} onChange={(e) => setRedeCnpj(e.target.value)} />
              </Campo>
            </div>
          )}
        </div>
      )}

      {/* Passo 2 — unidades */}
      {passo === 1 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            {tipo === 'rede' ? 'Unidades da rede' : 'Dados da barbearia'}
          </h2>

          {unidades.map((u, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              {tipo === 'rede' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Unidade {i + 1}</span>
                  {unidades.length > 1 && (
                    <button
                      onClick={() => setUnidades((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remover unidade ${i + 1}`}
                      className="text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
              <Input
                value={u.nome}
                onChange={(e) =>
                  setUnidades((prev) => prev.map((x, idx) => (idx === i ? { ...x, nome: e.target.value } : x)))
                }
                placeholder="Nome da barbearia"
              />
              <Input
                value={u.endereco}
                onChange={(e) =>
                  setUnidades((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, endereco: e.target.value } : x)),
                  )
                }
                placeholder="Endereço completo"
              />
              <Input
                value={u.telefone}
                onChange={(e) =>
                  setUnidades((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, telefone: e.target.value } : x)),
                  )
                }
                placeholder="Telefone da unidade (opcional)"
              />

              {perguntaSeDonoAtende && (
                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={u.donoAtende}
                    onChange={(e) =>
                      setUnidades((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, donoAtende: e.target.checked } : x)),
                      )
                    }
                    aria-label={`O dono atende nesta unidade${tipo === 'rede' ? ` (${i + 1})` : ''}`}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">
                    O dono também atende como barbeiro aqui
                    <span className="block text-[11px] opacity-80">
                      Se desmarcado, ele administra mas não aparece na agenda nem é oferecido pelo agente.
                    </span>
                  </span>
                </label>
              )}
            </div>
          ))}

          {tipo === 'rede' && (
            <button
              onClick={() => setUnidades((prev) => [...prev, unidadeVazia(false)])}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Plus size={16} />
              Adicionar unidade
            </button>
          )}

          {tipo === 'rede' && unidades.length > 1 && (
            <p className="text-xs text-muted-foreground">
              O catálogo de serviços e o horário serão aplicados em todas as unidades.
            </p>
          )}
        </div>
      )}

      {/* Passo 3 — dono */}
      {passo === 2 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Dono</h2>
          <p className="text-xs text-muted-foreground">
            É quem vai receber o acesso{tipo === 'rede' ? ' a todas as unidades' : ''}.
          </p>
          <Input
            value={donoNome}
            onChange={(e) => setDonoNome(e.target.value)}
            placeholder="Nome completo"
          />
          <Input
            type="email"
            value={donoEmail}
            onChange={(e) => setDonoEmail(e.target.value)}
            placeholder="E-mail de acesso"
          />
          <Input
            value={donoTelefone}
            onChange={(e) => setDonoTelefone(e.target.value)}
            placeholder="Telefone (opcional)"
          />

          {donoAtendeEmAlguma && (
            <label className="block pt-1">
              <span className="text-sm text-foreground">Comissão do dono como barbeiro</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-28">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={comissao}
                    onChange={(e) => setComissao(e.target.value)}
                  />
                </div>
                <span className="text-sm text-muted-foreground">% de cada serviço que ele fizer</span>
              </div>
              <span className="block text-xs text-muted-foreground mt-1">
                Dá para mudar depois na aba Equipe. Sem isto, o Financeiro dele calcula comissão
                zero.
              </span>
            </label>
          )}

          <div className="pt-3 mt-1 border-t border-border space-y-2">
            <span className="block text-sm font-medium text-foreground">Assinatura</span>

            {/* Sem seleção de plano desde 2026-08-25: a cobrança é por
                agendamento feito pelo agente (faixas_de_uso). Tudo incluído. */}
            <p className="text-xs text-muted-foreground">
              Cobrança por agendamento feito pelo WhatsApp — sem mensalidade, tudo incluído.
            </p>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={liberarTeste}
                onChange={(e) => setLiberarTeste(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">
                Liberar teste grátis de {DIAS_DE_TESTE} dias
                <span className="block text-xs text-muted-foreground">
                  {liberarTeste
                    ? `O acesso vence em ${DIAS_DE_TESTE} dias e o dono é avisado dentro do CRM antes disso.`
                    : 'Sem prazo de vencimento — use quando a barbearia já está pagando.'}
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Passo 4 — funcionamento */}
      {passo === 3 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Horário de funcionamento</h2>
          <p className="text-xs text-muted-foreground">
            Usado na agenda e para o atendimento automático não oferecer horário com a
            barbearia fechada.
          </p>
          <div className="space-y-1.5">
            {horario.map((d, i) => (
              <div key={d.chave} className="flex items-center gap-2">
                <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.aberto}
                    onChange={(e) =>
                      setHorario((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, aberto: e.target.checked } : x)),
                      )
                    }
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">{d.label}</span>
                </label>
                {d.aberto ? (
                  <>
                    <div className="w-28">
                      <Input
                        type="time"
                        value={d.abre}
                        onChange={(e) =>
                          setHorario((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, abre: e.target.value } : x)),
                          )
                        }
                        aria-label={`${d.label} abre às`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">às</span>
                    <div className="w-28">
                      <Input
                        type="time"
                        value={d.fecha}
                        onChange={(e) =>
                          setHorario((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, fecha: e.target.value } : x)),
                          )
                        }
                        aria-label={`${d.label} fecha às`}
                      />
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Fechado</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Passo 5 — serviços */}
      {passo === 4 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Serviços iniciais</h2>
            <p className="text-xs text-muted-foreground">
              Já vêm marcados os mais comuns. Desmarque o que não serve e ajuste os preços —
              o dono pode mudar tudo depois.
            </p>
          </div>

          {grupos.map((grupo) => (
            <div key={grupo}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {grupo}
              </div>
              <div className="space-y-1">
                {servicos.map((s, i) =>
                  s.grupo !== grupo ? null : (
                    <div
                      key={s.nome}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                        s.escolhido ? 'border-primary/40 bg-primary-soft/40' : 'border-border'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={s.escolhido}
                        onChange={(e) =>
                          setServicos((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, escolhido: e.target.checked } : x)),
                          )
                        }
                        aria-label={s.nome}
                        className="accent-primary shrink-0"
                      />
                      <span className="flex-1 text-sm text-foreground truncate">{s.nome}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">R$</span>
                        <div className="w-20">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={s.preco}
                          onChange={(e) =>
                            setServicos((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, preco: Number(e.target.value) } : x,
                              ),
                            )
                          }
                          aria-label={`Preço de ${s.nome}`}
                        />
                        </div>
                        <div className="w-16">
                        <Input
                          type="number"
                          min={5}
                          step="5"
                          value={s.duracao_minutos}
                          onChange={(e) =>
                            setServicos((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, duracao_minutos: Number(e.target.value) } : x,
                              ),
                            )
                          }
                          aria-label={`Duração de ${s.nome}`}
                        />
                        </div>
                        <span className="text-xs text-muted-foreground">min</span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4"><ErroInline>{erro}</ErroInline></div>

      {/* Navegação */}
      <div className="flex gap-2 mt-6 pt-4 border-t border-border">
        <button
          onClick={() => {
            setErro(null)
            setPasso((p) => Math.max(p - 1, 0))
          }}
          disabled={passo === 0}
          className="flex items-center gap-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40"
        >
          <ChevronLeft size={16} />
          Voltar
        </button>

        {passo < PASSOS.length - 1 ? (
          <button
            onClick={avancar}
            className="flex-1 flex items-center justify-center gap-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium"
          >
            Continuar
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={criar}
            disabled={salvando}
            className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {salvando
              ? 'Cadastrando...'
              : `Cadastrar ${unidades.length > 1 ? `${unidades.length} unidades` : 'barbearia'}`}
          </button>
        )}
      </div>
    </div>
  )
}
