import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import * as Sentry from '@sentry/react'

/**
 * Monitoramento de erros e performance em produção (Sentry).
 *
 * Sem a `VITE_SENTRY_DSN` o init inteiro é pulado: rodar local sem Sentry é o
 * caminho normal, e chamar `Sentry.init` sem DSN geraria aviso no console a
 * cada `npm run dev`. O Vite embute a variável em BUILD TIME — configurá-la na
 * Vercel sem redeploy não faz efeito nenhum (mesma pegadinha da
 * `VITE_SUPABASE_ANON_KEY`, ver src/main.tsx).
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

// A tela de erro (ErroInesperado) só afirma "o problema foi registrado"
// quando isso é verdade — sem DSN, nada é registrado em lugar nenhum.
export const sentryHabilitado = Boolean(dsn)

export function iniciarSentry() {
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [
      // Dá nome de rota parametrizado às transações (/agendar/:salonId em vez
      // de uma URL por barbearia). Só funciona junto com o
      // `withSentryReactRouterV7Routing` que envolve o <Routes> no App.tsx.
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration(),
    ],
    /*
      Amostragens pensadas para o plano gratuito (5k erros, 5M spans e só 50
      replays por mês) e para a LGPD:

      - traces em 10%: performance é tendência, não precisa de cada clique;
      - replay 0% das sessões normais e 100% das que têm erro: replay só
        existe aqui para diagnosticar falha, não para assistir cliente usando
        o sistema — e 50/mês acabariam no primeiro dia;
      - o replay mascara todo texto por padrão (maskAllText), então nome e
        telefone de cliente não saem daqui.
    */
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    sendDefaultPii: false,
  })
}
