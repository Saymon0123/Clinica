/**
 * Tradutor único de erro do Postgres para português de barbearia.
 *
 * Existia uma cópia dessa tradução em cada tela — e elas divergiam. O mesmo
 * telefone duplicado dizia "Já existe um cliente cadastrado com esse telefone"
 * em Clientes e "Não foi possível criar a reserva. Tente novamente." na
 * Agenda: mesma causa, uma tela explica e a outra manda tentar de novo o que
 * nunca vai funcionar (divergência de caminho apontada na revisão de 01/09).
 *
 * Quem tem contexto melhor passa `especificos` e sobrepõe a frase padrão.
 */
type ErroPostgres = { code?: string; message?: string } | null | undefined

const PADRAO: Record<string, string> = {
  // Índice único violado. O caso real é sempre telefone de cliente.
  '23505': 'Já existe um cliente cadastrado com esse telefone.',
  // Trava de sobreposição de agendamento.
  '23P01': 'Esse horário já está ocupado. Escolha outro.',
  // CHECK: estoque negativo, consumo além do pacote, salão sem dono.
  '23514': 'Essa operação não é permitida porque deixaria um dado inválido.',
  // Texto onde se espera número/uuid.
  '22P02': 'Algum campo veio com formato inválido. Confira e tente de novo.',
  '22023': 'Algum campo está inválido. Confira e tente de novo.',
  // RLS ou checagem de papel dentro de uma RPC.
  '42501': 'Você não tem permissão para fazer isso.',
  // Coluna obrigatória sem valor.
  '23502': 'Faltou preencher um campo obrigatório.',
}

export function traduzirErroDoBanco(
  erro: ErroPostgres,
  especificos?: Record<string, string>,
  padrao = 'Não foi possível concluir. Tente novamente.',
): string {
  if (!erro) return padrao
  const { code, message } = erro

  // Mensagem que veio de um `raise exception` nosso já está em português e
  // sabe mais do contexto que qualquer tabela genérica — usa ela.
  if (message && /[áâãéêíóôõúç]|barbearia|pacote|dono|horário|crédito/i.test(message)) {
    return message.replace(/^ERROR:\s*/i, '')
  }

  if (code && especificos?.[code]) return especificos[code]
  if (code && PADRAO[code]) return PADRAO[code]
  return padrao
}
