import { describe, expect, it } from 'vitest'
import { mensagemSemHorario } from './semHorario'

/** O caso mais comum: dia sem vaga, mas a janela tem outros dias. */
const base = { temServicoMaisCurto: false, temWhatsapp: true, ehHoje: true, temOutroDia: true, diasNaJanela: 14 }

/** M8: quatro causas de lista vazia, quatro frases — e nenhuma promete o que não existe. */
describe('frase da agenda pública sem horário', () => {
  it('barbearia sem serviço não manda trocar de serviço', () => {
    const texto = mensagemSemHorario({ ...base, motivo: 'sem_servicos' })
    expect(texto).toBe(
      'Esta barbearia ainda não tem serviços para marcar por aqui. Para agendar, chame a barbearia no WhatsApp.',
    )
    expect(texto).not.toContain('outro serviço')
  })

  it('agenda cheia sugere serviço mais curto só quando ele existe', () => {
    expect(mensagemSemHorario({ ...base, motivo: 'lotado', temServicoMaisCurto: true })).toBe(
      'Não sobrou horário hoje para esse serviço. Um serviço mais curto ainda pode caber — troque acima.',
    )
    expect(mensagemSemHorario({ ...base, motivo: 'lotado' })).not.toContain('troque')
  })

  it('expediente encerrado não manda trocar de serviço', () => {
    // Às 23h, trocar de serviço não ajuda — mesmo existindo um mais curto.
    const tarde = mensagemSemHorario({ ...base, motivo: 'expediente_acabou', temServicoMaisCurto: true })
    expect(tarde).toBe('O expediente de hoje já acabou.')
    expect(tarde).not.toContain('troque')
  })

  it('sem número cadastrado, a frase não promete um botão de WhatsApp', () => {
    const texto = mensagemSemHorario({ ...base, motivo: 'lotado', temWhatsapp: false, temOutroDia: false })
    expect(texto).toContain('fale com a barbearia')
    expect(texto).not.toContain('WhatsApp')
  })
})

/**
 * Etapa 2: a frase deixou de mandar a pessoa embora.
 *
 * Três das quatro terminavam em "Pelo QR só dá para marcar no mesmo dia — para
 * outro dia, chame a barbearia no WhatsApp". Com catorze dias isso virou
 * mentira, e mentira que faz a pessoa sair de um caminho que existe.
 */
describe('catorze dias: a frase não manda mais embora', () => {
  it('NENHUMA frase diz que o QR é só para o mesmo dia', () => {
    const motivos = ['sem_servicos', 'fechado_hoje', 'expediente_acabou', 'lotado'] as const
    for (const motivo of motivos) {
      for (const temOutroDia of [true, false]) {
        const texto = mensagemSemHorario({ ...base, motivo, temOutroDia })
        expect(texto, `${motivo}/${temOutroDia}`).not.toContain('mesmo dia')
        expect(texto, `${motivo}/${temOutroDia}`).not.toContain('para outro dia')
      }
    }
  })

  it('havendo outro dia com vaga, a frase CALA sobre o WhatsApp', () => {
    // Quem fala é o botão "ver quinta-feira", logo abaixo. Repetir em texto só
    // empurra o botão para baixo na tela de quem está com pressa.
    const texto = mensagemSemHorario({ ...base, motivo: 'fechado_hoje' })
    expect(texto).toBe('A barbearia não atende hoje.')
    expect(texto).not.toContain('WhatsApp')
  })

  it('sem nenhum dia na janela, aí sim manda falar com a barbearia', () => {
    const texto = mensagemSemHorario({ ...base, motivo: 'lotado', temOutroDia: false })
    expect(texto).toBe(
      'Não sobrou horário hoje para esse serviço. Nos próximos 14 dias não sobrou nada — chame a barbearia no WhatsApp.',
    )
  })

  it('o número de dias vem do tamanho da janela, não de uma constante copiada', () => {
    expect(mensagemSemHorario({ ...base, motivo: 'lotado', temOutroDia: false, diasNaJanela: 7 })).toContain(
      'próximos 7 dias',
    )
  })

  it('num dia futuro a frase não diz "hoje"', () => {
    // "A barbearia não atende hoje" numa terça da semana que vem é a frase
    // certa no dia errado — e faz a pessoa achar que a barbearia está fechada
    // agora, quando ela pode estar cortando cabelo neste minuto.
    expect(mensagemSemHorario({ ...base, motivo: 'fechado_hoje', ehHoje: false })).toBe(
      'A barbearia não atende neste dia.',
    )
    expect(mensagemSemHorario({ ...base, motivo: 'lotado', ehHoje: false })).toBe(
      'Não sobrou horário neste dia para esse serviço.',
    )
  })
})
