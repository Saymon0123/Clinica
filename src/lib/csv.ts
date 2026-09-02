/** Escapa um valor para CSV (aspas duplicadas, campo entre aspas). */
function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Monta um CSV a partir de cabeçalhos + linhas.
 * Usa ponto e vírgula, que é o separador que o Excel em português espera.
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(';')]
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(';'))
  }
  return lines.join('\r\n')
}

/** Dispara o download de um CSV no navegador (com BOM para o Excel ler acentos). */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Lê um CSV simples (separador ; ou ,) respeitando aspas.
 * Retorna a primeira linha como cabeçalho e o restante como registros.
 *
 * `linhas[i]` é o número da linha de `rows[i]` **no arquivo**, contando a
 * partir de 1 — o mesmo número que aparece na lateral do Excel. Ele existe
 * porque a importação precisa dizer *qual* linha recusou, e quem vai
 * consertar tem a planilha aberta, não este array.
 *
 * Por isso a contagem é física e nasce ANTES de qualquer filtro: linha em
 * branco no meio (ou no começo, que desloca o cabeçalho) e quebra de linha
 * dentro de aspas contam igual. Numerar depois de descartar as vazias aponta
 * o cliente errado, que é justamente o erro que a mensagem existe para evitar.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][]; linhas: number[] } {
  const clean = text.replace(/^﻿/, '')
  // Fareja o separador na primeira linha COM CONTEÚDO, não na primeira linha.
  // Export de sistema antigo às vezes começa com uma linha em branco: olhando a
  // linha 1 o ponto e vírgula não aparece, o parser cai na vírgula e cada linha
  // do arquivo vira uma célula só — o cabeçalho some, a importação diz que
  // falta a coluna "Nome" e o dono não tem como descobrir o motivo.
  const primeiraComConteudo = clean.split('\n').find((linha) => linha.trim() !== '') ?? ''
  const separator = primeiraComConteudo.includes(';') ? ';' : ','

  const brutas: { campos: string[]; linha: number }[] = []
  let cell = ''
  let row: string[] = []
  let inQuotes = false
  let linha = 1
  let inicioDaLinha = 1

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        // Quebra de linha dentro de aspas é um registro só para o Excel, mas
        // ocupa duas linhas na tela dele — contar aqui mantém os números iguais.
        if (char === '\n') linha++
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === separator) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      brutas.push({ campos: row, linha: inicioDaLinha })
      row = []
      cell = ''
      linha++
      inicioDaLinha = linha
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    brutas.push({ campos: row, linha: inicioDaLinha })
  }

  const cheias = brutas.filter((r) => r.campos.some((c) => c.trim() !== ''))
  const cabecalho = cheias.shift()
  return {
    headers: (cabecalho?.campos ?? []).map((h) => h.trim()),
    rows: cheias.map((r) => r.campos),
    linhas: cheias.map((r) => r.linha),
  }
}
