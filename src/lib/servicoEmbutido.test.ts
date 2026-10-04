import { describe, expect, it } from 'vitest'

/**
 * Embutir `services` a partir de `appointments` EXIGE nomear a chave.
 *
 * Existem dois caminhos de `appointments` para `services`:
 *
 *   appointments_service_id_fkey        -- a FK direta, muitos-para-um
 *   appointment_services                -- a tabela de juncao, muitos-para-muitos
 *
 * O PostgREST nao escolhe sozinho: devolve **PGRST201** e a consulta falha
 * **sempre**, independente dos dados. Nao e intermitente, nao depende de volume,
 * nao aparece so em producao -- ou se escreve
 * `services!appointments_service_id_fkey`, ou aquela tela nunca le nada.
 *
 * **Por que isto virou teste.** A regra ja estava escrita num comentario desde a
 * 0120 (`useAgendaData.ts`), e ainda assim o `ConflitosDoBloqueio` nasceu com
 * `services(nome)` em 02/10. O painel inteiro do item 18 -- o que lista quem
 * pode assumir o horario quando o barbeiro bloqueia o dia -- **nunca
 * funcionou**, e ninguem viu porque nao havia login de teste. O dono achou
 * abrindo a tela.
 *
 * Comentario nao segura regra; catraca segura.
 *
 * Fora do alcance de proposito: embutir `services` a partir de
 * `appointment_services` (a `agenda-publica` faz isso) e **inambiguo** -- ali so
 * ha um caminho, e nomear a FK seria ruido.
 *
 * Usa `import.meta.glob` do Vite, e nao `node:fs`: assim arquivo novo entra na
 * varredura sozinho, sem ninguem precisar lembrar de inscreve-lo numa lista.
 */

const FONTES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Fora os comentários: a regra é sobre CÓDIGO, não sobre prosa.
 *
 * Sem isto o teste acusa o próprio arquivo que ele consertou — o comentário que
 * explica o defeito cita `services(nome)` para mostrar o jeito errado, e o
 * padrão casa com a explicação. Catraca que pune quem documentou a lição ensina
 * a não documentar.
 */
function semComentarios(fonte: string): string {
  return fonte
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

/** O trecho que vem depois de cada `.from('appointments')` — onde mora o select. */
function selectsDeAppointments(bruto: string): string[] {
  const fonte = semComentarios(bruto)
  const trechos: string[] = []
  const alvo = ".from('appointments')"
  let i = fonte.indexOf(alvo)
  while (i !== -1) {
    trechos.push(fonte.slice(i, i + 600))
    i = fonte.indexOf(alvo, i + 1)
  }
  return trechos
}

describe('services embutido a partir de appointments nomeia a FK', () => {
  const arquivos = Object.entries(FONTES).filter(([caminho]) => !caminho.endsWith('.test.ts'))

  it('a varredura encontra arquivos (senão passaria vazia, que é falso verde)', () => {
    expect(arquivos.length).toBeGreaterThan(50)
  })

  it('alguém de fato consulta appointments (senão a regra não estaria sendo medida)', () => {
    const comConsulta = arquivos.filter(([, fonte]) => selectsDeAppointments(fonte).length > 0)
    expect(comConsulta.length).toBeGreaterThan(0)
  })

  it('nenhum select de appointments usa `services(` sem a FK', () => {
    const culpados: string[] = []

    for (const [caminho, fonte] of arquivos) {
      for (const trecho of selectsDeAppointments(fonte)) {
        // `services(` precedido de `!...` é o jeito certo. Procuramos o jeito
        // errado: `services(` logo depois de espaço, vírgula, aspas ou crase.
        if (/[\s,'"`]services\(/.test(trecho)) culpados.push(caminho)
      }
    }

    expect(
      culpados,
      'Use `services!appointments_service_id_fkey(...)`. Sem a FK nomeada o ' +
        'PostgREST devolve PGRST201 e a consulta falha SEMPRE — foi assim que o ' +
        'painel do item 18 nasceu quebrado e ficou um dia sem ninguém notar.',
    ).toEqual([])
  })
})
