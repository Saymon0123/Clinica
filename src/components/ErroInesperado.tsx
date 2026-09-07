import { sentryHabilitado } from '../lib/sentry'

/**
 * Tela do ErrorBoundary global (src/main.tsx): o que a pessoa vê quando um
 * erro de renderização derruba o React inteiro.
 *
 * Recarregar em vez de "tentar de novo": o `resetError` do Sentry re-renderiza
 * com o mesmo estado que acabou de quebrar, e o caminho mais comum é cair no
 * mesmo erro — para o usuário, um botão que não faz nada. O reload recomeça
 * do zero, que é o que ele faria sozinho de qualquer forma.
 */
export function ErroInesperado() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Um erro inesperado impediu esta tela de continuar.{' '}
          {sentryHabilitado
            ? 'O problema já foi registrado e vamos analisá-lo — recarregar costuma resolver.'
            : 'Recarregue a página para continuar; se acontecer de novo, avise o suporte.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Recarregar a página
        </button>
      </div>
    </div>
  )
}
