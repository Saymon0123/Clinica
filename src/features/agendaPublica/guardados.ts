/**
 * Os horários guardados NESTE celular (etapa 3 da agenda pelo QR).
 *
 * O PROBLEMA. O link de gestão — a única chave para cancelar — aparece uma vez
 * só, na tela de "horário marcado", com um "salve nos favoritos ou tire um
 * print". Quem não salva nunca mais acha. É a etapa 3 que resolve isso para a
 * maioria: o aparelho guarda sozinho, e ao voltar no link da barbearia a pessoa
 * vê o próprio horário no topo.
 *
 * ─── O que mora aqui e o que NÃO mora ──────────────────────────────────────
 *
 * GUARDA SÓ O TOKEN E A HORA DE INÍCIO. A tentação é guardar o resumo inteiro
 * (serviço, barbeiro, preço) para desenhar o cartão sem ir ao servidor. Seria
 * uma cópia que envelhece: a barbearia cancela pelo CRM e o celular continua
 * anunciando um horário que não existe mais. A verdade vem do servidor a cada
 * carga; daqui sai só a pergunta.
 *
 * A HORA DE INÍCIO existe por um motivo estreito: decidir o que jogar fora sem
 * precisar perguntar. Horário que já começou não tem mais o que remarcar nem
 * cancelar.
 *
 * POR BARBEARIA. A chave leva o `salonId` porque a pessoa pode cortar em duas
 * — e o cartão de uma não tem nada que fazer na página da outra.
 *
 * ─── Por que tudo é try/catch ──────────────────────────────────────────────
 *
 * `localStorage` NÃO é uma variável: em aba anônima, com cookies bloqueados ou
 * com a cota estourada, o próprio acesso LEVANTA EXCEÇÃO — não devolve nulo.
 * Uma exceção não tratada aqui derruba a página pública inteira, e ela é a
 * única porta de quem está de pé no balcão. Guardar é um bônus; não guardar não
 * pode custar a tela.
 */

export type HorarioGuardado = {
  token: string
  /** ISO, como veio do servidor. Só para saber quando esquecer. */
  inicio: string
}

/** Cinco é folga larga: a trava do QR já é de um agendamento aberto por pessoa,
 *  e cinco cobre a família inteira marcando do mesmo aparelho. */
const MAXIMO = 5

const chave = (salonId: string) => `clubcut:horarios:${salonId}`

/** O formato de `token_gestao` no banco (`gen_random_uuid()`). Validar na volta
 *  impede que lixo escrito por outra versão — ou à mão — vire requisição. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function lerCru(salonId: string): HorarioGuardado[] {
  try {
    const bruto = localStorage.getItem(chave(salonId))
    if (!bruto) return []
    const lista = JSON.parse(bruto)
    if (!Array.isArray(lista)) return []
    return lista.filter(
      (h): h is HorarioGuardado =>
        !!h &&
        typeof h.token === 'string' &&
        UUID.test(h.token) &&
        typeof h.inicio === 'string' &&
        !Number.isNaN(new Date(h.inicio).getTime()),
    )
  } catch {
    return []
  }
}

function gravar(salonId: string, lista: HorarioGuardado[]) {
  try {
    if (lista.length) localStorage.setItem(chave(salonId), JSON.stringify(lista))
    else localStorage.removeItem(chave(salonId))
  } catch {
    // Sem storage o recurso simplesmente não existe para esta pessoa. A tela
    // continua marcando horário normalmente.
  }
}

/**
 * O que ainda vale a pena perguntar ao servidor: o que ainda não começou, do
 * mais próximo para o mais distante. **Limpa o que passou na mesma volta** —
 * senão a lista cresce para sempre no aparelho de quem usa a barbearia toda
 * semana.
 */
export function lerGuardados(salonId: string, agora: Date): HorarioGuardado[] {
  const validos = lerCru(salonId)
    .filter((h) => new Date(h.inicio).getTime() > agora.getTime())
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  if (validos.length !== lerCru(salonId).length) gravar(salonId, validos)
  return validos
}

/** Guarda mais um. Token repetido não duplica: remarcar mantém o mesmo token e
 *  só muda a hora. */
export function guardar(salonId: string, novo: HorarioGuardado, agora: Date): HorarioGuardado[] {
  if (!UUID.test(novo.token)) return lerGuardados(salonId, agora)
  const lista = [novo, ...lerGuardados(salonId, agora).filter((h) => h.token !== novo.token)]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, MAXIMO)
  gravar(salonId, lista)
  return lista
}

/**
 * Esquece um. Chamado quando o servidor diz que aquele horário não está mais de
 * pé — cancelado pela barbearia, concluído, ou apagado. Sem isto o cartão
 * insistiria em mostrar um horário morto a cada carga, e a pessoa apareceria na
 * barbearia confiando nele.
 */
export function esquecer(salonId: string, token: string, agora: Date): HorarioGuardado[] {
  const lista = lerGuardados(salonId, agora).filter((h) => h.token !== token)
  gravar(salonId, lista)
  return lista
}

/** Os únicos status em que ainda há o que fazer. Lista positiva, como no
 *  cancelamento pelo link: status novo não entra por esquecimento. */
const DE_PE = ['agendado', 'confirmado']

/**
 * Quais tokens jogar fora, dada a resposta do servidor.
 *
 * ESTA FUNÇÃO EXISTE POR CAUSA DE UM `if`. A regra vivia dentro do efeito da
 * página, onde teste nenhum alcança — e é a regra mais perigosa do arquivo:
 *
 *   **`resposta === null` significa que o servidor NÃO RESPONDEU** (rede caiu,
 *   429, 500). Nesse caso não se esquece NADA. Tratar "não respondeu" como
 *   "nenhum está de pé" apagaria os horários da pessoa PARA SEMPRE por causa de
 *   um soluço de conexão — e ela só descobriria ao chegar na barbearia.
 *
 * Esquecer tem de ser uma AFIRMAÇÃO do servidor ("este não está mais de pé"),
 * nunca a ausência de uma.
 */
export function tokensAEsquecer(
  guardados: HorarioGuardado[],
  resposta: { token: string; status: string }[] | null,
): string[] {
  if (resposta === null) return []
  const dePe = new Set(resposta.filter((h) => DE_PE.includes(h.status)).map((h) => h.token))
  return guardados.filter((g) => !dePe.has(g.token)).map((g) => g.token)
}
