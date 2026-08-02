export type Conversation = {
  id: string
  contact_phone: string
  contact_name: string | null
  last_message_at: string | null
  last_opened_at: string | null
  needs_human: boolean
  agent_paused: boolean
  resumo_contexto: string | null
  last_message_preview: string | null
}

export type Message = {
  id: string
  conversation_id: string
  direction: 'in' | 'out'
  sender: 'cliente' | 'agente' | 'dono'
  content: string
  created_at: string
}
