import { describe, expect, it } from 'vitest'

/**
 * A folga tem de sair pelo mesmo lugar por onde se vê (0213).
 *
 * ## O que este teste existe para impedir
 *
 * **A asserção do `.eq('dia'` é a que vale o arquivo.** O `delete` da folga
 * filtra por barbeiro E por dia. Esquecer o segundo `.eq` não dá erro, não
 * aparece na tela e apaga **todas as folgas daquele barbeiro, de todos os
 * dias** — inclusive as de meses à frente, que ninguém está olhando. O dono
 * descobriria em um dia qualquer, quando a agenda pública voltasse a oferecer um
 * dia que ele havia fechado.
 *
 * **O portão `!error`** existe pelo mesmo motivo das cinco telas do
 * `ErroDeCarga.test.ts`: o aviso diz o NOME de quem está de folga, e com a carga
 * falhando `folgas` é a lista velha. Dizer "Fulano está de folga" a partir de
 * dado que não foi lido é a mesma mentira do "R$ 0,00 para quem só está sem
 * rede" — pior aqui, porque o nome dá a impressão de leitura fresca.
 *
 * **E a folga precisa ter saída.** Ela entra por um clique no painel de
 * conflitos; se a remoção desaparecer num refactor, marcar no dia errado volta a
 * exigir SQL, que é o defeito que este componente nasceu para consertar.
 *
 * Lê a fonte pelo `import.meta.glob` do Vite, e não por `readFileSync(new
 * URL(...))`: nos testes desta pasta o `import.meta.url` não chega como `file://`
 * e o `fs` recusa. É a mesma saída do `janelaDeBloqueio.test.ts`.
 */
function fonteDe(arquivo: '../agenda/AvisoDeFolga.tsx' | '../agenda/AgendaPage.tsx') {
  const todas = import.meta.glob('./{AvisoDeFolga,AgendaPage}.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const nome = arquivo.split('/').pop()
  const achado = Object.entries(todas).find(([caminho]) => caminho.endsWith(nome!))
  return achado?.[1] ?? ''
}

describe('a folga sai pelo mesmo lugar por onde se ve', () => {
  it('acha as duas fontes (senao o resto passaria vazio)', () => {
    expect(fonteDe('../agenda/AvisoDeFolga.tsx').length).toBeGreaterThan(500)
    expect(fonteDe('../agenda/AgendaPage.tsx').length).toBeGreaterThan(1000)
  })

  it('o delete da folga filtra por barbeiro E por dia', () => {
    const fonte = fonteDe('../agenda/AvisoDeFolga.tsx')
    expect(fonte).toContain(".from('dias_de_folga')")
    expect(fonte).toContain(".eq('professional_id', professionalId)")
    expect(fonte).toContain(".eq('dia', dia)")
  })

  it('a remocao pede confirmacao antes de devolver o dia aos clientes', () => {
    // Dois passos, como a `LinhaDeExcluir` do detalhe: remover a folga reabre o
    // dia na mesma hora, nas quatro portas.
    const fonte = fonteDe('../agenda/AvisoDeFolga.tsx')
    expect(fonte).toContain('confirmando')
    expect(fonte).toContain('Voltar')
  })

  it('so o gestor ve o botao -- a RLS recusaria o barbeiro', () => {
    expect(fonteDe('../agenda/AvisoDeFolga.tsx')).toContain('podeGerenciar &&')
  })

  it('o aviso cala sob erro de carga, porque nomeia pessoas', () => {
    expect(fonteDe('../agenda/AgendaPage.tsx')).toContain(
      '{!error && folgasComNome.length > 0 && (',
    )
  })
})
