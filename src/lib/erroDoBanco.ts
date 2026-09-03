import { AVISO_TELEFONE_INVALIDO } from './telefone'

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

/**
 * Regra que caiu, pelo nome da constraint.
 *
 * O Postgres manda o nome dentro da mensagem: 'new row for relation "clients"
 * violates check constraint "clients_telefone_valido"'. É a única parte do
 * erro que diz QUAL regra o dado feriu — o código sozinho (23514) só diz que
 * alguma caiu, e vira a frase genérica "deixaria um dado inválido", que não
 * ajuda o dono a arrumar nada. Por isso este mapa é consultado antes do mapa
 * por código.
 *
 * Cresce a cada CHECK nomeada que valha uma frase própria; a chave é o nome
 * exato da constraint no banco, então renomear lá exige mexer aqui.
 */
const POR_CONSTRAINT: Record<string, string> = {
  // CHECK da migration 0128, a mesma faixa de `classificarTelefone`.
  clients_telefone_valido: AVISO_TELEFONE_INVALIDO,
  // CHECKs da 0132: nada sai a R$ 0,00 por acidente.
  products_preco_de_venda_positivo: 'O preço de venda precisa ser maior que zero.',
  services_preco_positivo: 'O preço do serviço precisa ser maior que zero.',
  // Índice único de telefone normalizado por salão: o 23505 real do CRM.
  uq_clients_salon_telefone_norm: 'Já existe um cliente cadastrado com esse telefone.',
}

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
  // Chave estrangeira: apagar algo que outra linha ainda usa.
  '23503': 'Esse registro está ligado a outro e não pode ser removido.',
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

  // Depois do teste acima porque a mensagem do Postgres é em inglês e nunca
  // casa com a heurística de português: as duas checagens olham `message`,
  // mas cada uma pega um tipo de erro diferente. E na frente de `especificos`
  // de propósito: quem chamou escolhe a frase pelo código, que não distingue
  // qual CHECK caiu — aqui o nome da constraint distingue.
  if (message) {
    for (const [constraint, frase] of Object.entries(POR_CONSTRAINT)) {
      if (message.includes(constraint)) return frase
    }
  }

  if (code && especificos?.[code]) return especificos[code]
  if (code && PADRAO[code]) return PADRAO[code]
  return padrao
}
