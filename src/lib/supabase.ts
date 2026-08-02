import { createClient } from '@supabase/supabase-js'
import { problemaNaChave, problemaNaUrl } from './credenciaisSupabase'

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

// Credencial malformada precisa falhar aqui, dizendo o que está errado, e não
// virar um erro de header incompreensível na primeira tentativa de login.
const problemaUrl = problemaNaUrl(supabaseUrl)
if (problemaUrl) throw new Error(`VITE_SUPABASE_URL inválida. ${problemaUrl}`)

const problemaChave = problemaNaChave(supabaseAnonKey)
if (problemaChave) throw new Error(`VITE_SUPABASE_ANON_KEY inválida. ${problemaChave}`)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
