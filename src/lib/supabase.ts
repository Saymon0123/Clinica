import { createClient } from '@supabase/supabase-js'

// Sem fallback por design: um valor padrão faria um build sem as variáveis
// definidas conectar silenciosamente no projeto errado, com dados reais de
// clientes, em vez de falhar. Defina VITE_SUPABASE_URL e
// VITE_SUPABASE_ANON_KEY (ver .env.example) em todo ambiente.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} não definida. Copie .env.example para .env ` +
        `e preencha com as credenciais do projeto Supabase.`,
    )
  }
  return value
}

const supabaseUrl = required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
