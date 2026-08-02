import type { PassoDoTour } from './Tour'

/**
 * Textos do tour, separados do JSX de propósito: dá para revisar a redação
 * sem abrir componente, e a lista de âncoras fica visível num lugar só.
 *
 * Regra de escrita: dizer **o que a pessoa ganha**, não o que o botão faz.
 * "Conectar WhatsApp" ela já lê na tela; o que ela não sabe é que sem isso o
 * agente não atende ninguém.
 *
 * Três a quatro passos por tela. Acima disso vira aula, e aula se pula.
 */
export const PASSOS_CONEXAO: PassoDoTour[] = [
  {
    ancora: 'conexao-status',
    titulo: 'É aqui que tudo começa',
    texto:
      'Enquanto o WhatsApp não estiver conectado, o agente não recebe nem responde nenhuma mensagem. Esta é a única tela que precisa ser resolvida antes de qualquer outra.',
  },
  {
    ancora: 'conexao-acao',
    titulo: 'Use o número do salão',
    texto:
      'Ao gerar o QR code, leia com o celular da barbearia — não com o seu pessoal. É desse número que seus clientes vão receber as respostas, os lembretes e a confirmação de horário.',
  },
  {
    ancora: 'conexao-agente',
    titulo: 'Acompanhe o que o agente resolveu',
    texto:
      'Aqui aparece quantas conversas ele atendeu sozinho e em quanto tempo respondeu. É a medida do tempo que você deixou de gastar no celular.',
  },
]
