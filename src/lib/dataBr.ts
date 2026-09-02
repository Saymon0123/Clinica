/**
 * A data como ela chega de uma planilha de barbearia.
 *
 * Vive aqui, e não dentro do modal de importação, pelo mesmo motivo da régua do
 * telefone: é regra pura, é o tipo de coisa que erra em silêncio, e num arquivo
 * de `src/lib` ela tem teste. Dentro do componente não tinha, e foi exatamente
 * por ali que passou `31/02/2026`.
 */

/**
 * Aceita `2026-07-25` e `25/07/2026`. Devolve:
 *
 * - `null` para célula vazia — cliente sem aniversário é legítimo;
 * - `'invalida'` para o que tem cara de data e não é uma;
 * - a data em `AAAA-MM-DD` quando existe de verdade no calendário.
 *
 * **Conferir o calendário, não só o formato.** `31/02/2026` casa com qualquer
 * regex de `dd/mm/aaaa` e vira a string `2026-02-31`, que o Postgres recusa lá
 * na gravação com 22008. Na importação isso aparecia como "erro do sistema,
 * tente de novo" — conselho que nunca ia funcionar, para um problema que era
 * uma célula da planilha. `07/13/2026`, que é o que sistema em locale
 * americano exporta, dava no mesmo.
 */
export function parseDataBr(raw: string): string | 'invalida' | null {
  const value = raw.trim()
  if (!value) return null

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const partes = iso
    ? { ano: iso[1], mes: iso[2], dia: iso[3] }
    : br
      ? { ano: br[3], mes: br[2], dia: br[1] }
      : null
  if (!partes) return 'invalida'

  const ano = Number(partes.ano)
  const mes = Number(partes.mes)
  const dia = Number(partes.dia)
  // Remontar e comparar os três componentes: o `Date` do JavaScript acomoda
  // 31/02 virando 03/03 sem reclamar, e é esse silêncio que se quer barrar.
  const d = new Date(ano, mes - 1, dia)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    return 'invalida'
  }
  return `${partes.ano}-${partes.mes}-${partes.dia}`
}
