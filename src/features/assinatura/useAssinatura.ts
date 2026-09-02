import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type StatusAssinatura = 'trial' | 'pendente' | 'ativa' | 'atrasada' | 'cancelada'

/**
 * O que resta da assinatura no modelo por uso (2026-08-25): a situação do
 * acesso e o documento do pagante. Os campos de plano, recorrência e troca
 * morreram junto com o modelo Básico/Pro — nenhuma tela os consumia mais, e a
 * tabela `plans` foi aposentada (0110).
 */
export type Assinatura = {
  status: StatusAssinatura
  /** `null` = sem vencimento automático (barbearia que já paga, cobrança por fora). */
  acessoAte: string | null
  /** Dias inteiros até o vencimento. Negativo quando já venceu. `null` sem prazo. */
  diasRestantes: number | null
  expirada: boolean
  /** Só o dono recebe; para o resto da equipe vem `null`, e é assim mesmo. */
  cpfCnpj: string | null
  /**
   * Até quando o WhatsApp segue atendendo depois do vencimento — já com a régua
   * do banco (`atendimento_ate`, ou `acesso_ate + 3` quando não há coluna).
   */
  atendimentoAte: string | null
  /** O agente ainda está atendendo hoje. `false` = também parou. */
  atendendo: boolean
}

/**
 * Conta os dias até o fim do acesso, para o texto de contagem regressiva.
 *
 * Compara **datas**, não instantes: `acesso_ate` é `date`, e usar `Date.now()`
 * cru faria "vence hoje" virar "venceu" a partir da primeira hora do dia. O
 * dono perderia o último dia que pagou.
 *
 * Quem decide se está BLOQUEADO não é esta conta: é o banco, pela RPC, na data
 * de São Paulo — um celular com fuso trocado não pode trancar nem destrancar o
 * CRM.
 */
function diasAte(acessoAte: string): number {
  const [ano, mes, dia] = acessoAte.split('-').map(Number)
  const fim = new Date(ano, mes - 1, dia)
  const hoje = new Date()
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((fim.getTime() - hojeSemHora.getTime()) / 86400000)
}

type Situacao = {
  status: string
  acesso_ate: string | null
  atendimento_ate: string | null
  bloqueado: boolean
  atendendo: boolean
}

export function useAssinatura(salonId: string | null) {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) {
      setAssinatura(null)
      setLoading(false)
      return
    }
    setLoading(true)

    // Duas leituras, de propósito (achado 16 da revisão de 01/09).
    //
    // A situação do acesso vem da RPC `situacao_do_acesso`, que qualquer
    // vínculo da unidade pode chamar. Antes ela vinha da tabela, cuja policy é
    // só do dono: barbeiro e gerente recebiam nada, o layout lia "nada" como
    // "barbearia antiga, sem controle" e a equipe inteira seguia usando o CRM
    // de uma unidade vencida — enquanto o dono estava trancado do lado de fora.
    //
    // A policy da tabela não foi aberta porque a mesma linha guarda o CPF do
    // pagador. Ele continua vindo da tabela, e por isso continua sendo só do
    // dono: para o resto da equipe a segunda leitura devolve nulo, e é isso.
    const [situacaoRes, pagadorRes] = await Promise.all([
      supabase.rpc('situacao_do_acesso', { p_salon_id: salonId }).maybeSingle(),
      supabase.from('subscriptions').select('cpf_cnpj').eq('salon_id', salonId).maybeSingle(),
    ])

    // Falha de consulta e ausência de assinatura são coisas diferentes, e
    // tratá-las igual esconde defeito: um join ambíguo derrubou esta consulta
    // em 2026-08-02 e a tela anunciou, com toda a calma, que a barbearia não
    // tinha plano — apontando o dono para o suporte em vez de mostrar o erro.
    if (situacaoRes.error) {
      console.error('Erro ao carregar a situação do acesso:', situacaoRes.error)
      setAssinatura(null)
      setErro('Não foi possível carregar a assinatura agora.')
      setLoading(false)
      return
    }
    // O documento é acessório: se essa leitura falhar, o bloqueio continua
    // valendo — trancar ou destrancar o CRM não pode depender de um campo que
    // só o dono enxerga.
    if (pagadorRes.error) console.error('Erro ao carregar o documento do pagador:', pagadorRes.error)

    setErro(null)

    const situacao = situacaoRes.data as Situacao | null
    if (!situacao) {
      // Barbearia criada antes desta funcionalidade não tem assinatura. Isso
      // não é erro: some da tela em vez de acusar problema para o dono.
      setAssinatura(null)
      setLoading(false)
      return
    }

    setAssinatura({
      status: situacao.status as StatusAssinatura,
      acessoAte: situacao.acesso_ate,
      diasRestantes: situacao.acesso_ate ? diasAte(situacao.acesso_ate) : null,
      expirada: situacao.bloqueado,
      cpfCnpj: pagadorRes.data?.cpf_cnpj ?? null,
      atendimentoAte: situacao.atendimento_ate,
      atendendo: situacao.atendendo,
    })
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { assinatura, loading, erro, reload }
}
