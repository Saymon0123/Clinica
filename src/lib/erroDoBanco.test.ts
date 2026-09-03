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

// As CHECKs da 0132 entram no mapa por nome: sem isto, produto ou serviço a
// R$ 0,00 voltaria como "essa operação não é permitida porque deixaria um dado
// inválido" — que não diz ao dono que o problema é o preço.
describe('traduzirErroDoBanco: preco de venda (0132)', () => {
  it('produto a zero diz que o problema e o preco', () => {
    expect(
      traduzirErroDoBanco({
        code: '23514',
        message: 'new row for relation "products" violates check constraint "products_preco_de_venda_positivo"',
      }),
    ).toBe('O preço de venda precisa ser maior que zero.')
  })

  it('servico a zero diz que o problema e o preco', () => {
    expect(
      traduzirErroDoBanco({
        code: '23514',
        message: 'new row for relation "services" violates check constraint "services_preco_positivo"',
      }),
    ).toBe('O preço do serviço precisa ser maior que zero.')
  })

  // Produto sem preço nenhum cai no NOT NULL, que é outro código — e a frase
  // genérica do 23502 já diz "obrigatório", que é o certo aqui.
  it('produto sem preco cai no campo obrigatorio', () => {
    expect(
      traduzirErroDoBanco({
        code: '23502',
        message: 'null value in column "preco_venda" of relation "products" violates not-null constraint',
      }),
    ).toBe('Faltou preencher um campo obrigatório.')
  })
})

// O trigger da folga (0134) levanta 23P01 -- o mesmo codigo do choque de
// horario -- com a explicacao em portugues. As telas de remarcar passam uma
// frase fixa para 23P01 ("ja existe um agendamento nesse horario"); ela so
// pode valer quando o banco NAO disse nada melhor, senao a folga de 5 minutos
// vira um choque que nao existe.
describe('traduzirErroDoBanco: folga entre atendimentos (0134)', () => {
  const FIXA = 'Já existe um agendamento nesse horário para este profissional. Escolha outro horário.'

  it('a frase da folga vence a frase fixa do 23P01', () => {
    expect(
      traduzirErroDoBanco(
        {
          code: '23P01',
          message: 'Fica a menos de 5 minutos de outro atendimento do barbeiro (das 15:00 às 15:30). A barbearia exige essa folga entre um e outro.',
        },
        { '23P01': FIXA },
      ),
    ).toBe('Fica a menos de 5 minutos de outro atendimento do barbeiro (das 15:00 às 15:30). A barbearia exige essa folga entre um e outro.')
  })

  it('o choque de verdade (mensagem em ingles da constraint) continua na frase fixa', () => {
    expect(
      traduzirErroDoBanco(
        { code: '23P01', message: 'conflicting key value violates exclusion constraint "appointments_sem_sobreposicao"' },
        { '23P01': FIXA },
      ),
    ).toBe(FIXA)
  })
})

// Passo 4.5: o mesmo erro do banco produz a mesma frase em qualquer tela.
describe('a mesma frase em qualquer tela', () => {
  it('telefone duplicado diz o mesmo em Clientes e na Agenda', () => {
    const erro = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_clients_salon_telefone_norm"',
    }
    const frase = 'Já existe um cliente cadastrado com esse telefone.'
    expect(traduzirErroDoBanco(erro)).toBe(frase)
    expect(traduzirErroDoBanco(erro, undefined, 'Não foi possível criar a reserva.')).toBe(frase)
  })

  it('sobreposição (23P01), formato inválido (22P02) e chave estrangeira (23503) têm frase própria', () => {
    expect(traduzirErroDoBanco({ code: '23P01' })).toBe('Esse horário já está ocupado. Escolha outro.')
    expect(traduzirErroDoBanco({ code: '22P02' })).toBe(
      'Algum campo veio com formato inválido. Confira e tente de novo.',
    )
    expect(traduzirErroDoBanco({ code: '23503' })).toBe(
      'Esse registro está ligado a outro e não pode ser removido.',
    )
  })
})
