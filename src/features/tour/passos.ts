import type { PassoDoTour } from './Tour'

/**
 * Textos do tour, separados do JSX de propósito: dá para revisar a redação
 * sem abrir componente, e a lista de âncoras fica visível num lugar só.
 *
 * Regras de escrita:
 *
 * - Dizer **o que a pessoa ganha ou arrisca**, não o que o botão faz. O rótulo
 *   do botão ela já lê na tela.
 * - **Uma frase.** Duas no máximo, e curtas. Balão comprido não é lido; é
 *   pulado, e aí o passo seguinte também.
 * - Três a quatro passos por tela. Acima disso vira aula, e aula se pula.
 */
export const PASSOS_CONEXAO: PassoDoTour[] = [
  {
    ancora: 'conexao-status',
    titulo: 'Comece por aqui',
    texto: 'Sem o WhatsApp conectado, o agente não responde ninguém.',
  },
  {
    ancora: 'conexao-acao',
    titulo: 'Use o celular do salão',
    texto:
      'É desse número que o cliente recebe resposta, lembrete e confirmação. Não use o seu pessoal.',
  },
  {
    ancora: 'conexao-agente',
    titulo: 'O que o agente resolveu',
    texto: 'Conversas atendidas sozinho e tempo de resposta — o tempo que você não gastou no celular.',
  },
]
