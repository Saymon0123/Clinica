import { useEffect, useState } from 'react'
import { Activity, CalendarCheck, MessageSquareText, RotateCcw, Copy, Check, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { Badge } from '../../components/Badge'
import { SkeletonLinhas } from '../../components/Skeleton'
import { ErroInline } from '../../components/ErroInline'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(iso: string) {
  return iso.split('-').reverse().join('/')
}

type Uso = {
  periodo_inicio: string
  periodo_fim: string
  barbeiros: number
  preco_unitario: number
  agendamentos: number
  valor_gerado: number
  lembretes: number
  reativacoes: number
  /** Falso = barbearia interna (0160): mede o uso, mas nada disso vira fatura. */
  cobravel: boolean
}

type Fatura = {
  id: string
  periodo_inicio: string
  periodo_fim: string
  motivo: string
  agendamentos: number
  preco_unitario: number
  valor: number
  valor_gerado: number
  pix_br_code: string | null
  pix_br_code_base64: string | null
  cobranca_valor: number | null
  cobranca_vence_em: string | null
  paga_em: string | null
  abacate_pix_id: string | null
  pix_expira_em: string | null
}

/** O QR morreu, e a dívida continua. É o caso que exige gerar outro código. */
function pixVencido(f: Fatura) {
  return Boolean(f.pix_expira_em) && new Date(f.pix_expira_em!).getTime() < Date.now()
}

/**
 * O medidor do uso: o que o cliente paga e o que ele ganhou em troca.
 *
 * Mostra o PREÇO UNITÁRIO da barbearia — nunca a tabela de faixas por
 * barbeiros, decisão explícita de 2026-08-23. O mês corrente vem ao vivo da
 * view `uso_do_sistema_no_mes`; os períodos fechados vêm de `faturas_de_uso`,
 * congelados — a fatura não muda se um agendamento for cancelado depois.
 *
 * O par "valor gerado × custo" é a alma da tela: o dono precisa ver que o
 * agente trouxe muito mais do que custou, todo mês, sem procurar.
 */
export function UsoDoSistema() {
  const { salonId, isManager } = useSalon()
  const [uso, setUso] = useState<Uso | null>(null)
  const [faturas, setFaturas] = useState<Fatura[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [pixAberto, setPixAberto] = useState<Fatura | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [gerando, setGerando] = useState<string | null>(null)
  const [erroReemissao, setErroReemissao] = useState<string | null>(null)
  // Recarrega a lista depois de gerar um código novo, sem duplicar a consulta.
  const [versao, setVersao] = useState(0)

  /**
   * Pede ao `cobrar-uso` uma nova cobrança para a mesma dívida.
   *
   * A edge é quem decide se pode: confere que quem clicou é dono, que a cobrança
   * está em aberto e que o código realmente venceu. Aqui só mostramos a resposta
   * — validar de novo no front seria duplicar regra que já mora num lugar só.
   */
  async function gerarNovoPix(fatura: Fatura) {
    if (!fatura.abacate_pix_id) return
    setGerando(fatura.id)
    setErroReemissao(null)
    const { error } = await supabase.functions.invoke('cobrar-uso', {
      body: { acao: 'reemitir', pixId: fatura.abacate_pix_id },
    })
    if (error) {
      // A edge devolve o motivo em português (já pago, ainda válido, sem
      // permissão, limite). Mostrar "erro genérico" por cima disso esconderia
      // justamente a frase que resolve a dúvida do dono.
      let mensagem = 'Não foi possível gerar um novo código agora. Tente de novo.'
      try {
        const corpo = await (error as { context?: Response }).context?.json()
        if (corpo?.error) mensagem = String(corpo.error)
      } catch {
        // Resposta sem corpo legível: fica a mensagem genérica.
      }
      setErroReemissao(mensagem)
      setGerando(null)
      return
    }
    setPixAberto(null)
    setGerando(null)
    setVersao((v) => v + 1)
  }

  async function copiarPix(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Área de transferência bloqueada: o dono ainda vê o código para copiar à mão.
    }
  }

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      if (!salonId) return
      setCarregando(true)
      const [u, f] = await Promise.all([
        supabase.from('uso_do_sistema_no_mes').select('*').eq('salon_id', salonId).maybeSingle(),
        supabase
          .from('faturas_de_uso')
          .select(
            'id, periodo_inicio, periodo_fim, motivo, agendamentos, preco_unitario, valor, valor_gerado, pix_br_code, pix_br_code_base64, cobranca_valor, cobranca_vence_em, paga_em, abacate_pix_id, pix_expira_em',
          )
          .eq('salon_id', salonId)
          .order('periodo_fim', { ascending: false })
          .limit(12),
      ])
      if (cancelado) return
      if (u.error || f.error) {
        console.error('Erro ao carregar o uso:', u.error ?? f.error)
        setErro(true)
        setCarregando(false)
        return
      }
      setErro(false)
      setUso(u.data as Uso | null)
      setFaturas((f.data ?? []) as Fatura[])
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [salonId, versao])

  if (!isManager) return null

  const valorEstimado = uso ? uso.agendamentos * Number(uso.preco_unitario) : 0
  // A cobrança mais recente ainda não paga: é o que o dono veio procurar
  // quando o assunto é pagamento, então ganha um banner antes do histórico.
  const cobrancaAberta = faturas.find((f) => f.pix_br_code && !f.paga_em) ?? null

  return (
    <section className="valores-alinhados bg-surface border border-border rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Activity size={18} />
          Uso do sistema
        </h2>
        {/* A frase separa MENSAGEM de AGENDAMENTO, e não é preciosismo.
            A redação anterior juntava lembrete e reativação numa isenção só,
            enquanto a regra da fatura (`agendamentos_cobraveis`, migration
            0136) cobra o horário de reativação que o cliente confirma. Os dois
            cartões abaixo contam mensagens enviadas; o cartão "Agendamentos
            cobráveis" conta horários. Quem lesse aquilo entenderia que o
            cliente trazido de volta pela reativação sai de graça — e receberia
            R$ 0,75 por ele na fatura. Decisão de 04/09/2026: a regra fica, o
            texto muda. A catraca está em `promessaDeCobranca.test.ts`. */}
        {/* Barbearia interna (0160) vê o mesmo medidor, com a frase certa: sem
            isto a tela prometeria uma cobrança que nunca chega, que é o tipo de
            mentira que o `promessaDeCobranca.test.ts` existe para impedir. */}
        {uso && !uso.cobravel ? (
          <p className="text-sm text-muted-foreground mt-1">
            Esta barbearia está <strong>fora da cobrança</strong>: o uso é medido e aparece aqui,
            mas não vira fatura e nada é cobrado.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            Você paga por agendamento que o atendimento automático marcou —{' '}
            {uso ? `${moeda(Number(uso.preco_unitario))} cada` : 'carregando...'}. Entra também o
            horário de reativação que o cliente confirmou. As mensagens de lembrete e de reativação
            não custam nada.
          </p>
        )}
      </div>

      {carregando ? (
        <SkeletonLinhas />
      ) : erro ? (
        <ErroInline>
          Não foi possível carregar o uso agora. Confira a internet e recarregue a página.
        </ErroInline>
      ) : uso ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarCheck size={14} /> Agendamentos cobráveis
              </div>
              <div className="text-xl font-semibold text-foreground mt-1">{uso.agendamentos}</div>
              <div className="text-[11px] text-muted-foreground">
                {uso.cobravel ? `${moeda(valorEstimado)} no mês até agora` : 'sem cobrança'}
              </div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Gerado pra você</div>
              <div className="text-xl font-semibold text-success mt-1">
                {moeda(Number(uso.valor_gerado))}
              </div>
              <div className="text-[11px] text-muted-foreground">em serviços agendados</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageSquareText size={14} /> Lembretes
              </div>
              <div className="text-xl font-semibold text-foreground mt-1">{uso.lembretes}</div>
              {/* "mensagens" no rótulo, e não só "sem custo": este cartão conta
                  envios, não horários — a diferença é a que confundia acima. */}
              <div className="text-[11px] text-muted-foreground">mensagens, sem custo</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RotateCcw size={14} /> Reativações
              </div>
              <div className="text-xl font-semibold text-foreground mt-1">{uso.reativacoes}</div>
              {/* O cartão mais perigoso da tela: "Reativações — sem custo" lia-se
                  como "cliente trazido de volta é de graça". Conta ENVIOS
                  (`reativacao_envios`); o horário confirmado que sair daí está
                  no cartão de cobráveis. */}
              <div className="text-[11px] text-muted-foreground">mensagens, sem custo</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Período em aberto: {dataBr(uso.periodo_inicio)} até hoje. O fechamento é no fim do mês,
            e a cobrança Pix chega depois disso.
          </p>

          {cobrancaAberta && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-foreground">
                  Cobrança em aberto:{' '}
                  <strong>{moeda(Number(cobrancaAberta.cobranca_valor ?? cobrancaAberta.valor))}</strong>
                  {cobrancaAberta.cobranca_vence_em && (
                    <span className="text-muted-foreground">
                      {' '}
                      · vence {dataBr(cobrancaAberta.cobranca_vence_em)}
                    </span>
                  )}
                </div>
                {/* O código Pix vale 7 dias; a dívida continua depois disso. Sem
                    este botão o dono ficava bloqueado SEM MEIO DE PAGAR — o QR
                    morto na tela e nenhuma forma de pedir outro. */}
                {pixVencido(cobrancaAberta) ? (
                  <button
                    type="button"
                    onClick={() => gerarNovoPix(cobrancaAberta)}
                    disabled={gerando === cobrancaAberta.id}
                    className="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={gerando === cobrancaAberta.id ? 'animate-spin' : ''} />
                    {gerando === cobrancaAberta.id ? 'Gerando...' : 'Gerar novo Pix'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPixAberto(cobrancaAberta)}
                    className="btn-primary rounded-lg px-3 py-1.5 text-sm font-medium shrink-0"
                  >
                    Pagar com Pix
                  </button>
                )}
              </div>
              {pixVencido(cobrancaAberta) && (
                <p className="text-xs text-muted-foreground">
                  O código anterior expirou. Gere outro para pagar — o valor e o prazo continuam os
                  mesmos.
                </p>
              )}
              <ErroInline>{erroReemissao}</ErroInline>
            </div>
          )}

          {pixAberto && (
            <div className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-foreground">
                  Pague {moeda(Number(pixAberto.cobranca_valor ?? pixAberto.valor))} com Pix
                </div>
                <button
                  type="button"
                  onClick={() => setPixAberto(null)}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Fechar
                </button>
              </div>
              {pixAberto.pix_br_code_base64 && (
                <img
                  src={pixAberto.pix_br_code_base64}
                  alt="QR Code do Pix"
                  className="mx-auto h-44 w-44 rounded bg-white p-2"
                />
              )}
              {pixAberto.pix_br_code && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    No app do banco, escolha Pix › Pix Copia e Cola e cole o código:
                  </p>
                  <div className="flex items-stretch gap-2">
                    <code className="min-w-0 flex-1 truncate rounded border border-border bg-surface px-2 py-1.5 text-xs text-muted-foreground">
                      {pixAberto.pix_br_code}
                    </code>
                    <button
                      type="button"
                      onClick={() => copiarPix(pixAberto.pix_br_code!)}
                      className="btn-chip btn-chip-primario inline-flex shrink-0 items-center gap-1"
                    >
                      {copiado ? <Check size={14} /> : <Copy size={14} />}
                      {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {faturas.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Períodos fechados</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {faturas.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 text-sm text-foreground">
                      {dataBr(f.periodo_inicio)} – {dataBr(f.periodo_fim)}
                      {f.motivo === 'cancelamento' && (
                        <span className="ml-2 inline-flex align-middle">
                          <Badge variante="perigo">cancelamento</Badge>
                        </span>
                      )}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {f.agendamentos} agendamento{f.agendamentos === 1 ? '' : 's'} ×{' '}
                        {moeda(Number(f.preco_unitario))}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-2">
                      {f.paga_em ? (
                        <Badge variante="ok">pago</Badge>
                      ) : f.pix_br_code && pixVencido(f) ? (
                        // Abrir um QR morto seria pior que não ter botão: o dono
                        // tentaria pagar e o banco recusaria sem dizer por quê.
                        <button
                          type="button"
                          onClick={() => gerarNovoPix(f)}
                          disabled={gerando === f.id}
                          className="btn-chip btn-chip-primario disabled:opacity-50"
                        >
                          {gerando === f.id ? 'Gerando...' : 'Gerar novo Pix'}
                        </button>
                      ) : f.pix_br_code ? (
                        <button
                          type="button"
                          onClick={() => setPixAberto(f)}
                          className="btn-chip btn-chip-primario"
                        >
                          Pagar
                        </button>
                      ) : Number(f.valor) > 0 ? (
                        <Badge variante="atencao">acumula</Badge>
                      ) : null}
                      <span className="text-sm font-medium text-foreground">{moeda(Number(f.valor))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sem dados de uso ainda.</p>
      )}
    </section>
  )
}
