/**
 * Distingue "sua sessão se perdeu" de "deu erro ao criar a barbearia".
 *
 * A `criar-minha-barbearia` responde 401 de dois jeitos: `Nao autorizado.`
 * quando a requisição chega sem cabeçalho `Authorization`, e `Sessao invalida.
 * Entre de novo.` quando o token chega mas o servidor não o aceita. As duas
 * frases vêm do servidor sem acento, e é assim que chegam aqui.
 *
 * Por que separar. Em 04/09/2026 um cadastro real morreu exatamente aqui: a
 * pessoa criou a conta, confirmou o e-mail pelo celular, preencheu o formulário
 * e recebeu "Não autorizado." — frase do servidor, mostrada crua, sem nenhuma
 * saída na tela. Não é erro de preenchimento e não adianta tentar de novo com
 * os mesmos dados; o que resolve é entrar de novo. Enquanto as duas famílias
 * de erro caírem no mesmo `setErro`, a tela continua sendo um beco.
 *
 * Casa por frase, e não por status, porque `invokeFunction` já converteu a
 * resposta em texto quando chega até aqui — o status fica dentro do
 * `error.context` do supabase-js e não sobrevive à conversão.
 */
export function ehFalhaDeSessao(mensagem: string | null | undefined): boolean {
  if (!mensagem) return false
  return /n[ãa]o autorizado|sess[ãa]o inv[áa]lida/i.test(mensagem)
}
