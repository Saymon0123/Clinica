/**
 * O documento de quem paga como condição para continuar depois do teste (M2 do
 * giro de 10/09, migration 0156).
 *
 * Quem decide é o banco: `situacao_do_acesso` diz se o documento de cobrança
 * está em dia e, com o acesso bloqueado, o motivo. O motivo muda o que o dono
 * tem de fazer — cadastrar o documento, pagar a cobrança, ou nada, se cancelou
 * —, então a tela não pode tratar todo bloqueio igual.
 */
export type MotivoDoBloqueio = 'sem_documento' | 'cobranca_vencida' | 'cancelada' | 'vencido'

const MOTIVOS: readonly string[] = ['sem_documento', 'cobranca_vencida', 'cancelada', 'vencido']

/** O texto que vem do banco vira o tipo; ausente ou desconhecido vira nulo. */
export function lerMotivoDoBloqueio(valor: unknown): MotivoDoBloqueio | null {
  return typeof valor === 'string' && MOTIVOS.includes(valor) ? (valor as MotivoDoBloqueio) : null
}

type SituacaoDoDocumento = {
  status: string
  acessoAte: string | null
  expirada: boolean
  documentoOk: boolean
}

/**
 * O pedido de documento que acompanha o aviso do teste. Nulo quando não há o
 * que pedir: documento em dia, assinatura sem vencimento automático, ou quem
 * cancelou — pedir CPF a quem está saindo soaria como cobrança disfarçada.
 */
export function pedidoDeDocumento({ status, acessoAte, expirada, documentoOk }: SituacaoDoDocumento): string | null {
  if (documentoOk || acessoAte === null || status === 'cancelada') return null
  if (expirada) return 'Cadastre o CPF ou CNPJ de quem vai pagar e o acesso volta na hora.'
  if (status === 'trial') return 'Para continuar depois do teste, cadastre o CPF ou CNPJ de quem vai pagar.'
  return 'Cadastre o CPF ou CNPJ de quem paga: sem ele, o acesso não renova.'
}
