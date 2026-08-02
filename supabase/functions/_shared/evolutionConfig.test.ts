import { describe, expect, it } from 'vitest'
import config from './evolutionConfig.json'

// Estes testes travam o contrato com a Evolution API. Não são sobre "código
// funcionar" — são para uma edição distraída no JSON não desligar em silêncio
// algo que hoje só é percebido quando o agente responde num grupo de clientes.
describe('configuração da Evolution', () => {
  it('ignora mensagens de grupo', () => {
    expect(config.settings.groupsIgnore).toBe(true)
  })

  it('recebe mensagens de entrada no webhook', () => {
    expect(config.webhookEvents).toContain('MESSAGES_UPSERT')
  })

  it('recebe mensagens enviadas no webhook', () => {
    expect(config.webhookEvents).toContain('SEND_MESSAGE')
  })

  it('não marca mensagens como lidas nem força online', () => {
    expect(config.settings.readMessages).toBe(false)
    expect(config.settings.alwaysOnline).toBe(false)
  })

  it('não sincroniza histórico completo ao conectar', () => {
    expect(config.settings.syncFullHistory).toBe(false)
  })

  it('não rejeita chamadas automaticamente', () => {
    expect(config.settings.rejectCall).toBe(false)
  })
})
