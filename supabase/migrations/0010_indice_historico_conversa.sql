-- O agente de IA (fluxo n8n) lê o histórico da conversa a cada mensagem
-- recebida — é a memória persistente dele. Sem este índice, cada mensagem
-- causaria uma varredura completa de whatsapp_messages.
create index if not exists idx_whatsapp_messages_conversa_data
  on whatsapp_messages (conversation_id, created_at desc);
