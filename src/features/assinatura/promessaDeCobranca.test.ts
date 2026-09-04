import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * O texto que o dono lê não pode contradizer a regra que gera a fatura.
 *
 * Em 04/09/2026 duas telas diziam "Lembretes e reativações não são cobrados"
 * enquanto `agendamentos_cobraveis` (migration 0136) cobrava o horário de
 * reativação que o cliente confirma. A frase estava ambígua de origem: os
 * cartões da Assinatura contam MENSAGENS, a cobrança conta AGENDAMENTOS, e
 * "reativações" servia para os dois. Um dono que lesse aquilo e recebesse
 * R$ 0,75 por cliente reativado teria razão em reclamar.
 *
 * A decisão de Saymon foi manter a regra e corrigir o texto. Este teste é a
 * catraca: lê os arquivos como texto porque o alvo é a redação, não o
 * comportamento — nenhum teste de componente pegaria uma promessa errada.
 *
 * Se um dia a regra mudar e a reativação deixar de ser cobrada, este teste
 * falha de propósito: é o lembrete de que os dois textos voltam a poder dizer
 * que reativação não custa nada.
 */
const raiz = process.cwd()
const ler = (p: string) => readFileSync(path.join(raiz, p), 'utf8')

const ASSINATURA = 'src/features/assinatura/UsoDoSistema.tsx'
const AJUDA = 'src/features/ajuda/AjudaPage.tsx'
const REGRA = 'supabase/migrations/0136_um_numero_para_agendamento_do_agente.sql'

describe('a promessa de cobrança bate com a regra da fatura', () => {
  it('a regra continua cobrando a reativacao confirmada', () => {
    // A âncora do teste. Se este `expect` cair, foi a REGRA que mudou, e aí os
    // textos abaixo precisam mudar junto — na direção contrária.
    const sql = ler(REGRA).replace(/\s+/g, ' ')
    expect(sql).toMatch(/origem = 'reativacao' and a\.reativacao_confirmada_em is not null/i)
  })

  it('nenhuma tela afirma que reativacao nao e cobrada', () => {
    for (const arquivo of [ASSINATURA, AJUDA]) {
      const texto = ler(arquivo)
      // A frase exata que existia, e as variações mais prováveis de voltarem.
      expect(texto).not.toMatch(/lembretes e reativa[çc][õo]es (também )?n[ãa]o s[ãa]o cobrados/i)
      expect(texto).not.toMatch(/reativa[çc][õo]es n[ãa]o s[ãa]o cobrad/i)
    }
  })

  it('a Assinatura diz que o horario de reativacao confirmado entra na conta', () => {
    const texto = ler(ASSINATURA)
    expect(texto).toMatch(/hor[áa]rio de reativa[çc][ãa]o que o cliente confirmou/i)
  })

  it('os cartoes de lembrete e reativacao dizem que contam mensagens', () => {
    // Sem a palavra "mensagens", "Reativações — sem custo" volta a ser lido
    // como "cliente reativado é de graça".
    const texto = ler(ASSINATURA)
    const semCusto = texto.match(/mensagens, sem custo/g) ?? []
    expect(semCusto).toHaveLength(2)
  })

  it('a Ajuda explica os dois desfechos da reativacao', () => {
    const texto = ler(AJUDA)
    expect(texto).toMatch(/se ele \*\*confirmou\*\* o hor[áa]rio/i)
    expect(texto).toMatch(/se ele n[ãa]o respondeu/i)
  })
})
