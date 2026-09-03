import { useMemo, useState, type ChangeEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { buildCsv, downloadCsv, parseCsv } from '../../lib/csv'
import { parseDataBr } from '../../lib/dataBr'
import { classificarTelefone, somenteDigitos } from '../../lib/telefone'
import { ErroInline } from '../../components/ErroInline'

/**
 * O que vai para o banco — e só isto. O número da linha e a linha original do
 * arquivo são controle da tela e ficam FORA daqui: uma chave a mais no objeto
 * do `.insert()` é coluna inexistente em `clients`, e o PostgREST derruba o
 * lote inteiro com PGRST204 em vez de gravar as 49 linhas boas.
 */
type ClientePayload = {
  nome: string
  telefone: string | null
  aniversario: string | null
  observacao: string | null
}

/** Linha aprovada: o payload de um lado, o controle do outro. */
type LinhaPronta = { linha: number; dados: ClientePayload }

/**
 * Linha recusada. Guarda `bruta` (a linha como veio) porque o conserto acontece
 * no Excel: o dono baixa as recusadas, arruma e reimporta o mesmo arquivo.
 */
type Recusada = { linha: number; nome: string; motivo: string; bruta: string[] }

/**
 * Os baldes da prévia.
 *
 * Eles NUNCA somam num número só. "já estava cadastrado", "sem nome" e
 * "telefone inválido" pedem ações opostas de quem abriu a planilha: um se
 * resolve ignorando, o outro digitando o nome, o outro corrigindo o número.
 * Um total de "3 ignorados" não diz o que fazer com nenhum deles.
 *
 * `recusadas` são os três juntos em ordem de linha — existe só para a lista da
 * tela e para o CSV de correção, não como contagem exibida.
 */
type Previa = {
  prontos: LinhaPronta[]
  semNome: Recusada[]
  telefoneInvalido: Recusada[]
  dataInvalida: Recusada[]
  repetidos: Recusada[]
  recusadas: Recusada[]
}

type Arquivo = { headers: string[]; rows: string[][]; linhas: number[] }

type Colunas = { nome: number; telefone: number; aniversario: number; observacao: number }

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

function mapearColunas(headers: string[]): Colunas {
  return {
    nome: findColumn(headers, ['nome', 'cliente', 'name']),
    telefone: findColumn(headers, ['telefone', 'celular', 'whatsapp', 'fone']),
    aniversario: findColumn(headers, ['aniversario', 'nascimento', 'data de nascimento']),
    observacao: findColumn(headers, ['observacao', 'observacoes', 'obs', 'notas']),
  }
}

/**
 * O banco deduplica cliente pelos últimos 8 dígitos (`telefone_norm`). O
 * arquivo do sistema antigo costuma trazer o mesmo cliente duas vezes com
 * máscaras diferentes — "(41) 98727-5895" e "5541987275895". Mandar os dois
 * faz o segundo voltar como 23505 e aparecer no resultado como "já cadastrado",
 * o que é mentira: ele acabou de ser criado por este mesmo arquivo.
 */
const SUFIXO_DEDUPE = 8

/** Quantas linhas recusadas cabem antes do botão sair da tela. */
const MAX_RECUSADAS_NA_TELA = 5

/** "1 cliente" / "2 clientes", sem repetir o ternário em cada frase. */
function contagem(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * A régua única da importação: a prévia e o `.insert()` chamam esta mesma
 * função. Ter uma validação na leitura e outra na gravação já significou a tela
 * prometer 200 e o banco receber 197 sem ninguém explicar os 3.
 */
function separarEmBaldes(arquivo: Arquivo): Previa {
  const col = mapearColunas(arquivo.headers)
  const previa: Previa = {
    prontos: [],
    semNome: [],
    telefoneInvalido: [],
    dataInvalida: [],
    repetidos: [],
    recusadas: [],
  }
  // Sufixo -> número da linha que ficou com ele. Vale a primeira ocorrência,
  // que é a ordem que o dono vê na planilha.
  const vistos = new Map<string, number>()

  arquivo.rows.forEach((row, i) => {
    // Número do arquivo, o mesmo da lateral do Excel — vem do parseCsv, não da
    // posição no array. Linha em branco no meio da planilha desloca um do
    // outro, e apontar a linha errada manda o dono corrigir o cliente errado.
    const linha = arquivo.linhas[i] ?? i + 2
    const nome = (row[col.nome] ?? '').trim()
    const telefone = col.telefone !== -1 ? (row[col.telefone] ?? '').trim() : ''

    function recusar(motivo: string, balde: Recusada[]) {
      const item: Recusada = { linha, nome, motivo, bruta: row }
      balde.push(item)
      previa.recusadas.push(item)
    }

    if (!nome) {
      recusar('sem nome', previa.semNome)
      return
    }

    const estado = classificarTelefone(telefone)
    if (estado === 'invalido') {
      recusar(`telefone "${telefone}"`, previa.telefoneInvalido)
      return
    }

    // A data entra na mesma peneira do telefone. Marcada aqui, ela aparece na
    // lista da prévia e sai no CSV de recusadas; deixada passar, viraria erro
    // sem nome na hora de gravar.
    const bruta = col.aniversario !== -1 ? (row[col.aniversario] ?? '').trim() : ''
    const aniversario = col.aniversario !== -1 ? parseDataBr(bruta) : null
    if (aniversario === 'invalida') {
      recusar(`aniversário "${bruta}"`, previa.dataInvalida)
      return
    }

    if (estado === 'valido') {
      const chave = somenteDigitos(telefone).slice(-SUFIXO_DEDUPE)
      const primeira = vistos.get(chave)
      if (primeira !== undefined) {
        recusar(`telefone "${telefone}" repetido da linha ${primeira}`, previa.repetidos)
        return
      }
      vistos.set(chave, linha)
    }

    previa.prontos.push({
      linha,
      dados: {
        nome,
        // Grava exatamente como veio. Cada canal escreve o telefone do seu
        // jeito e quem normaliza é o banco; se a importação padronizasse, o
        // dono deixaria de reconhecer o próprio dado na lista.
        telefone: telefone || null,
        aniversario,
        observacao: col.observacao !== -1 ? (row[col.observacao] ?? '').trim() || null : null,
      },
    })
  })

  return previa
}

/**
 * A quebra do que ficou de fora, um balde por linha.
 *
 * Aparece igual na prévia e no resultado de propósito: quem acabou de importar
 * precisa da mesma quebra de quem estava decidindo importar. "3 linhas de
 * fora" não diz se falta digitar um nome ou corrigir um número, e é justamente
 * aí, com o resultado na tela, que o dono decide o que fazer em seguida.
 */
function BaldesDeFora({ previa }: { previa: Previa }) {
  return (
    <ul className="text-xs text-muted-foreground space-y-0.5">
      {previa.semNome.length > 0 && (
        <li>{contagem(previa.semNome.length, 'linha', 'linhas')} sem nome</li>
      )}
      {previa.telefoneInvalido.length > 0 && (
        <li>
          {contagem(previa.telefoneInvalido.length, 'linha', 'linhas')} com telefone inválido
        </li>
      )}
      {previa.dataInvalida.length > 0 && (
        <li>{contagem(previa.dataInvalida.length, 'linha', 'linhas')} com aniversário inválido</li>
      )}
      {previa.repetidos.length > 0 && (
        <li>
          {contagem(previa.repetidos.length, 'linha repetida', 'linhas repetidas')} dentro do
          próprio arquivo
        </li>
      )}
    </ul>
  )
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
  const [arquivo, setArquivo] = useState<Arquivo | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    inseridos: number
    jaCadastrados: number
    falharam: number
  } | null>(null)

  const previa = useMemo(() => (arquivo ? separarEmBaldes(arquivo) : null), [arquivo])

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setFileName(file.name)

    try {
      const text = await file.text()
      const { headers, rows, linhas } = parseCsv(text)

      if (mapearColunas(headers).nome === -1) {
        setError('O arquivo precisa ter uma coluna "Nome".')
        setArquivo(null)
        return
      }
      if (rows.length === 0) {
        setError('O arquivo não tem nenhuma linha de cliente.')
        setArquivo(null)
        return
      }

      setArquivo({ headers, rows, linhas })
    } catch (err) {
      console.error('Erro ao ler arquivo:', err)
      setError('Não foi possível ler o arquivo. Confira se é um CSV válido.')
      setArquivo(null)
    } finally {
      // Zera a escolha do input. Sem isto, escolher o MESMO arquivo de novo não
      // dispara o onChange — e "corrigi no Excel e vou reimportar" é justamente
      // o fluxo em que o nome do arquivo não muda. A tela parecia travada.
      input.value = ''
    }
  }

  function baixarRecusadas() {
    if (!arquivo || !previa || previa.recusadas.length === 0) return
    // Mesmas colunas do arquivo de entrada, sem coluna de motivo: o CSV volta
    // corrigido e é reimportado como está, não é um relatório para arquivar.
    const csv = buildCsv(
      arquivo.headers,
      previa.recusadas.map((r) => r.bruta),
    )
    downloadCsv(`clientes-recusados-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  async function handleImport() {
    if (!arquivo) return
    // Refiltra com a mesma função que desenhou a prévia, para o que entra no
    // banco ser exatamente o que o botão prometeu.
    const prontos = separarEmBaldes(arquivo).prontos
    if (prontos.length === 0) return

    setBusy(true)
    setError(null)

    let inseridos = 0
    let jaCadastrados = 0
    let falharam = 0

    // Lotes de 50: importar um a um levava minutos num CSV grande. Se um lote
    // falhar (telefone repetido derruba o insert inteiro), refaz aquele lote
    // linha a linha para pular só as duplicatas.
    const TAMANHO_DO_LOTE = 50
    for (let i = 0; i < prontos.length; i += TAMANHO_DO_LOTE) {
      const lote = prontos.slice(i, i + TAMANHO_DO_LOTE)
      const { error: loteError } = await supabase
        .from('clients')
        .insert(lote.map((r) => ({ salon_id: salonId, ...r.dados })))
      if (!loteError) {
        inseridos += lote.length
        continue
      }
      for (const registro of lote) {
        const { error: insertError } = await supabase
          .from('clients')
          .insert({ salon_id: salonId, ...registro.dados })
        if (!insertError) {
          inseridos++
          continue
        }
        // 23505 = já existe cliente com esse telefone no salão. É o único erro
        // esperado e sem gravidade. Todo o resto (permissão, conexão, coluna)
        // conta separado: virava "telefone já cadastrado" no balde único de
        // antes, e o dono ia procurar um problema que não existia.
        if (insertError.code === '23505') {
          jaCadastrados++
          continue
        }
        console.error(`Erro ao importar a linha ${registro.linha}:`, insertError)
        falharam++
      }
    }

    setBusy(false)
    setResult({ inseridos, jaCadastrados, falharam })
    onImported()
  }

  const nadaAImportar = previa !== null && previa.prontos.length === 0

  return (
    <Modal
      onClose={onClose}
      titulo="Importar clientes"
      tamanho="sm"
      bloquearFechamento={busy}
      confirmarFechamento={arquivo !== null && result === null ? 'Sair sem importar? O arquivo lido se perde.' : false}
    >
        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-medium text-success">{result.inseridos}</span>{' '}
              {result.inseridos === 1 ? 'cliente importado' : 'clientes importados'}.
            </p>
            {result.jaCadastrados > 0 && (
              <p className="text-xs text-muted-foreground">
                {contagem(
                  result.jaCadastrados,
                  'cliente já tinha cadastro',
                  'clientes já tinham cadastro',
                )}{' '}
                com esse telefone — o que já existia foi mantido.
              </p>
            )}
            {result.falharam > 0 && (
              <p className="text-xs text-danger">
                {contagem(result.falharam, 'linha não entrou', 'linhas não entraram')} por erro do
                sistema. Tente de novo; se repetir, chame o suporte.
              </p>
            )}
            {previa && previa.recusadas.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">Ficaram de fora do envio:</p>
                <BaldesDeFora previa={previa} />
                <button
                  onClick={baixarRecusadas}
                  className="w-full flex items-center justify-center gap-1.5 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  <Download size={14} />
                  Baixar linhas recusadas
                </button>
              </>
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
              Telefone, Aniversário e Observação. Linha sem nome, com telefone fora do padrão (DDD e
              número, 10 a 13 dígitos), com aniversário que não existe no calendário ou
              repetida no próprio arquivo fica de fora — as boas entram
              do mesmo jeito.
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

            {previa && (
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{previa.prontos.length}</span>{' '}
                  {previa.prontos.length === 1 ? 'cliente pronto' : 'clientes prontos'} em{' '}
                  <span className="text-muted-foreground">{fileName}</span>.
                </p>

                {previa.recusadas.length > 0 && (
                  <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 space-y-2">
                    <p className="text-xs font-medium text-foreground">Fora da importação</p>
                    <BaldesDeFora previa={previa} />
                    <ul className="text-xs text-muted-foreground space-y-0.5 border-t border-border pt-2">
                      {previa.recusadas.slice(0, MAX_RECUSADAS_NA_TELA).map((r, i) => (
                        <li key={`${r.linha}-${i}`}>
                          Linha {r.linha}
                          {r.nome ? ` — ${r.nome}` : ''} — {r.motivo}
                        </li>
                      ))}
                      {previa.recusadas.length > MAX_RECUSADAS_NA_TELA && (
                        <li>e mais {previa.recusadas.length - MAX_RECUSADAS_NA_TELA}.</li>
                      )}
                    </ul>
                    <button
                      onClick={baixarRecusadas}
                      className="w-full flex items-center justify-center gap-1.5 btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
                    >
                      <Download size={14} />
                      Baixar linhas recusadas
                    </button>
                  </div>
                )}

                {nadaAImportar && (
                  <p className="text-xs text-danger">
                    Nenhuma linha deste arquivo pode entrar. Baixe as recusadas, corrija no Excel e
                    envie de novo.
                  </p>
                )}
              </div>
            )}

            <ErroInline>{error}</ErroInline>

            <button
              onClick={handleImport}
              disabled={!previa || nadaAImportar || busy}
              className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Upload size={16} />
              {busy
                ? 'Importando...'
                : previa && previa.prontos.length > 0
                  ? // O número no botão é a promessa: o dono confere que 197 das 200
                    // linhas vão entrar antes de clicar, e é esse mesmo número que o
                    // resultado tem de devolver.
                    `Importar ${contagem(previa.prontos.length, 'cliente', 'clientes')}`
                  : 'Importar'}
            </button>
          </>
        )}
    </Modal>
  )
}
