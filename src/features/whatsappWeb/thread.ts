import type { Message } from './types'

export type ItemDaThread =
  | { tipo: 'dia'; chave: string; rotulo: string }
  | { tipo: 'mensagem'; chave: string; mensagem: Message; ultimaDoBloco: boolean }

/** `2026-08-02` no fuso local — a chave que separa um dia do outro. */
function diaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * "Hoje" e "Ontem" em vez da data: é como a pessoa pensa, e é o que ela procura
 * ao rolar para trás.
 */
export function rotuloDoDia(iso: string, agora = new Date()): string {
  const hoje = diaLocal(agora.toISOString())
  const ontem = diaLocal(new Date(agora.getTime() - 86400000).toISOString())
  const dia = diaLocal(iso)

  if (dia === hoje) return 'Hoje'
  if (dia === ontem) return 'Ontem'

  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

/**
 * Transforma a lista plana de mensagens no que a tela desenha.
 *
 * Faz duas coisas que a lista crua não fazia:
 *
 * **Separa por dia.** Sem isso, uma conversa de três meses é uma parede
 * contínua e não dá para saber onde começa hoje.
 *
 * **Agrupa mensagens seguidas do mesmo remetente.** Antes, três respostas
 * seguidas do agente repetiam "Agente · 15:27" três vezes. Agora a assinatura
 * aparece só na última do bloco, e as de cima ficam coladas — que é como a
 * conversa é lida.
 */
export function montarThread(mensagens: Message[], agora = new Date()): ItemDaThread[] {
  const itens: ItemDaThread[] = []

  mensagens.forEach((mensagem, i) => {
    const anterior = mensagens[i - 1]
    const proxima = mensagens[i + 1]

    if (!anterior || diaLocal(anterior.created_at) !== diaLocal(mensagem.created_at)) {
      const dia = diaLocal(mensagem.created_at)
      itens.push({ tipo: 'dia', chave: `dia-${dia}`, rotulo: rotuloDoDia(mensagem.created_at, agora) })
    }

    // Fecha o bloco quando o próximo item muda de remetente, muda de dia, ou
    // simplesmente não existe.
    const ultimaDoBloco =
      !proxima ||
      proxima.sender !== mensagem.sender ||
      proxima.direction !== mensagem.direction ||
      diaLocal(proxima.created_at) !== diaLocal(mensagem.created_at)

    itens.push({ tipo: 'mensagem', chave: mensagem.id, mensagem, ultimaDoBloco })
  })

  return itens
}
