import { useState, type ChangeEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { parseCsv } from '../../lib/csv'

type Parsed = { nome: string; telefone: string | null; aniversario: string | null; observacao: string | null }

/** Aceita 2026-07-25 ou 25/07/2026. */
function parseDate(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) =>
    h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
  )
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate)
    if (idx !== -1) return idx
  }
  return -1
}

export function ImportClientsModal({
  salonId,
  onClose,
  onImported,
}: {
  salonId: string
  onClose: () => void
  onImported: () => void
}) {
  const [parsed, setParsed] = useState<Parsed[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inseridos: number; ignorados: number } | null>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setFileName(file.name)

    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)

      const iNome = findColumn(headers, ['nome', 'cliente', 'name'])
      if (iNome === -1) {
        setError('O arquivo precisa ter uma coluna "Nome".')
        setParsed(null)
        return
      }
      const iTelefone = findColumn(headers, ['telefone', 'celular', 'whatsapp', 'fone'])
      const iAniversario = findColumn(headers, ['aniversario', 'nascimento', 'data de nascimento'])
      const iObservacao = findColumn(headers, ['observacao', 'observacoes', 'obs', 'notas'])

      const registros: Parsed[] = []
      for (const row of rows) {
        const nome = (row[iNome] ?? '').trim()
        if (!nome) continue
        registros.push({
          nome,
          telefone: iTelefone !== -1 ? (row[iTelefone] ?? '').trim() || null : null,
          aniversario: iAniversario !== -1 ? parseDate(row[iAniversario] ?? '') : null,
          observacao: iObservacao !== -1 ? (row[iObservacao] ?? '').trim() || null : null,
        })
      }

      if (registros.length === 0) {
        setError('Nenhum cliente válido encontrado no arquivo.')
        setParsed(null)
        return
      }
      setParsed(registros)
    } catch (err) {
      console.error('Erro ao ler arquivo:', err)
      setError('Não foi possível ler o arquivo. Confira se é um CSV válido.')
      setParsed(null)
    }
  }

  async function handleImport() {
    if (!parsed) return
    setBusy(true)
    setError(null)

    let inseridos = 0
    let ignorados = 0

    // Lotes de 50: importar um a um levava minutos num CSV grande. Se um lote
    // falhar (telefone repetido derruba o insert inteiro), refaz aquele lote
    // linha a linha para pular só as duplicatas.
    const TAMANHO_DO_LOTE = 50
    for (let i = 0; i < parsed.length; i += TAMANHO_DO_LOTE) {
      const lote = parsed.slice(i, i + TAMANHO_DO_LOTE)
      const { error: loteError } = await supabase
        .from('clients')
        .insert(lote.map((r) => ({ salon_id: salonId, ...r })))
      if (!loteError) {
        inseridos += lote.length
        continue
      }
      for (const registro of lote) {
        const { error: insertError } = await supabase
          .from('clients')
          .insert({ salon_id: salonId, ...registro })
        if (insertError) {
          // 23505 = telefone já cadastrado neste salão
          if (insertError.code !== '23505') console.error('Erro ao importar cliente:', insertError)
          ignorados++
        } else {
          inseridos++
        }
      }
    }

    setBusy(false)
    setResult({ inseridos, ignorados })
    onImported()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border shadow-sm w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Importar clientes</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-medium text-success">{result.inseridos}</span> cliente
              {result.inseridos === 1 ? '' : 's'} importado{result.inseridos === 1 ? '' : 's'}.
            </p>
            {result.ignorados > 0 && (
              <p className="text-xs text-muted-foreground">
                {result.ignorados} linha{result.ignorados === 1 ? '' : 's'} ignorada
                {result.ignorados === 1 ? '' : 's'} (telefone já cadastrado ou dados inválidos).
              </p>
            )}
            <button
              onClick={onClose}
              className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Envie um arquivo CSV com uma coluna <strong>Nome</strong> (obrigatória) e, se quiser,
              Telefone, Aniversário e Observação. Clientes com telefone já cadastrado são ignorados.
            </p>

            <label className="block">
              <span className="sr-only">Arquivo CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-soft-foreground"
              />
            </label>

            {parsed && (
              <p className="text-sm text-foreground">
                <span className="font-medium">{parsed.length}</span> cliente
                {parsed.length === 1 ? '' : 's'} encontrado{parsed.length === 1 ? '' : 's'} em{' '}
                <span className="text-muted-foreground">{fileName}</span>.
              </p>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              onClick={handleImport}
              disabled={!parsed || busy}
              className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Upload size={15} />
              {busy ? 'Importando...' : 'Importar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
