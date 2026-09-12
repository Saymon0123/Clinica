import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * O cliente de service role como ele **realmente** sai de
 * `createClient(url, chave)`.
 *
 * Existe para substituir `ReturnType<typeof createClient>`, que era o que
 * estava escrito em onze lugares e que dava um tipo errado — errado de um jeito
 * silencioso, que é o pior.
 *
 * `createClient` é declarado como um `const` de tipo genérico. `ReturnType`
 * sobre uma assinatura genérica instancia os parâmetros pelas **restrições**,
 * não pelos **padrões**: `Database` vira `unknown` em vez de `any`, e daí
 * `SchemaName` vira `never`. Com o schema `never`, o mapa de funções do banco
 * fica vazio, e é por isso que `admin.rpc('taxa_excedida', { ... })` reclamava
 * que o segundo argumento deveria ser `undefined` — para o compilador não
 * existia RPC nenhuma para chamar. A anotação não protegia nada; ela desligava
 * a checagem e ainda brigava com o cliente de verdade, que chega tipado como
 * `SupabaseClient<any, 'public', 'public'>`.
 *
 * Nada disso aparecia porque as edge functions não passavam por typecheck
 * nenhum até 12/09/2026 — o `tsc -b` cobre `src` e o `vite.config.ts`, e mais
 * nada. O `deno check` no CI foi quem acusou, na primeira vez que rodou.
 *
 * O `any` no lugar de `Database` é o que o cliente sem tipos gerados realmente
 * é hoje: honesto, e não pior do que estava. Trocar por tipos gerados
 * (`supabase gen types typescript`) é trabalho de verdade e está no backlog —
 * quando vier, muda só esta linha.
 */
export type ClienteAdmin = SupabaseClient<any, 'public', 'public'>
