/**
 * O horário na agenda do celular, como arquivo `.ics` (etapa 3).
 *
 * POR QUE `.ics` E NÃO UM LINK DO GOOGLE. O link do Google Agenda funciona em
 * qualquer lugar, mas obriga a pessoa a ter conta no Google e joga ela para
 * fora do celular. O `.ics` é o formato que iPhone e Android entendem
 * nativamente (RFC 5545) e não pede conta de ninguém.
 *
 * O LIMITE HONESTO: o que cada celular FAZ ao receber o arquivo varia — o iOS
 * costuma abrir a folha de "adicionar ao calendário", o Android costuma baixar
 * e esperar um toque. Isto aqui garante que o conteúdo do arquivo está correto;
 * não garante o gesto de cada aparelho, e isso só o teste no telefone de
 * verdade responde.
 */

/**
 * Escapa um texto para um campo TEXT do iCalendar.
 *
 * A ORDEM IMPORTA: a contrabarra primeiro, senão as contrabarras que esta
 * própria função insere seriam escapadas de novo e o arquivo sairia com `\\,`
 * no lugar de `\,` — o calendário mostraria a contrabarra na tela.
 *
 * Vírgula e ponto e vírgula são separadores de lista no formato; sem escape,
 * "Corte, barba e sobrancelha" vira três valores e o título aparece cortado.
 */
export function escaparTexto(valor: string) {
  return valor
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** 'YYYYMMDDTHHMMSSZ' — o formato UTC do iCalendar. */
export function marcaDeTempo(data: Date) {
  return data.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Dobra linhas em 75 octetos, como o RFC manda.
 *
 * Não é capricho: o Google Agenda e o Outlook recusam o arquivo inteiro quando
 * uma linha passa disso, e o nome de uma barbearia com serviços longos chega lá
 * fácil. A continuação começa com UM espaço, que o leitor descarta.
 *
 * A conta é em BYTES, não em caracteres: "Sobrancelha" tem acento, e cada letra
 * acentuada ocupa dois. Cortar por caractere estoura o limite em texto
 * português sem ninguém perceber.
 */
export function dobrarLinha(linha: string) {
  const bytes = new TextEncoder().encode(linha)
  if (bytes.length <= 75) return linha

  const partes: string[] = []
  let atual = ''
  let tamanho = 0
  for (const letra of linha) {
    const custo = new TextEncoder().encode(letra).length
    // 74 nas continuações: o espaço da dobra também conta no limite.
    const teto = partes.length === 0 ? 75 : 74
    if (tamanho + custo > teto) {
      partes.push(atual)
      atual = ''
      tamanho = 0
    }
    atual += letra
    tamanho += custo
  }
  if (atual) partes.push(atual)
  return partes.map((p, i) => (i === 0 ? p : ` ${p}`)).join('\r\n')
}

export type EventoDoHorario = {
  /** Vira o UID. O token de gestão serve: é único e já identifica o horário. */
  id: string
  titulo: string
  inicio: Date
  fim: Date
  local?: string | null
  descricao?: string | null
  /** Quando o arquivo foi gerado (DTSTAMP). Entra por parâmetro para o teste
   *  não depender do relógio. */
  agora: Date
}

/**
 * O arquivo inteiro. Linhas terminadas em CRLF porque o RFC exige — e porque
 * leitor que aceita `\n` sozinho é a exceção, não a regra.
 */
export function eventoIcs({ id, titulo, inicio, fim, local, descricao, agora }: EventoDoHorario) {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Club Cut//Agenda publica//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}@clubcut`,
    `DTSTAMP:${marcaDeTempo(agora)}`,
    `DTSTART:${marcaDeTempo(inicio)}`,
    `DTEND:${marcaDeTempo(fim)}`,
    `SUMMARY:${escaparTexto(titulo)}`,
    ...(local ? [`LOCATION:${escaparTexto(local)}`] : []),
    ...(descricao ? [`DESCRIPTION:${escaparTexto(descricao)}`] : []),
    // Um aviso 1h antes. A barbearia já manda o lembrete pelo WhatsApp entre
    // T-85 e T-100min; este é do próprio celular e funciona mesmo sem sinal.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Lembrete',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return linhas.map(dobrarLinha).join('\r\n')
}
