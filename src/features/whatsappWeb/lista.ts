import type { Conversation } from './types'

/** Chegou mensagem depois da última vez que o dono abriu a conversa. */
export function naoLida(c: Pick<Conversation, 'last_message_at' | 'last_opened_at'>) {
  if (!c.last_message_at) return false
  return !c.last_opened_at || c.last_message_at > c.last_opened_at
}

/**
 * Filtra pela busca e põe as não lidas na frente.
 *
 * A ordem que vem do banco é cronológica pura, então uma conversa **não lida**
 * de ontem ficava abaixo de uma já lida de hoje — e o ponto vermelho não
 * adianta se está fora da tela. Dentro de cada grupo a ordem cronológica é
 * preservada, por isso a comparação devolve 0 para pares do mesmo grupo
 * (`sort` do JavaScript é estável).
 *
 * A busca casa por nome e por telefone. No telefone compara **só os dígitos**:
 * o dono digita "98727" ou "8727-5895" e o valor guardado é `554187275895`.
 * Comparar o texto cru não casaria nenhum dos dois.
 */
export function filtrarEOrdenar(lista: Conversation[], busca: string): Conversation[] {
  const termo = busca.trim().toLowerCase()
  const digitos = termo.replace(/\D/g, '')

  const filtradas = !termo
    ? lista
    : lista.filter((c) => {
        const nome = (c.contact_name ?? '').toLowerCase()
        if (nome.includes(termo)) return true
        return digitos.length > 0 && c.contact_phone.replace(/\D/g, '').includes(digitos)
      })

  return [...filtradas].sort((a, b) => Number(naoLida(b)) - Number(naoLida(a)))
}
