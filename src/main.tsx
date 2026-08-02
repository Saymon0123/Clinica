import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { initTheme } from './lib/theme.ts'

initTheme()

const raiz = document.getElementById('root')!

/**
 * Mostra na tela o motivo de o app não ter subido.
 *
 * Sem isto, erro de configuração vira **página em branco**: o `supabase.ts`
 * valida as credenciais no momento em que é importado, e uma exceção ali
 * acontece antes de o React montar qualquer coisa — nenhum ErrorBoundary
 * alcança. Foi o que aconteceu em 2026-08-02: com a `VITE_SUPABASE_ANON_KEY`
 * errada na Vercel, o site abria vazio e a única pista ficava no console.
 *
 * Tela branca não diz nada a quem está tentando usar o sistema, e faz o
 * problema parecer maior do que é. O diagnóstico precisa estar visível.
 */
function mostrarFalhaDeConfiguracao(erro: unknown) {
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  console.error('Falha ao iniciar o aplicativo:', erro)

  const doc = document
  const caixa = doc.createElement('div')
  caixa.setAttribute(
    'style',
    'max-width:34rem;margin:12vh auto;padding:1.5rem;font-family:system-ui,sans-serif;' +
      'border:1px solid #e5e5e5;border-radius:12px;line-height:1.5',
  )

  const titulo = doc.createElement('h1')
  titulo.textContent = 'O aplicativo não conseguiu iniciar'
  titulo.setAttribute('style', 'font-size:1.1rem;margin:0 0 .75rem')

  const detalhe = doc.createElement('p')
  detalhe.textContent = mensagem
  detalhe.setAttribute('style', 'margin:0 0 .75rem;color:#b91c1c')

  const ajuda = doc.createElement('p')
  ajuda.textContent =
    'É um problema de configuração do ambiente, não da sua conta. Avise o administrador do sistema.'
  ajuda.setAttribute('style', 'margin:0;color:#666;font-size:.9rem')

  caixa.append(titulo, detalhe, ajuda)
  raiz.replaceChildren(caixa)
}

// O import é dinâmico de propósito: importar `App` no topo avaliaria o
// `supabase.ts` antes desta função existir, e a falha voltaria a ser silenciosa.
import('./App.tsx')
  .then(({ default: App }) => {
    createRoot(raiz).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    )
  })
  .catch(mostrarFalhaDeConfiguracao)
