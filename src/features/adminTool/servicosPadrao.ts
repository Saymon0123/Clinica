export type ServicoPadrao = {
  nome: string
  preco: number
  duracao_minutos: number
  grupo: string
  padrao: boolean
}

/**
 * Catálogo sugerido no cadastro de uma barbearia nova.
 * Os marcados como `padrao` já vêm selecionados — são o mínimo para o
 * barbeiro conseguir agendar e vender no primeiro acesso.
 * Preços e tempos são apenas ponto de partida, editáveis no wizard.
 */
export const SERVICOS_PADRAO: ServicoPadrao[] = [
  // Essenciais
  { nome: 'Corte masculino', preco: 45, duracao_minutos: 30, grupo: 'Essenciais', padrao: true },
  { nome: 'Barba', preco: 35, duracao_minutos: 20, grupo: 'Essenciais', padrao: true },
  { nome: 'Corte + Barba', preco: 70, duracao_minutos: 50, grupo: 'Essenciais', padrao: true },
  { nome: 'Pezinho / acabamento', preco: 20, duracao_minutos: 15, grupo: 'Essenciais', padrao: true },
  { nome: 'Sobrancelha', preco: 15, duracao_minutos: 10, grupo: 'Essenciais', padrao: true },
  { nome: 'Corte infantil', preco: 40, duracao_minutos: 30, grupo: 'Essenciais', padrao: true },

  // Barba e estética masculina
  { nome: 'Barboterapia (toalha quente)', preco: 50, duracao_minutos: 40, grupo: 'Barba e estética', padrao: false },
  { nome: 'Design de barba', preco: 40, duracao_minutos: 30, grupo: 'Barba e estética', padrao: false },
  { nome: 'Pigmentação de barba', preco: 40, duracao_minutos: 30, grupo: 'Barba e estética', padrao: false },
  { nome: 'Limpeza de pele', preco: 60, duracao_minutos: 40, grupo: 'Barba e estética', padrao: false },
  { nome: 'Massagem relaxante', preco: 40, duracao_minutos: 30, grupo: 'Barba e estética', padrao: false },
  { nome: 'Depilação nasal', preco: 15, duracao_minutos: 10, grupo: 'Barba e estética', padrao: false },
  { nome: 'Depilação de orelha', preco: 15, duracao_minutos: 10, grupo: 'Barba e estética', padrao: false },

  // Química e coloração
  { nome: 'Platinado / descoloração', preco: 150, duracao_minutos: 120, grupo: 'Química e coloração', padrao: false },
  { nome: 'Luzes / mechas', preco: 120, duracao_minutos: 90, grupo: 'Química e coloração', padrao: false },
  { nome: 'Camuflagem de brancos', preco: 50, duracao_minutos: 40, grupo: 'Química e coloração', padrao: false },
  { nome: 'Relaxamento / progressiva', preco: 90, duracao_minutos: 60, grupo: 'Química e coloração', padrao: false },
  { nome: 'Selagem', preco: 80, duracao_minutos: 60, grupo: 'Química e coloração', padrao: false },

  // Cuidados e outros
  { nome: 'Hidratação capilar', preco: 40, duracao_minutos: 30, grupo: 'Cuidados', padrao: false },
  { nome: 'Lavagem / escova', preco: 20, duracao_minutos: 15, grupo: 'Cuidados', padrao: false },
  { nome: 'Corte na máquina (social)', preco: 30, duracao_minutos: 20, grupo: 'Cuidados', padrao: false },
]

export type DiaSemana = {
  chave: string
  label: string
  aberto: boolean
  abre: string
  fecha: string
}

export const HORARIO_PADRAO: DiaSemana[] = [
  { chave: 'seg', label: 'Segunda', aberto: true, abre: '09:00', fecha: '19:00' },
  { chave: 'ter', label: 'Terça', aberto: true, abre: '09:00', fecha: '19:00' },
  { chave: 'qua', label: 'Quarta', aberto: true, abre: '09:00', fecha: '19:00' },
  { chave: 'qui', label: 'Quinta', aberto: true, abre: '09:00', fecha: '19:00' },
  { chave: 'sex', label: 'Sexta', aberto: true, abre: '09:00', fecha: '20:00' },
  { chave: 'sab', label: 'Sábado', aberto: true, abre: '09:00', fecha: '18:00' },
  { chave: 'dom', label: 'Domingo', aberto: false, abre: '09:00', fecha: '13:00' },
]

/** Converte para o formato guardado em salons.horario_funcionamento. */
export function serializarHorario(dias: DiaSemana[]) {
  return Object.fromEntries(
    dias.map((d) => [d.chave, d.aberto ? { abre: d.abre, fecha: d.fecha } : null]),
  )
}
