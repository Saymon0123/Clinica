import { useMemo, useState } from 'react'
import { X, AlertTriangle, Users } from 'lucide-react'
import { simular, TAXAS_PADRAO, type DescontoTipo, type SegmentoId } from './simulador'
import { useClientesDoSegmento } from './useMarketingData'
import { SEGMENTOS, type ResumoSegmento } from './types'

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Numero({
  rotulo,
  valor,
  detalhe,
  destaque,
  tom = 'neutro',
}: {
  rotulo: string
  valor: string
  detalhe?: string
  destaque?: boolean
  tom?: 'neutro' | 'bom' | 'ruim'
}) {
  const cor = tom === 'bom' ? 'text-success' : tom === 'ruim' ? 'text-danger' : 'text-foreground'
  return (
    <div
      className={`rounded-lg border p-3 ${
        destaque ? 'border-primary bg-primary-soft' : 'border-border bg-surface-2'
      }`}
    >
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`text-lg font-semibold tabular-nums ${destaque ? 'text-primary-soft-foreground' : cor}`}>
        {valor}
      </p>
      {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5">{detalhe}</p>}
    </div>
  )
}

export function SimuladorModal({
  salonId,
  resumo,
  comissaoMedia,
  onClose,
}: {
  salonId: string
  resumo: ResumoSegmento
  comissaoMedia: number
  onClose: () => void
}) {
  const segmento: SegmentoId = resumo.segmento
  const info = SEGMENTOS.find((s) => s.id === segmento)!

  const [descontoTipo, setDescontoTipo] = useState<DescontoTipo>('percentual')
  const [descontoValor, setDescontoValor] = useState(15)
  const [reduzComissao, setReduzComissao] = useState(false)

  const { clientes, loading } = useClientesDoSegmento(salonId, segmento)

  const taxas = TAXAS_PADRAO[segmento]
  const resultado = useMemo(
    () =>
      simular({
        clientes: resumo.clientes,
        ticketMedio: resumo.ticketMedio,
        descontoTipo,
        descontoValor,
        comissaoPercentual: comissaoMedia,
        descontoReduzComissao: reduzComissao,
        taxaRetornoEspontaneo: taxas.espontaneo,
        taxaRetornoComCampanha: taxas.comCampanha,
      }),
    [resumo, descontoTipo, descontoValor, comissaoMedia, reduzComissao, taxas],
  )

  const semDados = resumo.ticketMedio === 0

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
      <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{info.titulo}</h2>
            <p className="text-sm text-muted-foreground">{info.regra}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users size={15} />
            <span>
              <strong className="text-foreground">{resumo.clientes}</strong> elegíveis{' '}
              <span className="text-primary font-medium">agora</span> · ticket médio{' '}
              <strong className="text-foreground">{moeda(resumo.ticketMedio)}</strong>
            </span>
          </div>

          {semDados ? (
            <p className="text-sm text-muted-foreground bg-surface-2 border border-border rounded-lg p-3">
              Esse grupo ainda não tem venda fechada registrada, então não há ticket médio para
              simular. Feche algumas comandas e volte aqui.
            </p>
          ) : (
            <>
              {/* Controles */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-foreground">Desconto</label>
                  <div className="flex gap-2 mt-1.5">
                    <div className="inline-flex rounded-lg bg-surface-2 border border-border p-1 text-sm shrink-0">
                      {(['percentual', 'valor'] as DescontoTipo[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setDescontoTipo(t)}
                          className={`px-3 py-1 rounded-md font-medium transition-colors ${
                            descontoTipo === t
                              ? 'bg-surface text-foreground shadow-sm'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {t === 'percentual' ? '%' : 'R$'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={descontoValor}
                      onChange={(e) => setDescontoValor(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">Quem absorve</label>
                  <div className="inline-flex rounded-lg bg-surface-2 border border-border p-1 text-sm mt-1.5 w-full">
                    <button
                      onClick={() => setReduzComissao(false)}
                      className={`flex-1 px-3 py-1 rounded-md font-medium transition-colors ${
                        !reduzComissao ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
                      }`}
                    >
                      A barbearia
                    </button>
                    <button
                      onClick={() => setReduzComissao(true)}
                      className={`flex-1 px-3 py-1 rounded-md font-medium transition-colors ${
                        reduzComissao ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
                      }`}
                    >
                      Rateia com o barbeiro
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {reduzComissao
                      ? `Barbeiro perde ${moeda(resultado.descontoDoBarbeiro)} por atendimento.`
                      : 'O barbeiro recebe a comissão cheia.'}
                  </p>
                </div>
              </div>

              {/* Números */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Numero
                  rotulo="Desconto por cliente"
                  valor={moeda(resultado.descontoPorCliente)}
                  detalhe={`Você absorve ${moeda(resultado.descontoAbsorvido)}`}
                />
                <Numero
                  rotulo="Sobra por atendimento"
                  valor={moeda(resultado.margemComDesconto)}
                  detalhe={`Margem cheia: ${moeda(resultado.margemPorCliente)}`}
                  tom={resultado.margemComDesconto > 0 ? 'neutro' : 'ruim'}
                />
                <Numero
                  rotulo="Resultado estimado"
                  valor={moeda(resultado.resultadoLiquido)}
                  detalhe={`${resultado.clientesIncrementais} clientes a mais`}
                  tom={resultado.resultadoLiquido >= 0 ? 'bom' : 'ruim'}
                />
                <Numero
                  rotulo="Precisa trazer de volta"
                  valor={
                    resultado.clientesParaEmpatar === null
                      ? '—'
                      : `${resultado.clientesParaEmpatar} clientes`
                  }
                  detalhe="além dos que voltariam sozinhos"
                  destaque
                />
              </div>

              {/* Explicação do ponto de equilíbrio */}
              <div className="text-sm text-muted-foreground bg-surface-2 border border-border rounded-lg p-3 space-y-1">
                <p>
                  Cerca de <strong className="text-foreground">{resultado.clientesQueVoltamSozinhos}</strong>{' '}
                  desses clientes voltariam sem campanha nenhuma, e vão ganhar o desconto assim mesmo
                  — são {moeda(resultado.custoDoVazamento)} que a campanha precisa cobrir.
                </p>
                <p>
                  Se ninguém a mais voltar, você perde esse valor. Daí a partir do{' '}
                  {resultado.clientesParaEmpatar === null ? 'ponto impossível' : `${resultado.clientesParaEmpatar}º cliente`}{' '}
                  extra a campanha começa a dar lucro.
                </p>
              </div>

              {resultado.descontoExcedeMargem && (
                <div className="flex gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Esse desconto come toda a margem do atendimento. Com comissão de{' '}
                    {comissaoMedia.toFixed(0)}%, sobram {moeda(resultado.margemPorCliente)} por cliente
                    — não existe volume de retorno que compense.
                  </span>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                A margem considera a comissão do barbeiro ({comissaoMedia.toFixed(0)}% em média), mas
                não considera produtos gastos no atendimento. As taxas de retorno são estimativas
                conservadoras até o salão ter campanha própria medida.
              </p>
            </>
          )}

          {/* Quem vai receber */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">
              Quem está elegível {loading && <span className="text-muted-foreground">(carregando...)</span>}
            </h3>
            {clientes.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">
                Ninguém elegível neste segmento agora. Clientes com horário já marcado, sem conversa
                no WhatsApp ou que receberam campanha nos últimos 30 dias ficam de fora.
              </p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="max-h-56 overflow-y-auto divide-y divide-border">
                  {clientes.map((c) => (
                    <div key={c.clientId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-foreground truncate">{c.nome}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                        {formatarData(c.ultimoAtendimento)} · {moeda(c.ticketMedio)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-border flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-surface">
          <p className="text-xs text-muted-foreground">
            Ainda não é possível disparar campanha — o envio entra na próxima fase.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-2 border border-border text-sm font-medium text-foreground"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
