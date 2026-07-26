-- Resumo que o agente de IA escreve ao passar a conversa para o dono,
-- para ele entender o contexto sem precisar ler toda a conversa.
alter table whatsapp_conversations
  add column if not exists resumo_contexto text;
