/**
 * Memória de qual resumo o dono já leu, por conversa.
 *
 * Vive no `localStorage` porque é preferência de leitura de uma pessoa num
 * navegador, não estado do negócio: não vale uma coluna no banco nem uma ida à
 * rede. Antes disso o controle era um `Set` em memória, que morria a cada
 * recarga da página — e o popup voltava toda vez que o dono abria a conversa,
 * repetindo o que ele já tinha lido.
 *
 * A chave guarda o **texto** do resumo, não um "já viu". É o que faz o popup
 * reaparecer quando o agente escala de novo com um resumo diferente, sem voltar
 * a incomodar quando é o mesmo de sempre.
 */

const PREFIXO = 'resumo-visto:'

export function lerResumoVisto(conversationId: string): string | null {
  try {
    return localStorage.getItem(PREFIXO + conversationId)
  } catch {
    // Navegador com armazenamento bloqueado. Sem memória o popup reaparece,
    // que é chato mas inofensivo — nunca deixar a tela quebrar por causa disso.
    return null
  }
}

export function marcarResumoVisto(conversationId: string, resumo: string) {
  try {
    localStorage.setItem(PREFIXO + conversationId, resumo)
  } catch {
    // Idem: falhar em lembrar não pode impedir de fechar o popup.
  }
}
