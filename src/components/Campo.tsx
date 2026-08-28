import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

/**
 * O campo de formulário único do CRM (leva 2 da modernização).
 *
 * Antes, a string de classes do input estava copiada à mão ~60 vezes, com foco
 * desenhado em só 6 delas (o resto dependia do outline seco do navegador) e
 * três dialetos de label. Aqui as decisões fecham:
 *
 * - Foco: borda vira primary com transição curta — em TODO campo, como no Login.
 * - Erro: `erro` pinta a borda de danger, liga `aria-invalid` e mostra a
 *   mensagem colada no campo culpado (não num <p> perdido no fim do form).
 * - Label: um dialeto só, via `Campo`.
 */
const BASE =
  'w-full border bg-surface text-foreground rounded-lg px-3 py-2 text-sm ' +
  'transition-colors outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

function classes(erro?: string, extra?: string) {
  return `${BASE} ${erro ? 'border-danger' : 'border-border-strong'} ${extra ?? ''}`
}

type ComErro = { erro?: string }

export function Input({
  erro,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & ComErro) {
  return <input aria-invalid={erro ? true : undefined} className={classes(erro, className)} {...props} />
}

export function TextArea({
  erro,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & ComErro) {
  return <textarea aria-invalid={erro ? true : undefined} className={classes(erro, className)} {...props} />
}

export function Select({
  erro,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & ComErro) {
  return <select aria-invalid={erro ? true : undefined} className={classes(erro, className)} {...props} />
}

/** Label + campo + mensagem de erro/apoio, no dialeto único. */
export function Campo({
  rotulo,
  htmlFor,
  erro,
  apoio,
  children,
}: {
  rotulo: ReactNode
  htmlFor?: string
  /** Mensagem de erro do campo — também deve ser passada ao Input/TextArea/Select filho. */
  erro?: string
  /** Texto de apoio discreto sob o campo (ignorado quando há erro). */
  apoio?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <label className="block text-sm text-muted-foreground mb-1" htmlFor={htmlFor}>
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p className="text-xs text-danger mt-1">{erro}</p>
      ) : (
        apoio && <p className="text-[11px] text-muted-foreground mt-1">{apoio}</p>
      )}
    </div>
  )
}
