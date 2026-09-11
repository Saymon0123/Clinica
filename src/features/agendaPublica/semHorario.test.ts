import { describe, expect, it } from 'vitest'
import { mensagemSemHorario } from './semHorario'

/** M8: quatro causas de lista vazia, quatro frases — e nenhuma promete o que não existe. */
describe('frase da agenda pública sem horário', () => {
  it('barbearia sem serviço não manda trocar de serviço', () => {
    const texto = mensagemSemHorario({ motivo: 'sem_servicos', temServicoMaisCurto: false, temWhatsapp: true })
    expect(texto).toBe(
      'Esta barbearia ainda não tem serviços para marcar por aqui. Para agendar, chame a barbearia no WhatsApp.',
    )
    expect(texto).not.toContain('outro serviço')
  })

  it('dia de folga e expediente encerrado dizem que o QR é só para hoje', () => {
    expect(mensagemSemHorario({ motivo: 'fechado_hoje', temServicoMaisCurto: true, temWhatsapp: true })).toBe(
      'A barbearia não atende hoje. Pelo QR só dá para marcar no mesmo dia — para outro dia, chame a barbearia no WhatsApp.',
    )
    const tarde = mensagemSemHorario({ motivo: 'expediente_acabou', temServicoMaisCurto: true, temWhatsapp: true })
    expect(tarde).toContain('O expediente de hoje já acabou.')
    // Às 23h, trocar de serviço não ajuda — mesmo existindo um mais curto.
    expect(tarde).not.toContain('troque')
  })

  it('agenda cheia sugere serviço mais curto só quando ele existe', () => {
    expect(mensagemSemHorario({ motivo: 'lotado', temServicoMaisCurto: true, temWhatsapp: true })).toBe(
      'Não sobrou horário hoje para esse serviço. Um serviço mais curto ainda pode caber — troque acima. Para outro dia, chame a barbearia no WhatsApp.',
    )
    expect(mensagemSemHorario({ motivo: 'lotado', temServicoMaisCurto: false, temWhatsapp: true })).not.toContain(
      'troque',
    )
  })

  it('sem WhatsApp cadastrado a frase não promete um botão que não aparece', () => {
    const texto = mensagemSemHorario({ motivo: 'lotado', temServicoMaisCurto: false, temWhatsapp: false })
    expect(texto).toContain('fale com a barbearia')
    expect(texto).not.toContain('WhatsApp')
  })
})
