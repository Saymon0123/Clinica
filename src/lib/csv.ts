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
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '')
  const separator = (clean.split('\n')[0] ?? '').includes(';') ? ';' : ','

  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let inQuotes = false

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
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim())
  return { headers, rows: nonEmpty }
}
