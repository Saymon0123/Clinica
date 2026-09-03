/**
 * Enter envia só onde Enter não é a tecla de pular linha (achado 34 da
 * revisão de 01/09).
 *
 * No computador, Enter envia e Shift+Enter quebra a linha — o costume de todo
 * aplicativo de mensagem. No celular não existe Shift para combinar: Enter é
 * a única tecla de nova linha, e "Bom dia Marcos" saía pela metade para um
 * cliente real, sem desfazer. Ali, Enter quebra a linha e quem envia é o
 * botão. Ctrl+Enter (ou Cmd+Enter) envia em qualquer lugar.
 */
export type TeclaEnter = {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

/** Ponteiro fino = mouse ou trackpad. Sem `matchMedia` (teste), assume que sim. */
export function ponteiroFino(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(pointer: fine)').matches
}

export function enterEnvia(tecla: TeclaEnter, fino: boolean): boolean {
  if (tecla.key !== 'Enter') return false
  if (tecla.ctrlKey || tecla.metaKey) return true
  if (tecla.shiftKey) return false
  return fino
}
