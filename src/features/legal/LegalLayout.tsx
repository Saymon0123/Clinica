import type { ReactNode } from 'react'
import { MarcaClubCut } from '../../components/MarcaClubCut'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { TERMOS_EM_REVISAO, VERSAO_DOS_TERMOS } from '../../lib/termos'

/**
 * Moldura das páginas legais.
 *
 * Fora do `AppLayout` de propósito: são lidas por quem ainda não tem conta —
 * o dono decidindo se aceita, e um cliente de barbearia que recebeu o link do
 * agente no WhatsApp. Exigir login para ler o que se está aceitando seria
 * exatamente o contrário do que o CDC pede (art. 46).
 */
export function LegalLayout({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <Link to="/login" className="flex items-center gap-2 w-fit">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
            <MarcaClubCut size={18} />
          </span>
          <span className="font-semibold text-foreground">Club Cut</span>
        </Link>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{titulo}</h1>
          <p className="text-xs text-muted-foreground mt-1">Versão {VERSAO_DOS_TERMOS}</p>
        </div>

        {TERMOS_EM_REVISAO && (
          <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning-soft p-3">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              <strong>Minuta em revisão jurídica.</strong> Este texto descreve como o sistema
              funciona hoje e será substituído pela versão final. Quando isso acontecer, a versão
              muda e você será avisado.
            </p>
          </div>
        )}

        <article className="space-y-5 text-sm text-foreground leading-relaxed">{children}</article>

        <div className="pt-4 border-t border-border flex gap-4 text-sm">
          <Link to="/termos" className="text-primary hover:underline">
            Termos de uso
          </Link>
          <Link to="/privacidade" className="text-primary hover:underline">
            Privacidade
          </Link>
        </div>
      </div>
    </div>
  )
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
      {children}
    </section>
  )
}
