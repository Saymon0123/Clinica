import { useEffect, useState } from 'react'
import { invokeFunction } from '../../lib/invokeFunction'

/**
 * O funil, em números.
 *
 * Até aqui o projeto só media **comportamento do agente** (a auditoria). Isso
 * diz se o código funciona, não se o produto funciona — e são coisas
 * diferentes. Sem saber onde as barbearias param, anunciar é comprar
 * aprendizado pelo preço mais caro que existe.
 *
 * Os números escolhidos são os que mudam decisão. Deliberadamente **não** tem
 * gráfico nem série histórica: com cinco barbearias, gráfico é decoração.
 */
type Metricas = {
  barbearias: number
  ativaram: number
  vivas_7d: number
  em_teste: number
  pagantes: number
  canceladas: number
  venceram_sem_pagar: number
  contas_sem_barbearia: number
  mensagens_recebidas: number
}

function Numero({
  valor,
  rotulo,
  explica,
  alerta,
}: {
  valor: number
  rotulo: string
  explica: string
  alerta?: boolean
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className={`text-2xl font-semibold ${alerta ? 'text-danger' : 'text-foreground'}`}>
        {valor}
      </div>
      <div className="text-sm text-foreground">{rotulo}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{explica}</div>
    </div>
  )
}

export function MetricasDoProduto({ secret }: { secret: string }) {
  const [m, setMetricas] = useState<Metricas | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      const { data, error } = await invokeFunction<{ metricas: Metricas }>('admin-metricas', {
        headers: { 'x-admin-secret': secret },
        body: {},
      })
      if (error || !data?.metricas) setErro(error ?? 'Não foi possível carregar as métricas.')
      else setMetricas(data.metricas)
    }
    carregar()
  }, [secret])

  if (erro) return <p className="text-sm text-danger">{erro}</p>
  if (!m) return <p className="text-sm text-muted-foreground">Carregando métricas...</p>

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Numero valor={m.barbearias} rotulo="Barbearias" explica="ativas no sistema" />
        <Numero
          valor={m.ativaram}
          rotulo="Ativaram"
          explica="conectaram o WhatsApp e já trocaram mensagem"
        />
        <Numero
          valor={m.vivas_7d}
          rotulo="Vivas"
          explica="tiveram agendamento nos últimos 7 dias"
          alerta={m.barbearias > 0 && m.vivas_7d === 0}
        />
        <Numero valor={m.em_teste} rotulo="Em teste" explica="dentro do período grátis" />
        <Numero valor={m.pagantes} rotulo="Pagantes" explica="assinatura ativa" />
        <Numero
          valor={m.venceram_sem_pagar}
          rotulo="Venceram sem pagar"
          explica="o buraco entre o fim do teste e a assinatura"
          alerta={m.venceram_sem_pagar > 0}
        />
        <Numero
          valor={m.contas_sem_barbearia}
          rotulo="Contas sem barbearia"
          explica="criaram conta e pararam no passo 2"
          alerta={m.contas_sem_barbearia > 0}
        />
        <Numero valor={m.canceladas} rotulo="Cancelaram" explica="pediram para sair" />
        <Numero
          valor={m.mensagens_recebidas}
          rotulo="Mensagens recebidas"
          explica="cada uma custa uma rodada do agente"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        <strong>Ativaram</strong> exige mensagem trocada, não só QR lido: conectar sem nunca receber
        mensagem é cadastro, não uso.
      </p>
    </div>
  )
}
