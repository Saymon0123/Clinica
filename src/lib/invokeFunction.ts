import { supabase } from './supabase'

/**
 * Chama uma Edge Function devolvendo a mensagem de erro real.
 *
 * O `supabase.functions.invoke` só entrega o corpo da resposta quando o
 * status é 2xx. Em 4xx/5xx ele devolve um erro genérico e guarda a resposta
 * original em `error.context` — sem ler dali, o app perde mensagens úteis
 * como "Já existe uma conta com esse e-mail" e mostra um texto vago.
 */
export async function invokeFunction<T = Record<string, unknown>>(
  name: string,
  options: { body?: Record<string, unknown>; headers?: Record<string, string> } = {},
  fallbackMessage = 'Não foi possível concluir a operação.',
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(name, options)

    if (error) {
      const context = (error as { context?: Response }).context
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.json()
          if (body?.error) return { data: null, error: String(body.error) }
        } catch {
          // Corpo não era JSON — segue para a mensagem padrão.
        }
      }
      console.error(`Erro na função ${name}:`, error)
      return { data: null, error: fallbackMessage }
    }

    // Algumas funções respondem 200 com { error } no corpo.
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      return { data: null, error: String(data.error) }
    }

    return { data: data as T, error: null }
  } catch (err) {
    console.error(`Erro ao chamar a função ${name}:`, err)
    return { data: null, error: fallbackMessage }
  }
}
