import { describe, expect, it } from 'vitest'
import { traduzirErroDoBanco } from './erroDoBanco'
import { AVISO_TELEFONE_INVALIDO } from './telefone'

// Mensagem exatamente como o Postgres devolve quando a CHECK da 0128 barra o
// telefone. Está em inglês e é o que chega no `err.message` do supabase-js.
const CHECK_TELEFONE =
  'new row for relation "clients" violates check constraint "clients_telefone_valido"'

describe('traduzirErroDoBanco', () => {
  // Antes desta tradução o dono via "deixaria um dado inválido" ao salvar um
  // telefone curto: a frase não dizia nem que o problema era o telefone.
  it('reconhece a CHECK pelo nome e diz que o problema e o telefone', () => {
    expect(traduzirErroDoBanco({ code: '23514', message: CHECK_TELEFONE })).toBe(
      AVISO_TELEFONE_INVALIDO,
    )
  })

  it('reconhece a constraint mesmo sem o codigo vir junto', () => {
    expect(traduzirErroDoBanco({ message: CHECK_TELEFONE })).toBe(AVISO_TELEFONE_INVALIDO)
  })

  // Outras CHECKs (estoque negativo, consumo além do pacote) ainda não têm
  // frase própria e continuam caindo na genérica — o mapa cresce uma de cada
  // vez, não de uma vez só.
  it('23514 de constraint desconhecida continua na frase generica', () => {
    const msg = traduzirErroDoBanco({
      code: '23514',
      message: 'new row for relation "stock_items" violates check constraint "stock_qty_nao_negativa"',
    })
    expect(msg).toBe('Essa operação não é permitida porque deixaria um dado inválido.')
  })

  // A heurística de português é o que traz a frase dos nossos `raise
  // exception`, que sabem do contexto (qual campo, qual regra). Se o mapa por
  // código passasse na frente, `garantir_cliente` viraria "Algum campo está
  // inválido", perdendo o "informe DDD e número".
  it('a frase da RPC vence o mapa por codigo', () => {
    expect(
      traduzirErroDoBanco({
        code: '22023',
        message: 'Telefone inválido: informe DDD e número.',
      }),
    ).toBe('Telefone inválido: informe DDD e número.')
  })

  it('tira o prefixo ERROR: da frase da RPC', () => {
    expect(
      traduzirErroDoBanco({ code: '42501', message: 'ERROR: Você não gerencia esta barbearia.' }),
    ).toBe('Você não gerencia esta barbearia.')
  })

  // O dono não fala inglês nem sabe o que é "relation" ou "constraint". Toda
  // mensagem crua do Postgres tem de virar frase nossa antes da tela.
  it('nunca devolve a mensagem em ingles do Postgres crua', () => {
    const casos = [
      { code: '23514', message: CHECK_TELEFONE },
      { code: '42501', message: 'permission denied for table salon_invites' },
      { code: '23505', message: 'duplicate key value violates unique constraint "clients_phone_key"' },
      { code: '23502', message: 'null value in column "name" violates not-null constraint' },
    ]
    for (const erro of casos) {
      const msg = traduzirErroDoBanco(erro)
      expect(msg).not.toContain(erro.message)
      expect(msg).not.toMatch(/violates|permission denied|null value|relation/i)
    }
  })

  it('especificos sobrepoe a frase padrao do codigo', () => {
    expect(
      traduzirErroDoBanco(
        { code: '23P01', message: 'conflicting key value violates exclusion constraint' },
        { '23P01': 'Já existe um agendamento nesse horário para este profissional.' },
      ),
    ).toBe('Já existe um agendamento nesse horário para este profissional.')
  })

  // A tela escolhe a frase pelo código, e 23514 é um código só para todas as
  // CHECKs do banco. O nome da constraint é mais preciso que isso, então ele
  // ganha até de `especificos` — senão o dono voltaria a ler uma frase que não
  // fala do telefone.
  it('o nome da constraint ganha de especificos', () => {
    expect(
      traduzirErroDoBanco({ code: '23514', message: CHECK_TELEFONE }, { '23514': 'Confira os campos.' }),
    ).toBe(AVISO_TELEFONE_INVALIDO)
  })

  it('codigo sem frase alguma cai no padrao de quem chamou', () => {
    expect(
      traduzirErroDoBanco({ code: '08006', message: 'connection failure' }, undefined, 'Sem conexão.'),
    ).toBe('Sem conexão.')
  })

  it('erro nulo devolve o padrao', () => {
    expect(traduzirErroDoBanco(null)).toBe('Não foi possível concluir. Tente novamente.')
    expect(traduzirErroDoBanco(undefined, undefined, 'Sem conexão.')).toBe('Sem conexão.')
    expect(traduzirErroDoBanco({})).toBe('Não foi possível concluir. Tente novamente.')
  })
})
