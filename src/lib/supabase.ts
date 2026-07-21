import { createClient } from '@supabase/supabase-js'

// Fallback aponta para o projeto Supabase de desenvolvimento (chave anon,
// pública por design e sem políticas de RLS liberadas ainda — ver
// supabase/migrations/0001_init.sql). Em produção, defina VITE_SUPABASE_URL
// e VITE_SUPABASE_ANON_KEY para apontar para o projeto real do cliente.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bukhpvvybeltmhtwamox.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1a2hwdnZ5YmVsdG1odHdhbW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDQ0ODgsImV4cCI6MjEwMDIyMDQ4OH0.8Zpv0XtzYHe5rIEm6fc_V7YJcHxmIpsnxxjMX5xW5TQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
