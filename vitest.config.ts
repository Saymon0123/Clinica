import { defineConfig } from 'vitest/config'

// Separado do vite.config.ts para não carregar o plugin do React nos testes de
// unidade — eles cobrem funções puras de src/lib e não renderizam componentes.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // supabase/functions/_shared é código puro compartilhado com as edge
    // functions (sem APIs do Deno), justamente para poder ser testado aqui.
    include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
    /**
     * Fuso fixo, senão o resultado depende de onde o teste roda.
     *
     * `rotuloDoDia` decide "Hoje"/"Ontem" pelo fuso da máquina — e isso está
     * certo: num histórico de conversa, "hoje" é hoje **onde a pessoa está**,
     * e o dono abre o CRM do celular dele.
     *
     * O problema era o teste. Uma mensagem das 23:30 (horário de Brasília) é
     * 02:30 do dia seguinte em UTC, então a máquina do CI via outro dia e dois
     * testes falhavam lá enquanto passavam aqui — o "funciona na minha
     * máquina" clássico, e o CI ficou vermelho sem ninguém olhar.
     *
     * América/São Paulo porque é onde o produto é usado.
     */
    env: { TZ: 'America/Sao_Paulo' },
  },
})
