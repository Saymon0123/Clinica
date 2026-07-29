import { defineConfig } from 'vitest/config'

// Separado do vite.config.ts para não carregar o plugin do React nos testes de
// unidade — eles cobrem funções puras de src/lib e não renderizam componentes.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // supabase/functions/_shared é código puro compartilhado com as edge
    // functions (sem APIs do Deno), justamente para poder ser testado aqui.
    include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
  },
})
