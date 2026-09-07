import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Upload de source maps para o Sentry, só quando o token existe no ambiente
// de build (Vercel). Sem ele o build sai idêntico ao de antes — sem source
// map, sem chamada de rede, sem exigir conta no Sentry para rodar local.
const uploadSentry = Boolean(process.env.SENTRY_AUTH_TOKEN)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(uploadSentry
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            // Sobe os .map e apaga do dist: source map em produção exporia o
            // código-fonte inteiro a quem abrir o DevTools.
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
            // Upload de source map é conforto de diagnóstico, não requisito:
            // org/project errados ou Sentry fora do ar NÃO podem derrubar o
            // deploy de produção. Sem este handler o plugin falha o build.
            errorHandler(err) {
              console.warn('[sentry] upload de source map falhou; o build segue sem ele:', err)
            },
          }),
        ]
      : []),
  ],
  build: {
    // 'hidden' gera o .map sem anunciar no .js que ele existe.
    sourcemap: uploadSentry ? 'hidden' : false,
  },
})
